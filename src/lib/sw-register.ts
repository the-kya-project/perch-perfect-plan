/**
 * Service-worker registration wrapper.
 *
 * Refuses to register in any non-production context: dev, Lovable preview
 * iframes, preview/staging hostnames, or when `?sw=off` is passed. In those
 * cases it actively unregisters any stale `/sw.js` so a previously-installed
 * worker can't keep serving cached HTML.
 *
 * Sitter pages work fine without the worker — they hit the network for fresh
 * data on every navigation (denylisted in workbox config). Installation only
 * makes sense for owners using the app repeatedly.
 */
import { isNativeApp } from "./nativeApp";
import { flushAllDrafts, formInProgress } from "./formsInProgress";

const SW_URL = "/sw.js";

function isPreviewHost(host: string): boolean {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
      if (url.endsWith(SW_URL)) await r.unregister();
    }
  } catch { /* ignore */ }
}

/**
 * Recover from a code file that won't load — the "chunk 404 after deploy"
 * case, or a device whose cache is holding a bad copy of a file.
 *
 * ONE automatic attempt, then a "Something went wrong" screen with a Reload
 * button. Never a loop. On 2026-10-21 the iOS app looped (spinner, black,
 * spinner…) for minutes: a dashboard code file failed to load on that phone,
 * the old recovery reloaded with backoff, and because every reload asked the
 * same broken cache for the same file, it failed the same way each time; the
 * budget reset after a minute and the cycle started over.
 *
 * So the single attempt is a HARD reset (unregister the service worker, clear
 * every Cache Storage entry, cache-busted page load), which is the only reload
 * with a real chance of landing on different bytes. If the page that comes
 * back still can't load its code, the attempt is spent and the person gets the
 * error screen instead of another reload. The attempt is stored in
 * localStorage (sessionStorage doesn't reliably survive the native shell's
 * reloads) and cleared once the app has stayed up for a few seconds, so a
 * future failure, days later, gets its own attempt.
 */
const AUTO_RELOAD_KEY = "kya-auto-reload";
/** An automatic reload this recent, with no healthy run since, is "spent". */
const AUTO_RELOAD_WINDOW_MS = 5 * 60_000;
/** How long the app must stay up before the attempt is handed back. */
const HEALTHY_AFTER_MS = 8_000;

function readAutoReloadAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const at = Number(localStorage.getItem(AUTO_RELOAD_KEY)) || 0;
    return Date.now() - at < AUTO_RELOAD_WINDOW_MS ? at : 0;
  } catch {
    return 0;
  }
}

/** True once this device has used its automatic reload and hasn't run
 *  healthily since — the caller should show the error screen, not reload.
 *  Pure read, safe to call during render. */
export function staleChunkRecoveryExhausted(): boolean {
  // An attempt claimed by THIS page is in flight, not spent.
  return readAutoReloadAt() > 0 && !reloadScheduled;
}

/** Claim the one automatic reload. False when it's already spent. */
function claimAutoReload(): boolean {
  if (readAutoReloadAt() > 0) return false;
  try {
    localStorage.setItem(AUTO_RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: without a record the next load can't tell it already
    // tried, so refuse rather than risk a loop.
    return false;
  }
  return true;
}

/** Called once the app has mounted: after a few seconds up, the automatic
 *  reload is available again for a future, unrelated failure. */
export function markAppHealthySoon() {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    try { localStorage.removeItem(AUTO_RELOAD_KEY); } catch { /* ignore */ }
  }, HEALTHY_AFTER_MS);
}

/** Fired when a reload was needed but the attempt is spent: the root shows
 *  the error screen (see __root.tsx). */
export const STARTUP_FAILED_EVENT = "kya:startup-failed";

/** At most one reload per page load: the `vite:preloadError` listener and the
 *  root error boundary both fire for the same failure. */
let reloadScheduled = false;

/** The page is navigating away (set by the startup guard in __root.tsx).
 *  Safari reports the loads a navigation cancels as failures; those are not a
 *  stale build, and reloading would replace the page the person asked for. */
function leavingPage(): boolean {
  try {
    return (window as unknown as { __kyaLeaving?: () => boolean }).__kyaLeaving?.() === true;
  } catch {
    return false;
  }
}

/** Recover from a code file that failed to load: one hard reset, then the
 *  error screen. */
