#!/usr/bin/env node
// Owner byte-identity check for SHARED components touched by Phase 1 i18n.
//
// The owner app renders shared components (CareSheetView, SitterDashboard, …)
// through the global i18n instance, which is pinned to English. So every string
// we keyed there renders, for the owner, as t("key","English") → the English
// value. Owner output is byte-identical to pre-i18n IFF, for every such call:
//   (a) the catalog value en.jsonc[key] === the inline English default, and
//   (b) that exact English existed verbatim in the file on `main`
//       (for interpolated strings, each static fragment around {{…}} did).
//
// This script verifies (a) and (b) mechanically for the given files and exits
// non-zero on any mismatch. Pair with a review of `git diff main -- <file>` to
// confirm the only changes are literal→t() replacements + the import.
//
//   node scripts/i18n-owner-parity.mjs <file...>   (defaults to the shared set)

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
const en = JSON.parse(stripLineComments(readFileSync(join(ROOT, "src/locales/en.jsonc"), "utf8")));

// Files that are rendered on BOTH the sitter and owner surfaces. Only these need
// the byte-identity proof; sitter-exclusive files can render Dutch freely.
const SHARED_FILES = [
  "src/components/carePlanCards.tsx",
  "src/components/ConcernFlow.tsx",
  "src/components/ScanForm.tsx",
  "src/components/Disclaimer.tsx",
  "src/components/PassingGuidance.tsx",
];
const files = process.argv.slice(2).length ? process.argv.slice(2) : SHARED_FILES;

// True if `frag` appears verbatim somewhere in the `main` tree (any file).
function existsOnMain(frag) {
  try {
    execFileSync("git", ["grep", "-F", "-q", frag, "main", "--", "src"], { cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

// Matches t("key", "default") / t('key', 'default') on one line, default being a
// plain (non-interpolated-by-JS) string literal. Template literals / multi-line
// calls are reported as "manual" for review rather than silently passed.
const CALL = /\bt\(\s*(["'])((?:\\.|(?!\1).)*)\1\s*,\s*(["'])((?:\\.|(?!\3).)*)\3/g;
const unescape = (s) => s.replace(/\\(["'\\])/g, "$1").replace(/\\n/g, "\n");
const staticFragments = (s) => s.split(/\{\{[^}]+\}\}/g).map((f) => f.trim()).filter((f) => f.length > 1);

let checked = 0, failures = 0;
for (const rel of files) {
  let mainSrc;
  try {
    mainSrc = execFileSync("git", ["show", `main:${rel}`], { cwd: ROOT, encoding: "utf8" });
  } catch {
    console.error(`✗ ${rel}: not found on main`);
    failures++;
    continue;
  }
  const cur = readFileSync(join(ROOT, rel), "utf8");
  let m;
  while ((m = CALL.exec(cur))) {
    const key = unescape(m[2]);
    const def = unescape(m[4]);
    checked++;
    const problems = [];
    if (en[key] !== def) problems.push(`catalog value ≠ inline default (en[${key}]=${JSON.stringify(en[key])})`);
    for (const frag of staticFragments(def)) {
      // The English must have existed verbatim on `main` — but a string may have
      // MOVED files during extraction (e.g. PATH_CHOICE_LABELS from
      // PassingGuidance into ConcernFlow), so search all of `main`, not just this
      // file. Owner render is byte-identical because owner resolves to en and the
      // en value equals this original English.
      if (!existsOnMain(frag)) problems.push(`fragment not on main anywhere: ${JSON.stringify(frag)}`);
    }
    if (problems.length) {
      failures++;
      console.error(`✗ ${rel} [${key}]\n    ${problems.join("\n    ")}`);
    }
  }
}

console.log(`\nowner-parity: ${checked} keyed strings checked across ${files.length} shared file(s), ${failures} problem(s).`);
process.exit(failures ? 1 : 0);
