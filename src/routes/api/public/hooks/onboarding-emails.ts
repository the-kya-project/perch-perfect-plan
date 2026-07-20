/**
 * Onboarding product emails — daily cron.
 *
 * Computes each account's setup state straight from the database (the source
 * of truth for "who has done what") and sends the matching product email via
 * Brevo. Rules:
 *   - at most ONE onboarding email per user per run (earliest applicable stage)
 *   - each stage sends AT MOST ONCE EVER per user (onboarding_email_log)
 *   - stages, in funnel order:
 *       add_first_bird   — account ≥2 days old, no (living) birds
 *       start_care_plan  — oldest bird ≥3 days old, no care-plan content anywhere
 *       log_first_weight — oldest bird ≥5 days old, zero weight entries
 *       run_first_scan   — oldest bird ≥7 days old, no daily health scan yet
 *       weight_trend     — first weight was logged within the last 7 days
 *         (the recency guard stops long-time users getting a "first weight!"
 *         email on rollout day)
 *
 * The drip covers accounts created ON/AFTER ONBOARDING_LAUNCH only — a classic
 * timed sequence for new signups, where taking the action before a send drops
 * you out of that stage. Accounts older than the launch date never enter the
 * automated drip; they're handled by a one-off manual Brevo campaign (use the
 * audit mode below to pull that list).
 *
 * Auth: `Authorization: Bearer <CARE_PLAN_REMINDER_SECRET>` — the same cron
 * secret the care-plan reminder hook uses. JSON body options:
 *   { "dryRun": true }        → planned sends returned, nothing emailed/logged
 *   { "audit": "no_bird" }    → the MANUAL-send list: pre-launch accounts with
 *                               no (living) birds — email, name, signup date,
 *                               marketing_opt_in. Read-only.
 *
 * Serverless gotcha (see memory/perch-serverless-fire-and-forget): every send
 * is awaited before the response returns — nothing fire-and-forget here.
 */
import { createFileRoute } from "@tanstack/react-router";

type Stage = "add_first_bird" | "start_care_plan" | "log_first_weight" | "run_first_scan" | "weight_trend";

const DAY = 1000 * 60 * 60 * 24;

// Accounts created before this date never enter the automated drip (they get
// the one-off manual campaign instead). Set to the day the drip shipped.
const ONBOARDING_LAUNCH = "2026-07-21T00:00:00Z";

function olderThanDays(iso: string | null | undefined, days: number): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() >= days * DAY;
}

function hasCareContent(plan: Record<string, unknown> | undefined): boolean {
  if (!plan) return false;
  const text = (k: string) => typeof plan[k] === "string" && (plan[k] as string).trim().length > 0;
  const arr = (k: string) => Array.isArray(plan[k]) && (plan[k] as unknown[]).length > 0;
  return (
    arr("diet_types") || text("food_instructions") ||
    text("handlers") || text("likes") || text("fears_triggers") ||
    text("cage_location") || text("out_of_cage_mode") || arr("hazards") ||
    text("whats_normal")
  );
}

