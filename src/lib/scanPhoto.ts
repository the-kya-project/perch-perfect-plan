// Health-scan photos live in the private `scan-photos` Storage bucket. We store
// the object PATH in photo_logs.photo_url (e.g. "<birdId>/<uuid>.jpg") and
// resolve it to a short-lived signed URL for display — keeping megabyte-sized
// base64 image bytes OUT of Postgres rows. Mirrors lib/journalPhoto.ts.
//
// Backward compatibility: older rows stored the image inline as a base64 `data:`
// URL. Those are passed through unchanged by the resolvers, so legacy scans keep
// rendering until the backfill (scripts/backfill-scan-photos.mjs) migrates them.

import { supabase } from "@/integrations/supabase/client";

const BUCKET = "scan-photos";

/** True when the value is a Storage object path (not a legacy data:/absolute URL). */
export function isScanStoragePath(value: string | null | undefined): value is string {
  return !!value && !value.startsWith("data:") && !value.startsWith("http");
}

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

/** Upload a (client-compressed) data URL to the bird's scan-photos folder and
 *  return the stored object path. First path segment MUST be the bird id for the
 *  bucket's RLS (has_bird_access on folder[1]). */
export async function uploadScanPhoto(birdId: string, dataUrl: string): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const path = `${birdId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Batch-resolve scan photo values to displayable URLs (signed, 1h). Legacy
 *  data:/absolute URLs are echoed back unchanged. Keyed by the original value. */
export async function signScanPhotos(values: Array<string | null | undefined>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const paths: string[] = [];
  for (const v of values) {
    if (!v) continue;
    if (isScanStoragePath(v)) paths.push(v);
    else out.set(v, v); // legacy passthrough
  }
  const unique = Array.from(new Set(paths));
  if (unique.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(unique, 3600);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
    }
  }
  return out;
}
