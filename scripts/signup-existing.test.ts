/**
 * Sign-up with an email that already has an account must be recognized, so
 * /auth shows "You already have an account" instead of "Check your email".
 *
 *   npm run test:signup-existing
 *
 * Runs the REAL supabase-js signUp() against a fake fetch that answers with
 * the bodies Supabase Auth sends, then feeds the result to the same
 * existingAccountSignal() that src/routes/auth.tsx uses. The case that matters
 * is production's: "Confirm email" ON, existing email → HTTP 200, no error, no
 * session, and a user whose identities array is empty.
 *
 * Plain asserts, since the repo carries no test runner. Every value is a dummy.
 */
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { existingAccountSignal } from "@/lib/signupExisting";

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { console.error(`  FAIL ${name}\n`, e); process.exitCode = 1; }
}

const now = "2026-10-25T12:00:00.000000Z";
const EMAIL = "kiwi@example.com";

/** A user object as Supabase Auth returns it when no session is issued. */
function userBody(identities: unknown[]) {
  return {
    id: "6f1c2a3b-0000-4000-8000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: EMAIL,
    phone: "",
    confirmation_sent_at: now,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities,
    created_at: now,
    updated_at: now,
    is_anonymous: false,
  };
}
const emailIdentity = {
  identity_id: "6f1c2a3b-0000-4000-8000-000000000002",
  id: "6f1c2a3b-0000-4000-8000-000000000001",
  user_id: "6f1c2a3b-0000-4000-8000-000000000001",
  identity_data: { email: EMAIL, email_verified: false, phone_verified: false, sub: "6f1c2a3b-0000-4000-8000-000000000001" },
  provider: "email",
  last_sign_in_at: now,
  created_at: now,
  updated_at: now,
  email: EMAIL,
};

/** Run the real signUp() with Supabase Auth answering `status` + `body`. */
async function signUpAgainst(status: number, body: unknown) {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const client = createClient("https://abcdefghijklmnopqrst.supabase.co", "sb_publishable_dummy", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fakeFetch },
  });
  return client.auth.signUp({ email: EMAIL, password: "secret123" });
}

await check("Confirm email ON, existing email: empty identities, no error → existing account", async () => {
  const res = await signUpAgainst(200, userBody([]));
  assert.equal(res.error, null);
  assert.equal(res.data.session, null);
  assert.deepEqual(res.data.user?.identities, []);
  assert.equal(existingAccountSignal(res), "empty_identities");
});

await check("Confirm email ON, new email: one identity → a real sign-up", async () => {
  const res = await signUpAgainst(200, userBody([emailIdentity]));
  assert.equal(res.error, null);
  assert.equal(existingAccountSignal(res), null);
});

await check("Confirm email OFF (staging), existing email: 'User already registered' → existing account", async () => {
  const res = await signUpAgainst(422, { code: 422, error_code: "user_already_exists", msg: "User already registered" });
  assert.ok(res.error);
  assert.equal(existingAccountSignal(res), "error");
});

await check("Confirm email OFF, new email: session returned → a real sign-up", async () => {
  const res = await signUpAgainst(200, {
    access_token: "dummy.access.token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: 1793000000,
    refresh_token: "dummyrefresh",
    user: userBody([emailIdentity]),
  });
  assert.ok(res.data.session);
  assert.equal(existingAccountSignal(res), null);
});

await check("Any other error (weak password) → not an existing account", async () => {
  const res = await signUpAgainst(422, { code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters." });
  assert.ok(res.error);
  assert.equal(existingAccountSignal(res), null);
});

console.log(`\n${passed} passed`);
