/**
 * Save-error alerts: emails Brittany when saves in the app are failing.
 *
 *   urgent  every 15 minutes (`save-error-alerts-15min`, :02/:17/:32/:47),
 *           body {"mode":"urgent"}: a kind of error never emailed about
 *           before, or one kind hitting 3+ people within an hour. At most one
 *           urgent email per kind per UTC day.
 *   daily   13:30 UTC (`save-error-alerts-daily`), body {"mode":"daily"}: what
 *           failed in the last 24 hours, how often, for how many people, on
 *           which platforms. Nothing is sent when nothing failed. Also deletes
 *           save_errors rows older than 90 days.
 *
 * The rules and the copy live in src/lib/saveErrorAlerts.ts; the rows come from
 * public.save_errors (src/lib/saveErrors.ts). Rows a developer's local build
 * wrote (environment 'development') are left out.
 *
 * NEVER TWICE. Each email claims its save_error_alerts row (unique per kind,
 * error type and day) before sending, and releases it if the send fails, so
 * the next run tries again.
 *
 * WHEN EMAIL ITSELF FAILS. Brevo adds an Unsubscribe link to every
 * transactional email, so the alert inbox could end up on Brevo's blocklist.
 * Each run checks that list before sending. If the address is blocked, or a
 * send fails, the run fails (a non-200 `cron_hook_run` in PostHog) AND a push
 * goes to the app account with that email address (all its devices; always
 * sent, like a health concern), at most once a day.
 *
 * Settings (Vercel env): SAVE_ERROR_ALERTS = all | daily | off,
 * SAVE_ERROR_ALERT_TO, SAVE_ERROR_SPIKE_USERS (see saveErrorAlerts.ts).
 *
 * Auth: `Authorization: Bearer <CARE_PLAN_REMINDER_SECRET>`. JSON body:
 *   { "mode": "urgent" | "daily", "dryRun": true }  → what would be sent, as
 *                                                     JSON; nothing sent or logged
 *   { "testPush": true }  → a TEST version of that push, to check it arrives
 */
import { createFileRoute } from "@tanstack/react-router";
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { withCronTelemetry } from "@/lib/cronTelemetry";
import {
  ALERT_SENDER_NAME,
  alertSettings,
  buildDailyEmail,
  buildDeliveryProblemPush,
  buildUrgentEmail,
  groupSaveErrors,
  NEW_WINDOW_MS,
  planUrgent,
  type SaveErrorRow,
} from "@/lib/saveErrorAlerts";

const RETENTION_DAYS = 90;
const ROW_COLUMNS = "created_at, category, sqlstate, target, operation, route, platform, app_version, user_hash";

/** The save_error_alerts row that holds "pushed about failed delivery today". */
const DELIVERY_NOTICE = "notice:alert_delivery";

type AlertRow = { kind: "urgent" | "daily"; signature: string; alert_day: string; signatures: string[]; sent_at: string };

