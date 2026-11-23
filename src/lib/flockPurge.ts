// The 180-day purge of deleted Flock posts and comments (backlog 1.3, legal
// draft D10). Deleting a post or comment moves it into flock_deleted_items at
// once (supabase/migrations/20261123074500_flock_deleted_hold.sql); this runs
// daily from /api/public/hooks/flock-purge and deletes, for good, the items
// whose hold is over, photos first.
//
// The order matters: an item is deleted only after its photos have been
// removed, so a failed removal leaves the item (and the path to its photos) for
// the next run. Running it again is always safe: removing a file that's
// already gone isn't an error.
//
// Removed content and closed reports (backlog 1.4, legal draft D9): before the
// purge, `expire` (flock_moderation_purge) moves posts and comments a reviewer
// removed 180+ days ago into flock_deleted_items, already due, and deletes
// reports closed 180+ days ago, so the same run removes their photos too.
//
// Pure apart from the calls it's given, so scripts/flock-purge.test.ts pins it
// with fakes.

/** "<user id>/<uuid>.jpg", the only shape a post or comment photo has. */
export const PURGE_PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

export type DueItem = { item_id: string; paths: string[] | null };

export type ModerationExpired = { posts: number; comments: number; reports: number };

export type PurgeDeps = {
  /**
   * Moves removed content whose 180 days are over into the purge and deletes
   * old closed reports (flock_moderation_purge); with dryRun, only counts.
   */
  expire?: (dryRun: boolean) => Promise<ModerationExpired>;
  /** Held items whose hold is over, oldest first (flock_purge_due). */
  due: (limit: number) => Promise<DueItem[]>;
  /** Deletes those items for good; returns how many went (flock_purge_done). */
  done: (ids: string[]) => Promise<number>;
  /** Removes files from the flock-posts bucket; throws on failure. */
  remove: (paths: string[]) => Promise<void>;
};

export type PurgeResult = {
  /** Held items deleted for good. */
  purged: number;
  /** Photo files removed. */
  files: number;
  /** Items left for the next run because their photos didn't delete. */
  failed: number;
  /** Paths that weren't a post photo's shape, left alone. */
  skippedPaths: number;
  /** True when the batch limit was reached and more may be waiting. */
  more: boolean;
  dryRun: boolean;
  /**
   * Removed posts and comments moved into the purge, and closed reports
   * deleted (1.4). In a dry run, how many would be; their photos aren't in
   * `files` then, since they're only counted once moved.
   */
  removed: ModerationExpired;
};

export const PURGE_BATCH = 100;
export const PURGE_MAX_BATCHES = 20;
/** The Storage API takes up to 1,000 paths per call; stay well under it. */
export const PURGE_REMOVE_CHUNK = 100;

export async function runFlockPurge(
  deps: PurgeDeps,
  opts: { dryRun?: boolean; batch?: number; maxBatches?: number } = {},
): Promise<PurgeResult> {
  const batch = opts.batch ?? PURGE_BATCH;
  const maxBatches = opts.maxBatches ?? PURGE_MAX_BATCHES;
  const out: PurgeResult = {
    purged: 0,
    files: 0,
    failed: 0,
    skippedPaths: 0,
    more: false,
    dryRun: !!opts.dryRun,
    removed: { posts: 0, comments: 0, reports: 0 },
  };

  // First, so what it moves is purged in this same run.
  if (deps.expire) out.removed = await deps.expire(!!opts.dryRun);

  if (opts.dryRun) {
    const items = await deps.due(batch);
    for (const it of items) {
      const paths = it.paths ?? [];
      const ok = paths.filter((p) => PURGE_PHOTO_PATH.test(p));
      out.files += ok.length;
      out.skippedPaths += paths.length - ok.length;
    }
    out.purged = items.length;
    out.more = items.length >= batch;
    return out;
  }

  // Items that failed this run aren't asked for again in the same run.
  const failedIds = new Set<string>();
  for (let round = 0; round < maxBatches; round++) {
    const items = (await deps.due(batch + failedIds.size)).filter((it) => !failedIds.has(it.item_id));
    if (items.length === 0) return out;

    const doneIds: string[] = [];
    for (let i = 0; i < items.length; i += PURGE_REMOVE_CHUNK) {
      const chunk = items.slice(i, i + PURGE_REMOVE_CHUNK);
      const paths: string[] = [];
      for (const it of chunk) {
        for (const p of it.paths ?? []) {
          if (PURGE_PHOTO_PATH.test(p)) paths.push(p);
          else out.skippedPaths++;
        }
      }
      try {
        if (paths.length) await deps.remove(paths);
        out.files += paths.length;
        doneIds.push(...chunk.map((it) => it.item_id));
      } catch {
        for (const it of chunk) failedIds.add(it.item_id);
        out.failed += chunk.length;
      }
    }
    if (doneIds.length) out.purged += await deps.done(doneIds);
    if (items.length < batch) return out;
  }
  out.more = true;
  return out;
}
