// Who may call the cron hooks (src/lib/cronAuth.ts): the Vault token, checked
// by the database, and for now the old shared secret.
import assert from "node:assert/strict";
import { bearerToken, cronAuthFailure, sameSecret } from "@/lib/cronAuth";

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
await check("secret comparison", () => {
  assert.ok(sameSecret("abc", "abc"));
  assert.ok(!sameSecret("abc", "abd"));
  assert.ok(!sameSecret("abc", "abcd"));
});
await check("no or malformed header: 401, without asking the database", async () => {
  assert.equal((await cronAuthFailure(req(), "t"))?.status, 401);
  assert.equal((await cronAuthFailure(req("Basic x"), "t"))?.status, 401);
});
await check("transition: the old shared secret is still accepted", async () => {
  const before = process.env.CARE_PLAN_REMINDER_SECRET;
  process.env.CARE_PLAN_REMINDER_SECRET = "old-shared-secret";
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await cronAuthFailure(req("Bearer old-shared-secret"), "t"), null);
  } finally {
    console.warn = warn;
    if (before === undefined) delete process.env.CARE_PLAN_REMINDER_SECRET; else process.env.CARE_PLAN_REMINDER_SECRET = before;
  }
});

if (failed) process.exit(1);
