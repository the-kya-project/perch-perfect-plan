/**
 * Onboarding welcome — every 15 minutes (`onboarding-welcome-15min`, at :07,
 * :22, :37 and :52 past each hour).
 *
 * Sends the welcome from Brittany about an hour after a person confirms their
 * email: a run picks up everyone confirmed at least 60 minutes ago, so the
 * welcome lands 60–75 minutes after confirmation. The rules live in
 * src/lib/welcomeTiming.ts; this file loads rows, sends and logs.
 *
 *   who        confirmed in the last 48 hours, signed up on or after
 *              SERIES_LAUNCH, notify_onboarding not false, and no welcome row
 *              in onboarding_email_log yet (sent or skipped)
 *   quiet      if their saved time zone puts the 1-hour mark between 10 PM and
 *              7 AM, the welcome waits until 8 AM there. No time zone → the
 *              1-hour mark
 *   version    'standard' if they own or share a living bird at send time,
 *              else 'no_bird' (the add-a-bird button). Read on each run, so it
 *              reflects their first session
 *   blocked    an address Brevo has blocked (hard bounce, spam complaint,
 *              unsubscribe, manual block), or a reserved test domain, is
 *              logged as skipped `undeliverable` and never sent
 *
 * NEVER TWICE. The run claims the welcome row (primary key user_id + stage)
 * BEFORE sending; a second run, or the daily batch, finds it taken. If the send
 * fails the claim is released and the next run tries again. The daily batch
 * (onboarding-emails) never sends the welcome: it holds an account until the
 * welcome is settled, and skips it `welcome_missed` only after the 48-hour
 * window here has closed.
 *
 * Auth: `Authorization: Bearer <CARE_PLAN_REMINDER_SECRET>`. JSON body options:
 *   { "dryRun": true }   → who would get the welcome now, and who is waiting
 *                          (and until when); nothing sent or logged
 *
 * Every send is awaited before the response returns (serverless).
 */
import { createFileRoute } from "@tanstack/react-router";
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { withCronTelemetry } from "@/lib/cronTelemetry";
import { buildAccounts, WELCOME_WINDOW_HOURS, type CtaVariant, type RawRows } from "@/lib/onboardingPlan";
import { welcomeDecision, type WelcomeHold } from "@/lib/welcomeTiming";

type Confirmation = { user_id: string; email: string | null; created_at: string; email_confirmed_at: string | null };
type Profile = {
  id: string;
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  full_name: string | null;
  created_at: string;
  locale: string | null;
  notify_onboarding: boolean | null;
  time_zone: string | null;
};

