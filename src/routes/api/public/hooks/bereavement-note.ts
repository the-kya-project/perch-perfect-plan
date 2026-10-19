/**
 * Bereavement notes — daily cron, now a safety net for the review queue.
 *
 * Notes no longer go out on their own. When a bird is marked as passed,
 * markBirdPassed queues a review and emails Brittany a preview with a link to
 * Send or Don't send (src/lib/bereavementReview.server.ts). Nothing reaches
 * the owner until she presses Send.
 *
 * This cron only catches what that path missed (the notify email failed, or
 * the bird was marked before the review flow shipped) by queueing a review for
 * any passed bird with no note sent and no review yet. It never sends a note
 * itself. It also reports how many reviews are still waiting on a decision.
 *
 * Auth: `Authorization: Bearer <CARE_PLAN_REMINDER_SECRET>`, the shared cron
 * secret. JSON body: { "dryRun": true } → counts only, nothing queued.
 */
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { createFileRoute } from "@tanstack/react-router";
import { withCronTelemetry } from "@/lib/cronTelemetry";

export const Route = createFileRoute("/api/public/hooks/bereavement-note")({
  server: {
    handlers: {
      POST: withCronTelemetry(
        "bereavement-note",
        withErrorTelemetry("/api/public/hooks/bereavement-note", async ({ request }) => {
          const secret = process.env.CARE_PLAN_REMINDER_SECRET;
          if (!secret) {
            return Response.json(
              { ok: false, error: "CARE_PLAN_REMINDER_SECRET not configured" },
              { status: 503 },
            );
          }
          const auth = request.headers.get("authorization") ?? "";
          if (auth !== `Bearer ${secret}`) {
            return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
          }

          let dryRun = false;
          try {
            const body = (await request.json()) as { dryRun?: boolean } | null;
            dryRun = body?.dryRun === true;
          } catch {
            /* no body is fine */
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const sb = supabaseAdmin as any;
          const { data: waiting } = await sb
            .from("bereavement_reviews")
            .select("id")
            .is("decision", null);
          if (dryRun)
            return Response.json({ ok: true, dryRun: true, waiting: waiting?.length ?? 0 });

          const { queueBereavementReviews } = await import("@/lib/bereavementReview.server");
          const { queued, notified } = await queueBereavementReviews();
          return Response.json({
            ok: true,
            queued,
            notified,
            waiting: (waiting?.length ?? 0) + queued,
          });
        }),
      ),
    },
  },
});
