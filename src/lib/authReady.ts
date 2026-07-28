import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

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

/** Session, read only after storage hydration has settled (cold-start safe). */
export async function getReadySession(): Promise<Session | null> {
  await waitForAuthReady();
  const { data } = await supabase.auth.getSession();
  return data.session;
}
