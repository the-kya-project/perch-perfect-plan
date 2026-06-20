// Bird profile photos live in the private `bird-photos` Storage bucket. We store
// the object PATH in birds.photo_url (e.g. "<ownerId>/<uuid>.jpg") and resolve it
// to a short-lived signed URL for display. This keeps the megabyte-sized image
// bytes OUT of Postgres rows, so list queries (the dashboard) stay tiny and the
// browser/CDN can cache the actual image.
//
// Backward compatibility: older birds stored the image inline as a base64
// `data:` URL. `isStoragePath` returns false for those, and the resolvers pass
// them through unchanged, so legacy birds keep rendering until backfilled.

import { supabase } from "@/integrations/supabase/client";

/** True when `photo_url` is a Storage object path (not a legacy data: URL or absolute URL). */
export function isStoragePath(value: string | null | undefined): value is string {
  return !!value && !value.startsWith("data:") && !value.startsWith("http");
}

/** Convert a base64 data URL into a Blob for upload. */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const body = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "image/jpeg";
  const bytes = atob(body);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/**
 * Upload a compressed bird photo (provided as a data URL — the same value the
 * editor uses for its live preview) to the private bucket and return the stored
 * object path. The first path segment MUST be the owner id to satisfy the
 * bucket's RLS policies.
 */
export async function uploadBirdPhoto(ownerId: string, dataUrl: string): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const path = `${ownerId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage
    .from("bird-photos")
    .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

/**
 * Given a bird's `photo_url`, return the value to persist in the DB. If it's a
 * fresh data: URL (a newly picked photo), upload it and return the Storage path;
 * if it's already a path or empty, return it unchanged. Best-effort: on upload
 * failure it falls back to persisting the data URL so the save still succeeds.
 */
export async function persistBirdPhoto(
  ownerId: string,
  photoUrl: string | null | undefined,
): Promise<string | null> {
  if (!photoUrl) return null;
  if (!photoUrl.startsWith("data:")) return photoUrl; // already a path/URL
  try {
    return await uploadBirdPhoto(ownerId, photoUrl);
  } catch {
    return photoUrl; // keep working even if Storage upload fails
  }
}

/** Resolve one bird photo value to a displayable URL (owner client, RLS-signed). */
export async function signBirdPhoto(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (!isStoragePath(value)) return value; // legacy data: URL or absolute URL
  const { data } = await supabase.storage.from("bird-photos").createSignedUrl(value, 3600);
  return data?.signedUrl ?? null;
}

/**
 * Batch-resolve many bird photo values to displayable URLs in one round-trip.
 * Returns a map keyed by the ORIGINAL value so callers can look up per bird.
 * Legacy data:/absolute URLs are echoed back unchanged.
 */
export async function signBirdPhotos(
  values: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const paths: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (isStoragePath(v)) paths.push(v);
    else out.set(v, v); // passthrough
  }
  if (paths.length) {
    const { data } = await supabase.storage.from("bird-photos").createSignedUrls(paths, 3600);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
    }
  }
  return out;
}
