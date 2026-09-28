/**
 * One-click unsubscribe, and the page you land on.
 *
 *   POST — what Gmail and Apple Mail send when the reader taps their own
 *          unsubscribe button (RFC 8058). Flips the flag, returns 200, no page.
 *   GET  — the footer link. Flips the flag too, then renders the page, so the
 *          reader is out before they read anything. A link that only *offers*
 *          to unsubscribe is how people end up clicking twice and still
 *          getting mail.
 *   GET ?resubscribe=1 — the "changed my mind" button.
 *
 * No session: a mail client has none, and asking someone to log in to leave is
 * a dark pattern. The HMAC in the URL is the authorisation, and it never
 * expires — an unsubscribe link that has gone stale is worse than none.
 *
 * It takes effect immediately for anything not yet sent, because every cron
 * reads the flag as it builds each email rather than snapshotting a list.
 */
import { createFileRoute } from "@tanstack/react-router";
import { isUnsubCategory, unsubSigValid, UNSUB_COLUMN, type UnsubCategory } from "@/lib/unsubscribe";

const FOREST = "#1a3d2e";
const LIME = "#cdeab0";
const SUN = "#f2b33d";
const PAGE = "#e9e6dc";
const CARD = "#fbf9f3";
const MUTED = "#5f5e5a";
const HEAD = "'Bricolage Grotesque','Avenir Next','Segoe UI',Helvetica,sans-serif";
const BODY = "'DM Sans','Helvetica Neue',Helvetica,'Segoe UI',sans-serif";

const LABEL: Record<UnsubCategory, string> = {
  monthly: "The Flock Report",
  onboarding: "getting-started emails",
};

function page(o: { category: UnsubCategory; resubscribed: boolean; resubHref: string; appUrl: string }): string {
  const name = LABEL[o.category];
  const headline = o.resubscribed
    ? `You're back on the list for ${name}.`
    : `You're off the list for ${name}.`;
  const body = o.resubscribed
    ? "Good to have you back. The next one will arrive as usual."
    : "No hard feelings. Your birds' records aren't going anywhere, and you'll still get the important stuff, like sit updates and alerts.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${headline}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;800&family=DM+Sans:wght@400;700&display=swap">
<style>
  body { margin:0; background:${PAGE}; font-family:${BODY}; }
  .wrap { max-width:560px; margin:0 auto; padding:24px 16px 48px; }
  .card { background:${CARD}; border-radius:20px; overflow:hidden; }
  .bar { background:${FOREST}; padding:18px 22px; color:#fff; font-family:${HEAD}; font-weight:800; font-size:18px; letter-spacing:-0.3px; }
  .inner { padding:28px 22px 30px; }
  h1 { margin:0 0 14px; font-family:${HEAD}; font-weight:800; font-size:32px; line-height:36px; letter-spacing:-0.5px; color:${FOREST}; }
  p { margin:0 0 20px; font-size:16px; line-height:26px; color:${FOREST}; }
  .btn { display:inline-block; background:${SUN}; border:2px solid ${FOREST}; border-radius:999px; padding:13px 24px; font-weight:700; font-size:16px; color:${FOREST}; text-decoration:none; }
  .link { display:inline-block; margin-top:18px; font-size:14px; color:#2d6a4f; font-weight:700; }
  .fine { margin:22px 0 0; font-size:12px; line-height:19px; color:${MUTED}; }
  @media (max-width:480px) { h1 { font-size:26px; line-height:30px; } .wrap { padding:16px 12px 36px; } }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="bar">Kya &amp; Co.</div>
    <div class="inner">
      <h1>${headline}</h1>
      <p>${body}</p>
      ${o.resubscribed ? "" : `<a class="btn" href="${o.resubHref}">Changed my mind, keep sending it</a>`}
      <div><a class="link" href="${o.appUrl}/scans/settings">Manage all email settings</a></div>
      <p class="fine">Sit updates, invites, and alerts always come through.</p>
    </div>
  </div>
</div>
</body>
</html>`;
}

async function setFlag(userId: string, category: UnsubCategory, value: boolean): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("profiles")
    .update({ [UNSUB_COLUMN[category]]: value })
    .eq("id", userId)
    .select("id");
  // An RLS-blocked update returns 204 with no error and no rows, so require the
  // row back rather than trusting the absence of an error.
  if (error || !data || data.length === 0) {
    console.error("[unsubscribe] update did not take", { userId, category, value, error });
    return false;
  }
  return true;
}

export const Route = createFileRoute("/api/public/unsubscribe/$category/$userId/$sig")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const { category, userId, sig } = params as { category: string; userId: string; sig: string };
        if (!isUnsubCategory(category) || !unsubSigValid(userId, category, sig)) {
          return new Response("Not found", { status: 404 });
        }
        const ok = await setFlag(userId, category, false);
        return new Response(ok ? "Unsubscribed" : "Could not unsubscribe", { status: ok ? 200 : 500 });
      },
      GET: async ({ params, request }) => {
        const { category, userId, sig } = params as { category: string; userId: string; sig: string };
        if (!isUnsubCategory(category) || !unsubSigValid(userId, category, sig)) {
          return new Response("Not found", { status: 404 });
        }
        const appUrl = process.env.EMAIL_ASSET_BASE || "https://app.thekyaproject.com";
        const resubscribe = new URL(request.url).searchParams.get("resubscribe") === "1";
        const ok = await setFlag(userId, category, resubscribe);
        if (!ok) return new Response("Something went wrong. Try the link again.", { status: 500 });
        // Relative, so it works wherever this is served from rather than
        // always bouncing to production.
        return new Response(page({ category, resubscribed: resubscribe, resubHref: "?resubscribe=1", appUrl }), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      },
    },
  },
});
