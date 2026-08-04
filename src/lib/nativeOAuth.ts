/**
 * OAuth sign-in for both web and the native shell.
 *
 * WEB: the standard Supabase redirect flow (signInWithOAuth → provider →
 * /welcome, session picked up by detectSessionInUrl). Unchanged and reliable.
 *
 * NATIVE (App Store / Play Store): the OS-native account pickers via
 * @capgo/capacitor-social-login, then hand the resulting identity token to
 * Supabase with signInWithIdToken(). This replaces the old kya:// deep-link
 * PKCE flow, which was intermittently failing with flow_state_not_found on
 * device (the browser-sheet + custom-scheme + webview-reload chain is fragile;
 * server logs confirmed the flow-state race). signInWithIdToken has no browser,
 * no deep link, no PKCE — Apple/Google verify natively and Supabase verifies
 * the token. Also delivers Sign in with Apple (App Store requirement).
 *
 * The plugin is imported dynamically so none of it ships in the web bundle.
 */
import { supabase } from "@/integrations/supabase/client";
import { isNativeApp, nativePlatform } from "./nativeApp";
import { track, type AnalyticsEventName } from "./analytics";

type OAuthProvider = "google" | "apple";

// --- Diagnostics helpers (must never themselves throw and break sign-in) ---
//
// Property keys are chosen to survive analytics' scrub(): it drops any key
// matching /email|name|token|note|message|address|phone|url|path|file/ AND any
// string value longer than 80 chars. That is exactly why the old
// native_oauth_failed { message } carried nothing — `message` was stripped. So
// we use `err` (not `message`), `code` (not `name`), and pre-truncate values.

function safeTrack(name: AnalyticsEventName, props: Record<string, string | number | boolean | undefined>): void {
  try {
    track(name, props);
  } catch {
    /* instrumentation is best-effort; never let it break the sign-in flow */
  }
}

/** ms since page load — a stand-in for "since app boot" that needs no baseline. */
function msSinceBoot(): number | undefined {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return Math.round(performance.now());
    }
  } catch { /* ignore */ }
  return undefined;
}

/** Error message, whitespace-collapsed and capped at 80 chars so scrub() keeps it. */
function errText(e: unknown): string {
  let s = "";
  try { s = e instanceof Error ? e.message : String(e); } catch { s = "unknown"; }
  return s.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Error code or name, if the thrown value carries one. Safe key, short value. */
function errCode(e: unknown): string | undefined {
  try {
    const anyE = e as { code?: unknown; name?: unknown } | null;
    const c = anyE?.code ?? anyE?.name;
    return c == null ? undefined : String(c).slice(0, 40);
  } catch {
    return undefined;
  }
}

// Supabase's Google provider uses this web client id; the native Google SDK
// also needs an iOS OAuth client id from the same Google Cloud project, added
// to Supabase's authorized client ids. Filled once the iOS client is created.
const GOOGLE_WEB_CLIENT_ID = "481724773308-plqmbh26monghfpbtnr1cgfib1v3cqjs.apps.googleusercontent.com";
const GOOGLE_IOS_CLIENT_ID = "481724773308-85q8knidtnhf5f8i9g65ha3mflhg85eb.apps.googleusercontent.com";

let initialized = false;
async function ensureInitialized() {
  if (initialized) return;
  // The whole init path (dynamic import → SocialLogin.initialize) is wrapped so
  // we always emit native_oauth_init with its outcome. An init throw here is the
  // lead suspect for the ~3-6 ms native_oauth_failed events; this event makes it
  // visible and distinguishes it from a later login/exchange failure.
  try {
    const { SocialLogin } = await import("@capgo/capacitor-social-login");
    // Apple is included ONLY on iOS — on Android the plugin's apple config
    // requires a Services-ID redirectUrl (web flow), and passing apple:{} there
    // fails initialize entirely ("apple.android.redirectUrl is null or empty"),
    // which would also break Google. Apple sign-in is iOS-only for us anyway.
    const config: Parameters<typeof SocialLogin.initialize>[0] = {
      google: {
        webClientId: GOOGLE_WEB_CLIENT_ID,
        ...(GOOGLE_IOS_CLIENT_ID ? { iOSClientId: GOOGLE_IOS_CLIENT_ID } : {}),
        mode: "online",
      },
    };
    if (nativePlatform() === "ios") config.apple = {};
    await SocialLogin.initialize(config);
    initialized = true;
    safeTrack("native_oauth_init", {
      ok: true,
      platform: nativePlatform(),
      ms_since_boot: msSinceBoot(),
    });
  } catch (e) {
    safeTrack("native_oauth_init", {
      ok: false,
      platform: nativePlatform(),
      ms_since_boot: msSinceBoot(),
      err: errText(e),
      code: errCode(e),
    });
    throw e;
  }
}

// rawNonce goes to Supabase; its SHA-256 digest goes to Google in the token.
async function makeNonce(): Promise<{ raw: string; digest: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const raw = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  const digest = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
  return { raw, digest };
}

async function nativeGoogle(): Promise<void> {
  if (!GOOGLE_IOS_CLIENT_ID) throw new Error("Google sign-in isn't set up yet on this build.");
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  const { raw, digest } = await makeNonce();
  const res = await SocialLogin.login({
    provider: "google",
    options: { scopes: ["email", "profile"], nonce: digest },
  });
  const idToken = (res.result as { idToken?: string })?.idToken;
  if (!idToken) throw new Error("No Google identity token returned.");
  const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce: raw });
  if (error) throw new Error(error.message);
}

