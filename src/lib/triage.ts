// Triage rules for the daily health scan.
// IMPORTANT: This configuration is a placeholder and has NOT been reviewed by a
// licensed avian veterinarian. It MUST be reviewed and signed off before any
// real-world use. See PRD Phase 1.

export type ScanAnswer = "normal" | "not_sure" | "concerning";
export type TriageStatus = "green" | "yellow" | "red";

export type ScanFieldKey =
  | "alertness"
  | "food"
  | "droppings"
  | "breathing"
  | "posture"
  | "noise"
  | "fluffed"
  | "vomiting"
  | "injury"
  | "exposure";

export type ScanField = {
  key: ScanFieldKey;
  question: string;
  helpNormal: string;
  helpNotSure: string;
  helpConcerning: string;
  redOnConcerning: boolean; // single "concerning" answer escalates straight to red
};

export const SCAN_FIELDS: ScanField[] = [
  {
    key: "alertness",
    question: "Is the bird alert and responsive?",
    helpNormal: "Eyes open, tracking you, reacting to sounds.",
    helpNotSure: "Watch quietly for 30s. Does the bird turn its head, blink, or shift position?",
    helpConcerning: "Eyes closing, not responding to your voice, sitting still for long stretches.",
    redOnConcerning: false,
  },
  {
    key: "food",
    question: "Is the bird eating normally?",
    helpNormal: "Food bowl shows obvious activity; droppings present.",
    helpNotSure: "Offer a familiar treat. Did the bird take it?",
    helpConcerning: "No food touched and no droppings produced.",
    redOnConcerning: true,
  },
  {
    key: "droppings",
    question: "Do the droppings look normal?",
    helpNormal: "Three parts visible: formed dark feces, white urates, clear urine.",
    helpNotSure: "Color may shift with food. Take a photo against white paper and check the guide.",
    helpConcerning: "Bright red blood, black/tarry stool, yellow or lime urates.",
    redOnConcerning: true,
  },
  {
    key: "breathing",
    question: "Is the bird breathing normally?",
    helpNormal: "Quiet, even breaths. Tail still while at rest.",
    helpNotSure: "Watch the tail for 30s while perched. Look for slight bobbing.",
    helpConcerning: "Open-mouth breathing, wheeze, click, or tail bobbing at rest.",
    redOnConcerning: true,
  },
  {
    key: "posture",
    question: "Is the bird perched normally?",
    helpNormal: "Upright, gripping perch, weight balanced.",
    helpNotSure: "Watch for a minute. Is the bird leaning, sitting low, or shifting feet often?",
    helpConcerning: "Sitting on cage floor, unable to perch, weak grip, collapse.",
    redOnConcerning: true,
  },
  {
    key: "noise",
    question: "Is the bird vocalizing as usual?",
    helpNormal: "Talking, calling, or quiet times match the owner's baseline.",
    helpNotSure: "Compare to the owner's notes on normal noise level.",
    helpConcerning: "Unusually silent, or unusual repeated distress screaming.",
    redOnConcerning: false,
  },
  {
    key: "fluffed",
    question: "Is the bird fluffed for long stretches?",
    helpNormal: "Brief fluffing during preening or naps is normal.",
    helpNotSure: "Watch for 5+ minutes. Does the bird unfluff and move around?",
    helpConcerning: "Fluffed for long periods, eyes closed, low on perch.",
    redOnConcerning: false,
  },
  {
    key: "vomiting",
    question: "Is the face clean and dry, with no vomiting?",
    helpNormal: "Face and beak dry and clean.",
    helpNotSure: "Check face, chest, and cage walls for wet flecks.",
    helpConcerning: "Repeated head-flicking with wet matter, wet face/chest feathers.",
    redOnConcerning: true,
  },
  {
    key: "injury",
    question: "Is the bird free of any injury, fall, bite, or scratch?",
    helpNormal: "No new wounds, no bleeding, no limping.",
    helpNotSure: "Check whole body — feet, wings, chest. Compare to owner photos if available.",
    helpConcerning: "Any wound, blood, limp, missing feathers, or fall from height.",
    redOnConcerning: true,
  },
  {
    key: "exposure",
    question: "Has the bird been kept away from fumes, unsafe foods, metals, plants, and other pets?",
    helpNormal: "Nothing new in the air or the bird's reach.",
    helpNotSure: "Think back: any spray, candle, non-stick cooking, new plant, or pet contact today?",
    helpConcerning: "Known exposure to smoke, aerosols, toxic food, metal, or a cat/dog.",
    redOnConcerning: true,
  },
];

const NOT_SURE_YELLOW_KEYS: ScanFieldKey[] = ["alertness", "breathing", "posture"];

export type TriageResult = {
  status: TriageStatus;
  reasons: string[];
  message: string;
};

export function computeTriage(
  answers: Record<ScanFieldKey, ScanAnswer>,
): TriageResult {
  const reasons: string[] = [];
  let red = false;
  let yellowCount = 0;

  for (const field of SCAN_FIELDS) {
    const a = answers[field.key];
    if (a === "concerning") {
      reasons.push(`Concerning: ${field.question.replace(/\?$/, "")}`);
      if (field.redOnConcerning) {
        red = true;
      } else {
        yellowCount++;
      }
    } else if (a === "not_sure") {
      // Any "not sure" should never be silently logged as all-clear.
      reasons.push(`Not sure: ${field.question.replace(/\?$/, "")}`);
      yellowCount++;
    }
  }

  if (red) {
    return {
      status: "red",
      reasons,
      message:
        "This may be urgent. Call the owner and the avian vet now. Keep the bird warm, quiet, and minimize handling.",
    };
  }
  if (yellowCount >= 2) {
    return {
      status: "yellow",
      reasons,
      message:
        "Two or more concerning signs together — this combination is worth a call. Message the owner now and call the avian vet if it continues or worsens.",
    };
  }
  if (yellowCount === 1) {
    return {
      status: "yellow",
      reasons,
      message:
        "Something may be off. Message the owner, take photos if helpful, and keep monitoring. Call the avian vet if this continues or appears with other signs.",
    };
  }
  return {
    status: "green",
    reasons: [],
    message:
      "Nothing concerning logged. Keep following the care plan and watching for any changes.",
  };
}

export const TRIAGE_DISCLAIMER =
  "This app does not diagnose illness and is not a substitute for veterinary care. Birds can decline quickly. If something seems off, contact the owner and an avian veterinarian.";
