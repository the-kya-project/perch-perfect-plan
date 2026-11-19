/**
 * Account deletion removes every file the person left in storage and on
 * Cloudflare Stream, and never anyone else's.
 *
 *   npm run test:account-files
 *
 * Runs src/lib/accountMedia.ts and src/lib/storageSweep.ts against an
 * in-memory database and buckets that answer the way Supabase does: a listing
 * returns one folder's children with sub-folders as id-less rows, a page at a
 * time, and removing a path that isn't there does nothing. Two members:
 * Alice deletes her account; Bob, whose bird she helps care for, stays.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on failure.
 */
import assert from "node:assert/strict";
import { deleteAccountMedia, planAccountMedia, type ClipDeps, type MediaDb } from "@/lib/accountMedia";
import { deleteAllUnderPrefix } from "@/lib/storageSweep";

let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`  ok   ${name}`); } catch (e) { failed++; console.error(`  FAIL ${name}\n`, e); }
}

// ---- An in-memory Supabase -------------------------------------------------------

type Row = Record<string, any>;

class Query {
  private filters: Array<(r: Row) => boolean> = [];
  private cols: string[] | null = null;
  constructor(private db: FakeDb, private table: string) {}
  select(cols: string) { this.cols = cols.split(",").map((c) => c.trim()); return this; }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: unknown) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: unknown[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  like(c: string, pattern: string) {
    assert.ok(pattern.endsWith("%") && !pattern.slice(0, -1).includes("%"), `unsupported like: ${pattern}`);
    const pre = pattern.slice(0, -1);
    this.filters.push((r) => typeof r[c] === "string" && r[c].startsWith(pre));
    return this;
  }
  not(c: string, op: string, v: unknown) {
    assert.equal(op, "is"); assert.equal(v, null);
    this.filters.push((r) => r[c] != null);
    return this;
  }
  then<T>(resolve: (r: { data: Row[] | null; error: { message: string } | null }) => T, reject?: (e: unknown) => T) {
    if (this.db.failReads.has(this.table)) return Promise.resolve({ data: null, error: { message: `${this.table} unavailable` } }).then(resolve, reject);
    const data = (this.db.tables[this.table] ?? [])
      .filter((r) => this.filters.every((f) => f(r)))
      .map((r) => (this.cols ? Object.fromEntries(this.cols.map((c) => [c, r[c] ?? null])) : { ...r }));
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  }
}

class FakeDb implements MediaDb {
  tables: Record<string, Row[]> = {};
  files: Record<string, Set<string>> = {};
  failReads = new Set<string>();
  /** Paths whose next removes fail, and how many times. */
  failRemove = new Map<string, number>();
  lists = 0;
  from(table: string) { return new Query(this, table); }
  put(bucket: string, ...paths: string[]) { (this.files[bucket] ??= new Set()); for (const p of paths) this.files[bucket].add(p); }
  has(bucket: string, path: string) { return this.files[bucket]?.has(path) ?? false; }
  all(bucket: string) { return [...(this.files[bucket] ?? [])].sort(); }
  storage = {
    from: (bucket: string) => ({
      list: async (prefix: string, opts: { limit: number; offset: number }) => {
        this.lists++;
        const dir = prefix.replace(/\/$/, "");
        const children = new Map<string, boolean>(); // name -> isFolder
        for (const p of this.files[bucket] ?? []) {
          // Supabase lists the bucket root for an empty prefix: everyone's folders.
          const rest = dir === "" ? p : p.startsWith(`${dir}/`) ? p.slice(dir.length + 1) : null;
          if (rest == null) continue;
          const slash = rest.indexOf("/");
          if (slash === -1) children.set(rest, false);
          else children.set(rest.slice(0, slash), true);
        }
        const rows = [...children].sort(([a], [b]) => a.localeCompare(b))
          .map(([name, folder]) => ({ name, id: folder ? null : `id-${name}` }));
        return { data: rows.slice(opts.offset, opts.offset + opts.limit), error: null };
      },
      remove: async (paths: string[]) => {
        const bad = paths.find((p) => (this.failRemove.get(p) ?? 0) > 0);
        if (bad) { this.failRemove.set(bad, this.failRemove.get(bad)! - 1); return { error: { message: "storage hiccup" } }; }
        for (const p of paths) this.files[bucket]?.delete(p);
        return { error: null };
      },
    }),
  };
}

