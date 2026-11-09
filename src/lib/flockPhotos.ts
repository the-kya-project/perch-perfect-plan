// Community photos at their own shape (Flock only). Pure, so
// scripts/flock-shell.test.ts pins it.
//
// The rule, like Instagram's: a photo shows at its own shape, clamped between
// 4:5 (tallest) and 1.91:1 (widest). Inside those limits nothing is cropped.
// Beyond them the frame stops at the limit and the photo is cropped from the
// centre, except that a tall photo keeps more of its top (heads are usually up
// there). Width and height come from the upload (stored with the file), so the
// frame has the right shape before the image arrives.

export const TALLEST = 4 / 5;
export const WIDEST = 1.91;

export type PhotoSize = { width: number; height: number };
export type PhotoFrame = {
  /** width / height of the frame to draw. */
  ratio: number;
  /** CSS object-position for the image inside the frame (object-fit: cover). */
  position: string;
  /** True when the frame is narrower or wider than the photo, so some of it is cut. */
  cropped: boolean;
};

/** The frame for a photo of this size; unknown size → 4:3 until it loads. */
export function photoFrame(size: Partial<PhotoSize> | null | undefined): PhotoFrame {
  const w = Number(size?.width), h = Number(size?.height);
  if (!(w > 0) || !(h > 0)) return { ratio: 4 / 3, position: "50% 50%", cropped: false };
  const r = w / h;
  if (r < TALLEST) return { ratio: TALLEST, position: "50% 20%", cropped: true };
  if (r > WIDEST) return { ratio: WIDEST, position: "50% 50%", cropped: true };
  return { ratio: r, position: "50% 50%", cropped: false };
}

/** Width and height from the start of a JPEG (its SOF marker), or null. Used
 *  for photos uploaded before sizes were stored. */
export function jpegSize(bytes: Uint8Array): PhotoSize | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    const marker = bytes[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return width > 0 && height > 0 ? { width, height } : null;
    }
    if (len < 2) return null;
    i += 2 + len;
  }
  return null;
}
