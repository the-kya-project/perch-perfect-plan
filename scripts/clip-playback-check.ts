/**
 * Journey clip playback, end to end, through the app's own signed-link path.
 *
 *   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_STREAM_TOKEN=… npm run test:clip-playback
 *   … npm run test:clip-playback:full     (adds WebKit playing it; needs macOS)
 *
 * Earlier tests played clips from plain links and so never exercised signing.
 * This one uses a real, processed Cloudflare Stream video kept for the purpose
 * (meta name "kya-playback-check", private: requireSignedURLs). If it doesn't
 * exist yet it makes one (a 3-second test pattern from ffmpeg) and waits for it
 * to process. Then, with the same functions getJourneyClips uses
 * (getVideoStatus, signPlaybackToken, signedClipUrls), it checks:
 *   1. the video is ready to stream;
 *   2. the unsigned link is refused (so signing really is required);
 *   3. the signed HLS manifest, thumbnail and player page load;
 *   4. the signed stream downloads and parses: the manifest, a variant
 *      playlist and its first video segment, which must be MPEG-TS or fMP4
 *      carrying H.264 or HEVC video;
 *   5. Chromium loads the signed player page;
 *   6. with --full only: WebKit (the iPhone app's engine) plays the signed HLS
 *      in a plain <video>, as JourneyClipView does there. Only WebKit on macOS
 *      can: it plays HLS with Apple's media stack, which Linux WebKit doesn't
 *      have. So the default run (Linux, every PR and daily) says iPhone-style
 *      playback isn't covered, and the weekly macOS job runs --full.
 * Fails (never skips) when the Cloudflare settings are missing.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVideoStatus, signPlaybackToken, signedClipUrls } from "@/lib/cloudflareStream.server";

const NAME = "kya-playback-check";
const FULL = process.argv.includes("--full");
const NOT_COVERED = "iPhone-style playback (WebKit playing the signed stream in a <video>) is NOT covered in this job. "
  + "It runs weekly on macOS, or by hand: Actions → Clip playback → Run workflow.";
const API = "https://api.cloudflare.com/client/v4";

function env(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`FAIL: ${name} is not set.`); process.exit(1); }
  return v;
}
const account = env("CLOUDFLARE_ACCOUNT_ID");
const token = env("CLOUDFLARE_STREAM_TOKEN");
const auth = { Authorization: `Bearer ${token}` };

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

async function findOrMakeTestClip(): Promise<string> {
  const list = await fetch(`${API}/accounts/${account}/stream?search=${NAME}`, { headers: auth }).then((r) => r.json()) as any;
  const found = (list?.result ?? []).find((v: any) => v?.meta?.name === NAME && v?.status?.state !== "error");
  if (found?.uid) return found.uid as string;
  console.log("No test clip yet: making one.");
  const dir = mkdtempSync(join(tmpdir(), "clipcheck-"));
  const file = join(dir, "test.mp4");
  try {
    execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=360x640:rate=24", "-pix_fmt", "yuv420p", "-c:v", "libx264", file]);
  } catch (e: any) {
    throw new Error(`couldn't make the test clip with ffmpeg (${e?.code ?? e?.message}). Run the Linux job once to make it, or install ffmpeg.`);
  }
  const form = new FormData();
  form.append("file", new Blob([readFileSync(file)], { type: "video/mp4" }), "test.mp4");
  const up = await fetch(`${API}/accounts/${account}/stream`, { method: "POST", headers: auth, body: form }).then((r) => r.json()) as any;
  const uid = up?.result?.uid as string | undefined;
  if (!uid) throw new Error(`upload failed: ${JSON.stringify(up?.errors ?? up)}`);
  const meta = await fetch(`${API}/accounts/${account}/stream/${uid}`, {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ meta: { name: NAME }, requireSignedURLs: true }),
  }).then((r) => r.json()) as any;
  if (!meta?.success) throw new Error(`couldn't mark the test clip private: ${JSON.stringify(meta?.errors)}`);
  return uid;
}


/** URIs in an HLS playlist (non-comment lines), resolved against its URL. */
function playlistUris(text: string, base: string): string[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => new URL(l, base).toString());
}
/** The init segment named by #EXT-X-MAP (fMP4 streams), if any. */
function mapUri(text: string, base: string): string | null {
  const m = /#EXT-X-MAP:.*URI="([^"]+)"/.exec(text);
  return m ? new URL(m[1], base).toString() : null;
}

/** MPEG-TS: every 188-byte packet starts 0x47; the PAT names a PMT whose
 *  streams include H.264 (0x1B) or HEVC (0x24) video. */
