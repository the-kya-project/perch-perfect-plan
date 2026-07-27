/**
 * OAuth for the native shell (App Store / Play Store builds).
 *
 * In a browser, Supabase OAuth is a plain redirect and comes back to the site.
 * Inside the shell that breaks: Google's domain escapes to the system browser
 * and the session lands in Safari, not the app (and Google forbids OAuth
 * inside embedded webviews, so keeping it in the webview is not an option).
 *
 * Native flow instead:
 *  1. `signInWithOAuth` with `skipBrowserRedirect` — we get the provider URL
 *     without navigating the webview.
 *  2. Open it in the in-app system browser sheet (@capacitor/browser).
 *  3. Supabase redirects to the `kya://auth-callback` deep link (must be in
 *     the Supabase auth allowlist); iOS/Android hand it to the app.
 *  4. The appUrlOpen listener exchanges the code for a session (PKCE) and
 *     navigates to the intended destination.
 *
 * Plugins are imported dynamically so none of this ships in the web bundle.
 */
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp } from "./nativeApp";
import { track } from "./analytics";

const CALLBACK_URL = "kya://auth-callback";
const DEST_KEY = "native-oauth-dest";

let listenerInstalled = false;

async function installCallbackListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  const { App } = await import("@capacitor/app");
  await App.addListener("appUrlOpen", ({ url }) => {
    if (!url.startsWith(CALLBACK_URL)) return;
    void completeSignIn(url);
  });
  // Cold start: if iOS relaunched the app via the callback URL, no appUrlOpen
  // event fires — the URL arrives as the launch URL instead.
  const launch = await App.getLaunchUrl();
  if (launch?.url?.startsWith(CALLBACK_URL)) void completeSignIn(launch.url);
}

/** Navigate inside the running SPA. A full reload (location.assign) races the
 *  session write: the fresh page's auth guard can mount before the new session
 *  is readable and bounce to /auth even though sign-in succeeded (seen on
 *  device in TestFlight build 1). The live app already holds the session in
 *  memory, so an in-app navigation can't lose. */
function spaNavigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
}

async function completeSignIn(url: string) {
  track("native_oauth_callback", { has_code: url.includes("code=") });
  const { Browser } = await import("@capacitor/browser");
  try { await Browser.close(); } catch { /* sheet may already be closed */ }

  const code = new URLSearchParams(url.split("?")[1] ?? "").get("code");
  const dest = sessionStorage.getItem(DEST_KEY) || "/welcome";
  sessionStorage.removeItem(DEST_KEY);

  if (!code) {
    track("native_oauth_failed", { stage: "no-code", url_shape: url.split("?")[0] });
    spaNavigate("/auth?error=oauth-cancelled");
    return;
  }

  // The token exchange can fail transiently on device — the fetch races the
  // in-app browser teardown / network transition (observed on TestFlight: a
  // failed exchange with an empty error message, and an immediate retry
  // succeeds). So: try, and on failure check whether a session landed anyway
  // (detectSessionInUrl or a partial success), then retry a couple of times
  // with backoff before giving up. Only a genuinely dead code fails all paths.
  let lastMessage = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      track("native_oauth_exchanged", { dest, attempt });
      spaNavigate(dest);
      return;
    }
    lastMessage = error.message || "empty";
    // Did a session arrive despite the error? Then we're actually signed in.
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      track("native_oauth_exchanged", { dest, attempt, via: "session-present" });
      spaNavigate(dest);
      return;
    }
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }

  track("native_oauth_failed", { stage: "exchange", message: lastMessage });
  spaNavigate("/auth?error=oauth-failed");
}

type OAuthProvider = "google" | "apple";

/**
 * OAuth sign-in that works in both worlds. `redirectTo` is the full URL the
 * web flow should land on; the native flow reuses its path after the deep-link
 * exchange. Rejects with an Error on failure to start (call sites toast it).
 */
export async function signInWithProvider(provider: OAuthProvider, redirectTo: string): Promise<void> {
  if (!isNativeApp()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) throw new Error(error.message);
    return; // browser is navigating away
  }

  await installCallbackListener();
  track("native_oauth_started", { provider });
  try {
    sessionStorage.setItem(DEST_KEY, new URL(redirectTo).pathname + new URL(redirectTo).search);
  } catch { /* keep default dest */ }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: CALLBACK_URL, skipBrowserRedirect: true },
  });
  if (error || !data?.url) throw new Error(error?.message ?? "Could not start sign-in.");

  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: data.url });
}

export const signInWithGoogle = (redirectTo: string) => signInWithProvider("google", redirectTo);
// Sign in with Apple (required alongside Google per App Store guideline 4.8)
// uses the same rails — UI button + Supabase provider config land once the
// Apple Developer account exists (Services ID + key come from that account).
export const signInWithApple = (redirectTo: string) => signInWithProvider("apple", redirectTo);
