/**
 * Daily gift-email run (pg_cron job `gift-emails-daily`, scheduled by the
 * gift_purchases migration on production only).
 *
 * Sends each recipient email whose date has come (Indianapolis), and retries
 * any receipt or recipient email a webhook couldn't send. Same bearer secret as
 * the other /api/public/hooks/* endpoints: CARE_PLAN_REMINDER_SECRET, whose
 * value pg_cron reads from the Vault secret `cron_function_token`.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { withCronTelemetry } from "@/lib/cronTelemetry";

export const Route = createFileRoute("/api/public/hooks/gift-emails")({
  server: {
    handlers: {
      POST: withCronTelemetry("gift-emails", withErrorTelemetry("/api/public/hooks/gift-emails", async ({ request }) => {
        const secret = process.env.CARE_PLAN_REMINDER_SECRET;
        if (!secret) {
          return Response.json({ ok: false, error: "CARE_PLAN_REMINDER_SECRET not configured" }, { status: 503 });
        }
        if ((request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { deliverGiftEmails } = await import("@/lib/giftEmails.server");
        const { giftToday } = await import("@/lib/gifts");

        // Recipient emails now due, plus receipts still owed.
        const [{ data: due, error: e1 }, { data: owed, error: e2 }] = await Promise.all([
          supabaseAdmin
            .from("gift_purchases")
            .select("id")
            .eq("status", "paid")
            .not("recipient_email", "is", null)
            .is("recipient_emailed_at", null)
            .lte("send_on", giftToday())
            .limit(500),
          supabaseAdmin
            .from("gift_purchases")
            .select("id")
            .neq("status", "refunded")
            .is("buyer_emailed_at", null)
            .limit(500),
        ]);
        if (e1 || e2) return Response.json({ ok: false, error: (e1 ?? e2)!.message }, { status: 500 });

        const ids = [...new Set([...(due ?? []), ...(owed ?? [])].map((r) => r.id as string))];
        const counts = { considered: ids.length, recipientSent: 0, receiptSent: 0, failed: 0 };
        for (const id of ids) {
          try {
            const r = await deliverGiftEmails(id);
            if (r.recipient === "sent") counts.recipientSent++;
            if (r.receipt === "sent") counts.receiptSent++;
            if (r.recipient === "failed" || r.receipt === "failed") counts.failed++;
          } catch (err) {
            counts.failed++;
            console.error("[gift-emails] delivery failed", id, err instanceof Error ? err.message : err);
          }
        }
        return Response.json({ ok: true, ...counts });
      })),
    },
  },
});
