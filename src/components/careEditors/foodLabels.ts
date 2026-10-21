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

/** Display label for a homemade-chop ingredient (saved in English). Falls back
 *  to foodLabel for the original checklist, then to the saved text itself. */
export function chopIngredientLabel(t: TFunction, en: string): string {
  switch (en) {
    case "Kale": return t("foodEditor.fresh.kale", "Kale");
    case "Swiss chard": return t("foodEditor.fresh.swissChard", "Swiss chard");
    case "Romaine lettuce": return t("foodEditor.fresh.romaineLettuce", "Romaine lettuce");
    case "Collard greens": return t("foodEditor.fresh.collardGreens", "Collard greens");
    case "Mustard greens": return t("foodEditor.fresh.mustardGreens", "Mustard greens");
    case "Dandelion greens": return t("foodEditor.fresh.dandelionGreens", "Dandelion greens");
    case "Bok choy": return t("foodEditor.fresh.bokChoy", "Bok choy");
    case "Arugula": return t("foodEditor.fresh.arugula", "Arugula");
    case "Beet greens": return t("foodEditor.fresh.beetGreens", "Beet greens");
    case "Carrot tops": return t("foodEditor.fresh.carrotTops", "Carrot tops");
    case "Cilantro": return t("foodEditor.fresh.cilantro", "Cilantro");
    case "Parsley": return t("foodEditor.fresh.parsley", "Parsley");
    case "Basil": return t("foodEditor.fresh.basil", "Basil");
    case "Mint": return t("foodEditor.fresh.mint", "Mint");
    case "Dill": return t("foodEditor.fresh.dill", "Dill");
    case "Zucchini": return t("foodEditor.fresh.zucchini", "Zucchini");
    case "Cucumber": return t("foodEditor.fresh.cucumber", "Cucumber");
    case "Butternut squash": return t("foodEditor.fresh.butternutSquash", "Butternut squash");
    case "Pumpkin": return t("foodEditor.fresh.pumpkin", "Pumpkin");
    case "Green beans": return t("foodEditor.fresh.greenBeans", "Green beans");
    case "Peas": return t("foodEditor.fresh.peas", "Peas");
    case "Snap peas": return t("foodEditor.fresh.snapPeas", "Snap peas");
    case "Corn": return t("foodEditor.fresh.corn", "Corn");
    case "Cauliflower": return t("foodEditor.fresh.cauliflower", "Cauliflower");
    case "Brussels sprouts": return t("foodEditor.fresh.brusselsSprouts", "Brussels sprouts");
    case "Cabbage": return t("foodEditor.fresh.cabbage", "Cabbage");
    case "Beet": return t("foodEditor.fresh.beet", "Beet");
    case "Radish": return t("foodEditor.fresh.radish", "Radish");
    case "Okra": return t("foodEditor.fresh.okra", "Okra");
    case "Asparagus": return t("foodEditor.fresh.asparagus", "Asparagus");
    case "Celery": return t("foodEditor.fresh.celery", "Celery");
    case "Turnip": return t("foodEditor.fresh.turnip", "Turnip");
    case "Parsnip": return t("foodEditor.fresh.parsnip", "Parsnip");
    case "Fennel": return t("foodEditor.fresh.fennel", "Fennel");
    case "Chili pepper": return t("foodEditor.fresh.chiliPepper", "Chili pepper");
    case "Jalapeño": return t("foodEditor.fresh.jalapeno", "Jalapeño");
    case "Pear (no seeds)": return t("foodEditor.fresh.pearNoSeeds", "Pear (no seeds)");
    case "Blueberries": return t("foodEditor.fresh.blueberries", "Blueberries");
    case "Strawberries": return t("foodEditor.fresh.strawberries", "Strawberries");
    case "Raspberries": return t("foodEditor.fresh.raspberries", "Raspberries");
    case "Blackberries": return t("foodEditor.fresh.blackberries", "Blackberries");
    case "Cranberries": return t("foodEditor.fresh.cranberries", "Cranberries");
    case "Mango": return t("foodEditor.fresh.mango", "Mango");
    case "Papaya": return t("foodEditor.fresh.papaya", "Papaya");
    case "Pineapple": return t("foodEditor.fresh.pineapple", "Pineapple");
    case "Kiwi": return t("foodEditor.fresh.kiwi", "Kiwi");
    case "Melon": return t("foodEditor.fresh.melon", "Melon");
    case "Watermelon": return t("foodEditor.fresh.watermelon", "Watermelon");
    case "Cantaloupe": return t("foodEditor.fresh.cantaloupe", "Cantaloupe");
    case "Grapes": return t("foodEditor.fresh.grapes", "Grapes");
    case "Orange": return t("foodEditor.fresh.orange", "Orange");
    case "Pomegranate": return t("foodEditor.fresh.pomegranate", "Pomegranate");
    case "Peach (no pit)": return t("foodEditor.fresh.peachNoPit", "Peach (no pit)");
    case "Plum (no pit)": return t("foodEditor.fresh.plumNoPit", "Plum (no pit)");
    case "Apricot (no pit)": return t("foodEditor.fresh.apricotNoPit", "Apricot (no pit)");
    case "Cherries (no pits)": return t("foodEditor.fresh.cherriesNoPits", "Cherries (no pits)");
    case "Nectarine (no pit)": return t("foodEditor.fresh.nectarineNoPit", "Nectarine (no pit)");
    case "Fig": return t("foodEditor.fresh.fig", "Fig");
    case "Coconut": return t("foodEditor.fresh.coconut", "Coconut");
    case "Brown rice (cooked)": return t("foodEditor.fresh.brownRiceCooked", "Brown rice (cooked)");
    case "Oats": return t("foodEditor.fresh.oats", "Oats");
    case "Barley (cooked)": return t("foodEditor.fresh.barleyCooked", "Barley (cooked)");
    case "Millet": return t("foodEditor.fresh.millet", "Millet");
    case "Buckwheat": return t("foodEditor.fresh.buckwheat", "Buckwheat");
    case "Amaranth": return t("foodEditor.fresh.amaranth", "Amaranth");
    case "Whole-wheat pasta (cooked)": return t("foodEditor.fresh.wholeWheatPastaCooked", "Whole-wheat pasta (cooked)");
    case "Lentils (cooked)": return t("foodEditor.fresh.lentilsCooked", "Lentils (cooked)");
    case "Chickpeas (cooked)": return t("foodEditor.fresh.chickpeasCooked", "Chickpeas (cooked)");
    case "Black beans (cooked)": return t("foodEditor.fresh.blackBeansCooked", "Black beans (cooked)");
    case "Egg (cooked)": return t("foodEditor.fresh.eggCooked", "Egg (cooked)");
    case "Chia seeds": return t("foodEditor.fresh.chiaSeeds", "Chia seeds");
    case "Flaxseed": return t("foodEditor.fresh.flaxseed", "Flaxseed");
    case "Hemp seeds": return t("foodEditor.fresh.hempSeeds", "Hemp seeds");
    case "Pumpkin seeds": return t("foodEditor.fresh.pumpkinSeeds", "Pumpkin seeds");
    case "Ginger": return t("foodEditor.fresh.ginger", "Ginger");
    case "Turmeric": return t("foodEditor.fresh.turmeric", "Turmeric");
    default: return foodLabel(t, en);
  }
}

/** The label for a stored diet type key (care_plans.diet_types and the keys
 *  of diet_details are "pelleted", "seed", "pellet_seed", "chop", "other"; see
 *  DIET_OPTIONS in FoodEditor). Unknown keys fall back to a readable form. */
const DIET_TYPE_LABELS: Record<string, string> = {
  pelleted: "Pelleted diet",
  seed: "Seed mix",
  pellet_seed: "Pellet & seed blend",
  chop: "Fresh chop / formulated",
  other: "Other",
};
export function dietTypeLabel(t: TFunction, key: string): string {
  const en = DIET_TYPE_LABELS[key];
  if (en) return foodLabel(t, en);
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
