// Client-safe helpers for clip references. A clip column (clip_*_path,
// baseline_clip_path) now holds EITHER a legacy Supabase Storage path OR a
// Cloudflare Stream reference of the form "cfstream:<uid>". No secrets here.

export const CF_PREFIX = "cfstream:";

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
