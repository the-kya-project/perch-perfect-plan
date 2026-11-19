// Deleting every file under one user's or one bird's folder in a storage
// bucket. Used by account deletion (account.functions.ts, accountMedia.ts) and
// bird deletion (birdMedia.functions.ts). No server-only imports, so the tests
// in scripts/account-deletion.test.ts can run it against an in-memory bucket.

/** The slice of the Supabase Storage client the sweep uses (structural, so a
 *  test can pass an in-memory fake). */
export type SweepStorage = {
  from(bucket: string): {
    list(prefix: string, opts: { limit: number; offset: number }): PromiseLike<{ data: Array<{ name: string; id?: string | null }> | null; error: { message: string } | null }>;
    remove(paths: string[]): PromiseLike<{ error: { message: string } | null }>;
  };
};

/** The only folder names a sweep may start from: one user or bird id. A blank
 *  or nested prefix would list from the bucket root (everyone's files), so the
 *  sweep refuses anything else and deletes nothing. */
export const SWEEP_PREFIX_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Production page size for storage listing. `.list()` defaults to 100 and caps
// silently — without an advancing offset, objects beyond one page are never
// deleted. Kept as a named constant (overridable via the helper's `pageSize`
// argument) so the pagination loop can be proven with a handful of objects.
export const STORAGE_LIST_PAGE_SIZE = 1000;

// `.remove()` has no client-side cap; the Storage API rejects oversized delete
// requests server-side, so we chunk paths to stay comfortably under that limit.
export const STORAGE_REMOVE_BATCH_SIZE = 100;

// Depth budget for the recursive walk. Real paths are 2 segments
// (`<owner|bird>/<uuid>.jpg`); the deepest shape ever written was the legacy
// `<userId>/baselines/<birdId>/droppings-*.jpeg` at 4. 8 is far above anything
// real, and bounds the walk if a bucket ever returns a cyclic or malformed
// listing so a deletion can't spin.
export const STORAGE_MAX_DEPTH = 8;
// Second, independent bound: total folders we will open. Depth alone doesn't
// stop a pathologically wide tree.
export const STORAGE_MAX_PREFIXES = 10_000;

/** One object we could not remove. Logged so an operator can finish the job. */
export type SweepFailure = { bucket: string; path: string; reason: string };

// Supabase returns folders inside a listing as placeholder rows with a null id
// (real objects always carry one). This is the only way to tell them apart.
function isFolderRow(row: { id?: string | null }): boolean {
  return row.id == null;
}

/**
 * Delete every object under `<prefix>/` in a bucket, at ANY depth.
 *
 * `.list()` is NOT recursive: it returns the immediate children of one prefix,
 * with sub-folders as null-id placeholder rows. The previous version pushed
 * those placeholder names straight into `.remove()`, which silently no-ops on a
 * path that isn't an object — so anything nested survived deletion while the
 * sweep reported success. That is how
 * `bird-photos/<userId>/baselines/<birdId>/droppings-*.jpeg` outlived an
 * account deletion. We now walk the tree.
 *
 * Never throws for a per-object or per-listing failure: it returns them. The
 * caller decides whether a failure is fatal — account deletion must finish
 * (an undeletable file must not strand a user with a live account), while
 * single-bird deletion stays fail-closed.
 */
export async function deleteAllUnderPrefix(
  storage: SweepStorage,
  bucket: string,
  prefix: string,
  pageSize: number = STORAGE_LIST_PAGE_SIZE,
  /** Paths under the prefix that must survive (still used by a row that
   *  outlives the person, e.g. a Today's idea photo an admin uploaded). */
  keep: ReadonlySet<string> = new Set(),
): Promise<{ deleted: number; kept: number; failures: SweepFailure[] }> {
  const failures: SweepFailure[] = [];
  if (!SWEEP_PREFIX_RE.test(prefix)) {
    failures.push({ bucket, path: prefix, reason: "refused: a sweep starts only from one user or bird id" });
    return { deleted: 0, kept: 0, failures };
  }
  const bucketApi = storage.from(bucket);
  const paths: string[] = [];
  let kept = 0;

  // Breadth-first over prefixes. Collect every object first, remove after, so
  // deletions never shift the offsets we're still reading.
  const queue: Array<{ prefix: string; depth: number }> = [{ prefix, depth: 0 }];
  let opened = 0;

  while (queue.length) {
    const { prefix: dir, depth } = queue.shift()!;
    if (++opened > STORAGE_MAX_PREFIXES) {
      failures.push({ bucket, path: dir, reason: `walk stopped: more than ${STORAGE_MAX_PREFIXES} folders` });
      break;
    }

    for (let offset = 0; ; ) {
      const { data: page, error } = await bucketApi.list(dir, { limit: pageSize, offset });
      if (error) {
        failures.push({ bucket, path: dir, reason: `list failed: ${error.message}` });
        break;
      }
      const rows = page ?? [];
      for (const row of rows) {
        const full = `${dir}/${row.name}`;
        if (isFolderRow(row)) {
          if (depth + 1 > STORAGE_MAX_DEPTH) {
            failures.push({ bucket, path: full, reason: `deeper than ${STORAGE_MAX_DEPTH} levels; not walked` });
          } else {
            queue.push({ prefix: full, depth: depth + 1 });
          }
        } else if (keep.has(full)) {
          kept++;
        } else {
          paths.push(full);
        }
      }
      if (rows.length < pageSize) break;
      offset += rows.length;
    }
  }

  let deleted = 0;
  for (let i = 0; i < paths.length; i += STORAGE_REMOVE_BATCH_SIZE) {
    const chunk = paths.slice(i, i + STORAGE_REMOVE_BATCH_SIZE);
    const { error } = await bucketApi.remove(chunk);
    if (!error) {
      deleted += chunk.length;
      continue;
    }
    // A batch error says nothing about WHICH path failed, and we need exact
    // paths in the log for anyone cleaning up. Retry one at a time to find out.
    for (const path of chunk) {
      const { error: one } = await bucketApi.remove([path]);
      if (one) failures.push({ bucket, path, reason: `remove failed: ${one.message}` });
      else deleted++;
    }
  }

  return { deleted, kept, failures };
}
