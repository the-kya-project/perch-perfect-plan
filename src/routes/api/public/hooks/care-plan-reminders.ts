/**
 * Cron-triggered reminder: nudges owners whose care plan hasn't been
 * touched in a while AND who have a sit starting within the next 3 days.
 *
 * Called by pg_cron (see scheduled-jobs setup). The `/api/public/*` prefix
 * bypasses Lovable's published-site auth, so the handler validates the
 * incoming `apikey` header against the project's anon key before doing
 * anything.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/care-plan-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_ANON_KEY;
        if (!expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendPushToOwner } = await import("@/lib/pushSender.server");

        const today = new Date();
        const horizon = new Date(today);
        horizon.setUTCDate(horizon.getUTCDate() + 3);

        const { data: sits, error } = await supabaseAdmin
          .from("sits")
          .select("id, start_date, sit_birds(bird_id, birds(name, owner_id, passed_at, care_plans(updated_at)))")
          .gte("start_date", today.toISOString().slice(0, 10))
          .lte("start_date", horizon.toISOString().slice(0, 10))
          .eq("revoked", false);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        // One care-plan reminder per sit, ever. notification_log has no sit_id
        // column, so we key on `type = care_plan_reminder:<sitId>` — a composite
        // convention in the existing text column, no migration needed. That
        // value also trips engagement-nudges' 20h suppression, whose lookback
        // matches on user_id + sent_at and ignores the type value. Pre-fetch the
        // sits already reminded so re-runs (this fires daily while a sit sits in
        // the 3-day window) skip them instead of re-sending.
        const reminderType = (sitId: string) => `care_plan_reminder:${sitId}`;
        const sitIds = (sits ?? []).map((s) => s.id);
        const alreadyReminded = new Set<string>();
        if (sitIds.length) {
          const { data: priorReminders } = await supabaseAdmin
            .from("notification_log")
            .select("user_id, type")
            .in("type", sitIds.map(reminderType));
          for (const r of priorReminders ?? []) alreadyReminded.add(`${r.user_id}:${r.type}`);
        }

        // Dedupe owners we've already nudged in this run.
        const pushed = new Set<string>();
        let total = 0;
        let emailed = 0;

        for (const sit of sits ?? []) {
          const links = (sit as { sit_birds?: Array<{ bird_id?: string | null; birds?: { owner_id?: string; name?: string; passed_at?: string | null; care_plans?: { updated_at?: string } } }> })
            .sit_birds ?? [];
          for (const link of links) {
            const bird = link.birds;
            const ownerId = bird?.owner_id;
            if (bird?.passed_at) continue; // passed bird — all reminders pause
            if (!ownerId || pushed.has(`${ownerId}:${sit.id}`)) continue;
            pushed.add(`${ownerId}:${sit.id}`);

            const planUpdated = bird?.care_plans?.updated_at;
            const stale = !planUpdated ||
              (Date.now() - new Date(planUpdated).getTime()) > 1000 * 60 * 60 * 24 * 14;
            if (!stale) continue;

            // Already reminded for this sit on an earlier run — never repeat.
            if (alreadyReminded.has(`${ownerId}:${reminderType(sit.id)}`)) continue;

            // Push and email are attempted independently so one failing can't
            // suppress the other or abort the run.
            let pushSent = false;
            try {
              const res = await sendPushToOwner(ownerId, "care_plan_reminder", {
                title: "Care plan check-in",
                body: `${bird?.name ?? "Your bird"} has a sit coming up — review the care plan?`,
                url: "/dashboard",
                tag: `care-plan-reminder-${sit.id}`,
              });
              total += res.sent;
              pushSent = res.sent > 0;
            } catch (e) {
              console.error("[care-plan-reminder] push failed", e);
            }

            // Email the reminder too, if the owner opted in (more reliable than
            // push, which needs the app installed). Isolated so one failure
            // can't stop the run.
            let emailSent = false;
            try {
              const { data: profile } = await supabaseAdmin
                .from("profiles")
                .select("email, display_name, notify_care_plan_reminder, locale")
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
                  const built = buildCarePlanReminderEmail({ birdName: bird?.name ?? "your bird", link: `${appUrl}/dashboard`, locale: (profile as { locale?: string } | null)?.locale ?? undefined });
                  await sendTransactionalEmail({
                    to,
                    toName: profile?.display_name ?? undefined,
                    subject: built.subject,
                    htmlContent: built.html,
                    textContent: built.text,
                  });
                  emailed += 1;
                  emailSent = true;
                }
              }
            } catch (e) {
              console.error("[care-plan-reminder] email failed", e);
            }

            // Record the reminder only after a confirmed send, so a fully failed
            // attempt stays retryable on tomorrow's run. A partial success (one
            // channel sent, the other threw) still logs as sent — we must not
            // re-run and double-send the channel that worked.
            if (pushSent || emailSent) {
              await supabaseAdmin.from("notification_log").insert({
                user_id: ownerId,
                bird_id: link.bird_id ?? null,
                type: reminderType(sit.id),
                channel: [pushSent ? "push" : null, emailSent ? "email" : null]
                  .filter(Boolean)
                  .join("+"),
              });
            }
          }
        }

        return Response.json({ ok: true, sits: sits?.length ?? 0, pushed: total, emailed });
      },
    },
  },
});
