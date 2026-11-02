/**
 * Noticing a new release without a service worker.
 *
 * On Nov 2, 2026 the iOS app, left open across a release, kept running the
 * old build: WKWebView offers no service worker to an app without app-bound
 * domains, and every update check in sw-register.ts hung off the worker. The
 * release removed the old build's code files from the server, so the next
 * screen the app hadn't loaded yet couldn't load (the sitter preview stalled
 * and its Close button did nothing) until the owner restarted the app.
 *
 * So the native apps (and any browser without a worker) ask
 * /api/public/version which build is live, when they come back to the
 * foreground and once an hour. A different build is handled exactly like a
 * service-worker update (sw-register.ts): quietly at a safe moment, behind the
 * "A new version is ready" banner while a form is in progress, never
 * mid-recording or mid-upload.
 *
 * The decisions are pure functions here so scripts/release-check.test.ts can
 * pin them; the timers and fetches live in sw-register.ts.
 */

/** How often an open app asks, besides each return to the foreground. */
export const CHECK_EVERY_MS = 60 * 60_000;
/** Never ask more often than this (foreground flips can come in bursts). */
export const MIN_GAP_MS = 60_000;
/** Give up on one check after this long: offline is not "behind". */
export const CHECK_TIMEOUT_MS = 8_000;

/** A build id as Vercel's commit SHA gives it (7 hex chars), or "local". */
const BUILD_SHAPE = /^[0-9a-f]{7,40}$/i;

/** Is `live` a different, real build from the one this page runs? Builds
 *  outside Vercel ("local", tests, the hydration check) never count, and an
 *  answer that isn't a build id (an error page, a proxy) is ignored. */
export function isNewerBuild(running: string, live: unknown): boolean {
  if (!BUILD_SHAPE.test(running)) return false;
  if (typeof live !== "string" || !BUILD_SHAPE.test(live)) return false;
  return live.toLowerCase() !== running.toLowerCase();
}

/** Should this page run its own version check? Only a production build
 *  with a real build id, at the top of the window (a frame belongs to the
 *  page around it), and only where the service worker can't do the job: the
 *  native apps (iOS has none; Android's is kept as a second line) and any
 *  browser without one. */
export function shouldCheckVersion(p: {
  running: string;
  prod: boolean;
  inFrame: boolean;
  native: boolean;
  hasServiceWorker: boolean;
}): boolean {
  if (!p.prod || p.inFrame || !BUILD_SHAPE.test(p.running)) return false;
  return p.native || !p.hasServiceWorker;
}

/** Is it time for another check? */
export function checkDue(lastAt: number, now: number, force = false): boolean {
  if (lastAt === 0) return true;
  const gap = now - lastAt;
  return force ? gap >= MIN_GAP_MS : gap >= CHECK_EVERY_MS;
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

/** What to do about a code file that failed to load. A missing file means a
 *  new release is out (production only serves the live build's files), so
 *  it's handled like an update:
 *   - "reload": nothing in progress, the one automatic attempt is unspent
 *   - "banner": a form is in progress, so wait for the owner's Update (which
 *     saves drafts first; a clip mid-recording or mid-upload holds it)
 *   - "error": the attempt is spent (a reload already failed to fix it), so
 *     the error screen, never another reload
 *  `appGone` is the root error boundary: the app has already been replaced by
 *  the error screen, so nothing on screen can be lost by reloading. */
export type StaleCodeAction = "reload" | "banner" | "error";
export function staleCodeAction(p: { formInProgress: boolean; attemptSpent: boolean; appGone: boolean }): StaleCodeAction {
  if (p.formInProgress && !p.appGone) return "banner";
  if (p.attemptSpent) return "error";
  return "reload";
}
