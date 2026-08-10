// Locale-aware rendering of auto-derived routine tasks from their structured
// descriptor (routine_tasks.derived). Used by BOTH the sitter checklist and the
// owner Routine view. If a task has no descriptor (manual/custom tasks, or a row
// the backfill skipped), callers render the stored title/instructions verbatim.
//
// ENGLISH IS BYTE-IDENTICAL to the strings the sync functions compose and store
// (proven by a harness). Owner-supplied text — food/med names and per-item notes
// — is carried through verbatim and NEVER translated. Amounts route through the
// existing formatAmountUnit for English (so number/unit output is provably
// unchanged); Dutch uses i18next plural forms for the unit word.

import type { TFunction } from "i18next";
import type { DerivedTask } from "./derivedTasks";
import { formatAmountUnit } from "./labels";

export type RenderedTask = { title: string; instructions: string | null };

// Unit words that formatAmountUnit singularizes. Only these localize; any other
// unit is carried verbatim (matching formatAmountUnit's passthrough).
const PLURAL_UNITS = new Set(["tablespoons", "cups", "grams", "scoops", "pieces", "teaspoons"]);
const UNIT_SINGULAR: Record<string, string> = {
  tablespoons: "tablespoon", cups: "cup", grams: "gram", scoops: "scoop", pieces: "piece", teaspoons: "teaspoon",
};

/** Dutch amount+unit. Mirrors formatAmountUnit's shape (count → singular/plural),
 *  but pluralizes the unit word through i18next so Dutch reads naturally. */
function amountNl(amount: string | null, unit: string | null, t: TFunction): string {
  const a = (amount ?? "").trim();
  const u = (unit ?? "").trim();
  if (!a && !u) return "";
  if (!u) return a;
  const n = Number(a.replace(/^([0-9.]+).*$/, "$1"));
  const count = a === "1" || n === 1 ? 1 : 2;
  const lower = u.toLowerCase();
  // i18next selects <key>_one / <key>_other from `count`. Static keys per unit so
  // the parser can extract them; unknown units fall back to the stored word.
  let word = u;
  switch (lower) {
    case "tablespoons": word = t("routine.unit.tablespoon", { count, defaultValue: "eetlepel" }); break;
    case "cups": word = t("routine.unit.cup", { count, defaultValue: "kopje" }); break;
    case "grams": word = t("routine.unit.gram", { count, defaultValue: "gram" }); break;
    case "scoops": word = t("routine.unit.scoop", { count, defaultValue: "schep" }); break;
    case "pieces": word = t("routine.unit.piece", { count, defaultValue: "stuk" }); break;
    case "teaspoons": word = t("routine.unit.teaspoon", { count, defaultValue: "theelepel" }); break;
    default:
      // Not a known plural unit — formatAmountUnit would show it verbatim too.
      word = u;
  }
  void PLURAL_UNITS; void UNIT_SINGULAR;
  return `${a} ${word}`.trim();
}

function medTimeWord(key: string | null, t: TFunction): string {
  switch (key) {
    case "morning": return t("routine.medTime.morning", "morning");
    case "midday": return t("routine.medTime.midday", "midday");
    case "evening": return t("routine.medTime.evening", "evening");
    case "bedtime": return t("routine.medTime.bedtime", "bedtime");
    default: return key ?? "";
  }
}

function bowlWashLabel(key: string, t: TFunction): string {
  switch (key) {
    case "after_each_fresh": return t("routine.bowlWash.after_each_fresh", "After every fresh-food serving");
    case "once_daily": return t("routine.bowlWash.once_daily", "Once a day");
    case "twice_daily": return t("routine.bowlWash.twice_daily", "Twice a day");
    case "every_few_days": return t("routine.bowlWash.every_few_days", "Every few days");
    default: return key;
  }
}

function removalLabel(minutes: number, t: TFunction): string {
  switch (minutes) {
    case 60: return t("routine.removal.60", "1 hour");
    case 120: return t("routine.removal.120", "2 hours");
    case 180: return t("routine.removal.180", "3 hours");
    default: return t("routine.removal.fallback", "{{n}} min", { n: minutes });
  }
}

function waterChangeLabel(freq: string, t: TFunction): string {
  switch (freq) {
    case "once": return t("routine.waterChange.once", "once daily");
    case "twice": return t("routine.waterChange.twice", "twice daily");
    case "more": return t("routine.waterChange.more", "more than twice daily");
    default: return "";
  }
}

const joinInstr = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" ") || null;

/** Render a derived task in the reader's locale. `locale` is used only to keep
 *  English amount formatting byte-identical (via formatAmountUnit). */
export function renderDerivedTask(d: DerivedTask, t: TFunction, locale: string): RenderedTask {
  switch (d.kind) {
    case "feed": {
      const name = d.ownerText;
      const title = d.params.allDay
        ? t("routine.feed.titleAllDay", "Feed: {{name}} (available all day)", { name })
        : t("routine.feed.title", "Feed: {{name}}", { name });
      const amt = locale === "en"
        ? formatAmountUnit(d.params.amount, d.params.unit)
        : amountNl(d.params.amount, d.params.unit, t);
      const serve = amt ? t("routine.feed.serve", "Serve {{amt}}.", { amt }) : "";
      const freeFed = d.params.allDay ? t("routine.feed.freeFed", "Keep topped up — this is free-fed in the cage.") : "";
      return { title, instructions: joinInstr([serve, freeFed, d.params.note]) };
    }
    case "med": {
      const name = d.ownerText;
      const title = d.params.timeKey
        ? t("routine.med.title", "Medication: {{name}} — {{time}}", { name, time: medTimeWord(d.params.timeKey, t) })
        : t("routine.med.titleNoTime", "Medication: {{name}}", { name });
      // Instructions are the owner's med note (verbatim) or none.
      return { title, instructions: d.params.note || null };
    }
    case "wash_food":
      return {
        title: t("routine.washFood.title", "Wash food bowls ({{label}})", { label: bowlWashLabel(d.labelKeys.wash, t).toLowerCase() }),
        instructions: t("routine.washFood.instr", "Use hot water and a bottle brush. Rinse thoroughly before refilling."),
      };
    case "wash_water":
      return {
        title: t("routine.washWater.title", "Wash water bowl ({{label}})", { label: bowlWashLabel(d.labelKeys.wash, t).toLowerCase() }),
        instructions: t("routine.washWater.instr", "Wash the bowl/bottle itself — separate from how often water is changed."),
      };
    case "remove_fresh":
      return {
        title: t("routine.removeFresh.title", "Remove fresh food (within {{label}} of serving)", { label: removalLabel(d.params.removalMinutes, t) }),
        instructions: t("routine.removeFresh.instr", "Fresh / wet food spoils fast. Take it out within this window to prevent bacteria."),
      };
    case "change_water":
      return {
        title: t("routine.changeWater.title", "Change water ({{label}})", { label: waterChangeLabel(d.labelKeys.freq, t) }),
        instructions: t("routine.changeWater.instr", "Give fresh drinking water."),
      };
  }
}
