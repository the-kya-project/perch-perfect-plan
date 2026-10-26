/**
 * UTM carry-over across our own redirects (src/lib/utmCarry.ts).
 *
 *   npm run test:utm-carry
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure. The redirects themselves are checked in a browser; this pins the
 * helper they all use.
 */
import assert from "node:assert/strict";
import { UTM_KEYS, pickUtms, withUtms } from "@/lib/utmCarry";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const EMAIL = "?utm_source=email&utm_medium=email&utm_campaign=onboarding-2&utm_content=cta";

check("picks exactly the UTM keys, nothing else", () => {
  assert.deepEqual(pickUtms(`${EMAIL}&birdId=abc&kya=1`), {
    utm_source: "email", utm_medium: "email", utm_campaign: "onboarding-2", utm_content: "cta",
  });
});
check("handles a search string without the leading ?", () => {
  assert.deepEqual(pickUtms("utm_source=tiktok&utm_term=parrots"), { utm_source: "tiktok", utm_term: "parrots" });
});
check("no UTMs → nothing, and the href is untouched", () => {
  assert.deepEqual(pickUtms("?mode=signin"), {});
  assert.equal(withUtms("/dashboard", pickUtms("?mode=signin")), "/dashboard");
  assert.deepEqual(pickUtms(""), {});
  assert.deepEqual(pickUtms(undefined), {});
});
check("covers all five standard keys", () => {
  assert.deepEqual([...UTM_KEYS], ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]);
});
check("signed-out email link: UTMs land at the TOP LEVEL of /auth", () => {
  const original = `/dashboard${EMAIL}`;
  const to = withUtms(`/auth?mode=signin&redirect=${encodeURIComponent(original)}`, pickUtms(EMAIL));
  const params = new URL(to, "https://x").searchParams;
  assert.equal(params.get("utm_source"), "email");
  assert.equal(params.get("utm_campaign"), "onboarding-2");
  assert.equal(params.get("mode"), "signin");
  assert.equal(params.get("redirect"), original); // the return path is intact
});
check("existing params win; hash is kept", () => {
  assert.equal(withUtms("/x?utm_source=keep#top", { utm_source: "new", utm_medium: "m" }), "/x?utm_source=keep&utm_medium=m#top");
});
check("values are length-capped", () => {
  assert.equal(pickUtms(`?utm_source=${"a".repeat(500)}`).utm_source?.length, 200);
});

console.log(`\n${passed} passed${process.exitCode ? " — WITH FAILURES" : ""}`);
