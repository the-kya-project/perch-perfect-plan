/**
 * Onboarding emails — daily cron (15:00 UTC, `onboarding-emails-daily`).
 *
 * One system. Each account walks one ordered list of slots — welcome, the two
 * add-a-bird nudges, then the six series stages — and each run sends AT MOST
 * ONE email, three UTC calendar days after the last. A stage the account has
 * already done is skipped (and logged as skipped, with the reason) so the run
 * moves straight on to the next. The rules live in src/lib/onboardingPlan.ts;
 * this file only loads rows, sends, and logs.
 *
 *   welcome                  day 0, the hello from Brittany
 *   add_first_bird           no bird yet: the next email after the welcome
 *   add_first_bird_reminder  still no bird three days later. Never more than
 *                            these two nudges; skipped once a bird turns up
 *   series_weighing          skipped if a weight is logged (owner/household)
 *   series_health_check      skipped if a daily check is logged (owner/household)
 *   series_care_plan         skipped if any bird's setup_complete
 *   series_journal           skipped if a journal entry exists (not a sitter's)
 *   series_sharing           skipped if there's a household invite or a real sit;
 *                            skipped `cannot_share` for a household member
 *                            without "Manage the household"
 *   series_vet               closes the series; never skipped
 *
 * A reader with no bird still gets every series email, with the stage's button
 * swapped for "add your bird" (cta_variant 'no_bird'), linking to
 * /birds/new?next=<feature> so adding the bird lands on what the email was about.
 *
 * Retired (templates kept in emailTemplates.ts, no longer sent): the old
 * letterShell add_first_bird (the nudges now use buildAddFirstBirdEmail, on the
 * series layout), and the behavioural drip — log_first_weight, run_first_scan, start_care_plan,
 * weight_trend — and all automated onboarding for accounts created before
 * SERIES_LAUNCH. An old add_first_bird already in the log counts as the first
 * nudge, so nobody gets it twice.
 *
 * Same-day rule: no onboarding email on a UTC day the account already had one,
 * a push nudge (engagement-nudges reads this log the same way), or The Flock
 * Report.
 *
 * Auth: `Authorization: Bearer <CARE_PLAN_REMINDER_SECRET>`. JSON body options:
 *   { "dryRun": true }                       → today's plan; nothing sent/logged
 *   { "dryRun": true, "simulateDays": 30 }   → the plan run forward N days,
 *                                              assuming every send succeeds and
 *                                              nobody does anything in the app
 *   { "testSend": { "userId": "…", "stage": "welcome" } }
 *                                            → send that one stage to that one
 *                                              account now, as a TEST: Brevo tag
 *                                              qa_preview, click rows is_test,
 *                                              nothing written to the log. For
 *                                              checking the click tracker.
 *   { "audit": "no_bird" }                   → pre-launch accounts with no bird
 *                                              (the manual-campaign list)
 *
 * Serverless gotcha (memory/perch-serverless-fire-and-forget): every send is
 * awaited before the response returns — nothing fire-and-forget here.
 */
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { createFileRoute } from "@tanstack/react-router";
import { withCronTelemetry } from "@/lib/cronTelemetry";
import {
  SLOTS,
  STAGE_FEATURE,
  buildAccounts,
  decide,
  simulate,
  type Decision,
  type OnboardingAccount,
  type RawRows,
  type Slot,
} from "@/lib/onboardingPlan";

// The manual-campaign audit still lists accounts from before the very first
// drip. Nothing automated uses this date any more.
const ONBOARDING_LAUNCH = "2026-07-21T00:00:00Z";

type Profile = RawRows["profiles"][number] & {
  email: string | null;
  display_name: string | null;
  locale: string | null;
  marketing_opt_in: boolean | null;
};

/**
 * PostgREST returns at most 1000 rows per request whatever `.limit()` says, so
 * every table here is read in pages. A missed page would make someone who has
 * already weighed look like they haven't.
 */
