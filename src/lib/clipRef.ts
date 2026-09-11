// Client-safe helpers for clip references. A clip column (clip_*_path,
// baseline_clip_path) now holds EITHER a legacy Supabase Storage path OR a
// Cloudflare Stream reference of the form "cfstream:<uid>". No secrets here.

export const CF_PREFIX = "cfstream:";

// Every care_plans column that can hold a clip reference. Kept explicit (not
// derived) so a new clip column is a deliberate edit rather than a silent leak.
// Shared by the media purge (what to delete) and the clip server functions'
// ownership check (what to authorize against) — the two must never disagree,
// or a real owner gets refused for a clip in a column the check didn't know.
export const CLIP_COLUMNS = [
  "baseline_clip_path",
  "clip_anything_else_path",
  "clip_bedtime_path",
  "clip_food_prep_path",
  "clip_food_water_path",
  "clip_locations_path",
  "clip_step_up_path",
  "clip_targeting_path",
  "clip_toys_foraging_path",
] as const;

/** A Cloudflare Stream video uid: 32 hex characters. */
export const CF_UID_RE = /^[a-f0-9]{32}$/i;

export function cfRef(uid: string): string {
  return `${CF_PREFIX}${uid}`;
}

export function isCfClip(ref: string | null | undefined): boolean {
  return !!ref && ref.startsWith(CF_PREFIX);
}

export function cfUid(ref: string): string {
  return ref.startsWith(CF_PREFIX) ? ref.slice(CF_PREFIX.length) : ref;
}

/** A playback URL that should render in an <iframe> (Cloudflare Stream player). */
export function isStreamUrl(url: string | null | undefined): boolean {
  return !!url && /(videodelivery\.net|cloudflarestream\.com)/.test(url);
}
