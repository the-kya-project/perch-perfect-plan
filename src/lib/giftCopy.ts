// Gift wording shared by /gift, /gift/thanks, /redeem and /admin/gifts.
import type { TFunction } from "i18next";
import { formatCents, type GiftPlan } from "./gifts";

export function giftPlanName(t: TFunction, plan: GiftPlan): string {
  void plan; // one plan today: a year in the Flock
  return t("gift.planFlockName", "The Flock, one year");
}

export function giftTiming(t: TFunction, plan: GiftPlan): string {
  void plan;
  return t("gift.timingFlock", "The Flock opens Monday, January 4, 2027, and it's free for everyone until July 6, 2027. A gift year starts when the free season ends, or on the day it's redeemed if that's later. Gifts never expire.");
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

/** A year's price led by its monthly equivalent, the way the rest of the
 *  site shows the annual rate: "$25 a month" + "$300 for the year, paid once". */
export function giftPriceParts(t: TFunction, amountCents: number, currency = "usd"): { monthly: string; year: string } {
  return {
    monthly: t("gift.priceMonthly", "{{monthly}} a month", { monthly: formatCents(Math.round(amountCents / 12), currency) }),
    year: t("gift.priceYear", "{{price}} for the year, paid once", { price: formatCents(amountCents, currency) }),
  };
}
