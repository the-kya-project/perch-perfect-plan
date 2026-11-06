/**
 * Native sign-in errors: which are the person cancelling (no error shown, no
 * web fallback), which mean the build has no plugin (web fallback), and which
 * are real failures.
 *
 *   npm run test:oauth-errors
 *
 * Plain asserts, like the other scripts/*.test.ts. Exits non-zero on failure.
 */
import assert from "node:assert/strict";

const E = await import("@/lib/oauthErrors");

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

/** What Capacitor hands JS for a plugin rejection: an Error with `code`. */
function capErr(message: string, code?: string) {
  const e = new Error(message) as Error & { code?: string };
  if (code) e.code = code;
  return e;
}

const APPLE_1001 = "The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)";
const APPLE_1001_NL = "De bewerking kan niet worden voltooid. (com.apple.AuthenticationServices.AuthorizationError fout 1001.)";
const APPLE_1000 = "The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)";
const NOT_IMPLEMENTED = '"SocialLogin" plugin is not implemented on ios';

console.log("cancels");
await check("Apple 1001, the exact text seen on /auth, with no code", () => {
  assert.equal(E.isOAuthCancel(capErr(APPLE_1001)), true);
});
await check("Apple 1001 in another iOS language", () => {
  assert.equal(E.isOAuthCancel(capErr(APPLE_1001_NL)), true);
});
await check("the plugin's USER_CANCELLED code, whatever the text", () => {
  assert.equal(E.isOAuthCancel(capErr(APPLE_1001, "USER_CANCELLED")), true);
  assert.equal(E.isOAuthCancel(capErr("anything", "USER_CANCELLED")), true);
});
await check("Google on iOS and Android", () => {
  assert.equal(E.isOAuthCancel(capErr("The user canceled the sign-in flow.")), true);
  assert.equal(E.isOAuthCancel(capErr("The operation couldn’t be completed. (com.google.GIDSignIn error -5.)")), true);
  assert.equal(E.isOAuthCancel(capErr("activity is cancelled by the user.")), true);
  assert.equal(E.isOAuthCancel(capErr("User cancelled")), true);
});
await check("a closed browser sheet and the web flow's access_denied", () => {
  assert.equal(E.isOAuthCancel(capErr("The operation couldn’t be completed. (com.apple.AuthenticationServices.WebAuthenticationSession error 1.)")), true);
  assert.equal(E.isOAuthCancel("access_denied"), true);
  assert.equal(E.isOAuthCancel("User cancelled"), true);
});

console.log("not cancels");
await check("other Apple errors are real failures", () => {
  assert.equal(E.isOAuthCancel(capErr(APPLE_1000)), false);
  assert.equal(E.isOAuthCancel(capErr("The operation couldn’t be completed. (com.apple.AuthenticationServices.AuthorizationError error 10010.)")), false);
  assert.equal(E.isOAuthCancel(capErr("The operation couldn’t be completed. (com.apple.AuthenticationServices.WebAuthenticationSession error 2.)")), false);
});
await check("Supabase and network errors are real failures", () => {
  assert.equal(E.isOAuthCancel(capErr("Bad ID token")), false);
  assert.equal(E.isOAuthCancel(capErr("Failed to fetch")), false);
  assert.equal(E.isOAuthCancel(null), false);
});
await check("a missing plugin is not a cancel", () => {
  assert.equal(E.isOAuthCancel(capErr(NOT_IMPLEMENTED, "UNIMPLEMENTED")), false);
});

console.log("web fallback only for a missing plugin");
await check("not implemented, by code or by text", () => {
  assert.equal(E.isPluginUnimplemented(capErr(NOT_IMPLEMENTED, "UNIMPLEMENTED")), true);
  assert.equal(E.isPluginUnimplemented(capErr(NOT_IMPLEMENTED)), true);
});
await check("a cancel never leads to the fallback", () => {
  assert.equal(E.isPluginUnimplemented(capErr(APPLE_1001)), false);
  assert.equal(E.isPluginUnimplemented(capErr(APPLE_1001, "USER_CANCELLED")), false);
  assert.equal(E.isPluginUnimplemented(capErr("The user canceled the sign-in flow.")), false);
});
await check("other failures don't either", () => {
  assert.equal(E.isPluginUnimplemented(capErr(APPLE_1000)), false);
  assert.equal(E.isPluginUnimplemented(capErr("Bad ID token")), false);
});

console.log("sign-in code uses these, cancel first");
await check("nativeOAuth checks cancel before the fallback, and has one sign-in at a time", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/lib/nativeOAuth.ts", "utf8");
  const cancelAt = src.indexOf("if (isOAuthCancel(e))");
  const fallbackAt = src.indexOf("if (isPluginUnimplemented(e))");
  assert.ok(cancelAt > 0 && fallbackAt > cancelAt, "cancel must be checked before the fallback");
  assert.ok(!/\/cancel\/i\.test\(msg\)/.test(src), "the old message-only cancel check is gone");
  assert.ok(src.includes("if (inFlight) return"), "a repeat tap waits on the running attempt");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
