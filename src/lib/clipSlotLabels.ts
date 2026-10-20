// Display labels for the owner's "Tips from the owner" clip slots. The server
// (sitter.functions / household.functions) returns each clip with its slot
// `key` and an English `label`; screens render the label through this so it
// follows the reader's language (pass the component's own `t` — the sitter
// subtree has its own instance). Unknown keys fall back to the given label.

import type { TFunction } from "i18next";

export function clipSlotLabel(key: string, fallback: string, t: TFunction): string {
  switch (key) {
    case "step_up": return t("clipSlot.stepUp", "How they step up");
    case "food_water": return t("clipSlot.foodWater", "How to refill food & water safely");
    case "locations": return t("clipSlot.locations", "Where everything is");
    case "bedtime": return t("clipSlot.bedtime", "Settling them for the night");
    case "food_prep": return t("clipSlot.foodPrep", "Food prep");
    case "toys_foraging": return t("clipSlot.toysForaging", "Toys & foraging");
    case "targeting": return t("clipSlot.targeting", "Targeting & interaction");
    case "anything_else": return t("clipSlot.anythingElse", "Anything else?");
  }
  return fallback;
}
