/// <reference lib="webworker" />
/**
 * The app's single service worker: asset caching + web push.
 *
 * Built by vite-plugin-pwa (`strategies: "injectManifest"`) into `/sw.js`.
 * This file replaces two workers that used to collide on that filename:
 * the generated workbox worker (caching) and a hand-written push-only worker
 * in `public/sw.js` that clobbered it at build time — leaving production with
 * push but NO caching, so every PWA launch re-downloaded the whole bundle.
 *
 * Registration is gated to production by `sw-register.ts`; when a new build
 * of this worker activates, that module reloads the page once (controllerchange)
 * so clients never keep running stale JS against a new worker.
 */
import { clientsClaim } from "workbox-core";
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// New SW takes over on the next page load instead of waiting for every
// controlled PWA window to close — without this, fixes can sit stuck behind
// the old SW for days on iOS where the user never fully quits the app.
self.skipWaiting();
clientsClaim();

// ── Caching ────────────────────────────────────────────────────────────────

// Hashed build assets (js/css/html/svg/ico/woff2 — see the injectManifest
// globPatterns in vite.config.ts). Served cache-first; each new build swaps
// the manifest and workbox drops entries the new build no longer references.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Sitter pages (including the owner's "View as sitter" preview iframe, which
// the active SW still controls) must always boot from the live build — never
// a cached shell that could reference purged JS chunks. Registered first so it
// wins over the generic navigation rule below.
registerRoute(
  ({ url, request }) => request.mode === "navigate" && url.pathname.startsWith("/sitter/"),
  new NetworkOnly(),
);

// App-shell navigations: network-first so updates land immediately when
// online, with the last-served shell as an offline/slow-network fallback.
// Server/infra paths get no route at all (straight to the network).
const NAV_BYPASS = [
  /^\/__/, // Lovable infra & asset URLs
  /^\/api\//, // server routes
  /^\/~oauth/, // OAuth callback
];
registerRoute(
  ({ url, request }) =>
    request.mode === "navigate" && !NAV_BYPASS.some((re) => re.test(url.pathname)),
  new NetworkFirst({ cacheName: "html-shell", networkTimeoutSeconds: 4 }),
);

registerRoute(
  ({ url }) => url.pathname.startsWith("/__l5e/assets-v1/"),
  new CacheFirst({
    cacheName: "lovable-cdn-assets",
    plugins: [new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// Same-origin static assets that slipped past the precache globs. Hashed
// filenames make these immutable, so cache-first is safe; the expiration
// plugin keeps abandoned entries from accumulating forever.
registerRoute(
  ({ request, sameOrigin }) =>
    sameOrigin && ["style", "script", "worker", "font"].includes(request.destination),
  new CacheFirst({
    cacheName: "static-assets",
    plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

// ── Web push ───────────────────────────────────────────────────────────────
// Payload shape comes from src/lib/pushSender.server.ts (sendPushToOwner).

self.addEventListener("push", (event) => {
  let payload: Record<string, unknown> = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = typeof payload.title === "string" && payload.title ? payload.title : "Kya & Co.";
  const options: NotificationOptions = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: typeof payload.icon === "string" && payload.icon ? payload.icon : "/appicon-192.png",
    badge: typeof payload.badge === "string" && payload.badge ? payload.badge : "/appicon-192.png",
    data: { url: typeof payload.url === "string" && payload.url ? payload.url : "/dashboard" },
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    requireInteraction: !!payload.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url || "/dashboard";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        try {
          await c.navigate(url);
          return c.focus();
        } catch {
          /* try next */
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
