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
 * Recover from "chunk 404 after deploy". When a client is running an older
 * build and code-splits to a lazily-imported chunk, the hashed filename it asks
 * for may have been removed by a newer deploy → 404 → the dynamic import throws
 * and the view fails to render (e.g. the sitter preview, which renders inside an
 * iframe the active SW still controls). Vite fires `vite:preloadError` for this;
 * we reload once to pull the current build (the shell is fetched network-first,
 * so the reload lands on fresh chunk names). A short sessionStorage guard stops
 * a reload loop if a refresh somehow doesn't resolve it.
 */
const CHUNK_RELOAD_KEY = "chunk-reload-at";

/** True if a stale-chunk recovery reload was attempted in the last 10s — the
 *  loop guard. Pure read (no side effects), safe to call during render. */
export function chunkReloadAttemptedRecently(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Date.now() - Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0) < 10_000;
  } catch {
    return false;
  }
}

/** Reload once to recover from a stale-build chunk 404. Respects the loop guard. */
export function reloadForStaleChunk() {
  if (typeof window === "undefined") return;
  try {
    if (chunkReloadAttemptedRecently()) return; // already tried very recently — avoid a loop
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch { /* sessionStorage blocked (e.g. some iframes) — fall through to a single reload */ }
  window.location.reload();
}

/** Does this error look like a stale-build lazy-chunk load failure (the
 *  self-healing kind), rather than a real crash? Message shapes vary by browser. */
export function isStaleChunkError(error: unknown): boolean {
  const msg = (error as Error | null)?.message ?? "";
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to load module script|unable to preload/i.test(msg);
}

export function installChunkErrorRecovery() {
  if (typeof window === "undefined") return;
  window.addEventListener("vite:preloadError", (e) => {
    e.preventDefault(); // don't let it surface as an unhandled error; we handle it by reloading
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
  if (!("serviceWorker" in navigator)) return;

  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const url = new URL(window.location.href);
  const refuse =
    !import.meta.env.PROD ||
    inIframe ||
    isNativeApp() || // the App Store / Play Store shell must never cache builds
    isPreviewHost(window.location.hostname) ||
    url.searchParams.get("sw") === "off";

  if (refuse) {
    void unregisterAppWorkers();
    return;
  }

  // Whether this page is already controlled by an existing worker. If so, a
  // later controllerchange means a NEW build took over → reload to drop the
  // stale cached assets. If not (first install), the initial claim is not an
  // update and must NOT trigger a reload.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading || !hadController) return;
    reloading = true;
    // A new build is now in control; reload once to run its fresh JS/CSS.
    window.location.reload();
  });

  // Register after load so it never competes with first paint.
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: "/" })
      .then((reg) => {
        // An installed PWA can stay open for days, so it must actively re-check
        // for new deploys — otherwise it serves the build it was opened with
        // forever (CacheFirst assets). Check on registration, hourly, and every
        // time the app returns to the foreground (the common case on iOS: the
        // user reopens the home-screen app). When workbox (autoUpdate →
        // skipWaiting + clientsClaim) finds a new build, it activates and the
        // controllerchange handler above reloads to apply it.
        const check = () => { reg.update().catch(() => {}); };
        check();
        setInterval(check, 60 * 60 * 1000);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") check();
        });
      })
      .catch(() => { /* swallow */ });
  });
}
