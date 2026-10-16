/**
 * Token redaction — nothing credential-shaped may reach PostHog, the profile's
 * signup attribution, or Brevo.
 *
 *   npm run test:url-scrub
 *
 * Runs the REAL scrubber (src/lib/urlScrub.ts — the same functions analytics.ts
 * hands to posthog.init as sanitize_properties / before_send, and that
 * attribution.ts applies to first-touch data) against a PostHog-shaped payload
 * for every route that carries a token or signature in its path. The single
 * assertion that matters: the secret does not appear ANYWHERE in the
 * serialized result.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge. Every token below is a dummy.
 */
import assert from "node:assert/strict";
import {
  redactSecrets, redactTokenPaths, sanitizeAnalyticsEvent, sanitizeAnalyticsProperties, scrubUrl,
} from "@/lib/urlScrub";
import { ERROR_MESSAGE_MAX, scrubErrorMessage, scrubExceptionProperties } from "@/lib/errorScrub";
import {
  captureServerException, isExpectedServerError, jwtSubject, parseStackFrames,
} from "@/lib/errorTelemetry";
import { routeShapeFromPath } from "@/lib/errorTags";
import { hashUserId } from "@/lib/userHash";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const ORIGIN = "https://app.thekyaproject.com";
// Same shape as the real thing: sits.invite_token is two dash-less UUIDs.
const TOKEN = "0123456789abcdef0123456789abcdeffedcba9876543210fedcba9876543210";
const SIG = "c2lnbmF0dXJlLWR1bW15LXZhbHVlLTAwMDAwMDAwMDA";
const BIRD = "df4c89f5-0be0-4df2-9ecf-e6818fa7471d";
const USER = "0696b18f-681b-489b-9301-9074cb3f3ac4";
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkdW1teS1zdWJqZWN0In0.ZHVtbXktc2lnbmF0dXJl";

/** Every route with a credential in the path → [path, expected redacted path, secrets]. */
const TOKEN_ROUTES: Array<{ name: string; path: string; expected: string; secrets: string[] }> = [
  { name: "sitter today", path: `/sitter/${TOKEN}`, expected: "/sitter/[token]", secrets: [TOKEN] },
  { name: "sitter home", path: `/sitter/${TOKEN}/home`, expected: "/sitter/[token]/home", secrets: [TOKEN] },
  { name: "sitter guide", path: `/sitter/${TOKEN}/guide`, expected: "/sitter/[token]/guide", secrets: [TOKEN] },
  { name: "sitter scan", path: `/sitter/${TOKEN}/scan`, expected: "/sitter/[token]/scan", secrets: [TOKEN] },
  { name: "sitter concern", path: `/sitter/${TOKEN}/concern`, expected: "/sitter/[token]/concern", secrets: [TOKEN] },
  { name: "sitter emergency", path: `/sitter/${TOKEN}/emergency`, expected: "/sitter/[token]/emergency", secrets: [TOKEN] },
  { name: "sitter care sheet", path: `/sitter/${TOKEN}/care-sheet`, expected: "/sitter/[token]/care-sheet", secrets: [TOKEN] },
  { name: "household invite", path: `/invite/${TOKEN}`, expected: "/invite/[token]", secrets: [TOKEN] },
  { name: "bird handoff", path: `/handoff/${TOKEN}`, expected: "/handoff/[token]", secrets: [TOKEN] },
  {
    name: "signed weight chart",
    path: `/api/public/chart/${BIRD}/2026-09/${SIG}`,
    expected: "/api/public/chart/[birdId]/[month]/[sig]",
    secrets: [SIG], // the bird id is an identifier, not a credential (it's in the query below too)
  },
  {
    name: "signed unsubscribe",
    path: `/api/public/unsubscribe/onboarding/${USER}/${SIG}`,
    expected: "/api/public/unsubscribe/onboarding/[userId]/[sig]",
    secrets: [SIG, USER],
  },
];

