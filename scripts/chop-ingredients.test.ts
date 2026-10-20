// Run: npm run test:chop-ingredients
// Homemade chop search: finds safe ingredients by any word, and warns (instead
// of offering to add) for foods that aren't safe or are on the never-feed list.
import assert from "node:assert/strict";
import { CHOP_COMMON, CHOP_INGREDIENTS, searchChopIngredients } from "../src/lib/chopIngredients";

const same = (en: string) => en;
const never = ["Chocolate", "Avocado", "Caffeine", "Alcohol", "Onion & garlic", "Salt", "Fruit pits & apple seeds"];
const find = (q: string) => searchChopIngredients(q, same, never);

// Every old checklist option and every common pick is still searchable.
for (const en of ["Pre-made chop", "Leafy greens", "Carrot", "Bell pepper", "Broccoli", "Sweet potato", "Squash", "Apple (no seeds)", "Berries", "Banana", "Cooked grains", "Cooked legumes", "Sprouts", "Quinoa", ...CHOP_COMMON]) {
  assert.ok(CHOP_INGREDIENTS.includes(en), `${en} is on the list`);
}
assert.equal(new Set(CHOP_INGREDIENTS).size, CHOP_INGREDIENTS.length, "no duplicates");

// "ap" finds Apple and Apricot; matches start-of-name first.
const ap = find("ap");
assert.ok(ap.matches.includes("Apple (no seeds)") && ap.matches.includes("Apricot (no pit)"));
assert.equal(ap.warning, null);
// Any word matches: "beans" finds the cooked beans.
assert.ok(find("beans").matches.some((m) => m.includes("beans")));
// Search is case- and accent-insensitive.
assert.ok(find("JALAP").matches.includes("Jalapeño"));
assert.ok(find("jalapeno").matches.includes("Jalapeño"));
assert.ok(find("kale").matches.length <= 6);

// Never-feed foods warn instead of matching.
assert.deepEqual(find("avoc").warning, { food: "Avocado", onNeverList: true });
assert.deepEqual(find("garlic").warning, { food: "garlic", onNeverList: true });
assert.equal(find("apple seeds").warning?.onNeverList, true, "apple seeds warn even though Apple is safe");
// Unsafe even when the owner removed it from their never-feed list.
const noList = searchChopIngredients("mushroom", same, []);
assert.equal(noList.matches.length, 0);
assert.equal(noList.warning?.onNeverList, false);
assert.equal(searchChopIngredients("rhubarb", same, []).warning?.food, "rhubarb");
// Something unknown and safe-sounding gets no warning (it can be added as typed).
assert.equal(searchChopIngredients("jicama", same, []).warning, null);
// Too short to warn.
assert.equal(searchChopIngredients("av", same, []).warning, null);

console.log("chop-ingredients: all passed");
