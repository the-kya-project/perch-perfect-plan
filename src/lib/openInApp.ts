/**
 * "Open in the Kya & Co. app": the button an iPhone browser shows on pages
 * people reach from email links, so someone who lands in Safari (signed out,
 * or simply not in the app) can jump to the same screen in the app.
 *
 * It uses the app's own URL scheme, APP_URL_SCHEME, which only exists from the
 * iOS build that registers it in Info.plist. iOS can't tell a web page whether
 * an app handles a scheme, so the button tries the scheme and, if the page is
 * still showing a moment later, sends the person to the App Store instead.
 *
 * Which screens qualify is the same allow list Universal Links use
 * (appLinks.ts): sign-in, sitter links, invites and store pages never offer it.
 * On /auth, the target is the screen the email pointed at (?redirect=).
 */
import { APP_URL_SCHEME, isAppLinkPath } from "./appLinks";
import { isNativeApp } from "./nativeApp";
import { safeInternalPath } from "./returnTo";

export { APP_URL_SCHEME };

/**
 * Whether the installed app can answer APP_URL_SCHEME. False until the iOS
 * build that registers it is live on the App Store: before then, tapping the
 * button would show Safari's "address is invalid" alert to everyone with the
 * current app. Flip to true in the release that follows that build's approval.
 */
export const APP_URL_SCHEME_LIVE = false;

/** The app screen this page should open in the app, or null when the page
 *  shouldn't offer it. Keeps the query string. */
export function openInAppPath(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.has("code")) return null;
  if (pathname === "/auth") {
    const target = safeInternalPath(params.get("redirect"));
    if (!target) return null;
    const [path] = target.split(/[?#]/);
    return isAppLinkPath(path) && !target.includes("code=") ? target : null;
  }
  if (!isAppLinkPath(pathname)) return null;
  const query = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `${pathname}${query}`;
}

/** kyaco://open/birds/123?next=weight */
export function appSchemeUrl(path: string): string {
  return `${APP_URL_SCHEME}://open${path.startsWith("/") ? path : `/${path}`}`;
}

/** A browser on an iPhone or iPod, not the app itself. iPads are left out:
 *  the app is built for iPhone first, and iPadOS reports itself as a Mac. */
export function isIPhoneBrowser(): boolean {
  if (typeof navigator === "undefined" || isNativeApp()) return false;
  return /iPhone|iPod/.test(navigator.userAgent);
}

/** How long to wait for the app to take over before falling back to the App
 *  Store. Long enough for iOS's "Open in Kya & Co.?" step to finish. */
const FALLBACK_MS = 1800;

/**
 * Try the app; if the page is still in front after FALLBACK_MS, the app isn't
 * installed (or is too old for the scheme), so go to the App Store. When the
 * app opens, Safari is hidden and the timer is cancelled.
 */
export function openInApp(path: string, appStoreUrl: string): void {
  let left = false;
  const onHide = () => { if (document.visibilityState === "hidden") left = true; };
  const onPageHide = () => { left = true; };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onPageHide);
  window.setTimeout(() => {
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onPageHide);
    if (!left && document.visibilityState === "visible") window.location.href = appStoreUrl;
  }, FALLBACK_MS);
  window.location.href = appSchemeUrl(path);
}