/** What posthog-js actually builds for a pageview on `path`, URL props everywhere. */
function pageviewPayload(path: string) {
  const url = `${ORIGIN}${path}?birdId=${BIRD}`;
  return {
    token: "phc_dummy_project_key",
    distinct_id: "anon-1",
    $current_url: url,
    $pathname: path,
    $host: "app.thekyaproject.com",
    $referrer: url,
    $referring_domain: "app.thekyaproject.com",
    $prev_pageview_pathname: path,
    $session_entry_url: url,
    $session_entry_pathname: path,
    $session_entry_referrer: url,
    title: `Sitter access — Kya & Co. (${path})`,
    $web_vitals_LCP_event: { $current_url: url, attribution: { url, element: "img.hero" } },
    $set: { $current_url: url, $pathname: path, $referrer: url },
    $set_once: {
      $initial_current_url: url,
      $initial_pathname: path,
      $initial_referrer: url,
      $initial_referring_domain: "app.thekyaproject.com",
    },
    // A token route riding inside another URL's query string, raw and encoded.
    redirect_raw: `/auth?redirect=${path}`,
    redirect_encoded: `${ORIGIN}/auth?redirect=${encodeURIComponent(path)}`,
    history: [url, path],
  };
}

console.log("token routes → PostHog payload");
for (const r of TOKEN_ROUTES) {
  check(`${r.name}: no secret survives sanitize_properties`, () => {
    const out = JSON.stringify(sanitizeAnalyticsProperties(pageviewPayload(r.path)));
    for (const s of r.secrets) assert.ok(!out.includes(s), `secret leaked: …${s.slice(0, 8)}`);
  });
  check(`${r.name}: no secret survives before_send (top-level $set / $set_once)`, () => {
    const p = pageviewPayload(r.path);
    const event = { event: "$pageview", properties: p, $set: p.$set, $set_once: p.$set_once };
    const out = JSON.stringify(sanitizeAnalyticsEvent(event));
    for (const s of r.secrets) assert.ok(!out.includes(s), `secret leaked: …${s.slice(0, 8)}`);
  });
  check(`${r.name}: groups by route as ${r.expected}`, () => {
    const out = sanitizeAnalyticsProperties(pageviewPayload(r.path));
    assert.equal(out.$pathname, r.expected);
    assert.equal(out.$set_once.$initial_pathname, r.expected);
    assert.equal(out.$current_url, `${ORIGIN}${r.expected}?birdId=${BIRD}`);
  });
}

console.log("auth material");
check("Supabase implicit-flow fragment is dropped", () => {
  const url = `${ORIGIN}/welcome#access_token=${JWT}&refresh_token=abcdefgh12345678&type=signup`;
  const out = sanitizeAnalyticsProperties({ $current_url: url, $set_once: { $initial_current_url: url } });
  assert.equal(out.$current_url, `${ORIGIN}/welcome`);
  assert.equal(out.$set_once.$initial_current_url, `${ORIGIN}/welcome`);
});
check("token-ish query params are redacted, others kept", () => {
  const out = scrubUrl(`${ORIGIN}/auth?token_hash=abc123def456&type=recovery&code=xyz789&utm_source=tiktok`);
  assert.equal(out, `${ORIGIN}/auth?token_hash=REDACTED&type=recovery&code=REDACTED&utm_source=tiktok`);
});
check("signed Storage URL in web-vitals attribution loses its token", () => {
  const signed = `https://x.supabase.co/storage/v1/object/sign/bird-photos/${USER}/photo.jpg?token=${JWT}`;
  const out = JSON.stringify(sanitizeAnalyticsProperties({ $web_vitals_LCP_event: { attribution: { url: signed } }, note: signed }));
  assert.ok(!out.includes(JWT) && !out.includes("eyJ"));
});
check("a bare JWT in any string is redacted", () => {
  assert.equal(redactSecrets(`Bearer ${JWT}`), "Bearer [jwt]");
});

