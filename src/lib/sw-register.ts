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
 * we reload to pull the current build (the shell is fetched network-first, so
 * the reload lands on fresh chunk names).
 *
 * ONE retry is not enough. A Vercel production alias swap can leave chunks
 * briefly unfetchable for longer than a single reload round-trip, so a one-shot
 * guard spends its only attempt mid-swap and then surfaces "This page didn't
 * load" for a condition that clears itself seconds later — seen 2026-09-28,
 * ~90s after a prod deploy, on the vet-summary route. So we spend a small
 * budget of reloads with backoff instead. A genuinely broken build still
 * reaches the error screen, just ~17s of waiting later rather than ~10s.
 */
const CHUNK_RELOAD_KEY = "chunk-reload-state";
/** Wait before each successive recovery reload; the length is the attempt budget. */
const RELOAD_BACKOFF_MS = [1_000, 4_000, 12_000];
/** Failures further apart than this are separate incidents — the budget resets. */
const INCIDENT_WINDOW_MS = 60_000;

type ReloadState = { n: number; at: number };

function readReloadState(): ReloadState {
  const empty = { n: 0, at: 0 };
  if (typeof window === "undefined") return empty;
  try {
    const raw = sessionStorage.getItem(CHUNK_RELOAD_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<ReloadState> | null;
    const n = Number(parsed?.n) || 0;
    const at = Number(parsed?.at) || 0;
    // A failure long after the last one is a new incident, not a continuing
    // one — hand it a full budget rather than the tail of an old attempt.
    return Date.now() - at > INCIDENT_WINDOW_MS ? empty : { n, at };
  } catch {
    return empty;
  }
}

/** True once the reload budget is spent — the caller should surface the real
 *  error instead of reloading again. Pure read, safe to call during render. */
export function staleChunkRecoveryExhausted(): boolean {
  return readReloadState().n >= RELOAD_BACKOFF_MS.length;
}

/** At most one scheduled reload per page load: the `vite:preloadError` listener
 *  and the root error boundary both fire for the same failure, and must not
 *  each spend an attempt out of the budget. */
let reloadScheduled = false;

/** Reload to recover from a stale-build chunk 404, backing off across attempts
 *  and standing down once the budget is spent. */
export function reloadForStaleChunk() {
  if (typeof window === "undefined" || reloadScheduled) return;
  const { n } = readReloadState();
  const delay = RELOAD_BACKOFF_MS[n];
  if (delay === undefined) return; // budget spent — the error boundary takes over
  reloadScheduled = true;
  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, JSON.stringify({ n: n + 1, at: Date.now() }));
  } catch {
    // sessionStorage blocked (private mode, some iframes). The attempt still
    // runs, but nothing persists across the reload, so every load reads n=0 and
    // the budget never advances. `reloadScheduled` is then the only loop guard,
    // exactly as it was before the backoff existed — unchanged, not newly broken.
  }
  window.setTimeout(doStaleChunkReload, delay);
}

function doStaleChunkReload() {
  if (isNativeApp()) {
    // The shell's WKWebView caches the document itself, so a plain reload can
    // re-read the SAME stale HTML that references dead chunk URLs (seen on
    // device after a deploy). Cache-bust the document fetch instead.
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("_r", String(Date.now()));
      window.location.replace(u.toString());
      return;
    } catch { /* fall through to a plain reload */ }
  }
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
  // Piggybacked shell setup (this runs once at client boot): mark the
  // document so CSS can add native-only chrome like the status-bar backdrop.
  if (isNativeApp()) document.documentElement.classList.add("native-app");
  if (!("serviceWorker" in navigator)) return;

  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const url = new URL(window.location.href);
  const refuse =
    !import.meta.env.PROD ||
    inIframe ||
    // The native shell registers the worker like the PWA does. Hashed asset
    // filenames make cache-first assets immutable, and app-shell navigations
    // are network-first (see src/sw.ts), so a new build always lands — the
    // shell can't get pinned to a stale bundle. Before this, the shell refused
    // the worker and re-downloaded the whole bundle from the network on every
    // cold launch. (Native-only NON-caching behavior stays gated elsewhere:
    // web push, add-to-home-screen, the TikTok pixel.)
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
