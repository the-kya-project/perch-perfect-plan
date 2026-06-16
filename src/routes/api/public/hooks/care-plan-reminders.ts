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
          .select("id, start_date, sit_birds(bird_id, birds(name, owner_id, care_plans(updated_at)))")
          .gte("start_date", today.toISOString().slice(0, 10))
          .lte("start_date", horizon.toISOString().slice(0, 10))
          .eq("revoked", false);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        // Dedupe owners we've already pushed in this run.
        const pushed = new Set<string>();
        let total = 0;

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
          }
        }

        return Response.json({ ok: true, sits: sits?.length ?? 0, pushed: total });
      },
    },
  },
});
