/**
 * TikTok ads pixel — marketing surface only.
 *
 * Loaded on the public pages ad traffic can land on (landing + auth), never
 * inside the authenticated app: ad attribution only needs the top of the
 * funnel, and third-party trackers stay out of the area where owners record
 * health data. Production-only; dev and previews are silent no-ops.
 *
 * The pixel ID is not a secret (it ships in page source on every site that
 * runs the pixel), so it lives here rather than in an env var.
 */

import { isNativeApp } from "./nativeApp";

const PIXEL_ID = "D9BPFN3C77U03DOJEBE0";

type Ttq = {
  page: () => void;
  track: (event: string, props?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    ttq?: Ttq;
    TiktokAnalyticsObject?: string;
  }
}

let injected = false;

function enabled(): boolean {
  // Never inside the App Store / Play Store shell: an ad-attribution tracker
  // there would trigger Apple's App Tracking Transparency requirements (owner
  // decision 2026-07-24: drop it from native, keep it on the web).
  if (isNativeApp()) return false;
  return typeof window !== "undefined" && import.meta.env.PROD;
}

/**
 * Inject the pixel (fires its own PageView on load). Safe to call from every
 * marketing page: after the first injection it just records a new pageview,
 * which covers SPA navigations like landing → auth.
 */
export function loadTikTokPixel(): void {
  if (!enabled()) return;
  if (injected) {
    window.ttq?.page();
    return;
  }
  injected = true;
  // Official TikTok loader snippet, verbatim apart from formatting — it
  // installs a queuing `ttq` stub so calls made before events.js arrives
  // are replayed. CSP: script-src/connect-src allow analytics.tiktok.com.
  const s = document.createElement("script");
  s.textContent = `!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
  ttq.load('${PIXEL_ID}');
  ttq.page();
}(window, document, 'ttq');`;
  document.head.appendChild(s);
}

/** The conversion TikTok optimizes ad delivery against — fire once per signup. */
export function trackTikTokSignup(): void {
  if (!enabled()) return;
  window.ttq?.track("CompleteRegistration");
}
