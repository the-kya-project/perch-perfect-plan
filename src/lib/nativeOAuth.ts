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

// Bump on each deploy while debugging the native sign-in, so the breadcrumbs
// prove which build the device actually ran (rules out webview cache).
const OAUTH_BUILD = "simplify-b5";

function verifierPresent(): string {
  try {
    return Object.keys(localStorage).filter((k) => k.includes("code-verifier")).join(",") || "none";
  } catch {
    return "err";
  }
}

// The PKCE verifier disappears mid-flow on device: supabase-js stores it under
// sb-<ref>-auth-token-code-verifier, but the webview reloads while the Google
// sheet is open and a fresh supabase-js init clears the "abandoned" verifier —
// so the deep-link exchange finds nothing and fails flow_state_not_found
// (proven on TestFlight: present at signin, gone at exchange). We keep our own
// copy under a key supabase-js never touches, and restore it before exchanging.
const BACKUP_KEY = "kya-pkce-verifier-backup";

function backupVerifier() {
  try {
    const k = Object.keys(localStorage).find((x) => x.includes("code-verifier"));
    if (k) localStorage.setItem(BACKUP_KEY, JSON.stringify({ k, v: localStorage.getItem(k) }));
  } catch { /* storage unavailable */ }
}

/** Ensure the sb-*-code-verifier key exists before exchange; restore from our
 *  backup if supabase-js dropped it. Returns whether a restore was needed. */
function restoreVerifierIfMissing(): "present" | "restored" | "no-backup" {
  try {
    if (Object.keys(localStorage).some((x) => x.includes("code-verifier"))) return "present";
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return "no-backup";
    const { k, v } = JSON.parse(raw) as { k: string; v: string | null };
    if (k && v != null) { localStorage.setItem(k, v); return "restored"; }
    return "no-backup";
  } catch {
    return "no-backup";
  }
}

/** What flow the live client is really using — reads the private option. */
function clientFlowType(): string {
  try {
    // @ts-expect-error reaching into the client to confirm the effective flow
    return supabase.auth?.flowType ?? "unknown";
  } catch {
    return "err";
  }
}

const CALLBACK_URL = "kya://auth-callback";
const DEST_KEY = "native-oauth-dest";

let listenerInstalled = false;
// Guard against exchanging the same one-time code twice (double appUrlOpen, or
// a stale relaunch URL) — a second exchange of a consumed code returns
// flow_state_not_found and stomps a session that already succeeded.
const handledCodes = new Set<string>();

async function installCallbackListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  const { App } = await import("@capacitor/app");
  await App.addListener("appUrlOpen", ({ url }) => {
    if (!url.startsWith(CALLBACK_URL)) return;
    void completeSignIn(url);
  });
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
  const { Browser } = await import("@capacitor/browser");
  try { await Browser.close(); } catch { /* sheet may already be closed */ }

  const code = new URLSearchParams(url.split("?")[1] ?? "").get("code");
  const dest = sessionStorage.getItem(DEST_KEY) || "/welcome";

  if (!code) {
    track("native_oauth_failed", { stage: "no-code", url_shape: url.split("?")[0] });
    spaNavigate("/auth?error=oauth-cancelled");
    return;
  }
  // Never exchange the same code twice (would fail flow_state_not_found and
  // could stomp a session the first exchange already created).
  if (handledCodes.has(code)) {
    track("native_oauth_callback", { build: OAUTH_BUILD, dedup: true });
    return;
  }
  handledCodes.add(code);
  sessionStorage.removeItem(DEST_KEY);

  restoreVerifierIfMissing();
  track("native_oauth_callback", { build: OAUTH_BUILD, has_code: true });

  // Single exchange — the proven-working path when PKCE is active. The /auth
  // onAuthStateChange listener is the navigation safety net.
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
    try { localStorage.removeItem(BACKUP_KEY); } catch { /* ignore */ }
    track("native_oauth_exchanged", { dest });
    spaNavigate(dest);
    return;
  }
  // A session can exist despite an error (e.g. a duplicate that raced us).
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    track("native_oauth_exchanged", { dest, via: "session-present" });
    spaNavigate(dest);
    return;
  }
  const e = error as { message?: string; code?: string; status?: number };
  let verifierKeys = "none";
  try {
    verifierKeys = Object.keys(localStorage).filter((k) => k.includes("code-verifier")).join(",") || "none";
  } catch { /* storage unavailable */ }
  track("native_oauth_failed", {
    stage: "exchange",
    build: OAUTH_BUILD,
    flow: clientFlowType(),
    message: e.message || "empty",
    code: e.code ?? "none",
    status: e.status ?? 0,
    verifier_keys: verifierKeys,
  });
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
  track("native_oauth_started", { provider, build: OAUTH_BUILD, flow: clientFlowType() });
  // Start clean: dismiss any lingering sheet and drop stale PKCE verifiers from
  // abandoned attempts, so the server flow_state and the local verifier both
  // belong to THIS attempt only (stale/racing flows → flow_state_not_found).
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.close();
  } catch { /* no sheet open */ }
  try {
    Object.keys(localStorage)
      .filter((k) => k.includes("code-verifier") || k === BACKUP_KEY)
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
  try {
    sessionStorage.setItem(DEST_KEY, new URL(redirectTo).pathname + new URL(redirectTo).search);
  } catch { /* keep default dest */ }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: CALLBACK_URL, skipBrowserRedirect: true },
  });
  // Keep our own copy of the verifier before the browser opens — supabase-js's
  // copy can be wiped by a webview reload during the sheet.
  backupVerifier();
  track("native_oauth_started", { build: OAUTH_BUILD, stage: "post-signin", verifier: verifierPresent(), has_url: !!data?.url });
  if (error || !data?.url) throw new Error(error?.message ?? "Could not start sign-in.");

  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: data.url });
}

export const signInWithGoogle = (redirectTo: string) => signInWithProvider("google", redirectTo);
// Sign in with Apple (required alongside Google per App Store guideline 4.8)
// uses the same rails — UI button + Supabase provider config land once the
// Apple Developer account exists (Services ID + key come from that account).
export const signInWithApple = (redirectTo: string) => signInWithProvider("apple", redirectTo);
