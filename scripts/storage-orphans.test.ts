/**
 * The storage orphan rules (src/lib/storageOrphans.ts).
 *
 *   npm run test:storage-orphans
 *
 * Plain asserts. Exits non-zero on failure.
 */
import assert from "node:assert/strict";
import { approvedStillOrphaned, findOrphans, type StoredObject } from "@/lib/storageOrphans";

let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log(`  ok   ${name}`); } catch (e) { failed++; console.error(`  FAIL ${name}\n`, e); }
}

const LIVE = "11111111-1111-4111-8111-111111111111";
const GONE = "22222222-2222-4222-8222-222222222222";
const BIRD = "33333333-3333-4333-8333-333333333333";
const GONE_BIRD = "44444444-4444-4444-8444-444444444444";
const f = (bucket: string, name: string, size = 100): StoredObject => ({ bucket, name, size, createdAt: "2026-07-02T00:00:00Z" });

const objects = [
  f("bird-photos", `${LIVE}/a.jpg`),
  f("bird-photos", `${GONE}/b.jpg`),
  f("bird-photos", `${GONE}/baselines/${GONE_BIRD}/droppings-1.jpeg`),
  f("bird-photos", `${GONE}/still-shown.jpg`),
  f("flock-avatars", `${GONE}/me.jpg`),
  f("flock-posts", `${GONE}/idea.jpg`),
  f("journal-photos", `${BIRD}/j.jpg`),
  f("journal-photos", `${GONE_BIRD}/j.jpg`),
  f("scan-photos", `${GONE_BIRD}/s.jpg`),
  f("journal-attachments", `${GONE_BIRD}/vet.pdf`),
  f("flock-library", "covers/00000000-0000-4000-8000-000000000001.jpg"),
  f("bird-photos", "loose-file.jpg"),
  f("bird-photos", "not-an-id/x.jpg"),
];

check("only files whose account or bird is gone, and nothing still points at, are orphans", () => {
  const plan = findOrphans({
    objects,
    liveAccountIds: [LIVE],
    liveBirdIds: [BIRD],
    references: [
      `${GONE}/still-shown.jpg`,
      // A full signed URL still protects its file.
      `https://example.supabase.co/storage/v1/object/sign/flock-posts/${GONE}/idea.jpg?token=x`,
      null,
    ],
  });
  assert.deepEqual(plan.orphans.map((o) => `${o.bucket}:${o.name}`), [
    `bird-photos:${GONE}/b.jpg`,
    `bird-photos:${GONE}/baselines/${GONE_BIRD}/droppings-1.jpeg`,
    `flock-avatars:${GONE}/me.jpg`,
    `journal-attachments:${GONE_BIRD}/vet.pdf`,
    `journal-photos:${GONE_BIRD}/j.jpg`,
    `scan-photos:${GONE_BIRD}/s.jpg`,
  ].sort());
  assert.deepEqual(plan.protectedByReference.map((o) => o.name).sort(), [`${GONE}/idea.jpg`, `${GONE}/still-shown.jpg`]);
  assert.equal(plan.checked, objects.length);
});

check("live accounts and birds are never touched, and ids match in any case", () => {
  const plan = findOrphans({ objects, liveAccountIds: [LIVE, GONE.toUpperCase()], liveBirdIds: [BIRD, GONE_BIRD], references: [] });
  assert.deepEqual(plan.orphans, []);
});

check("the library, root files and odd folders are left alone and reported", () => {
  const plan = findOrphans({ objects, liveAccountIds: [], liveBirdIds: [], references: [] });
  assert.ok(!plan.orphans.some((o) => o.bucket === "flock-library" || o.name === "loose-file.jpg" || o.name.startsWith("not-an-id")));
  assert.deepEqual(plan.skipped, [
    { bucket: "bird-photos", reason: "first folder isn't an account or bird id", count: 2 },
    { bucket: "flock-library", reason: "bucket isn't keyed by owner; never cleaned here", count: 1 },
  ]);
});

check("an unknown bucket is never cleaned", () => {
  const plan = findOrphans({ objects: [f("new-bucket", `${GONE}/x.jpg`)], liveAccountIds: [], liveBirdIds: [], references: [] });
  assert.deepEqual(plan.orphans, []);
  assert.equal(plan.skipped[0].bucket, "new-bucket");
});

check("deleting: only approved files that are still orphans now", () => {
  const now = [f("bird-photos", `${GONE}/b.jpg`), f("scan-photos", `${GONE_BIRD}/s.jpg`)];
  const approved = [
    { bucket: "bird-photos", name: `${GONE}/b.jpg` },
    // Approved yesterday, but its account came back (or a row points at it now).
    { bucket: "bird-photos", name: `${LIVE}/a.jpg` },
  ];
  assert.deepEqual(approvedStillOrphaned(approved, now).map((o) => o.name), [`${GONE}/b.jpg`]);
  // A new orphan that wasn't approved is never deleted.
  assert.ok(!approvedStillOrphaned(approved, now).some((o) => o.bucket === "scan-photos"));
});

console.log(failed ? `\n${failed} failed` : "\nall passed");
if (failed) process.exit(1);
