/**
 * Vercel previews never reach production's outside services.
 *
 *   npm run test:preview-services
 *
 * Pins the runtime guards: in a preview (VERCEL_ENV=preview) Brevo refuses to
 * send even when a key is present, and server error reports send nothing to
 * PostHog. fetch is stubbed throughout, so nothing leaves this machine; the
 * assertion is that it is never called. The build-time half (no PostHog key in
 * a preview bundle) is checked against real builds, see the PR.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { sendTransactionalEmail } from "@/lib/brevoEmail.server";
import { captureServerException } from "@/lib/errorTelemetry";
import { DEPLOY_ENV, POSTHOG_PROJECT_KEY } from "@/lib/deployEnv";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

/** Run fn with VERCEL_ENV and Brevo env set, counting fetch calls. */
async function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>): Promise<number> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response("{}", { status: 201 }); }) as typeof fetch;
  try { await fn(); } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
  return calls;
}

const EMAIL = { to: "someone@kya-test.invalid", subject: "s", htmlContent: "<p>x</p>", tag: "sit_assigned" as const };
const BREVO = { BREVO_API_KEY: "xkeysib-test", BREVO_SENDER_EMAIL: "hello@kya-test.invalid" };

(async () => {
  console.log("deploy environment");
  await check("a local build is development and carries no PostHog key", () => {
    assert.equal(DEPLOY_ENV, "development");
    assert.equal(POSTHOG_PROJECT_KEY, null);
  });

  console.log("Brevo");
  await check("a preview refuses to send even with a key and sender set", async () => {
    let res: Awaited<ReturnType<typeof sendTransactionalEmail>> | undefined;
    const calls = await withEnv({ VERCEL_ENV: "preview", ...BREVO }, async () => { res = await sendTransactionalEmail(EMAIL as never); });
    assert.equal(calls, 0, "fetch was called");
    assert.equal(res?.ok, false);
    assert.equal(res?.skipped, "preview-deployment");
  });
  await check("no key: skipped quietly, no throw", async () => {
    let res: Awaited<ReturnType<typeof sendTransactionalEmail>> | undefined;
    const calls = await withEnv({ VERCEL_ENV: "production", BREVO_API_KEY: undefined, BREVO_SENDER_EMAIL: undefined }, async () => { res = await sendTransactionalEmail(EMAIL as never); });
    assert.equal(calls, 0);
    assert.equal(res?.skipped, "brevo-api-key-not-configured");
  });

  console.log("PostHog server error reports");
  await check("a preview sends nothing", async () => {
    const calls = await withEnv({ VERCEL_ENV: "preview" }, () =>
      captureServerException(new Error("boom"), { route: "serverfn:x", mechanism: "server_fn_middleware" }));
    assert.equal(calls, 0);
  });
  await check("a build without the production key sends nothing even when VERCEL_ENV says production", async () => {
    const calls = await withEnv({ VERCEL_ENV: "production" }, () =>
      captureServerException(new Error("boom2"), { route: "serverfn:x", mechanism: "server_fn_middleware" }));
    assert.equal(calls, 0);
  });

  console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
})();
