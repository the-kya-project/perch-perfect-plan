/**
 * Daily check or full health check: the stored daily_logs.kind wins, the guess
 * fills in for rows without one, and inserts survive a database that doesn't
 * have the column yet.
 *
 *   npm run test:check-kind
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { checkKindOf, insertWithKind, isFullCheck, FULL_CHECK_PHOTO_NOTE } from "@/lib/checkKind";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

await check("stored kind wins over the guess", () => {
  assert.equal(checkKindOf({ kind: "full", source: "owner", item_notes: null }), "full");
  assert.equal(checkKindOf({ kind: "daily", source: "owner", item_notes: { food: "left half" } }, [FULL_CHECK_PHOTO_NOTE]), "daily");
});

await check("null kind falls back to the guess", () => {
  assert.equal(checkKindOf({ kind: null, source: "owner", item_notes: { food: "left half" } }), "full");
  assert.equal(checkKindOf({ source: "household", item_notes: null }, [FULL_CHECK_PHOTO_NOTE]), "full");
  assert.equal(checkKindOf({ source: "owner", item_notes: null }), "daily");
});

await check("an unknown stored kind falls back to the guess", () => {
  assert.equal(checkKindOf({ kind: "weekly", source: "owner", item_notes: { food: "x" } }), "full");
});

await check("a sitter's check is always daily", () => {
  assert.equal(isFullCheck({ source: "sitter", item_notes: { food: "didn't eat" } }, [FULL_CHECK_PHOTO_NOTE]), false);
});

await check("blank notes, non-string notes and other photos don't make a full check", () => {
  assert.equal(isFullCheck({ source: "owner", item_notes: { food: "  \n\t" } }, []), false);
  assert.equal(isFullCheck({ source: "owner", item_notes: { food: 5 } }, []), false);
  assert.equal(isFullCheck({ source: "owner", item_notes: ["x"] }, []), false);
  assert.equal(isFullCheck({ source: "owner", item_notes: {} }, ["something else", null]), false);
});

await check("insert passes kind through when the column exists", async () => {
  const seen: Record<string, unknown>[] = [];
  const res = await insertWithKind({ bird_id: "b1", kind: "full" }, async (r) => { seen.push(r); return { data: { id: "1" }, error: null }; });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].kind, "full");
  assert.equal(res.error, null);
});

await check("insert retries without kind when the column is missing", async () => {
  const seen: Record<string, unknown>[] = [];
  const res = await insertWithKind({ bird_id: "b1", kind: "daily" }, async (r) => {
    seen.push(r);
    return "kind" in r
      ? { data: null, error: { code: "PGRST204", message: "Could not find the 'kind' column of 'daily_logs' in the schema cache" } }
      : { data: { id: "1" }, error: null };
  });
  assert.equal(seen.length, 2);
  assert.ok(!("kind" in seen[1]));
  assert.equal(seen[1].bird_id, "b1");
  assert.equal(res.error, null);
});

await check("insert doesn't retry on other errors", async () => {
  let calls = 0;
  const res = await insertWithKind({ bird_id: "b1", kind: "daily" }, async () => {
    calls++;
    return { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
  });
  assert.equal(calls, 1);
  assert.equal(res.error?.code, "42501");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
