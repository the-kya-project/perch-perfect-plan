// Account deletion also deletes the person's PostHog data: their person,
// events and recordings, by the same hashed id the app identifies with
// (accountDeletion.ts, posthogPersons.server.ts, deleteMyAccount).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { finishAccountDeletion } from "@/lib/accountDeletion";
import { deletePostHogPerson } from "@/lib/posthogPersons.server";
import { hashUserId } from "@/lib/userHash";

let failed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try { await fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.error(`not ok - ${name}\n`, e); }
}

const USER = "11111111-2222-4333-8444-555555555555";
const realFetch = globalThis.fetch;
const realError = console.error;

type Call = { url: string; init: RequestInit };
function stubFetch(respond: () => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  return calls;
}
function quiet(): string[] {
  const lines: string[] = [];
  console.error = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
  return lines;
}
function restore() {
  globalThis.fetch = realFetch;
  console.error = realError;
  delete process.env.POSTHOG_PERSONS_API_KEY;
}

// ---------------- the deletion flow ----------------

await check("deletes the auth user FIRST, then the PostHog person", async () => {
  const order: string[] = [];
  const out = await finishAccountDeletion(
    {
      deleteAuthUser: async (id) => { order.push(`auth:${id}`); return { error: null }; },
      deletePostHogPerson: async (id) => { order.push(`posthog:${id}`); return { ok: true }; },
    },
    USER,
  );
  assert.deepEqual(order, [`auth:${USER}`, `posthog:${USER}`]);
  assert.deepEqual(out, { analyticsDeleted: true });
});

await check("if the auth delete fails, it throws and PostHog is left alone", async () => {
  let posthogCalled = false;
  await assert.rejects(
    finishAccountDeletion(
      {
        deleteAuthUser: async () => ({ error: { message: "auth down" } }),
        deletePostHogPerson: async () => { posthogCalled = true; return { ok: true }; },
      },
      USER,
    ),
    /auth down/,
  );
  assert.equal(posthogCalled, false);
});

await check("a PostHog failure never fails the account deletion", async () => {
  const notOk = await finishAccountDeletion(
    { deleteAuthUser: async () => ({ error: null }), deletePostHogPerson: async () => ({ ok: false, reason: "http_500" }) },
    USER,
  );
  assert.deepEqual(notOk, { analyticsDeleted: false });
  const threw = await finishAccountDeletion(
    { deleteAuthUser: async () => ({ error: null }), deletePostHogPerson: async () => { throw new Error("boom"); } },
    USER,
  );
  assert.deepEqual(threw, { analyticsDeleted: false });
});

await check("deleteMyAccount goes through finishAccountDeletion with the real PostHog delete", () => {
  const src = readFileSync(new URL("../src/lib/account.functions.ts", import.meta.url), "utf8");
  assert.match(src, /import\("\.\/posthogPersons\.server"\)/);
  assert.match(src, /finishAccountDeletion\(\s*\{[^}]*deletePostHogPerson\s*\}/);
  // The auth user is deleted only inside finishAccountDeletion, so it can't
  // drift back out of order.
  assert.equal(src.match(/auth\.admin\.deleteUser/g)?.length, 1);
  assert.match(src, /deleteAuthUser: \(id\) => supabaseAdmin\.auth\.admin\.deleteUser\(id\)/);
});

// ---------------- the PostHog request ----------------

await check("asks PostHog to delete the person, their events and recordings, by hashed id", async () => {
  process.env.POSTHOG_PERSONS_API_KEY = "phx_test_key";
  const calls = stubFetch(() => new Response("{}", { status: 202 }));
  try {
    const out = await deletePostHogPerson(USER);
    assert.deepEqual(out, { ok: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://us.posthog.com/api/projects/516103/persons/bulk_delete/");
    assert.equal(calls[0].init.method, "POST");
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer phx_test_key");
    const body = JSON.parse(String(calls[0].init.body));
    assert.deepEqual(body, {
      distinct_ids: [await hashUserId(USER)],
      delete_events: true,
      delete_recordings: true,
    });
    // Never the raw account id.
    assert.ok(!String(calls[0].init.body).includes(USER));
  } finally { restore(); }
});

await check("no key configured: nothing is sent, and it is logged", async () => {
  const calls = stubFetch(() => new Response("{}", { status: 202 }));
  const logs = quiet();
  try {
    assert.deepEqual(await deletePostHogPerson(USER), { ok: false, reason: "not_configured" });
    assert.equal(calls.length, 0);
    assert.ok(logs.some((l) => l.includes("POSTHOG_PERSONS_API_KEY not set")));
  } finally { restore(); }
});

await check("PostHog error or outage: reported, never thrown, no id in the log", async () => {
  process.env.POSTHOG_PERSONS_API_KEY = "phx_test_key";
  const hashed = (await hashUserId(USER))!;
  const logs = quiet();
  try {
    stubFetch(() => new Response("nope", { status: 403 }));
    assert.deepEqual(await deletePostHogPerson(USER), { ok: false, reason: "http_403" });
    stubFetch(() => { throw new Error("network down"); });
    assert.deepEqual(await deletePostHogPerson(USER), { ok: false, reason: "request_failed" });
    assert.ok(logs.length >= 2);
    for (const l of logs) {
      assert.ok(!l.includes(USER) && !l.includes(hashed), `log leaked an id: ${l}`);
    }
  } finally { restore(); }
});

if (failed) process.exit(1);
