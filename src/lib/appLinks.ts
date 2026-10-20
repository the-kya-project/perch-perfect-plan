/**
 * Universal Links (iOS) and App Links (Android): which links open in the
 * installed Kya & Co. app instead of the browser.
 *
 * ONE list, used everywhere, so the platforms can't drift apart:
 *   - /.well-known/apple-app-site-association   (routes/[.]well-known.*)
 *   - /.well-known/assetlinks.json              (routes/[.]well-known.*)
 *   - the Android intent filters in AndroidManifest.xml (checked against this
 *     list by scripts/app-links.test.ts — the manifest can't import it)
 *   - the in-app handler that routes an incoming link (appLinkNative.ts)
 *
 * The list is an ALLOW list of the app's own screens, not "everything except":
 * Android's intent filters can't express exclusions, and an allow list means a
 * new route stays in the browser until someone decides it belongs in the app.
 *
 * Deliberately NOT here, so they always open in the browser:
 *   /auth, /welcome    sign-in. Web Google/Apple sign-in and the signup
 *                      confirmation email land on /welcome?code=…, and PKCE
 *                      can only finish that exchange in the browser that
 *                      started it. If the app grabbed the redirect, the person
 *                      would be dropped mid-sign-in.
 *   /invite, /handoff  same reason: signup confirmations redirect back there
 *                      with a code, and the invitee usually has no app yet
 *   /r/… (on app.)     email click tracker — see CLICK_LINK_HOST below
 *   /api/…             unsubscribe and every other endpoint
 *   /sitter/…          sitter token links: sitters use the web, usually signed out
 *   /get, /get-app, /review   store redirects, which only make sense in a browser
 *   /reset-password, /confirm-email   Supabase auth links carrying one-time tokens
 *   /privacy, /terms, /delete-account public pages
 * Any link carrying ?code= is excluded on iOS for the same PKCE reason
 * (Android can't exclude by query; the in-app handler ignores those instead).
 *
 * Email click tracking. A tracked link goes to /r/<token>, which logs the click
 * and redirects. iOS won't open the app on a redirect within the same domain,
 * so a tracked link on app.thekyaproject.com would always stay in the browser.
 * Tracked links whose destination is an app screen are therefore sent from a
 * separate host, CLICK_LINK_HOST, whose /r/ paths DO open the app. The app then
 * loads app.thekyaproject.com/r/<token> itself: the click is logged and the
 * redirect lands on the screen, inside the app. With no app installed, the
 * same link works in the browser exactly as before.
 */

export const APP_LINK_HOST = "app.thekyaproject.com";
/** Serves only /r/ and /.well-known/. Same Vercel project as the app. */
export const CLICK_LINK_HOST = "links.thekyaproject.com";

/** Apple Team ID (ios/App/App.xcodeproj DEVELOPMENT_TEAM) + bundle id. */
export const APPLE_APP_ID = "DT93FSYJ9C.com.thekyaproject.app";
export const ANDROID_PACKAGE = "com.thekyaproject.app";

/** "/" itself, plus these prefixes and everything under them. */
export const APP_LINK_PREFIXES = [
  "/dashboard",
  "/today",
  "/check",
  "/explore",
  "/household",
  "/household-permissions",
  "/account",
  "/notifications",
  "/past-birds",
  "/remembering",
  "/scans",
  "/sits",
  "/birds",
  "/covering",
] as const;

/** On CLICK_LINK_HOST, only the tracker opens the app. */
export const CLICK_LINK_PREFIX = "/r";

/** Does this path on app.thekyaproject.com open in the app? Query strings and
 *  fragments are ignored. */
export function isAppLinkPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "") return true;
  return APP_LINK_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type IncomingLink =
  /** An app screen: route to it inside the SPA. */
  | { kind: "route"; href: string }
  /** A tracked email link: load it as a page so the server logs and redirects. */
  | { kind: "load"; href: string };

/**
 * What the app should do with a link the OS handed it, or null when the link
 * isn't ours to handle. Keeps the query string — /birds/new?next=weight must
 * arrive with `next` intact.
 */
export function incomingLink(url: string): IncomingLink | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if (u.hostname === APP_LINK_HOST) {
    if (!isAppLinkPath(u.pathname) || u.searchParams.has("code")) return null;
    return { kind: "route", href: `${u.pathname}${u.search}${u.hash}` };
  }
  if (u.hostname === CLICK_LINK_HOST) {
    if (!/^\/r\/[^/]+$/.test(u.pathname)) return null;
    return { kind: "load", href: `https://${APP_LINK_HOST}${u.pathname}` };
  }
  return null;
}

/**
 * apple-app-site-association for the host serving it. iOS 13+ `components`
 * format: one entry per path, plus a `/*` twin for everything under it. Query
 * strings match by default, so /birds/new?next=weight matches /birds/*.
 * Components are checked in order, so the ?code= exclusion comes first.
 */
export function appleAppSiteAssociation(host: string = APP_LINK_HOST) {
  const components =
    host === CLICK_LINK_HOST
      ? [{ "/": `${CLICK_LINK_PREFIX}/*`, comment: "Tracked email links" }]
      : [
          { "/": "*", "?": { code: "*" }, exclude: true, comment: "Sign-in redirects stay in the browser" },
          { "/": "/", comment: "Home" },
          ...APP_LINK_PREFIXES.flatMap((p) => [{ "/": p }, { "/": `${p}/*` }]),
        ];
  return { applinks: { details: [{ appIDs: [APPLE_APP_ID], components }] } };
}

/**
 * assetlinks.json (the same on both hosts). The fingerprint is the PLAY APP
 * SIGNING key's SHA-256 (Play Console → Test and release → App integrity → App
 * signing), not the upload key — Play re-signs the app. It comes from
 * ANDROID_APP_SIGNING_SHA256 (comma-separated for more than one). Unset → an
 * empty statement list: valid, verifies nothing, and Android links keep opening
 * in the browser until it's set.
 */
export function assetLinks(fingerprints: string[]) {
  if (fingerprints.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: fingerprints },
    },
  ];
}

/** Parse ANDROID_APP_SIGNING_SHA256: "AB:CD:…, EF:…" → normalised, upper case. */
export function parseFingerprints(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(s));
}

/**
 * Which origin a tracked email link should use. App screens go through
 * EMAIL_CLICK_ORIGIN (https://links.thekyaproject.com once that domain is
 * live) so they can open the app; everything else, and everything while the
 * variable is unset, stays on the app origin.
 */
export function clickOriginFor(destination: string, clickOrigin: string | undefined): string {
  const appOrigin = `https://${APP_LINK_HOST}`;
  const alt = clickOrigin?.trim().replace(/\/$/, "");
  if (!alt || !/^https:\/\/[a-z0-9.-]+$/i.test(alt)) return appOrigin;
  try {
    const d = new URL(destination);
    return d.hostname === APP_LINK_HOST && isAppLinkPath(d.pathname) && !d.searchParams.has("code") ? alt : appOrigin;
  } catch {
    return appOrigin;
  }
}
