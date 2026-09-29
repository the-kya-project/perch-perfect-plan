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
/**
 * The whole guard decision, end to end: the auth-ready wait, the getSession
 * read, and every refresh attempt together. Nothing below may outlive it.
 *
 * Eight seconds. A token round trip on a bad mobile connection is a second or
 * two, and the 2.5s auth-ready net below is spent from the same budget, so 8s
 * leaves room for a slow handshake plus a retry without ever being reached on
 * a healthy connection. It stays under the ten seconds at which a person gives
 * up on a spinner — and under the point where iOS may suspend a backgrounded
 * webview mid-decision, which is how this hung in the first place.
 *
 * This ceiling exists because the hang is INSIDE the auth client, not in the
 * network. supabase-js single-flights refreshes through an internal deferred
 * and serialises every call behind `initializePromise`; a refresh started in a
 * webview that was then suspended leaves those pending forever, and every
 * later call awaits them and never issues a request. The server logs for the
 * 2026-09-28 report are the proof: no token request arrived at all while the
 * spinner was up. A promise that never settles can only be escaped from the
 * outside, so the timeout has to live here rather than in any client option.
 * (For the record: auth-js 2.108.1 takes the lockless path — `this.lock` is
 * null unless a custom lock is passed to createClient, which we don't — so
 * `lockAcquireTimeout` is inert and `navigator.locks` is never called.)
 */
const GUARD_BUDGET_MS = 8_000;

/** Thrown when a step outlives the budget. Never escapes this module. */
class GuardTimeout extends Error {}

/**
 * The auth client is wedged in THIS page and the guard gave up waiting.
 *
 * It matters that the caller knows the difference between this and an ordinary
 * "no session". The promise that never settled is still never going to settle,
 * and it lives in this JavaScript context — supabase.auth.signInWithPassword
 * awaits `initializePromise` too, so routing to /auth without leaving the page
 * would just move the hang to the sign-in button. The caller must do a full
 * page load so the client is built again from scratch.
 */
export class AuthClientStalled extends Error {
  constructor() {
    super("auth client did not settle within the guard budget");
    this.name = "AuthClientStalled";
  }
}

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return Promise.reject(new GuardTimeout());
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new GuardTimeout()), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Is this the server telling us the refresh token is genuinely no good, as
 * opposed to the request not getting there? Only the first justifies throwing
 * away a stored login — a slow connection must never do that.
 */
function isRejectedRefresh(error: { code?: string; status?: number } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "refresh_token_not_found" || error.code === "refresh_token_already_used") return true;
  if (error.code === "session_not_found" || error.code === "session_expired") return true;
  // A 4xx is the server's answer; a 5xx or a transport failure is not.
  return typeof error.status === "number" && error.status >= 400 && error.status < 500;
}

/** Drop the persisted session. Only ever called on a rejected refresh. */
function clearStoredSession(): void {
  if (typeof window === "undefined") return;
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

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
 *
 * Every step runs against one shared deadline (GUARD_BUDGET_MS), so the guard
 * always settles and the caller always gets an answer. Running out of time
 * answers "no session" — the reader lands on sign-in with their path kept,
 * which is recoverable — but it leaves the stored session ALONE. Only the
 * server saying the refresh token is no good clears it.
 */
export async function getReadySession(): Promise<Session | null> {
  const deadline = Date.now() + GUARD_BUDGET_MS;
  const left = () => deadline - Date.now();

  try {
    await withDeadline(waitForAuthReady(), left());
    const live = (await withDeadline(supabase.auth.getSession(), left())).data.session;
    if (live) return live;
    if (!hasStoredSession()) return null;

    for (let attempt = 0; attempt < 3 && left() > 0; attempt++) {
      const { data, error } = await withDeadline(supabase.auth.refreshSession(), left());
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
      // The server answered "this token is no good" → a real sign-out. Clear
      // the stale session so the next launch doesn't take this path again.
      if (isRejectedRefresh(error)) {
        clearStoredSession();
        return null;
      }
      // supabase-js clears storage itself on some rejections — same conclusion.
      if (!hasStoredSession()) return null;
      const backoff = Math.min(500 * (attempt + 1), Math.max(0, left()));
      if (backoff > 0) await new Promise((r) => setTimeout(r, backoff));
    }
    // Attempts used up without an answer. Storage stays: the login may be fine.
    track("auth_resume_refresh", { attempt: -1, ok: false, message: "attempts exhausted", still_stored: hasStoredSession() });
    return null;
  } catch (e) {
    if (e instanceof GuardTimeout) {
      // The auth client never came back. The stored session is untouched — a
      // later launch can still use it — but the caller has to leave this page
      // rather than route within it, so say so rather than returning null.
      track("auth_guard_timeout", { budget_ms: GUARD_BUDGET_MS, still_stored: hasStoredSession() });
      throw new AuthClientStalled();
    }
    throw e;
  }
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
