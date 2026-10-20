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

/** The question as the full health check asks it, naming the bird. Without a
 *  name (or before it loads) it reads "the bird". Same answer meaning as
 *  scanQuestion: Normal is always the healthy answer. scanQuestion stays for
 *  the read-back lists (sitter history, scan detail) that already use it. */
export function scanQuestionFor(t: TFunction, f: ScanField, birdName?: string | null): string {
  const name = birdName?.trim() || t("scanForm.theBird", "the bird");
  switch (f.key) {
    case "alertness": return t("scanForm.q2.alertness", "Is {{name}} alert and responsive?", { name });
    case "food": return t("scanForm.q2.food", "Is {{name}} eating normally?", { name });
    case "droppings": return t("scanForm.q2.droppings", "Do {{name}}'s droppings look normal?", { name });
    case "breathing": return t("scanForm.q2.breathing", "Is {{name}} breathing normally?", { name });
    case "posture": return t("scanForm.q2.posture", "Is {{name}} perched normally?", { name });
    case "noise": return t("scanForm.q2.noise", "Is {{name}} vocalizing as usual?", { name });
    case "fluffed": return t("scanForm.q2.fluffed", "Is {{name}}'s posture normal?", { name });
    case "vomiting": return t("scanForm.q2.vomiting", "Is {{name}}'s face clean and dry?", { name });
    case "injury": return t("scanForm.q2.injury", "Is {{name}} free of injury?", { name });
    case "exposure": return t("scanForm.q2.exposure", "Has {{name}} been kept away from hazards?", { name });
    default: return f.question;
  }
}

/** A short hint under the question, or null when the question needs none. */
export function scanHint(t: TFunction, f: ScanField): string | null {
  switch (f.key) {
    case "droppings": return t("scanForm.hint.droppings", "Color, shape, and amount");
    case "breathing": return t("scanForm.hint.breathing", "No tail bobbing, clicking, or open-mouth breathing");
    case "fluffed": return t("scanForm.hint.fluffed", "Not fluffed up for long stretches");
    case "vomiting": return t("scanForm.hint.vomiting", "No vomiting or discharge");
    case "injury": return t("scanForm.hint.injury", "No falls, bites, or scratches");
    case "exposure": return t("scanForm.hint.exposure", "Fumes, unsafe foods, metals, plants, and other pets");
    default: return null;
  }
}
