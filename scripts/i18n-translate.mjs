#!/usr/bin/env node
// Automated Dutch translation of the app catalogs — changed keys only.
//
// PIPELINE (release workflow, gated on English approval):
//   1. English is edited/approved and `npm run i18n:extract` regenerates en.jsonc
//      (the client catalog). The email catalog (emails.en.jsonc) is hand-authored.
//   2. This script translates ONLY keys whose English changed since last run
//      (or whose glossary/register version changed). Unchanged English keeps its
//      existing Dutch byte-identical, so wording stays stable across releases.
//   3. Two one-time inputs are applied on EVERY run so terminology is consistent:
//      the locked domain glossary (glossary.nl.json) and the register (je/u,
//      i18n.config.json). Bumping glossaryVersion re-translates everything.
//
// It REFUSES to run until both inputs are locked (see the guards below), so no
// machine translation ships without the agreed terminology and register.
//
// Runs over every entry in CATALOGS — the client sitter/owner catalog AND the
// server-only email catalog — sharing one glossary, register, staleness scheme,
// and placeholder-parity check.
//
//   Usage:  ANTHROPIC_API_KEY=… npm run i18n:translate
//           npm run i18n:translate -- --check   (report stale keys, do not write)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = join(ROOT, "src", "locales");
const EN = join(LOCALES, "en.jsonc");
const NL = join(LOCALES, "nl.jsonc");
const META = join(LOCALES, ".i18n-meta.json");
const CONFIG = join(LOCALES, "i18n.config.json");
const GLOSSARY = join(LOCALES, "glossary.nl.json");

// Catalogs translated by this script. The client sitter/owner catalog and the
// SERVER-ONLY email catalog share the same glossary, register, staleness, and
// placeholder-parity machinery — they differ only in their files. Adding a
// catalog here is the whole extension; nothing below is catalog-specific.
const CATALOGS = [
  { label: "app", en: EN, nl: NL, meta: META, headerName: "Dutch sitter catalog" },
  {
    label: "emails",
    en: join(LOCALES, "emails.en.jsonc"),
    nl: join(LOCALES, "emails.nl.jsonc"),
    meta: join(LOCALES, ".i18n-meta.emails.json"),
    headerName: "Dutch email catalog",
  },
];

const CHECK_ONLY = process.argv.includes("--check");
const MODEL = process.env.I18N_MODEL || "claude-sonnet-5";

// ---- tiny JSONC reader (mirrors src/lib/i18n/jsonc.ts) --------------------
function stripLineComments(src) {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) { out += c; if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; out += "\n"; continue; }
    out += c;
  }
  return out;
}
const readJsonc = (p) => JSON.parse(stripLineComments(readFileSync(p, "utf8")));
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

function die(msg) {
  console.error(`\n✗ i18n:translate — ${msg}\n`);
  process.exit(1);
}

// ---- GUARDS: fail loudly until the one-time inputs are filled in -----------
if (!existsSync(CONFIG)) die(`missing ${CONFIG}`);
if (!existsSync(GLOSSARY)) die(`missing ${GLOSSARY}`);
// Config + glossary are read comment-tolerantly so the locked terms can carry
// their rationale as // comments in the file (see glossary.nl.json).
const config = readJsonc(CONFIG);
const glossary = readJsonc(GLOSSARY);

if (config.status !== "locked") {
  die(
    `localization inputs are not locked yet.\n` +
    `  → Edit src/locales/i18n.config.json: set "register" to "je" or "u", set "glossaryVersion" to 1, set "status" to "locked".\n` +
    `  → Fill src/locales/glossary.nl.json with the locked EN→NL terms and set its "status" to "locked".\n` +
    `  Until then no Dutch is machine-generated (Phase 1 ships a hand-seeded nl.jsonc).`,
  );
}
if (config.register !== "je" && config.register !== "u") {
  die(`i18n.config.json "register" must be "je" or "u" (got ${JSON.stringify(config.register)}).`);
}
if (glossary.status !== "locked") {
  die(`glossary.nl.json is not locked. Fill in real terms and set "status" to "locked".`);
}
const terms = Object.fromEntries(
  Object.entries(glossary.terms || {}).filter(([k]) => !k.startsWith("__example__")),
);
if (Object.keys(terms).length === 0) {
  die(`glossary.nl.json has no real terms (only examples). Add the locked EN→NL domain terms.`);
}

// ---- shared translation setup (identical glossary/register per catalog) ----
const register = config.register;
const glossaryVersion = config.glossaryVersion;

// Staleness key: English value + register + glossary version. A change in any of
// the three invalidates the key so the locked terminology/register is re-applied.
const stamp = (value) =>
  createHash("sha256").update(`${value} ${register} ${glossaryVersion}`).digest("hex").slice(0, 16);

const PLACEHOLDER = /\{\{[^}]+\}\}/g;
const placeholders = (s) => (s.match(PLACEHOLDER) || []).slice().sort();
const sameSet = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const registerLine = register === "je"
  ? `Address the reader informally: use "je"/"jij"/"jouw", never "u".`
  : `Address the reader formally: use "u"/"uw", never "je"/"jij".`;
const glossaryLines = Object.entries(terms).map(([en_, nl_]) => `  "${en_}" → "${nl_}"`).join("\n");

