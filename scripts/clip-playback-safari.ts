/**
 * iPhone-style journey clip playback, in real Safari on macOS.
 *
 *   CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_STREAM_TOKEN=… npm run test:clip-playback:safari
 *
 * Needs macOS with Safari's WebDriver turned on (`sudo safaridriver --enable`).
 * Playwright's WebKit build can't play HLS even on macOS; Safari plays it with
 * Apple's own media stack, the one the iPhone app's WebKit view uses. This
 * plays the private test clip (meta name "kya-playback-check", kept by the
 * Linux check, scripts/clip-playback-check.ts) through the same signed link
 * getJourneyClips hands out, in a plain <video>, as JourneyClipView does on
 * iPhone, and passes only when the video actually plays (time moves past 0).
 * Signed links are never printed. Fails (never skips) when settings are missing.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { getVideoStatus, signPlaybackToken, signedClipUrls } from "@/lib/cloudflareStream.server";

const NAME = "kya-playback-check";
const API = "https://api.cloudflare.com/client/v4";
const PLAY_SECONDS = 60;

function env(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`FAIL: ${name} is not set.`); process.exit(1); }
  return v;
}
const account = env("CLOUDFLARE_ACCOUNT_ID");
const auth = { Authorization: `Bearer ${env("CLOUDFLARE_STREAM_TOKEN")}` };

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
}

const WD = "http://127.0.0.1:4444";
async function wd(method: string, path: string, body?: unknown) {
  const r = await fetch(`${WD}${path}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = (await r.json()) as any;
  if (!r.ok) throw new Error(`safaridriver ${method} ${path.replace(/\/session\/[^/]+/, "/session/…")}: ${j?.value?.error ?? r.status} ${j?.value?.message ?? ""}`);
  return j.value;
}

async function main() {
  const list = (await fetch(`${API}/accounts/${account}/stream?search=${NAME}`, { headers: auth }).then((r) => r.json())) as any;
  const uid = (list?.result ?? []).find((v: any) => v?.meta?.name === NAME && v?.status?.state !== "error")?.uid as string | undefined;
  check("the test clip exists (made by the Linux check)", !!uid);
  if (!uid) return;
  const status = await getVideoStatus(uid);
  check("the test clip is ready to stream", status.readyToStream, `state ${status.state ?? "?"}`);
  if (!status.readyToStream) return;
  const { hls } = signedClipUrls(await signPlaybackToken(uid, 600));

  // A local page with the plain <video>, as on the iPhone (Safari won't run a test against data: URLs).
  const page = `<!doctype html><meta charset="utf-8"><video id="v" src="${hls.replace(/"/g, "&quot;")}" muted playsinline preload="auto" style="width:360px"></video>`;
  const server = createServer((_q, res) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(page); });
  await new Promise<void>((r) => server.listen(8765, "127.0.0.1", r));

  const driver = spawn("safaridriver", ["-p", "4444"], { stdio: "ignore" });
  let session: string | null = null;
  try {
    for (let i = 0; i < 40; i++) { try { await fetch(`${WD}/status`); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
    session = (await wd("POST", "/session", { capabilities: { alwaysMatch: { browserName: "safari" } } })).sessionId as string;
    await wd("POST", `/session/${session}/timeouts`, { script: (PLAY_SECONDS + 15) * 1000 });
    await wd("POST", `/session/${session}/url`, { url: "http://127.0.0.1:8765/" });
    const result = (await wd("POST", `/session/${session}/execute/async`, {
      args: [PLAY_SECONDS * 1000],
      script: `
        const [ms, done] = [arguments[0], arguments[arguments.length - 1]];
        const v = document.getElementById("v");
        const seen = [];
        const t0 = Date.now();
        const at = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
        ["loadedmetadata", "canplay", "playing", "stalled", "waiting"].forEach((e) => v.addEventListener(e, () => seen.push(e + "@" + at())));
        const finish = (ok, why) => done({ ok, why, seen, canPlayHls: v.canPlayType("application/vnd.apple.mpegurl") || "no",
          readyState: v.readyState, networkState: v.networkState, currentTime: v.currentTime, duration: v.duration,
          size: v.videoWidth + "x" + v.videoHeight, error: v.error ? v.error.code + " " + (v.error.message || "") : null });
        v.addEventListener("error", () => finish(false, "the video reported an error"));
        v.addEventListener("timeupdate", () => { if (v.currentTime > 0.2) finish(true, "played"); });
        v.play().catch((e) => seen.push("play() refused: " + e.name));
        setTimeout(() => finish(false, "nothing played within " + (ms / 1000) + "s"), ms);
      `,
    })) as any;
    const detail = `${result.why}; plays HLS: ${result.canPlayHls}; events: ${result.seen.join(", ") || "none"}; readyState ${result.readyState}, networkState ${result.networkState}, `
      + `time ${Number(result.currentTime).toFixed(1)}s of ${Number(result.duration).toFixed(1)}s, ${result.size}${result.error ? `, error ${result.error}` : ""}`;
    check("Safari (the iPhone app's media stack) plays the signed HLS in a plain <video>", !!result.ok, detail);
  } finally {
    if (session) await wd("DELETE", `/session/${session}`).catch(() => {});
    driver.kill();
    server.close();
  }
}

main()
  .catch((e) => { console.error(`FAIL: ${String(e?.message ?? e).replace(/https:\/\/videodelivery\.net\/[^\s"]+/g, "<signed link>")}`); failed++; })
  .finally(() => {
    console.log(failed ? `\n${failed} check(s) FAILED` : "\nSafari clip playback passed");
    process.exit(failed ? 1 : 0);
  });
