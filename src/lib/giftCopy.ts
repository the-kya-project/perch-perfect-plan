// Gift wording shared by /gift, /gift/thanks, /redeem and /admin/gifts.
import type { TFunction } from "i18next";
import { formatCents, GIFT_MONTHS, type GiftPlan } from "./gifts";

export function giftPlanName(t: TFunction, plan: GiftPlan): string {
  return plan === "flock_half_year"
    ? t("gift.planFlockHalfName", "The Flock, six months")
    : t("gift.planFlockName", "The Flock, one year");
}

/** When the gift starts and, if redeemed by the free season's end, when it ends. */
export function giftTiming(t: TFunction, plan: GiftPlan): string {
  return plan === "flock_half_year"
    ? t("gift.timingFlockHalf", "The Flock opens Monday, January 4, 2027, and it's free for everyone until July 6, 2027. Six months in the Flock start when the free season ends, or on the day the gift is redeemed if that's later. Redeemed by July 6, 2027, they run through January 6, 2028. Gifts never expire.")
    : t("gift.timingFlock", "The Flock opens Monday, January 4, 2027, and it's free for everyone until July 6, 2027. A year in the Flock starts when the free season ends, or on the day the gift is redeemed if that's later. Redeemed by July 6, 2027, it runs through July 6, 2028. Gifts never expire.");
}

/** What /redeem says once the code is saved. */
export function giftRedeemed(t: TFunction, plan: GiftPlan): string {
  return plan === "flock_half_year"
    ? t("redeem.doneFlockHalf", "Your gift is saved. The Flock opens Monday, January 4, 2027, and it's free for everyone until July 6, 2027. Your six months in the Flock start then and run through January 6, 2028. If you're redeeming after July 6, 2027, they start today.")
    : t("redeem.doneFlock", "Your gift is saved. The Flock opens Monday, January 4, 2027, and it's free for everyone until July 6, 2027. Your year in the Flock starts then and runs through July 6, 2028. If you're redeeming after July 6, 2027, it starts today.");
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
