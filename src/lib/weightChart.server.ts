// Weight charts for the emails, rendered to PNG on the server.
//
// WHY A PNG. A line between points needs a diagonal, which table cells cannot
// draw. Gmail renders neither inline <svg> nor a data: URI, so the only way to
// put a real chart in an email that most people will see is a raster image at a
// URL. The SVG here is written by hand — the shapes are simple enough that a
// charting library would be more to go wrong, not less — and rasterised with
// resvg compiled to WASM, which has no native binary to fail on a cold start.
//
// The chart states numbers. No trend line, no arrows, no colour that means
// good or bad: the axis is labelled with real grams so it is plain that it does
// not start at zero, and the reader draws their own conclusion.
import { initWasm, Resvg } from "@resvg/resvg-wasm";

export type Point = { day: number; g: number };

const FOREST = "#1a3d2e";
const LIME = "#cdeab0";
const CREAM = "#f4f1e8";
const MUTED = "#5f5e5a";

// Display size; the PNG is rendered at 2x for sharp screens.
const W = 240;
const H = 120;
const PAD = { top: 10, right: 10, bottom: 18, left: 34 };

// The WASM and the font are FETCHED from our own static assets, not read off
// disk. node_modules/ and src/ do not exist in a serverless bundle — reading
// from them worked locally and threw in production, where the only thing that
// showed was a 404 on every chart. public/chart/ is deployed with the app, so
// the files are always there and always the versions this build expects.
//
// Both are cached per warm instance, so a container pays for them once.
const ASSET_BASE = () => process.env.EMAIL_ASSET_BASE || "https://app.thekyaproject.com";

let ready: Promise<void> | null = null;
function wasmReady(base: string): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const res = await fetch(`${base}/chart/resvg.wasm`);
      if (!res.ok) throw new Error(`resvg wasm fetch failed: ${res.status}`);
      await initWasm(await res.arrayBuffer());
    })().catch((e) => {
      ready = null; // let a later request retry rather than poisoning the instance
      throw e;
    });
  }
  return ready;
}

let fontCache: Uint8Array | null = null;
async function font(base: string): Promise<Uint8Array> {
  if (!fontCache) {
    const res = await fetch(`${base}/chart/DMSans-Regular.ttf`);
    if (!res.ok) throw new Error(`font fetch failed: ${res.status}`);
    fontCache = new Uint8Array(await res.arrayBuffer());
  }
  return fontCache;
}

/** Round a gram range outward to friendly gridlines. */
function ticks(lo: number, hi: number): number[] {
  if (hi === lo) return [lo];
  const rough = (hi - lo) / 3;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? mag * 10;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step / 2; v += step) if (v >= lo - step) out.push(Math.round(v));
  return out.length >= 2 ? out : [lo, hi];
}

export function chartSvg(o: { points: Point[]; days: number; axisStart: string; axisEnd: string }): string {
  const pts = [...o.points].sort((a, b) => a.day - b.day);
  const gs = pts.map((p) => p.g);
  const rawLo = Math.min(...gs);
  const rawHi = Math.max(...gs);
  // A margin so points never sit on the frame, and a usable band when every
  // reading is identical.
  const pad = rawHi === rawLo ? Math.max(1, Math.round(rawLo * 0.01)) : (rawHi - rawLo) * 0.15;
  const lo = rawLo - pad;
  const hi = rawHi + pad;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (day: number) => PAD.left + ((day - 1) / Math.max(1, o.days - 1)) * plotW;
  const y = (g: number) => PAD.top + ((hi - g) / (hi - lo)) * plotH;

  const grid = ticks(rawLo, rawHi)
    .filter((t) => t >= lo && t <= hi)
    .map(
      (t) =>
        `<line x1="${PAD.left}" y1="${y(t).toFixed(1)}" x2="${W - PAD.right}" y2="${y(t).toFixed(1)}" stroke="#ddd6c4" stroke-width="1"/>` +
        `<text x="${PAD.left - 5}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end" font-family="DM Sans" font-size="8" fill="${MUTED}">${t}</text>`,
    )
    .join("");

  const line =
    pts.length > 1
      ? `<polyline fill="none" stroke="${FOREST}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" points="${pts
          .map((p) => `${x(p.day).toFixed(1)},${y(p.g).toFixed(1)}`)
          .join(" ")}"/>`
      : "";

  const dots = pts
    .map((p) => `<circle cx="${x(p.day).toFixed(1)}" cy="${y(p.g).toFixed(1)}" r="2.6" fill="${LIME}" stroke="${FOREST}" stroke-width="1.2"/>`)
    .join("");

  // A single reading has no line to draw, so its value is written beside it.
  const soloLabel =
    pts.length === 1
      ? `<text x="${(x(pts[0].day) + 7).toFixed(1)}" y="${(y(pts[0].g) + 3).toFixed(1)}" font-family="DM Sans" font-size="9" fill="${FOREST}">${pts[0].g} g</text>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="10" fill="${CREAM}"/>
${grid}${line}${dots}${soloLabel}
<text x="${PAD.left}" y="${H - 5}" font-family="DM Sans" font-size="8" fill="${MUTED}">${o.axisStart}</text>
<text x="${W - PAD.right}" y="${H - 5}" text-anchor="end" font-family="DM Sans" font-size="8" fill="${MUTED}">${o.axisEnd}</text>
</svg>`;
}

/** The chart as a 2x PNG. Throws on failure; the caller falls back. */
export async function chartPng(
  o: { points: Point[]; days: number; axisStart: string; axisEnd: string },
  /** Where to fetch the WASM and font from. Defaults to production. */
  base: string = ASSET_BASE(),
): Promise<Buffer> {
  await wasmReady(base);
  const r = new Resvg(chartSvg(o), {
    fitTo: { mode: "width", value: W * 2 },
    font: { fontBuffers: [await font(base)], defaultFontFamily: "DM Sans", loadSystemFonts: false },
    background: CREAM,
  });
  return Buffer.from(r.render().asPng());
}
