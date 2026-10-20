/**
 * GET/HEAD /r/<token> — the click redirect for the onboarding emails and The
 * Flock Report. See emailClicks.server.ts for the link format.
 *
 * Same rules as /get-app (storeRedirectHandler.server):
 *   - THE LINK NEVER BREAKS. A bad token still redirects (to the app home), and
 *     a failed or slow insert never holds the redirect.
 *   - Logging races a short timer. Awaited rather than fire-and-forget, because
 *     a serverless function can be frozen the moment it responds and drop the
 *     row; bounded, because the reader must not wait on a metric.
 *   - The user agent is read and thrown away. Only what it implies is kept.
 */
import { APP_ORIGIN, classifyClick, detectInAppBrowser, detectPlatform, readClickToken } from "./emailClicks.server";

const LOG_BUDGET_MS = 400;

export async function handleEmailClick(request: Request, token: string): Promise<Response> {
  const p = await readClickToken(token);
  if (!p) {
    // Tampered, truncated by a mail client, or signed with a rotated key. We
    // can't trust where it points, so send the reader somewhere safe and useful.
    return redirect(`${APP_ORIGIN}/`);
  }

  const ua = request.headers.get("user-agent") ?? "";
  const verdict = classifyClick({ userAgent: ua, method: request.method, sentAt: p.t, now: Date.now() });

  await Promise.race([
    (async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // log_email_click postdates the generated types.
      const { error } = await (supabaseAdmin as any).rpc("log_email_click", {
        p_user_id: p.u,
        p_email: p.e,
        p_cta_variant: p.v,
        p_link_key: p.k.slice(0, 60),
        p_destination: p.d.slice(0, 2000),
        p_sent_at: p.t ? new Date(p.t).toISOString() : null,
        p_platform: detectPlatform(ua),
        p_in_app_browser: detectInAppBrowser(ua),
        p_is_bot: verdict.isBot,
        p_bot_reason: verdict.reason,
        p_is_test: p.x === 1,
      });
      if (error) throw new Error(error.message);
    })().catch((e) => {
      console.error("[r] click log failed", e instanceof Error ? e.message : e);
    }),
    new Promise((r) => setTimeout(r, LOG_BUDGET_MS)),
  ]);

  return redirect(p.d);
}

function redirect(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location,
      // Every click must reach us to be counted; a cached redirect would not.
      "cache-control": "no-store",
      // The redirect is the same for everyone, but whether a click is a bot is
      // decided from the user agent, so say so to any cache in the path.
      vary: "User-Agent",
      // The /r/ token is not a secret, but there's no reason to hand it to the
      // destination either.
      "referrer-policy": "no-referrer",
    },
  });
}
