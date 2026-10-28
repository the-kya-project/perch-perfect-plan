/**
 * Supabase Send Email hook — signature check, which email goes where, and the
 * Dutch/English templates.
 *
 *   npm run test:auth-email-hook
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on failure.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyHookSignature, planAuthEmails, verifyUrl, appVerifyUrl, type SendEmailHookPayload } from "@/lib/authEmailHook.server";
import { buildAuthEmail } from "@/lib/emailTemplates";

let passed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

// ── Signature ────────────────────────────────────────────────────────────────
const KEY = Buffer.from("a-test-secret-that-is-long-enough!!").toString("base64");
const SECRET = `v1,whsec_${KEY}`;
const NOW = 1_800_000_000;
const sign = (id: string, ts: number, body: string, key = KEY) =>
  "v1," + createHmac("sha256", Buffer.from(key, "base64")).update(`${id}.${ts}.${body}`).digest("base64");
const BODY = '{"hello":"world"}';

check("valid signature passes", () => {
  assert.equal(verifyHookSignature(BODY, { id: "msg_1", timestamp: String(NOW), signature: sign("msg_1", NOW, BODY) }, SECRET, NOW), true);
});
check("secret without the v1,whsec_ prefix also works", () => {
  assert.equal(verifyHookSignature(BODY, { id: "msg_1", timestamp: String(NOW), signature: sign("msg_1", NOW, BODY) }, KEY, NOW), true);
});
check("tampered body fails", () => {
  assert.equal(verifyHookSignature(BODY + " ", { id: "msg_1", timestamp: String(NOW), signature: sign("msg_1", NOW, BODY) }, SECRET, NOW), false);
});
check("wrong secret fails", () => {
  const other = Buffer.from("some-other-secret-value-xxxxxxxx").toString("base64");
  assert.equal(verifyHookSignature(BODY, { id: "msg_1", timestamp: String(NOW), signature: sign("msg_1", NOW, BODY, other) }, SECRET, NOW), false);
});
check("stale timestamp fails", () => {
  const ts = NOW - 6 * 60;
  assert.equal(verifyHookSignature(BODY, { id: "msg_1", timestamp: String(ts), signature: sign("msg_1", ts, BODY) }, SECRET, NOW), false);
});
check("missing headers fail", () => {
  assert.equal(verifyHookSignature(BODY, { id: null, timestamp: String(NOW), signature: sign("msg_1", NOW, BODY) }, SECRET, NOW), false);
});
check("any of several space-separated signatures may match", () => {
  const sig = `v1,AAAA ${sign("msg_1", NOW, BODY)}`;
  assert.equal(verifyHookSignature(BODY, { id: "msg_1", timestamp: String(NOW), signature: sig }, SECRET, NOW), true);
});

// ── Planning ─────────────────────────────────────────────────────────────────
const SB = "https://ref.supabase.co";
const payload = (type: string, extra: Partial<SendEmailHookPayload["email_data"]> = {}, user: Partial<SendEmailHookPayload["user"]> = {}): SendEmailHookPayload => ({
  user: { id: "u1", email: "old@kya.test", ...user },
  email_data: { token: "123456", token_hash: "hashA", redirect_to: "https://app.thekyaproject.com/welcome", email_action_type: type, site_url: "", token_new: "", token_hash_new: "", ...extra },
});

check("verify URL matches Supabase's ConfirmationURL shape", () => {
  assert.equal(
    verifyUrl(SB, "hashA", "signup", "https://app.thekyaproject.com/welcome"),
    "https://ref.supabase.co/auth/v1/verify?token=hashA&type=signup&redirect_to=https%3A%2F%2Fapp.thekyaproject.com%2Fwelcome",
  );
});
check("empty redirect_to is left off", () => {
  assert.equal(verifyUrl(SB + "/", "h", "recovery", ""), "https://ref.supabase.co/auth/v1/verify?token=h&type=recovery");
});
check("signup → one email with a link to the user", () => {
  const p = planAuthEmails(payload("signup"), SB);
  assert.equal(p.length, 1);
  assert.equal(p[0].to, "old@kya.test");
  assert.equal(p[0].kind, "signup");
  assert.equal(p[0].link, "https://app.thekyaproject.com/verify?token_hash=hashA&type=signup&next=%2Fwelcome");
});
check("recovery → reset email, landing on /reset-password through /verify", () => {
  const p = planAuthEmails(payload("recovery", { redirect_to: "https://app.thekyaproject.com/reset-password" }), SB);
  assert.deepEqual([p[0].kind, p[0].tag], ["recovery", "auth_recovery"]);
  assert.equal(p[0].link, "https://app.thekyaproject.com/verify?token_hash=hashA&type=recovery&next=%2Freset-password");
});
check("app links: /verify on our domain, so the installed app can open them", () => {
  // An invitee's confirmation goes back to their invite, query kept.
  assert.equal(
    appVerifyUrl("h", "signup", "https://app.thekyaproject.com/invite/tok?x=1"),
    "https://app.thekyaproject.com/verify?token_hash=h&type=signup&next=%2Finvite%2Ftok%3Fx%3D1",
  );
  assert.equal(appVerifyUrl("h", "magiclink", "https://app.thekyaproject.com/"), "https://app.thekyaproject.com/verify?token_hash=h&type=magiclink");
});
check("other or missing redirect_to keeps Supabase's own link", () => {
  for (const r of ["", "http://127.0.0.1:4173/welcome", "https://evil.example/welcome", "https://pet-sitter-git-x.vercel.app/welcome", "not a url"]) {
    assert.equal(appVerifyUrl("h", "signup", r), null, r);
  }
  const p = planAuthEmails(payload("signup", { redirect_to: "http://127.0.0.1:4173/welcome" }), SB);
  assert.match(p[0].link!, /^https:\/\/ref\.supabase\.co\/auth\/v1\/verify\?token=hashA&type=signup/);
});
check("reauthentication → code, no link", () => {
  const p = planAuthEmails(payload("reauthentication"), SB);
  assert.equal(p[0].code, "123456");
  assert.equal(p[0].link, undefined);
});
check("secure email change → two emails with the reversed hashes", () => {
  const p = planAuthEmails(payload("email_change", { token_hash_new: "hashB", token_new: "654321" }, { new_email: "new@kya.test" }), SB);
  assert.equal(p.length, 2);
  const toNew = p.find((e) => e.to === "new@kya.test")!;
  const toOld = p.find((e) => e.to === "old@kya.test")!;
  assert.equal(toNew.kind, "emailChangeNew");
  assert.match(toNew.link!, /token_hash=hashA&type=email_change/);
  assert.equal(toOld.kind, "emailChangeCurrent");
  assert.match(toOld.link!, /token_hash=hashB&type=email_change/);
});
check("single email change → only the new address", () => {
  const p = planAuthEmails(payload("email_change", {}, { new_email: "new@kya.test" }), SB);
  assert.equal(p.length, 1);
  assert.equal(p[0].to, "new@kya.test");
});
check("security notifications are not handled", () => {
  assert.equal(planAuthEmails(payload("password_changed_notification"), SB).length, 0);
});

// ── Templates ────────────────────────────────────────────────────────────────
const LINK = "https://ref.supabase.co/auth/v1/verify?token=h&type=signup&redirect_to=x";

check("signup in Dutch", () => {
  const e = buildAuthEmail({ kind: "signup", link: LINK, locale: "nl" });
  assert.equal(e.subject, "Bevestig je e-mailadres");
  assert.match(e.html, /E-mailadres bevestigen/);
  assert.match(e.html, /Welkom bij Kya &amp; Co\./);
});
check("signup in English, and unknown locale falls back to English", () => {
  assert.equal(buildAuthEmail({ kind: "signup", link: LINK, locale: "en" }).subject, "Confirm your email address");
  assert.equal(buildAuthEmail({ kind: "signup", link: LINK, locale: "fr" }).subject, "Confirm your email address");
  assert.equal(buildAuthEmail({ kind: "signup", link: LINK }).subject, "Confirm your email address");
});
check("link is escaped in HTML and raw in text", () => {
  const e = buildAuthEmail({ kind: "recovery", link: LINK, locale: "en" });
  assert.ok(e.html.includes("token=h&amp;type=signup"));
  assert.ok(!e.html.includes("token=h&type"));
  assert.ok(e.text.includes(LINK));
});
check("new email address is escaped", () => {
  const e = buildAuthEmail({ kind: "emailChangeNew", link: LINK, newEmail: "<b>@x.test", locale: "en" });
  assert.ok(e.html.includes("&lt;b&gt;@x.test"));
  assert.ok(e.text.includes("<b>@x.test"));
});
check("reauthentication shows the code in subject and body", () => {
  const e = buildAuthEmail({ kind: "reauthentication", code: "123456", locale: "nl" });
  assert.equal(e.subject, "123456 is je verificatiecode");
  assert.match(e.html, /123456/);
  assert.doesNotMatch(e.html, /href="https:\/\/ref/);
});
check("text versions have no HTML entities", () => {
  for (const kind of ["signup", "invite", "emailChangeCurrent"] as const) {
    const e = buildAuthEmail({ kind, link: LINK, newEmail: "a@b.test", locale: "en" });
    assert.ok(!e.text.includes("&amp;"), kind);
  }
});
check("every kind renders in both languages with no missing keys", () => {
  for (const locale of ["en", "nl"]) {
    for (const kind of ["signup", "recovery", "magiclink", "invite", "emailChangeNew", "emailChangeCurrent", "reauthentication"] as const) {
      const e = buildAuthEmail({ kind, link: kind === "reauthentication" ? undefined : LINK, code: "123456", newEmail: "a@b.test", locale });
      assert.ok(!/email\.auth\./.test(e.subject + e.html + e.text), `${locale}/${kind} has a raw key`);
    }
  }
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