/** Cloudflare Stream, in memory: deleting a uid that's already gone is fine. */
function fakeStream(videos: Set<string>, failOnce = new Set<string>()): ClipDeps & { deleted: string[]; forgotten: string[] } {
  const deleted: string[] = [];
  const forgotten: string[] = [];
  return {
    deleted, forgotten,
    async deleteStreamUids(uids) {
      const ok: string[] = []; const failures: Array<{ uid: string; reason: string }> = [];
      for (const u of new Set(uids)) {
        if (failOnce.has(u)) { failOnce.delete(u); failures.push({ uid: u, reason: "cloudflare 500" }); continue; }
        videos.delete(u); deleted.push(u); ok.push(u);
      }
      return { deletedUids: ok, failures };
    },
    async forgetClipUids(_sb, uids) { forgotten.push(...uids); },
  };
}

// ---- Two members ---------------------------------------------------------------------

const ALICE = "a11ce000-0000-4000-8000-000000000001";
const BOB = "b0b00000-0000-4000-8000-000000000002";
const ALICE_BIRD = "a11ceb12-0000-4000-8000-0000000000b1";
const BOB_BIRD = "b0bb1200-0000-4000-8000-0000000000b2";
const uid = (n: number) => `${String(n).repeat(32)}`.slice(0, 32);

function world() {
  const db = new FakeDb();
  db.tables.birds = [
    { id: ALICE_BIRD, owner_id: ALICE, photo_url: `${ALICE}/kiwi.jpg` },
    // Bob's bird's photo is in Alice's folder: a handoff whose photo move failed.
    { id: BOB_BIRD, owner_id: BOB, photo_url: `${ALICE}/handed-over.jpg` },
  ];
  db.tables.flock_ideas = [{ id: "idea-1", photo_path: `${ALICE}/todays-idea.jpg` }];
  db.tables.clip_assets = [{ uid: uid(1), bird_id: ALICE_BIRD }, { uid: uid(2), bird_id: BOB_BIRD }, { uid: uid(3), bird_id: BOB_BIRD }, { uid: uid(4), bird_id: BOB_BIRD }, { uid: uid(5), bird_id: BOB_BIRD }];
  db.tables.journeys = [
    { id: "j-bob", bird_id: BOB_BIRD, created_by: BOB },
    { id: "j-alice-on-bob", bird_id: BOB_BIRD, created_by: ALICE },
  ];
  db.tables.journey_updates = [
    // Alice's clip on Bob's bird, in Bob's journey: goes with her.
    { id: "u1", journey_id: "j-bob", bird_id: BOB_BIRD, author_id: ALICE, clip_ref: `cfstream:${uid(2)}` },
    // Bob's own clip: stays.
    { id: "u2", journey_id: "j-bob", bird_id: BOB_BIRD, author_id: BOB, clip_ref: `cfstream:${uid(3)}` },
    // A video Alice and Bob both used; Bob's update outlives her, so it stays.
    { id: "u3", journey_id: "j-bob", bird_id: BOB_BIRD, author_id: ALICE, clip_ref: `cfstream:${uid(4)}` },
    { id: "u4", journey_id: "j-bob", bird_id: BOB_BIRD, author_id: BOB, clip_ref: `cfstream:${uid(4)}` },
    // Bob's clip in a journey Alice started: his file, never deleted for her.
    { id: "u5", journey_id: "j-alice-on-bob", bird_id: BOB_BIRD, author_id: BOB, clip_ref: `cfstream:${uid(5)}` },
    // Alice's caption-only update: no clip.
    { id: "u6", journey_id: "j-bob", bird_id: BOB_BIRD, author_id: ALICE, clip_ref: null },
  ];
  db.tables.care_plans = [{ bird_id: ALICE_BIRD, clip_step_up_path: `cfstream:${uid(1)}` }];

  db.put("bird-photos", `${ALICE}/kiwi.jpg`, `${ALICE}/baselines/${ALICE_BIRD}/droppings-1.jpeg`, `${ALICE}/handed-over.jpg`, `${BOB}/mango.jpg`);
  db.put("journal-photos", `${ALICE_BIRD}/j1.jpg`, `${BOB_BIRD}/alice-wrote-this.jpg`, `${BOB_BIRD}/bob.jpg`);
  db.put("scan-photos", `${ALICE_BIRD}/s1.jpg`, `${BOB_BIRD}/s2.jpg`);
  db.put("journal-attachments", `${ALICE_BIRD}/vet.pdf`, `${BOB_BIRD}/vet.pdf`);
  db.put("flock-avatars", `${ALICE}/me.jpg`, `${ALICE}/me-old.jpg`, `${BOB}/me.jpg`);
  db.put("flock-posts", `${ALICE}/post.jpg`, `${ALICE}/comment.jpg`, `${ALICE}/we-tried-it.jpg`, `${ALICE}/todays-idea.jpg`, `${BOB}/post.jpg`, `${BOB}/comment-on-alices-post.jpg`);
  db.put("flock-library", "covers/00000000-0000-4000-8000-0000000000c1.jpg", "files/00000000-0000-4000-8000-0000000000f1.pdf");
  const videos = new Set([uid(1), uid(2), uid(3), uid(4), uid(5)]);
  return { db, videos };
}

