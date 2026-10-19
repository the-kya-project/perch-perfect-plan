import type { TFunction } from "i18next";

// Display-only labels for the food editors' option lists. The English constants
// (diet types, fresh-food ingredients, units, feed periods, cadences) are SAVED
// into diet_details / fresh_foods and feed routine task titles (feedingSync), so
// they stay English in data. This only changes what's shown on screen. Labels
// shared with the guided setup reuse its `birdSetup.opt.*` keys (same text).
export function foodLabel(t: TFunction, en: string): string {
  switch (en) {
    // Diet types
    case "Pelleted diet": return t("birdSetup.opt.pelletedDiet", "Pelleted diet");
    case "Seed mix": return t("birdSetup.opt.seedMix", "Seed mix");
    case "Pellet & seed blend": return t("birdSetup.opt.pelletSeedBlend", "Pellet & seed blend");
    case "Fresh chop / formulated": return t("birdSetup.opt.freshChopFormulated", "Fresh chop / formulated");
    case "Other": return t("birdSetup.opt.other", "Other");
    // Feed periods
    case "Morning": return t("birdSetup.opt.morning", "Morning");
    case "Midday": return t("birdSetup.opt.midday", "Midday");
    case "Evening": return t("birdSetup.opt.evening", "Evening");
    // Frequencies / cadences
    case "Daily": return t("birdSetup.opt.daily", "Daily");
    case "A few times a week": return t("birdSetup.opt.aFewTimesAWeek", "A few times a week");
    case "Training only": return t("birdSetup.opt.trainingOnly", "Training only");
    case "Rarely": return t("birdSetup.opt.rarely", "Rarely");
    case "Changed once daily": return t("birdSetup.opt.changedOnceDaily", "Changed once daily");
    case "Changed twice daily": return t("birdSetup.opt.changedTwiceDaily", "Changed twice daily");
    case "More than twice daily": return t("birdSetup.opt.moreThanTwiceDaily", "More than twice daily");
    case "1 hour": return t("birdSetup.opt.1Hour", "1 hour");
    case "2 hours": return t("birdSetup.opt.2Hours", "2 hours");
    case "3 hours": return t("birdSetup.opt.3Hours", "3 hours");
    case "After every fresh-food serving": return t("birdSetup.opt.afterEveryFreshFoodServing", "After every fresh-food serving");
    case "Once a day": return t("birdSetup.opt.onceADay", "Once a day");
    case "Every few days": return t("birdSetup.opt.everyFewDays", "Every few days");
    case "Twice a day": return t("birdSetup.opt.twiceADay", "Twice a day");
    // Fresh-food / homemade-chop ingredients
    case "Pre-made chop": return t("foodEditor.fresh.preMadeChop", "Pre-made chop");
    case "Leafy greens": return t("foodEditor.fresh.leafyGreens", "Leafy greens");
    case "Carrot": return t("foodEditor.fresh.carrot", "Carrot");
    case "Bell pepper": return t("foodEditor.fresh.bellPepper", "Bell pepper");
    case "Broccoli": return t("foodEditor.fresh.broccoli", "Broccoli");
    case "Sweet potato": return t("foodEditor.fresh.sweetPotato", "Sweet potato");
    case "Squash": return t("foodEditor.fresh.squash", "Squash");
    case "Apple (no seeds)": return t("foodEditor.fresh.appleNoSeeds", "Apple (no seeds)");
    case "Berries": return t("foodEditor.fresh.berries", "Berries");
    case "Banana": return t("foodEditor.fresh.banana", "Banana");
    case "Cooked grains": return t("foodEditor.fresh.cookedGrains", "Cooked grains");
    case "Cooked legumes": return t("foodEditor.fresh.cookedLegumes", "Cooked legumes");
    case "Sprouts": return t("foodEditor.fresh.sprouts", "Sprouts");
    case "Quinoa": return t("foodEditor.fresh.quinoa", "Quinoa");
    // Units
    case "scoops": return t("foodEditor.unit.scoops", "scoops");
    case "cups": return t("foodEditor.unit.cups", "cups");
    case "tbsp": return t("foodEditor.unit.tbsp", "tbsp");
    case "tsp": return t("foodEditor.unit.tsp", "tsp");
    case "grams": return t("foodEditor.unit.grams", "grams");
    case "oz": return t("foodEditor.unit.oz", "oz");
    case "pieces": return t("foodEditor.unit.pieces", "pieces");
    case "handful": return t("foodEditor.unit.handful", "handful");
    case "ml": return t("foodEditor.unit.ml", "ml");
    case "tablespoons": return t("foodEditor.unit.tablespoons", "tablespoons");
    default: return en;
  }
}
