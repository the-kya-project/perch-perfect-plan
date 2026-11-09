/**
 * Journey clip playback, end to end, through the app's own signed-link path.
 *
 *   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_STREAM_TOKEN=… npm run test:clip-playback
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
 *   4. a real browser plays the signed HLS: WebKit (the iPhone app's engine)
 *      in a plain <video>, as JourneyClipView does there; Chromium loads the
 *      signed player page.
 * Fails (never skips) when the Cloudflare settings are missing.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getVideoStatus, signPlaybackToken, signedClipUrls } from "@/lib/cloudflareStream.server";

const NAME = "kya-playback-check";
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
  execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "testsrc=duration=3:size=360x640:rate=24", "-pix_fmt", "yuv420p", "-c:v", "libx264", file]);
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

  // 4. In real browsers.
  const { webkit, chromium } = await import("playwright");
  const wk = await webkit.launch();
  try {
    const page = await wk.newPage();
    await page.setContent(`<video id="v" src="${urls.hls}" muted playsinline preload="metadata"></video>`);
    const played = await page.evaluate(() => new Promise<string>((resolve) => {
      const v = document.getElementById("v") as HTMLVideoElement;
      v.addEventListener("loadedmetadata", () => resolve(`ok ${v.duration.toFixed(1)}s`));
      v.addEventListener("error", () => resolve(`error ${v.error?.code ?? "?"}`));
      setTimeout(() => resolve("timeout"), 30_000);
    }));
    check("WebKit (the iPhone app's engine) plays the signed HLS in a <video>", played.startsWith("ok"), played);
  } finally { await wk.close(); }
  const cr = await chromium.launch();
  try {
    const page = await cr.newPage();
    const res = await page.goto(urls.player, { waitUntil: "domcontentloaded", timeout: 30_000 });
    check("Chromium loads the signed Stream player", !!res?.ok(), `HTTP ${res?.status() ?? "?"}`);
  } finally { await cr.close(); }
}

main()
  .catch((e) => { console.error(`FAIL: ${e?.message ?? e}`); failed++; })
  .finally(() => {
    console.log(failed ? `\n${failed} check(s) FAILED` : "\nall clip playback checks passed");
    process.exit(failed ? 1 : 0);
  });