export const Route = createFileRoute("/api/public/hooks/onboarding-welcome")({
  server: {
    handlers: {
      POST: withCronTelemetry("onboarding-welcome", withErrorTelemetry("/api/public/hooks/onboarding-welcome", async ({ request }) => {
        const secret = process.env.CARE_PLAN_REMINDER_SECRET;
        if (!secret) {
          return Response.json({ ok: false, error: "CARE_PLAN_REMINDER_SECRET not configured" }, { status: 503 });
        }
        if ((request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        let dryRun = false;
        try {
          const body = await request.clone().json();
          dryRun = body?.dryRun === true;
        } catch { /* empty body is fine */ }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // These tables and the function postdate the generated types.
        const db = supabaseAdmin as any;
        const appUrl = process.env.APP_URL || "https://app.thekyaproject.com";
        const now = new Date();
        const since = new Date(now.getTime() - WELCOME_WINDOW_HOURS * 3_600_000).toISOString();

        // Everyone confirmed inside the window. A handful of rows per day.
        const { data: confirmed, error: confErr } = await db.rpc("onboarding_confirmations", { p_confirmed_since: since });
        if (confErr) return Response.json({ ok: false, error: confErr.message }, { status: 500 });
        const confirmations = (confirmed ?? []) as Confirmation[];
        const ids = confirmations.map((c) => c.user_id);

        const sent: Record<string, number> = {};
        const skipped: Record<string, number> = {};
        const holds: Partial<Record<WelcomeHold | "bird_passed" | "blocklist_unavailable" | "no_email", number>> = {};
        const hold = (r: keyof typeof holds) => { holds[r] = (holds[r] ?? 0) + 1; };
        if (ids.length === 0) {
          return Response.json({ ok: true, ...(dryRun ? { dryRun: true, planned: [], waiting: [] } : {}), considered: 0, sent, skipped, holds, failed: 0, logErrors: 0 });
        }

        const [profilesRes, logRes, ownedRes, memberRes] = await Promise.all([
          db.from("profiles").select("id, email, display_name, first_name, full_name, created_at, locale, notify_onboarding, time_zone").in("id", ids),
          db.from("onboarding_email_log").select("user_id").eq("stage", "welcome").in("user_id", ids),
          db.from("birds").select("id, owner_id, name, created_at, passed_at, setup_complete").in("owner_id", ids),
          db.from("bird_members").select("bird_id, user_id, role").eq("role", "household").in("user_id", ids),
        ]);
        const firstErr = [profilesRes, logRes, ownedRes, memberRes].find((r) => r.error)?.error;
        if (firstErr) return Response.json({ ok: false, error: firstErr.message }, { status: 500 });
        const members = (memberRes.data ?? []) as RawRows["members"];
        let shared: RawRows["birds"] = [];
        const sharedIds = members.map((m) => m.bird_id);
        if (sharedIds.length) {
          const { data, error } = await db.from("birds").select("id, owner_id, name, created_at, passed_at, setup_complete").in("id", sharedIds);
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          shared = data ?? [];
        }

        const profiles = (profilesRes.data ?? []) as Profile[];
        const profileById = new Map(profiles.map((p) => [p.id, p]));
        const welcomed = new Set(((logRes.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
        // Bird state at send time, worked out exactly as the daily batch does.
        const birdsById = new Map([...(ownedRes.data ?? []), ...shared].map((b: RawRows["birds"][number]) => [b.id, b]));
        const accounts = new Map(
          buildAccounts({
            profiles: profiles.map((p) => ({ id: p.id, created_at: p.created_at, notify_onboarding: p.notify_onboarding })),
            birds: [...birdsById.values()],
            members,
            permissions: [], weights: [], dailyLogs: [], journals: [], invites: [], sits: [], log: [],
            pushedToday: [], flockReportToday: [],
          }).map((a) => [a.userId, a]),
        );

        type Due = { c: Confirmation; profile: Profile | undefined; to: string; ctaVariant: CtaVariant; sendAt: string; quietHold: boolean };
        const due: Due[] = [];
        const waiting: Array<{ userId: string; reason: WelcomeHold; sendAt?: string }> = [];
        for (const c of confirmations) {
          const profile = profileById.get(c.user_id);
          const decision = welcomeDecision(
            {
              userId: c.user_id,
              createdAt: profile?.created_at ?? c.created_at,
              confirmedAt: c.email_confirmed_at,
              notifyOnboarding: profile?.notify_onboarding !== false,
              timeZone: profile?.time_zone ?? null,
              welcomeSettled: welcomed.has(c.user_id),
            },
            now,
          );
          if (decision.kind === "hold") {
            hold(decision.reason);
            if (decision.reason === "too_soon" || decision.reason === "quiet_hours") waiting.push({ userId: c.user_id, reason: decision.reason, sendAt: decision.sendAt });
            continue;
          }
          const account = accounts.get(c.user_id);
          // A grieving owner with no other bird gets nothing (as in the daily
          // batch); nothing is logged, so it would go if a bird were added.
          if (account?.onlyPassedBirds) { hold("bird_passed"); continue; }
          const to = ((profile?.email ?? "").trim() || (c.email ?? "").trim());
          due.push({ c, profile, to, ctaVariant: account?.hasBird ? "standard" : "no_bird", sendAt: decision.sendAt, quietHold: decision.quietHold });
        }

        const { brevoBlockedAddresses, isUndeliverableAddress } = await import("@/lib/brevoEmail.server");
        // Read Brevo's blocklist only when someone is due (most runs, nobody is).
        const blocked = due.length ? await brevoBlockedAddresses() : new Map<string, string>();
        const undeliverable = (to: string) => !to ? null : isUndeliverableAddress(to) ? "test_domain" : blocked?.get(to.toLowerCase()) ?? null;

        if (dryRun) {
          const { lifecycleLocaleFor } = await import("@/lib/emailLocale.server");
          const planned = [];
          for (const d of due) {
            planned.push({
              userId: d.c.user_id,
              email: d.to || null,
              firstName: d.profile?.first_name ?? null,
              locale: await lifecycleLocaleFor(supabaseAdmin, d.c.user_id, d.profile?.locale),
              timeZone: d.profile?.time_zone ?? null,
              signedUp: d.profile?.created_at ?? d.c.created_at,
              confirmed: d.c.email_confirmed_at,
              sendAt: d.sendAt,
              quietHold: d.quietHold,
              ctaVariant: d.ctaVariant,
              birdName: accounts.get(d.c.user_id)?.linkBird?.name ?? null,
              undeliverable: blocked ? undeliverable(d.to) : "blocklist_unavailable",
            });
          }
          return Response.json({ ok: true, dryRun: true, now: now.toISOString(), considered: confirmations.length, planned, waiting, holds });
        }

        if (due.length && !blocked) {
          // Can't tell who is blocked: wait for the next run rather than send blind.
          for (let i = 0; i < due.length; i++) hold("blocklist_unavailable");
          return Response.json({ ok: true, considered: confirmations.length, sent, skipped, holds, failed: 0, logErrors: 0 });
        }

        const { sendWelcomeEmail } = await import("@/lib/onboardingWelcome.server");
        let failed = 0;
        let logErrors = 0;
        for (const d of due) {
          const userId = d.c.user_id;
          if (!d.to) { hold("no_email"); continue; }
          const reason = undeliverable(d.to);
          if (reason) {
            const { error } = await db.from("onboarding_email_log").upsert(
              { user_id: userId, stage: "welcome", status: "skipped", skipped_reason: "undeliverable", sent_at: now.toISOString() },
              { onConflict: "user_id,stage", ignoreDuplicates: true },
            );
            if (error) { logErrors += 1; console.error("[onboarding-welcome] skip log failed", userId, error.message); continue; }
            skipped[`welcome:undeliverable:${reason}`] = (skipped[`welcome:undeliverable:${reason}`] ?? 0) + 1;
            continue;
          }
          // Claim first: the primary key lets exactly one run (or the daily
          // batch) hold the welcome for this account.
          const claimedAt = new Date().toISOString();
          const { error: claimErr } = await db
            .from("onboarding_email_log")
            .insert({ user_id: userId, stage: "welcome", status: "sent", cta_variant: d.ctaVariant, sent_at: claimedAt });
          if (claimErr) {
            if (claimErr.code === "23505") { hold("already_welcomed"); continue; }
            logErrors += 1;
            console.error("[onboarding-welcome] claim failed", userId, claimErr.message);
            continue;
          }
          const res = await sendWelcomeEmail({ supabaseAdmin, appUrl, userId, to: d.to, profile: d.profile, ctaVariant: d.ctaVariant });
          if (!res.ok) {
            failed += 1;
            // Release the claim so the next run tries again (within the window).
            const { error: relErr } = await db.from("onboarding_email_log").delete().eq("user_id", userId).eq("stage", "welcome").eq("sent_at", claimedAt);
            if (relErr) { logErrors += 1; console.error("[onboarding-welcome] claim release failed", userId, relErr.message); }
            continue;
          }
          sent[`welcome:${d.ctaVariant}`] = (sent[`welcome:${d.ctaVariant}`] ?? 0) + 1;
        }

        return Response.json({ ok: true, considered: confirmations.length, sent, skipped, holds, failed, logErrors });
      })),
    },
  },
});
