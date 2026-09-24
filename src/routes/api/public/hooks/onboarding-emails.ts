/**
 * Onboarding product emails — daily cron.
 *
 * Computes each account's setup state straight from the database (the source
 * of truth for "who has done what") and sends the matching product email via
 * Brevo. Rules:
 *   - at most ONE onboarding email per user per run (earliest applicable stage)
 *   - each stage sends AT MOST ONCE EVER per user (onboarding_email_log)
 *
 * Two lanes. The SERIES is educational and runs on the calendar: seven emails
 * on days 0, 3, 6, 9, 12, 15 and 18, whatever the account has or hasn't done.
 * While it is running it is the only onboarding email an account gets — three
 * of the seven cover the same ground as the behavioural nudges, and one send
 * per run means the two lanes would otherwise take turns and knock the series
 * off its three-day rhythm. After day 18 the behavioural DRIP resumes for
 * anything still undone.
 *
 *   series (SERIES_LAUNCH onwards), in day order:
 *       welcome              — day 0, the hello from Brittany. NOTE: this cron
 *                              runs once a day, so it lands on the next run,
 *                              not an hour after signup.
 *       series_weighing      — day 3
 *       series_health_check  — day 6
 *       series_care_plan     — day 9
 *       series_journal       — day 12
 *       series_sharing       — day 15
 *       series_vet           — day 18, closes the series
 *
 *   drip, in funnel order:
 *       add_first_bird   — account ≥2 days old, no (living) birds
 *       log_first_weight — oldest bird ≥3 days old, zero weight entries
 *       run_first_scan   — oldest bird ≥5 days old, no daily health scan yet
 *       start_care_plan  — oldest bird ≥7 days old, no care-plan content anywhere
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
import { withCronTelemetry } from "@/lib/cronTelemetry";

type Stage =
  // The educational series: fixed days from signup, regardless of what the
  // account has or hasn't done.
  | "welcome"
  | "series_weighing"
  | "series_health_check"
  | "series_care_plan"
  | "series_journal"
  | "series_sharing"
  | "series_vet"
  // The behavioural drip: gated on what's still undone.
  | "add_first_bird"
  | "start_care_plan"
  | "log_first_weight"
  | "run_first_scan"
  | "weight_trend";

const DAY = 1000 * 60 * 60 * 24;

// Accounts created before this date never enter the automated drip (they get
// the one-off manual campaign instead). Set to the day the drip shipped.
const ONBOARDING_LAUNCH = "2026-07-21T00:00:00Z";
// The welcome email needs its OWN, later cutoff. Accounts created between
// ONBOARDING_LAUNCH and this date are already deep in the drip — sending them
// "Welcome to Kya & Co.!" weeks after they signed up would be worse than not
// sending it. Only accounts created from here on get a welcome.
const WELCOME_LAUNCH = "2026-09-23T00:00:00Z";
// The seven-part educational series: accounts created on/after this date get
// it. Its own cutoff again, because the welcome promises "a short email every
// three days" and only accounts that receive the new welcome should be told
// that. Anyone earlier keeps the behavioural drip alone.
const SERIES_LAUNCH = "2026-09-25T00:00:00Z";
// Day offsets from signup. One email per run, so a missed run catches up in
// order rather than sending two at once.
const SERIES: Array<{ stage: Stage; day: number }> = [
  { stage: "welcome", day: 0 },
  { stage: "series_weighing", day: 3 },
  { stage: "series_health_check", day: 6 },
  { stage: "series_care_plan", day: 9 },
  { stage: "series_journal", day: 12 },
  { stage: "series_sharing", day: 15 },
  { stage: "series_vet", day: 18 },
];
const SERIES_DAYS = 18;

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
      POST: withCronTelemetry("onboarding-emails", async ({ request }) => {
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
          supabaseAdmin.from("profiles").select("id, email, display_name, created_at, marketing_opt_in, locale").limit(2000),
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
          const inSeries = new Date(profile.created_at) >= new Date(SERIES_LAUNCH);
          if (inSeries) {
            // The series runs on the calendar, not on behaviour. Each stage is
            // due once the account is old enough; the first unsent one wins.
            for (const s of SERIES) {
              if (olderThanDays(profile.created_at, s.day)) candidates.push(s.stage);
            }
          } else if (new Date(profile.created_at) >= new Date(WELCOME_LAUNCH)) {
            // Pre-series accounts still get the day-0 hello, and nothing after.
            candidates.push("welcome");
          }

          // While the series is running, the nudges that duplicate it stay quiet:
          // three of the seven cover the same ground (weighing, the health
          // check, the care plan), and one send per run means the two lanes
          // would take turns — pushing the series off its three-day rhythm and
          // making its "next email in three days" line a lie. Once it has
          // finished, the drip picks up whatever is still undone.
          //
          // add_first_bird is the exception. Nothing in the series replaces it,
          // and because series stages sit earlier in this list it can only fire
          // on a day when no series email is due — day 2, in practice.
          const seriesRunning = inSeries && !olderThanDays(profile.created_at, SERIES_DAYS);

          if (birds.length === 0) {
            if (olderThanDays(profile.created_at, 2)) candidates.push("add_first_bird");
          } else if (!seriesRunning) {
            // Health habits first (weight, then the daily scan), the longer
            // care-plan ask after — per product decision 2026-07-20.
            if (!firstWeightAt && olderThanDays(oldest.created_at, 3)) candidates.push("log_first_weight");
            if (!anyScan && olderThanDays(oldest.created_at, 5)) candidates.push("run_first_scan");
            if (!anyCareContent && olderThanDays(oldest.created_at, 7)) candidates.push("start_care_plan");
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
          buildWelcomeEmail,
          buildSeriesWeighingEmail,
          buildSeriesHealthCheckEmail,
          buildSeriesCarePlanEmail,
          buildSeriesJournalEmail,
          buildSeriesSharingEmail,
          buildSeriesVetEmail,
          buildOnboardingAddBirdEmail,
          buildOnboardingCarePlanEmail,
          buildOnboardingFirstWeightEmail,
          buildOnboardingHealthScanEmail,
          buildOnboardingWeightTrendEmail,
        } = await import("@/lib/emailTemplates");
        const { sendTransactionalEmail, founderReplyTo } = await import("@/lib/brevoEmail.server");

        const results: Record<Stage, number> = {
          welcome: 0, series_weighing: 0, series_health_check: 0, series_care_plan: 0,
          series_journal: 0, series_sharing: 0, series_vet: 0,
          add_first_bird: 0, start_care_plan: 0, log_first_weight: 0, run_first_scan: 0, weight_trend: 0,
        };
        let failed = 0;

        for (const p of planned) {
          const bird = p.birdName ?? "your bird";
          const profile = (profilesQ.data as any[]).find((x) => x.id === p.userId);
          const firstName = ((profile?.display_name ?? "").trim().split(/\s+/)[0] || "").trim() || undefined;
          // Owner has an account (group 1) → their stored locale; null → English.
          const locale = (profile as { locale?: string } | undefined)?.locale ?? undefined;
          // Where a series email points. No bird yet → the dashboard, which is
          // where adding one starts.
          const onBird = (path: string) => (p.birdId ? `${appUrl}/birds/${p.birdId}/${path}` : `${appUrl}/dashboard`);
          const built =
            p.stage === "welcome"
              ? buildWelcomeEmail({ firstName, link: appUrl, locale })
              : p.stage === "series_weighing"
              ? buildSeriesWeighingEmail({ link: onBird("weight"), locale })
              : p.stage === "series_health_check"
              ? buildSeriesHealthCheckEmail({ link: onBird("scan"), locale })
              : p.stage === "series_care_plan"
              ? buildSeriesCarePlanEmail({ link: onBird("plan"), locale })
              : p.stage === "series_journal"
              ? buildSeriesJournalEmail({ link: onBird("journal"), locale })
              : p.stage === "series_sharing"
              ? buildSeriesSharingEmail({ link: onBird("access"), locale })
              : p.stage === "series_vet"
              ? buildSeriesVetEmail({ link: onBird("vet-summary"), locale })
              : p.stage === "add_first_bird"
              ? buildOnboardingAddBirdEmail({ firstName, link: `${appUrl}/birds/new`, locale })
              : p.stage === "start_care_plan"
                ? buildOnboardingCarePlanEmail({ birdName: bird, link: `${appUrl}/dashboard`, locale })
                : p.stage === "log_first_weight"
                  ? buildOnboardingFirstWeightEmail({ birdName: bird, link: `${appUrl}/dashboard`, locale })
                  : p.stage === "run_first_scan"
                    ? buildOnboardingHealthScanEmail({ birdName: bird, link: p.birdId ? `${appUrl}/birds/${p.birdId}/scan` : `${appUrl}/scans`, locale })
                    : buildOnboardingWeightTrendEmail({ birdName: bird, link: `${appUrl}/dashboard`, locale });

          const res = await sendTransactionalEmail({
            to: p.email,
            toName: profile?.display_name ?? undefined,
            subject: built.subject,
            htmlContent: built.html,
            textContent: built.text,
            // The two emails signed by Brittany that ask for a reply — the
            // welcome and the one that closes the series. A reply has to reach
            // her, not the generic sender.
            ...(p.stage === "welcome" || p.stage === "series_vet" ? { replyTo: founderReplyTo() } : {}),
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
      }),
    },
  },
});
