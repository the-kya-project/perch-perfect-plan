/**
 * Cron-triggered reminder: nudges owners whose care plan hasn't been
 * touched in a while AND who have a sit starting within the next 3 days.
 *
 * Called by pg_cron (the in-database cron.schedule + net.http_post job). The
 * `/api/public/*` prefix bypasses the published-site auth, so this handler is
 * the only gate on a service-role-backed action — it MUST authenticate.
 *
 * Auth: a dedicated server-only secret, NOT the publishable anon key. The
 * caller must send `Authorization: Bearer <CARE_PLAN_REMINDER_SECRET>`; the
 * token is compared in constant time. Missing/wrong → 401 with no work done.
 *
 * Set `CARE_PLAN_REMINDER_SECRET` in the Vercel project env (server-only — no
 * VITE_/public prefix), and update the pg_cron job to send it as the
 * Authorization header instead of the old `apikey`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

// Constant-time string compare. Length is checked first (timingSafeEqual throws
// on unequal-length buffers); the length leak is standard and acceptable.
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/care-plan-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CARE_PLAN_REMINDER_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!expected || !token || !secretMatches(token, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendPushToOwner } = await import("@/lib/pushSender.server");

        const today = new Date();
        const horizon = new Date(today);
        horizon.setUTCDate(horizon.getUTCDate() + 3);

        const { data: sits, error } = await supabaseAdmin
          .from("sits")
          .select("id, start_date, sit_birds(bird_id, birds(name, owner_id, care_plans(updated_at)))")
          .gte("start_date", today.toISOString().slice(0, 10))
          .lte("start_date", horizon.toISOString().slice(0, 10))
          .eq("revoked", false);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        // Dedupe owners we've already nudged in this run.
        const pushed = new Set<string>();
        let total = 0;
        let emailed = 0;

        for (const sit of sits ?? []) {
          const links = (sit as { sit_birds?: Array<{ birds?: { owner_id?: string; name?: string; care_plans?: { updated_at?: string } } }> })
            .sit_birds ?? [];
          for (const link of links) {
            const bird = link.birds;
            const ownerId = bird?.owner_id;
            if (!ownerId || pushed.has(`${ownerId}:${sit.id}`)) continue;
            pushed.add(`${ownerId}:${sit.id}`);

            const planUpdated = bird?.care_plans?.updated_at;
            const stale = !planUpdated ||
              (Date.now() - new Date(planUpdated).getTime()) > 1000 * 60 * 60 * 24 * 14;
            if (!stale) continue;

            const res = await sendPushToOwner(ownerId, "care_plan_reminder", {
              title: "Care plan check-in",
              body: `${bird?.name ?? "Your bird"} has a sit coming up — review the care plan?`,
              url: "/dashboard",
              tag: `care-plan-reminder-${sit.id}`,
            });
            total += res.sent;

            // Email the reminder too, if the owner opted in (more reliable than
            // push, which needs the app installed). Isolated so one failure
            // can't stop the run.
            try {
              const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("email, display_name, notify_care_plan_reminder")
                .eq("id", ownerId)
                .maybeSingle();
              if ((profile?.notify_care_plan_reminder ?? true) === true) {
                let to = profile?.email ?? null;
                if (!to) {
                  const { data: au } = await supabaseAdmin.auth.admin.getUserById(ownerId);
                  to = au?.user?.email ?? null;
                }
                if (to) {
                  const appUrl = process.env.APP_URL || "https://app.thekyaproject.com";
                  const { buildCarePlanReminderEmail } = await import("@/lib/emailTemplates");
                  const { sendTransactionalEmail } = await import("@/lib/brevoEmail.server");
                  const built = buildCarePlanReminderEmail({ birdName: bird?.name ?? "your bird", link: `${appUrl}/dashboard` });
                  await sendTransactionalEmail({
                    to,
                    toName: profile?.display_name ?? undefined,
                    subject: built.subject,
                    htmlContent: built.html,
                    textContent: built.text,
                  });
                  emailed += 1;
                }
              }
            } catch (e) {
              console.error("[care-plan-reminder] email failed", e);
            }
          }
        }

        return Response.json({ ok: true, sits: sits?.length ?? 0, pushed: total, emailed });
      },
    },
  },
});