export const Route = createFileRoute("/api/public/hooks/onboarding-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CARE_PLAN_REMINDER_SECRET;
        if (!secret) {
          return Response.json({ ok: false, error: "CARE_PLAN_REMINDER_SECRET not configured" }, { status: 503 });
        }
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        let dryRun = false;
        let audit: string | null = null;
        try {
          const body = await request.clone().json();
          dryRun = body?.dryRun === true;
          audit = typeof body?.audit === "string" ? body.audit : null;
        } catch { /* empty body is fine */ }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const appUrl = process.env.APP_URL || "https://app.thekyaproject.com";

        // Whole-account snapshot in six queries — fine at this user scale.
        const [profilesQ, birdsQ, plansQ, weightsQ, scansQ, logQ] = await Promise.all([
          supabaseAdmin.from("profiles").select("id, email, display_name, created_at, marketing_opt_in").limit(2000),
          supabaseAdmin.from("birds").select("id, owner_id, name, created_at, passed_at").limit(5000),
          supabaseAdmin.from("care_plans").select("bird_id, diet_types, food_instructions, handlers, likes, fears_triggers, cage_location, out_of_cage_mode, hazards, whats_normal").limit(5000),
          supabaseAdmin.from("weight_entries").select("bird_id, measured_at").order("measured_at", { ascending: true }).limit(10000),
          supabaseAdmin.from("daily_logs").select("bird_id").limit(10000),
          // Cast: the table is newer than the generated types (regenerate after
          // the 20260720230000 migration is applied).
          (supabaseAdmin as any).from("onboarding_email_log").select("user_id, stage") as Promise<{ data: any[] | null; error: { message: string } | null }>,
        ]);
        const firstErr = profilesQ.error || birdsQ.error || plansQ.error || weightsQ.error || scansQ.error || logQ.error;
        if (firstErr) {
          return Response.json({ ok: false, error: firstErr.message }, { status: 500 });
        }

        const planByBird = new Map((plansQ.data ?? []).map((p: any) => [p.bird_id, p]));
        const scannedBirds = new Set((scansQ.data ?? []).map((s: any) => s.bird_id));
        const firstWeightByBird = new Map<string, string>();
        for (const w of (weightsQ.data ?? []) as any[]) {
          if (!firstWeightByBird.has(w.bird_id)) firstWeightByBird.set(w.bird_id, w.measured_at);
        }
        const sent = new Set((logQ.data ?? []).map((r: any) => `${r.user_id}:${r.stage}`));
        const birdsByOwner = new Map<string, any[]>();
        for (const b of (birdsQ.data ?? []) as any[]) {
          if (b.passed_at) continue; // passed birds pause every nudge
          const arr = birdsByOwner.get(b.owner_id) ?? [];
          arr.push(b);
          birdsByOwner.set(b.owner_id, arr);
        }

        // Audit mode: the manual-campaign list — PRE-launch accounts that never
        // added a bird. Read-only; resolves emails the same way the drip does.
        if (audit === "no_bird") {
          const out: Array<{ email: string; name: string | null; signed_up: string; marketing_opt_in: boolean }> = [];
          for (const profile of (profilesQ.data ?? []) as any[]) {
            if (new Date(profile.created_at) >= new Date(ONBOARDING_LAUNCH)) continue;
            if ((birdsByOwner.get(profile.id) ?? []).length > 0) continue;
            let email = (profile.email ?? "").toString().trim();
            if (!email) {
              const { data: au } = await supabaseAdmin.auth.admin.getUserById(profile.id);
              email = au?.user?.email ?? "";
            }
            if (!email) continue;
            out.push({
              email,
              name: profile.display_name ?? null,
              signed_up: profile.created_at,
              marketing_opt_in: !!profile.marketing_opt_in,
            });
          }
          return Response.json({ ok: true, audit: "no_bird", count: out.length, accounts: out });
        }

        const planned: Array<{ userId: string; stage: Stage; email: string; birdName?: string; birdId?: string }> = [];

        for (const profile of (profilesQ.data ?? []) as any[]) {
          const userId = profile.id as string;
          // Launch cutoff: the automated drip is for new signups only.
          if (new Date(profile.created_at) < new Date(ONBOARDING_LAUNCH)) continue;
          const birds = (birdsByOwner.get(userId) ?? []).sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
          const oldest = birds[0];
          const anyCareContent = birds.some((b) => hasCareContent(planByBird.get(b.id)));
          const anyScan = birds.some((b) => scannedBirds.has(b.id));
          const firstWeightAt = birds
            .map((b) => firstWeightByBird.get(b.id))
            .filter(Boolean)
            .sort()[0] as string | undefined;

          // Every stage the account currently qualifies for, in funnel order;
          // the FIRST one not yet sent wins (so a person parked on one stage
          // doesn't block the later nudges forever).
          const candidates: Stage[] = [];
          if (birds.length === 0) {
            if (olderThanDays(profile.created_at, 2)) candidates.push("add_first_bird");
          } else {
            if (!anyCareContent && olderThanDays(oldest.created_at, 3)) candidates.push("start_care_plan");
            if (!firstWeightAt && olderThanDays(oldest.created_at, 5)) candidates.push("log_first_weight");
            if (!anyScan && olderThanDays(oldest.created_at, 7)) candidates.push("run_first_scan");
            if (firstWeightAt && Date.now() - new Date(firstWeightAt).getTime() <= 7 * DAY) candidates.push("weight_trend");
          }
          const stage = candidates.find((s) => !sent.has(`${userId}:${s}`));
          if (!stage) continue;

          // Resolve the address: profiles.email, else the auth record.
          let email = (profile.email ?? "").toString().trim();
          if (!email) {
            const { data: au } = await supabaseAdmin.auth.admin.getUserById(userId);
            email = au?.user?.email ?? "";
          }
          if (!email) continue;

          planned.push({ userId, stage, email, birdName: oldest?.name, birdId: oldest?.id });
        }

        if (dryRun) {
          return Response.json({
            ok: true,
            dryRun: true,
            planned: planned.map((p) => ({ stage: p.stage, email: p.email, birdName: p.birdName ?? null })),
          });
        }

        const {
          buildOnboardingAddBirdEmail,
          buildOnboardingCarePlanEmail,
          buildOnboardingFirstWeightEmail,
          buildOnboardingHealthScanEmail,
          buildOnboardingWeightTrendEmail,
        } = await import("@/lib/emailTemplates");
        const { sendTransactionalEmail } = await import("@/lib/brevoEmail.server");

        const results: Record<Stage, number> = {
          add_first_bird: 0, start_care_plan: 0, log_first_weight: 0, run_first_scan: 0, weight_trend: 0,
        };
        let failed = 0;

        for (const p of planned) {
          const bird = p.birdName ?? "your bird";
          const profile = (profilesQ.data as any[]).find((x) => x.id === p.userId);
          const firstName = ((profile?.display_name ?? "").trim().split(/\s+/)[0] || "").trim() || undefined;
          const built =
            p.stage === "add_first_bird"
              ? buildOnboardingAddBirdEmail({ firstName, link: `${appUrl}/birds/new` })
              : p.stage === "start_care_plan"
                ? buildOnboardingCarePlanEmail({ birdName: bird, link: `${appUrl}/dashboard` })
                : p.stage === "log_first_weight"
                  ? buildOnboardingFirstWeightEmail({ birdName: bird, link: `${appUrl}/dashboard` })
                  : p.stage === "run_first_scan"
                    ? buildOnboardingHealthScanEmail({ birdName: bird, link: p.birdId ? `${appUrl}/birds/${p.birdId}/scan` : `${appUrl}/scans` })
                    : buildOnboardingWeightTrendEmail({ birdName: bird, link: `${appUrl}/dashboard` });

          const res = await sendTransactionalEmail({
            to: p.email,
            toName: profile?.display_name ?? undefined,
            subject: built.subject,
            htmlContent: built.html,
            textContent: built.text,
          });
          if (res.ok) {
            // Log AFTER a confirmed send; a failed send retries on a later run.
            const { error: logErr } = await (supabaseAdmin as any)
              .from("onboarding_email_log")
              .insert({ user_id: p.userId, stage: p.stage });
            if (logErr) console.error("[onboarding-emails] log insert failed", p.userId, p.stage, logErr.message);
            results[p.stage] += 1;
          } else {
            failed += 1;
          }
        }

        return Response.json({ ok: true, considered: (profilesQ.data ?? []).length, sent: results, failed });
      },
    },
  },
});
