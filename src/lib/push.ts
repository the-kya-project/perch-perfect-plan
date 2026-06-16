/**
 * Client-side web-push helpers.
 *
 * Service-worker registration here is intentionally separate from
 * `sw-register.ts` (which gates registration on production). The push SW
 * has no fetch handler and no cache, so it's safe to register in any
 * environment — but only on user gesture (when they tap "Enable push").
 */

const SW_URL = "/sw.js";

export type PushSupport =
  | { ok: true }
  | { ok: false; reason: "no-sw" | "no-push" | "no-notifications" | "ios-not-installed" };

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && "ontouchend" in document);
}

function isStandalone(): boolean {
  // iOS Safari: navigator.standalone. Other browsers: display-mode media query.
  // @ts-expect-error iOS-only property
  if (typeof navigator.standalone === "boolean" && navigator.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

export function detectPushSupport(): PushSupport {
  if (typeof window === "undefined") return { ok: false, reason: "no-sw" };
  if (!("serviceWorker" in navigator)) return { ok: false, reason: "no-sw" };
  if (!("PushManager" in window)) return { ok: false, reason: "no-push" };
  if (!("Notification" in window)) return { ok: false, reason: "no-notifications" };
  if (isIOS() && !isStandalone()) return { ok: false, reason: "ios-not-installed" };
  return { ok: true };
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

/** Returns a PushSubscription JSON (or null if user declined). */
export async function subscribeToPush(vapidPublicKey: string): Promise<{
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
} | null> {
  const support = detectPushSupport();
  if (!support.ok) throw new Error(support.reason);

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const reg = await ensureRegistration();
  const key = urlBase64ToUint8Array(vapidPublicKey);
  // Copy into a fresh ArrayBuffer so the type matches BufferSource exactly
  // (Uint8Array<ArrayBufferLike> from atob is not assignable in strict TS).
  const appServerKey = new Uint8Array(key).buffer;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: appServerKey,
  });
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Browser did not return a usable subscription.");
  }
  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent,
  };
}

export async function unsubscribeFromPush(): Promise<string | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

export async function getCurrentEndpoint(): Promise<string | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}
