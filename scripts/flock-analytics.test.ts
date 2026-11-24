/**
 * The Flock's stickiness events (src/lib/flockAnalytics.ts, payments plan build E).
 *
 *   npm run test:flock-analytics
 *
 * Pins the promises:
 *  - nothing is sent for anyone outside the Flock (a free account, a signed-out
 *    visitor, a status read that fails), for any event;
 *  - members and admins send, with only the allowed keys: no text, titles,
 *    names, photos or bird ids, whatever a caller passes;
 *  - admin and test accounts are marked internal;
 *  - flock_active goes out once per account per Flock day;
 *  - only Flock code imports the module, and the care app's files are unchanged
 *    in what they import (so free users load none of it).
 *
 * Plain asserts (the repo has no test runner). Exits non-zero on failure.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  FLOCK_EVENT_PROPS, __setFlockAnalyticsDepsForTests, flockContext, flockDay, flockEventProps, isTestEmail,
  trackFlock, trackFlockActive, trackFlockJoined, JOIN_SOURCES, joinSource, type FlockContext, type FlockEventName,
} from "@/lib/flockAnalytics";

let passed = 0;
const failures: string[] = [];
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; } catch (e) { failures.push(`${name}: ${e instanceof Error ? e.message : String(e)}`); }
}

const FREE = { isAdmin: false, isMember: false, email: "someone@gmail.com", regionSlug: null, entitlements: [] };
const ALL_EVENTS = Object.keys(FLOCK_EVENT_PROPS) as FlockEventName[];
const NOW = new Date("2027-02-01T15:00:00Z");

// Every kind of content a careless caller could pass. None may ever be sent.
const CONTENT = {
  body: "Kiwi finally stepped up today!", title: "Big day", caption: "so proud", text: "hello",
  bird_name: "Kiwi", bird_id: "0b6f6f7e-1111-2222-3333-444455556666", display_name: "Brit", photo_path: "u/1.jpg",
  photo_url: "https://x/y.jpg", email: "a@b.com", note: "call me", comment: "nice", custom_name: "Shoulder training",
  milestones: "Touch the perch", region_name: "Pacific Northwest",
};

function sentRecorder() {
  const sent: { name: string; props: Record<string, unknown> }[] = [];
  const people: Record<string, unknown>[] = [];
  return {
    sent, people,
    deps: {
      send: (name: string, props?: Record<string, unknown>) => { sent.push({ name, props: props ?? {} }); },
      setPerson: (p: Record<string, unknown>) => { people.push(p); },
    },
  };
}

async function main() {
  // ---- Who counts --------------------------------------------------------
  await check("a free account (no membership, not admin) has no context", () => {
    assert.equal(flockContext(FREE), null);
  });
  await check("an entitlement that isn't a membership yet still sends nothing when is_flock_member is false", () => {
    assert.equal(flockContext({ ...FREE, entitlements: [{ plan: "founding", source: "founding", status: "active", starts_at: "2027-01-04T06:00:00Z" }], now: new Date("2026-12-01") }), null);
  });
  await check("no context → no properties for every event", () => {
    for (const e of ALL_EVENTS) assert.equal(flockEventProps(null, e, { space: "learn" }), null, e);
  });
  await check("a founder: founding, founder true, their chapter", () => {
    const c = flockContext({ isAdmin: false, isMember: true, email: "f@gmail.com", regionSlug: "pacific-northwest", now: NOW,
      entitlements: [{ plan: "founding", source: "founding", status: "active", starts_at: "2027-01-04T06:00:00Z" }] })!;
    assert.equal(c.membership, "founding"); assert.equal(c.founder, true); assert.equal(c.chapter, "pacific-northwest");
    assert.equal(c.internal, false); assert.equal(c.is_admin, false);
  });
  await check("a gift holder in the free season: free_season membership, gift_holder true", () => {
    const c = flockContext({ isAdmin: false, isMember: true, email: "g@gmail.com", regionSlug: "southeast", now: NOW, entitlements: [
      { plan: "annual", source: "gift", status: "active", starts_at: "2027-07-06T04:00:00Z" },
      { plan: "comp", source: "free_season", status: "active", starts_at: "2027-01-04T06:00:00Z" },
    ] })!;
    assert.equal(c.gift_holder, true); assert.equal(c.free_season, true); assert.equal(c.membership, "gift");
  });
  await check("a free-season member", () => {
    const c = flockContext({ isAdmin: false, isMember: true, email: "s@gmail.com", regionSlug: null, now: NOW,
      entitlements: [{ plan: "comp", source: "free_season", status: "active", starts_at: "2027-01-04T06:00:00Z" }] })!;
    assert.equal(c.membership, "free_season"); assert.equal(c.chapter, "none"); assert.equal(c.founder, false);
  });
  await check("an admin with no membership: internal, membership admin", () => {
    const c = flockContext({ isAdmin: true, isMember: false, email: "staff@gmail.com", regionSlug: "midwest", entitlements: [] })!;
    assert.equal(c.membership, "admin"); assert.equal(c.internal, true); assert.equal(c.is_admin, true);
  });
  await check("test accounts are internal", () => {
    for (const e of ["staging-owner@example.com", "x@checks.invalid", "me+test@gmail.com", "qa@foo.test"]) assert.equal(isTestEmail(e), true, e);
    for (const e of ["someone@gmail.com", "vet@clinic.com", null]) assert.equal(isTestEmail(e), false, String(e));
    const c = flockContext({ isAdmin: false, isMember: true, email: "staging-free@example.com", regionSlug: null, entitlements: [] })!;
    assert.equal(c.internal, true);
  });

  // ---- What's sent -------------------------------------------------------
  const member: FlockContext = flockContext({ isAdmin: false, isMember: true, email: "m@gmail.com", regionSlug: "northeast", now: NOW,
    entitlements: [{ plan: "comp", source: "free_season", status: "active", starts_at: "2027-01-04T06:00:00Z" }] })!;
  await check("no event carries content, whatever the caller passes", () => {
    for (const e of ALL_EVENTS) {
      const out = flockEventProps(member, e, { ...CONTENT, space: "learn", kind: "great_job" })!;
      for (const k of Object.keys(CONTENT)) assert.ok(!(k in out), `${e} sent ${k}`);
      for (const v of Object.values(out)) assert.ok(typeof v !== "string" || !/\s/.test(v), `${e} sent text: ${v}`);
    }
  });
  await check("each event carries only its allowed keys plus the member context", () => {
    const base = new Set([...Object.keys(member), "platform"]);
    for (const e of ALL_EVENTS) {
      const out = flockEventProps(member, e, { space: "learn", template: "step-up", answer: "going", resource_type: "guide" })!;
      for (const k of Object.keys(out)) assert.ok(base.has(k) || (FLOCK_EVENT_PROPS[e] as readonly string[]).includes(k), `${e}: ${k}`);
    }
  });
  await check("a free-text value is dropped even under an allowed key", () => {
    const out = flockEventProps(member, "flock_journey_started", { template: "Shoulder training with Kiwi", visibility: "private" })!;
    assert.ok(!("template" in out)); assert.equal(out.visibility, "private");
  });
  await check("the allowlists name no content-shaped key", () => {
    for (const [e, keys] of Object.entries(FLOCK_EVENT_PROPS)) {
      for (const k of keys) assert.ok(!/body|title|text|caption|name|photo_path|url|email|note|bird_id|user/.test(k), `${e}: ${k}`);
    }
  });
  await check("every Flock event is a declared analytics event", () => {
    const src = readFileSync("src/lib/analytics.ts", "utf8");
    for (const e of ALL_EVENTS) assert.ok(src.includes(`| "${e}"`), e);
  });

  // ---- Sending, end to end ---------------------------------------------------
  await check("a free account sends nothing for any event (and sets no person properties)", async () => {
    const r = sentRecorder();
    __setFlockAnalyticsDepsForTests({ ...r.deps, loadContext: async () => flockContext(FREE), userId: async () => "free-user" });
    for (const e of ALL_EVENTS) await trackFlock(e, { space: "learn" });
    await trackFlockJoined("care_app");
    await trackFlockActive(NOW);
    assert.equal(r.sent.length, 0); assert.equal(r.people.length, 0);
  });
  await check("a signed-out visitor sends nothing", async () => {
    const r = sentRecorder();
    __setFlockAnalyticsDepsForTests({ ...r.deps, loadContext: async () => null, userId: async () => null });
    for (const e of ALL_EVENTS) await trackFlock(e);
    await trackFlockActive(NOW);
    assert.equal(r.sent.length, 0);
  });
  await check("a failed status read sends nothing", async () => {
    const r = sentRecorder();
    __setFlockAnalyticsDepsForTests({ ...r.deps, loadContext: async () => { throw new Error("offline"); }, userId: async () => "u1" });
    for (const e of ALL_EVENTS) await trackFlock(e);
    await trackFlockActive(NOW);
    assert.equal(r.sent.length, 0);
  });
  await check("a member sends, with the member context and person properties", async () => {
    const r = sentRecorder();
    __setFlockAnalyticsDepsForTests({ ...r.deps, loadContext: async () => member, userId: async () => "member-1" });
    await trackFlock("flock_post_created", { space: "good", has_photo: true, body: "secret" });
    assert.equal(r.sent.length, 1);
    assert.equal(r.sent[0].name, "flock_post_created");
    assert.equal(r.sent[0].props.space, "good"); assert.equal(r.sent[0].props.chapter, "northeast");
    assert.equal(r.sent[0].props.membership, "free_season"); assert.equal(r.sent[0].props.internal, false);
    assert.ok(!("body" in r.sent[0].props));
    assert.equal(r.people.length, 1); assert.equal(r.people[0].flock_member, true); assert.equal(r.people[0].flock_internal, false);
  });
  await check("flock_active: once per account per Flock day", async () => {
    const r = sentRecorder();
    __setFlockAnalyticsDepsForTests({ ...r.deps, loadContext: async () => member, userId: async () => "member-2" });
    await trackFlockActive(NOW);
    await trackFlockActive(NOW);
    await trackFlockActive(new Date(NOW.getTime() + 60_000));
    assert.equal(r.sent.filter((s) => s.name === "flock_active").length, 1);
    await trackFlockActive(new Date(NOW.getTime() + 24 * 3600_000));
    assert.equal(r.sent.filter((s) => s.name === "flock_active").length, 2);
  });
  await check("the Flock day is Eastern (11:30 PM Eastern is still that day)", () => {
    assert.equal(flockDay(new Date("2027-02-02T04:30:00Z")), "2027-02-01");
    assert.equal(flockDay(new Date("2027-02-02T05:30:00Z")), "2027-02-02");
  });
  await check("an admin's events are marked internal", async () => {
    const r = sentRecorder();
    const admin = flockContext({ isAdmin: true, isMember: false, email: "staff@gmail.com", regionSlug: null, entitlements: [] });
    __setFlockAnalyticsDepsForTests({ ...r.deps, loadContext: async () => admin, userId: async () => "admin-1" });
    await trackFlock("flock_reaction_added", { subject_type: "post", kind: "love_this" });
    assert.equal(r.sent[0].props.internal, true); assert.equal(r.people[0].flock_internal, true);
  });

  // ---- Joining (build C) -----------------------------------------------------
  const PENDING = { isAdmin: false, isMember: false, email: "new@gmail.com", regionSlug: "texas",
    entitlements: [{ plan: "comp", source: "free_season", status: "active", starts_at: "2027-01-05T06:00:00Z" }], now: new Date("2026-12-20T15:00:00Z") };
  await check("a joiner whose membership starts on opening day counts for flock_joined only", async () => {
    assert.equal(flockContext(PENDING), null);
    const ctx = flockContext({ ...PENDING, allowPending: true });
    assert.ok(ctx); assert.equal(ctx!.membership, "free_season");
    const r = sentRecorder();
    __setFlockAnalyticsDepsForTests({ ...r.deps, loadContext: async (o?: { allowPending?: boolean }) => flockContext({ ...PENDING, allowPending: o?.allowPending }), userId: async () => "joiner-1" });
    await trackFlock("flock_post_created", { space: "learn" });
    await trackFlockActive(NOW);
    assert.equal(r.sent.length, 0);
    await trackFlockJoined("email");
    assert.equal(r.sent.length, 1); assert.equal(r.sent[0].name, "flock_joined"); assert.equal(r.sent[0].props.source, "email");
  });
  await check("flock_joined's source is one of the five, else care_app", async () => {
    assert.deepEqual([...JOIN_SOURCES], ["care_app", "email", "website", "founding", "gift"]);
    assert.equal(joinSource("gift"), "gift"); assert.equal(joinSource("newsletter jan"), "care_app"); assert.equal(joinSource(undefined), "care_app");
    const r = sentRecorder();
    __setFlockAnalyticsDepsForTests({ ...r.deps, loadContext: async () => member, userId: async () => "member-9" });
    await trackFlockJoined("https://evil.example/x");
    assert.equal(r.sent[0].props.source, "care_app");
  });

  // ---- Only Flock code loads it ---------------------------------------------
  const files: string[] = [];
  (function walk(dir: string) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(f)) files.push(relative(".", p));
    }
  })("src");
  const FLOCK_FILE = /^src\/(routes\/_authenticated\/(flock|admin)\.|components\/flock\/|components\/FlockShell\.tsx$|lib\/(flockAnalytics|flockPostData|journeyData|flockIdeas|flockEvents|flockJoin|flockChallenges)\.ts$)/;
  await check("only Flock code imports flockAnalytics", () => {
    for (const f of files) {
      if (/@\/lib\/flockAnalytics|\.\/flockAnalytics/.test(readFileSync(f, "utf8"))) assert.ok(FLOCK_FILE.test(f), `${f} imports flockAnalytics`);
    }
  });
  await check("the modules that send Flock events are imported only by Flock code", () => {
    const senders = /@\/lib\/(flockPostData|journeyData|flockIdeas|flockEvents|flockAnalytics)["']/;
    for (const f of files) if (senders.test(readFileSync(f, "utf8"))) assert.ok(FLOCK_FILE.test(f), `${f} imports a Flock event sender`);
  });
  await check("nothing calls track() with a Flock event directly", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const e of ALL_EVENTS) assert.ok(!src.includes(`track("${e}"`), `${f} calls track("${e}") instead of trackFlock`);
    }
  });

  __setFlockAnalyticsDepsForTests({});
  if (failures.length) {
    console.error(`FLOCK ANALYTICS: ${passed} passed, ${failures.length} failed`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`FLOCK ANALYTICS: ${passed} passed, 0 failed`);
}

void main();
