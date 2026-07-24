/**
 * Engagement nudges — daily cron (suggested 16:00 UTC, after the onboarding
 * drip so the same-day dedupe below can see today's drip sends).
 *
 * Push-only re-engagement for owners who already have push enabled:
 *
 *   weight_reminder — per bird with ≥1 weight entry: nudge when the gap since
 *     the last weigh-in stretches past the owner's own rhythm (1.5× their
 *     median interval, clamped to 3–14 days; 7 days when <3 entries). Zero
 *     entries ever = onboarding-drip territory, never nudged here.
 *
 *   checkin_reminder — owner-level lapse: no activity (weight entry or daily
 *     log) for 10 days → one gentle nudge; 30 days → one more. Nothing after
 *     that until they come back (nudges since last activity are counted, so
 *     an ignored pair goes quiet instead of looping).
 *
 * Guardrails, in order:
 *   - at most ONE nudge per user per run
 *   - nothing if ANY nudge went to the user in the last 20 hours
 *   - nothing if the onboarding drip emailed them today (no double-tap days)
 *   - per-bird weight nudges at least 5 days apart
 *   - per-user toggles (push_weight_reminder / push_checkin_reminder) are
 *     enforced inside sendPushToOwner; passed birds are skipped
 *
 * Every send is awaited and logged to notification_log AFTER a confirmed
 * send (sent > 0), so failures retry next run — same rails as the drip.
 *
 * Auth: `Authorization: Bearer <CARE_PLAN_REMINDER_SECRET>`.
 * Body { "dryRun": true } → returns planned nudges, sends/logs nothing.
 */
import { createFileRoute } from "@tanstack/react-router";

const DAY = 1000 * 60 * 60 * 24;

type BirdRow = { id: string; name: string | null; owner_id: string; passed_at: string | null };
type Planned = { userId: string; type: "weight_reminder" | "checkin_reminder"; birdId: string | null; birdName: string; daysSince: number; checkinStage?: 10 | 30 };

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Days the owner's own logging rhythm tolerates before a nudge is due. */
function weightDueDays(entryDates: number[]): number {
  if (entryDates.length < 3) return 7;
  const gaps: number[] = [];
  for (let i = 0; i < entryDates.length - 1; i++) {
    gaps.push((entryDates[i] - entryDates[i + 1]) / DAY);
  }
  return Math.min(14, Math.max(3, Math.round(median(gaps) * 1.5)));
}

