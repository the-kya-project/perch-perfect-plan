/**
 * The 180-day purge of deleted Flock posts and comments (backlog 1.3).
 *
 *   npm run test:flock-purge
 *
 * Pins src/lib/flockPurge.ts with a fake database and bucket: photos go before
 * the item, an item whose photos fail stays for the next run, odd paths are
 * left alone, a dry run deletes nothing, and a second run is a no-op. Who sees
 * a deleted post (nobody) and what the database holds are pinned in
 * supabase/checks/flock_posts_checks.sql.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { PURGE_PHOTO_PATH, runFlockPurge, type DueItem, type PurgeDeps } from "@/lib/flockPurge";
import { REFERENCE_COLUMNS } from "@/lib/storageOrphans";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const photo = (user: number, n: number) => `${uuid(user)}/${uuid(1000 + n)}.jpg`;

/** A fake flock_deleted_items (due items only) and flock-posts bucket. */
function fake(items: DueItem[], files: string[], opts: { failOn?: string } = {}) {
  const rows = new Map(items.map((it) => [it.item_id, it]));
  const bucket = new Set(files);
  const calls: string[] = [];
  const deps: PurgeDeps = {
    due: async (limit) => [...rows.values()].slice(0, limit),
    done: async (ids) => {
      calls.push(`done:${ids.length}`);
      let n = 0;
      for (const id of ids) if (rows.delete(id)) n++;
      return n;
    },
    remove: async (paths) => {
      calls.push(`remove:${paths.length}`);
      if (opts.failOn && paths.includes(opts.failOn)) throw new Error("storage down");
      for (const p of paths) bucket.delete(p);
    },
  };
  return { deps, rows, bucket, calls };
}

await check("photos are removed before the item is deleted", async () => {
  const f = fake([{ item_id: "a", paths: [photo(1, 1), photo(1, 2)] }, { item_id: "b", paths: [] }], [photo(1, 1), photo(1, 2), photo(2, 3)]);
  const r = await runFlockPurge(f.deps);
  assert.equal(r.purged, 2);
  assert.equal(r.files, 2);
  assert.equal(r.failed, 0);
  assert.deepEqual([...f.bucket], [photo(2, 3)]);
  assert.equal(f.rows.size, 0);
  assert.deepEqual(f.calls, ["remove:2", "done:2"]);
});

await check("an item whose photos fail to delete stays for the next run", async () => {
  const items: DueItem[] = [];
  for (let i = 0; i < 150; i++) items.push({ item_id: `i${i}`, paths: [photo(1, i)] });
  const f = fake(items, items.map((it) => it.paths![0]), { failOn: photo(1, 120) });
  const r = await runFlockPurge(f.deps);
  // The first chunk of 100 goes; the chunk holding the failing photo stays.
  assert.equal(r.purged, 100);
  assert.equal(r.failed, 50);
  assert.equal(f.rows.size, 50);
  assert.ok(f.rows.has("i120"));
  assert.ok(f.bucket.has(photo(1, 120)));
});

await check("paths that aren't a post photo's shape are left alone", async () => {
  const odd = ["../other-bucket/x.jpg", `${uuid(1)}/notes.txt`, "covers/abc.jpg"];
  const f = fake([{ item_id: "a", paths: [...odd, photo(1, 1)] }], [...odd, photo(1, 1)]);
  const r = await runFlockPurge(f.deps);
  assert.equal(r.files, 1);
  assert.equal(r.skippedPaths, 3);
  for (const p of odd) assert.ok(f.bucket.has(p), p);
  assert.ok(!PURGE_PHOTO_PATH.test("x/" + photo(1, 1)));
});

await check("a dry run deletes nothing", async () => {
  const f = fake([{ item_id: "a", paths: [photo(1, 1)] }, { item_id: "b", paths: null }], [photo(1, 1)]);
  const r = await runFlockPurge(f.deps, { dryRun: true });
  assert.equal(r.dryRun, true);
  assert.equal(r.purged, 2);
  assert.equal(r.files, 1);
  assert.equal(f.rows.size, 2);
  assert.ok(f.bucket.has(photo(1, 1)));
  assert.deepEqual(f.calls, []);
});

await check("running it again is a no-op", async () => {
  const f = fake([{ item_id: "a", paths: [photo(1, 1)] }], [photo(1, 1)]);
  await runFlockPurge(f.deps);
  f.calls.length = 0;
  const r = await runFlockPurge(f.deps);
  assert.deepEqual({ purged: r.purged, files: r.files, failed: r.failed }, { purged: 0, files: 0, failed: 0 });
  assert.deepEqual(f.calls, []);
});

await check("works through many batches and says when more are waiting", async () => {
  const items: DueItem[] = [];
  for (let i = 0; i < 25; i++) items.push({ item_id: `i${i}`, paths: [] });
  const all = fake(items, []);
  const r1 = await runFlockPurge(all.deps, { batch: 10 });
  assert.equal(r1.purged, 25);
  assert.equal(r1.more, false);
  const capped = fake(items, []);
  const r2 = await runFlockPurge(capped.deps, { batch: 10, maxBatches: 2 });
  assert.equal(r2.purged, 20);
  assert.equal(r2.more, true);
});

await check("held photos count as referenced for the storage-orphans sweep", () => {
  assert.ok(REFERENCE_COLUMNS.some((c) => c.table === "flock_deleted_items" && c.column === "photo_paths" && c.array));
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