const system =
  `You are a professional EN→NL (Netherlands) translator for a bird-care app used by pet sitters.\n` +
  `Translate for ACCURACY and natural Dutch, not literal word-for-word. Keep the calm, warm, plain tone.\n` +
  `${registerLine}\n` +
  `LOCKED TERMINOLOGY — use these exact Dutch terms wherever the English concept appears:\n${glossaryLines}\n` +
  `RULES:\n` +
  `- Preserve every {{placeholder}} EXACTLY as written (same name, same braces). Do not translate or reorder their contents.\n` +
  `- Preserve leading/trailing spaces and punctuation.\n` +
  `- Do not add or drop content. Output Dutch only.\n` +
  `- Return ONLY a JSON object mapping each given key to its Dutch string. No prose, no code fences.`;

// Honor the standard ANTHROPIC_BASE_URL (same convention as the official SDK),
// so the endpoint is configurable for gateways/proxies and testable end-to-end.
const API_BASE = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");
// Translate in batches so a single response never overflows max_tokens: a
// glossaryVersion bump marks ALL keys stale, and asking one call to emit
// hundreds of Dutch strings would truncate the JSON and fail to parse.
const BATCH = Math.max(1, Number(process.env.I18N_BATCH) || 50);

async function translateBatch(apiKey, enMap, keys) {
  const payload = Object.fromEntries(keys.map((k) => [k, enMap[k]]));
  const user = `Translate the VALUES of this JSON to Dutch. Return the same keys with Dutch values:\n${JSON.stringify(payload, null, 2)}`;
  const res = await fetch(`${API_BASE}/v1/messages`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 8192, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) die(`Claude API ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  const text = (data.content || []).map((b) => b.text || "").join("").trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) die(`Claude did not return JSON:\n${text}`);
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

// ---- per-catalog: load + detect stale (English value/register/glossary) ----
function loadCatalog(cat) {
  const en = readJsonc(cat.en);
  const nl = existsSync(cat.nl) ? readJsonc(cat.nl) : {};
  const meta = existsSync(cat.meta) ? readJson(cat.meta) : { keys: {} };
  const stale = [];
  for (const [key, value] of Object.entries(en)) {
    if (typeof value !== "string") continue;
    const prior = meta.keys?.[key];
    if (!(key in nl) || !prior || prior.stamp !== stamp(value)) stale.push(key);
  }
  return { en, nl, stale };
}

// ---- per-catalog: translate stale keys, assert placeholder parity, write ---
async function writeCatalog(cat, { en, nl, stale }, apiKey) {
  const translated = {};
  for (let i = 0; i < stale.length; i += BATCH) {
    const chunk = stale.slice(i, i + BATCH);
    Object.assign(translated, await translateBatch(apiKey, en, chunk));
    if (stale.length > BATCH) console.log(`  [${cat.label}] … translated ${Math.min(i + BATCH, stale.length)}/${stale.length}`);
  }

  // placeholder-set assertion: fail the run on any mismatch
  const problems = [];
  for (const key of stale) {
    const src = en[key];
    const out = translated[key];
    if (typeof out !== "string") { problems.push(`${key}: missing translation`); continue; }
    if (!sameSet(placeholders(src), placeholders(out))) {
      problems.push(`${key}: placeholder mismatch\n    en: ${JSON.stringify(placeholders(src))}\n    nl: ${JSON.stringify(placeholders(out))}`);
    }
  }
  if (problems.length) die(`[${cat.label}] placeholder validation failed — nothing written:\n  ${problems.join("\n  ")}`);

  // merge (unchanged Dutch untouched), write nl + meta
  const outNl = {};
  const outMeta = { keys: {} };
  for (const key of Object.keys(en)) {
    outNl[key] = stale.includes(key) ? translated[key] : nl[key];
    outMeta.keys[key] = { stamp: stamp(en[key]) };
  }
  const header =
    `{\n` +
    `  // GENERATED by scripts/i18n-translate.mjs — ${cat.headerName}.\n` +
    `  // The // comment above each key is its English source; edit the quoted\n` +
    `  // Dutch value to correct a translation. Register: "${register}".\n`;
  const body = Object.keys(en)
    .map((key) => `  // ${en[key].replace(/\n/g, " ")}\n  ${JSON.stringify(key)}: ${JSON.stringify(outNl[key])}`)
    .join(",\n");
  writeFileSync(cat.nl, `${header}\n${body}\n}\n`);
  writeFileSync(cat.meta, JSON.stringify(outMeta, null, 2) + "\n");
  console.log(`✓ [${cat.label}] wrote ${cat.nl} (${stale.length} translated) and ${cat.meta}`);
}

// ---- run every catalog -----------------------------------------------------
const loaded = CATALOGS.map((cat) => ({ cat, ...loadCatalog(cat) }));
for (const { cat, en, stale } of loaded) {
  const total = Object.keys(en).length;
  console.log(`i18n:translate [${cat.label}] — ${total} keys · ${total - stale.length} unchanged (kept) · ${stale.length} to translate`);
}

if (CHECK_ONLY) {
  const anyStale = loaded.filter((l) => l.stale.length);
  if (anyStale.length) {
    for (const l of anyStale) console.log(`[${l.cat.label}] stale keys:\n  ${l.stale.join("\n  ")}`);
    process.exit(2);
  }
  console.log("✓ all catalogs up to date."); process.exit(0);
}

const work = loaded.filter((l) => l.stale.length);
if (work.length === 0) { console.log("✓ nothing to translate."); process.exit(0); }

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) die("ANTHROPIC_API_KEY is not set (needed to translate the stale keys).");

for (const l of work) await writeCatalog(l.cat, l, apiKey);
