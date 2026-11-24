import i18next from "i18next";
import { wrap } from "@/lib/momentCard";

// Journey share cards (backlog 1.7): a reached milestone, a finished journey,
// or day one vs. now, drawn on a canvas as a PNG for Instagram or anywhere
// else. The Moments card's approach (momentCard.ts) in the Flock's colors:
// a forest card, the photo in a rounded frame, a lime eyebrow, a Newsreader
// title and the "Kya & Co. · thekyaproject.com" mark at the bottom.
//
// Photos are decoded to bitmaps and redrawn, and the card is a fresh PNG, so
// nothing from the original files (EXIF, GPS, camera details) reaches it.

export type CardSize = "post" | "story";
export const CARD_SIZES: Record<CardSize, { w: number; h: number }> = {
  post: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};
export const CARD_MARK = "Kya & Co. · thekyaproject.com";
export type CardKind = "milestone" | "finished" | "compare";

/** Who may make a card: only the bird's household (`is_mine`), never anyone
 *  else, so a "Just me" journey's card is only ever made inside it. Day one vs.
 *  now also needs both clips' pictures. */
export function canMakeJourneyCard(o: { kind: CardKind; isMine: boolean; comparePhotos?: number }): boolean {
  if (!o.isMine) return false;
  return o.kind !== "compare" || (o.comparePhotos ?? 0) >= 2;
}

