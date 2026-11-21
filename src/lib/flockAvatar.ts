// Community profile photos: private 'flock-avatars' bucket, "<user_id>/<uuid>.jpg".
//
// Every photo is redrawn onto a canvas and saved as a new JPEG before upload.
// A canvas keeps only pixels, so EXIF (GPS location, camera, time) never
// leaves the phone. Unlike compressImageToDataUrl (care photos), this never
// falls back to the original file: a photo the browser can't decode (HEIC
// outside Safari) is refused with a message instead of uploaded as-is.
import { supabase } from "@/integrations/supabase/client";

const MAX_EDGE = 800;
const MAX_BYTES = 2 * 1024 * 1024; // the bucket's limit

export class AvatarError extends Error {}

/** Redraw a photo as a new JPEG, at most `maxEdge` px on the long edge and
 *  `maxBytes` in size. Pixels only: EXIF (GPS included) never survives. */
export async function reencodeJpeg(file: File, maxEdge: number, maxBytes: number): Promise<Blob> {
  return (await reencodeJpegSized(file, maxEdge, maxBytes)).blob;
}

/** reencodeJpeg, also returning the new JPEG's width and height. */
export async function reencodeJpegSized(file: File, maxEdge: number, maxBytes: number): Promise<{ blob: Blob; width: number; height: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    throw new AvatarError("We couldn't read that photo. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close?.(); throw new AvatarError("We couldn't read that photo. Try a JPEG or PNG."); }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const q of [0.85, 0.75, 0.6, 0.45]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size <= maxBytes) return { blob, width: canvas.width, height: canvas.height };
  }
  throw new AvatarError("That photo is too large. Try a smaller one.");
}

/** Re-encode to a square-ish JPEG, at most 800px on the long edge. */
export function reencodeAvatar(file: File): Promise<Blob> {
  return reencodeJpeg(file, MAX_EDGE, MAX_BYTES);
}

/** Upload a re-encoded photo; returns its storage path. */
export async function uploadAvatar(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("flock-avatars").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new AvatarError("We couldn't save that photo. Try again.");
  return path;
}

/** Remove an old photo after a new one (or none) is saved. Best effort. */
export async function removeAvatar(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await supabase.storage.from("flock-avatars").remove([path]).catch(() => undefined);
}