async function nativeApple(): Promise<void> {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  const res = await SocialLogin.login({
    provider: "apple",
    options: { scopes: ["email", "name"] },
  });
  const idToken = (res.result as { idToken?: string })?.idToken;
  if (!idToken) throw new Error("No Apple identity token returned.");
  const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: idToken });
  if (error) throw new Error(error.message);
}

/**
 * Sign in with a provider. On the web, redirects (call navigates away). In the
 * native shell, uses the OS-native picker and returns once signed in — call
 * sites should navigate to their destination on success.
 */
export async function signInWithProvider(provider: OAuthProvider, redirectTo: string): Promise<void> {
  if (!isNativeApp()) {
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
    if (error) throw new Error(error.message);
    return; // browser is navigating away
  }

  track("native_oauth_started", { provider, build: "idtoken-b6" });
  try {
    await ensureInitialized();
    if (provider === "apple") await nativeApple();
    else await nativeGoogle();
    track("native_oauth_exchanged", { provider });
    // Session now exists in memory — navigate within the SPA (a full reload
    // would race the auth guard). The /auth onAuthStateChange listener also
    // catches this; belt and suspenders for invite/handoff entry points too.
    try {
      const path = new URL(redirectTo).pathname + new URL(redirectTo).search;
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate", { state: {} }));
    } catch { /* keep current location; the auth listener will navigate */ }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sign-in failed.";
    // `initialized` here tells us WHERE it broke: false → SocialLogin.initialize
    // threw (the lead hypothesis); true → login/exchange threw after a good init.
    const diag = {
      provider,
      platform: nativePlatform(),
      initialized,
      ms_since_boot: msSinceBoot(),
      err: errText(e),   // scrub-safe key + ≤80 chars (unlike the old `message`)
      code: errCode(e),
    };
    // The plugin throws on user cancel too — don't treat that as an error toast.
    if (/cancel/i.test(msg)) { safeTrack("native_oauth_failed", { ...diag, stage: "cancelled" }); return; }
    safeTrack("native_oauth_failed", { ...diag, stage: "idtoken" });
    throw new Error(msg);
  }
}

export const signInWithGoogle = (redirectTo: string) => signInWithProvider("google", redirectTo);
export const signInWithApple = (redirectTo: string) => signInWithProvider("apple", redirectTo);
