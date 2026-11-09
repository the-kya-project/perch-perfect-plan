// Who may call the cron hooks (src/lib/cronAuth.ts): only the Vault token,
// checked by the database. The email-link key is not a cron token.
import assert from "node:assert/strict";
import { bearerToken, cronAuthFailure, type CronTokenCheck } from "@/lib/cronAuth";

let failed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.error(`not ok - ${name}\n`, e); }
}

const req = (auth?: string) => new Request("https://app.thekyaproject.com/api/public/hooks/gift-emails", {
  method: "POST",
  headers: auth ? { authorization: auth } : {},
});

await check("bearer token parsing", () => {
  assert.equal(bearerToken("Bearer abc"), "abc");
  assert.equal(bearerToken("bearer abc "), "abc");
  assert.equal(bearerToken("Bearer"), null);
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken("Bearer a b"), null);
  assert.equal(bearerToken(null), null);
});
await check("no or malformed header: 401, without asking the database", async () => {
  assert.equal((await cronAuthFailure(req(), "t"))?.status, 401);
  assert.equal((await cronAuthFailure(req("Basic x"), "t"))?.status, 401);
});
// Stands in for public.cron_hook_token_matches: it knows only the Vault token.
const vault: CronTokenCheck = async (token) => ({ data: token === "vault-token", error: null });

await check("the Vault token is accepted", async () => {
  assert.equal(await cronAuthFailure(req("Bearer vault-token"), "t", vault), null);
});
await check("the email-link key is not accepted as a cron token", async () => {
  const before = process.env.CARE_PLAN_REMINDER_SECRET;
  process.env.CARE_PLAN_REMINDER_SECRET = "email-link-key";
  try {
    assert.equal((await cronAuthFailure(req("Bearer email-link-key"), "t", vault))?.status, 401);
  } finally {
    if (before === undefined) delete process.env.CARE_PLAN_REMINDER_SECRET; else process.env.CARE_PLAN_REMINDER_SECRET = before;
  }
});
await check("database check unavailable: 503", async () => {
  const down: CronTokenCheck = async () => ({ data: null, error: { message: "down" } });
  const err = console.error;
  console.error = () => {};
  try {
    assert.equal((await cronAuthFailure(req("Bearer vault-token"), "t", down))?.status, 503);
  } finally {
    console.error = err;
  }
});

if (failed) process.exit(1);
