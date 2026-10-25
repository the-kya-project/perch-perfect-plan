/**
 * Names in emails are real names or none, never the part of an address before
 * the @ ("Welcome to the flock, 2dkh5ctcgb.").
 *
 *   npm run test:person-name
 *
 * Covers src/lib/personName.ts (every email sender uses it), the Apple
 * first-sign-in name save (src/lib/appleName.ts, fills blanks only), and the
 * real welcome email's subject in English and Dutch.
 *
 * Plain asserts, since the repo carries no test runner. Addresses are dummies
 * shaped like the real cases.
 */
import assert from "node:assert/strict";
import { isEmailDerivedName, realFirstName, realFullName } from "@/lib/personName";
import { appleNameUpdate } from "@/lib/appleName";
import { buildWelcomeEmail, buildFlockReportEmail } from "@/lib/flockEmails";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n`, e); process.exitCode = 1; }
}

const RELAY = "2dkh5ctcgb@privaterelay.appleid.com";
const relayProfile = { first_name: "2dkh5ctcgb", full_name: "2dkh5ctcgb", display_name: "2dkh5ctcgb" };

check("Apple relay prefix is not a name", () => {
  assert.equal(isEmailDerivedName("2dkh5ctcgb", RELAY), true);
  assert.equal(realFirstName(relayProfile, RELAY), undefined);
  assert.equal(realFullName([relayProfile.display_name], RELAY), null);
});

check("plain email prefix (no name at sign-up) is not a name", () => {
  assert.equal(realFirstName({ first_name: "smeyer", display_name: "smeyer" }, "smeyer@school.example"), undefined);
});

check("a real name that matches the prefix but is capitalised is kept", () => {
  assert.equal(realFirstName({ first_name: null, display_name: "Brittany" }, "brittany@thekyaproject.example"), "Brittany");
});

check("real first name wins; else first word of the full/display name", () => {
  assert.equal(realFirstName({ first_name: "Joyce", display_name: "Joyce A" }, "joyce.a@icloud.example"), "Joyce");
  assert.equal(realFirstName({ first_name: null, full_name: "Marta de Vries" }, "m@x.example"), "Marta");
  assert.equal(realFirstName({ first_name: "2dkh5ctcgb", display_name: "Sam Lee" }, RELAY), "Sam");
});

check("a name containing @ is never used", () => {
  assert.equal(realFullName(["someone@example.com"], "other@example.com"), null);
});

check("the check uses every address it's given (profile and auth email)", () => {
  assert.equal(isEmailDerivedName("abc", "someone@example.com", "abc@privaterelay.appleid.com"), true);
});

check("Apple first sign-in fills blank or email-made names", () => {
  assert.deepEqual(
    appleNameUpdate({ givenName: "Sam", familyName: "Lee" }, { first_name: null, full_name: null, display_name: null, email: RELAY }),
    { first_name: "Sam", full_name: "Sam Lee", display_name: "Sam Lee" },
  );
  assert.deepEqual(
    appleNameUpdate({ givenName: "Sam", familyName: "Lee" }, { ...relayProfile, email: RELAY }),
    { first_name: "Sam", full_name: "Sam Lee", display_name: "Sam Lee" },
  );
});

check("Apple never overwrites a name the person set", () => {
  assert.equal(appleNameUpdate({ givenName: "Sam", familyName: "Lee" }, { first_name: "Sammy", full_name: "Sammy L", display_name: "Sammy L", email: RELAY }), null);
});

check("Apple with no name (later sign-ins, or withheld) changes nothing", () => {
  assert.equal(appleNameUpdate({ givenName: null, familyName: null }, { first_name: null, full_name: null, display_name: null, email: RELAY }), null);
  assert.equal(appleNameUpdate(undefined, null), null);
});

check("welcome email for the relay user: no name, English and Dutch", () => {
  const first = realFirstName(relayProfile, RELAY);
  const en = buildWelcomeEmail({ firstName: first, link: "https://app.example", hasBird: true, locale: "en" });
  const nl = buildWelcomeEmail({ firstName: first, link: "https://app.example", hasBird: true, locale: "nl" });
  assert.equal(en.subject, "Welcome to the flock.");
  assert.equal(nl.subject, "Welkom in de club.");
  assert.ok(!en.html.includes("2dkh5ctcgb") && !en.text.includes("2dkh5ctcgb"));
  assert.ok(!nl.html.includes("2dkh5ctcgb") && !nl.text.includes("2dkh5ctcgb"));
});

check("welcome email with a real name still greets by name", () => {
  assert.equal(buildWelcomeEmail({ firstName: "Sam", link: "https://app.example", locale: "en" }).subject, "Welcome to the flock, Sam.");
});

check("monthly letter for the relay user: 'Hi there!', no prefix", () => {
  const built = buildFlockReportEmail({
    firstName: realFirstName(relayProfile, RELAY), birds: [], month: 9, year: 2026, link: "https://app.example",
    coming: null, article: null, unsubscribeUrl: "https://app.example/u", firstIssue: false, locale: "en",
  } as Parameters<typeof buildFlockReportEmail>[0]);
  assert.ok(!built.html.includes("2dkh5ctcgb"));
});

console.log(`\n${passed} passed`);