console.log("first-touch attribution (→ profiles.signup_* and Brevo SIGNUP_*)");
check("invitee landing page and referrer are stored without the token", () => {
  // Exactly what attribution.ts stores: scrubUrl(pathname + search), scrubUrl(referrer).
  assert.equal(scrubUrl(`/invite/${TOKEN}?utm_source=email`), "/invite/[token]?utm_source=email");
  assert.equal(scrubUrl(`${ORIGIN}/handoff/${TOKEN}`), `${ORIGIN}/handoff/[token]`);
  assert.equal(scrubUrl(`${ORIGIN}/sitter/${TOKEN}/home`), `${ORIGIN}/sitter/[token]/home`);
});

console.log("no collateral damage");
check("ordinary routes and ids are untouched", () => {
  for (const p of [
    "/", "/dashboard", "/auth", "/get", `/birds/${BIRD}`, `/birds/${BIRD}/handoff`,
    `/birds/${BIRD}/view-as-sitter`, `/sits/${BIRD}`, "/household", "/privacy",
  ]) assert.equal(scrubUrl(p), p, p);
});
check("UTMs and plain values pass through", () => {
  const props = { utm_source: "tiktok", utm_campaign: "app_launch", bird_count: 2, surface: "sitter", ok: true, n: null };
  assert.deepEqual(sanitizeAnalyticsProperties(props), props);
});
check("# in non-URL text is kept", () => {
  assert.equal(sanitizeAnalyticsProperties({ label: "Scan #3" }).label, "Scan #3");
});
check("redaction is idempotent", () => {
  for (const r of TOKEN_ROUTES) {
    const once = redactTokenPaths(`${ORIGIN}${r.path}`);
    assert.equal(redactTokenPaths(once), once);
    assert.equal(scrubUrl(scrubUrl(`${ORIGIN}${r.path}`)), scrubUrl(`${ORIGIN}${r.path}`));
  }
});
check("input is not mutated by sanitize_properties", () => {
  const p = pageviewPayload(`/sitter/${TOKEN}`);
  const before = JSON.stringify(p);
  sanitizeAnalyticsProperties(p);
  assert.equal(JSON.stringify(p), before);
});

// ---------------- error reports ($exception) ----------------

// Realistic things a message can quote back at us. All dummies.
const HEALTH_NOTE = "Kiwi plucking chest feathers since Tuesday, vet suspects giardia";
const BIRD_NAME = "Kiwi";
const OWNER_EMAIL = "owner.person@example.com";
const WEIGHT = "412";

console.log("error messages");
check("Postgres 'Failing row contains' drops the whole row", () => {
  const msg = `new row for relation "care_plans" violates check constraint "x" Failing row contains (${BIRD_NAME}, ${HEALTH_NOTE}, ${WEIGHT}).`;
  const out = scrubErrorMessage(msg);
  assert.ok(!out.includes(HEALTH_NOTE) && !out.includes(BIRD_NAME) && !out.includes(WEIGHT), out);
  assert.match(out, /Failing row contains \[row redacted\]/);
  assert.match(out, /care_plans/); // the useful part survives
});
check("Postgres 'Key (…)=(…)' keeps the column, drops the value", () => {
  const out = scrubErrorMessage(`duplicate key value violates unique constraint "profiles_email_key" Key (email)=(${OWNER_EMAIL}) already exists.`);
  assert.ok(!out.includes(OWNER_EMAIL), out);
  assert.match(out, /Key \(email\)=\[value redacted\]/);
});
check("DETAIL / HINT lines are dropped", () => {
  const out = scrubErrorMessage(`insert failed\nDETAIL: ${HEALTH_NOTE}\nHINT: ${BIRD_NAME}`);
  assert.ok(!out.includes(HEALTH_NOTE) && !out.includes(BIRD_NAME), out);
});
check("quoted input is dropped", () => {
  const out = scrubErrorMessage(`invalid input syntax for type uuid: "${HEALTH_NOTE}"`);
  assert.ok(!out.includes(HEALTH_NOTE), out);
});
check("emails are dropped", () => {
  const out = scrubErrorMessage(`could not send invite to ${OWNER_EMAIL}`);
  assert.equal(out, "could not send invite to [email]");
});
check("tokens and JWTs in a message are dropped", () => {
  const out = scrubErrorMessage(`fetch /sitter/${TOKEN}/scan failed with Bearer ${JWT}`);
  assert.ok(!out.includes(TOKEN) && !out.includes(JWT), out);
});
check(`messages are capped at ${ERROR_MESSAGE_MAX} characters`, () => {
  const out = scrubErrorMessage("x".repeat(5000));
  assert.equal(out.length, ERROR_MESSAGE_MAX);
});
check("ordinary messages pass through", () => {
  assert.equal(scrubErrorMessage("Cannot read properties of undefined (reading 'map')"), "Cannot read properties of undefined (reading 'map')");
});
check("scrubbing is idempotent", () => {
  const once = scrubErrorMessage(`Failing row contains (${HEALTH_NOTE}) for ${OWNER_EMAIL} at /invite/${TOKEN}`);
  assert.equal(scrubErrorMessage(once), once);
});

