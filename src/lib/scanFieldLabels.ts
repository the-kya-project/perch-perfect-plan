// Display text for the health-check questions in src/lib/triage.ts. The
// SCAN_FIELDS constants stay English (triage reasons, stored notes and the
// scan-alert email are built from them); these render them per language. Pass
// the t of whichever instance is rendering (global for owners, sitter instance
// on the sitter screens). Keys are literal so the extractor can see them.
import type { TFunction } from "i18next";
import type { ScanField } from "./triage";

export function scanQuestion(t: TFunction, f: ScanField): string {
  switch (f.key) {
    case "alertness": return t("scanForm.q.alertness", "Is the bird alert and responsive?");
    case "food": return t("scanForm.q.food", "Is the bird eating normally?");
    case "droppings": return t("scanForm.q.droppings", "Do the droppings look normal?");
    case "breathing": return t("scanForm.q.breathing", "Is the bird breathing normally?");
    case "posture": return t("scanForm.q.posture", "Is the bird perched normally?");
    case "noise": return t("scanForm.q.noise", "Is the bird vocalizing as usual?");
    case "fluffed": return t("scanForm.q.fluffed", "Is the bird fluffed for long stretches?");
    case "vomiting": return t("scanForm.q.vomiting", "Is the face clean and dry, with no vomiting?");
    case "injury": return t("scanForm.q.injury", "Is the bird free of any injury, fall, bite, or scratch?");
    case "exposure": return t("scanForm.q.exposure", "Has the bird been kept away from fumes, unsafe foods, metals, plants, and other pets?");
    default: return f.question;
  }
}

export function scanHelpNotSure(t: TFunction, f: ScanField): string {
  switch (f.key) {
    case "alertness": return t("scanForm.notSure.alertness", "Watch quietly for 30s. Does the bird turn its head, blink, or shift position?");
    case "food": return t("scanForm.notSure.food", "Offer a familiar treat. Did the bird take it?");
    case "droppings": return t("scanForm.notSure.droppings", "Color may shift with food. Compare against the owner's notes and the care guide.");
    case "breathing": return t("scanForm.notSure.breathing", "Watch the tail for 30s while perched. Look for slight bobbing.");
    case "posture": return t("scanForm.notSure.posture", "Watch for a minute. Is the bird leaning, sitting low, or shifting feet often?");
    case "noise": return t("scanForm.notSure.noise", "Compare to the owner's notes on normal noise level.");
    case "fluffed": return t("scanForm.notSure.fluffed", "Watch for 5+ minutes. Does the bird unfluff and move around?");
    case "vomiting": return t("scanForm.notSure.vomiting", "Check face, chest, and cage walls for wet flecks.");
    case "injury": return t("scanForm.notSure.injury", "Check whole body — feet, wings, chest. Compare to owner photos if available.");
    case "exposure": return t("scanForm.notSure.exposure", "Think back: any spray, candle, non-stick cooking, new plant, or pet contact today?");
    default: return f.helpNotSure;
  }
}

export function scanHelpConcerning(t: TFunction, f: ScanField): string {
  switch (f.key) {
    case "alertness": return t("scanForm.concerning.alertness", "Eyes closing, not responding to your voice, sitting still for long stretches.");
    case "food": return t("scanForm.concerning.food", "No food touched and no droppings produced.");
    case "droppings": return t("scanForm.concerning.droppings", "Bright red blood, black/tarry stool, yellow or lime urates.");
    case "breathing": return t("scanForm.concerning.breathing", "Open-mouth breathing, wheeze, click, or tail bobbing at rest.");
    case "posture": return t("scanForm.concerning.posture", "Sitting on cage floor, unable to perch, weak grip, collapse.");
    case "noise": return t("scanForm.concerning.noise", "Unusually silent, or unusual repeated distress screaming.");
    case "fluffed": return t("scanForm.concerning.fluffed", "Fluffed for long periods, eyes closed, low on perch.");
    case "vomiting": return t("scanForm.concerning.vomiting", "Repeated head-flicking with wet matter, wet face/chest feathers.");
    case "injury": return t("scanForm.concerning.injury", "Any wound, blood, limp, missing feathers, or fall from height.");
    case "exposure": return t("scanForm.concerning.exposure", "Known exposure to smoke, aerosols, toxic food, metal, or a cat/dog.");
    default: return f.helpConcerning;
  }
}