export const Route = createFileRoute("/api/public/hooks/save-error-alerts")({
  server: {
    handlers: {
      POST: withCronTelemetry("save-error-alerts", withErrorTelemetry("/api/public/hooks/save-error-alerts", async ({ request }) => {
        const secret = process.env.CARE_PLAN_REMINDER_SECRET;
        if (!secret) {
          return Response.json({ ok: false, error: "CARE_PLAN_REMINDER_SECRET not configured" }, { status: 503 });
        }
        if ((request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }
        let mode: "urgent" | "daily" = "urgent";
        let dryRun = false;
        let testPush = false;
        try {
          const body = await request.clone().json();
          if (body?.mode === "daily") mode = "daily";
          dryRun = body?.dryRun === true;
          testPush = body?.testPush === true;
        } catch { /* empty body: urgent */ }

        const settings = alertSettings(process.env);

        // The alert inbox's own app account, by email: where the delivery push goes.
        const pushToAlertOwner = async (reason: string, test = false) => {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: owner } = await (supabaseAdmin as any).from("profiles").select("id").ilike("email", settings.to).limit(1).maybeSingle();
          if (!owner?.id) return { sent: 0, skipped: "no-account-for-alert-address" };
          const { sendPushToOwner } = await import("@/lib/pushSender.server");
          return sendPushToOwner(owner.id, "ops_alert", buildDeliveryProblemPush(reason, { to: settings.to, test }));
        };
        if (testPush) {
          const push = await pushToAlertOwner("blocked:unsubscribed", true);
          return Response.json({ ok: push.sent > 0, testPush: true, push }, { status: push.sent > 0 ? 200 : 502 });
        }
        if (settings.mode === "off" || (mode === "urgent" && settings.mode === "daily")) {
          return Response.json({ ok: true, mode, skipped: `alerts_${settings.mode}` });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // These tables postdate the generated types.
        const db = supabaseAdmin as any;
        const now = new Date();
        const today = now.toISOString().slice(0, 10);

        const [rowsRes, alertsRes] = await Promise.all([
          db.from("save_errors").select(ROW_COLUMNS)
            .gte("created_at", new Date(now.getTime() - NEW_WINDOW_MS).toISOString())
            .neq("environment", "development")
            .order("created_at", { ascending: true })
            .limit(20000),
          db.from("save_error_alerts").select("kind, signature, alert_day, signatures, sent_at"),
        ]);
        if (rowsRes.error) return Response.json({ ok: false, error: rowsRes.error.message }, { status: 500 });
        if (alertsRes.error) return Response.json({ ok: false, error: alertsRes.error.message }, { status: 500 });
        const rows = (rowsRes.data ?? []) as SaveErrorRow[];
        const alerts = (alertsRes.data ?? []) as AlertRow[];
        const { sendTransactionalEmail, brevoBlockedAddresses } = await import("@/lib/brevoEmail.server");
        // Brevo adds its own List-Unsubscribe to every transactional email, so
        // one tap on "Unsubscribe" would put the alert inbox on its blocklist
        // and every alert after that would vanish. Check before each send and
        // fail loudly instead (a non-200 run shows in the cron_hook_run events).
        const recipientBlocked = async () => (await brevoBlockedAddresses())?.get(settings.to.toLowerCase()) ?? null;
        const send = (email: { subject: string; html: string; text: string }) =>
          sendTransactionalEmail({ to: settings.to, subject: email.subject, htmlContent: email.html, textContent: email.text, tag: "save_error_alert", senderName: ALERT_SENDER_NAME });
        // Email couldn't go: push (once a day; a failed push is retried next
        // run) and fail the run.
        const deliveryFailed = async (reason: string) => {
          let push: { sent: number; skipped?: string } = { sent: 0, skipped: "already-pushed-today" };
          const { error: claimErr } = await db.from("save_error_alerts").insert({ kind: "urgent", signature: DELIVERY_NOTICE, alert_day: today, reasons: [reason.slice(0, 100)] });
          if (!claimErr) {
            push = await pushToAlertOwner(reason).catch((e: unknown) => ({ sent: 0, skipped: e instanceof Error ? e.message : String(e) }));
            if (push.sent === 0) await db.from("save_error_alerts").delete().eq("kind", "urgent").eq("signature", DELIVERY_NOTICE).eq("alert_day", today);
          }
          return Response.json({ ok: false, mode, error: reason.startsWith("blocked:") ? `alert recipient is on Brevo's blocklist (${reason.slice(8)})` : `send failed: ${reason}`, push }, { status: 502 });
        };

        if (mode === "urgent") {
          const known = new Set(alerts.flatMap((a) => (a.kind === "urgent" ? [a.signature, ...a.signatures] : a.signatures)));
          // (The DELIVERY_NOTICE row lands in `known` too; it never matches an error type.)
          const alertedToday = new Set(alerts.filter((a) => a.kind === "urgent" && a.alert_day === today).map((a) => a.signature));
          const items = planUrgent(rows, now, { known, alertedToday, spikeUsers: settings.spikeUsers });
          if (dryRun) {
            return Response.json({ ok: true, dryRun: true, mode, rows: rows.length, urgent: items.map((i) => ({ signature: i.group.signature, reasons: i.reasons, people: i.group.people, count: i.group.count })), email: items.length ? buildUrgentEmail(items) : null });
          }
          if (items.length === 0) return Response.json({ ok: true, mode, rows: rows.length, sent: 0 });
          const blockedReason = await recipientBlocked();
          if (blockedReason) return deliveryFailed(`blocked:${blockedReason}`);

          // Claim each kind for today; one that another run already holds is dropped.
          const claimed: typeof items = [];
          for (const i of items) {
            const { error } = await db.from("save_error_alerts").insert({
              kind: "urgent", signature: i.group.signature, alert_day: today, reasons: i.reasons, signatures: [i.group.signature],
            });
            if (!error) claimed.push(i);
            else if (error.code !== "23505") console.error("[save-error-alerts] claim failed", error.message);
          }
          if (claimed.length === 0) return Response.json({ ok: true, mode, rows: rows.length, sent: 0, alreadySent: items.length });

          const email = buildUrgentEmail(claimed);
          const res = await send(email);
          if (!res.ok) {
            await db.from("save_error_alerts").delete().eq("kind", "urgent").eq("alert_day", today).in("signature", claimed.map((i) => i.group.signature));
            return deliveryFailed(String(res.skipped ?? res.error ?? res.status));
          }
          return Response.json({ ok: true, mode, rows: rows.length, sent: 1, kinds: claimed.length });
        }

        // Daily summary.
        const groups = groupSaveErrors(rows);
        const urgentToday = new Set(alerts.filter((a) => a.kind === "urgent" && now.getTime() - Date.parse(a.sent_at) <= NEW_WINDOW_MS).map((a) => a.signature));
        const email = buildDailyEmail(groups, { urgentToday, spikeUsers: settings.spikeUsers });
        if (dryRun) return Response.json({ ok: true, dryRun: true, mode, rows: rows.length, kinds: groups.length, email });

        const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000).toISOString();
        const { error: pruneErr } = await db.from("save_errors").delete().lt("created_at", cutoff);
        if (pruneErr) console.error("[save-error-alerts] prune failed", pruneErr.message);

        if (!email) return Response.json({ ok: true, mode, rows: 0, sent: 0 });
        if (alerts.some((a) => a.kind === "daily" && a.alert_day === today)) {
          return Response.json({ ok: true, mode, rows: rows.length, sent: 0, alreadySent: 1 });
        }
        const dailyBlocked = await recipientBlocked();
        if (dailyBlocked) return deliveryFailed(`blocked:${dailyBlocked}`);
        const { error: claimErr } = await db.from("save_error_alerts").insert({
          kind: "daily", signature: "daily", alert_day: today, signatures: groups.map((g) => g.signature),
        });
        if (claimErr) {
          if (claimErr.code === "23505") return Response.json({ ok: true, mode, rows: rows.length, sent: 0, alreadySent: 1 });
          return Response.json({ ok: false, mode, error: claimErr.message }, { status: 500 });
        }
        const res = await send(email);
        if (!res.ok) {
          await db.from("save_error_alerts").delete().eq("kind", "daily").eq("alert_day", today);
          return deliveryFailed(String(res.skipped ?? res.error ?? res.status));
        }
        return Response.json({ ok: true, mode, rows: rows.length, kinds: groups.length, sent: 1 });
      })),
    },
  },
});