function bobsFilesUntouched(db: FakeDb) {
  assert.ok(db.has("bird-photos", `${BOB}/mango.jpg`));
  assert.deepEqual(db.all("journal-photos").filter((p) => p.startsWith(BOB_BIRD)), [`${BOB_BIRD}/alice-wrote-this.jpg`, `${BOB_BIRD}/bob.jpg`]);
  assert.ok(db.has("scan-photos", `${BOB_BIRD}/s2.jpg`));
  assert.ok(db.has("journal-attachments", `${BOB_BIRD}/vet.pdf`));
  assert.deepEqual(db.all("flock-avatars").filter((p) => p.startsWith(BOB)), [`${BOB}/me.jpg`]);
  assert.deepEqual(db.all("flock-posts").filter((p) => p.startsWith(BOB)), [`${BOB}/comment-on-alices-post.jpg`, `${BOB}/post.jpg`]);
  assert.equal(db.all("flock-library").length, 2);
}

// ---- Tests ---------------------------------------------------------------------------

await check("deleting Alice's account removes every file of hers: Flock photos, care photos, clips", async () => {
  const { db, videos } = world();
  const stream = fakeStream(videos);
  const r = await deleteAccountMedia(db, ALICE, [ALICE_BIRD], stream);
  assert.deepEqual(r.failures, []);
  // Flock: profile photos (current and replaced), post, comment and We tried it photos.
  assert.deepEqual(db.all("flock-avatars").filter((p) => p.startsWith(ALICE)), []);
  assert.deepEqual(db.all("flock-posts").filter((p) => p.startsWith(ALICE)), [`${ALICE}/todays-idea.jpg`]);
  // Care: her bird's photos (nested folders too), journal, scan and attachment files.
  assert.deepEqual(db.all("bird-photos").filter((p) => p.startsWith(ALICE)), [`${ALICE}/handed-over.jpg`]);
  assert.deepEqual(db.all("journal-photos").filter((p) => p.startsWith(ALICE_BIRD)), []);
  assert.deepEqual(db.all("scan-photos").filter((p) => p.startsWith(ALICE_BIRD)), []);
  assert.deepEqual(db.all("journal-attachments").filter((p) => p.startsWith(ALICE_BIRD)), []);
  // Videos: her bird's clip and her clip on Bob's bird.
  assert.deepEqual(stream.deleted.sort(), [uid(1), uid(2)].sort());
  assert.deepEqual(stream.forgotten.sort(), [uid(1), uid(2)].sort());
  assert.equal(r.deletedClips, 2);
  assert.equal(r.keptFiles, 2);
});

await check("Bob's files are untouched: his folders, his shared bird's files, his clips", async () => {
  const { db, videos } = world();
  await deleteAccountMedia(db, ALICE, [ALICE_BIRD], fakeStream(videos));
  bobsFilesUntouched(db);
  // Bob's clip, a clip he also uses, and his clip in a journey Alice started.
  for (const u of [uid(3), uid(4), uid(5)]) assert.ok(videos.has(u), `video ${u} was deleted`);
});

await check("kept on purpose: a Today's idea photo and a photo another owner's bird still shows", async () => {
  const { db } = world();
  const plan = await planAccountMedia(db, ALICE, [ALICE_BIRD]);
  const keep = (b: string) => [...(plan.sweeps.find((s) => s.bucket === b)?.keep ?? [])];
  assert.deepEqual(keep("flock-posts"), [`${ALICE}/todays-idea.jpg`]);
  assert.deepEqual(keep("bird-photos"), [`${ALICE}/handed-over.jpg`]);
  // The library is never swept.
  assert.ok(!plan.sweeps.some((s) => s.bucket === "flock-library"));
});

