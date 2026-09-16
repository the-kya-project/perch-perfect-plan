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

/**
 * Whether an id_token carries a `nonce` claim, read from the JWT payload without
 * verifying the signature (Supabase does the real verification). We never log or
 * transmit the token — only the presence of the claim is inspected. Returns
 * false on any decode error, which safely routes us to the no-nonce path.
 */
function idTokenHasNonce(idToken: string): boolean {
  try {
    const payload = idToken.split(".")[1];
    if (!payload) return false;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
    const json = typeof atob === "function" ? atob(padded) : "";
    const claims = JSON.parse(json) as { nonce?: unknown };
    return typeof claims.nonce === "string" && claims.nonce.length > 0;
  } catch {
    return false;
  }
}

/**
 * How long to wait for an OS-native picker before treating it as failed.
 * Generous: the user may be reading Apple's consent sheet, using Face ID, or
 * picking "Hide My Email".
 */
const NATIVE_LOGIN_TIMEOUT_MS = 120_000;

/** Thrown when the native picker never settles. Named so the catch can tag it. */
class NativeLoginTimeout extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NativeLoginTimeout";
  }
}

/**
 * Reject if a native picker never calls back.
 *
 * @capgo/capacitor-social-login can leave its completion handler uncalled on the
 * Apple path: the ASAuthorizationController is retained only as a local (so ARC
 * can free it mid-sheet, after which no delegate method fires), and
 * didCompleteWithAuthorization has no else branch for a credential that is not an
 * ASAuthorizationAppleIDCredential. Either case leaves this promise pending
 * forever: no toast, no analytics, and the user just sits on an unchanged
 * sign-in screen -- which is exactly how App Review saw it. We patch the plugin
 * (patches/@capgo+capacitor-social-login+8.3.39.patch), but keep this so a hang
 * can never again be silent and untracked.
 */
function withNativeTimeout<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new NativeLoginTimeout("Sign-in didn't finish. Please try again.")),
      NATIVE_LOGIN_TIMEOUT_MS,
    );
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

async function nativeGoogle(): Promise<void> {
  if (!GOOGLE_IOS_CLIENT_ID) throw new Error("Google sign-in isn't set up yet on this build.");
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  const { raw, digest } = await makeNonce();
  // NOTE: do NOT pass `scopes`. On Android the plugin hard-rejects any scopes
  // array unless MainActivity implements ModifiedMainActivityForSocialLoginPlugin
  // ("You CANNOT use scopes without modifying the main activity"), which broke
  // every Android Google sign-in. Omitting it costs nothing: both platforms then
  // apply their default grant of email + profile + openid — a superset of the
  // ["email","profile"] we used to ask for.
  const res = await withNativeTimeout(
    SocialLogin.login({
      provider: "google",
      options: { nonce: digest },
    }),
  );
  const idToken = (res.result as { idToken?: string })?.idToken;
  if (!idToken) throw new Error("No Google identity token returned.");
  // The Google SDK can SILENTLY return a restored/cached id_token that was NOT
  // minted with the nonce we just set — GIDSignIn.restorePreviousSignIn on iOS,
  // a cached Credential Manager credential on Android. That token has no nonce
  // claim, and gotrue rejects a mismatch in nonce *existence* ("Passed nonce and
  // nonce in id_token should either both exist or not"). So pass raw only when
  // the returned token actually carries a nonce (the fresh-sign-in case, fully
  // verified); otherwise omit it so both sides agree it's absent. Never weakens
  // a real nonce — a present nonce is always still checked by gotrue.
  const nonce = idTokenHasNonce(idToken) ? raw : undefined;
  safeTrack("native_oauth_token", { provider: "google", platform: nativePlatform(), ms_since_boot: msSinceBoot() });
  const { error } = await withNativeTimeout(
    supabase.auth.signInWithIdToken({ provider: "google", token: idToken, nonce }),
  );
  if (error) throw new Error(error.message);
}

async function nativeApple(): Promise<void> {
  const { SocialLogin } = await import("@capgo/capacitor-social-login");
  const res = await withNativeTimeout(
    SocialLogin.login({
      provider: "apple",
      options: { scopes: ["email", "name"] },
    }),
  );
  const idToken = (res.result as { idToken?: string })?.idToken;
  if (!idToken) throw new Error("No Apple identity token returned.");
  // Breadcrumb: proves the native half finished. Without it, a hang in the
  // plugin and a hang in the Supabase exchange below look identical from
  // telemetry (started + init, then silence) -- which is exactly the ambiguity
  // that cost us a review cycle.
  safeTrack("native_oauth_token", { provider: "apple", platform: nativePlatform(), ms_since_boot: msSinceBoot() });
  const { error } = await withNativeTimeout(
    supabase.auth.signInWithIdToken({ provider: "apple", token: idToken }),
  );
  if (error) throw new Error(error.message);
}


/**
 * A sign-in that never settles leaves a marker behind.
 *
 * The 120s timeout above cannot be relied on alone: iOS suspends JS timers while
 * the app is backgrounded behind Apple's sheet, and if the webview is torn down
 * the pending promise dies with no event at all. Either way the attempt vanishes
 * from telemetry, which is precisely why the App Review failure was invisible.
 * So we persist a marker at the start of every native login and clear it on any
 * outcome; whatever is still there next time this module loads is an attempt
 * that silently died, reported as stage:"abandoned" with its age.
 */
const PENDING_KEY = "kya:native_oauth_pending";

function markPending(provider: OAuthProvider): void {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ provider, at: Date.now() })); } catch { /* storage may be unavailable */ }
}

function clearPending(): void {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* storage may be unavailable */ }
}

function reportAbandonedLogin(): void {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_KEY);
    const { provider, at } = JSON.parse(raw) as { provider?: string; at?: number };
    safeTrack("native_oauth_failed", {
      provider,
      platform: nativePlatform(),
      stage: "abandoned",
      age_ms: typeof at === "number" ? Date.now() - at : undefined,
    });
  } catch { /* never let diagnostics break sign-in */ }
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
  markPending(provider);
  try {
    await ensureInitialized();
    if (provider === "apple") await nativeApple();
    else await nativeGoogle();
    clearPending();
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
    clearPending();
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
    const stage = e instanceof NativeLoginTimeout ? "timeout" : "idtoken";
    safeTrack("native_oauth_failed", { ...diag, stage });
    throw new Error(msg);
  }
}

export const signInWithGoogle = (redirectTo: string) => signInWithProvider("google", redirectTo);
export const signInWithApple = (redirectTo: string) => signInWithProvider("apple", redirectTo);

// Runs when the auth screen loads this module: reports any attempt that died silently.
reportAbandonedLogin();