console.log("client $exception event (what before_send sends)");
check("message, URL and person props are all scrubbed", () => {
  const url = `${ORIGIN}/sitter/${TOKEN}/scan`;
  const event = {
    event: "$exception",
    properties: {
      $exception_list: [{ type: "Error", value: `Failing row contains (${HEALTH_NOTE}) for ${OWNER_EMAIL}`, stacktrace: { type: "resolved", frames: [{ filename: `${ORIGIN}/assets/index-abc.js`, function: "save" }] } }],
      $exception_message: `Failing row contains (${HEALTH_NOTE})`,
      $exception_values: [`Failing row contains (${HEALTH_NOTE})`],
      $current_url: url,
      $pathname: `/sitter/${TOKEN}/scan`,
      route: "/sitter/$token/scan",
      user_role: "sitter",
    },
    $set_once: { $initial_current_url: url },
  };
  const out = sanitizeAnalyticsEvent(event as any);
  scrubExceptionProperties(out.properties);
  const json = JSON.stringify(out);
  for (const secret of [TOKEN, HEALTH_NOTE, OWNER_EMAIL]) assert.ok(!json.includes(secret), `leaked …${secret.slice(0, 10)}`);
  // Tags survive (the scrubber normalises the token placeholder; harmless).
  assert.equal(out.properties.route, "/sitter/[token]/scan");
  assert.equal(out.properties.user_role, "sitter");
});

console.log("server error helpers");
check("route shapes never carry ids or tokens", () => {
  assert.equal(routeShapeFromPath(`/sitter/${TOKEN}/scan`), "/sitter/$token/scan");
  assert.equal(routeShapeFromPath(`/birds/${BIRD}/weight?tab=x`), "/birds/$id/weight");
  assert.equal(routeShapeFromPath(`/api/public/chart/${BIRD}/2026-09/${SIG}`), "/api/public/chart/$id/2026-09/$secret");
});
check("expected failures are not reported", () => {
  assert.ok(isExpectedServerError(new Error("SITTER_LINK_EXPIRED")));
  assert.ok(isExpectedServerError(new Error("Unauthorized: No authorization header provided")));
  assert.ok(isExpectedServerError({ isNotFound: true }));
  assert.ok(isExpectedServerError(new Error("This is a read-only preview — changes aren't saved.")));
  assert.ok(isExpectedServerError(new Response(null, { status: 307 })));
  assert.ok(isExpectedServerError({ statusCode: 404, message: "x" }));
  assert.ok(!isExpectedServerError(new Error("Cannot read properties of undefined")));
  assert.ok(!isExpectedServerError({ statusCode: 500, message: "x" }));
});
check("JWT subject decodes, non-JWT bearer does not", () => {
  const payload = Buffer.from(JSON.stringify({ sub: USER })).toString("base64url");
  assert.equal(jwtSubject(`Bearer x.${payload}.y`), USER);
  assert.equal(jwtSubject("Bearer cron-shared-secret"), null);
  assert.equal(jwtSubject(null), null);
});
check("stack frames parse oldest-first, node_modules marked not-in-app", () => {
  const stack = "Error: boom\n    at inner (/var/task/chunks/a.mjs:10:5)\n    at outer (/var/task/node_modules/h3/dist/index.mjs:3:1)";
  const frames = parseStackFrames(stack);
  assert.equal(frames.length, 2);
  assert.equal(frames[1].function, "inner");
  assert.equal(frames[1].in_app, true);
  assert.equal(frames[0].in_app, false);
});

