/**
 * Sign-up confirmation links and lifecycle-email language.
 *
 *   npm run test:confirm-links
 *
 * 1. readAuthLinkError (src/lib/authLinkError.ts) against the redirect Supabase
 *    Auth actually builds for a rejected email link (prepErrorRedirectURL in
 *    supabase/auth internal/api/verify.go: PKCE puts the error in the query AND
 *    the hash, plus an empty `sb` marker). An old or replaced link must be
 *    caught; a normal sign-in return and a cancelled Google/Apple sign-in must
 *    not.
 * 2. pickLifecycleLocale (src/lib/emailLocale.server.ts): profiles.locale, then
 *    the auth-email language from sign-up, then English.
 *
 * Plain asserts, since the repo carries no test runner.
 */
import assert from "node:assert/strict";
import { readAuthLinkError } from "@/lib/authLinkError";
import { pickLifecycleLocale } from "@/lib/emailLocale.server";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n`, e); process.exitCode = 1; }
}

/** The URL Supabase redirects to for a rejected link, built the way verify.go does. */
function supabaseErrorRedirect(redirectTo: string, code: string, description: string, pkce = true): URL {
  const u = new URL(redirectTo);
  const hq = new URLSearchParams({ error: "access_denied", error_code: code, error_description: description });
  if (pkce) for (const [k, v] of hq) u.searchParams.set(k, v);
  hq.set("sb", "");
  u.hash = hq.toString();
  return u;
}

check("old or replaced link (PKCE, query + hash) → otp_expired", () => {
  const u = supabaseErrorRedirect("https://app.thekyaproject.com/welcome", "otp_expired", "Email link is invalid or has expired");
  assert.deepEqual(readAuthLinkError(u.search, u.hash), { code: "otp_expired" });
});

check("hash only (implicit flow) → still caught", () => {
  const u = supabaseErrorRedirect("https://app.thekyaproject.com/welcome", "otp_expired", "Email link is invalid or has expired", false);
  assert.equal(u.search, "");
  assert.deepEqual(readAuthLinkError(u.search, u.hash), { code: "otp_expired" });
});

check("'Token has expired or is invalid' wording, no known code → caught", () => {
  const u = supabaseErrorRedirect("https://app.thekyaproject.com/welcome", "", "Token has expired or is invalid");
  assert.ok(readAuthLinkError(u.search, u.hash));
});

check("successful confirmation (?code=…) → nothing", () => {
  assert.equal(readAuthLinkError("?code=4f0e7c1a-dummy", ""), null);
});

check("plain /welcome → nothing", () => {
  assert.equal(readAuthLinkError("", ""), null);
});

check("cancelled Apple/Google sign-in → not an expired link", () => {
  const u = new URL("https://app.thekyaproject.com/welcome");
  u.searchParams.set("error", "access_denied");
  u.searchParams.set("error_code", "user_cancelled_authorize");
  u.searchParams.set("error_description", "The user cancelled the sign-in");
  assert.equal(readAuthLinkError(u.search, u.hash), null);
});

check("locale: profile wins", () => {
  assert.equal(pickLifecycleLocale("en", "nl"), "en");
  assert.equal(pickLifecycleLocale("nl", undefined), "nl");
});

check("locale: null profile → sign-up (auth email) language", () => {
  assert.equal(pickLifecycleLocale(null, "nl"), "nl");
  assert.equal(pickLifecycleLocale(null, "nl-BE"), "nl");
  assert.equal(pickLifecycleLocale(null, "en"), "en");
});

check("locale: nothing known → English", () => {
  assert.equal(pickLifecycleLocale(null, undefined), "en");
  assert.equal(pickLifecycleLocale(null, 42), "en");
});

console.log(`\n${passed} passed`);
