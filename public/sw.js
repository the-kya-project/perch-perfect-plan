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
  const title = payload.title || "Kya & Co.";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/appicon-192.png",
    badge: payload.badge || "/appicon-192.png",
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
