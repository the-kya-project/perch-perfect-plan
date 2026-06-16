/**
 * Service worker for web push notifications.
 *
 * Intentionally has NO fetch handler and NO cache logic — its only job is
 * to receive `push` events and surface notifications, and to focus/open the
 * app when the user taps one. This keeps it safe to register in any
 * environment (preview, dev, prod) without risking stale-HTML problems.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = payload.title || "Parrot Care Co-Pilot";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/__l5e/assets-v1/9ff5e2dc-f264-49a0-8d38-75b4993798df/kya_appicon_tile_512.png",
    badge: payload.badge || "/__l5e/assets-v1/9ff5e2dc-f264-49a0-8d38-75b4993798df/kya_appicon_tile_512.png",
    data: { url: payload.url || "/dashboard" },
    tag: payload.tag,
    requireInteraction: !!payload.requireInteraction,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      try {
        await c.navigate(url);
        return c.focus();
      } catch { /* try next */ }
    }
    return self.clients.openWindow(url);
  })());
});
