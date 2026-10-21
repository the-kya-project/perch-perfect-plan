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
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import type { WorkboxPlugin } from "workbox-core/types";

/** Never store a response that isn't the real file: a 404 page, a redirect, or
 *  HTML served in place of a script. Cache-first never re-checks what it has,
 *  so one bad copy caught mid-deploy would be served forever (the 2026-10-21
 *  iOS reload loop). */
const onlyRealFiles: WorkboxPlugin = {
  cacheWillUpdate: async ({ response, request }) => {
    if (!response || response.status !== 200 || response.redirected) return null;
    const type = response.headers.get("content-type") ?? "";
    if (/text\/html/i.test(type) && request.destination !== "document") return null;
    return response;
  },
};

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

// New SW takes over on the next page load instead of waiting for every
// controlled PWA window to close — without this, fixes can sit stuck behind
// the old SW for days on iOS where the user never fully quits the app.
self.skipWaiting();
clientsClaim();

/** The cache of last-served page HTML (offline fallback for navigations). */
const HTML_SHELL_CACHE = "html-shell";

// Was another build's worker in charge when this one installed? Only then is
// activating an UPDATE that has to reach pages already open.
let replacingAnotherBuild = false;
self.addEventListener("install", () => {
  replacingAnotherBuild = !!self.registration.active;
});

// A new build is taking over. Saved page HTML belongs to the build that saved
// it and names that build's code files, which a deploy removes from the server
// and this worker's precache. Serving it would load a page that can never
// start (the 2026-10-21 iOS "stuck on the loading screen": a slow cold launch
// fell back to old HTML, its scripts 404'd, and no app code ran to recover).
// So drop it, then reload the open pages once onto this build. That reload is
// what rescues a page already stuck on old HTML: it has no working code of its
// own, so it can't ask. Once per activation, so it can never loop.
self.addEventListener("activate", (event) => {
  const takeOver = (async () => {
    await caches.delete(HTML_SHELL_CACHE);
    await self.clients.claim();
  })();
  event.waitUntil(takeOver);
  // The reload must NOT be part of waitUntil: the reloaded page's request is
  // held until this worker finishes activating, so waiting on it here would
  // deadlock and freeze the page. Start it once activation is under way.
  void takeOver.then(async () => {
    if (!replacingAnotherBuild) return;
    const windows = await self.clients.matchAll({ type: "window" });
    await Promise.all(windows.map((c) => c.navigate(c.url).catch(() => null)));
  });
});

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
/** How long a page may take to arrive before the reader is told so. */
const SLOW_PAGE_MS = 10_000;

/** "Something's taking too long" with a Try again button, for a page that
 *  hasn't arrived after SLOW_PAGE_MS. Self-contained HTML: no app code, no
 *  automatic reload. Matches the in-page screen in __root.tsx. */
function slowPage(): Response {
  const lang = (self.navigator.language || "").toLowerCase().startsWith("nl") ? "nl" : "en";
  const copy = lang === "nl"
    ? { title: "Dit duurt te lang", body: "Controleer je verbinding en probeer het opnieuw.", button: "Opnieuw proberen" }
    : { title: "Something's taking too long", body: "Check your connection, then try again.", button: "Try again" };
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` +
    `<meta name="theme-color" content="#1a3d2e"><title>Kya &amp; Co.</title></head>` +
    `<body style="margin:0;background:#1a3d2e">` +
    `<div role="alert" style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;color:#fff;font-family:'DM Sans',system-ui,-apple-system,sans-serif;padding:calc(env(safe-area-inset-top) + 24px) 28px calc(env(safe-area-inset-bottom) + 24px)">` +
    `<h1 style="margin:0;font:700 28px/1.2 Newsreader,Georgia,serif">${copy.title}</h1>` +
    `<p style="margin:0;max-width:30ch;font-size:15px;line-height:1.5;color:#d6e8dc">${copy.body}</p>` +
    `<button type="button" onclick="this.disabled=true;location.reload()" style="margin-top:12px;min-height:52px;padding:0 32px;border-radius:999px;border:2px solid #12291f;background:#f2b33d;color:#1a3d2e;font:700 16px 'DM Sans',system-ui,sans-serif">${copy.button}</button>` +
    `</div></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

/** Wrap a navigation strategy so a page that hasn't arrived in SLOW_PAGE_MS
 *  shows slowPage() instead of a spinner that never ends. */
function withSlowPage(strategy: NetworkFirst | NetworkOnly) {
  return (options: Parameters<NetworkOnly["handle"]>[0]) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const slow = new Promise<Response>((resolve) => { timer = setTimeout(() => resolve(slowPage()), SLOW_PAGE_MS); });
    return Promise.race([strategy.handle(options), slow]).finally(() => clearTimeout(timer));
  };
}

// Sitter pages (including the owner's "View as sitter" preview iframe, which
// the active SW still controls) must always boot from the live build — never
// a cached shell that could reference purged JS chunks. Registered first so it
// wins over the generic navigation rule below.
registerRoute(
  ({ url, request }) => request.mode === "navigate" && url.pathname.startsWith("/sitter/"),
  withSlowPage(new NetworkOnly()),
);

// App-shell navigations: network-first so updates land immediately, with the
// last-served page as an OFFLINE fallback only. No network timeout: a slow
// cold launch must wait for the real page, never fall back to saved HTML
// (see the activate handler above for why that HTML can't start); after
// SLOW_PAGE_MS the reader gets the "taking too long" page instead.
// Server/infra paths get no route at all (straight to the network).
const NAV_BYPASS = [
  /^\/__/, // Lovable infra & asset URLs
  /^\/api\//, // server routes
  /^\/~oauth/, // OAuth callback
];
registerRoute(
  ({ url, request }) =>
    request.mode === "navigate" && !NAV_BYPASS.some((re) => re.test(url.pathname)),
  withSlowPage(new NetworkFirst({ cacheName: HTML_SHELL_CACHE, plugins: [onlyRealFiles] })),
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
  ({ url, request, sameOrigin }) =>
    sameOrigin &&
    // /ingest/* is the PostHog reverse proxy — its SDK script isn't hashed,
    // so a 30-day cache-first would pin a stale analytics build.
    !url.pathname.startsWith("/ingest/") &&
    ["style", "script", "worker", "font"].includes(request.destination),
  new CacheFirst({
    cacheName: "static-assets",
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      onlyRealFiles,
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
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