async function selectAll<T>(
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export const Route = createFileRoute("/api/public/hooks/onboarding-emails")({
  server: {
    handlers: {
      POST: withCronTelemetry("onboarding-emails", withErrorTelemetry("/api/public/hooks/onboarding-emails", async ({ request }) => {
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
        let simulateDays = 0;
        let testSend: { userId: string; stage: Slot } | null = null;
        try {
          const body = await request.clone().json();
          dryRun = body?.dryRun === true;
          audit = typeof body?.audit === "string" ? body.audit : null;
          if (Number.isInteger(body?.simulateDays)) simulateDays = Math.min(Math.max(body.simulateDays, 1), 60);
          if (body?.testSend && typeof body.testSend.userId === "string" && (SLOTS as readonly string[]).includes(body.testSend.stage)) {
            testSend = { userId: body.testSend.userId, stage: body.testSend.stage as Slot };
          }
        } catch { /* empty body is fine */ }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // These tables postdate the generated types.
        const db = supabaseAdmin as any;
        const appUrl = process.env.APP_URL || "https://app.thekyaproject.com";
        const now = new Date();
        const todayStart = `${now.toISOString().slice(0, 10)}T00:00:00Z`;

        let profiles: Profile[];
        let raw: RawRows;
        try {
          const [p, birds, members, permissions, weights, dailyLogs, journals, invites, sits, log, pushes, letters] = await Promise.all([
            selectAll<Profile>((a, b) => db.from("profiles").select("id, email, display_name, created_at, marketing_opt_in, locale, notify_onboarding").order("id").range(a, b)),
            selectAll<RawRows["birds"][number]>((a, b) => db.from("birds").select("id, owner_id, name, created_at, passed_at, setup_complete").order("id").range(a, b)),
            selectAll<RawRows["members"][number]>((a, b) => db.from("bird_members").select("bird_id, user_id, role").eq("role", "household").order("bird_id").order("user_id").range(a, b)),
            selectAll<RawRows["permissions"][number]>((a, b) => db.from("household_member_permissions").select("owner_id, member_user_id, capabilities").order("owner_id").order("member_user_id").range(a, b)),
            selectAll<RawRows["weights"][number]>((a, b) => db.from("weight_entries").select("bird_id, source").in("source", ["owner", "household"]).order("id").range(a, b)),
            selectAll<RawRows["dailyLogs"][number]>((a, b) => db.from("daily_logs").select("bird_id, source").in("source", ["owner", "household"]).order("id").range(a, b)),
            selectAll<RawRows["journals"][number]>((a, b) => db.from("journal_entries").select("bird_id, sit_id").is("sit_id", null).order("id").range(a, b)),
            selectAll<RawRows["invites"][number]>((a, b) => db.from("household_invites").select("owner_id").order("id").range(a, b)),
            selectAll<RawRows["sits"][number]>((a, b) => db.from("sits").select("owner_id, sitter_name").order("id").range(a, b)),
            selectAll<RawRows["log"][number]>((a, b) => db.from("onboarding_email_log").select("user_id, stage, status, sent_at").order("user_id").order("stage").range(a, b)),
            // Push nudges today. Only the two engagement nudges count: a sit or
            // health-alert push is not marketing and never blocks an email.
            selectAll<{ user_id: string }>((a, b) => db.from("notification_log").select("user_id").eq("channel", "push").in("type", ["weight_reminder", "checkin_reminder"]).gte("sent_at", todayStart).order("id").range(a, b)),
            selectAll<{ owner_id: string }>((a, b) => db.from("monthly_letter_log").select("owner_id").gte("sent_at", todayStart).order("owner_id").range(a, b)),
          ]);
          profiles = p;
          raw = {
            profiles: p,
            birds,
            members,
            permissions,
            weights,
            dailyLogs,
            journals,
            invites,
            sits,
            log,
            pushedToday: pushes.map((r) => r.user_id),
            flockReportToday: letters.map((r) => r.owner_id),
          };
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }

        const profileById = new Map(profiles.map((p) => [p.id, p]));
        async function emailFor(userId: string): Promise<string> {
          const profile = profileById.get(userId);
          let email = (profile?.email ?? "").toString().trim();
          if (!email) {
            const { data: au } = await supabaseAdmin.auth.admin.getUserById(userId);
            email = au?.user?.email ?? "";
          }
          return email;
        }

        // Audit mode: the manual-campaign list — PRE-launch accounts that never
        // added a bird. Read-only.
        if (audit === "no_bird") {
          const hasLiving = new Set(raw.birds.filter((b) => !b.passed_at).map((b) => b.owner_id));
          const out: Array<{ email: string; name: string | null; signed_up: string; marketing_opt_in: boolean }> = [];
          for (const profile of profiles) {
            if (new Date(profile.created_at) >= new Date(ONBOARDING_LAUNCH)) continue;
            if (hasLiving.has(profile.id)) continue;
            const email = await emailFor(profile.id);
            if (!email) continue;
            out.push({ email, name: profile.display_name ?? null, signed_up: profile.created_at, marketing_opt_in: !!profile.marketing_opt_in });
          }
          return Response.json({ ok: true, audit: "no_bird", count: out.length, accounts: out });
        }

        const accounts = buildAccounts(raw);

        if (simulateDays) {
          return Response.json({ ok: true, dryRun: true, logic: "one-system", start: now.toISOString(), days: simulateDays, events: simulate(accounts, now, simulateDays) });
        }

        const decisions: Array<{ account: OnboardingAccount; decision: Extract<Decision, { kind: "act" }> }> = [];
        const holds: Record<string, number> = {};
        for (const account of accounts) {
          const decision = decide(account, now);
          if (decision.kind === "hold") {
            holds[decision.reason] = (holds[decision.reason] ?? 0) + 1;
            continue;
          }
          decisions.push({ account, decision });
        }

        if (dryRun && !testSend) {
          return Response.json({
            ok: true,
            dryRun: true,
            // Lets a dry run confirm which build is live.
            logic: "one-system",
            planned: decisions.map(({ account, decision }) => ({
              userId: account.userId,
              skips: decision.skips,
              send: decision.send,
              birdName: account.linkBird?.name ?? null,
            })),
            holds,
          });
        }

        // The weighing letter's example chart is the same rendered image the
        // Flock Report uses, so the two look alike. Fixed demo data.
        const { chartUrl, CHART_DEMO_ID } = await import("@/lib/chartLink");
        const { unsubUrl, unsubHeaders } = await import("@/lib/unsubscribe");
        let demoChartUrl: string | undefined;
        try {
          const { chartPng } = await import("@/lib/weightChart.server");
          await chartPng({ points: [{ day: 1, g: 750 }], days: 30, axisStart: "", axisEnd: "" });
          demoChartUrl = chartUrl(appUrl, CHART_DEMO_ID, 2026, 9);
        } catch (e) {
          console.error("[onboarding-emails] demo chart render failed; falling back to dots", e);
        }
        const {
          buildWelcomeEmail, buildSeriesWeighingEmail, buildSeriesHealthCheckEmail, buildSeriesCarePlanEmail,
          buildSeriesJournalEmail, buildSeriesSharingEmail, buildSeriesVetEmail, buildAddFirstBirdEmail,
        } = await import("@/lib/flockEmails");
        const { sendTransactionalEmail, founderReplyTo } = await import("@/lib/brevoEmail.server");

        /** Build one stage's email for one account and send it, through the
         *  same path the cron uses. `test` sends are for checking the tracker:
         *  Brevo tag qa_preview, click rows flagged is_test, nothing logged. */
        async function sendStage(account: OnboardingAccount, stage: Slot, ctaVariant: "standard" | "no_bird", test = false) {
          const userId = account.userId;
          const email = await emailFor(userId);
          if (!email) return { ok: false as const, skipped: "no-email" };
          const profile = profileById.get(userId);
          const firstName = ((profile?.display_name ?? "").trim().split(/\s+/)[0] || "").trim() || undefined;
          // profiles.locale, else the language their auth emails used (null
          // locales got English onboarding after Dutch confirmation emails).
          const { lifecycleLocaleFor } = await import("@/lib/emailLocale.server");
          const locale = await lifecycleLocaleFor(supabaseAdmin, userId, profile?.locale);
          const unsub = unsubUrl(appUrl, userId, "onboarding");
          const hasBird = ctaVariant === "standard";
          const bird = account.linkBird;
          const feature = STAGE_FEATURE[stage];
          // The add-a-bird flow, carrying the stage's feature so the reader
          // lands on it once the bird is saved.
          const addBirdLink = `${appUrl}/birds/new${feature ? `?next=${feature}` : ""}`;
          const featureLink = bird && feature ? `${appUrl}/birds/${bird.id}/${feature}` : addBirdLink;
          const common = { link: featureLink, hasBird, addBirdLink, locale, unsubscribeUrl: unsub };

          const built =
            stage === "welcome"
              ? buildWelcomeEmail({ firstName, link: appUrl, hasBird, addBirdLink: `${appUrl}/birds/new`, locale, unsubscribeUrl: unsub })
              : stage === "add_first_bird" || stage === "add_first_bird_reminder"
                ? buildAddFirstBirdEmail({ firstName, link: `${appUrl}/birds/new`, locale, unsubscribeUrl: unsub, reminder: stage === "add_first_bird_reminder" })
                : stage === "series_weighing"
                  ? buildSeriesWeighingEmail({ ...common, chartUrl: demoChartUrl })
                  : stage === "series_health_check"
                    ? buildSeriesHealthCheckEmail(common)
                    : stage === "series_care_plan"
                      ? buildSeriesCarePlanEmail(common)
                      : stage === "series_journal"
                        ? buildSeriesJournalEmail(common)
                        : stage === "series_sharing"
                          ? buildSeriesSharingEmail(common)
                          : buildSeriesVetEmail(common);

          return sendTransactionalEmail({
            to: email,
            toName: profile?.display_name ?? undefined,
            subject: built.subject,
            htmlContent: built.html,
            textContent: built.text,
            // The two emails signed by Brittany that ask for a reply — the
            // welcome and the one that closes the series.
            ...(stage === "welcome" || stage === "series_vet" ? { replyTo: founderReplyTo() } : {}),
            // Gmail and Apple Mail put their own unsubscribe button beside the
            // sender when these are present.
            headers: unsubHeaders(appUrl, userId, "onboarding"),
            // The stage is the email's tag: Brevo groups sends by it, and it is
            // utm_campaign on every link back into the app. A test send is kept
            // out of Brevo's numbers.
            tag: test ? "qa_preview" : stage,
            // Every link goes through the /r/ click tracker, which records the
            // stage, the button variant and which link was clicked.
            clicks: { userId, variant: ctaVariant, email: stage, test },
          });
        }

        if (testSend) {
          const account = accounts.find((a) => a.userId === testSend!.userId);
          if (!account) return Response.json({ ok: false, error: "no such account" }, { status: 404 });
          const nudge = testSend.stage === "add_first_bird" || testSend.stage === "add_first_bird_reminder";
          // The variant the account would get today: nudges are no-bird by
          // definition, everything else follows whether there is a bird.
          const variant = nudge || !account.hasBird ? "no_bird" : "standard";
          const res = await sendStage(account, testSend.stage, variant, true);
          return Response.json({ ok: res.ok, test: true, stage: testSend.stage, ctaVariant: variant, result: res });
        }

        const sent: Record<string, number> = {};
        const skipped: Record<string, number> = {};
        let failed = 0;
        let logErrors = 0;

        for (const { account, decision } of decisions) {
          const userId = account.userId;
          // Skips first: they are facts about the account right now and stand
          // whether or not today's send goes through. ignoreDuplicates keeps a
          // double-fired run from erroring on the primary key.
          if (decision.skips.length) {
            const { error } = await db.from("onboarding_email_log").upsert(
              decision.skips.map((s) => ({ user_id: userId, stage: s.stage, status: "skipped", skipped_reason: s.reason, sent_at: now.toISOString() })),
              { onConflict: "user_id,stage", ignoreDuplicates: true },
            );
            if (error) {
              logErrors += 1;
              console.error("[onboarding-emails] skip log failed", userId, error.message);
              continue; // don't send past slots we couldn't record as settled
            }
            for (const s of decision.skips) skipped[`${s.stage}:${s.reason}`] = (skipped[`${s.stage}:${s.reason}`] ?? 0) + 1;
          }
          if (!decision.send) continue;

          const { stage, ctaVariant } = decision.send;
          const res = await sendStage(account, stage, ctaVariant);
          if (!res.ok) {
            // Nothing logged: the slot stays open and retries on the next run.
            if (!("skipped" in res && res.skipped === "no-email")) failed += 1;
            continue;
          }
          const { error: logErr } = await db
            .from("onboarding_email_log")
            .insert({ user_id: userId, stage: stage satisfies Slot, status: "sent", cta_variant: ctaVariant, sent_at: new Date().toISOString() });
          if (logErr) {
            logErrors += 1;
            console.error("[onboarding-emails] log insert failed", userId, stage, logErr.message);
          }
          sent[stage] = (sent[stage] ?? 0) + 1;
        }

        return Response.json({ ok: true, considered: accounts.length, sent, skipped, holds, failed, logErrors });
      })),
    },
  },
});
