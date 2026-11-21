// Gift wording shared by /gift, /gift/thanks, /redeem and /admin/gifts.
import type { TFunction } from "i18next";
import { formatCents, GIFT_MONTHS, type GiftPlan } from "./gifts";

export function giftPlanName(t: TFunction, plan: GiftPlan): string {
  return plan === "flock_half_year"
    ? t("gift.planFlockHalfName", "The Flock, six months")
    : t("gift.planFlockName", "The Flock, one year");
}

/** The start rule, in words (no fixed dates: they depend on redemption). */
export function giftTiming(t: TFunction, plan: GiftPlan): string {
  return plan === "flock_half_year"
    ? t("gift.timingFlockHalf", "Six months in the Flock start the day the gift is redeemed and run for six months. While the Flock is still free for everyone, a gift redeemed then starts when the free season ends, so none of it goes unused. Gifts never expire.")
    : t("gift.timingFlock", "A year in the Flock starts the day the gift is redeemed and runs for a year. While the Flock is still free for everyone, a gift redeemed then starts when the free season ends, so none of it goes unused. Gifts never expire.");
}

/** What /redeem says once the code is saved. */
export function giftRedeemed(t: TFunction, plan: GiftPlan): string {
  return plan === "flock_half_year"
    ? t("redeem.doneFlockHalf", "Your gift is saved. Six months in the Flock start the day they're redeemed and run for six months. While the Flock is still free for everyone, a gift redeemed then starts when the free season ends, so none of it goes unused.")
    : t("redeem.doneFlock", "Your gift is saved. A year in the Flock starts the day it's redeemed and runs for a year. While the Flock is still free for everyone, a gift redeemed then starts when the free season ends, so none of it goes unused.");
}

export function planBlurb(t: TFunction, plan: GiftPlan): string {
  void plan;
  return t("gift.planFlockBlurb", "The Kya Project's community for parrot people: expert Q&As, local chapters, and every training journey.");
}

export function giftRefundNote(t: TFunction): string {
  return t("gift.refundNote", "If the gift hasn't been redeemed yet, you can get a full refund within 30 days of buying it.");
}

export function giftGivingNote(t: TFunction): string {
  return t("gift.givingNote", "20% of every gift goes to rescue and conservation partners, and 40% on double-giving days.");
}

/** The gift's price and, under it, what that comes to a month:
 *  "$300" + "That's $25 a month, paid once." */
export function giftPriceParts(t: TFunction, plan: GiftPlan, amountCents: number, currency = "usd"): { price: string; perMonth: string } {
  return {
    price: formatCents(amountCents, currency),
    perMonth: t("gift.pricePerMonth", "That's {{monthly}} a month, paid once.", { monthly: formatCents(Math.round(amountCents / GIFT_MONTHS[plan]), currency) }),
  };
}
