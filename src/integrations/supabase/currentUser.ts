import { supabase } from "./client";

/**
 * Returns the signed-in user from the LOCAL session (no network round-trip),
 * shaped like `getUser()`'s `{ data: { user } }` so call sites are a drop-in
 * swap. Use this for client-side ownership checks and `owner_id` reads where a
 * fresh server validation isn't required — server functions still validate the
 * token via middleware. Avoids the per-render network hop that `auth.getUser()`
 * makes (see also the auth guard in `_authenticated/route.tsx`).
 */
export async function getLocalUser() {
  const { data } = await supabase.auth.getSession();
  return { data: { user: data.session?.user ?? null } };
}
