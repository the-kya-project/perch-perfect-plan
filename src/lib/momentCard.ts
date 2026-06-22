// Render a moment to a shareable branded image (canvas → PNG) and hand it to the
// OS share sheet, or save it. No backend, no community target — just an image.

const W = 1080;
const H = 1350; // 4:5, looks good in a share sheet / on a feed

function drawSageGradient(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#7fa890");
  g.addColorStop(1, "#cdeab0");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawCover(ctx: CanvasRenderingContext2D, img: ImageBitmap) {
  const scale = Math.max(W / img.width, H / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

/** Render the keepsake card to a PNG blob. Photo is loaded via fetch→bitmap so a
 *  cross-origin signed URL doesn't taint the canvas; falls back to the sage
 *  gradient if there's no photo or it can't be loaded. */
export async function renderMomentCard(opts: { photoUrl?: string | null; title: string; context: string }): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not available.");

  let drewPhoto = false;
  if (opts.photoUrl) {
    try {
      const resp = await fetch(opts.photoUrl);
      const blob = await resp.blob();
      const bmp = await createImageBitmap(blob);
      drawCover(ctx, bmp);
      drewPhoto = true;
    } catch { /* fall through to gradient */ }
  }
  if (!drewPhoto) drawSageGradient(ctx);

  // Dark-green bottom gradient so the title stays legible over any photo.
  const grad = ctx.createLinearGradient(0, H * 0.52, 0, H);
  grad.addColorStop(0, "rgba(26,61,46,0)");
  grad.addColorStop(1, "rgba(26,61,46,0.94)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Brand mark, top-right, letterspaced.
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = "600 26px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "right";
  try { (ctx as any).letterSpacing = "5px"; } catch { /* not supported — fine */ }
  ctx.fillText("THE KYA PROJECT", W - 56, 84);
  try { (ctx as any).letterSpacing = "0px"; } catch { /* ignore */ }

  // Title (weight 500) + context line.
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.font = "500 76px ui-sans-serif, system-ui, -apple-system, sans-serif";
  const lines = wrap(ctx, opts.title, W - 112);
  let y = H - 96 - (lines.length - 1) * 84;
  for (const line of lines) { ctx.fillText(line, 56, y); y += 84; }
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "400 38px ui-sans-serif, system-ui, -apple-system, sans-serif";
  ctx.fillText(opts.context, 56, H - 56);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't render the card."))), "image/png"),
  );
}

/** Share the card via the native share sheet (with the image file), falling back
 *  to a download ("save to your photos"). Returns nothing; toasts handled by caller. */
export async function shareMomentCard(opts: { photoUrl?: string | null; title: string; context: string; fileName?: string }): Promise<"shared" | "saved"> {
  const blob = await renderMomentCard(opts);
  const file = new File([blob], opts.fileName ?? "moment.png", { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: opts.title });
    return "shared";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "saved";
}
