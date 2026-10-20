// Labels for the daily check's "something's different" items, shared by the
// check form and the flock check list / all-done summary.
import type { TFunction } from "i18next";
import type { ScanFieldKey } from "@/lib/triage";

export function dailyCheckItemLabel(t: TFunction, k: ScanFieldKey): string {
  switch (k) {
    case "alertness": return t("dailyCheck.item.alertness", "Alertness");
    case "food": return t("dailyCheck.item.food", "Eating");
    case "droppings": return t("dailyCheck.item.droppings", "Droppings");
    case "breathing": return t("dailyCheck.item.breathing", "Breathing");
    case "posture": return t("dailyCheck.item.posture", "Perching");
    case "noise": return t("dailyCheck.item.noise", "Vocalizing");
    case "fluffed": return t("dailyCheck.item.fluffed", "Fluffed up");
    case "vomiting": return t("dailyCheck.item.vomiting", "Face or vomiting");
    case "injury": return t("dailyCheck.item.injury", "Injury");
    case "exposure": return t("dailyCheck.item.exposure", "Fumes or toxins");
  }
}

/** What the owner tapped as different, from a check's triage_reason_codes:
 *  "Eating, Droppings". Empty when nothing was tapped. */
export function noticedItems(t: TFunction, codes: unknown): string {
  if (!Array.isArray(codes)) return "";
  const keys = [...new Set(codes.map((c: any) => c?.key).filter(Boolean))] as ScanFieldKey[];
  return keys.map((k) => dailyCheckItemLabel(t, k) ?? k).join(", ");
}
