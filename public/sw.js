/**
 * THE service worker for Kya & Co. — the single SW that ships (served from
 * .vercel/output/static/sw.js). Does three things:
 *   1. Web push (receive + click) — unchanged behavior.
 *   2. App-shell / static caching for fast repeat loads + offline boot.
 *   3. A controlled offline fallback instead of the browser's error page.
 *
 * SAFETY: never caches authenticated data or signed media. Data goes through
 * cross-origin (Supabase/Cloudflare) or server-fn / /api requests, all of which
 * bypass the SW entirely (see shouldBypass). Only same-origin, hashed-immutable
 * static assets + the app shell + a few icons are cached. Navigations are
 * NetworkFirst, so an online user always gets fresh HTML (no stale deploys);
 * offline they get the cached shell (the SPA boots) or the offline page.
 *
 * Bump VERSION to invalidate all caches on the next activation.
 */
const VERSION = "v1";
const SHELL_CACHE = `kya-shell-${VERSION}`;
const ASSET_CACHE = `kya-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icon-192.png", "/manifest.webmanifest"];
const MAX_ASSETS = 120; // cap runtime asset cache so mobile storage can't grow unbounded

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Best-effort: a single missing file must not fail the whole install.
      await Promise.all(PRECACHE.map((u) => cache.add(u).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Requests the SW must NOT touch — handled by the browser as-is (NetworkOnly):
//   - non-GET (mutations)
//   - cross-origin (Supabase data, signed Storage/Cloudflare media) — NEVER cache
//   - /api/ (server routes + server-fn calls), /~oauth, /__ (infra)
function shouldBypass(url, request) {
  if (request.method !== "GET") return true;
  if (url.origin !== self.location.origin) return true;
  const p = url.pathname;
  return p.startsWith("/api/") || p.startsWith("/~oauth") || p.startsWith("/__");
}

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  let url;
  try { url = new URL(request.url); } catch { return; }
  if (shouldBypass(url, request)) return;

  // Navigations: NetworkFirst → cached shell → offline page. Online always wins
  // (fresh HTML, no stale chunks); offline boots the cached SPA or the offline
  // page, never a raw browser failure.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const net = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put("/", net.clone()).catch(() => {}); // keep one warm shell for offline boot
          return net;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match("/")) ||
            (await cache.match(OFFLINE_URL)) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }
      })(),
    );
    return;
  }

  // Same-origin, hashed-immutable static assets → CacheFirst. Safe because a new
  // deploy emits NEW filenames (so cached entries are never stale, just unused).
  const dest = request.destination;
  const cacheable =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/brand/") ||
    ["style", "script", "worker", "font"].includes(dest) ||
    /\.(?:woff2?|ttf|css|js|png|svg|ico)$/.test(url.pathname);
  if (cacheable) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        try {
          const net = await fetch(request);
          if (net.ok) {
            cache.put(request, net.clone());
            trimCache(ASSET_CACHE, MAX_ASSETS);
          }
          return net;
        } catch {
          return hit || Response.error();
        }
      })(),
    );
    return;
  }
  // Anything else (e.g. same-origin GET server-fn data) → default browser fetch.
});

// ---------------------------------------------------------------------------
// Web push — RECEIVE a push and surface a notification, FOCUS/open on click.
// (Unchanged behavior; icon/badge point at /icon-192.png which exists.)
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = payload.title || "Kya & Co.";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    data: { url: payload.url || "/dashboard" },
    tag: payload.tag,
    requireInteraction: !!payload.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        try {
          await c.navigate(url);
          return c.focus();
        } catch { /* try next */ }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
