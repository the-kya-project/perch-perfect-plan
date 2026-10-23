// Gift wording shared by /gift, /gift/thanks, /redeem and /admin/gifts.
import type { TFunction } from "i18next";
import type { GiftPlan } from "./gifts";

export function giftPlanName(t: TFunction, plan: GiftPlan): string {
  return plan === "flock_year" ? t("gift.planFlockName", "The Flock, one year") : t("gift.planPremiumName", "App premium, one year");
}

export function giftTiming(t: TFunction, plan: GiftPlan): string {
  return plan === "flock_year"
    ? t("gift.timingFlock", "Gifts can be redeemed anytime. The year starts when the Flock opens in January, or on the day it's redeemed if that's later.")
    : t("gift.timingPremium", "Gifts can be redeemed anytime. The year starts when app premium launches in January, or on the day it's redeemed if that's later.");
}

export function planBlurb(t: TFunction, plan: GiftPlan): string {
  return plan === "flock_year"
    ? t("gift.planFlockBlurb", "The Kya Project's community for parrot people: expert Q&As, local chapters, and a share of every membership going to rescue and conservation.")
    : t("gift.planPremiumBlurb", "The paid tier of Kya & Co., the app that helps keep a bird healthy every day.");
}
