import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { track } from "./analytics";

/**
 * A cold-start-safe session read for route guards.
 *
 * `supabase.auth.getSession()` can return `{ session: null }` on the very first
 * call after a cold launch, before the client finishes restoring the persisted
 * session from storage — then it becomes available via the INITIAL_SESSION
 * event a beat later. In a browser tab that window is tiny; in the native
 * WKWebview it's long enough that the root/auth guards decided "logged out" and
 * dropped the user on the landing/sign-in page every launch (they only got home
 * by tapping through, which read the now-hydrated session).
 *
 * We resolve once on the first auth event, then every later call is just a plain
 * getSession() (no wait) — so in-app navigation is unchanged, and a session set
 * synchronously by signup/sign-in is still reflected immediately.
 */
let ready = false;
let readyPromise: Promise<void> | null = null;

function waitForAuthReady(): Promise<void> {
  if (ready) return Promise.resolve();
  if (readyPromise) return readyPromise;
  readyPromise = new Promise<void>((resolve) => {
    const done = () => { ready = true; resolve(); };
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // INITIAL_SESSION fires once the client has recovered from storage;
      // SIGNED_IN/SIGNED_OUT also mean the state is settled.
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "SIGNED_OUT") {
        data.subscription.unsubscribe();
        done();
      }
    });
    // Safety net: never hang a route guard if the event is missed.
    setTimeout(done, 2500);
  });
  return readyPromise;
}

/**
 * Session for route guards — cold-start safe AND resume-after-idle safe.
 *
 * After the app sits idle, the access token expires (~1h). On resume the
 * session needs a token refresh; if the guard reads auth before that refresh
 * lands (or it races the network coming back), getSession() is null and the
 * user gets bounced to sign-in even though their refresh token is still valid.
 * So: if there's no live session but a refresh token is persisted, refresh
 * explicitly with a few retries before concluding "signed out". A genuinely
 * rejected refresh token clears storage — then we do treat it as signed out.
 */
export async function getReadySession(): Promise<Session | null> {
  await waitForAuthReady();
  const live = (await supabase.auth.getSession()).data.session;
  if (live) return live;
  if (!hasStoredSession()) return null;

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.auth.refreshSession();
    if (data.session) {
      track("auth_resume_refresh", { attempt, ok: true });
      return data.session;
    }
    track("auth_resume_refresh", {
      attempt,
      ok: false,
      message: error?.message ?? "none",
      still_stored: hasStoredSession(),
    });
    // Refresh token rejected/cleared → a real sign-out, stop retrying.
    if (!hasStoredSession()) return null;
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return (await supabase.auth.getSession()).data.session;
}

/**
 * SYNCHRONOUS best-effort check for a persisted session, straight from
 * localStorage — no await, so a route guard can redirect instantly with no
 * paint in between. supabase-js stores the session under `sb-<ref>-auth-token`.
 * Used by the landing route so an already-signed-in owner is redirected to the
 * dashboard on the first tick, without flashing the marketing/sign-in page
 * while the async client finishes hydrating. A stored-but-expired token still
 * returns true here; the authenticated guard then does the authoritative async
 * check (behind its clean loading spinner, not the marketing page).
 */
export function hasStoredSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    if (!key) return false;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    // Shape is either the session object or { currentSession, expiresAt }.
    return !!(parsed?.access_token || parsed?.currentSession?.access_token || parsed?.refresh_token);
  } catch {
    return false;
  }
}
