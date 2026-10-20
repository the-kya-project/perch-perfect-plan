// Homemade chop ingredients: a short row of common picks, a larger searchable
// list of bird-safe foods, and the foods search should warn about instead of
// adding. Ingredient names are saved in English to care_plans.fresh_foods (the
// same as the original checklist); screens show them through
// chopIngredientLabel. Anything typed that isn't on the list goes to
// fresh_foods_other.
//
// The safe list is deliberately conservative: common, widely accepted foods,
// with "no pit / no seeds / cooked" written into the name wherever it matters.
// Review with an avian vet before adding to it.

/** Tappable picks shown before any search. */
export const CHOP_COMMON = [
  "Leafy greens", "Carrot", "Bell pepper", "Broccoli",
  "Sweet potato", "Squash", "Apple (no seeds)", "Berries",
] as const;

/** Everything search can find. Includes every option the old checklist had. */
export const CHOP_INGREDIENTS: string[] = [
  // From the original checklist ("Pre-made chop" left the list once pre-made
  // became its own part; birds that saved it keep it as a chip)
  "Leafy greens", "Carrot", "Bell pepper", "Broccoli", "Sweet potato",
  "Squash", "Apple (no seeds)", "Berries", "Banana", "Cooked grains",
  "Cooked legumes", "Sprouts", "Quinoa",
  // Greens and herbs
  "Kale", "Swiss chard", "Romaine lettuce", "Collard greens", "Mustard greens",
  "Dandelion greens", "Bok choy", "Arugula", "Beet greens", "Carrot tops",
  "Cilantro", "Parsley", "Basil", "Mint", "Dill",
  // Vegetables
  "Zucchini", "Cucumber", "Butternut squash", "Pumpkin", "Green beans", "Peas",
  "Snap peas", "Corn", "Cauliflower", "Brussels sprouts", "Cabbage", "Beet",
  "Radish", "Okra", "Asparagus", "Celery", "Turnip", "Parsnip", "Fennel",
  "Chili pepper", "Jalapeño",
  // Fruit
  "Pear (no seeds)", "Blueberries", "Strawberries", "Raspberries", "Blackberries",
  "Cranberries", "Mango", "Papaya", "Pineapple", "Kiwi", "Melon", "Watermelon",
  "Cantaloupe", "Grapes", "Orange", "Pomegranate", "Peach (no pit)",
  "Plum (no pit)", "Apricot (no pit)", "Cherries (no pits)", "Nectarine (no pit)",
  "Fig", "Coconut",
  // Grains, legumes, seeds and other
  "Brown rice (cooked)", "Oats", "Barley (cooked)", "Millet", "Buckwheat",
  "Amaranth", "Whole-wheat pasta (cooked)", "Lentils (cooked)",
  "Chickpeas (cooked)", "Black beans (cooked)", "Egg (cooked)", "Chia seeds",
  "Flaxseed", "Hemp seeds", "Pumpkin seeds", "Ginger", "Turmeric",
];

// Foods search warns about instead of adding (English and Dutch, lowercase).
// The bird's own never-feed list is checked too.
const UNSAFE_TERMS = [
  "avocado", "chocolate", "cocoa", "cacao", "caffeine", "coffee", "tea", "alcohol",
  "onion", "garlic", "chive", "leek", "shallot", "scallion", "rhubarb", "mushroom",
  "xylitol", "salt", "apple seeds", "fruit pits", "cherry pits", "raw beans",
  "dried beans", "uncooked beans", "tomato leaves",
  "chocolade", "cafeïne", "koffie", "thee", "ui", "uien", "knoflook", "bieslook",
  "prei", "sjalot", "lente-ui", "rabarber", "paddenstoel", "champignon", "zout",
  "appelpitten", "pitten", "rauwe bonen", "gedroogde bonen",
];

export const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Words of a label, so "ap" finds "Apple (no seeds)" and "Apricot (no pit)". */
function startsAWord(label: string, q: string): boolean {
  return normalize(label).split(/[^a-z0-9]+/).some((w) => w.startsWith(q));
}

export type ChopSearchResult = {
  /** Safe ingredients that match, best first (at most 6). */
  matches: string[];
  /** The food a warning is about, when the search is for something unsafe. */
  warning: { food: string; onNeverList: boolean } | null;
};

/**
 * Search the ingredient list. `label` turns a saved English name into the shown
 * label (search matches either). A warning is raised only when nothing safe
 * matches as well — typing "ap" offers Apple, while "apple seeds" or
 * "avocado" warns.
 */
export function searchChopIngredients(query: string, label: (en: string) => string, neverFeed: string[] = []): ChopSearchResult {
  const q = normalize(query);
  if (q.length < 1) return { matches: [], warning: null };
  const scored = CHOP_INGREDIENTS.map((en) => {
    const shown = label(en);
    const names = [shown, en];
    let score = 0;
    if (names.some((n) => normalize(n).startsWith(q))) score = 3;
    else if (names.some((n) => startsAWord(n, q))) score = 2;
    else if (q.length >= 3 && names.some((n) => normalize(n).includes(q))) score = 1;
    return { en, shown, score };
  }).filter((r) => r.score > 0);
  scored.sort((a, b) => b.score - a.score || a.shown.localeCompare(b.shown));
  const matches = scored.map((r) => r.en).slice(0, 6);

  if (matches.length || q.length < 3) return { matches, warning: null };

  // The bird's own never-feed entries, split on "&" / "," / "and".
  for (const entry of neverFeed) {
    for (const part of entry.split(/\s*(?:&|,|\band\b|\ben\b)\s*/i)) {
      const p = normalize(part);
      if (p.length >= 2 && (p.startsWith(q) || q.startsWith(p))) return { matches, warning: { food: part.trim(), onNeverList: true } };
    }
  }
  const term = UNSAFE_TERMS.find((u) => (u.length >= 3 && u.startsWith(q)) || q === u || q.startsWith(`${u} `) || (u.length >= 4 && q.startsWith(u)));
  if (term) return { matches, warning: { food: query.trim(), onNeverList: false } };
  return { matches, warning: null };
}

/** How many ingredients the homemade chop has: picks plus typed extras. */
export function chopIngredientCount(ingredients: string[], other: string): number {
  return ingredients.length + other.split(",").map((x) => x.trim()).filter(Boolean).length;
}