await check("a household member's deletion leaves the shared bird's files with the bird", async () => {
  const { db, videos } = world();
  // Alice owns no birds here: Bob's bird keeps the journal photo she wrote.
  db.tables.birds = db.tables.birds.filter((b) => b.owner_id !== ALICE);
  await deleteAccountMedia(db, ALICE, [], fakeStream(videos));
  assert.ok(db.has("journal-photos", `${BOB_BIRD}/alice-wrote-this.jpg`));
  assert.ok(!db.has("flock-avatars", `${ALICE}/me.jpg`));
});

await check("a sweep only ever starts from one id: blank, nested or odd folders delete nothing", async () => {
  const { db } = world();
  const before = db.all("flock-posts");
  for (const prefix of ["", "/", `${ALICE}/x`, "../etc", "covers", `${ALICE}%`, " "]) {
    const r = await deleteAllUnderPrefix(db.storage, "flock-posts", prefix);
    assert.equal(r.deleted, 0, prefix);
    assert.match(r.failures[0]?.reason ?? "", /refused/);
  }
  assert.deepEqual(db.all("flock-posts"), before);
  await assert.rejects(planAccountMedia(db, "", []), /refused/);
});

await check("a batch that fails once is retried file by file in the same run", async () => {
  const { db, videos } = world();
  db.failRemove.set(`${ALICE}/post.jpg`, 1);
  const r = await deleteAccountMedia(db, ALICE, [ALICE_BIRD], fakeStream(videos));
  assert.deepEqual(r.failures, []);
  assert.ok(!db.has("flock-posts", `${ALICE}/post.jpg`));
});

await check("a folder bigger than one page is cleared completely", async () => {
  const { db } = world();
  for (let i = 0; i < 25; i++) db.put("flock-posts", `${ALICE}/many-${String(i).padStart(2, "0")}.jpg`);
  const r = await deleteAllUnderPrefix(db.storage, "flock-posts", ALICE, 4, new Set([`${ALICE}/todays-idea.jpg`]));
  assert.deepEqual(r.failures, []);
  assert.deepEqual(db.all("flock-posts").filter((p) => p.startsWith(ALICE)), [`${ALICE}/todays-idea.jpg`]);
});

await check("safe to retry: a failed file is reported, and the next run finishes the job", async () => {
  const { db, videos } = world();
  // Fails for the batch and for the sweep's own one-by-one retry, so this run can't finish it.
  db.failRemove.set(`${ALICE}/comment.jpg`, 2);
  const stream = fakeStream(videos, new Set([uid(2)]));
  const first = await deleteAccountMedia(db, ALICE, [ALICE_BIRD], stream);
  assert.deepEqual(first.failures.map((f) => `${f.bucket}:${f.path}`).sort(), [`cloudflare-stream:${uid(2)}`, `flock-posts:${ALICE}/comment.jpg`]);
  assert.ok(db.has("flock-posts", `${ALICE}/comment.jpg`));
  assert.ok(videos.has(uid(2)));
  // The rows are still there (nothing deleted them), so a second run finds and finishes it.
  const second = await deleteAccountMedia(db, ALICE, [ALICE_BIRD], stream);
  assert.deepEqual(second.failures, []);
  assert.ok(!db.has("flock-posts", `${ALICE}/comment.jpg`));
  assert.ok(!videos.has(uid(2)));
  // And a third run has nothing left to do, without errors.
  const third = await deleteAccountMedia(db, ALICE, [ALICE_BIRD], fakeStream(videos));
  assert.deepEqual(third.failures, []);
  assert.equal(third.deletedFiles, 0);
  bobsFilesUntouched(db);
});

await check("a read error stops before anything is deleted", async () => {
  const { db, videos } = world();
  db.failReads.add("journey_updates");
  const files = JSON.stringify(Object.fromEntries(Object.entries(db.files).map(([b, s]) => [b, [...s].sort()])));
  await assert.rejects(deleteAccountMedia(db, ALICE, [ALICE_BIRD], fakeStream(videos)), /journey_updates read failed/);
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(db.files).map(([b, s]) => [b, [...s].sort()]))), files);
  assert.equal(videos.size, 5);
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
if (failed) process.exit(1);
