/**
 * Brittany's review page for a bereavement note.
 *
 *   GET  — shows who, which bird, how long it was in the app, and the note
 *          exactly as the owner would get it, with "Send this note" and "Don't
 *          send". Never acts: mail scanners prefetch links, and a prefetch must
 *          not send a condolence note.
 *   POST — the button press (form field `decision` = send | skip). Acts once;
 *          a second press, or a review already decided, just reports status.
 *
 * No session: the HMAC in the URL is the authorisation, the same scheme as the
 * unsubscribe links. See src/lib/bereavementReview.server.ts.
 */
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { createFileRoute } from "@tanstack/react-router";

const FOREST = "#1a3d2e";
const PAGE = "#e9e6dc";
const CARD = "#fbf9f3";
const MUTED = "#5b6b61";
const BODY = "'DM Sans','Helvetica Neue',Helvetica,'Segoe UI',sans-serif";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function shell(title: string, inner: string): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
  body { margin:0; background:${PAGE}; font-family:${BODY}; color:${FOREST}; }
  .wrap { max-width:620px; margin:0 auto; padding:24px 16px 48px; }
  .card { background:${CARD}; border-radius:18px; padding:24px 22px; }
  h1 { margin:0 0 12px; font-size:24px; line-height:1.3; }
  p, td { font-size:15px; line-height:1.6; }
  .meta td:first-child { color:${MUTED}; padding-right:14px; white-space:nowrap; vertical-align:top; }
  .flag { background:#f6e7c4; color:#854f0b; border-radius:10px; padding:10px 12px; margin:0 0 14px; }
  .note { border:1px solid #e3ded0; border-radius:12px; overflow:hidden; margin:16px 0; }
  .subj { margin:0; padding:10px 14px; background:#efe9da; font-size:13px; }
  .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; }
  button { font:inherit; font-weight:600; font-size:16px; border-radius:10px; padding:12px 20px; cursor:pointer; }
  .send { background:${FOREST}; color:#fff; border:0; }
  .skip { background:transparent; color:${FOREST}; border:1.5px solid ${FOREST}; }
  .done { font-size:18px; }
</style>
</head>
<body><div class="wrap"><div class="card">${inner}</div></div></body>
</html>`,
    {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    },
  );
}

export const Route = createFileRoute("/api/public/bereavement-review/$reviewId/$sig")({
  server: {
    handlers: {
      GET: withErrorTelemetry(
        "/api/public/bereavement-review/$reviewId/$sig",
        async ({ params }) => {
          const { reviewId, sig } = params as { reviewId: string; sig: string };
          const { reviewSigValid, loadReview, buildNoteFor } =
            await import("@/lib/bereavementReview.server");
          if (!reviewSigValid(reviewId, sig)) return new Response("Not found", { status: 404 });
          const d = await loadReview(reviewId);
          if (!d) return new Response("Not found", { status: 404 });

          const status = d.decision
            ? `<p class="done"><b>${d.decision === "send" ? "Sent" : "Not sent"}</b>${d.decidedAt ? ` on ${esc(new Date(d.decidedAt).toUTCString())}` : ""}.</p>`
            : `<form method="post" class="actions">
               <button class="send" name="decision" value="send" type="submit">Send this note</button>
               <button class="skip" name="decision" value="skip" type="submit">Don't send</button>
             </form>`;
          const note = await buildNoteFor(d);
          return shell(
            `Review: ${d.names}`,
            `<h1>${esc(d.ownerName)} marked ${esc(d.names)} as passed</h1>
           ${d.pastLoss ? `<p class="flag"><b>Likely a past loss.</b> Marked as passed minutes after being added, so the owner may be recording a bird they lost a while ago.</p>` : ""}
           <table class="meta">
             <tr><td>Owner</td><td>${esc(d.ownerName)} · ${esc(d.ownerEmail)}</td></tr>
             <tr><td>In the app for</td><td>${esc(d.inAppFor.join("; "))}</td></tr>
           </table>
           ${status}
           <div class="note"><p class="subj"><b>Subject:</b> ${esc(note.subject)}</p>${note.html}</div>
           <p style="color:${MUTED};font-size:13px;">Replies to the note come to you.</p>`,
          );
        },
      ),
      POST: withErrorTelemetry(
        "/api/public/bereavement-review/$reviewId/$sig",
        async ({ params, request }) => {
          const { reviewId, sig } = params as { reviewId: string; sig: string };
          const { reviewSigValid, decideReview } = await import("@/lib/bereavementReview.server");
          if (!reviewSigValid(reviewId, sig)) return new Response("Not found", { status: 404 });
          const form = await request.formData().catch(() => null);
          const decision = form?.get("decision");
          if (decision !== "send" && decision !== "skip")
            return new Response("Bad request", { status: 400 });
          const res = await decideReview(reviewId, decision);
          return shell(
            res.ok ? "Done" : "Not sent",
            `<p class="done">${esc(res.message)}</p><p><a href="" style="color:${FOREST};">Back to the review</a></p>`,
          );
        },
      ),
    },
  },
});
