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

/** A display URL plus the full-size original to fall back to if it fails to load. */
export type SignedPhoto = { url: string; original: string };

/**
 * Batch-resolve many bird photo values for display. When `width` is given, the
 * `url` is a Supabase image-transform URL sized for the display slot (much
 * smaller bytes); `original` is the untransformed signed URL kept as an onError
 * fallback. Without `width`, both are the plain signed URL.
 *
 * Returns a map keyed by the ORIGINAL value. Legacy data:/absolute URLs are
 * echoed back unchanged.
 */
export async function signBirdPhotos(
  values: Array<string | null | undefined>,
  opts?: { width?: number; quality?: number },
): Promise<Map<string, SignedPhoto>> {
  const out = new Map<string, SignedPhoto>();
  const paths: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (isStoragePath(v)) paths.push(v);
    else out.set(v, { url: v, original: v }); // passthrough (legacy data: URL)
  }
  if (!paths.length) return out;

  // Originals in one batched round-trip (the fallback source).
  const originals = new Map<string, string>();
  const { data: batch } = await supabase.storage.from("bird-photos").createSignedUrls(paths, 3600);
  for (const row of batch ?? []) {
    if (row.path && row.signedUrl) originals.set(row.path, row.signedUrl);
  }

  const width = opts?.width;
  const quality = opts?.quality ?? 60;
  await Promise.all(
    paths.map(async (p) => {
      const original = originals.get(p) ?? "";
      let url = original;
      if (width) {
        // createSignedUrls (batch) doesn't accept transforms, so sign per-path
        // with the transform. These are tiny (no image bytes) and cached.
        const { data } = await supabase.storage
          .from("bird-photos")
          .createSignedUrl(p, 3600, { transform: { width, quality } });
        if (data?.signedUrl) url = data.signedUrl;
      }
      if (url) out.set(p, { url, original: original || url });
    }),
  );
  return out;
}
