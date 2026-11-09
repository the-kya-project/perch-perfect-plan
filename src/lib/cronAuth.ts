// Who may call /api/public/hooks/*: pg_cron, with the Vault secret
// `cron_hook_token` (see 20261102150000_cron_hook_token.sql).
//
// The token lives only in the Vault: the hook asks the database whether the
// bearer matches (public.cron_hook_token_matches, service role only), so there
// is no copy in Vercel to keep in step and rotating it is one
// vault.update_secret with no gap. The email-link key
// (CARE_PLAN_REMINDER_SECRET) is a different secret and is not a cron token:
// the hooks don't accept it. To call a hook by hand, read the token from the
// Vault.
//
// Isomorphic on purpose: these route files are part of the client route tree,
// so the server client is imported inside the call, never at the top.

/** The bearer token from an Authorization header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return m ? m[1] : null;
}

/** What the database says about a bearer: true when it is the Vault token. */
export type CronTokenCheck = (token: string) => Promise<{ data: unknown; error: { message: string } | null }>;

async function vaultTokenMatches(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Postdates the generated types.
  return (supabaseAdmin as any).rpc("cron_hook_token_matches", { p_token: token });
}

/**
 * Null when the request carries the cron token; otherwise the 401 (or 503 when
 * the check itself can't run) to return. `hook` names the caller in the error
 * log; `tokenMatches` is the database check, replaceable in tests.
 */
export async function cronAuthFailure(
  request: Request,
  hook: string,
  tokenMatches: CronTokenCheck = vaultTokenMatches,
): Promise<Response | null> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return new Response("Unauthorized", { status: 401 });

  const { data, error } = await tokenMatches(token);
  if (error) {
    console.error(`[cron-auth] ${hook}: token check failed`, error.message);
    return Response.json({ ok: false, error: "cron token check unavailable" }, { status: 503 });
  }
  return data === true ? null : new Response("Unauthorized", { status: 401 });
}