export const Route = createFileRoute("/api/public/hooks/engagement-nudges")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.CARE_PLAN_REMINDER_SECRET;
        const auth = request.headers.get("authorization") ?? "";
        if (!secret || auth !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        const body = (await request.json().catch(() => ({}))) as { dryRun?: boolean };
        const dryRun = body.dryRun === true;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = Date.now();

        // Only owners with an active push subscription can receive anything.
        const { data: subs, error: subsErr } = await supabaseAdmin
          .from("push_subscriptions")
          .select("user_id");
        if (subsErr) return Response.json({ ok: false, error: subsErr.message }, { status: 500 });
        const userIds = [...new Set((subs ?? []).map((s) => s.user_id as string))];
        if (userIds.length === 0) return Response.json({ ok: true, planned: [], sent: 0 });

        // notification_log + onboarding_email_log postdate the generated types
        // (same cast the onboarding-emails hook uses).
        const admin = supabaseAdmin as any;
        const [{ data: birds }, { data: recentLog }, { data: dripLog }] = await Promise.all([
          supabaseAdmin
            .from("birds")
            .select("id, name, owner_id, passed_at")
            .in("owner_id", userIds),
          admin
            .from("notification_log")
            .select("user_id, bird_id, type, sent_at")
            .in("user_id", userIds)
            .gte("sent_at", new Date(now - 45 * DAY).toISOString()) as Promise<{ data: Array<{ user_id: string; bird_id: string | null; type: string; sent_at: string }> | null }>,
          admin
            .from("onboarding_email_log")
            .select("user_id, sent_at")
            .in("user_id", userIds)
            .gte("sent_at", new Date(now - 1 * DAY).toISOString()) as Promise<{ data: Array<{ user_id: string; sent_at: string }> | null }>,
        ]);

        const livingBirds = ((birds ?? []) as BirdRow[]).filter((b) => !b.passed_at);
        const birdIds = livingBirds.map((b) => b.id);

        // Recent-enough weights and logs to compute rhythms and lapses.
        const [{ data: weights }, { data: dailyLogs }] = await Promise.all([
          birdIds.length
            ? supabaseAdmin
                .from("weight_entries")
                .select("bird_id, measured_at, created_at")
                .in("bird_id", birdIds)
                .order("measured_at", { ascending: false })
                .limit(4000)
            : Promise.resolve({ data: [] as never[] }),
          birdIds.length
            ? supabaseAdmin
                .from("daily_logs")
                .select("bird_id, created_at")
                .in("bird_id", birdIds)
                .gte("created_at", new Date(now - 60 * DAY).toISOString())
            : Promise.resolve({ data: [] as never[] }),
        ]);

        const weightsByBird = new Map<string, number[]>();
        for (const w of (weights ?? []) as Array<{ bird_id: string; measured_at: string | null; created_at: string }>) {
          const t = new Date(w.measured_at ?? w.created_at).getTime();
          const arr = weightsByBird.get(w.bird_id) ?? [];
          if (arr.length < 10) arr.push(t); // newest-first, 10 is plenty for a median
          weightsByBird.set(w.bird_id, arr);
        }

        const ownerOf = new Map(livingBirds.map((b) => [b.id, b.owner_id]));
        const lastActivity = new Map<string, number>(); // owner -> latest weight/log
        const bump = (owner: string | undefined, t: number) => {
          if (!owner) return;
          if (t > (lastActivity.get(owner) ?? 0)) lastActivity.set(owner, t);
        };
        for (const [birdId, arr] of weightsByBird) bump(ownerOf.get(birdId), arr[0]);
        for (const l of (dailyLogs ?? []) as Array<{ bird_id: string; created_at: string }>) {
          bump(ownerOf.get(l.bird_id), new Date(l.created_at).getTime());
        }

        const dripToday = new Set((dripLog ?? []).map((d) => d.user_id as string));
        const logRows = (recentLog ?? []) as Array<{ user_id: string; bird_id: string | null; type: string; sent_at: string }>;
        const anyNudgeSince = (userId: string, ms: number) =>
          logRows.some((r) => r.user_id === userId && new Date(r.sent_at).getTime() > now - ms);
        const birdWeightNudgeSince = (birdId: string, ms: number) =>
          logRows.some((r) => r.bird_id === birdId && r.type === "weight_reminder" && new Date(r.sent_at).getTime() > now - ms);
        const checkinsSince = (userId: string, t: number) =>
          logRows.filter((r) => r.user_id === userId && r.type === "checkin_reminder" && new Date(r.sent_at).getTime() > t).length;

        const planned: Planned[] = [];
        for (const userId of userIds) {
          if (anyNudgeSince(userId, 20 * 60 * 60 * 1000)) continue;
          if (dripToday.has(userId)) continue;

          const myBirds = livingBirds.filter((b) => b.owner_id === userId);
          if (myBirds.length === 0) continue;

          // Weight nudge: most-overdue bird wins.
          let best: Planned | null = null;
          for (const bird of myBirds) {
            const entries = weightsByBird.get(bird.id) ?? [];
            if (entries.length === 0) continue; // drip territory
            const daysSince = Math.floor((now - entries[0]) / DAY);
            const due = weightDueDays(entries);
            if (daysSince < due) continue;
            if (birdWeightNudgeSince(bird.id, 5 * DAY)) continue;
            const cand: Planned = { userId, type: "weight_reminder", birdId: bird.id, birdName: bird.name ?? "Your bird", daysSince };
            if (!best || cand.daysSince > best.daysSince) best = cand;
          }
          if (best) { planned.push(best); continue; }

          // Check-in nudge: owner-level lapse, two touches per lapse episode.
          const activity = lastActivity.get(userId) ?? 0;
          if (activity === 0) continue; // never active — drip handles onboarding
          const lapseDays = Math.floor((now - activity) / DAY);
          const sentThisEpisode = checkinsSince(userId, activity);
          const stage: 10 | 30 | null =
            lapseDays >= 30 && sentThisEpisode === 1 ? 30 :
            lapseDays >= 10 && sentThisEpisode === 0 ? 10 : null;
          if (!stage) continue;
          const bird = myBirds[0];
          planned.push({ userId, type: "checkin_reminder", birdId: bird.id, birdName: bird.name ?? "your bird", daysSince: lapseDays, checkinStage: stage });
        }

        if (dryRun) return Response.json({ ok: true, dryRun: true, planned });

        const { sendPushToOwner } = await import("@/lib/pushSender.server");
        let sent = 0;
        for (const p of planned) {
          const payload =
            p.type === "weight_reminder"
              ? {
                  title: "Weigh-in time",
                  body: `${p.birdName} is due for a weigh-in — the last one was ${p.daysSince} days ago.`,
                  url: `/birds/${p.birdId}`,
                  tag: `weight-reminder-${p.birdId}`,
                }
              : p.checkinStage === 10
                ? {
                    title: "A quick check-in",
                    body: `It's been a little while since ${p.birdName}'s last entry. Two minutes keeps the record whole.`,
                    url: "/dashboard",
                    tag: `checkin-reminder-${p.userId}`,
                  }
                : {
                    title: `${p.birdName} says hi`,
                    body: `${p.birdName}'s health record is right where you left it, whenever you're ready.`,
                    url: "/dashboard",
                    tag: `checkin-reminder-${p.userId}`,
                  };

          try {
            const res = await sendPushToOwner(p.userId, p.type, payload);
            if (res.sent > 0) {
              sent += 1;
              await admin.from("notification_log").insert({
                user_id: p.userId,
                bird_id: p.birdId,
                type: p.type,
                channel: "push",
              });
            }
          } catch (e) {
            console.error("[engagement-nudges] send failed", p.userId, p.type, e);
          }
        }

        return Response.json({ ok: true, planned: planned.length, sent });
      },
    },
  },
});
