// Gift wording shared by /gift, /gift/thanks, /redeem and /admin/gifts.
import type { TFunction } from "i18next";
import type { GiftPlan } from "./gifts";

export function giftPlanName(t: TFunction, plan: GiftPlan): string {
  void plan; // one plan today: a year in the Flock
  return t("gift.planFlockName", "The Flock, one year");
}

export function giftTiming(t: TFunction, plan: GiftPlan): string {
  void plan;
  return t("gift.timingFlock", "Gifts can be redeemed anytime. The year starts when the Flock opens in January, or on the day it's redeemed if that's later.");
}

export function planBlurb(t: TFunction, plan: GiftPlan): string {
  void plan;
  return t("gift.planFlockBlurb", "The Kya Project's community for parrot people: expert Q&As, local chapters, and 20% of every membership going to rescue and conservation.");
}