function parseTs(b: Uint8Array): string | null {
  if (b.length < 188 * 3 || b[0] !== 0x47) return null;
  const packets = Math.floor(b.length / 188);
  for (let i = 0; i < packets; i++) if (b[i * 188] !== 0x47) return null;
  const payload = (i: number) => {
    const p = i * 188, afc = (b[p + 3] >> 4) & 3;
    let o = p + 4;
    if (afc === 2) return null;
    if (afc === 3) o += 1 + b[o];
    return o;
  };
  const pid = (i: number) => ((b[i * 188 + 1] & 0x1f) << 8) | b[i * 188 + 2];
  const pusi = (i: number) => (b[i * 188 + 1] & 0x40) !== 0;
  let pmtPid = -1;
  for (let i = 0; i < packets && pmtPid < 0; i++) {
    if (pid(i) !== 0 || !pusi(i)) continue;
    let o = payload(i); if (o == null) continue;
    o += 1 + b[o]; // pointer field
    const end = o + 3 + (((b[o + 1] & 0x0f) << 8) | b[o + 2]) - 4;
    for (let q = o + 8; q + 4 <= end; q += 4) {
      const prog = (b[q] << 8) | b[q + 1];
      if (prog !== 0) { pmtPid = ((b[q + 2] & 0x1f) << 8) | b[q + 3]; break; }
    }
  }
  if (pmtPid < 0) return null;
  for (let i = 0; i < packets; i++) {
    if (pid(i) !== pmtPid || !pusi(i)) continue;
    let o = payload(i); if (o == null) continue;
    o += 1 + b[o];
    const end = o + 3 + (((b[o + 1] & 0x0f) << 8) | b[o + 2]) - 4;
    let q = o + 12 + (((b[o + 10] & 0x0f) << 8) | b[o + 11]);
    const types: number[] = [];
    while (q + 5 <= end) { types.push(b[q]); q += 5 + (((b[q + 3] & 0x0f) << 8) | b[q + 4]); }
    if (types.includes(0x1b)) return `MPEG-TS, H.264, ${packets} packets`;
    if (types.includes(0x24)) return `MPEG-TS, HEVC, ${packets} packets`;
    return null;
  }
  return null;
}

/** Top-level ISO-BMFF boxes (fMP4). */
function boxes(b: Uint8Array): string[] {
  const out: string[] = []; let o = 0;
  while (o + 8 <= b.length) {
    let size = ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
    const type = String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
    if (size === 1 && o + 16 <= b.length) size = Number(new DataView(b.buffer, b.byteOffset + o + 8, 8).getBigUint64(0));
    if (size < 8 || o + size > b.length) return out.length ? [...out, type] : [];
    out.push(type); o += size;
  }
  return out;
}
/** fMP4: the init has moov with an avc1/avc3/hvc1/hev1 sample entry; the segment has moof + mdat. */
function parseFmp4(init: Uint8Array | null, seg: Uint8Array): string | null {
  const segBoxes = boxes(seg);
  if (!segBoxes.includes("moof") || !segBoxes.includes("mdat")) return null;
  const head = init ?? seg;
  if (!boxes(head).includes("moov")) return null;
  const txt = new TextDecoder("latin1").decode(head);
  const codec = ["avc1", "avc3", "hvc1", "hev1"].find((c) => txt.includes(c));
  return codec ? `fMP4, ${codec}, boxes ${segBoxes.join("/")}` : null;
}

