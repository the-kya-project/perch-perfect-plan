/**
 * A bird's own emergency contact never borrows from the account's.
 *
 *   npm run test:emergency-merge
 *
 * mergeEmergency (src/lib/emergency.ts) used to merge field by field, so a
 * bird's own vet with a blank name showed the ACCOUNT vet's name next to the
 * bird's own number. It now merges per contact row: a row the bird has any
 * value in is taken whole from the bird; every other row whole from the
 * account. This pins that, plus pickVet on the merged result (the sitter's
 * and the daily check's "Call vet" buttons).
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { birdOwnRows, birdOwnsRow, birdRowPatch, emergencyDifferent, isInherited, mergeEmergency, pickVet } from "@/lib/emergency";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const account = {
  owner_phone: "(555) 000-0001",
  backup_name: "Sam",
  backup_phone: "(555) 000-0002",
  avian_vet_name: "Account Avian Clinic",
  avian_vet_phone: "(555) 000-0003",
  avian_vet_address: "1 Account St",
  emergency_vet_name: "Account ER",
  emergency_vet_phone: "(555) 000-0004",
  emergency_vet_address: "2 Account Ave",
  poison_control: null,
  carrier_location: "Hall closet",
  first_aid_kit_location: "Kitchen",
  spending_limit: "$300",
};

check("no bird row: everything comes from the account", () => {
  const m = mergeEmergency(null, account);
  assert.equal(m.avian_vet_name, "Account Avian Clinic");
  assert.equal(m.owner_phone, "(555) 000-0001");
  assert.equal(emergencyDifferent(null, account), false);
});

check("an empty bird row (all nulls / blanks) follows the account", () => {
  const bird = { bird_id: "b1", owner_phone: null, avian_vet_name: "  ", avian_vet_phone: "" };
  const m = mergeEmergency(bird, account);
  assert.equal(m.avian_vet_phone, "(555) 000-0003");
  assert.equal(emergencyDifferent(bird), false);
});

check("bird's own vet with a blank name and address does NOT show the account vet's", () => {
  const bird = { avian_vet_phone: "(555) 999-1111" };
  const m = mergeEmergency(bird, account);
  assert.equal(m.avian_vet_phone, "(555) 999-1111");
  assert.equal(m.avian_vet_name, null);
  assert.equal(m.avian_vet_address, null);
});

check("only the overridden row changes; other rows stay whole from the account", () => {
  const bird = { avian_vet_name: "Bird Clinic" };
  const m = mergeEmergency(bird, account);
  assert.equal(m.avian_vet_name, "Bird Clinic");
  assert.equal(m.avian_vet_phone, null);
  assert.equal(m.emergency_vet_name, "Account ER");
  assert.equal(m.emergency_vet_phone, "(555) 000-0004");
  assert.equal(m.backup_name, "Sam");
  assert.equal(m.spending_limit, "$300");
});

check("same rule for the backup contact", () => {
  const m = mergeEmergency({ backup_name: "Jo" }, account);
  assert.equal(m.backup_name, "Jo");
  assert.equal(m.backup_phone, null);
});

check("same rule for the emergency vet", () => {
  const m = mergeEmergency({ emergency_vet_address: "9 Bird Rd" }, account);
  assert.equal(m.emergency_vet_address, "9 Bird Rd");
  assert.equal(m.emergency_vet_name, null);
  assert.equal(m.emergency_vet_phone, null);
});

check("values are trimmed; null account is fine", () => {
  const m = mergeEmergency({ owner_phone: "  (555) 1  " }, null);
  assert.equal(m.owner_phone, "(555) 1");
  assert.equal(m.avian_vet_phone, null);
});

check("emergencyDifferent / birdOwnRows / isInherited use the row rule", () => {
  const bird = { avian_vet_address: "x", carrier_location: "y" };
  assert.equal(emergencyDifferent(bird, account), true);
  assert.deepEqual(birdOwnRows(bird), ["avian_vet", "carrier"]);
  assert.equal(birdOwnsRow(bird, "avian_vet"), true);
  assert.equal(birdOwnsRow(bird, "emergency_vet"), false);
  assert.equal(isInherited("avian_vet_phone", bird), false);
  assert.equal(isInherited("emergency_vet_phone", bird), true);
});

check("a bird row equal to the account's still counts as the bird's own", () => {
  const bird = { avian_vet_name: account.avian_vet_name, avian_vet_phone: account.avian_vet_phone, avian_vet_address: account.avian_vet_address };
  assert.equal(emergencyDifferent(bird, account), true);
});

check("birdRowPatch stores every field of the row, blanks as null", () => {
  assert.deepEqual(birdRowPatch("avian_vet", { avian_vet_phone: " 555 " }), {
    avian_vet_name: null,
    avian_vet_phone: "555",
    avian_vet_address: null,
  });
});

check("pickVet on the merge: bird's own avian vet without a phone falls to the ACCOUNT's ER vet whole", () => {
  const vet = pickVet(mergeEmergency({ avian_vet_name: "Bird Clinic" }, account));
  assert.deepEqual(vet, { kind: "emergency", name: "Account ER", phone: "(555) 000-0004", address: "2 Account Ave" });
});

check("pickVet never pairs the bird's vet number with the account vet's name", () => {
  const vet = pickVet(mergeEmergency({ avian_vet_phone: "(555) 999-1111" }, account));
  assert.deepEqual(vet, { kind: "avian", name: null, phone: "(555) 999-1111", address: null });
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
