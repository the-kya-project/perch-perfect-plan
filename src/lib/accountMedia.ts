// Every file an account deletion removes, and how (deleteMyAccount in
// account.functions.ts). Kept apart from the server function so
// scripts/account-deletion.test.ts can run it against an in-memory database
// and bucket.
//
// What's where, and the rule for each:
//
//   Bucket              Folder                What happens
//   bird-photos         <owner id>/           swept: photos of birds you own (only
//                                             the owner's folder is ever shown to
//                                             others, and you can only upload into
//                                             your own). A photo another owner's
//                                             bird still points at is kept.
//   journal-photos      <bird id>/            swept for birds you own. A shared
//   scan-photos         <bird id>/            bird you're a household member of
//   journal-attachments <bird id>/            keeps its files: it still has its owner.
//   flock-avatars       <user id>/            swept: your Flock profile photos.
//   flock-posts         <user id>/            swept: your post, comment and "We tried
//                                             it" photos, except Today's idea photos
//                                             an admin uploaded (they stay with the idea).
//   flock-library       covers/, files/       never touched: library resources belong
//                                             to the Flock, not to whoever wrote them.
//   flock-votes         choices/              never touched: vote choice photos are
//                                             admin content (your ballots go with
//                                             your account, by foreign key).
//   Cloudflare Stream   (clip_assets)         every clip registered to a bird you own,
//                                             plus clips you posted to journeys on
//                                             other people's birds, unless a row that
//                                             outlives you still uses them.
//
// Safe to run again: storage removes and Cloudflare deletes of something
// already gone are no-ops, and nothing here deletes a database row except the
// clip registry rows of videos confirmed gone. A sweep only ever starts from
// one id (storageSweep.ts refuses anything else), so it can't reach another
// member's folder.
import { CF_PREFIX, CLIP_COLUMNS, cfUid } from "./clipRef";
import { SWEEP_PREFIX_RE, deleteAllUnderPrefix, type SweepFailure, type SweepStorage } from "./storageSweep";

/** The slice of the Supabase client this module reads with (the real
 *  supabaseAdmin fits it; so does the test's fake). */
export type MediaDb = {
  from(table: string): any;
  storage: SweepStorage;
};

export type ClipDeps = {
  deleteStreamUids(uids: string[]): Promise<{ deletedUids: string[]; failures: Array<{ uid: string; reason: string }> }>;
  forgetClipUids(sb: any, uids: string[]): Promise<void>;
};

export type Sweep = { bucket: string; prefix: string; keep: Set<string> };
export type AccountMediaPlan = { sweeps: Sweep[]; clipUids: string[] };

function rows<T>(r: { data: T[] | null; error: { message: string } | null }, what: string): T[] {
  if (r.error) throw new Error(`${what} read failed: ${r.error.message}`);
  return r.data ?? [];
}

/**
 * Work out what to delete. Reads only; MUST run before any row is deleted,
 * because the rows are the only way to find the files (clip_assets and
 * journey_updates both cascade away with their birds and authors).
 */