/** Manifest → variant playlist → first segment, downloaded and parsed. */
async function checkStream(hls: string) {
  const master = await (await fetch(hls)).text();
  let playlistUrl = hls, playlist = master;
  if (master.includes("#EXT-X-STREAM-INF")) {
    const lines = master.split(/\r?\n/).map((l) => l.trim());
    const variants = lines.flatMap((l, i) => (l.startsWith("#EXT-X-STREAM-INF") && lines[i + 1] && !lines[i + 1].startsWith("#") ? [new URL(lines[i + 1], hls).toString()] : []));
    check("the signed manifest lists video variants", variants.length > 0, `${variants.length} variant(s)`);
    if (!variants.length) return;
    playlistUrl = variants[0];
    const res = await fetch(playlistUrl);
    playlist = await res.text();
    check("the first variant playlist downloads", res.ok && playlist.startsWith("#EXTM3U"), `HTTP ${res.status}`);
    if (!res.ok) return;
  }
  const segs = playlistUris(playlist, playlistUrl);
  const durations = [...playlist.matchAll(/#EXTINF:([\d.]+)/g)].map((m) => Number(m[1]));
  const total = durations.reduce((a, b) => a + b, 0);
  check("the playlist lists video segments", segs.length > 0 && total > 0, `${segs.length} segment(s), ${total.toFixed(1)}s`);
  if (!segs.length) return;
  const segRes = await fetch(segs[0]);
  const seg = new Uint8Array(await segRes.arrayBuffer());
  check("the first video segment downloads", segRes.ok && seg.length > 0, `HTTP ${segRes.status}, ${seg.length} bytes`);
  if (!segRes.ok) return;
  const init = mapUri(playlist, playlistUrl);
  const initBytes = init ? new Uint8Array(await (await fetch(init)).arrayBuffer()) : null;
  const parsed = parseTs(seg) ?? parseFmp4(initBytes, seg);
  check("the first video segment parses as H.264/HEVC video", !!parsed, parsed ?? `unrecognised (first bytes ${[...seg.slice(0, 8)].map((x) => x.toString(16).padStart(2, "0")).join(" ")})`);
}

async function main() {
  const uid = await findOrMakeTestClip();
  console.log(`Test clip ${uid}`);

  // 1. Processed (wait up to 3 minutes for a new one).
  let status = await getVideoStatus(uid);
  const deadline = Date.now() + 180_000;
  while (!status.readyToStream && status.state !== "error" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));
    status = await getVideoStatus(uid);
  }
  check("the test clip is processed and ready to stream", status.readyToStream, `state ${status.state ?? "?"}`);
  if (!status.readyToStream) return;

  // 2. Unsigned is refused.
  const unsigned = await fetch(`https://videodelivery.net/${uid}/manifest/video.m3u8`);
  check("the unsigned link is refused", unsigned.status === 401 || unsigned.status === 403, `HTTP ${unsigned.status}`);

  // 3. Signed links, built exactly as getJourneyClips builds them.
  const urls = signedClipUrls(await signPlaybackToken(uid, 600));
  const manifest = await fetch(urls.hls);
  const body = await manifest.text();
  check("the signed HLS manifest loads", manifest.ok && body.startsWith("#EXTM3U"), `HTTP ${manifest.status}`);
  const thumb = await fetch(urls.thumbnail);
  check("the signed thumbnail loads", thumb.ok && /^image\//.test(thumb.headers.get("content-type") ?? ""), `HTTP ${thumb.status}`);
  const player = await fetch(urls.player);
  check("the signed player page loads", player.ok, `HTTP ${player.status}`);

  // 4. The stream itself, downloaded and parsed (no browser needed).
  await checkStream(urls.hls);

  // 5. Chromium loads the signed player page.
  const { webkit, chromium } = await import("playwright");
  const cr = await chromium.launch();
  try {
    const page = await cr.newPage();
    const res = await page.goto(urls.player, { waitUntil: "domcontentloaded", timeout: 30_000 });
    check("Chromium loads the signed Stream player", !!res?.ok(), `HTTP ${res?.status() ?? "?"}`);
  } finally { await cr.close(); }

  // 6. WebKit plays the signed HLS in a plain <video> (--full, macOS only).
  if (!FULL) return;
  const wk = await webkit.launch();
  try {
    const page = await wk.newPage();
    await page.setContent(`<video id="v" src="${urls.hls}" muted playsinline preload="metadata"></video>`);
    const played = await page.evaluate(() => new Promise<string>((resolve) => {
      const v = document.getElementById("v") as HTMLVideoElement;
      const can = v.canPlayType("application/vnd.apple.mpegurl") || "no";
      v.addEventListener("loadedmetadata", () => resolve(`ok ${v.duration.toFixed(1)}s, ${v.videoWidth}x${v.videoHeight}`));
      v.addEventListener("error", () => resolve(`error ${v.error?.code ?? "?"} (plays HLS: ${can})`));
      setTimeout(() => resolve(`timeout after 30s (plays HLS: ${can})`), 30_000);
    }));
    check("WebKit (the iPhone app's engine) plays the signed HLS in a <video>", played.startsWith("ok"), played);
  } finally { await wk.close(); }
}

main()
  .catch((e) => { console.error(`FAIL: ${e?.message ?? e}`); failed++; })
  .finally(() => {
    if (!FULL) {
      console.log(`\nNOTE: ${NOT_COVERED}`);
      console.log(`::notice title=iPhone-style playback not covered here::${NOT_COVERED}`);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `> **Note:** ${NOT_COVERED}\n`);
    }
    console.log(failed ? `\n${failed} check(s) FAILED` : `\nall clip playback checks passed${FULL ? " (including WebKit playback)" : " (stream checks; WebKit playback not run)"}`);
    process.exit(failed ? 1 : 0);
  });
