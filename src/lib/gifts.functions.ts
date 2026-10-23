// Gift memberships: the server functions behind /gift and /gift/thanks.
//
// None of these writes a gift. A gift row is created only by the Stripe webhook
// (src/routes/api/public/stripe/webhook.ts) after Stripe has verified payment;
// the Checkout session carries the buyer's choices to it as metadata.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { GIFT_MESSAGE_MAX, GIFT_NAME_MAX, GIFT_PLANS, isAllowedSendDate, type GiftPlan } from "./gifts";

export type GiftOption = { plan: GiftPlan; amountCents: number; currency: string };
export type GiftOptions = { available: boolean; options: GiftOption[] };

/** The two plans with their prices, read from Stripe so the page always shows
 *  what Checkout will charge. `available: false` when Stripe isn't configured
 *  for this deployment yet (production, until live keys are added). */
export const getGiftOptions = createServerFn({ method: "GET" }).handler(async (): Promise<GiftOptions> => {
  const { getStripe, giftPriceId, StripeNotConfigured } = await import("./stripe.server");
  try {
    const stripe = getStripe();
    const options = await Promise.all(
      GIFT_PLANS.map(async (plan) => {
        const price = await stripe.prices.retrieve(giftPriceId(plan));
        return { plan, amountCents: price.unit_amount ?? 0, currency: price.currency };
      }),
    );
    return { available: true, options };
  } catch (err) {
    if (err instanceof StripeNotConfigured) return { available: false, options: [] };
    console.error("[gifts] price lookup failed", err instanceof Error ? err.message : err);
    return { available: false, options: [] };
  }
});

const checkoutInput = z
  .object({
    plan: z.enum(GIFT_PLANS),
    recipientName: z.string().trim().min(1).max(GIFT_NAME_MAX),
    message: z.string().trim().max(GIFT_MESSAGE_MAX).optional().default(""),
    delivery: z.enum(["email", "self"]),
    recipientEmail: z.string().trim().max(254).optional(),
    sendOn: z.string().trim().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.delivery === "email") {
      if (!d.recipientEmail || !z.string().email().safeParse(d.recipientEmail).success) {
        ctx.addIssue({ code: "custom", path: ["recipientEmail"], message: "invalid_email" });
      }
      // Judged on the server clock, in Indianapolis.
      if (!d.sendOn || !isAllowedSendDate(d.sendOn)) {
        ctx.addIssue({ code: "custom", path: ["sendOn"], message: "invalid_date" });
      }
    }
  });

export type CheckoutResult = { ok: true; url: string } | { ok: false; reason: "unavailable" | "invalid" | "error" };

export const createGiftCheckout = createServerFn({ method: "POST" })
  .inputValidator((d: z.input<typeof checkoutInput>) => d)
  .handler(async ({ data }): Promise<CheckoutResult> => {
    const parsed = checkoutInput.safeParse(data);
    if (!parsed.success) return { ok: false, reason: "invalid" };
    const d = parsed.data;

    const { getStripe, giftPriceId, StripeNotConfigured } = await import("./stripe.server");
    const { getRequest } = await import("@tanstack/react-start/server");
    const origin = new URL(getRequest().url).origin;
    const toEmail = d.delivery === "email";

    try {
      const session = await getStripe().checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: giftPriceId(d.plan), quantity: 1 }],
        allow_promotion_codes: true,
        // The buyer's email comes from Checkout itself.
        billing_address_collection: "auto",
        success_url: `${origin}/gift/thanks?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/gift?canceled=1`,
        // Read back by the webhook. Stripe caps each value at 500 characters;
        // the message is at most 300.
        metadata: {
          kind: "gift",
          plan: d.plan,
          recipient_name: d.recipientName,
          message: d.message,
          recipient_email: toEmail ? d.recipientEmail!.toLowerCase() : "",
          send_on: toEmail ? d.sendOn! : "",
        },
        payment_intent_data: { metadata: { kind: "gift", plan: d.plan } },
      });
      if (!session.url) return { ok: false, reason: "error" };
      return { ok: true, url: session.url };
    } catch (err) {
      if (err instanceof StripeNotConfigured) return { ok: false, reason: "unavailable" };
      console.error("[gifts] checkout create failed", err instanceof Error ? err.message : err);
      return { ok: false, reason: "error" };
    }
  });

export type GiftForThanks =
  | { status: "pending" }
  | { status: "not_found" }
  | {
      status: "ready";
      plan: GiftPlan;
      giftCode: string;
      recipientName: string;
      message: string | null;
      recipientEmail: string | null;
      sendOn: string | null;
      givingRate: number;
      refunded: boolean;
    };

/**
 * The thank-you page's view of a purchase. The Checkout session id in the URL
 * is the bearer: Stripe makes it long and random, and only the buyer's browser
 * is sent to it. Returns `pending` while the webhook hasn't landed yet, so the
 * page can wait a few seconds instead of showing an error.
 */
export const getGiftBySession = createServerFn({ method: "GET" })
  .inputValidator((d: { sessionId: string }) =>
    z.object({ sessionId: z.string().regex(/^cs_(test|live)_[A-Za-z0-9]{10,200}$/) }).parse(d),
  )
  .handler(async ({ data }): Promise<GiftForThanks> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("gift_purchases")
      .select("plan, gift_code, recipient_name, message, recipient_email, send_on, giving_rate, status")
      .eq("stripe_checkout_session_id", data.sessionId)
      .maybeSingle();
    if (error) throw new Error(`gift lookup failed: ${error.message}`);
    if (row) {
      return {
        status: "ready",
        plan: row.plan as GiftPlan,
        giftCode: row.gift_code,
        recipientName: row.recipient_name,
        message: row.message,
        recipientEmail: row.recipient_email,
        sendOn: row.send_on,
        givingRate: Number(row.giving_rate),
        refunded: row.status === "refunded",
      };
    }
    // No row yet: is this a real session at all? Ask Stripe, so a made-up id
    // doesn't sit on "finishing up" forever.
    try {
      const { getStripe } = await import("./stripe.server");
      const session = await getStripe().checkout.sessions.retrieve(data.sessionId);
      if (session.metadata?.kind !== "gift") return { status: "not_found" };
      return { status: "pending" };
    } catch {
      return { status: "not_found" };
    }
  });
