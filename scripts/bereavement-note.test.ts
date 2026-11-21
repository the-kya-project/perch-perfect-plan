// The bereavement note in the owner's language, for one bird and for several
// (emailTemplates.ts buildBereavementEmail; names joined by joinNamesLocalized).
import assert from "node:assert/strict";
import { buildBereavementEmail } from "@/lib/emailTemplates";
import { joinNamesLocalized } from "@/lib/emailLocale.server";

let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.error(`not ok - ${name}\n`, e); }
}

const note = (names: string[], locale: string) =>
  buildBereavementEmail({ birdName: joinNamesLocalized(names, locale, "bird"), birdCount: names.length, locale });

check("Dutch, one bird: singular verb", () => {
  const e = note(["Willow"], "nl");
  assert.match(e.html, /Ik zag dat Willow is overleden/);
  assert.match(e.text, /Ik zag dat Willow is overleden/);
});
check("Dutch, two birds: Dutch 'en' and a plural verb", () => {
  const e = note(["Willow", "Moxie"], "nl");
  assert.match(e.html, /Ik zag dat Willow en Moxie zijn overleden/);
  assert.match(e.text, /Ik zag dat Willow en Moxie zijn overleden/);
  assert.match(e.subject, /Willow en Moxie/);
  assert.doesNotMatch(e.html + e.text + e.subject, / and /);
});
check("Dutch, three birds", () => {
  assert.match(note(["Echo", "Willow", "Moxie"], "nl").text, /Echo, Willow en Moxie zijn overleden/);
});
check("English reads naturally for one and for two", () => {
  assert.match(note(["Willow"], "en").text, /I saw that Willow passed away/);
  assert.match(note(["Willow", "Moxie"], "en").text, /I saw that Willow and Moxie passed away/);
});

if (failed) process.exit(1);
