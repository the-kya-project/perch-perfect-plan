/**
 * Stripe webhook for Flock memberships: POST /api/public/stripe/billing
 * (backlog 1.14, switched off).
 *
 * Separate from the gift webhook (/api/public/stripe/webhook), with its own
 * secret, STRIPE_BILLING_WEBHOOK_SECRET. Under /api/public/ because it
 * authenticates itself: every request must carry a valid Stripe-Signature,
 * checked against the raw body.
 *
 *   503  BILLING_ENABLED isn't "true", or the secret isn't set: nothing is read
 *        or written, and Stripe retries later.
 *   400  missing or invalid signature (never retried into success).
 *   500  a Stripe or database error, so Stripe retries.
 *
 * Events: checkout.session.completed (metadata kind flock_billing: subscription
 * mode, or setup mode in the free season's last 49 hours, which starts the
 * subscription here), customer.subscription.*, invoice.paid / payment_failed /
 * payment_succeeded. Each one re-reads the subscription and writes its
 * entitlement row from that (billingWebhook.ts). Everything else is
 * acknowledged and ignored.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { billingEnabled } from "@/lib/billing";

const json = (body: unknown, status = 200) => Response.json(body, { status });

export const Route = createFileRoute("/api/public/stripe/billing")({
  server: {
    handlers: {
      POST: withErrorTelemetry("/api/public/stripe/billing", async ({ request }) => {
        if (!billingEnabled(process.env.BILLING_ENABLED)) return json({ ok: false, error: "billing is switched off" }, 503);
        const secret = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
        if (!secret) return json({ ok: false, error: "STRIPE_BILLING_WEBHOOK_SECRET not configured" }, 503);

        const signature = request.headers.get("stripe-signature");
        if (!signature) return json({ ok: false, error: "missing signature" }, 400);
        const body = await request.text();

        const { getBillingStripe } = await import("@/lib/stripe.server");
        const stripe = getBillingStripe();

        let event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, signature, secret);
        } catch {
          return json({ ok: false, error: "invalid signature" }, 400);
        }

        const { handleStripeBillingEvent } = await import("@/lib/billingWebhook.server");
        const result = await handleStripeBillingEvent(event as never);
        return json({ ok: true, type: event.type, ...result });
      }),
    },
  },
});
