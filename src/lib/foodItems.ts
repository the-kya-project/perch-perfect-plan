// Shared food-item model + completeness rules for the Food editor. One source of
// truth so the per-type item editor, the live status pills, and the wizard's
// validation gate all agree on what "complete" means.
//
// Stored (unchanged) in care_plans.diet_details (jsonb): { [dietType]: FoodItem[] }.

import { normalizeFeedTimes, type FeedTime } from "./feedTimes";

export type FoodItem = {
  name: string;            // brand or item name (required, incl. free-fed)
  amount: string;          // qty (required unless free-fed)
  unit: string;            // unit (required unless free-fed)
  times?: FeedTime[];      // when: morning/midday/evening (required unless free-fed)
  freeFed?: boolean;
  note?: string | null;    // optional
  // Homemade chop: the item is a single auto-named "Homemade chop" whose
  // ingredients live in the fresh-foods checklist — so no brand is required.
  homemade?: boolean;
};

export const HOMEMADE_CHOP_NAME = "Homemade chop";

// Units offered in the dropdown. Free strings in jsonb, so legacy values
// (e.g. "tablespoons") still display fine even though they're not listed.
export const FOOD_UNITS = ["scoops", "cups", "tbsp", "tsp", "grams", "oz", "pieces", "handful", "ml"] as const;

export function blankFoodItem(): FoodItem {
  return { name: "", amount: "", unit: "", times: [], freeFed: false, note: null };
}

/** A type's item that the owner has actually started filling in. Used to decide
 *  whether deselecting that food type needs a "discard?" confirmation. */
export function foodItemHasContent(it: FoodItem): boolean {
  return (
    !!(it.name ?? "").trim() ||
    !!(it.amount ?? "").trim() ||
    !!(it.unit ?? "").trim() ||
    !!it.freeFed ||
    normalizeFeedTimes(it.times).length > 0 ||
    !!(it.note ?? "").trim()
  );
}

/** complete = brand AND (freeFed OR (qty AND unit AND ≥1 when chip)).
 *  Homemade chop is exempt from the brand requirement (auto-named). */
export function isFoodItemComplete(it: FoodItem): boolean {
  if (!it.homemade && !(it.name ?? "").trim()) return false;
  if (it.freeFed) return true;
  return (
    !!(it.amount ?? "").trim() &&
    !!(it.unit ?? "").trim() &&
    normalizeFeedTimes(it.times).length >= 1
  );
}

export type FoodItemMissing = { brand: boolean; qty: boolean; unit: boolean; when: boolean };

/** Which required fields are still missing — drives the amber field highlights. */
export function foodItemMissing(it: FoodItem): FoodItemMissing {
  const brand = !it.homemade && !(it.name ?? "").trim();
  if (it.freeFed) return { brand, qty: false, unit: false, when: false };
  return {
    brand,
    qty: !(it.amount ?? "").trim(),
    unit: !(it.unit ?? "").trim(),
    when: normalizeFeedTimes(it.times).length === 0,
  };
}
