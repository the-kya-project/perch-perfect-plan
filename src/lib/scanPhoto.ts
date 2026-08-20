// Health-check scan photos. New scans upload the captured image to the private,
// bird-scoped `scan-photos` bucket (keyed "<bird_id>/<uuid>", mirroring
// journal-photos) and store the returned Storage path in photo_logs.photo_url.
// Legacy rows instead hold an inline base64 `data:` URI. Readers must handle
// BOTH — this module centralizes that dual-read so every read site branches
// identically, and provides the additive upload-with-fallback for the writer.
//
// Server-safe: no top-level browser-client import. `resolveScanPhotoUrls` takes
// the caller's storage (browser client for owner/household surfaces, service-role
// client for the token-based sitter path); the browser-only upload lazy-imports
// the client so this file can also be pulled into server functions.
import type { SupabaseClient } from "@supabase/supabase-js";

export const SCAN_PHOTOS_BUCKET = "scan-photos";

/** A stored photo_url is a legacy inline image when it is a `data:` URI; anything else is a Storage path. */
export function isInlineImage(value: string | null | undefined): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

type StorageApi = SupabaseClient["storage"];

/**
 * Resolve stored photo_url values to displayable URLs. Inline `data:` URIs pass
 * through unchanged; Storage paths are signed (1h) from the given storage.
 * Null/empty values are skipped. Returns a Map keyed by the ORIGINAL stored
 * value, so callers can do `map.get(photo_url) ?? photo_url`.
 */
export async function resolveScanPhotoUrls(
  storage: StorageApi,
  values: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const paths: string[] = [];
  for (const v of values) {
    if (!v) continue; // null/empty — no URL to resolve
    if (isInlineImage(v)) out.set(v, v);
    else paths.push(v);
  }
  const uniquePaths = Array.from(new Set(paths));
  if (uniquePaths.length) {
    const { data } = await storage.from(SCAN_PHOTOS_BUCKET).createSignedUrls(uniquePaths, 3600);
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
    }
  }
  return out;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Upload a (compressed) data URL to the bird's scan-photos folder; returns the Storage path. Browser-only. */
export async function uploadScanPhoto(birdId: string, dataUrl: string): Promise<string> {
  const { supabase } = await import("@/integrations/supabase/client");
  const blob = dataUrlToBlob(dataUrl);
  const path = `${birdId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(SCAN_PHOTOS_BUCKET).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/**
 * Upload the scan image and return the value to persist in photo_logs.photo_url.
 * On any upload failure, fall back to the inline `data:` URI (a scan that saves
 * in the old format beats one that doesn't save) and flag it, so the caller can
 * surface the fallback in telemetry. Additive — touches no existing row.
 */
export async function uploadScanPhotoOrInline(
  birdId: string,
  dataUrl: string,
): Promise<{ value: string; storedAsPath: boolean }> {
  try {
    const path = await uploadScanPhoto(birdId, dataUrl);
    return { value: path, storedAsPath: true };
  } catch (e) {
    console.error("[scan] scan-photo upload failed; storing inline data URL instead", e);
    return { value: dataUrl, storedAsPath: false };
  }
}
