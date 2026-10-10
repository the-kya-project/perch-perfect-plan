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

console.log(`\n${passed} passed${process.exitCode ? " — WITH FAILURES" : ""}`);
