/**
 * Noticing a new release without a service worker.
 *
 * On Nov 2, 2026 the iOS app, left open across a release, kept running the
 * old build: WKWebView offers no service worker to an app without app-bound
 * domains, and every update check in sw-register.ts hangs off the worker. The
 * release removed the old build's code files from the server, so the next
 * screen the app hadn't loaded yet couldn't load (the sitter preview stalled
 * and its Close button did nothing) until the owner restarted the app.
 *
 * So every open app (the native apps and browsers alike, see
 * shouldCheckVersion) will ask /api/public/version which build is live, on
 * launch, when it comes back to the foreground and once an hour. A different
 * build is handled exactly like a service-worker update (sw-register.ts):
 * quietly at a safe moment, behind the "A new version is ready" banner while
 * a form is in progress (releaseUpdateAction).
 *
 * The decisions are pure functions here so scripts/release-check.test.ts can
 * pin them. The timers and the check itself are in sw-register.ts
 * (startReleaseCheck).
 */

/** How often an open app asks, besides launch and each return to the foreground. */
export const CHECK_EVERY_MS = 60 * 60_000;
/** Never ask more often than this (foreground flips can come in bursts). */
export const MIN_GAP_MS = 60_000;
/** Give up on one check after this long: offline is not "behind". */
export const CHECK_TIMEOUT_MS = 8_000;

/** A build id as Vercel's commit SHA gives it (7 hex chars, or the full SHA). */
const BUILD_SHAPE = /^[0-9a-f]{7,40}$/i;

/** Is `live` a different, real build from the one this page runs? Builds
 *  outside Vercel ("local", tests, the hydration check) never count, and an
 *  answer that isn't a build id (an error page, a proxy) is ignored. */
export function isNewerBuild(running: string, live: unknown): boolean {
  if (!BUILD_SHAPE.test(running)) return false;
  if (typeof live !== "string" || !BUILD_SHAPE.test(live)) return false;
  return live.toLowerCase() !== running.toLowerCase();
}

/** The build id out of /api/public/version's answer, or null for anything
 *  that isn't `{ "build": "<id>" }`. */
export function parseVersionResponse(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const build = (body as { build?: unknown }).build;
  return typeof build === "string" && BUILD_SHAPE.test(build) ? build : null;
}

/** The build id out of /api/public/version opened as a page (the check reads
 *  it in a hidden frame, see sw-register.ts), or null. The browser shows the
 *  JSON as text, sometimes with its own viewer's words around it, so this
 *  looks for the "build" field rather than parsing the whole text. */
export function buildFromPageText(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const m = text.match(/"build"\s*:\s*"([^"]{0,64})"/);
  return m && BUILD_SHAPE.test(m[1]) ? m[1] : null;
}

/** Should this page run its own version check? Every production build with
 *  a real build id, at the top of the window (a frame belongs to the page
 *  around it). Not only where there's no service worker: Vercel's Skew
 *  Protection pins an open page's requests to its own build, the worker's
 *  update check included (/sw.js comes back as the old worker, seen on
 *  Nov 2, 2026), so in a browser or the Android app the worker alone can't
 *  see a release either. */
export function shouldCheckVersion(p: { running: string; prod: boolean; inFrame: boolean }): boolean {
  return p.prod && !p.inFrame && BUILD_SHAPE.test(p.running);
}

/** Is it time for another check? `force` is launch or a return to the
 *  foreground: due unless the last check was under a minute ago. */
export function checkDue(lastAt: number, now: number, force = false): boolean {
  if (lastAt === 0) return true;
  const gap = now - lastAt;
  return force ? gap >= MIN_GAP_MS : gap >= CHECK_EVERY_MS;
}

/** A new release is out: move onto it now, or later? The same rule as a
 *  service-worker update (onUpdateReady in sw-register.ts):
 *   - "now": a quiet moment (the page was just opened, or just came back
 *     after a long time away) with no form in progress
 *   - "later": the "A new version is ready" banner, whose Update saves drafts
 *     first; a form in progress always waits for it */
export type ReleaseUpdateAction = "now" | "later";
export function releaseUpdateAction(p: { quietMoment: boolean; formInProgress: boolean }): ReleaseUpdateAction {
  return p.quietMoment && !p.formInProgress ? "now" : "later";
}

/** A reload made for a new build is recorded as { build, at }. Never reload
 *  for the same build twice within this window: if the page that came back
 *  still isn't that build (a CDN still serving the old page during a
 *  release), reloading again would only loop. */
export const RELOAD_FOR_BUILD_WINDOW_MS = 10 * 60_000;
export type BuildReload = { build: string; at: number };

export function mayReloadFor(last: BuildReload | null, live: string, now: number): boolean {
  if (!last) return true;
  if (last.build.toLowerCase() !== live.toLowerCase()) return true;
  return now - last.at >= RELOAD_FOR_BUILD_WINDOW_MS;
}

export function parseBuildReload(raw: string | null): BuildReload | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<BuildReload>;
    return typeof v.build === "string" && typeof v.at === "number" ? { build: v.build, at: v.at } : null;
  } catch {
    return null;
  }
}
