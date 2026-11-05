/**
 * The web-OAuth fallback for the native app, used only when the native
 * sign-in plugin (SocialLogin) isn't in the installed build.
 *
 * Background (Nov 2026): an iOS install reported `"SocialLogin" plugin is not
 * implemented on ios` on every Apple sign-in. The plugin lives in the native
 * binary, so web code can't add it back, but it can avoid the dead end. The
 * round trip:
 *
 *   1. In the app, supabase.auth.signInWithOAuth(skipBrowserRedirect) creates
 *      the PKCE verifier in the app's own storage and returns the provider URL.
 *   2. That URL opens in an in-app browser sheet (@capacitor/browser:
 *      SFSafariViewController on iOS). Apple or Google, then Supabase, send the
 *      sheet to APP_RETURN_PATH on app.thekyaproject.com with ?code=…
 *      (that path, with a code, never opens the app as a Universal Link: the
 *      association file excludes every ?code= URL).
 *   3. APP_RETURN_PATH, loaded in the sheet, can't use the code (the verifier
 *      is in the app, not the sheet), so it hands it to the app on the app's
 *      own scheme: kyaco://auth-callback?code=…
 *   4. The app's link handler (appLinkNative → incomingLink) routes that to
 *      APP_RETURN_PATH inside the app, which closes the sheet, exchanges the
 *      code with the verifier it holds, and moves on to `next` signed in.
 *
 * Pure functions only, so scripts/app-links.test.ts can pin them.
 */
import { APP_URL_SCHEME } from "./appLinks";

/** The page both halves of the round trip land on (routes/app-signin-return.tsx). */
export const APP_RETURN_PATH = "/app-signin-return";

/** kyaco://auth-callback — the host the sheet hands the code back on. */
export const APP_AUTH_CALLBACK_HOST = "auth-callback";

/** Where to go when `next` is missing or isn't one of our own paths. */
export const DEFAULT_NEXT = "/welcome";

export type FallbackProvider = "google" | "apple";

/** A same-origin path only: "/x…", never "//host" or "https://…". */
export function safeNext(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return DEFAULT_NEXT;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return DEFAULT_NEXT;
  if (next.length > 512) return DEFAULT_NEXT;
  return next;
}

function safeProvider(p: string | null | undefined): FallbackProvider | undefined {
  return p === "google" || p === "apple" ? p : undefined;
}

/**
 * The redirectTo given to Supabase: APP_RETURN_PATH on the app's origin,
 * carrying where to go afterwards and which provider it was. `redirectTo` is
 * the full URL the sign-in buttons already pass (origin + path).
 */
export function appReturnRedirect(redirectTo: string, provider: FallbackProvider): string {
  let origin = "https://app.thekyaproject.com";
  let next = DEFAULT_NEXT;
  try {
    const u = new URL(redirectTo);
    origin = u.origin;
    next = safeNext(u.pathname + u.search);
  } catch { /* keep the defaults */ }
  const q = new URLSearchParams({ next, p: provider });
  return `${origin}${APP_RETURN_PATH}?${q.toString()}`;
}

export type AppReturnParams = {
  code?: string;
  /** The provider's or Supabase's error, when the sign-in didn't finish. */
  error?: string;
  next: string;
  provider?: FallbackProvider;
};

/** Read APP_RETURN_PATH's query string (or a kyaco://auth-callback link's). */
export function readAppReturnParams(search: string | URLSearchParams): AppReturnParams {
  const q = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  const code = q.get("code") || undefined;
  const error = (q.get("error_description") || q.get("error") || "").slice(0, 200) || undefined;
  return { code, error, next: safeNext(q.get("next")), provider: safeProvider(q.get("p")) };
}

function toQuery(p: AppReturnParams): string {
  const q = new URLSearchParams();
  if (p.code) q.set("code", p.code);
  if (p.error) q.set("error", p.error);
  q.set("next", p.next);
  if (p.provider) q.set("p", p.provider);
  return q.toString();
}

/** What the sheet opens to hand the result back to the app. */
export function appCallbackUrl(p: AppReturnParams): string {
  return `${APP_URL_SCHEME}://${APP_AUTH_CALLBACK_HOST}?${toQuery(p)}`;
}

/**
 * The in-app route for a kyaco://auth-callback link, or null when the link
 * isn't one. Called from incomingLink().
 */
export function appCallbackRoute(url: URL): string | null {
  if (url.protocol !== `${APP_URL_SCHEME}:` || url.hostname !== APP_AUTH_CALLBACK_HOST) return null;
  const p = readAppReturnParams(url.searchParams);
  if (!p.code && !p.error) return null;
  return `${APP_RETURN_PATH}?${toQuery(p)}`;
}
