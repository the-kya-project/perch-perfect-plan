// Who may call /api/public/hooks/*: pg_cron, with the Vault secret
// `cron_hook_token` (see 20261102150000_cron_hook_token.sql).
//
// The token lives only in the Vault: the hook asks the database whether the
// bearer matches (public.cron_hook_token_matches, service role only), so there
// is no copy in Vercel to keep in step and rotating it is one
// vault.update_secret with no gap. The email-link key
// (CARE_PLAN_REMINDER_SECRET) is a different secret and is not a cron token.
//
// TRANSITION: until the follow-up that removes it, the old shared secret is
// still accepted as a bearer, so the jobs keep running whichever of the
// migration (new token) and the Vercel deploy (this code) lands first at
// merge, and a person can still call a hook by hand with it. Each use logs a
// warning.
//
// Isomorphic on purpose: these route files are part of the client route tree,
// so the server client is imported inside the call, never at the top.

/** The bearer token from an Authorization header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m ? m[1] : null;
}

/** Equal strings, compared in time that doesn't depend on where they differ. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Null when the request carries the cron token; otherwise the 401 (or 503 when
 * the check itself can't run) to return. `hook` names the caller in the warning.
 */
export async function cronAuthFailure(request: Request, hook: string): Promise<Response | null> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return new Response("Unauthorized", { status: 401 });

  const legacy = process.env.CARE_PLAN_REMINDER_SECRET;
  if (legacy && sameSecret(token, legacy)) {
    console.warn(`[cron-auth] ${hook}: called with the old shared secret; pg_cron should send cron_hook_token`);
    return null;
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Postdates the generated types.
  const { data, error } = await (supabaseAdmin as any).rpc("cron_hook_token_matches", { p_token: token });
  if (error) {
    console.error(`[cron-auth] ${hook}: token check failed`, error.message);
    return Response.json({ ok: false, error: "cron token check unavailable" }, { status: 503 });
  }
  return data === true ? null : new Response("Unauthorized", { status: 401 });
}
