/**
 * Server-only Stripe client. Imported dynamically inside server handlers, so
 * the secret key never reaches a browser bundle.
 *
 * Environment (Vercel; Preview holds test-mode values, Production gets live
 * ones later):
 *   STRIPE_SECRET_KEY                    sk_test_… / sk_live_…
 *   STRIPE_PRICE_FLOCK_YEAR_GIFT         one-off price for a year of the Flock
 *   STRIPE_PRICE_APP_PREMIUM_YEAR_GIFT   one-off price for a year of app premium
 *   STRIPE_WEBHOOK_SECRET                whsec_… for /api/public/stripe/webhook
 *
 * A preview must never charge real cards: like the Supabase guard in
 * supabaseEnv.ts, a live key in a preview build is refused outright.
 */
import Stripe from "stripe";
import type { GiftPlan } from "./gifts";

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
  flock_year: "STRIPE_PRICE_FLOCK_YEAR_GIFT",
  app_premium_year: "STRIPE_PRICE_APP_PREMIUM_YEAR_GIFT",
};

export function giftPriceId(plan: GiftPlan): string {
  const id = process.env[PRICE_ENV[plan]];
  if (!id) throw new StripeNotConfigured(`${PRICE_ENV[plan]} not set`);
  return id;
}
