// `gift_purchased` is sent from the Stripe webhook rather than the browser, so
// it counts only payments Stripe has confirmed, exactly once per purchase
// (the webhook calls this only when it creates the row). Same shape as the
// cron telemetry: production builds only (previews send nothing), awaited with
// a short timeout, and a PostHog failure never affects the webhook.
import { POSTHOG_PROJECT_KEY } from "./deployEnv";

const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/capture/";
const CAPTURE_TIMEOUT_MS = 2000;

export async function captureGiftPurchased(p: {
  checkoutSessionId: string;
  plan: string;
  promoCode: string | null;
  amountCents: number;
  givingRate: number;
}): Promise<void> {
  if (!POSTHOG_PROJECT_KEY || process.env.VERCEL_ENV !== "production") return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);
  try {
    await fetch(POSTHOG_CAPTURE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_KEY,
        event: "gift_purchased",
        // Buyers are anonymous here; the Checkout session keeps each purchase
        // distinct without sending an email address to PostHog.
        distinct_id: `gift:${p.checkoutSessionId}`,
        properties: {
          plan: p.plan,
          promo_code: p.promoCode ?? "none",
          amount: p.amountCents / 100,
          amount_cents: p.amountCents,
          giving_rate: p.givingRate,
          $process_person_profile: false,
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    console.error("[gift-telemetry] capture failed:", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}
