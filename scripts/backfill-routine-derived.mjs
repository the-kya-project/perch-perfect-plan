#!/usr/bin/env node
// Backfill routine_tasks.derived for EXISTING derived rows. Additive and safe:
// it ONLY ever writes the `derived` column — never title/instructions.
//
// For each derived row it re-derives a descriptor from the care-plan fields,
// renders the English that descriptor would produce, and writes the descriptor
// ONLY when that English matches the row's stored title AND instructions exactly.
// Any mismatch → the row is SKIPPED and logged (keeps rendering its stored
// English). No guessing, no data loss.
//
//   Dry run (writes nothing, prints per-row plan):
//     SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backfill-routine-derived.mjs --dry-run
//   Real run:
//     SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/backfill-routine-derived.mjs --write
//
// The derivation/render logic is the app's own (src/lib), bundled on the fly via
// esbuild so this stays a single source of truth with the sync + render paths.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const esbuild = require(join(ROOT, "node_modules/esbuild/lib/main.js"));
const { createClient } = require(join(ROOT, "node_modules/@supabase/supabase-js/dist/main/index.js"));

const WRITE = process.argv.includes("--write");
const DRY = process.argv.includes("--dry-run") || !WRITE;

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }

// Bundle the shared derivation + render logic (TS, @/ alias, ?raw) for Node.
const entry = join(ROOT, ".backfill-entry.mjs");
writeFileSync(entry, `
export { computePlanBackfill } from "@/lib/backfillRoutineDerived";
export { renderDerivedTask } from "@/lib/routineTaskRender";
`);
const outfile = join(ROOT, ".backfill-bundle.mjs");
await esbuild.build({
  entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile,
  alias: { "@": join(ROOT, "src") }, resolveExtensions: [".ts", ".tsx", ".js", ".mjs", ".json"],
  plugins: [{
    name: "raw",
    setup(b) {
      b.onResolve({ filter: /\?raw$/ }, (a) => ({ path: a.path.replace(/\?raw$/, "").replace(/^@\//, join(ROOT, "src") + "/"), namespace: "raw" }));
      b.onLoad({ filter: /.*/, namespace: "raw" }, (a) => ({ contents: `export default ${JSON.stringify(require("node:fs").readFileSync(a.path, "utf8"))};`, loader: "js" }));
    },
  }],
  logLevel: "warning",
});
const { computePlanBackfill, renderDerivedTask } = await import(pathToFileURL(outfile).href);

// English renderer: a translator that returns inline defaults + interpolation
// (no resources) — exactly the English the sync composed.
const t = (key, a, b) => {
  let def = key, opts = {};
  if (typeof a === "string") { def = a; opts = b || {}; }
  else if (a && typeof a === "object") { opts = a; if (typeof opts.defaultValue === "string") def = opts.defaultValue; }
  return String(def).replace(/\{\{(\w+)\}\}/g, (_, k) => (k in opts ? String(opts[k]) : `{{${k}}}`));
};
const renderEn = (d) => renderDerivedTask(d, t, "en");

const sb = createClient(URL, KEY, { auth: { persistSession: false } });
const PREFIXES = ["feed:", "remove fresh food", "wash food bowls", "wash water bowl", "change water", "medication"];
const isDerived = (title) => { const l = (title || "").toLowerCase(); return PREFIXES.some((p) => l.startsWith(p)); };

const { data: plans, error: pe } = await sb
  .from("care_plans")
  .select("id, diet_details, medications_details, fresh_food_removal_minutes, food_bowl_wash_cadence, water_bowl_wash_cadence, water_frequency");
if (pe) { console.error(pe.message); process.exit(1); }

let assigned = 0, skipped = 0, planned = [];
for (const cp of plans ?? []) {
  const { data: rows } = await sb.from("routine_tasks").select("id, title, instructions").eq("care_plan_id", cp.id);
  const derivedRows = (rows ?? []).filter((r) => isDerived(r.title));
  if (!derivedRows.length) continue;
  const res = computePlanBackfill(cp, derivedRows, renderEn);
  for (const a of res.assign) planned.push({ id: a.id, derived: a.derived });
  for (const s of res.skip) { skipped++; console.log(`SKIP [${cp.id.slice(0, 8)}] ${JSON.stringify(s.title)} — ${s.reason}`); }
  assigned += res.assign.length;
}

console.log(`\n${DRY ? "DRY RUN" : "WRITE"} — assign ${assigned}, skip ${skipped}`);
if (DRY) { console.log("No rows written (dry run)."); process.exit(0); }

let ok = 0;
for (const p of planned) {
  const { error } = await sb.from("routine_tasks").update({ derived: p.derived }).eq("id", p.id);
  if (error) console.error(`FAILED ${p.id}: ${error.message}`); else ok++;
}
console.log(`wrote derived on ${ok}/${planned.length} rows (title/instructions untouched).`);
