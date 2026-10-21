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

/** Recover from a code file that failed to load: one hard reset, then the
 *  error screen. */
export function reloadForStaleChunk() {
  if (typeof window === "undefined" || reloadScheduled) return;
  if (!claimAutoReload()) {
    window.dispatchEvent(new Event(STARTUP_FAILED_EVENT));
    return;
  }
  reloadScheduled = true;
  void hardResetAndReload();
}

/** The page's stylesheet didn't apply: one hard reset if the automatic
 *  attempt is unspent, otherwise leave the (working, unstyled) page alone. */
export function recoverMissingStyles(): boolean {
  if (typeof window === "undefined" || reloadScheduled || !claimAutoReload()) return false;
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

  // No reload here when a new build takes over: the new worker reloads the
  // open pages itself, once, as it activates (src/sw.ts). It has to, because
  // a page stuck on old HTML has no working code to run a handler like this.

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
        // user reopens the home-screen app). A new build's worker activates
        // straight away (skipWaiting + clientsClaim) and reloads this page.
        const check = () => { reg.update().catch(() => {}); };
        check();
        setInterval(check, 60 * 60 * 1000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
      })
      .catch(() => { /* swallow */ });
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
