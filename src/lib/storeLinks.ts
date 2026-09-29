/**
 * Where to send someone who is using the web app on a phone.
 *
 * The apps are live on both stores, so "add this to your home screen" is no
 * longer the answer to anything: it was only ever a way to get web push on
 * iOS, and the native shells have real APNs/FCM push now.
 */
export const APP_STORE_ID = "6795267221";
export const ANDROID_PACKAGE = "com.thekyaproject.app";

export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/**
 * Apple's and Google's OFFICIAL badge artwork, downloaded from their brand
 * pages and served from our own origin — both stores require the supplied
 * files and forbid recreating them, and Google's guidelines forbid hotlinking.
 * Replacing either one means taking the current file from the store's brand
 * page, not editing these.
 */
export const APP_STORE_BADGE = "/brand/store/app-store-badge.svg";
export const PLAY_STORE_BADGE = "/brand/store/google-play-badge.png";

/** Badge intrinsic sizes, so the layout doesn't jump before they load. */
export const APP_STORE_BADGE_SIZE = { width: 120, height: 40 };
export const PLAY_STORE_BADGE_SIZE = { width: 103, height: 40 };

export type WebPlatform = "ios" | "android" | "desktop";

/**
 * Which phone (if any) the BROWSER is on. Deliberately separate from
 * nativePlatform() in nativeApp.ts: that answers "which shell am I inside",
 * this answers "which store should I point at", and they are only ever both
 * consulted on the web.
 *
 * iPadOS reports itself as a Mac, so the touch check catches it — an iPad
 * should get the App Store, not the desktop line.
 */
export function detectWebPlatform(): WebPlatform {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && "ontouchend" in document) return "ios"; // iPadOS
  if (/Android/.test(ua)) return "android";
  return "desktop";
}