export async function planAccountMedia(sb: MediaDb, userId: string, ownedBirdIds: string[]): Promise<AccountMediaPlan> {
  if (!SWEEP_PREFIX_RE.test(userId)) throw new Error("refused: not a user id");
  const birds = ownedBirdIds.filter((id) => SWEEP_PREFIX_RE.test(id));
  const mine = `${userId}/`;

  // bird-photos: a photo in your folder that someone else's bird still shows
  // (a handoff whose photo move failed) stays with that bird.
  const otherBirdPhotos = rows<{ photo_url: string | null }>(
    await sb.from("birds").select("photo_url").like("photo_url", `${mine}%`).neq("owner_id", userId),
    "birds",
  ).map((r) => r.photo_url).filter((p): p is string => !!p);

  // flock-posts: Today's idea photos live in the admin's folder but belong to
  // the idea, which outlives the admin's account.
  const ideaPhotos = rows<{ photo_path: string | null }>(
    await sb.from("flock_ideas").select("photo_path").like("photo_path", `${mine}%`),
    "flock_ideas",
  ).map((r) => r.photo_path).filter((p): p is string => !!p);

  const sweeps: Sweep[] = [
    { bucket: "bird-photos", prefix: userId, keep: new Set(otherBirdPhotos) },
    { bucket: "flock-avatars", prefix: userId, keep: new Set() },
    { bucket: "flock-posts", prefix: userId, keep: new Set(ideaPhotos) },
  ];
  for (const birdId of birds) {
    for (const bucket of ["journal-photos", "scan-photos", "journal-attachments"]) {
      sweeps.push({ bucket, prefix: birdId, keep: new Set() });
    }
  }

  // Clips: everything registered to your birds…
  const owned = birds.length
    ? rows<{ uid: string }>(await sb.from("clip_assets").select("uid").in("bird_id", birds), "clip_assets").map((r) => r.uid)
    : [];

  // …plus clips you posted to journeys on other people's birds. Those journey
  // updates are deleted with your account (author cascade), so their videos
  // would be left behind. Kept when a row that outlives you still uses the
  // same video: someone else's journey update, or a care plan on a bird you
  // don't own.
  const authored = rows<{ clip_ref: string | null; bird_id: string }>(
    await sb.from("journey_updates").select("clip_ref, bird_id").eq("author_id", userId).not("clip_ref", "is", null),
    "journey_updates",
  ).filter((r) => r.clip_ref && !birds.includes(r.bird_id)).map((r) => cfUid(r.clip_ref!));
  let others = [...new Set(authored)].filter((u) => /^[A-Za-z0-9]{8,64}$/.test(u));
  if (others.length) {
    const refs = others.map((u) => `${CF_PREFIX}${u}`);
    const stillUsed = new Set<string>();
    const theirUpdates = rows<{ clip_ref: string; journey_id: string; author_id: string }>(
      await sb.from("journey_updates").select("clip_ref, journey_id, author_id").in("clip_ref", refs).neq("author_id", userId),
      "journey_updates",
    );
    if (theirUpdates.length) {
      // Someone else's update survives unless its journey is one you started
      // (journeys cascade on their creator too).
      const journeyIds = [...new Set(theirUpdates.map((r) => r.journey_id))];
      const mineStarted = new Set(rows<{ id: string }>(
        await sb.from("journeys").select("id").in("id", journeyIds).eq("created_by", userId),
        "journeys",
      ).map((r) => r.id));
      for (const r of theirUpdates) if (!mineStarted.has(r.journey_id)) stillUsed.add(cfUid(r.clip_ref));
    }
    for (const col of CLIP_COLUMNS) {
      const plans = rows<Record<string, string | null>>(
        await sb.from("care_plans").select(`${col}, bird_id`).in(col, refs),
        "care_plans",
      );
      for (const p of plans) if (p[col] && !birds.includes(p.bird_id as string)) stillUsed.add(cfUid(p[col]!));
    }
    others = others.filter((u) => !stillUsed.has(u));
  }

  return { sweeps, clipUids: [...new Set([...owned, ...others])] };
}

/** Delete what the plan lists. Never throws for a file; returns what failed. */
export async function runAccountMediaPlan(
  sb: MediaDb,
  plan: AccountMediaPlan,
  clips: ClipDeps,
): Promise<{ deletedFiles: number; keptFiles: number; deletedClips: number; failures: SweepFailure[] }> {
  const failures: SweepFailure[] = [];
  let deletedFiles = 0;
  let keptFiles = 0;
  for (const s of plan.sweeps) {
    try {
      const r = await deleteAllUnderPrefix(sb.storage, s.bucket, s.prefix, undefined, s.keep);
      deletedFiles += r.deleted;
      keptFiles += r.kept;
      failures.push(...r.failures);
    } catch (e: any) {
      failures.push({ bucket: s.bucket, path: s.prefix, reason: `sweep threw: ${e?.message ?? e}` });
    }
  }
  let deletedClips = 0;
  if (plan.clipUids.length) {
    try {
      const { deletedUids, failures: clipFailures } = await clips.deleteStreamUids(plan.clipUids);
      deletedClips = deletedUids.length;
      await clips.forgetClipUids(sb, deletedUids);
      for (const f of clipFailures) failures.push({ bucket: "cloudflare-stream", path: f.uid, reason: f.reason });
    } catch (e: any) {
      failures.push({ bucket: "cloudflare-stream", path: plan.clipUids.join(","), reason: `clip cleanup threw: ${e?.message ?? e}` });
    }
  }
  return { deletedFiles, keptFiles, deletedClips, failures };
}

/** Plan, then delete. A planning failure (a read error) throws before
 *  anything is deleted: the caller stops, and a retry starts from a full
 *  picture instead of deleting rows that were the only way to find the files. */
export async function deleteAccountMedia(
  sb: MediaDb,
  userId: string,
  ownedBirdIds: string[],
  clips: ClipDeps,
): Promise<{ deletedFiles: number; keptFiles: number; deletedClips: number; failures: SweepFailure[] }> {
  const plan = await planAccountMedia(sb, userId, ownedBirdIds);
  return runAccountMediaPlan(sb, plan, clips);
}
