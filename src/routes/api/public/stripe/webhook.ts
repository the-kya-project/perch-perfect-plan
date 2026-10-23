/**
 * Stripe webhook for gift memberships: POST /api/public/stripe/webhook
 *
 * The ONLY place a gift_purchases row is created. Under /api/public/ like the
 * cron hooks because it authenticates itself: every request must carry a valid
 * Stripe-Signature for STRIPE_WEBHOOK_SECRET, checked against the raw body.
 *
 * Events handled:
 *   checkout.session.completed            record the gift (if paid), send emails
 *   checkout.session.async_payment_succeeded  same, for delayed payment methods
 *   charge.refunded                       mark the gift refunded (full refunds)
 * Everything else is acknowledged and ignored.
 *
 * Idempotent: Stripe may deliver an event more than once. record_gift_purchase
 * does nothing on a repeated Checkout session, and each email is claimed before
 * it is sent (see giftEmails.server.ts). A database error returns 500 so Stripe
 * retries; a request that fails verification returns 400 and is never retried
 * into success.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withErrorTelemetry } from "@/lib/errorTelemetry";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export const Route = createFileRoute("/api/public/stripe/webhook")({
  server: {
    handlers: {
      POST: withErrorTelemetry("/api/public/stripe/webhook", async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) return json({ ok: false, error: "STRIPE_WEBHOOK_SECRET not configured" }, 503);

        const signature = request.headers.get("stripe-signature");
        if (!signature) return json({ ok: false, error: "missing signature" }, 400);
        const body = await request.text();

        const { getStripe } = await import("@/lib/stripe.server");
        const stripe = getStripe();

        let event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, signature, secret);
        } catch {
          return json({ ok: false, error: "invalid signature" }, 400);
        }

        const { handleGiftWebhookEvent } = await import("@/lib/giftWebhook.server");
        const result = await handleGiftWebhookEvent(event);
        return json({ ok: true, type: event.type, ...result });
      }),
    },
  },
});