export function reloadForStaleChunk() {
  if (typeof window === "undefined" || reloadScheduled || leavingPage()) return;
  if (!claimAutoReload()) {
    window.dispatchEvent(new Event(STARTUP_FAILED_EVENT));
    return;
  }
  reloadScheduled = true;
  // Keep whatever the owner was typing: drafts live in localStorage/IndexedDB,
  // which the hard reset leaves alone.
  void flushAllDrafts(1000).finally(() => { void hardResetAndReload(); });
}

/** The page's stylesheet didn't apply: one hard reset if the automatic
 *  attempt is unspent, otherwise leave the (working, unstyled) page alone. */
export function recoverMissingStyles(): boolean {
  if (typeof window === "undefined" || reloadScheduled || leavingPage() || !claimAutoReload()) return false;
  reloadScheduled = true;
  void hardResetAndReload();
  return true;
}

/** Does this error look like a code file that failed to load (the
 *  recoverable kind), rather than a real crash? Message shapes vary by browser. */
export function isStaleChunkError(error: unknown): boolean {
  const msg = (error as Error | null)?.message ?? "";
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script|unable to preload/i.test(msg);
}

export function installChunkErrorRecovery() {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault(); // don't let it surface as an unhandled error; we handle it here
    reloadForStaleChunk();
  });
}

/**
 * Last-resort recovery from a stuck/stale client. Unregisters the app's service
 * worker, deletes every Cache Storage entry it left behind, then hard-reloads so
 * the browser re-fetches the current build's HTML + chunks from the network.
 *
 * Used by the root error boundary: a crash on a stale bundle (old code still
 * running from cache after a deploy) otherwise survives a plain reload, because
 * the worker keeps serving the same cached assets. Clearing the worker + caches
 * first guarantees the reload lands on fresh code. Best-effort throughout — any
 * step can fail (private mode, blocked storage) without stopping the reload.
 */
export async function hardResetAndReload(): Promise<void> {
  await unregisterAppWorkers();
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* ignore */ }
  // Cache-bust the document fetch too, in case an intermediary cached the HTML.
  try {
    const u = new URL(window.location.href);
    u.searchParams.set("_r", String(Date.now()));
    window.location.replace(u.toString());
  } catch {
    window.location.reload();
  }
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  // Piggybacked shell setup (this runs once at client boot): mark the
  // document so CSS can add native-only chrome like the status-bar backdrop.
  if (isNativeApp()) document.documentElement.classList.add("native-app");
  if (!("serviceWorker" in navigator)) return;

  // A page inside a frame (the owner's sitter preview) shares the app's worker
  // with the page around it: leave it alone. Unregistering here used to remove
  // the installed app's worker every time an owner opened a preview.
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  if (inIframe) return;
  const url = new URL(window.location.href);
  const refuse =
    !import.meta.env.PROD ||
    // The native shell registers the worker like the PWA does. Hashed asset
    // filenames make cache-first assets immutable, and app-shell navigations
    // are network-first (see src/sw.ts), so a new build always lands — the
    // shell can't get pinned to a stale bundle. Before this, the shell refused
    // the worker and re-downloaded the whole bundle from the network on every
    // cold launch. (Native-only NON-caching behavior stays gated elsewhere:
    // web push, add-to-home-screen.)
    isPreviewHost(window.location.hostname) ||
    url.searchParams.get("sw") === "off";

  if (refuse) {
    void unregisterAppWorkers();
    return;
  }

  // A new build never reloads this page on its own: see "Updates" below.
  // (A page stuck on old HTML, with no working code, is rescued by the inline
  // startup guard in __root.tsx instead.)
  hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  // Register after load so it never competes with first paint. This runs from
  // an effect, which on a fast load is already after "load" has fired, and a
  // listener added then never runs: check, rather than only listening.
  const register = () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((reg) => {
        // An installed PWA can stay open for days, so it must actively re-check
        // for new deploys — otherwise it serves the build it was opened with
        // forever (CacheFirst assets). Check on registration, hourly, and every
        // time the app returns to the foreground (the common case on iOS: the
        // user reopens the home-screen app). What happens when one is found is
        // decided in onUpdateReady: never a reload mid-task.
        swReg = reg;
        watchForUpdates(reg);
        const check = () => { reg.update().catch(() => {}); };
        check();
        setInterval(check, 60 * 60 * 1000);
        watchForeground(check);
      })
      .catch(() => { /* swallow */ });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}

