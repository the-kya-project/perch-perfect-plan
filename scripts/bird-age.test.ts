// The bird page's age and the Moments hatch-day card share one source.
import assert from "node:assert/strict";
import { birdAge } from "@/lib/birdAge";
import { ageFromBirthDate } from "@/lib/parrot-data";

let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.error(`not ok - ${name}\n`, e); }
}

const isoYearsAgo = (years: number, dayOffset = 0) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

check("a saved hatch date wins over the picked age", () => {
  assert.equal(birdAge({ age: "10 years", birth_date: isoYearsAgo(8, -3) }), "8 years");
});
check("no hatch date: the picked age", () => {
  assert.equal(birdAge({ age: "10 years", birth_date: null }), "10 years");
  assert.equal(birdAge({ age: " ", birth_date: null }), null);
});
check("the birthday counts on the day itself, in local time", () => {
  assert.equal(ageFromBirthDate(isoYearsAgo(5)), "5 years");
  assert.equal(ageFromBirthDate(isoYearsAgo(5, 1)), "4 years");
});
check("under a year", () => {
  assert.equal(ageFromBirthDate(isoYearsAgo(0, -40)), "<1 year");
});

if (failed) process.exit(1);
