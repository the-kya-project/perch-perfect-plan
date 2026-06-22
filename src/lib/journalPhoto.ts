// Journal photo storage helpers. Photos live in the private, bird-scoped
// `journal-photos` bucket from the schema foundation, keyed "<bird_id>/<uuid>".
// Storage RLS (has_bird_access on the bird_id folder) gates read/write, so only
// users with access to the bird can upload or view them.

import { supabase } from "@/integrations/supabase/client";

const BUCKET = "journal-photos";

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/data:(.*?);base64/)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** Upload a (already-compressed) data URL to the bird's journal folder. */
export async function uploadJournalPhoto(birdId: string, dataUrl: string): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const path = `${birdId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Batch-resolve journal photo paths to signed, displayable URLs (1h). */
export async function signJournalPhotos(paths: Array<string | null | undefined>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const real = Array.from(new Set(paths.filter(Boolean) as string[]));
  if (!real.length) return out;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(real, 3600);
  for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}

export async function removeJournalPhoto(path: string): Promise<void> {
  try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* best-effort */ }
}
