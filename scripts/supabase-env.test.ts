/**
 * Vercel previews never resolve to the production Supabase project.
 *
 *   npm run test:supabase-env
 *
 * Pins src/lib/supabaseEnv.ts: a preview build picks one Supabase project from
 * its variables (the staging branch), and fails the build when
 * those variables are missing, disagree, or name production. The runtime guard
 * refuses production only in a preview, so production itself is untouched.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import {
  PRODUCTION_SUPABASE_REF,
  assertNotProductionInPreview,
  resolvePreviewSupabase,
  supabaseRef,
} from "@/lib/supabaseEnv";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const PROD = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
const STAGING = "https://stagingrefabcdefghij.supabase.co";

check("reads the ref from a Supabase URL", () => {
  assert.equal(supabaseRef(PROD), PRODUCTION_SUPABASE_REF);
  assert.equal(supabaseRef("not a url"), null);
});

check("staging fallback: unprefixed variables only", () => {
  const r = resolvePreviewSupabase({ SUPABASE_URL: STAGING, SUPABASE_PUBLISHABLE_KEY: "sb_publishable_s" });
  assert.equal(r.url, STAGING);
  assert.equal(r.ref, "stagingrefabcdefghij");
  assert.equal(r.publishableKey, "sb_publishable_s");
});

check("a VITE_ copy that agrees is fine", () => {
  const r = resolvePreviewSupabase({ SUPABASE_URL: STAGING, VITE_SUPABASE_URL: STAGING, VITE_SUPABASE_PUBLISHABLE_KEY: "k" });
  assert.equal(r.url, STAGING);
  assert.equal(r.publishableKey, "k");
});

check("fails on production", () => {
  assert.throws(() => resolvePreviewSupabase({ SUPABASE_URL: PROD, SUPABASE_PUBLISHABLE_KEY: "k" }), /PRODUCTION/);
  assert.throws(() => resolvePreviewSupabase({ VITE_SUPABASE_URL: PROD, VITE_SUPABASE_PUBLISHABLE_KEY: "k" }), /PRODUCTION/);
});

check("fails when variables name different projects (e.g. a stale VITE_ copy of production)", () => {
  assert.throws(
    () => resolvePreviewSupabase({ SUPABASE_URL: STAGING, VITE_SUPABASE_URL: PROD, SUPABASE_PUBLISHABLE_KEY: "k" }),
    /disagree/,
  );
});

check("fails with no URL or no key", () => {
  assert.throws(() => resolvePreviewSupabase({}), /no Supabase URL/);
  assert.throws(() => resolvePreviewSupabase({ SUPABASE_URL: STAGING }), /no publishable key/);
});

check("runtime guard: refuses production only in a preview", () => {
  assert.throws(() => assertNotProductionInPreview(PROD, "preview"), /PRODUCTION/);
  assert.doesNotThrow(() => assertNotProductionInPreview(PROD, "production"));
  assert.doesNotThrow(() => assertNotProductionInPreview(PROD, undefined));
  assert.doesNotThrow(() => assertNotProductionInPreview(STAGING, "preview"));
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