async function checkAsync(name: string, fn: () => Promise<void>) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

/** Run captureServerException with fetch stubbed; return what it would POST. */
async function capturedPayload(err: unknown, ctx: Parameters<typeof captureServerException>[1]) {
  const sent: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    if (init?.body) sent.push(init.body);
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
  try {
    await captureServerException(err, ctx);
  } finally {
    globalThis.fetch = realFetch;
  }
  return sent;
}

(async () => {
  // Outside Vercel the server reporter sends nothing; force the real send path
  // (fetch is stubbed below, so nothing leaves this machine).
  (globalThis as Record<string, unknown>).__KYA_FORCE_ERROR_TELEMETRY__ = true;
  console.log("server $exception payload (the real POST body)");
  await checkAsync("a sitter-route crash carries no token, row data or email", async () => {
    const err = new Error(`Failing row contains (${BIRD_NAME}, ${HEALTH_NOTE}, ${WEIGHT}) for ${OWNER_EMAIL} on /sitter/${TOKEN}`);
    const [body] = await capturedPayload(err, {
      route: routeShapeFromPath(`/sitter/${TOKEN}/scan`),
      data: { token: TOKEN, birdId: BIRD, notes: HEALTH_NOTE },
      mechanism: "server_fn_middleware",
    });
    assert.ok(body, "nothing was sent");
    for (const secret of [TOKEN, HEALTH_NOTE, OWNER_EMAIL, `${BIRD_NAME},`]) {
      assert.ok(!body.includes(secret), `leaked …${secret.slice(0, 10)}`);
    }
    const parsed = JSON.parse(body);
    assert.equal(parsed.event, "$exception");
    assert.equal(parsed.distinct_id, "server"); // sitters get no person
    assert.equal(parsed.properties.user_role, "sitter");
    assert.equal(parsed.properties.platform, "server");
    assert.equal(parsed.properties.$process_person_profile, false);
  });
  await checkAsync("a signed-in crash uses the hashed id, never the raw one", async () => {
    const payload = Buffer.from(JSON.stringify({ sub: USER })).toString("base64url");
    const [body] = await capturedPayload(new Error("boom"), {
      route: "serverfn:saveWeight",
      authorization: `Bearer x.${payload}.y`,
      mechanism: "server_fn_middleware",
    });
    const parsed = JSON.parse(body);
    assert.equal(parsed.distinct_id, await hashUserId(USER));
    assert.ok(!body.includes(USER), "raw user id leaked");
    assert.ok(!body.includes("Bearer"), "authorization header leaked");
  });
  await checkAsync("the same error object is reported once", async () => {
    const err = new Error("once");
    const first = await capturedPayload(err, { route: "x", mechanism: "server_fn_middleware" });
    const second = await capturedPayload(err, { route: "x", mechanism: "request_middleware" });
    assert.equal(first.length, 1);
    assert.equal(second.length, 0);
  });
  await checkAsync("expected errors send nothing", async () => {
    const sent = await capturedPayload(new Error("SITTER_LINK_REVOKED"), { route: "x", mechanism: "server_fn_middleware" });
    assert.equal(sent.length, 0);
  });
  await checkAsync("a PostHog outage never throws into the request", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
    const realError = console.error;
    console.error = () => {};
    try {
      await captureServerException(new Error("boom-outage"), { route: "x", mechanism: "server_route" });
    } finally {
      globalThis.fetch = realFetch;
      console.error = realError;
    }
  });

  console.log(`\n${passed} passed${process.exitCode ? " — WITH FAILURES" : ""}`);
})();

