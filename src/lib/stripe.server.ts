/**
 * Server-only Stripe client. Imported dynamically inside server handlers, so
 * the secret key never reaches a browser bundle.
 *
 * Environment (Vercel; Preview holds test-mode values, Production gets live
 * ones later):
 *   STRIPE_SECRET_KEY                    sk_test_… / sk_live_…
 *   STRIPE_PRICE_FLOCK_HALF_YEAR_GIFT    one-off price for six months of the Flock
 *   STRIPE_PRICE_FLOCK_YEAR_GIFT         one-off price for a year of the Flock
 *   STRIPE_WEBHOOK_SECRET                whsec_… for /api/public/stripe/webhook
 *
 * A preview must never charge real cards: like the Supabase guard in
 * supabaseEnv.ts, a live key in a preview build is refused outright.
 */
import Stripe from "stripe";
import type { GiftPlan } from "./gifts";
import type { BillingPrices, PaidPlan } from "./billing";

let client: Stripe | null = null;

export class StripeNotConfigured extends Error {
  constructor(what: string) {
    super(`Stripe is not configured: ${what}`);
    this.name = "StripeNotConfigured";
  }
}

export function getStripe(): Stripe {
  if (client) return client;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfigured("STRIPE_SECRET_KEY not set");
  if (process.env.VERCEL_ENV === "preview" && !key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("Refusing a live Stripe key in a preview deployment");
  }
  client = new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "Kya & Co." } });
  return client;
}

const PRICE_ENV: Record<GiftPlan, string> = {
  flock_half_year: "STRIPE_PRICE_FLOCK_HALF_YEAR_GIFT",
  flock_year: "STRIPE_PRICE_FLOCK_YEAR_GIFT",
};

export function giftPriceId(plan: GiftPlan): string {
  const id = process.env[PRICE_ENV[plan]];
  if (!id) throw new StripeNotConfigured(`${PRICE_ENV[plan]} not set`);
  return id;
}

// ── Flock billing (backlog 1.14), switched off ──────────────────────────────
// Environment (Vercel, server only):
//   BILLING_ENABLED                 "true" turns it on; anything else is off
//   STRIPE_BILLING_WEBHOOK_SECRET   whsec_… for /api/public/stripe/billing
//   STRIPE_PRICE_FLOCK_FOUNDING     Founding $15/month (never edited: that's the lock)
//   STRIPE_PRICE_FLOCK_MONTHLY      Regular $30/month
//   STRIPE_PRICE_FLOCK_YEARLY       Regular $300/year
//   STRIPE_PRICE_CREW_MONTHLY       Kya's Crew $45/month (backlog 1.15)
//   STRIPE_PRICE_CREW_YEARLY        Kya's Crew $444/year

/** Billing is test mode only until Brittany approves going live: any key
 *  that isn't a test key is refused here, in every deployment. Going live is
 *  a deliberate code change, not a setting. */
export function getBillingStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new StripeNotConfigured("billing runs in Stripe test mode only");
  }
  return getStripe();
}

export function billingPrices(): BillingPrices {
  const prices: BillingPrices = {};
  if (process.env.STRIPE_PRICE_FLOCK_FOUNDING) prices.founding = process.env.STRIPE_PRICE_FLOCK_FOUNDING;
  if (process.env.STRIPE_PRICE_FLOCK_MONTHLY) prices.monthly = process.env.STRIPE_PRICE_FLOCK_MONTHLY;
  if (process.env.STRIPE_PRICE_FLOCK_YEARLY) prices.annual = process.env.STRIPE_PRICE_FLOCK_YEARLY;
  if (process.env.STRIPE_PRICE_CREW_MONTHLY) prices.crew_monthly = process.env.STRIPE_PRICE_CREW_MONTHLY;
  if (process.env.STRIPE_PRICE_CREW_YEARLY) prices.crew_annual = process.env.STRIPE_PRICE_CREW_YEARLY;
  return prices;
}

export function billingPriceId(plan: PaidPlan): string {
  const id = billingPrices()[plan];
  if (!id) throw new StripeNotConfigured(`price for ${plan} not set`);
  return id;
}