/** "echo-step-up-post.png": the bird (when shown) and the journey, letters and digits only. */
export function cardFileName(parts: (string | null | undefined)[], size: CardSize): string {
  const slug = parts.filter(Boolean).join(" ").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${slug || "journey"}-${size}.png`;
}

export type CardText = {
  eyebrow: string;
  title: string;
  /** "Reached Nov 22" (milestone, finished); none for day one vs. now. */
  date?: string | null;
  /** The member's own name, only when they turned it on. */
  member?: string | null;
  /** Day one vs. now: the date under each photo. */
  photoDates?: [string, string];
};

// Sizes at 1080 wide: the mockup's 280-wide card times 3.86.
const P = 62;
const GAP = 34;
const EYEBROW = 40;
const TITLE = 84;
const TITLE_LH = 96;
const SMALL = 38;
const SMALL_LH = 48;
const RADIUS = 44;

export type Rect = { x: number; y: number; w: number; h: number };
export type CardLayout = {
  photos: Rect[];
  eyebrowY: number;
  titleY: number;
  dateY: number | null;
  photoDatesY: number | null;
  memberY: number | null;
  markY: number;
};

/** Where everything goes, top to bottom (baselines for text). A single photo
 *  fills what the text leaves; day one vs. now puts the text first and two
 *  9:16-or-shorter photos side by side under it. Pure, so it's tested. */
export function layoutJourneyCard(o: { kind: CardKind; size: CardSize; titleLines: number; hasDate: boolean; hasMember: boolean }): CardLayout {
  const { w: W, h: H } = CARD_SIZES[o.size];
  const titleH = Math.max(1, o.titleLines) * TITLE_LH;
  const markY = H - P;
  const memberY = o.hasMember ? markY - SMALL_LH : null;
  const bottomTop = (memberY ?? markY) - SMALL; // top of the lowest text block
  if (o.kind === "compare") {
    const eyebrowY = P + EYEBROW;
    const titleY = eyebrowY + GAP + TITLE;
    const top = titleY + (titleH - TITLE_LH) + GAP + 18;
    const each = (W - P * 2 - GAP / 2) / 2;
    const room = bottomTop - GAP - SMALL_LH - GAP - top;
    const h = Math.max(200, Math.min(room, Math.round(each * 16 / 9)));
    return {
      photos: [{ x: P, y: top, w: each, h }, { x: P + each + GAP / 2, y: top, w: each, h }],
      eyebrowY, titleY, dateY: null, photoDatesY: top + h + SMALL_LH, memberY, markY,
    };
  }
  // One photo on top, then eyebrow, title and date, then the mark.
  const textH = EYEBROW + GAP + titleH + (o.hasDate ? SMALL_LH + 6 : 0);
  const photoH = bottomTop - GAP * 2 - textH - P;
  const eyebrowY = P + photoH + GAP + EYEBROW;
  const titleY = eyebrowY + GAP + TITLE;
  const dateY = o.hasDate ? titleY + (titleH - TITLE_LH) + SMALL_LH + 6 : null;
  return { photos: [{ x: P, y: P, w: W - P * 2, h: photoH }], eyebrowY, titleY, dateY, photoDatesY: null, memberY, markY };
}

const SANS = "'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif";
const SERIF_FONT = "'Newsreader', Georgia, serif";
const FOREST = "#1a3d2e";
const LIME = "#cdeab0";

function roundedRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const rad = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + rad, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad);
  ctx.closePath();
}

/** A photo, cropped to fill its frame from the centre (tall ones keep a bit more of the top). */
function drawPhoto(ctx: CanvasRenderingContext2D, img: ImageBitmap | null, r: Rect) {
  ctx.save();
  roundedRect(ctx, r, RADIUS);
  ctx.clip();
  if (img) {
    const scale = Math.max(r.w / img.width, r.h / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const y = h > r.h ? r.y - (h - r.h) * 0.35 : r.y + (r.h - h) / 2;
    ctx.drawImage(img, r.x + (r.w - w) / 2, y, w, h);
  } else {
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    g.addColorStop(0, "#3b5d4c");
    g.addColorStop(1, "#12291f");
    ctx.fillStyle = g;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

/** Load a photo as a bitmap through fetch, so a signed cross-origin link
 *  doesn't taint the canvas. Null when there's none or it won't load. */
async function loadBitmap(url: string | null | undefined): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    return await createImageBitmap(await resp.blob());
  } catch { return null; }
}

function letterSpacing(ctx: CanvasRenderingContext2D, v: string) {
  try { (ctx as any).letterSpacing = v; } catch { /* not supported: fine */ }
}

/** Render the card to a PNG. `photos`: one URL (milestone, finished) or two
 *  (day one vs. now, oldest first); a missing one shows the forest gradient. */
export async function renderJourneyCard(o: { kind: CardKind; size: CardSize; photos: (string | null | undefined)[]; text: CardText }): Promise<Blob> {
  const { w: W, h: H } = CARD_SIZES[o.size];
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available.");
  try {
    await Promise.all([document.fonts?.load(`700 ${TITLE}px Newsreader`), document.fonts?.load(`700 ${EYEBROW}px 'DM Sans'`)]);
  } catch { /* the fallbacks are fine */ }

  ctx.fillStyle = FOREST;
  ctx.fillRect(0, 0, W, H);

  ctx.font = `700 ${TITLE}px ${SERIF_FONT}`;
  const titleLines = wrap(ctx, o.text.title, W - P * 2, o.kind === "compare" ? 2 : 3);
  const layout = layoutJourneyCard({ kind: o.kind, size: o.size, titleLines: titleLines.length, hasDate: !!o.text.date, hasMember: !!o.text.member });
  const bitmaps = await Promise.all(layout.photos.map((_, i) => loadBitmap(o.photos[i])));
  layout.photos.forEach((r, i) => drawPhoto(ctx, bitmaps[i], r));

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = LIME;
  ctx.font = `700 ${EYEBROW}px ${SANS}`;
  letterSpacing(ctx, "3px");
  ctx.fillText(wrap(ctx, o.text.eyebrow.toUpperCase(), W - P * 2, 1)[0] ?? "", P, layout.eyebrowY);
  letterSpacing(ctx, "0px");

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 ${TITLE}px ${SERIF_FONT}`;
  titleLines.forEach((line, i) => ctx.fillText(line, P, layout.titleY + i * TITLE_LH));

  ctx.fillStyle = LIME;
  ctx.font = `500 ${SMALL}px ${SANS}`;
  if (layout.dateY !== null && o.text.date) ctx.fillText(o.text.date, P, layout.dateY);
  if (layout.photoDatesY !== null && o.text.photoDates) {
    ctx.fillText(o.text.photoDates[0], layout.photos[0].x + 4, layout.photoDatesY);
    ctx.textAlign = "right";
    const r = layout.photos[1];
    ctx.fillText(o.text.photoDates[1], r.x + r.w - 4, layout.photoDatesY);
    ctx.textAlign = "left";
  }
  if (layout.memberY !== null && o.text.member) {
    ctx.fillStyle = "#ffffff";
    ctx.fillText(wrap(ctx, o.text.member, W - P * 2, 1)[0] ?? "", P, layout.memberY);
  }
  ctx.fillStyle = LIME;
  ctx.font = `400 ${SMALL}px ${SANS}`;
  ctx.fillText(CARD_MARK, P, layout.markY);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(i18next.t("momentCardImage.renderFailed", "Couldn't render the card.")))), "image/png"),
  );
}
