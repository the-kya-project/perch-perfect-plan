// Finding files left in Supabase Storage after their owner (an account or a
// bird) was deleted. Pure, so scripts/storage-orphans.test.ts pins it; the
// cleanup script (scripts/storage-orphans.ts) feeds it a live listing.
//
// A file is an orphan only when ALL of these hold:
//   1. its bucket is keyed by owner (OWNER_KEY below; any other bucket, such
//      as flock-library, is never touched),
//   2. its first folder is an id (anything else is left alone and reported),
//   3. no account or bird with that id exists at the moment of the run, and
//   4. no row anywhere still points at it (REFERENCE_COLUMNS: birds, care
//      plans, journal entries and attachments, moments, scans, posts, comments,
//      profiles, ideas, events, journeys' photos, the library…). Matching is
//      deliberately loose: a reference that merely CONTAINS the path protects
//      the file, so a full URL or a bucket-prefixed value still counts.

export type StoredObject = { bucket: string; name: string; size: number; createdAt: string | null };

/** How each bucket's first folder is keyed. */
export const OWNER_KEY: Record<string, "account" | "bird"> = {
  "bird-photos": "account",
  "flock-avatars": "account",
  "flock-posts": "account",
  "journal-photos": "bird",
  "scan-photos": "bird",
  "journal-attachments": "bird",
};

/** Every column that can hold a storage path (checked against production's
 *  schema, Nov 2026: every public column named like path/photo/url/clip/file/
 *  attachment/cover that holds a file). A new one belongs here. */
export const REFERENCE_COLUMNS: ReadonlyArray<{ table: string; column: string; array?: boolean }> = [
  { table: "birds", column: "photo_url" },
  { table: "anchor_photos", column: "photo_path" },
  { table: "photo_logs", column: "photo_url" },
  { table: "journal_entries", column: "photo_path" },
  { table: "journal_attachments", column: "storage_path" },
  { table: "moments", column: "photo_path" },
  { table: "past_birds", column: "photo_thumb" },
  { table: "care_plans", column: "baseline_droppings_path" },
  { table: "care_plans", column: "baseline_clip_path" },
  { table: "care_plans", column: "clip_anything_else_path" },
  { table: "care_plans", column: "clip_bedtime_path" },
  { table: "care_plans", column: "clip_food_prep_path" },
  { table: "care_plans", column: "clip_food_water_path" },
  { table: "care_plans", column: "clip_locations_path" },
  { table: "care_plans", column: "clip_step_up_path" },
  { table: "care_plans", column: "clip_targeting_path" },
  { table: "care_plans", column: "clip_toys_foraging_path" },
  { table: "flock_profiles", column: "photo_path" },
  { table: "flock_posts", column: "photo_paths", array: true },
  { table: "flock_comments", column: "photo_path" },
  // Deleted posts and comments, held for 180 days (backlog 1.3).
  { table: "flock_deleted_items", column: "photo_paths", array: true },
  { table: "flock_idea_tries", column: "photo_path" },
  { table: "flock_ideas", column: "photo_path" },
  { table: "flock_events", column: "photo_path" },
  { table: "library_resources", column: "cover_path" },
  { table: "library_resources", column: "attachment_path" },
];

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OrphanPlan = {
  orphans: StoredObject[];
  /** Owner gone, but a row still points at the file: kept. */
  protectedByReference: StoredObject[];
  /** Files left alone without a decision, and why. */
  skipped: Array<{ bucket: string; reason: string; count: number }>;
  checked: number;
};

export function findOrphans(input: {
  objects: StoredObject[];
  liveAccountIds: Iterable<string>;
  liveBirdIds: Iterable<string>;
  references: Iterable<string | null | undefined>;
}): OrphanPlan {
  const accounts = new Set([...input.liveAccountIds].map((s) => s.toLowerCase()));
  const birds = new Set([...input.liveBirdIds].map((s) => s.toLowerCase()));
  const refs = [...input.references].filter((r): r is string => typeof r === "string" && r.length > 0);
  const exact = new Set(refs);
  const referenced = (name: string) => exact.has(name) || refs.some((r) => r.includes(name));

  const orphans: StoredObject[] = [];
  const protectedByReference: StoredObject[] = [];
  const skips = new Map<string, number>();
  const skip = (bucket: string, reason: string) => skips.set(`${bucket}\u0000${reason}`, (skips.get(`${bucket}\u0000${reason}`) ?? 0) + 1);

  for (const o of input.objects) {
    const kind = OWNER_KEY[o.bucket];
    if (!kind) { skip(o.bucket, "bucket isn't keyed by owner; never cleaned here"); continue; }
    const top = o.name.split("/")[0] ?? "";
    if (!ID_RE.test(top) || !o.name.includes("/")) { skip(o.bucket, "first folder isn't an account or bird id"); continue; }
    const alive = kind === "account" ? accounts.has(top.toLowerCase()) : birds.has(top.toLowerCase());
    if (alive) continue;
    if (referenced(o.name)) { protectedByReference.push(o); continue; }
    orphans.push(o);
  }

  const byPlace = (a: StoredObject, b: StoredObject) => a.bucket.localeCompare(b.bucket) || a.name.localeCompare(b.name);
  return {
    orphans: orphans.sort(byPlace),
    protectedByReference: protectedByReference.sort(byPlace),
    skipped: [...skips].map(([k, count]) => { const [bucket, reason] = k.split("\u0000"); return { bucket, reason, count }; })
      .sort((a, b) => a.bucket.localeCompare(b.bucket)),
    checked: input.objects.length,
  };
}

/** The approved list, intersected with what is still an orphan now. Only
 *  these are ever deleted: anything approved that has since gained an owner
 *  or a reference (or vanished) is left alone. */
export function approvedStillOrphaned(approved: Array<{ bucket: string; name: string }>, now: StoredObject[]): StoredObject[] {
  const ok = new Set(approved.map((a) => `${a.bucket}\u0000${a.name}`));
  return now.filter((o) => ok.has(`${o.bucket}\u0000${o.name}`));
}

/** Sizes in decimal units (1 MB = 1,000,000 bytes), like Supabase's dashboard. */
export function formatBytes(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} MB`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} KB`;
  return `${n} B`;
}