// ── Updates ─────────────────────────────────────────────────────────────────
//
// A new build's worker waits (src/sw.ts) until this page says it's a good
// moment. That's either a quiet moment with no form in progress:
//   - the app was just opened (the page itself is already the new build:
//     app-shell navigations are network-first), so the worker takes over with
//     no reload, or
//   - the app came back after AWAY_MS or more in the background, so the worker
//     takes over and the page reloads onto the new build;
// or the owner tapping Update on the "A new version is ready" banner, which
// shows instead whenever a form is in progress. Update saves drafts first.
// With no form in progress and no quiet moment, nothing happens until one.

/** Back after this long away counts as "returning", when an update applies. */
const AWAY_MS = 30 * 60_000;
/** An update found this soon after the page loaded counts as "opened fresh". */
const FRESH_MS = 30_000;
/** After returning from away, an update that finishes downloading within this
 *  long still applies quietly. */
const RETURN_WINDOW_MS = 60_000;

const pageLoadedAt = typeof performance !== "undefined" ? Date.now() - performance.now() : Date.now();
let swReg: ServiceWorkerRegistration | null = null;
/** A newer build is waiting, or already took over and this page is older. */
let updateReady = false;
/** The worker in charge changed without this page asking (another tab). */
let pageBehind = false;
/** This page asked the waiting worker to take over. */
let activating = false;
/** Was a worker in charge when this page started? If not, the first
 *  controllerchange is the very first install claiming the page: no update. */
let hadController = false;
let applying = false;
/** Until when an update counts as arriving at a quiet moment, and whether
 *  applying it then needs a reload (back from away) or not (fresh open). */
let quietUntil = pageLoadedAt + FRESH_MS;
let quietReload = false;

const updateListeners = new Set<() => void>();
function notifyUpdate() { updateListeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } }); }

/** For the banner: is a new version waiting for this page? */
export function updateIsReady(): boolean { return updateReady; }
export function subscribeUpdate(fn: () => void): () => void {
  updateListeners.add(fn);
  return () => { updateListeners.delete(fn); };
}

function watchForUpdates(reg: ServiceWorkerRegistration) {
  // No controller = the first install on this device, not an update.
  if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady();
  reg.addEventListener("updatefound", () => {
    const w = reg.installing;
    if (!w) return;
    w.addEventListener("statechange", () => {
      if (w.state === "installed" && navigator.serviceWorker.controller) onUpdateReady();
    });
  });
}

function onControllerChange() {
  if (!hadController) { hadController = true; return; } // first install on this device
  if (activating) return; // this page asked; applyUpdate carries on from here
  // Another tab let the new build take over. This page still runs the old
  // one, so it needs a reload, at the same kind of moment as any update.
  pageBehind = true;
  onUpdateReady();
}

function onUpdateReady() {
  updateReady = true;
  if (Date.now() < quietUntil && !formInProgress()) {
    void applyUpdate(quietReload || pageBehind);
    return;
  }
  notifyUpdate();
}

/** Let the waiting worker take over, then reload if this page is old. */
async function applyUpdate(reload: boolean) {
  if (applying) return;
  applying = true;
  const waiting = swReg?.waiting ?? null;
  if (waiting) {
    activating = true;
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        navigator.serviceWorker.removeEventListener("controllerchange", done);
        resolve();
      };
      navigator.serviceWorker.addEventListener("controllerchange", done);
      setTimeout(done, 4000);
      try { waiting.postMessage({ type: "SKIP_WAITING" }); } catch { done(); }
    });
    activating = false;
  }
  if (reload) {
    window.location.reload();
    return;
  }
  updateReady = false;
  pageBehind = false;
  applying = false;
  notifyUpdate();
}

/** The banner's Update: save every draft, then move onto the new build. */
export async function updateNow(): Promise<void> {
  await flushAllDrafts();
  await applyUpdate(true);
}

/** Track time in the background. visibilitychange is the signal; a heartbeat
 *  covers shells that don't fire it (timers stop while the app is suspended,
 *  so a long gap between beats is time away too). */
function watchForeground(check: () => void) {
  let hiddenAt: number | null = null;
  let lastBeat = Date.now();
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    // A gap this long between beats: the app was suspended without saying so.
    if (hiddenAt == null && Date.now() - lastBeat >= AWAY_MS) back();
    lastBeat = Date.now();
  }, 15_000);
  const back = () => {
    const now = Date.now();
    const away = now - (hiddenAt ?? lastBeat) >= AWAY_MS;
    hiddenAt = null;
    lastBeat = now;
    if (away) {
      quietUntil = now + RETURN_WINDOW_MS;
      quietReload = true;
      if (updateReady && !formInProgress()) { void applyUpdate(true); return; }
    }
    check();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") hiddenAt = Date.now();
    else back();
  });
}
