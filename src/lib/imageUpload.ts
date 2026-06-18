// Client-side image preprocessing for bird photos. Bird photos are stored as
// data URLs and only ever shown as card heroes / avatars, so we downscale and
// re-encode before upload: phones routinely produce 3–5 MB+ images (and HEICs)
// that don't need to ship at full resolution.

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB hard limit (safety net)
const MAX_EDGE = 1600; // longest edge after resize
const TARGET_BYTES = 1.5 * 1024 * 1024; // aim for ~1.5 MB or less

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
}

// Approximate decoded byte size of a base64 data URL.
export function dataUrlBytes(dataUrl: string): number {
  const i = dataUrl.indexOf(",");
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

// Resize + re-encode a selected image to a web-friendly JPEG data URL.
// - Applies EXIF orientation and strips metadata (canvas re-encode handles both).
// - Decodes HEIC/HEIF where the browser supports it natively (iOS Safari does);
//   if the browser can't decode the format, falls back to the original file so
//   the upload still proceeds (subject to the size limit checked by the caller).
export async function compressImageToDataUrl(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return readAsDataUrl(file);
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    let quality = 0.82;
    let out = canvas.toDataURL("image/jpeg", quality);
    while (dataUrlBytes(out) > TARGET_BYTES && quality > 0.4) {
      quality -= 0.12;
      out = canvas.toDataURL("image/jpeg", quality);
    }
    return out;
  } catch {
    // Undecodable in this browser (e.g. HEIC outside Safari). Keep the original;
    // the caller enforces MAX_UPLOAD_BYTES. (A heic2any-style decoder would be
    // needed for cross-browser HEIC conversion — not added to avoid the dep.)
    return readAsDataUrl(file);
  }
}
