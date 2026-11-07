// The Community (Flock) shell, as an admin and as everyone else, against the
// production build with a made-up signed-in session (e2e/duo-mock.ts): nothing
// real is reached. Runs in the "iPhone hydration" job (e2e/flock.config.ts).
//
//   Routes: the five tabs, in order, with My birds last; the old /flock/spaces
//   and /flock/learn redirect; bad filter links fall back to the defaults.
//   Filters: every chip row and Chapter's sub-tabs change the selection and the
//   URL; the Library search reaches the URL.
//   Spaces sheet: focus moves in and stays in, Escape and a swipe down close it
//   (focus back on Spaces), picking a space opens Today filtered to it.
//   Duo / wide: the five Community tabs sit in the side column, no care tabs.
//   Non-admins: every /flock URL sends them Home, and no Community code loads.
import { test, expect, type Browser, type BrowserContext, type Page, type Route } from "@playwright/test";
import { devices } from "@playwright/test";
import { duoFixture } from "./duo-fixture";
import { mockDuo } from "./duo-mock";
import { readFileSync } from "node:fs";
import { MOCK } from "./helpers";

const { defaultBrowserType: _d, ...IPHONE } = devices["iPhone 13"];
const DUO = { viewport: { width: 951, height: 669 }, screen: { width: 951, height: 669 }, isMobile: true, hasTouch: true };

const REGIONS = [
  { slug: "california", name: "California", states: ["CA"], sort_order: 1 },
  { slug: "great-lakes", name: "Great Lakes", states: ["IL", "IN", "MI", "OH"], sort_order: 3 },
  { slug: "texas", name: "Texas", states: ["TX"], sort_order: 9 },
  { slug: "other", name: "Other region", states: [], sort_order: 10 },
];

/** The Community's own data, stateful so a save changes the next screen:
 *  the member's Flock profile and bird choices, the regions, chapters
 *  (counted from a few made-up neighbours), and their membership. */
type FlockState = {
  profile: Record<string, any> | null;
  shown: Map<string, boolean>;
  saves: Record<string, any>[];
  shownSaves: Record<string, any>[];
  /** Step 4: posts and comments, answered the way the database would. */
  posts: Record<string, any>[];
  comments: Record<string, any>[];
  calls: { fn: string; args: Record<string, any> }[];
  /** Make the next post or comment hit the hourly limit. */
  rateLimit: "posts" | "comments" | null;
  /** Step 4B: notifications and the review queue. */
  notifications: Record<string, any>[];
  queue: Record<string, any>[];
  /** Step 4C: today's idea (null = none) and the admin schedule. */
  idea: Record<string, any> | null;
  schedule: Record<string, any>[];
  /** Step 5: chapter events, the suggest rules, and RSVPs. */
  events: Record<string, any>[];
  eventRules: Record<string, any>;
  /** Step 5B: the Members tab and who leads. */
  roster?: Record<string, any>[];
  leadOf?: Record<string, string>;
};

async function mockFlock(context: BrowserContext, userId: string, opts: { setupDone: boolean; region?: string }): Promise<FlockState> {
  const state: FlockState = {
    profile: opts.setupDone || opts.region
      ? { user_id: userId, display_name: "Brittany K.", region_slug: opts.region ?? "great-lakes", bio: null, photo_path: null, setup_completed_at: opts.setupDone ? new Date().toISOString() : null }
      : null,
    shown: new Map(),
    saves: [],
    shownSaves: [],
    posts: [],
    comments: [],
    calls: [],
    rateLimit: null,
    notifications: [],
    queue: [],
    idea: null,
    schedule: [],
    events: [],
    eventRules: { region_slug: "great-lakes", region_name: "Great Lakes", member_count: 8, in_person_min: 15, in_person_open: false, can_manage: false },
  };
  const neighbours: Record<string, { user_id: string; display_name: string }[]> = {
    "great-lakes": [{ user_id: "00000000-0000-4000-8000-00000000c001", display_name: "Ada L." }],
    texas: [{ user_id: "00000000-0000-4000-8000-00000000c002", display_name: "Cy T." }, { user_id: "00000000-0000-4000-8000-00000000c003", display_name: "Dee R." }],
  };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  const wantsObject = (route: Route) => (route.request().headers()["accept"] ?? "").includes("vnd.pgrst.object");
  const membersOf = (slug: string) => [
    ...(neighbours[slug] ?? []).map((m) => ({ ...m, photo_path: null, is_founder: false, bird_names: ["Pip"] })),
    ...(state.profile?.region_slug === slug ? [{ user_id: userId, display_name: state.profile.display_name, photo_path: null, is_founder: true, bird_names: [] }] : []),
  ];

  await context.route(`${MOCK}/rest/v1/flock_profiles**`, async (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") return wantsObject(route) ? (state.profile ? json(route, state.profile) : json(route, { code: "PGRST116" }, 406)) : json(route, state.profile ? [state.profile] : []);
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const body = req.postDataJSON();
    state.saves.push(body);
    state.profile = { ...(state.profile ?? {}), ...body };
    return json(route, [], 201);
  });
  await context.route(`${MOCK}/rest/v1/flock_shown_birds**`, async (route) => {
    const req = route.request();
    if (req.method() === "GET") return json(route, [...state.shown].map(([bird_id, shown]) => ({ bird_id, shown })));
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const rows = req.postDataJSON() as { bird_id: string; shown: boolean }[];
    state.shownSaves.push(...rows);
    for (const r of rows) state.shown.set(r.bird_id, r.shown);
    return json(route, [], 201);
  });
  await context.route(`${MOCK}/rest/v1/regions**`, (route) => json(route, REGIONS));
  await context.route(`${MOCK}/rest/v1/entitlements**`, (route) =>
    json(route, [{ plan: "founding", status: "trialing", source: "founding", starts_at: null, current_period_end: null, free_until: null }]));
  await context.route(`${MOCK}/rest/v1/rpc/admin_*`, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/").pop()!;
    const args = (route.request().postDataJSON() ?? {}) as Record<string, any>;
    state.calls.push({ fn, args });
    if (fn === "admin_ideas_schedule") return json(route, state.schedule);
    if (fn === "admin_ideas_unscheduled") return json(route, []);
    if (fn === "admin_save_idea") return json(route, "00000000-0000-4000-8000-0000000082aa");
    return json(route, null);
  });
  await context.route(`${MOCK}/rest/v1/rpc/flock_*`, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/").pop();
    const args = (route.request().postDataJSON() ?? {}) as Record<string, any>;
    if (fn === "flock_my_setup") return json(route, [{ suggested_region: "great-lakes", founding_spot: 7, setup_completed_at: state.profile?.setup_completed_at ?? null }]);
    if (fn === "flock_chapter") {
      const r = REGIONS.find((x) => x.slug === args.p_region_slug);
      return json(route, r ? [{ region_slug: r.slug, name: r.name, states: r.states, member_count: membersOf(r.slug).length }] : []);
    }
    if (fn === "flock_chapter_members") return json(route, membersOf(args.p_region_slug));
    if (fn === "flock_chapter_roster") {
      return json(route, state.roster ?? membersOf(args.p_region_slug).map((m: any) => ({ user_id: m.user_id, display_name: m.display_name, photo_path: null,
        is_founder: m.is_founder, is_lead: false, birds: (m.bird_names ?? []).map((n: string) => ({ name: n, species: null })) })));
    }
    if (fn === "flock_chapter_lead_of") return json(route, state.leadOf?.[args.p_user_id] ?? null);
    if (fn === "flock_visible_birds") return json(route, []);
    if (fn === "flock_member_profile") {
      const r = (state.roster ?? []).find((m) => m.user_id === args.p_user_id);
      return json(route, r ? [{ user_id: r.user_id, display_name: r.display_name, region_slug: "great-lakes", region_name: "Great Lakes", region_states: ["IL", "IN", "MI", "OH"],
        bio: null, photo_path: null, is_founder: r.is_founder }] : []);
    }
    if (fn === "flock_enabled") return route.fallback();
    state.calls.push({ fn: fn!, args });
    const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
    const counts = (r: any) => ({ great_job: r.great_job ?? 0, been_there: r.been_there ?? 0, rooting_for_you: r.rooting_for_you ?? 0, love_this: r.love_this ?? 0, mine: r.mine ?? [] });
    const postRow = (p: any) => ({
      ...counts(p), post_id: p.post_id, author_id: p.author_id, author_name: p.author_name, author_region: p.author_region ?? "Great Lakes", author_photo_path: null,
      author_is_founder: false, space: p.space, region_slug: p.space === "chapter" ? "great-lakes" : null, region_name: p.space === "chapter" ? "Great Lakes" : null,
      title: p.title ?? null, body: p.body, photo_count: 0, bird_id: null, bird_name: null, bird_has_photo: false, status: p.status, review_note: null,
      created_at: p.created_at, edited_at: p.edited_at ?? null, is_mine: p.author_id === userId,
      comment_count: state.comments.filter((c) => c.subject_id === p.post_id).length,
    });
    if (fn === "flock_feed") {
      const visible = state.posts.filter((p) => p.status === "live" || p.author_id === userId)
        .filter((p) => args.p_space === "everything" || p.space === args.p_space)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return json(route, visible.map(postRow));
    }
    if (fn === "flock_post") { const p = state.posts.find((x) => x.post_id === args.p_post_id); return json(route, p ? [postRow(p)] : []); }
    if (fn === "flock_vet_signs") return json(route, ["fluffed up", "sleeping a lot", "isn't eating", "tail bobbing", "bleeding"]);
    if (fn === "flock_post_create") {
      if (state.rateLimit === "posts") return json(route, { code: "P0001", message: "rate_limited", details: "posts", hint: null }, 400);
      const post_id = `00000000-0000-4000-8000-0000000080${String(state.posts.length + 1).padStart(2, "0")}`;
      const status = args.p_space === "good" ? "pending" : "live";
      state.posts.push({ post_id, author_id: userId, author_name: state.profile?.display_name ?? "Brittany K.", space: args.p_space, title: args.p_title, body: args.p_body, status, created_at: ago(0) });
      return json(route, [{ post_id, status }]);
    }
    if (fn === "flock_post_edit") { const p = state.posts.find((x) => x.post_id === args.p_post_id); if (p) { p.title = args.p_title; p.body = args.p_body; p.edited_at = ago(0); } return json(route, p?.space === "good" ? "pending" : "live"); }
    if (fn === "flock_comments_for") {
      return json(route, state.comments.filter((c) => c.subject_type === args.p_subject_type && c.subject_id === args.p_subject_id).map((c) => ({
        ...counts(c), comment_id: c.comment_id, parent_id: c.parent_id ?? null, author_id: c.author_id, author_name: c.author_name, author_region: "Great Lakes",
        author_photo_path: null, reply_to_name: c.reply_to_name ?? null, body: c.body, has_photo: false, created_at: c.created_at, edited_at: c.edited_at ?? null,
        is_mine: c.author_id === userId,
      })));
    }
    if (fn === "flock_comment_create") {
      if (state.rateLimit === "comments") return json(route, { code: "P0001", message: "rate_limited", details: "comments", hint: null }, 400);
      const to = state.comments.find((c) => c.comment_id === args.p_reply_to);
      const comment_id = `00000000-0000-4000-8000-0000000081${String(state.comments.length + 1).padStart(2, "0")}`;
      state.comments.push({ comment_id, subject_type: args.p_subject_type, subject_id: args.p_subject_id, parent_id: to ? (to.parent_id ?? to.comment_id) : null,
        reply_to_name: to?.author_name ?? null, author_id: userId, author_name: state.profile?.display_name ?? "Brittany K.", body: args.p_body, created_at: ago(0) });
      return json(route, comment_id);
    }
    if (fn === "flock_comment_edit") { const c = state.comments.find((x) => x.comment_id === args.p_comment_id); if (c) { c.body = args.p_body; c.edited_at = ago(0); } return json(route, null); }
    if (fn === "flock_comment_counts") return json(route, (args.p_ids ?? []).map((id: string) => ({ subject_id: id, comment_count: state.comments.filter((c) => c.subject_id === id).length })).filter((r: any) => r.comment_count > 0));
    if (fn === "flock_react") {
      const all = [...state.posts, ...state.comments];
      const x = all.find((r) => r.post_id === args.p_subject_id || r.comment_id === args.p_subject_id);
      if (x) { x[args.p_kind] = Math.max(0, (x[args.p_kind] ?? 0) + (args.p_on ? 1 : -1)); x.mine = args.p_on ? [...(x.mine ?? []), args.p_kind] : (x.mine ?? []).filter((k: string) => k !== args.p_kind); }
      return json(route, null);
    }
    if (fn === "flock_reactors") {
      return json(route, [
        { user_id: "00000000-0000-4000-8000-00000000d001", display_name: "Priya S.", region_name: "Southeast", photo_path: null, kind: "great_job", created_at: ago(5) },
        { user_id: "00000000-0000-4000-8000-00000000d002", display_name: "Sam T.", region_name: "Great Lakes", photo_path: null, kind: "been_there", created_at: ago(9) },
        { user_id: "00000000-0000-4000-8000-00000000d003", display_name: "Jo K.", region_name: "Texas", photo_path: null, kind: "great_job", created_at: ago(15) },
      ]);
    }
    if (fn === "flock_event_rules") return json(route, [state.eventRules]);
    if (fn === "flock_chapter_events") {
      const past = args.p_when === "past";
      return json(route, state.events.filter((e) => (new Date(e.starts_at).getTime() < Date.now()) === past));
    }
    if (fn === "flock_event") {
      const e = state.events.find((x) => x.event_id === args.p_event_id);
      if (!e) return json(route, { code: "P0002", message: "not found", details: null, hint: null }, 404);
      return json(route, [{ region_slug: "great-lakes", region_name: "Great Lakes", description: null, address: null, review_note: null, host_id: null,
        host_name: null, host_is_lead: false, goers: [], can_manage: false, ...e, online_url: e.my_answer === "going" ? e.online_url ?? null : null }]);
    }
    if (fn === "flock_event_rsvp") {
      const e = state.events.find((x) => x.event_id === args.p_event_id);
      if (e && args.p_answer === "going" && e.spot_limit != null && e.going >= e.spot_limit && e.my_answer !== "going") return json(route, { code: "P0001", message: "event_full", details: null, hint: null }, 400);
      if (e) {
        if (e.my_answer === "going") e.going -= 1;
        if (e.my_answer === "maybe") e.maybe -= 1;
        e.my_answer = args.p_answer;
        if (args.p_answer === "going") e.going += 1;
        if (args.p_answer === "maybe") e.maybe += 1;
      }
      return json(route, args.p_answer);
    }
    if (fn === "flock_event_suggest" || fn === "flock_event_save") return json(route, "00000000-0000-4000-8000-0000000083ff");
    if (fn === "flock_event_cancel") return json(route, null);
    if (fn === "flock_todays_idea") return json(route, state.idea ? [state.idea] : []);
    if (fn === "flock_idea_try") { if (state.idea) { state.idea.my_outcome = args.p_outcome; state.idea.my_bird_id = args.p_bird_id; } return json(route, null); }
    if (fn === "flock_report") return json(route, null);
    if (fn === "flock_notifications_list") {
      const f = args.p_filter;
      return json(route, state.notifications.filter((n) => f === "all" || (f === "replies" && n.kind === "reply") || (f === "cheers" && n.kind === "cheer") || (f === "chapter" && n.kind === "chapter")));
    }
    if (fn === "flock_notifications_mark_read") { for (const n of state.notifications) n.unread = false; return json(route, null); }
    if (fn === "flock_can_review") return json(route, true);
    if (fn === "flock_review_counts") return json(route, [{ good: state.queue.filter((q) => q.item_type === "good").length, reports: state.queue.filter((q) => q.item_type === "report").length, events: state.queue.filter((q) => q.item_type === "event").length }]);
    if (fn === "flock_review_queue") return json(route, state.queue.filter((q) => args.p_filter === "all" || q.item_type === ({ good: "good", reports: "report", events: "event" } as Record<string, string>)[args.p_filter]));
    if (fn === "flock_review_post" || fn === "flock_resolve_report" || fn === "flock_review_event") {
      if (fn === "flock_review_event") { state.queue = state.queue.filter((q) => q.subject_id !== args.p_event_id); return json(route, null); }
      state.queue = state.queue.filter((q) => q.subject_id !== (args.p_post_id ?? args.p_subject_id) || (fn === "flock_resolve_report" && args.p_action === "message"));
      return json(route, null);
    }
    return json(route, null);
  });
  return state;
}

async function open(browser: Browser, baseURL: string, opts: { admin: boolean; size?: "phone" | "duo"; setupDone?: boolean; region?: string; storagePhotos?: boolean; journeys?: JourneyMockOpts }): Promise<{ context: BrowserContext; page: Page; flockChunks: string[]; state: FlockState; journeys: JourneyState }> {
  const context = await browser.newContext({
    ...(opts.size === "duo" ? DUO : IPHONE),
    locale: "en-US", serviceWorkers: "block", baseURL,
  });
  const fx = duoFixture(baseURL, Date.now());
  fx.rpc.flock_enabled = opts.admin;
  fx.rpc.is_admin = opts.admin;
  if (opts.storagePhotos) storagePhotoPaths(fx);
  await mockDuo(context, fx);
  if (opts.storagePhotos) await storagePhotos(context, fx);
  const state = await mockFlock(context, fx.user.id, { setupDone: opts.setupDone ?? true, region: opts.region });
  const journeys = await mockJourneys(context, opts.journeys ?? {}, (fx.tables as any).birds);
  // Hide the open-in-app strip on every page (a session-only choice).
  await context.addInitScript(() => { try { sessionStorage.setItem("kya:openInAppDismissed", "1"); } catch { /* ignore */ } });
  const flockChunks: string[] = [];
  context.on("request", (r) => { if (FLOCK_CHUNK.test(r.url())) flockChunks.push(r.url()); });
  const page = await context.newPage();
  return { context, page, flockChunks, state, journeys };
}

/** Bird photos the way production stores them: a path in the private
 *  bird-photos bucket, signed by Storage (the fixture's plain web URLs skip
 *  signing entirely, which is how a missing photo got past this check).
 *  Echo, Buzz and Willow have photos; Max has none. Willow's resized copy
 *  fails, so the original must take over. Every image request is counted. */
function storagePhotoPaths(fx: ReturnType<typeof duoFixture>) {
  for (const b of (fx.tables as any).birds) b.photo_url = b.name === "Max" ? null : `${fx.user.id}/${b.id}.jpg`;
}
async function storagePhotos(context: BrowserContext, fx: ReturnType<typeof duoFixture>) {
  const birds = (fx.tables as any).birds as { id: string; name: string; photo_url: string | null }[];
  const jpg = (await import("node:fs")).readFileSync("public/brand/email/juno.jpg");
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
  const willow = birds.find((b) => b.name === "Willow")!.id;
  // Single sign (with or without a resize) and the batch sign.
  await context.route(`${MOCK}/storage/v1/object/sign/**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const path = new URL(req.url()).pathname.replace("/storage/v1/object/sign/bird-photos", "").replace(/^\//, "");
    if (req.method() === "POST") {
      const body = req.postDataJSON() ?? {};
      if (!path) {
        return route.fulfill({ status: 200, contentType: "application/json", headers: cors,
          body: JSON.stringify((body.paths as string[]).map((p) => ({ path: p, signedURL: `/object/sign/bird-photos/${p}?token=t`, error: null }))) });
      }
      const signedURL = body.transform ? `/render/image/sign/bird-photos/${path}?token=t` : `/object/sign/bird-photos/${path}?token=t`;
      return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ signedURL }) });
    }
    return route.fulfill({ status: 200, contentType: "image/jpeg", body: jpg });
  });
  await context.route(`${MOCK}/storage/v1/render/image/sign/**`, (route) =>
    route.request().url().includes(willow) ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ status: 200, contentType: "image/jpeg", body: jpg }));
}

// ---- Journeys (step 3) --------------------------------------------------------
// Six of the fourteen templates, in the doc's own words (e2e/journey-fixture.json).
const JOURNEY_TEMPLATES = JSON.parse(readFileSync(`${process.cwd()}/e2e/journey-fixture.json`, "utf8")) as {
  id: string; slug: string; name: string; tier: string; milestones: { position: number; title: string; ask: string; done_line: string }[];
}[];
/** A journey already under way: which template (or custom milestones), how many milestones are done. */
type SeedJourney = {
  id: string; birdName: string; slug?: string; custom?: { name: string; milestones: string[] }; done: number; status?: string; pausedReason?: string;
  /** Diet conversion's vet card answer. */
  vetCheck?: "talked" | "will_call";
  lastPostedDaysAgo?: number; visibility?: string;
  /** Someone else's journey (a made-up member), not one of the signed-in owner's birds. */
  owner?: string; region?: string;
  /** How many clips it has: the first is the day-one clip, one is a Question, the newest is a Milestone. */
  clips?: number; followers?: number; following?: boolean;
};
type JourneyMockOpts = {
  tier?: "free" | "premium" | "flock"; openCustom?: number; knownSlugs?: string[];
  seed?: SeedJourney[]; canAddClip?: boolean;
  weight?: {
    level: "none" | "notice" | "pause"; start: number; now: number;
    /** The smoothed rules (journey_weight_check since 20261108160000). */
    avg?: number; pauseKind?: "drop" | "slide" | "sudden"; recheck?: boolean; missed?: boolean;
    excluded?: { grams: number; daysAgo: number; reason: "other_time" | "unconfirmed" }[];
  };
  /** Today's "Weigh [Bird] today" list. */
  weighReminders?: { journey_id: string; bird_id: string; bird_name: string; days_since_weigh: number }[];
  /** Finished members' tips, by template slug (the database gives free accounts none). */
  finisherTips?: Record<string, string[]>;
};
type JourneyState = { starts: Record<string, any>[]; known: Record<string, any>[]; calls: { fn: string; args: Record<string, any> }[] };

/** Journey tables and functions, answered the way the database would for a
 *  member of `tier` (admins are "flock"). Records every call. */
async function mockJourneys(context: BrowserContext, opts: JourneyMockOpts, birds: { id: string; name: string }[]): Promise<JourneyState> {
  const state: JourneyState = { starts: [], known: [], calls: [] };
  const tier = opts.tier ?? "flock";
  const limits = {
    free: { max_clip_seconds: 60, max_clips_per_journey: 10, max_open_custom: 1, max_upload_bytes: 262144000, can_use_premium: false, can_share: false, can_view_community: false },
    premium: { max_clip_seconds: 300, max_clips_per_journey: 20, max_open_custom: null, max_upload_bytes: 1073741824, can_use_premium: true, can_share: false, can_view_community: true },
    flock: { max_clip_seconds: 1200, max_clips_per_journey: null, max_open_custom: null, max_upload_bytes: 2000000000, can_use_premium: true, can_share: true, can_view_community: true },
  }[tier];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  const journeys = new Map<string, any>();
  const lastPosted = new Map<string, string>();
  const make = (id: string, birdId: string, tp: (typeof JOURNEY_TEMPLATES)[number] | undefined, custom: { name: string; milestones: string[] } | null, extra: Record<string, any>) => {
    const ms = tp ? tp.milestones.map((m) => ({ title: m.title, words: { ask: m.ask, done_line: m.done_line } })) : custom!.milestones.map((title) => ({ title, words: null }));
    return {
      id, bird_id: birdId, template_id: tp?.id ?? null, custom_name: custom?.name ?? null, status: "active", visibility: "community", rhythm: "most_days",
      started_at: new Date(Date.now() - 16 * 86_400_000).toISOString(), finished_at: null, paused_reason: null, vet_check: null, vet_remind_after: null,
      template: tp ? { name: tp.name, slug: tp.slug } : null, bird: { name: birds.find((b) => b.id === birdId)?.name ?? "" },
      milestones: ms.map((m, i) => ({ id: `${id}-m${i + 1}`, position: i + 1, title: m.title, state: "todo", reached_at: null, shared_at: null, words: m.words })),
      ...extra,
    };
  };
  const updates = new Map<string, any[]>();
  const follows = new Set<string>();
  const meta = new Map<string, { owner: string; region: string | null; mine: boolean; followers: number }>();
  for (const sj of opts.seed ?? []) {
    const bird = birds.find((b) => b.name === sj.birdName) ?? { id: `00000000-0000-4000-8000-0000000075${sj.id.slice(-2)}`, name: sj.birdName };
    const j = make(sj.id, bird.id, JOURNEY_TEMPLATES.find((x) => x.slug === sj.slug), sj.custom ?? null,
      { status: sj.status ?? "active", paused_reason: sj.pausedReason ?? null, visibility: sj.visibility ?? "community", vet_check: sj.vetCheck ?? null });
    j.milestones.forEach((m: any, i: number) => { if (i < sj.done) m.state = "reached"; });
    journeys.set(sj.id, j);
    if (sj.lastPostedDaysAgo != null) lastPosted.set(sj.id, new Date(Date.now() - sj.lastPostedDaysAgo * 86_400_000).toISOString());
    if (sj.owner) j.bird = { name: sj.birdName };
    meta.set(sj.id, { owner: sj.owner ?? "Brittany K.", region: sj.region ?? null, mine: !sj.owner, followers: sj.followers ?? 0 });
    if (sj.following) follows.add(sj.id);
    const n = sj.clips ?? 0;
    updates.set(sj.id, Array.from({ length: n }, (_, k) => {
      const newest = k === n - 1;
      return {
        update_id: `${sj.id.slice(0, -4)}${String(9000 + k)}`, has_clip: true, caption: newest ? `${sj.birdName} did it!` : k === 1 ? "Almonds or walnuts?" : null,
        is_question: k === 1 && n > 2, is_day_one: k === 0, is_milestone: newest && n > 1, milestone_position: newest && n > 1 ? sj.done : 1,
        created_at: new Date(Date.now() - (n - k) * 2 * 86_400_000).toISOString(),
        great_job: newest ? 3 : 0, been_there: 0, rooting_for_you: 0, love_this: 0, mine: [],
      };
    }).reverse());
  }
  const card = (j: any) => {
    const m = meta.get(j.id) ?? { owner: "Brittany K.", region: null, mine: true, followers: 0 };
    const tp = JOURNEY_TEMPLATES.find((x) => x.id === j.template_id);
    const done = j.milestones.filter((x: any) => x.state !== "todo").length;
    return {
      journey_id: j.id, bird_id: j.bird_id, bird_name: j.bird?.name ?? "", bird_has_photo: false, skill: tp?.name ?? j.custom_name,
      template_slug: tp?.slug ?? null, category: tp ? (["wave", "spin"].includes(tp.slug) ? "tricks" : "foundations") : null, template_tier: tp?.tier ?? null,
      status: j.status, visibility: j.visibility, started_at: j.started_at, finished_at: j.finished_at, done, total: j.milestones.length,
      next_title: j.milestones.find((x: any) => x.state === "todo")?.title ?? null, owner_id: "00000000-0000-4000-8000-0000000076aa",
      owner_name: m.owner, followers: m.followers + (follows.has(j.id) ? 1 : 0), following: follows.has(j.id), is_mine: m.mine,
      last_activity: lastPosted.get(j.id) ?? j.started_at,
    };
  };
  await context.route(`${MOCK}/rest/v1/journey_templates**`, (route) => json(route, JOURNEY_TEMPLATES));
  await context.route(`${MOCK}/rest/v1/journey_tips**`, (route) => json(route, [{ body: "Keep it to a few minutes, and stop while your bird still wants more." }]));
  const dayAt = (daysAgo: number) => { const d = new Date(Date.now() - daysAgo * 86_400_000); d.setUTCHours(8, 30, 0, 0); return d.toISOString(); };
  await context.route(`${MOCK}/rest/v1/weight_entries**`, (route) => json(route, opts.weight ? [
    { grams: opts.weight.start, measured_at: dayAt(14) },
    ...(opts.weight.excluded ?? []).map((x) => ({ grams: x.grams, measured_at: dayAt(x.daysAgo) })),
    { grams: opts.weight.avg ?? opts.weight.now, measured_at: dayAt(2) },
    { grams: opts.weight.now, measured_at: dayAt(1) },
  ].sort((a, b) => a.measured_at.localeCompare(b.measured_at)) : []));
  await context.route(`${MOCK}/rest/v1/journey_updates**`, (route) => {
    const url = new URL(route.request().url());
    if ((url.searchParams.get("select") ?? "").startsWith("journey_id")) return json(route, [...lastPosted].map(([journey_id, created_at]) => ({ journey_id, created_at })));
    return json(route, []);
  });
  await context.route(`${MOCK}/rest/v1/bird_skills**`, (route) => {
    const known = JOURNEY_TEMPLATES.filter((x) => (opts.knownSlugs ?? []).includes(x.slug));
    return json(route, known.map((x) => ({ id: `skill-${x.slug}`, name: x.name, template_id: x.id, source: "known" })));
  });
  await context.route(`${MOCK}/rest/v1/journeys**`, (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get("id")?.replace(/^eq\./, "");
    if (id) {
      const j = journeys.get(id);
      return j ? json(route, j) : json(route, { code: "PGRST116" }, 406);
    }
    const status = url.searchParams.get("status")?.replace(/^eq\./, "");
    return json(route, [...journeys.values()].filter((j) => !status || j.status === status));
  });
  await context.route(`${MOCK}/rest/v1/rpc/journey_*`, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/").pop()!;
    const args = (route.request().postDataJSON() ?? {}) as Record<string, any>;
    state.calls.push({ fn, args });
    const j = journeys.get(args.p_journey_id);
    if (fn === "journey_weigh_reminders") return json(route, opts.weighReminders ?? []);
    if (fn === "journey_my_access") return json(route, [{ tier, open_custom: opts.openCustom ?? 0, ...limits }]);
    if (fn === "journey_clip_allowance") {
      const can = opts.canAddClip ?? true;
      return json(route, [{ max_seconds: limits.max_clip_seconds, max_upload_bytes: limits.max_upload_bytes, clips_used: can ? 2 : (limits.max_clips_per_journey ?? 0), clips_max: limits.max_clips_per_journey, can_add: can }]);
    }
    if (fn === "journey_start") {
      state.starts.push(args);
      const id = `00000000-0000-4000-8000-0000000072${String(state.starts.length).padStart(2, "0")}`;
      const tp = JOURNEY_TEMPLATES.find((x) => x.slug === args.p_template_slug);
      const jn = make(id, args.p_bird_id, tp, tp ? null : { name: args.p_custom_name, milestones: args.p_custom_milestones },
        { visibility: args.p_visibility, rhythm: args.p_rhythm, started_at: new Date().toISOString() });
      jn.milestones.forEach((m: any) => { if ((args.p_already ?? []).includes(m.position)) m.state = "already"; });
      journeys.set(id, jn);
      return json(route, id);
    }
    if (fn === "journey_post_update") return json(route, "00000000-0000-4000-8000-0000000073aa");
    if (fn === "journey_view") return json(route, j ? [card(j)] : []);
    if (fn === "journey_finisher_tips_for") {
      const list = tier === "free" ? [] : (opts.finisherTips?.[args.p_template_slug] ?? []);
      return json(route, list.map((body, k) => ({ body, created_at: new Date(Date.now() - k * 86_400_000).toISOString(), total: list.length })));
    }
    if (fn === "journey_view_updates") return json(route, updates.get(args.p_journey_id) ?? []);
    if (fn === "journey_view_milestones") return json(route, j ? j.milestones.map((m: any) => ({ milestone_position: m.position, title: m.title, state: m.state, reached_at: m.reached_at })) : []);
    if (fn === "journey_feed") {
      const all = [...journeys.values()].filter((x) => x.visibility === "community").map(card);
      const f = args.p_filter;
      return json(route, all.filter((c) => f === "for_you" || (f === "following" && c.following) || (f === "tricks" && c.category === "tricks") || (f === "basics" && c.template_tier === "free")));
    }
    if (fn === "journey_following") return json(route, [...journeys.values()].filter((x) => follows.has(x.id)).map(card));
    if (fn === "journey_milestone_cards") {
      return json(route, [...journeys.values()].filter((x) => follows.has(x.id)).flatMap((x) => {
        const c = card(x); const m = meta.get(x.id);
        return x.milestones.filter((mm: any) => mm.state === "reached").slice(-1).map((mm: any) => ({
          journey_id: x.id, milestone_id: `${x.id}-m${mm.position}`, bird_id: x.bird_id, bird_name: c.bird_name, bird_has_photo: false, skill: c.skill,
          owner_name: m?.owner ?? null, owner_region: m?.region ?? null, milestone_position: mm.position, total: c.total, title: mm.title,
          reached_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), update_id: (updates.get(x.id) ?? [])[0]?.update_id ?? null,
          caption: (updates.get(x.id) ?? [])[0]?.caption ?? null, has_clip: (updates.get(x.id) ?? []).length > 0,
          great_job: 12, been_there: 4, rooting_for_you: 0, love_this: 0, mine: [],
        }));
      }));
    }
    if (fn === "journey_follow") { if (args.p_follow) follows.add(args.p_journey_id); else follows.delete(args.p_journey_id); return json(route, (meta.get(args.p_journey_id)?.followers ?? 0) + (args.p_follow ? 1 : 0)); }
    if (fn === "journey_react") return json(route, null);
    if (fn === "journey_set_status" && j) { j.status = args.p_status; return json(route, null); }
    if (fn === "journey_reach_milestone" && j) {
      const m = j.milestones.find((x: any) => x.position === args.p_position);
      m.state = "reached"; m.reached_at = new Date().toISOString();
      const done = j.milestones.filter((x: any) => x.state !== "todo").length;
      const finished = done === j.milestones.length;
      if (finished) { j.status = "finished"; j.finished_at = new Date().toISOString(); }
      return json(route, [{ finished, done, total: j.milestones.length }]);
    }
    if (fn === "journey_share_milestone" && j) {
      const m = j.milestones.find((x: any) => x.position === args.p_position);
      if (m) m.shared_at = new Date().toISOString();
      return json(route, null);
    }
    if (fn === "journey_set_visibility" && j) { j.visibility = args.p_visibility; return json(route, null); }
    if (fn === "journey_set_vet_check" && j) {
      if (args.p_choice === "remind_later") j.vet_remind_after = new Date(Date.now() + 3 * 86_400_000).toISOString();
      else { j.vet_check = args.p_choice; j.vet_remind_after = null; }
      return json(route, null);
    }
    if (fn === "journey_resume_after_vet" && j) { j.status = "active"; j.paused_reason = null; return json(route, null); }
    if (fn === "journey_weight_check") {
      const w = opts.weight;
      const avg = w ? (w.avg ?? w.now) : null;
      return json(route, [{ start_grams: w?.start ?? null, current_grams: w?.now ?? null, avg_grams: avg, drop_pct: w && avg != null ? Math.round((w.start - avg) / w.start * 1000) / 10 : null,
        level: j?.paused_reason === "weight_drop" ? "pause" : (w?.level ?? "none"), paused: j?.paused_reason === "weight_drop",
        pause_kind: j?.paused_reason === "weight_drop" ? (w?.pauseKind ?? "drop") : null, recheck: !!w?.recheck, recheck_grams: null,
        missed: !!w?.missed, days_since_weigh: w?.missed ? 3 : 1, usual_meal: w?.excluded ? "before_meal" : null,
        excluded: [...(w?.excluded ?? []).map((x) => ({ grams: x.grams, measured_at: dayAt(x.daysAgo), reason: x.reason })),
          ...(w?.recheck ? [{ grams: w.now, measured_at: dayAt(1), reason: "pending" }] : [])],
        window_from: new Date(Date.now() - 16 * 86_400_000).toISOString(), window_to: new Date(Date.now() - 9 * 86_400_000).toISOString() }]);
    }
    return json(route, null);
  });
  await context.route(`${MOCK}/rest/v1/rpc/bird_set_known_skills`, (route) => {
    state.known.push(route.request().postDataJSON());
    return json(route, 2);
  });
  return state;
}

// Community code chunks (FlockHealthDuo is the care app's, not Community's).
const FLOCK_CHUNK = /\/assets\/(?!FlockHealthDuo)(Flock\w+|SpacesSheet|CommentThread|ReportSheet|IdeaParts|EventParts|admin\.(?:review|ideas)|Post(?:Compose|Feed|Parts)|Journey\w+|[jJ]ourney\w*(\.[\w$-]+)*|flock\w*(\.[\w$-]+)*)-[\w-]+\.js/;

const tabs = (page: Page) => page.locator("nav[aria-label='Community']:visible [data-flock-tab]");

test.describe("as an admin, on a phone", () => {
  test("Today: header, five tabs in order, chips change the filter", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Spaces" })).toBeVisible();
    // The header avatar opens You (the Community profile), not care Account.
    await expect(page.getByRole("link", { name: "You", exact: true })).toHaveAttribute("href", "/flock/you");
    await expect(tabs(page)).toHaveText(["Today", "Journeys", "Chapter", "Library", "My birds"]);
    await expect(tabs(page).first()).toHaveAttribute("aria-current", "page");
    await expect(tabs(page).last()).toHaveAttribute("href", "/dashboard");

    const chips = page.getByRole("group", { name: "Filter Today" }).getByRole("button");
    await expect(chips).toHaveText(["Everything", "Learn together", "Do good", "Start here"]);
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("flock-empty")).toContainText("This is where the Flock's days come together.");

    await chips.filter({ hasText: "Do good" }).click();
    await expect(page).toHaveURL(/\/flock\?space=good$/);
    await expect(chips.filter({ hasText: "Do good" })).toHaveAttribute("aria-pressed", "true");
    await expect(chips.first()).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("flock-empty")).toContainText("Rescue stories");

    await chips.first().click();
    await expect(page).toHaveURL(/\/flock$/);
    await context.close();
  });

  test("Spaces sheet: focus stays inside, Escape and swipe close it, a space filters Today", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/journeys");
    const spaces = page.getByRole("button", { name: "Spaces" });
    const sheet = page.getByRole("dialog", { name: "Spaces" });

    await spaces.click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Start here/ })).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await sheet.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
    await page.keyboard.press("Shift+Tab");
    expect(await sheet.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(spaces).toBeFocused();

    // Swipe down from the handle.
    await spaces.click();
    const handle = page.getByTestId("spaces-sheet-handle");
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 70, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2, box.y + 160, { steps: 4 });
    await page.mouse.up();
    await expect(sheet).toBeHidden();

    // A short drag snaps back instead.
    await spaces.click();
    const box2 = (await handle.boundingBox())!;
    await page.mouse.move(box2.x + box2.width / 2, box2.y + 10);
    await page.mouse.down();
    await page.mouse.move(box2.x + box2.width / 2, box2.y + 40, { steps: 3 });
    await page.mouse.up();
    await expect(sheet).toBeVisible();

    await sheet.getByRole("button", { name: /Learn together/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page).toHaveURL(/\/flock\?space=learn$/);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Filter Today" }).getByRole("button", { name: "Learn together" })).toHaveAttribute("aria-pressed", "true");
    await context.close();
  });

  test("Journeys, Chapter and Library: chips, sub-tabs and search", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });

    await page.goto("/flock/journeys");
    await expect(page.getByRole("heading", { level: 1, name: "Journeys" })).toBeVisible();
    const jChips = page.getByRole("group", { name: "Filter journeys" }).getByRole("button");
    await expect(jChips).toHaveText(["For you", "Following", "Tricks", "Basics"]);
    await jChips.filter({ hasText: "Tricks" }).click();
    await expect(page).toHaveURL(/\/flock\/journeys\?filter=tricks$/);
    await expect(jChips.filter({ hasText: "Tricks" })).toHaveAttribute("aria-pressed", "true");

    await tabs(page).filter({ hasText: "Chapter" }).click();
    await expect(page).toHaveURL(/\/flock\/chapter$/);
    await expect(page.getByTestId("chapter-line")).toHaveText("Great Lakes · IL · IN · MI · OH");
    await expect(page.getByTestId("chapter-count")).toContainText("2 members · meetups unlock at 15");
    const sub = page.getByRole("tablist", { name: "Chapter sections" }).getByRole("tab");
    await expect(sub).toHaveText(["Posts", "Events", "Resources", "Members"]);
    await expect(sub.first()).toHaveAttribute("aria-selected", "true");
    await sub.filter({ hasText: "Events" }).click();
    await expect(page).toHaveURL(/\/flock\/chapter\?tab=events$/);
    await expect(sub.filter({ hasText: "Events" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("flock-empty")).toContainText("meetups");

    await tabs(page).filter({ hasText: "Library" }).click();
    await expect(page.getByRole("searchbox", { name: "Search the library" })).toBeVisible();
    const type = page.getByRole("group", { name: "Type" }).getByRole("button");
    const subject = page.getByRole("group", { name: "Subject" }).getByRole("button");
    await expect(type).toHaveText(["All", "Guides", "Recordings", "Podcast"]);
    await expect(subject).toHaveText(["Foraging", "Diet", "Training", "Hormones", "Conservation"]);
    await type.filter({ hasText: "Podcast" }).click();
    await subject.filter({ hasText: "Hormones" }).click();
    await expect(page).toHaveURL(/type=podcast/);
    await expect(page).toHaveURL(/subject=hormones/);
    await subject.filter({ hasText: "Hormones" }).click(); // a second tap clears it
    await expect(page).not.toHaveURL(/subject=/);
    await page.getByRole("searchbox", { name: "Search the library" }).fill("pellets");
    await expect(page).toHaveURL(/q=pellets/);
    await expect(page.getByTestId("flock-empty")).toContainText("Nothing in the library matches that yet.");

    await tabs(page).filter({ hasText: "My birds" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await context.close();
  });

  test("old and bad links: /flock/spaces and /flock/learn redirect, bad filters fall back", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/spaces");
    await expect(page).toHaveURL(/\/flock$/);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await page.goto("/flock/learn");
    await expect(page).toHaveURL(/\/flock\/library$/);
    await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
    await page.goto("/flock?space=nonsense");
    await expect(page.getByRole("group", { name: "Filter Today" }).getByRole("button", { name: "Everything" })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/flock/chapter?tab=nope");
    await expect(page.getByRole("tab", { name: "Posts" })).toHaveAttribute("aria-selected", "true");
    await context.close();
  });
});

test("as an admin, Duo / wide: the five Community tabs sit in the side column", async ({ browser, baseURL }) => {
  const { context, page } = await open(browser, baseURL!, { admin: true, size: "duo" });
  await page.goto("/flock/library");
  await expect(page.getByRole("heading", { level: 1, name: "Library" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/\bduo\b/);
  const rail = page.locator("nav.duo-rail");
  await expect(rail.locator("[data-flock-tab]")).toHaveText(["Today", "Journeys", "Chapter", "Library", "My birds"]);
  await expect(rail.locator("[data-flock-tab='library']")).toHaveAttribute("aria-current", "page");
  // No care tabs in the column, and no bottom bar.
  await expect(rail.locator("[data-coach^='owner-tab-']")).toHaveCount(0);
  await expect(page.locator("nav.fixed.bottom-0")).toHaveCount(0);
  // Back to care: the care tabs come back to the column.
  await rail.locator("[data-flock-tab='care']").click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(rail.locator("[data-coach='owner-tab-home']")).toBeVisible();
  await expect(rail.locator("[data-flock-tab]")).toHaveCount(0);
  await context.close();
});

test.describe("journeys: start a journey (admin, phone)", () => {
  test("pick a bird, pick Step up, mark what he already does, start: the database gets exactly that", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { knownSlugs: ["target-training"] } });
    await page.goto("/flock/journeys");
    await page.getByTestId("start-journey").click();
    await expect(page).toHaveURL(/\/flock\/journeys\/start$/);
    // A full screen: no tab bar.
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Echo" }).click();
    const list = page.getByTestId("template-list");
    await expect(list.getByRole("heading", { name: "The basics · free" })).toBeVisible();
    await expect(list.getByRole("heading", { name: "Tricks and more · premium" })).toBeVisible();
    await expect(list.locator("[data-template]")).toHaveCount(7);
    await expect(list.locator("[data-template='target-training']")).toContainText("Echo knows this");
    await expect(list.locator("[data-template='step-up']")).toContainText("7 milestones · usually 2–6 weeks");
    await expect(list.locator("[data-locked]")).toHaveCount(0);
    await list.locator("[data-template='step-up']").click();

    await expect(page).toHaveURL(/\/flock\/journeys\/setup\?/);
    const setup = page.getByTestId("journey-setup");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Step up");
    await expect(setup.getByText("Where is Echo starting?")).toBeVisible();
    await expect(setup.getByText("Tap anything he already does.")).toBeVisible();
    await setup.locator("[data-position='1']").click();
    await setup.locator("[data-position='2']").click();
    await expect(setup.locator("[data-position='3']")).toContainText("Start here");
    await expect(setup.locator("[data-position='1']")).toContainText("Already");
    await expect(setup.getByText("You'll compare it with later clips. It's worth the 30 seconds.")).toBeVisible();
    await expect(setup.getByTestId("rhythm").locator("[aria-checked='true']")).toHaveText("A few times a week");
    await expect(setup.getByTestId("visibility").locator("[role='radio']")).toHaveText(["The community", "Just me"]);
    await expect(setup.getByTestId("visibility").locator("[aria-checked='true']")).toHaveText("The community");
    await expect(setup.getByTestId("safety-notes")).toContainText("Never withhold food to make a bird hungrier for training.");
    await setup.getByTestId("rhythm").getByRole("radio", { name: "Most days" }).click();
    await page.getByRole("button", { name: "Start Echo's journey" }).click();

    await expect(page).toHaveURL(/\/flock\/journeys\/00000000-0000-4000-8000-000000007201$/);
    expect(journeys.starts).toHaveLength(1);
    expect(journeys.starts[0]).toMatchObject({ p_template_slug: "step-up", p_custom_name: null, p_already: [1, 2], p_rhythm: "most_days", p_visibility: "community", p_day_one_clip: null });
    await expect(page.getByTestId("journey-progress")).toHaveText("2 of 7 · next: Shifts weight and steps on with one foot, then steps back off.");
    await context.close();
  });

  test("Diet conversion: the vet card comes first, both answers continue, and the answer is saved on the journey", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Willow" }).click();
    await page.locator("[data-template='diet-conversion']").click();
    const card = page.getByTestId("diet-vet-card");
    await expect(card.getByRole("heading")).toHaveText("Bring your avian vet in on this one");
    await expect(card).toContainText("Before you start, check in with your avian vet to make sure your bird is healthy enough for a diet change.");
    await expect(card.getByTestId("diet-young")).toHaveCount(0);
    await expect(card.getByTestId("diet-disclaimer")).toHaveText("Kya & Co. helps you keep track of Willow's weight and progress during the switch, but it isn't a substitute for your avian vet. The tips and alerts here are general guidance, not medical advice, so please lean on your vet for decisions about Willow's health and diet.");
    await expect(card.getByTestId("diet-find-vet")).toHaveAttribute("href", "https://www.aav.org/page/FindAVet2");
    await expect(page.getByTestId("journey-setup")).toHaveCount(0);
    await card.getByRole("button", { name: "I'll call before we go further" }).click();

    const setup = page.getByTestId("journey-setup");
    await expect(setup.getByTestId("safeguards")).toContainText("If weight drops, the journey pauses with a clear message to call your avian vet.");
    await expect(setup.getByTestId("vet-check")).toHaveCount(0);
    await setup.getByTestId("how-to").locator("summary").click();
    await expect(setup.getByTestId("how-to").locator("li").first()).toHaveText("Offer the new food first thing in the morning, with the usual food alongside.");
    await expect(setup.getByTestId("how-to").locator("li")).toHaveCount(11);
    await expect(setup.getByText("Tap anything she already does.")).toBeVisible();
    await page.getByRole("button", { name: "Start Willow's journey" }).click();
    await expect(page).toHaveURL(/\/flock\/journeys\/00000000-0000-4000-8000-000000007201$/);
    expect(journeys.starts[0]).toMatchObject({ p_template_slug: "diet-conversion" });
    expect(journeys.calls.find((c) => c.fn === "journey_set_vet_check")?.args).toEqual({ p_journey_id: "00000000-0000-4000-8000-000000007201", p_choice: "will_call" });
    await expect(page.getByTestId("diet-disclaimer")).toContainText("isn't a substitute for your avian vet");
    await context.close();
  });

  test("the vet card is Diet conversion's only; a young bird gets the extra line; lories and lorikeets can't start it", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true });
    const row = (id: string, name: string, species: string, birth: string | null) => ({ id, name, species, sex: null, photo_url: null, birth_date: birth, passed_at: null });
    const young = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
    await context.route(`${MOCK}/rest/v1/birds**`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([row("00000000-0000-4000-8000-0000000071b1", "Pip", "Cockatiel", young), row("00000000-0000-4000-8000-0000000071b2", "Sunny", "Rainbow Lorikeet", "2020-05-01"), row("00000000-0000-4000-8000-0000000071b3", "Rio", "Congo grey", null)]) }));
    // Step up: straight to setup, no vet card, no disclaimer.
    await page.goto("/flock/journeys/setup?bird=00000000-0000-4000-8000-0000000071b3&template=step-up");
    await expect(page.getByTestId("journey-setup")).toBeVisible();
    await expect(page.getByTestId("diet-vet-card")).toHaveCount(0);
    await expect(page.getByTestId("diet-disclaimer")).toHaveCount(0);
    // A young bird, and one with no hatch date, get the extra line.
    await page.goto("/flock/journeys/setup?bird=00000000-0000-4000-8000-0000000071b1&template=diet-conversion");
    await expect(page.getByTestId("diet-young")).toHaveText("Young birds still learning to eat on their own need food available all day, so please talk with your vet before changing anything.");
    await page.goto("/flock/journeys/setup?bird=00000000-0000-4000-8000-0000000071b3&template=diet-conversion");
    await expect(page.getByTestId("diet-young")).toBeVisible();
    // A lorikeet: no card, no setup, no way to start.
    await page.goto("/flock/journeys/setup?bird=00000000-0000-4000-8000-0000000071b2&template=diet-conversion");
    await expect(page.getByTestId("diet-not-for-bird")).toContainText("This journey isn't made for Sunny. Lories and lorikeets eat a nectar-based diet, so their food needs are different. Your avian vet is the best guide for any changes.");
    await expect(page.getByTestId("diet-vet-card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Start .* journey/ })).toHaveCount(0);
    expect(journeys.starts).toHaveLength(0);
    await context.close();
  });

  test("Diet conversion pages: the milestone-2 vet reminder only for \"I'll call\", and the disclaimer at the bottom", async ({ browser, baseURL }) => {
    const id = "00000000-0000-4000-8000-0000000074a2";
    const diet = { id, birdName: "Willow", slug: "diet-conversion", done: 1, vetCheck: "will_call" as const };
    let o = await open(browser, baseURL!, { admin: true, journeys: { seed: [diet], weight: { level: "none", start: 400, now: 401 } } });
    await o.page.goto(`/flock/journeys/${id}`);
    const reminder = o.page.getByTestId("vet-reminder");
    await expect(reminder).toContainText("Have you had a chance to check in with your avian vet? It's worth doing before the new food becomes a bigger share.");
    await expect(o.page.getByTestId("diet-disclaimer")).toContainText("Kya & Co. helps you keep track of Willow's weight");
    await reminder.getByRole("button", { name: "Remind me later" }).click();
    await expect(reminder).toHaveCount(0);
    expect(o.journeys.calls.find((c) => c.fn === "journey_set_vet_check")?.args).toEqual({ p_journey_id: id, p_choice: "remind_later" });
    await o.context.close();

    o = await open(browser, baseURL!, { admin: true, journeys: { seed: [diet], weight: { level: "none", start: 400, now: 401 } } });
    await o.page.goto(`/flock/journeys/${id}`);
    await o.page.getByTestId("vet-reminder").getByRole("button", { name: "Yes, we've talked" }).click();
    await expect(o.page.getByTestId("vet-reminder")).toHaveCount(0);
    expect(o.journeys.calls.find((c) => c.fn === "journey_set_vet_check")?.args).toEqual({ p_journey_id: id, p_choice: "talked" });
    await o.context.close();

    // Still on milestone 1, or "I've talked": no reminder. Another journey: no disclaimer.
    o = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ ...diet, done: 0 }, { ...diet, id: "00000000-0000-4000-8000-0000000074b2", birdName: "Echo", vetCheck: "talked" }, { id: "00000000-0000-4000-8000-0000000074b3", birdName: "Max", slug: "step-up", done: 1 }] } });
    await o.page.goto(`/flock/journeys/${id}`);
    await expect(o.page.getByTestId("journey-progress")).toBeVisible();
    await expect(o.page.getByTestId("vet-reminder")).toHaveCount(0);
    await expect(o.page.getByTestId("diet-disclaimer")).toBeVisible();
    await o.page.goto("/flock/journeys/00000000-0000-4000-8000-0000000074b2");
    await expect(o.page.getByTestId("journey-progress")).toBeVisible();
    await expect(o.page.getByTestId("vet-reminder")).toHaveCount(0);
    await o.page.goto("/flock/journeys/00000000-0000-4000-8000-0000000074b3");
    await expect(o.page.getByTestId("journey-progress")).toBeVisible();
    await expect(o.page.getByTestId("diet-disclaimer")).toHaveCount(0);
    await o.context.close();
  });

  test("write your own: a name and 3 milestones, privately", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Max" }).click();
    await page.getByTestId("write-own").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Write your own journey");
    const start = page.getByRole("button", { name: "Start Max's journey" });
    await expect(start).toBeDisabled();
    await page.getByTestId("custom-name").fill("Bath time");
    const rows = page.getByTestId("custom-milestones").locator("input");
    await rows.nth(0).fill("Calm near the dish");
    await rows.nth(1).fill("Toes in the water");
    await expect(start).toBeDisabled();
    await rows.nth(2).fill("A full splash");
    await page.getByTestId("visibility").getByRole("radio", { name: "Just me" }).click();
    await start.click();
    await expect(page).toHaveURL(/\/flock\/journeys\/0000/);
    expect(journeys.starts[0]).toMatchObject({ p_template_slug: null, p_custom_name: "Bath time", p_custom_milestones: ["Calm near the dish", "Toes in the water", "A full splash"], p_visibility: "private" });
    await context.close();
  });

  test("mark known skills: tap, save, and the button counts them", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { knownSlugs: ["target-training"] } });
    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Echo" }).click();
    await page.getByRole("button", { name: "Mark what Echo already knows" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("What does Echo already know?");
    await expect(page.getByText("It goes on his skill list, and those journeys start as finished.")).toBeVisible();
    await expect(page.locator("[data-skill='target-training']")).toHaveAttribute("aria-pressed", "true");
    await page.locator("[data-skill='wave']").click();
    await page.getByRole("button", { name: "Save 2 skills" }).click();
    await expect(page).toHaveURL(/\/flock\/journeys\/start\?bird=/);
    expect(journeys.known[0]).toMatchObject({ p_template_slugs: ["target-training", "wave"] });
    await context.close();
  });
});

test.describe("journeys: posting updates and milestones (admin, phone)", () => {
  const CLIP = "cfstream:0123456789abcdef0123456789abcdef";
  const stepUp = { id: "00000000-0000-4000-8000-0000000074a1", birdName: "Echo", slug: "step-up", done: 2, lastPostedDaysAgo: 2 };

  test("a good day: post, answer yes, celebrate the milestone, share it", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [stepUp] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1`);
    await page.getByTestId("post-update").click();
    await expect(page.getByTestId("post-camera")).toBeVisible();
    await expect(page.getByTestId("working-on")).toHaveText("Working on: Shifts weight and steps on with one foot, then steps back off.");
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);

    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1/post?clip=${CLIP}`);
    const compose = page.getByTestId("post-compose");
    await expect(compose.getByText("How into it was Echo?")).toBeVisible();
    const post = page.getByRole("button", { name: "Post", exact: true });
    await expect(post).toBeDisabled();
    await compose.getByTestId("engagement").getByRole("radio", { name: "All in" }).click();
    await compose.getByTestId("caption").fill("Three seconds on my hand! Almonds or walnuts?");
    await expect(compose.getByTestId("posting-to")).toContainText("Posting to your followers and the community");
    await expect(compose.getByTestId("posting-to").getByRole("button", { name: "Change" })).toBeVisible();
    await post.click();

    const after = page.getByTestId("after-post");
    await expect(after).toContainText("Posted to Echo's journey");
    await expect(after.getByRole("heading")).toHaveText("Did Echo step on with one foot?");
    await expect(page.getByTestId("tip")).toHaveCount(0);
    const posted = journeys.calls.find((c) => c.fn === "journey_post_update")!;
    expect(posted.args).toMatchObject({ p_journey_id: "00000000-0000-4000-8000-0000000074a1", p_clip_ref: CLIP, p_engagement: "all_in", p_caption: "Three seconds on my hand! Almonds or walnuts?" });
    await after.getByRole("button", { name: "Yes!" }).click();

    await expect(page).toHaveURL(/\/milestone\/3$/);
    expect(journeys.calls.find((c) => c.fn === "journey_reach_milestone")!.args).toMatchObject({ p_journey_id: "00000000-0000-4000-8000-0000000074a1", p_position: 3 });
    await expect(page.getByTestId("celebrate-eyebrow")).toHaveText("Milestone 3 of 7 · Step up");
    await expect(page.getByTestId("celebrate-line")).toHaveText("Echo stepped on with one foot!");
    await expect(page.getByText("Day 17. 4 to go.")).toBeVisible();
    await expect(page.getByTestId("progress-ring")).toHaveAttribute("data-done", "3");
    await page.getByRole("button", { name: "Share with the community" }).click();
    await expect(page.getByTestId("shared")).toHaveText("Shared with the community");
    expect(journeys.calls.find((c) => c.fn === "journey_share_milestone")!.args).toMatchObject({ p_position: 3 });
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page).toHaveURL(new RegExp(`/flock/journeys/00000000-0000-4000-8000-0000000074a1$`));
    await context.close();
  });

  test("a distracted day: a tip instead of the question", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [stepUp] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1/post?clip=${CLIP}`);
    await page.getByTestId("engagement").getByRole("radio", { name: "Distracted" }).click();
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByTestId("tip")).toContainText("A tip for next time");
    await expect(page.getByTestId("tip")).toContainText("Keep it to a few minutes, and stop while your bird still wants more.");
    await expect(page.getByTestId("after-post").getByRole("button", { name: "Yes!" })).toHaveCount(0);
    await page.getByRole("button", { name: "Back to the journey" }).click();
    await expect(page).toHaveURL(new RegExp(`/flock/journeys/00000000-0000-4000-8000-0000000074a1$`));
    expect(journeys.calls.some((c) => c.fn === "journey_reach_milestone")).toBe(false);
    await context.close();
  });

  test("the last milestone finishes the journey: learned, on the skill list, a tip for the next person", async ({ browser, baseURL }) => {
    const spin = { id: "00000000-0000-4000-8000-0000000074a2", birdName: "Willow", slug: "spin", done: 4 };
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [spin] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a2/post?clip=${CLIP}`);
    await page.getByTestId("engagement").getByRole("radio", { name: "All in" }).click();
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByTestId("after-post").getByRole("heading")).toHaveText("Did Willow spin to a flick of your finger?");
    await page.getByRole("button", { name: "Yes!" }).click();
    await expect(page).toHaveURL(/\/finished$/);
    await expect(page.getByTestId("finished-title")).toHaveText("Willow learned spin");
    await expect(page.getByText("Spin is now on Willow's skill list.")).toBeVisible();
    await expect(page.getByText("Shown to members who start Spin later.")).toBeVisible();
    await page.getByTestId("finisher-tip").fill("Pick one direction and stay with it.");
    await page.getByRole("button", { name: "Share and finish" }).click();
    await expect(page).toHaveURL(new RegExp(`/flock/journeys/00000000-0000-4000-8000-0000000074a2$`));
    expect(journeys.calls.find((c) => c.fn === "journey_save_finisher_tip")!.args).toMatchObject({ p_journey_id: "00000000-0000-4000-8000-0000000074a2", p_body: "Pick one direction and stay with it." });
    expect(journeys.calls.find((c) => c.fn === "journey_share_milestone")!.args).toMatchObject({ p_position: 5 });
    await context.close();
  });

  test("which journey: with two going, Post an update asks which, with when each was last posted", async ({ browser, baseURL }) => {
    const spin = { id: "00000000-0000-4000-8000-0000000074a2", birdName: "Willow", slug: "spin", done: 1 };
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { seed: [stepUp, spin] } });
    await page.goto("/flock/journeys");
    await page.getByTestId("post-update-any").click();
    const sheet = page.getByTestId("which-journey");
    await expect(page.getByRole("heading", { name: "Post an update for…" })).toBeVisible();
    await expect(sheet.locator("[data-journey]")).toHaveCount(2);
    await expect(sheet.locator("[data-journey='00000000-0000-4000-8000-0000000074a1']")).toContainText("Echo · Step up");
    await expect(sheet.locator("[data-journey='00000000-0000-4000-8000-0000000074a1']")).toContainText("Last posted 2 days ago");
    await expect(sheet.locator("[data-journey='00000000-0000-4000-8000-0000000074a2']")).toContainText("Nothing posted yet");
    await expect(sheet.getByRole("button", { name: "Or start a new journey" })).toBeVisible();
    await sheet.locator("[data-journey='00000000-0000-4000-8000-0000000074a2']").click();
    await expect(page).toHaveURL(new RegExp(`/flock/journeys/00000000-0000-4000-8000-0000000074a2/post$`));
    await context.close();
  });

  test("at the clip limit the camera offers Flock membership instead", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { tier: "premium", seed: [stepUp], canAddClip: false } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1/post`);
    const card = page.getByTestId("clip-limit");
    await expect(card.getByRole("heading")).toHaveText("This journey has 20 clips");
    await expect(card.getByRole("link", { name: "Compare with Flock membership" })).toHaveAttribute("href", "/flock/you/membership");
    await context.close();
  });

  test("free and premium post privately: Posting to just you, no Change", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { tier: "premium", seed: [{ ...stepUp, visibility: "private" }] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1/post?clip=${CLIP}`);
    await expect(page.getByTestId("posting-to")).toHaveText("Posting to just you");
    await expect(page.getByTestId("posting-to").getByRole("button", { name: "Change" })).toHaveCount(0);
    await context.close();
  });

  test("Diet conversion: a heads-up at the amber trend; a weight pause lifts only after confirming the vet call", async ({ browser, baseURL }) => {
    const diet = { id: "00000000-0000-4000-8000-0000000074a2", birdName: "Willow", slug: "diet-conversion", done: 1 };
    let o = await open(browser, baseURL!, { admin: true, journeys: { seed: [diet], weight: { level: "notice", start: 400, now: 389 } } });
    await o.page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a2`);
    await expect(o.page.getByTestId("weight-line")).toHaveText("Starting weight 400 g · 3-day average 389 g");
    await expect(o.page.getByTestId("weight-notice")).toHaveText("Willow's weight is down a little from the start. Keep weighing every day, and go slower if it keeps dropping.");
    await expect(o.page.getByTestId("post-update")).toBeVisible();
    await o.context.close();

    o = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ ...diet, status: "paused", pausedReason: "weight_drop" }], weight: { level: "pause", start: 400, now: 378 } } });
    await o.page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a2`);
    const paused = o.page.getByTestId("weight-paused");
    await expect(paused).toContainText("Willow's weight has dropped. Put the usual food back and call your avian vet before going further.");
    await expect(o.page.getByTestId("post-update")).toHaveCount(0);
    const resume = paused.getByRole("button", { name: "Resume the journey" });
    await expect(resume).toBeDisabled();
    await paused.getByTestId("vet-confirm").check();
    await resume.click();
    await expect.poll(() => o.journeys.calls.some((c) => c.fn === "journey_resume_after_vet")).toBe(true);
    await expect(o.page.getByTestId("post-update")).toBeVisible();
    await o.context.close();
  });

  test("Diet conversion's weight card: the 3-day average line, a reading left out, a re-weigh, missed days, and a quick drop", async ({ browser, baseURL }) => {
    const id = "00000000-0000-4000-8000-0000000074a2";
    const diet = { id, birdName: "Willow", slug: "diet-conversion", done: 2, vetCheck: "talked" as const };
    let o = await open(browser, baseURL!, { admin: true, journeys: { seed: [diet], weight: { level: "none", start: 400, now: 398, avg: 399,
      excluded: [{ grams: 371, daysAgo: 3, reason: "other_time" }] } } });
    await o.page.goto(`/flock/journeys/${id}`);
    const card = o.page.getByTestId("weight-card");
    await expect(card.getByTestId("weight-line")).toHaveText("Starting weight 400 g · 3-day average 399 g");
    await expect(card.getByTestId("weight-avg-line")).toBeVisible();
    await expect(card.locator("[data-counted='false']")).toHaveCount(1);
    await expect(card.getByTestId("weight-not-counted")).toContainText("371 g · Not counted: weighed at a different time than usual.");
    await expect(card.getByTestId("weight-recheck")).toHaveCount(0);
    await expect(card.getByTestId("weigh-today")).toHaveCount(0);
    await o.context.close();

    // A sudden drop waiting for the re-weigh, and no weigh-in for a few days.
    o = await open(browser, baseURL!, { admin: true, journeys: { seed: [diet], weight: { level: "none", start: 400, now: 360, avg: 400, recheck: true, missed: true },
      weighReminders: [{ journey_id: id, bird_id: "00000000-0000-4000-8000-0000000071b9", bird_name: "Willow", days_since_weigh: 3 }] } });
    await o.page.goto(`/flock/journeys/${id}`);
    const recheck = o.page.getByTestId("weight-recheck");
    await expect(recheck).toContainText("That's a big change from last time. Weigh Willow again to double-check?");
    await expect(o.page.getByTestId("weight-chart").locator("[data-counted='false']")).toHaveCount(1);
    await expect(recheck.getByRole("link", { name: "Weigh Willow again" })).toHaveAttribute("href", /\/birds\/.+\/weight\?log=true$/);
    await expect(o.page.getByTestId("weight-card").getByTestId("weigh-today")).toContainText("Weigh Willow today so we can keep an eye on things during the switch.");
    await o.page.goto("/flock");
    await expect(o.page.getByTestId("weigh-today")).toContainText("Weigh Willow today so we can keep an eye on things during the switch.");
    await expect(o.page.getByTestId("weigh-today").getByRole("link", { name: "Log a weight" })).toHaveAttribute("href", "/birds/00000000-0000-4000-8000-0000000071b9/weight?log=true");
    await o.context.close();

    // The re-weigh confirmed it: paused, with the quick-drop message.
    o = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ ...diet, status: "paused", pausedReason: "weight_drop" }], weight: { level: "pause", start: 400, now: 362, avg: 374, pauseKind: "sudden" } } });
    await o.page.goto(`/flock/journeys/${id}`);
    await expect(o.page.getByTestId("weight-paused")).toContainText("Willow's weight dropped quickly. Put the usual food back and call your avian vet today.");
    await expect(o.page.getByTestId("weight-recheck")).toHaveCount(0);
    await o.context.close();
  });
});

test.describe("journeys: pages, the Journeys tab, following and Today (admin, phone)", () => {
  const mine = { id: "00000000-0000-4000-8000-0000000074a1", birdName: "Echo", slug: "step-up", done: 3, clips: 4, followers: 6 };
  const kiwi = { id: "00000000-0000-4000-8000-0000000074a3", birdName: "Kiwi", slug: "recall", done: 5, clips: 3, owner: "Alex R.", region: "Great Lakes", followers: 2 };
  const mango = { id: "00000000-0000-4000-8000-0000000074a4", birdName: "Mango", slug: "spin", done: 2, clips: 2, owner: "Cy T.", region: "Texas" };

  test("your journey: header, progress, clip grid with tags, and the menu", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [mine] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Echo · Step up");
    await expect(page.getByText("Day 17 · 6 following")).toBeVisible();
    await expect(page.getByTestId("journey-progress")).toHaveText("3 of 7 · next: Steps up with both feet.");
    await expect(page.getByTestId("progress-bar").locator("span")).toHaveCount(7);
    await expect(page.getByTestId("post-update")).toBeVisible();
    await expect(page.getByRole("button", { name: "Day one vs. now" })).toBeVisible();
    const grid = page.getByTestId("clip-grid");
    await expect(grid.locator("[data-tile]")).toHaveCount(4);
    await expect(grid.locator("[data-tag='milestone']")).toHaveText(/Milestone/);
    await expect(grid.locator("[data-tag='question']")).toHaveText(/Question/);
    await expect(grid.locator("[data-tag='day_one']")).toHaveText(/Day one/);
    await expect(page.getByTestId("follow")).toHaveCount(0);

    await page.getByTestId("journey-menu-button").click();
    const menu = page.getByTestId("journey-menu");
    await expect(menu.locator("[data-menu]")).toHaveText([
      "Pause this journeyKeeps everything. Drops out of the callout until you resume.",
      "We're happy where we areEnds it gently. No badge, no judgment.",
      "Change who sees itCommunity or just me",
      "Delete journeyRemoves the journey and its clips",
    ]);
    await menu.locator("[data-menu='pause']").click();
    await expect.poll(() => journeys.calls.find((c) => c.fn === "journey_set_status")?.args).toMatchObject({ p_status: "paused" });
    await expect(page.getByTestId("paused-note")).toHaveText("This journey is paused.");
    await page.getByTestId("journey-menu-button").click();
    await expect(page.getByTestId("journey-menu").locator("[data-menu='resume']")).toBeVisible();
    await page.getByTestId("journey-menu").locator("[data-menu='who']").click();
    await page.getByTestId("menu-visibility").getByRole("radio", { name: "Just me" }).click();
    await expect.poll(() => journeys.calls.find((c) => c.fn === "journey_set_visibility")?.args).toMatchObject({ p_visibility: "private" });
    await page.getByTestId("journey-menu-button").click();
    await page.getByTestId("journey-menu").locator("[data-menu='delete']").click();
    await expect(page.getByTestId("delete-confirm")).toContainText("This removes the journey, its milestones and its 4 clips for good. It can't be undone.");
    await page.getByRole("button", { name: "Keep it" }).click();
    await expect(page.getByTestId("journey-menu")).toBeVisible();
    await context.close();
  });

  test("someone else's community journey: Follow (members), no menu, no posting", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [kiwi] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a3`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kiwi · Recall");
    await expect(page.getByTestId("journey-menu-button")).toHaveCount(0);
    await expect(page.getByTestId("post-update")).toHaveCount(0);
    const follow = page.getByTestId("follow");
    await expect(follow).toHaveText("Follow");
    await follow.click();
    await expect(follow).toHaveText("Following");
    expect(journeys.calls.find((c) => c.fn === "journey_follow")!.args).toMatchObject({ p_journey_id: "00000000-0000-4000-8000-0000000074a3", p_follow: true });
    await context.close();
  });

  test("app premium reads community journeys but can't follow or cheer", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { tier: "premium", seed: [kiwi] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a3`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kiwi · Recall");
    await expect(page.getByTestId("follow")).toHaveCount(0);
    await page.getByTestId("clip-grid").locator("[data-tile]").first().click();
    await expect(page.getByTestId("story")).toBeVisible();
    await expect(page.getByTestId("go-bird")).toHaveCount(0);
    await context.close();
  });

  test("the Journeys tab: big cards, and the chips change what's shown", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [mine, kiwi, { ...mango, following: true }] } });
    await page.goto("/flock/journeys");
    const cards = page.getByTestId("journey-cards").locator("[data-journey-card]");
    await expect(cards).toHaveCount(3);
    await expect(page.locator("[data-journey-card='00000000-0000-4000-8000-0000000074a3']")).toContainText("Kiwi · Recall");
    await expect(page.locator("[data-journey-card='00000000-0000-4000-8000-0000000074a3']")).toContainText("5 of 7 · Alex R. · 2 following");
    await page.getByTestId("journeys-chips").getByRole("button", { name: "Tricks" }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Mango · Spin");
    await page.getByTestId("journeys-chips").getByRole("button", { name: "Following" }).click();
    await expect(cards).toHaveCount(1);
    await page.getByTestId("journeys-chips").getByRole("button", { name: "Basics" }).click();
    await expect(cards).toHaveCount(2);
    expect(journeys.calls.filter((c) => c.fn === "journey_feed").map((c) => c.args.p_filter)).toEqual(expect.arrayContaining(["for_you", "tricks", "following", "basics"]));
    await cards.first().click();
    await expect(page).toHaveURL(/\/flock\/journeys\/0000/);
    await context.close();
  });

  test("Today: followed journeys as rings, milestone cards with reactions, and the story viewer", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ ...kiwi, following: true }, { ...mango, following: true }] } });
    await page.goto("/flock");
    const rings = page.getByTestId("follow-rings");
    await expect(rings.getByRole("heading")).toHaveText("Journeys you follow");
    await expect(rings.locator("[data-ring]")).toHaveCount(2);
    const card = page.locator("[data-milestone-card='00000000-0000-4000-8000-0000000074a3-m5']");
    await expect(card).toContainText("Alex R. · Great Lakes · 2h");
    await expect(card.getByTestId("milestone-pill")).toHaveText("Milestone 5 of 7 · Kiwi's recall");
    await expect(card.locator("[data-reaction]")).toHaveText(["Great job · 12", "Been there · 4", "Rooting for you", "Love this"]);
    await card.locator("[data-reaction='been_there']").click();
    await expect(card.locator("[data-reaction='been_there']")).toHaveText("Been there · 5");
    expect(journeys.calls.find((c) => c.fn === "journey_react")!.args).toMatchObject({ p_subject_type: "journey_milestone", p_subject_id: "00000000-0000-4000-8000-0000000074a3-m5", p_kind: "been_there", p_on: true });

    await expect(card.getByTestId("card-comments")).toHaveText("Comment");
    await expect(card.getByTestId("card-who-reacted")).toHaveText("Who reacted");
    await rings.locator("[data-ring='00000000-0000-4000-8000-0000000074a3']").click();
    await expect(page).toHaveURL(/\/flock\/journeys\/00000000-0000-4000-8000-0000000074a3\/story\?queue=following/);
    await expect(page.getByTestId("story-title")).toHaveText("Kiwi · Recall");
    await expect(page.getByTestId("story-line")).toContainText("Alex R.");
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);
    await expect(page.getByTestId("story-comment")).toHaveText("Say something to Alex");
    await page.getByTestId("go-bird").click();
    await expect(page.getByTestId("go-bird")).toHaveText("Cheered");
    const cheer = journeys.calls.filter((c) => c.fn === "journey_react").at(-1)!;
    expect(cheer.args).toMatchObject({ p_subject_type: "journey_update", p_kind: "great_job", p_on: true });
    // Through Kiwi's clips, then on to the next bird.
    for (let k = 0; k < 3; k++) await page.getByTestId("story-next").click();
    await expect(page).toHaveURL(new RegExp(`/flock/journeys/00000000-0000-4000-8000-0000000074a4/story`));
    await expect(page.getByTestId("story-title")).toHaveText("Mango · Spin");
    await context.close();
  });

  test("comments on a milestone card: the journey in the header, the comment saved on the milestone", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ ...kiwi, following: true }] } });
    await page.goto("/flock");
    const card = page.locator("[data-milestone-card='00000000-0000-4000-8000-0000000074a3-m5']");
    await card.getByTestId("card-comments").click();
    await expect(page).toHaveURL(/\/flock\/comments\/journey_milestone\/00000000-0000-4000-8000-0000000074a3-m5\?/);
    await expect(page.getByTestId("thread-line")).toHaveText("Kiwi · Recall · Milestone 5 of 7 · Alex R.");
    await expect(page.getByTestId("no-comments")).toBeVisible();
    await expect(page.getByTestId("comment-box")).toBeFocused();
    await page.getByTestId("comment-box").fill("Rooting for Kiwi!");
    await page.getByTestId("comment-send").click();
    expect(state.calls.find((c) => c.fn === "flock_comment_create")!.args).toMatchObject({
      p_subject_type: "journey_milestone", p_subject_id: "00000000-0000-4000-8000-0000000074a3-m5", p_reply_to: null, p_body: "Rooting for Kiwi!" });
    await expect(page.locator("[data-comment]")).toContainText("Rooting for Kiwi!");
    await context.close();
  });

  test("Day one vs. now: two clips, Play both, Pick clips, and a factual summary", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { seed: [mine] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1`);
    await page.getByRole("button", { name: "Day one vs. now" }).click();
    await expect(page).toHaveURL(/\/compare/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Day one vs. now");
    await expect(page.getByTestId("compare-a")).toHaveAttribute("data-update", /9000$/);
    await expect(page.getByTestId("compare-b")).toHaveAttribute("data-update", /9003$/);
    await expect(page.getByTestId("compare-summary")).toHaveText("16 days, 4 sessions, 3 milestones.");
    await expect(page.getByTestId("play-both")).toBeVisible();
    await page.getByTestId("pick").click();
    await page.getByTestId("pick-sheet").locator("[data-pick$='9001']").click();
    await expect(page.getByTestId("compare-a")).toHaveAttribute("data-update", /9001$/);
    await context.close();
  });
});

test.describe("journeys: finisher tips (admin, phone)", () => {
  const tips = { "step-up": ["Practice right before a meal you were already serving.", "Keep your hand still and let them choose."] };

  test("setup shows one tip at a time, newest first, with Next tip and the count; no names", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { finisherTips: tips } });
    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Echo" }).click();
    await page.locator("[data-template='step-up']").click();
    const card = page.getByTestId("finisher-tips");
    await expect(card.getByRole("heading")).toHaveText("From members who've done Step up");
    await expect(card.getByTestId("finisher-tip-text")).toHaveText("\u201cPractice right before a meal you were already serving.\u201d");
    await expect(card).toContainText("Shared by 2 members who finished");
    await card.getByTestId("next-tip").click();
    await expect(card.getByTestId("finisher-tip-text")).toHaveText("\u201cKeep your hand still and let them choose.\u201d");
    await card.getByTestId("next-tip").click();
    await expect(card.getByTestId("finisher-tip-text")).toHaveText("\u201cPractice right before a meal you were already serving.\u201d");
    // A template with no tips yet shows nothing.
    await page.goto(page.url().replace("template=step-up", "template=recall"));
    await expect(page.getByTestId("journey-setup")).toBeVisible();
    await expect(page.getByTestId("finisher-tips")).toHaveCount(0);
    await context.close();
  });

  test("on your active journey too; free accounts see nothing, not even a lock", async ({ browser, baseURL }) => {
    const seed = [{ id: "00000000-0000-4000-8000-0000000074a1", birdName: "Echo", slug: "step-up", done: 2 }];
    let o = await open(browser, baseURL!, { admin: true, journeys: { seed, finisherTips: tips } });
    await o.page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1`);
    await expect(o.page.getByTestId("finisher-tips")).toContainText("From members who've done Step up");
    await o.context.close();
    o = await open(browser, baseURL!, { admin: true, journeys: { tier: "free", seed, finisherTips: tips } });
    await o.page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1`);
    await expect(o.page.getByTestId("journey-page")).toBeVisible();
    await expect(o.page.getByTestId("finisher-tips")).toHaveCount(0);
    await o.context.close();
  });
});

test.describe("journeys: what a free account sees", () => {
  test("premium templates are locked and explain app premium; only Just me; one custom journey at a time", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { tier: "free", openCustom: 1 } });
    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Buzz" }).click();
    await expect(page.locator("[data-locked]")).toHaveCount(2);
    await page.locator("[data-template='wave']").click();
    const sheet = page.getByTestId("premium-sheet");
    await expect(page.getByRole("heading", { name: "Tricks come with app premium" })).toBeVisible();
    await expect(sheet).toContainText("Unlock every trick and husbandry journey, unlimited custom journeys, and longer clips, plus the premium care features.");
    await expect(sheet).toContainText("$9.99");
    await sheet.getByRole("button", { name: "Coming soon" }).click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Compare with Flock membership" })).toHaveAttribute("href", "/flock/you/membership");
    await page.keyboard.press("Escape");
    await page.getByTestId("write-own").click();
    await expect(page.getByTestId("custom-limit-sheet")).toHaveText(
      "You have a journey you wrote yourself going already. Finish it, or mark it \"We're happy where we are,\" to write another. With app premium, you can write as many as you like.Got it");
    await page.getByRole("button", { name: "Got it" }).click();
    await page.locator("[data-template='step-up']").click();
    await expect(page.getByTestId("visibility").locator("[role='radio']")).toHaveText(["Just me"]);
    await expect(page.getByText("Sharing journeys with the community comes with Flock membership.")).toBeVisible();
    await page.getByRole("button", { name: "Start Buzz's journey" }).click();
    await expect.poll(() => journeys.starts.length).toBe(1);
    expect(journeys.starts[0]).toMatchObject({ p_visibility: "private" });
    await context.close();
  });
});

test("everyone else: every /flock URL sends them Home and no Community code loads", async ({ browser, baseURL }) => {
  for (const size of ["phone", "duo"] as const) {
    const { context, page, flockChunks } = await open(browser, baseURL!, { admin: false, size });
    // The gate (flock_enabled) is the only Community call a non-admin ever makes.
    const calls: string[] = [];
    context.on("request", (r) => { const m = r.url().match(/\/rpc\/((?:flock|journey)_\w+)/); if (m && m[1] !== "flock_enabled") calls.push(m[1]); });
    for (const path of ["/flock", "/flock/journeys", "/flock/journeys/start", "/flock/journeys/setup?bird=x&template=step-up", "/flock/journeys/known?bird=x", "/flock/journeys/00000000-0000-4000-8000-0000000074a1/post", "/flock/journeys/00000000-0000-4000-8000-0000000074a1/milestone/1", "/flock/journeys/00000000-0000-4000-8000-0000000074a1/story", "/flock/journeys/00000000-0000-4000-8000-0000000074a1/compare", "/flock/chapter", "/flock/library", "/flock/spaces", "/flock/learn", "/flock?space=good",
      "/flock/post/new", "/flock/post/00000000-0000-4000-8000-0000000079a1", "/flock/you/notifications", "/admin/review", "/flock/idea", "/admin/ideas", "/flock/chapter?tab=events", "/flock/events/new",
      "/flock/events/00000000-0000-4000-8000-0000000083a1"]) {
      await page.goto(path);
      await expect(page, `${size} ${path}`).toHaveURL(/\/dashboard/);
    }
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);
    await expect(page.locator("[data-coach='owner-tab-flock']")).toHaveCount(0);
    expect(flockChunks, `${size}: Community code downloaded`).toEqual([]);
    expect(calls, `${size}: Community calls made`).toEqual([]);
    await context.close();
  }
});

test.describe("posts, comments and reactions (admin, phone)", () => {
  const ALEX = "00000000-0000-4000-8000-00000000e001";
  const PRIYA = "00000000-0000-4000-8000-00000000e002";
  const POST = "00000000-0000-4000-8000-0000000079a1";
  const PRIYA_C = "00000000-0000-4000-8000-0000000079c1";
  const seed = (state: FlockState) => {
    state.posts.push({ post_id: POST, author_id: ALEX, author_name: "Alex R.", space: "learn", title: "Recall treats", body: "What treat works best for recall?",
      status: "live", created_at: new Date(Date.now() - 3 * 3_600_000).toISOString(), great_job: 2, been_there: 1, mine: [] });
    state.comments.push({ comment_id: PRIYA_C, subject_type: "post", subject_id: POST, author_id: PRIYA, author_name: "Priya S.",
      body: "Mango ignores almonds.", created_at: new Date(Date.now() - 60 * 60_000).toISOString(), great_job: 3, mine: [] });
  };
  const created = (state: FlockState, fn: string) => state.calls.filter((c) => c.fn === fn);

  test("write a post: Post to chips, title, text, the GPS note; Do good waits for review", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock");
    await page.getByTestId("compose-prompt").click();
    await expect(page).toHaveURL(/\/flock\/post\/new$/);
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);
    const chips = page.getByTestId("post-to").getByRole("button");
    await expect(chips).toHaveText(["Learn together", "Do good", "Great Lakes chapter", "Start here"]);
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("gps-note")).toHaveText("Photos lose their location data when you post.");
    await page.getByTestId("post-title").fill("Pegboard foraging");
    await page.getByTestId("post-body-input").fill("Thinking of building one for Echo out of a pegboard. Would love to see yours before I start.");
    await page.getByTestId("composer-post").click();
    await expect(page).toHaveURL(/\/flock\?space=learn$/);
    await expect(page.locator("[data-post]").first()).toContainText("Pegboard foraging");
    expect(created(state, "flock_post_create")[0].args).toMatchObject({ p_space: "learn", p_title: "Pegboard foraging", p_photo_paths: [], p_bird_id: null, p_vet_nudged: false });

    await page.goto("/flock/post/new?space=good");
    await expect(page.getByTestId("post-to").locator("[data-space='good']")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("review-hint")).toContainText("We review Do good posts before they go live");
    await expect(page.getByTestId("composer-post")).toHaveText("Send for review");
    await page.getByTestId("post-body-input").fill("Our local rescue took in 12 birds this month and is low on pellets.");
    await page.getByTestId("composer-post").click();
    await expect(page).toHaveURL(/\/flock\?space=good$/);
    await expect(page.locator("[data-post]").first().getByTestId("post-status")).toHaveText("Waiting for review");
    // Nothing to react to or comment on until it's live.
    await expect(page.locator("[data-post]").first().getByTestId("react-button")).toHaveCount(0);
    await context.close();
  });

  test("the vet nudge: warning signs bring up the red card, and posting is never blocked", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/post/new");
    await page.getByTestId("post-body-input").fill("Echo has been fluffed up and sleeping a lot since yesterday and isn\u2019t eating much. Should I worry?");
    await page.getByTestId("composer-post").click();
    const card = page.getByTestId("vet-nudge");
    await expect(card.getByRole("heading")).toHaveText("This sounds like something for your avian vet");
    await expect(card).toContainText("Birds hide illness, so it's worth calling today rather than waiting on replies.");
    await expect(page.getByTestId("find-vet")).toHaveAttribute("href", "https://www.aav.org/page/FindAVet2");
    await expect(page.getByTestId("find-vet")).toHaveAttribute("target", "_blank");
    expect(created(state, "flock_post_create")).toHaveLength(0);
    await page.getByTestId("post-anyway").click();
    await expect(page).toHaveURL(/\/flock\?space=learn$/);
    expect(created(state, "flock_post_create")[0].args).toMatchObject({ p_vet_nudged: true });
    await context.close();
  });

  test("comments: the box is focused, replying names the person, press and hold menus", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    seed(state);
    await page.goto("/flock");
    const post = page.locator(`[data-post='${POST}']`);
    await expect(post.getByTestId("comment-count")).toHaveText("1 comment");
    await post.getByTestId("comment-button").click();
    await expect(page).toHaveURL(new RegExp(`/flock/post/${POST}\\?focus=1$`));
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);
    const box = page.getByTestId("comment-box");
    await expect(box).toBeFocused();
    await expect(box).toHaveAttribute("placeholder", "Add a comment for Alex");

    // Reply: "Replying to Priya S.", her name added, nested under her comment.
    await page.locator(`[data-comment='${PRIYA_C}']`).getByTestId("comment-reply").click();
    await expect(page.getByTestId("replying-to")).toHaveText("Replying to Priya S.");
    await expect(box).toHaveValue("@Priya ");
    await box.fill("@Priya walnut, in tiny pieces.");
    await page.getByTestId("comment-send").click();
    expect(created(state, "flock_comment_create")[0].args).toMatchObject({ p_subject_type: "post", p_subject_id: POST, p_reply_to: PRIYA_C, p_body: "@Priya walnut, in tiny pieces." });
    const mine = page.locator("[data-comment][data-reply='true']");
    await expect(mine).toContainText("Brittany K. (you)");
    await expect(page.getByTestId("replying-to")).toHaveCount(0);

    // Press and hold your own: Edit / Delete / Cancel.
    const bubble = mine.getByTestId("comment-bubble");
    const b = (await bubble.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.mouse.up();
    const sheet = page.getByTestId("action-sheet");
    await expect(sheet.getByRole("button")).toHaveText(["Edit", "Delete", "Cancel"]);
    await sheet.locator("[data-action='edit']").click();
    await expect(page.getByTestId("replying-to")).toHaveText("Editing your comment");
    await box.fill("@Priya walnut, in very tiny pieces.");
    await page.getByTestId("comment-send").click();
    expect(created(state, "flock_comment_edit")[0].args).toMatchObject({ p_body: "@Priya walnut, in very tiny pieces." });

    // Someone else's: Reply / Report / Cancel.
    await page.locator(`[data-comment='${PRIYA_C}']`).getByTestId("comment-more").click();
    await expect(page.getByTestId("action-sheet").getByRole("button")).toHaveText(["Reply", "Report", "Cancel"]);
    await page.getByTestId("action-sheet").locator("[data-action='cancel']").click();
    await expect(page.getByTestId("action-sheet")).toHaveCount(0);
    await context.close();
  });

  test("reactions: Great job on a tap, all four on a hold, and who reacted with regions", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    seed(state);
    await page.goto("/flock");
    const post = page.locator(`[data-post='${POST}']`);
    await post.getByTestId("react-button").click();
    expect(created(state, "flock_react")[0].args).toMatchObject({ p_subject_type: "post", p_subject_id: POST, p_kind: "great_job", p_on: true });
    await expect(post.getByTestId("react-button")).toHaveAttribute("aria-pressed", "true");
    await post.getByTestId("react-button").click({ button: "right" });
    await expect(page.getByTestId("reaction-picker").getByRole("button")).toHaveText(["Great job", "Been there", "Rooting for you", "Love this"]);
    await page.getByTestId("reaction-picker").locator("[data-pick='love_this']").click();
    await expect(post.getByTestId("react-button")).toHaveText("Love this");

    await post.getByTestId("reaction-summary").click();
    await expect(page).toHaveURL(new RegExp(`/flock/reactions/post/${POST}$`));
    const chips = page.getByTestId("reaction-chips").getByRole("button");
    await expect(chips).toHaveText(["All 3", "Great job 2", "Been there 1"]);
    await expect(page.locator("[data-reactor]")).toHaveCount(3);
    await chips.filter({ hasText: "Been there 1" }).click();
    await expect(page.locator("[data-reactor]")).toHaveCount(1);
    await expect(page.locator("[data-reactor]")).toContainText("Sam T.");
    await expect(page.locator("[data-reactor]")).toContainText("Been there · Great Lakes");
    await context.close();
  });

  test("your own post: press and hold for Edit / Delete; the hourly limit is a kind message", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    seed(state);
    await page.goto("/flock/post/new");
    await page.getByTestId("post-body-input").fill("Hello, Flock!");
    await page.getByTestId("composer-post").click();
    await expect(page).toHaveURL(/\/flock\?space=learn$/);
    const mine = page.locator("[data-post]").filter({ hasText: "Hello, Flock!" });
    await mine.getByTestId("post-more").click();
    await expect(page.getByTestId("action-sheet").getByRole("button")).toHaveText(["Edit", "Delete", "Cancel"]);
    await page.getByTestId("action-sheet").locator("[data-action='edit']").click();
    await expect(page).toHaveURL(/\/flock\/post\/[0-9a-f-]+\/edit$/);
    await expect(page.getByTestId("post-body-input")).toHaveValue("Hello, Flock!");
    await page.getByTestId("post-body-input").fill("Hello, Flock! Echo says hi.");
    await page.getByTestId("composer-post").click();
    expect(created(state, "flock_post_edit")[0].args).toMatchObject({ p_body: "Hello, Flock! Echo says hi." });
    // Someone else's post: Reply / Report / Cancel.
    await page.goto("/flock");
    await page.locator(`[data-post='${POST}']`).getByTestId("post-more").click();
    await expect(page.getByTestId("action-sheet").getByRole("button")).toHaveText(["Reply", "Report", "Cancel"]);
    await page.getByTestId("action-sheet").locator("[data-action='cancel']").click();

    state.rateLimit = "posts";
    await page.goto("/flock/post/new");
    await page.getByTestId("post-body-input").fill("One more thing");
    await page.getByTestId("composer-post").click();
    await expect(page.getByTestId("composer-error")).toHaveText("You've shared a lot this hour. Take a breather and post again a little later.");
    await expect(page.getByTestId("post-body-input")).toHaveValue("One more thing");
    await context.close();
  });

  test("the chapter's Posts list its posts and post to the chapter", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.posts.push({ post_id: "00000000-0000-4000-8000-0000000079b1", author_id: ALEX, author_name: "Alex R.", space: "chapter", body: "Picnic in Fort Wayne on Saturday?",
      status: "live", created_at: new Date(Date.now() - 86_400_000).toISOString() });
    await page.goto("/flock/chapter");
    await expect(page.getByTestId("chapter-posts")).toContainText("Picnic in Fort Wayne on Saturday?");
    await expect(page.getByTestId("compose-prompt")).toContainText("Post to the Great Lakes chapter");
    await page.getByTestId("compose-prompt").click();
    await expect(page.getByTestId("post-to").locator("[data-space='chapter']")).toHaveAttribute("aria-pressed", "true");
    await context.close();
  });
});

test.describe("reporting, the review queue and notifications (admin, phone)", () => {
  const ALEX = "00000000-0000-4000-8000-00000000e001";
  const POST = "00000000-0000-4000-8000-0000000079a1";
  const COMMENT = "00000000-0000-4000-8000-0000000079c1";
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const seedPost = (state: FlockState) => {
    state.posts.push({ post_id: POST, author_id: ALEX, author_name: "Alex R.", space: "learn", body: "Just clip his wings, problem solved.", status: "live", created_at: hoursAgo(2) });
    state.comments.push({ comment_id: COMMENT, subject_type: "post", subject_id: POST, author_id: ALEX, author_name: "Alex R.", body: "Works every time.", created_at: hoursAgo(1) });
  };

  test("report a post or a comment: a reason, an optional note, and a private thank-you", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    seedPost(state);
    await page.goto("/flock");
    await page.locator(`[data-post='${POST}']`).getByTestId("post-more").click();
    await expect(page.getByTestId("action-sheet").getByRole("button")).toHaveText(["Reply", "Report", "Cancel"]);
    await page.getByTestId("action-sheet").locator("[data-action='report']").click();
    const sheet = page.getByTestId("report-sheet");
    await expect(sheet.getByRole("radio")).toHaveText(["Unkind or harassing", "Unsafe advice for birds", "Spam or selling", "Something else"]);
    await expect(sheet.getByRole("button", { name: "Send report" })).toBeDisabled();
    await sheet.locator("[data-reason='unsafe']").click();
    await page.getByTestId("report-note").fill("Clipping isn't a behavior fix.");
    await sheet.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByTestId("report-done")).toContainText("the person who posted it won't know it was you");
    expect(state.calls.find((c) => c.fn === "flock_report")!.args).toMatchObject({ p_subject_type: "post", p_subject_id: POST, p_reason: "unsafe", p_note: "Clipping isn't a behavior fix." });
    await page.getByRole("button", { name: "Done" }).click();

    await page.goto(`/flock/post/${POST}`);
    await page.locator(`[data-comment='${COMMENT}']`).getByTestId("comment-more").click();
    await expect(page.getByTestId("action-sheet").getByRole("button")).toHaveText(["Reply", "Report", "Cancel"]);
    await page.getByTestId("action-sheet").locator("[data-action='report']").click();
    await page.getByTestId("report-sheet").locator("[data-reason='spam']").click();
    await page.getByTestId("report-sheet").getByRole("button", { name: "Send report" }).click();
    expect(state.calls.filter((c) => c.fn === "flock_report").at(-1)!.args).toMatchObject({ p_subject_type: "comment", p_subject_id: COMMENT, p_reason: "spam", p_note: null });
    await context.close();
  });

  test("notifications: Today and Earlier, grouped cheers, filters, unread dots, push and email coming", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    const base = { ids: ["n"], others: 0, detail: null, note: null, post_id: null, post_title: null, post_space: null, journey_id: null, bird_name: null, skill: null, milestone_title: null, region_name: null, unread: true };
    state.notifications.push(
      { ...base, ids: ["n1"], kind: "reply", actor_name: "Priya S.", subject_type: "comment", subject_id: "c1", detail: "reply", post_id: POST, created_at: new Date(Date.now() - 60_000).toISOString() },
      { ...base, ids: ["n2"], kind: "cheer", actor_name: "Sam T.", others: 11, subject_type: "journey_milestone", subject_id: "m1", detail: "great_job", journey_id: "00000000-0000-4000-8000-0000000074a1", bird_name: "Echo", skill: "Step up", milestone_title: "Steps up with both feet.", created_at: new Date(Date.now() - 2 * 60_000).toISOString() },
      { ...base, ids: ["n3"], kind: "review", actor_name: null, subject_type: "post", subject_id: "p9", detail: "approved", post_id: "00000000-0000-4000-8000-0000000079f9", created_at: new Date(Date.now() - 3 * 60_000).toISOString(), unread: false },
      { ...base, ids: ["n4"], kind: "clip", actor_name: "Alex R.", subject_type: "journey_update", subject_id: "00000000-0000-4000-8000-0000000079e1", journey_id: "00000000-0000-4000-8000-0000000074a3", bird_name: "Kiwi", created_at: hoursAgo(30) },
      { ...base, ids: ["n5"], kind: "chapter", actor_name: "Dana M.", subject_type: "post", subject_id: "p8", post_id: "00000000-0000-4000-8000-0000000079f8", region_name: "Great Lakes", created_at: hoursAgo(50) },
    );
    await page.goto("/flock/you/notifications");
    const chips = page.getByTestId("notif-chips").getByRole("button");
    await expect(chips).toHaveText(["All", "Replies", "Cheers", "My chapter"]);
    const today = page.getByTestId("notif-today");
    await expect(today.locator("[data-notification]")).toHaveText([
      /Priya S\. replied to your comment/,
      /12 people cheered Echo's milestone: steps up with both feet/,
      /Your Do good post is live\. Thanks for sharing it\./,
    ]);
    await expect(page.getByTestId("notif-earlier").locator("[data-notification]")).toHaveText([
      /Kiwi posted a new clip in a journey you follow/,
      /Great Lakes: Dana M\. posted in your chapter/,
    ]);
    await expect(page.getByTestId("unread-dot")).toHaveCount(4);
    await expect(page.getByTestId("notif-settings")).toContainText("Push notifications and email for the Community are coming.");
    await expect.poll(() => state.calls.some((c) => c.fn === "flock_notifications_mark_read")).toBe(true);

    await chips.filter({ hasText: "Cheers" }).click();
    await expect(page).toHaveURL(/filter=cheers/);
    await expect(page.locator("[data-notification]")).toHaveCount(1);
    await chips.filter({ hasText: "All" }).click();
    await page.locator("[data-notification='reply']").click();
    await expect(page).toHaveURL(new RegExp(`/flock/post/${POST}$`));
    await context.close();
  });

  test("the review queue: Do good approve / ask for changes / decline; reports remove / message / keep", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    const item = { author_id: ALEX, author_region: "Great Lakes", title: null, photo_count: 0, report_count: 0, reasons: [], notes: [], hidden: false, removed: false, messaged_at: null, journey_id: null };
    state.queue.push(
      { ...item, item_type: "good", subject_type: "post", subject_id: "00000000-0000-4000-8000-0000000079d1", post_id: "00000000-0000-4000-8000-0000000079d1", author_name: "Jordan L.", title: "Help Midwest Avian Rescue replace its aviary roof", body: "They need $4,000 by December.", created_at: hoursAgo(3) },
      { ...item, item_type: "good", subject_type: "post", subject_id: "00000000-0000-4000-8000-0000000079d2", post_id: "00000000-0000-4000-8000-0000000079d2", author_name: "Priya S.", body: "Fosters needed in Ann Arbor.", created_at: hoursAgo(5) },
      { ...item, item_type: "report", subject_type: "comment", subject_id: "00000000-0000-4000-8000-0000000079d3", post_id: POST, author_name: "Alex R.", body: "Just clip his wings, problem solved", report_count: 2, reasons: ["unsafe"], notes: ["Clipping isn't a fix."], hidden: false, created_at: hoursAgo(1) },
    );
    await page.goto("/admin/review");
    await expect(page.getByRole("heading", { level: 1, name: "Review queue" })).toBeVisible();
    await expect(page.getByTestId("queue-chips").getByRole("button")).toHaveText(["All 3", "Do good 2", "Events 0", "Reports 1"]);
    const roof = page.locator("[data-subject='00000000-0000-4000-8000-0000000079d1']");
    await expect(roof).toContainText("Help Midwest Avian Rescue replace its aviary roof");
    await roof.locator("[data-act='approve']").click();
    expect(state.calls.find((c) => c.fn === "flock_review_post")!.args).toMatchObject({ p_post_id: "00000000-0000-4000-8000-0000000079d1", p_decision: "approve" });
    await expect(page.getByTestId("queue-chips").getByRole("button")).toHaveText(["All 2", "Do good 1", "Events 0", "Reports 1"]);

    await page.locator("[data-subject='00000000-0000-4000-8000-0000000079d2'] [data-act='changes']").click();
    const send = page.getByRole("button", { name: "Send to the author" });
    await expect(send).toBeDisabled();
    await page.getByTestId("review-note-input").fill("Add the rescue's name and a link to its wish list.");
    await send.click();
    expect(state.calls.filter((c) => c.fn === "flock_review_post").at(-1)!.args).toMatchObject({ p_decision: "changes", p_note: "Add the rescue's name and a link to its wish list." });

    const rep = page.locator("[data-subject='00000000-0000-4000-8000-0000000079d3']");
    await expect(rep).toContainText("Reported by 2 members");
    await expect(rep).toContainText("“Just clip his wings, problem solved”");
    await expect(rep.getByTestId("report-reasons")).toContainText("Unsafe advice for birds");
    await rep.locator("[data-act='message']").click();
    await page.getByTestId("review-note-input").fill("Please explain why, or edit it.");
    await page.getByRole("button", { name: "Send message" }).click();
    expect(state.calls.filter((c) => c.fn === "flock_resolve_report").at(-1)!.args).toMatchObject({ p_subject_type: "comment", p_action: "message", p_note: "Please explain why, or edit it." });
    await rep.locator("[data-act='keep']").click();
    expect(state.calls.filter((c) => c.fn === "flock_resolve_report").at(-1)!.args).toMatchObject({ p_action: "keep" });
    await expect(page.getByTestId("queue-empty")).toHaveText("Nothing waiting. Nice.");
    await context.close();
  });
});

test.describe("today's idea and We tried it (admin, phone)", () => {
  const IDEA = { idea_id: "00000000-0000-4000-8000-0000000082a1", shown_on: "2026-11-08", title: "Wrap a treat in a paper cup", category: "enrichment",
    body: "Fold a plain paper cup around a favorite treat and hand it over.", has_photo: false, is_reused: false,
    my_outcome: null, my_bird_id: null, my_has_photo: false, tried: null, loved_pct: null, top_species: null, photo_count: 0 };

  test("the card on Today, How did [bird] do?, and the tally only from five answers", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.idea = { ...IDEA };
    await page.goto("/flock");
    const card = page.getByTestId("todays-idea");
    await expect(card).toContainText("Today's idea · Enrichment");
    await expect(card.getByRole("heading")).toHaveText("Wrap a treat in a paper cup");
    await card.getByTestId("we-tried-it").click();
    await expect(page).toHaveURL(/\/flock\/idea$/);
    const how = page.getByTestId("how-did");
    await expect(how.getByRole("heading")).toHaveText(/^How did \w+ do\?$/);
    await expect(how.getByRole("radio")).toHaveText(["Loved it", "Curious", /^Not for (him|her|them)$/]);
    await expect(page.getByRole("button", { name: "Share how it went" })).toBeDisabled();
    await how.locator("[data-outcome='loved']").click();
    await page.getByRole("button", { name: "Share how it went" }).click();
    expect(state.calls.find((c) => c.fn === "flock_idea_try")!.args).toMatchObject({ p_idea_id: IDEA.idea_id, p_outcome: "loved", p_photo_path: null });
    await expect(page.getByTestId("my-answer")).toContainText("Loved it");
    await expect(page.getByTestId("tally-soon")).toHaveText("Once five birds have tried it, you'll see how everyone did.");

    Object.assign(state.idea!, { tried: 38, loved_pct: 71, top_species: ["Sun conure", "Caique"] });
    await page.reload();
    const tally = page.getByTestId("idea-tally");
    await expect(tally.getByRole("heading")).toHaveText("38 birds tried it today");
    await expect(tally).toContainText("71% loved it.");
    await expect(tally).toContainText("Most popular with sun conures and caiques.");
    await page.goto("/flock");
    await expect(page.getByTestId("we-tried-it")).toHaveText("You tried it · See how everyone did");
    await context.close();
  });

  test("no idea today: no card on Today", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await expect(page.getByTestId("compose-prompt")).toBeVisible();
    await expect(page.getByTestId("todays-idea")).toHaveCount(0);
    await context.close();
  });

  test("admin schedule: two weeks, drafts vs ready, empty days flagged, reorder, New idea", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    const day = (n: number) => new Date(Date.UTC(2026, 10, 22 + n)).toISOString().slice(0, 10);
    const row = (n: number, x: Record<string, any>) => ({ day: day(n), idea_id: null, title: null, category: null, body: null, status: null, is_favorite: null, has_photo: null, reused_idea_id: null, reused_title: null, ...x });
    state.schedule = Array.from({ length: 14 }, (_, n) => row(n, n === 6
      ? { reused_idea_id: "00000000-0000-4000-8000-0000000082b9", reused_title: "Muffin tin foraging" }
      : { idea_id: `00000000-0000-4000-8000-0000000082${String(10 + n)}`, title: `Idea ${n + 1}`, category: n % 2 ? "training" : "enrichment", body: "A few lines.", status: n < 4 ? "ready" : "draft", is_favorite: n === 0, has_photo: false }));
    await page.goto("/admin/ideas");
    await expect(page.getByRole("heading", { level: 1, name: "Today's ideas" })).toBeVisible();
    const days = page.getByTestId("idea-days").locator("[data-day]");
    await expect(days).toHaveCount(14);
    await expect(days.nth(0).getByTestId("idea-status")).toHaveText("Ready");
    await expect(days.nth(4).getByTestId("idea-status")).toHaveText("Draft");
    await expect(days.nth(6)).toHaveAttribute("data-state", "empty");
    await expect(days.nth(6)).toContainText("Empty · needs one");
    await expect(days.nth(6)).toContainText("Reuses a favorite: Muffin tin foraging");
    await days.nth(1).getByRole("button", { name: "Move later" }).click();
    expect(state.calls.find((c) => c.fn === "admin_swap_idea_days")!.args).toEqual({ p_a: day(1), p_b: day(2) });

    await page.getByTestId("new-idea").click();
    const sheet = page.getByTestId("idea-sheet");
    await sheet.getByTestId("idea-title").fill("Five-minute target session");
    await sheet.locator("[data-category='training']").click();
    await sheet.getByTestId("idea-body").fill("Reward each touch of the stick.");
    await sheet.getByTestId("idea-day").fill(day(6));
    await sheet.locator("[data-status='ready']").click();
    await sheet.getByRole("button", { name: "Save idea" }).click();
    expect(state.calls.find((c) => c.fn === "admin_save_idea")!.args).toMatchObject({
      p_id: null, p_title: "Five-minute target session", p_category: "training", p_body: "Reward each touch of the stick.", p_status: "ready", p_is_favorite: false, p_scheduled_on: day(6) });
    await context.close();
  });
});

test.describe("chapter events (admin, phone)", () => {
  const at = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  const base = { kind: "meetup", ends_at: null, mode: "in_person", place_name: null, status: "live", spot_limit: null, going: 0, maybe: 0, my_answer: null, has_photo: false, is_mine: false };
  const MEET = "00000000-0000-4000-8000-0000000083a1";
  const ONLINE = "00000000-0000-4000-8000-0000000083a2";
  const VOL = "00000000-0000-4000-8000-0000000083a3";
  const seed = (state: FlockState) => {
    state.events.push(
      { ...base, event_id: MEET, title: "Fall flock meetup", starts_at: at(3, 13), ends_at: at(3, 15), place_name: "Ann Arbor District Library", address: "343 S Fifth Ave, Ann Arbor",
        description: "Humans only this time.", going: 14, host_name: "Priya S.", host_is_lead: true,
        goers: [{ user_id: "u1", name: "Priya S.", photo_path: null }, { user_id: "u2", name: "Alex R.", photo_path: null }] },
      { ...base, event_id: ONLINE, title: "Foraging toy build night", starts_at: at(6, 19), mode: "online", going: 9, online_url: "https://meet.example.com/foraging", host_name: "Sam T." },
      { ...base, event_id: VOL, kind: "volunteer", title: "Holiday volunteer day", starts_at: at(20, 10), place_name: "Midwest Avian Rescue", going: 10, spot_limit: 10 },
      { ...base, event_id: "00000000-0000-4000-8000-0000000083a4", title: "Harvest picnic", starts_at: at(-25, 12), place_name: "Gallup Park", going: 22 },
    );
  };

  test("the Events tab: Coming up and Past, Online and Do good tags, going and spots", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    seed(state);
    await page.goto("/flock/chapter?tab=events");
    const up = page.getByTestId("events-upcoming");
    await expect(up.getByRole("heading")).toHaveText("Coming up");
    await expect(up.locator("[data-event]")).toHaveCount(3);
    await expect(up.locator(`[data-event='${MEET}']`)).toContainText("Fall flock meetup");
    await expect(up.locator(`[data-event='${MEET}']`)).toContainText("Ann Arbor District Library");
    await expect(up.locator(`[data-event='${MEET}'] [data-testid='event-count']`)).toHaveText("14 going");
    await expect(up.locator(`[data-event='${ONLINE}']`)).toContainText("Online");
    await expect(up.locator(`[data-event='${VOL}']`)).toContainText("Do good");
    await expect(up.locator(`[data-event='${VOL}'] [data-testid='event-count']`)).toHaveText("10 of 10 spots");
    await expect(page.getByTestId("events-past").locator("[data-event]")).toContainText("22 went");
    await expect(page.getByTestId("suggest-event")).toHaveText("Suggest an event");
    await context.close();
  });

  test("an in-person event: when, where, the safety note, who's going, the host; I'm going adds a calendar file", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    seed(state);
    await page.goto(`/flock/events/${MEET}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fall flock meetup");
    await expect(page.getByTestId("event-where")).toContainText("Ann Arbor District Library");
    await expect(page.getByTestId("event-where")).toContainText("343 S Fifth Ave, Ann Arbor");
    await expect(page.getByTestId("safety-note")).toHaveText("Please meet in public places, and leave birds at home unless the host says they're welcome.");
    await expect(page.getByTestId("event-goers")).toContainText("Priya, Alex, and 12 others going");
    await expect(page.getByTestId("event-host")).toHaveText("Hosted by Priya S., chapter lead");
    await expect(page.getByTestId("rsvp")).toContainText("Adds it to your calendar and sends a reminder the day before.");
    await page.locator("[data-answer='going']").click();
    expect(state.calls.find((c) => c.fn === "flock_event_rsvp")!.args).toEqual({ p_event_id: MEET, p_answer: "going" });
    await expect(page.locator("[data-answer='going']")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("reminder-line")).toHaveText("We'll remind you the day before.");
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("add-to-calendar").click()]);
    expect(download.suggestedFilename()).toMatch(/\.ics$/);
    const ics = (await import("node:fs")).readFileSync((await download.path())!, "utf8");
    expect(ics).toContain("SUMMARY:Fall flock meetup");
    expect(ics).toContain("LOCATION:Ann Arbor District Library\\, 343 S Fifth Ave\\, Ann Arbor");
    await context.close();
  });

  test("an online event's link appears only once you're going; a full volunteer day says so", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    seed(state);
    await page.goto(`/flock/events/${ONLINE}`);
    await expect(page.getByTestId("event-link-hidden")).toHaveText("The link appears once you say you're going.");
    await expect(page.getByTestId("safety-note")).toHaveCount(0);
    await page.locator("[data-answer='going']").click();
    await expect(page.getByTestId("event-link")).toHaveAttribute("href", "https://meet.example.com/foraging");
    await page.goto(`/flock/events/${VOL}`);
    await expect(page.getByTestId("event-full")).toHaveText("This one's full");
    await expect(page.locator("[data-answer]")).toHaveCount(0);
    await context.close();
  });

  test("suggest an event: online only until 15 members, then Send for review", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/chapter?tab=events");
    await page.getByTestId("suggest-event").click();
    await expect(page).toHaveURL(/\/flock\/events\/new$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Suggest an event");
    await expect(page.locator("[data-mode='in_person']")).toBeDisabled();
    await expect(page.locator("[data-mode='online']")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("in-person-locked")).toHaveText("In-person meetups open once Great Lakes has 15 members. Online get-togethers are welcome anytime.");
    await expect(page.getByTestId("event-form")).toContainText("Your chapter lead looks it over before it goes up. Usually within a day.");
    await page.getByTestId("event-title").fill("Foraging toy build night");
    const when = new Date(); when.setDate(when.getDate() + 12); when.setHours(19, 0, 0, 0);
    const p = (n: number) => String(n).padStart(2, "0");
    await page.getByTestId("event-when-input").fill(`${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}T19:00`);
    await page.getByTestId("event-about").fill("We each bring paper, boxes, and a few treats.");
    await page.getByRole("button", { name: "Send for review" }).click();
    expect(state.calls.find((c) => c.fn === "flock_event_suggest")!.args).toMatchObject({
      p_id: null, p_kind: "meetup", p_title: "Foraging toy build night", p_mode: "online", p_i_host: true, p_starts_at: when.toISOString() });
    await expect(page).toHaveURL(/\/flock\/events\/00000000-0000-4000-8000-0000000083ff$/);

    // Once the chapter is big enough, in person opens and the safety note shows on the form.
    state.eventRules = { ...state.eventRules, member_count: 15, in_person_open: true };
    await page.goto("/flock/events/new");
    await page.locator("[data-mode='in_person']").click();
    await expect(page.getByTestId("event-form")).toContainText("Please meet in public places, and leave birds at home unless the host says they're welcome.");
    await expect(page.getByTestId("in-person-locked")).toHaveCount(0);
    await context.close();
  });

  test("the review queue has Events: approve or ask for changes", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    const item = { author_id: "u2", author_region: "Great Lakes", photo_count: 0, report_count: 0, reasons: [], notes: [], hidden: false, removed: false, messaged_at: null,
      post_id: null, journey_id: null, event_mode: "online", event_place: null, event_kind: "meetup", created_at: new Date().toISOString() };
    state.queue.push(
      { ...item, item_type: "event", subject_type: "event", subject_id: "00000000-0000-4000-8000-0000000083b1", author_name: "Alex R.", title: "Bird photo night", body: "Share your best shots.", event_starts_at: new Date(Date.now() + 8 * 86_400_000).toISOString() },
      { ...item, item_type: "event", subject_type: "event", subject_id: "00000000-0000-4000-8000-0000000083b2", author_name: "Sam T.", title: "Picnic", body: null, event_mode: "in_person", event_place: "Fort Wayne park", event_starts_at: new Date(Date.now() + 9 * 86_400_000).toISOString() },
    );
    await page.goto("/admin/review");
    await expect(page.getByTestId("queue-chips").getByRole("button")).toHaveText(["All 2", "Do good 0", "Events 2", "Reports 0"]);
    const photo = page.locator("[data-subject='00000000-0000-4000-8000-0000000083b1']");
    await expect(photo).toContainText("Event suggestion");
    await expect(photo.getByTestId("queue-event-when")).toContainText("Online");
    await photo.locator("[data-act='approve']").click();
    expect(state.calls.find((c) => c.fn === "flock_review_event")!.args).toMatchObject({ p_event_id: "00000000-0000-4000-8000-0000000083b1", p_decision: "approve" });
    await page.locator("[data-subject='00000000-0000-4000-8000-0000000083b2'] [data-act='changes']").click();
    await page.getByTestId("review-note-input").fill("Which part of the park?");
    await page.getByRole("button", { name: "Send to the author" }).click();
    expect(state.calls.filter((c) => c.fn === "flock_review_event").at(-1)!.args).toMatchObject({ p_decision: "changes", p_note: "Which part of the park?" });
    await expect(page.getByTestId("queue-empty")).toBeVisible();
    await context.close();
  });
});

test.describe("chapter members and leads (admin, phone)", () => {
  const PRIYA = "00000000-0000-4000-8000-00000000f001";
  const ALEX = "00000000-0000-4000-8000-00000000f002";
  const roster = [
    { user_id: PRIYA, display_name: "Priya S.", photo_path: null, is_founder: false, is_lead: true, birds: [{ name: "Mango", species: "Blue and gold macaw" }] },
    { user_id: ALEX, display_name: "Alex R.", photo_path: null, is_founder: false, is_lead: false, birds: [{ name: "Kiwi", species: "Green-cheeked conure" }] },
    { user_id: "00000000-0000-4000-8000-00000000f003", display_name: "Brittany K.", photo_path: null, is_founder: true, is_lead: false,
      birds: [{ name: "Echo", species: "Sun conure" }, { name: "Kya", species: "Hyacinth macaw" }] },
    { user_id: "00000000-0000-4000-8000-00000000f004", display_name: "Jordan L.", photo_path: null, is_founder: false, is_lead: false, birds: [{ name: "Rio", species: "Congo grey" }] },
  ];

  test("the Members tab: search by name or species, species chips, badges, the footer", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.roster = roster;
    await page.goto("/flock/chapter?tab=members");
    const tabs = page.getByRole("tablist", { name: "Chapter sections" }).getByRole("tab");
    await expect(tabs).toHaveText(["Posts", "Events", "Resources", "Members"]);
    const rows = page.getByTestId("chapter-members").locator("[data-member]");
    await expect(rows).toHaveCount(4);
    await expect(rows.first()).toContainText("Priya S.");
    await expect(rows.first()).toContainText("Mango, Blue and gold macaw");
    await expect(rows.first().getByTestId("lead-badge")).toHaveText("Chapter lead");
    await expect(page.locator(`[data-member='00000000-0000-4000-8000-00000000f003']`)).toContainText("Echo and Kya");
    await expect(page.locator(`[data-member='00000000-0000-4000-8000-00000000f003']`)).toContainText("Founding member");
    await expect(page.getByTestId("members-chips").getByRole("button")).toHaveText(["Everyone", "Conures", "Macaws", "Greys"]);
    await page.getByTestId("members-chips").locator("[data-chip='greys']").click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Jordan L.");
    await page.getByTestId("members-chips").locator("[data-chip='everyone']").click();
    await page.getByTestId("members-search").fill("kiwi");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Alex R.");
    await page.getByTestId("members-search").fill("macaw");
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId("members-footer")).toHaveText("Only first names and birds show here. Members choose what else to share.");
    await context.close();
  });

  test("admins make or remove a chapter lead from the member's page", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.roster = roster;
    state.leadOf = { [PRIYA]: "great-lakes" };
    await page.goto(`/flock/members/${ALEX}`);
    await expect(page.getByTestId("member-lead-badge")).toHaveCount(0);
    await expect(page.getByTestId("lead-toggle")).toHaveText("Make chapter lead of Great Lakes");
    await page.getByTestId("lead-toggle").click();
    await page.getByTestId("confirm-delete").click();
    expect(state.calls.find((c) => c.fn === "admin_set_chapter_lead")!.args).toEqual({ p_user_id: ALEX, p_on: true });
    await page.goto(`/flock/members/${PRIYA}`);
    await expect(page.getByTestId("member-lead-badge")).toHaveText("Chapter lead");
    await expect(page.getByTestId("lead-toggle")).toHaveText("Remove as chapter lead");
    await page.getByTestId("lead-toggle").click();
    await expect(page.getByRole("dialog")).toContainText("They stop reviewing and editing Great Lakes events right away");
    await page.getByTestId("confirm-delete").click();
    expect(state.calls.filter((c) => c.fn === "admin_set_chapter_lead").at(-1)!.args).toEqual({ p_user_id: PRIYA, p_on: false });
    await context.close();
  });
});

test.describe("welcome, setup, profiles and chapters (admin, phone)", () => {
  test("bird chips: signed photos show, a bird without one shows its initial, a failed resize falls back; selected and unselected styles", async ({ browser, baseURL }) => {
    for (const path of ["/flock/setup", "/flock/you/edit"]) {
      const { context, page } = await open(browser, baseURL!, { admin: true, setupDone: path !== "/flock/setup", storagePhotos: true });
      await page.goto(path);
      const chip = (name: string) => page.locator("[data-bird-chip]", { hasText: name });
      await expect(page.locator("[data-bird-chip]")).toHaveCount(4);
      // Echo and Buzz: the resized photo, loaded and visible.
      for (const name of ["Echo", "Buzz"]) {
        await expect(chip(name).getByTestId("bird-thumb")).toHaveAttribute("data-photo", "loaded");
        const img = chip(name).locator("img");
        await expect(img).toHaveAttribute("src", /\/render\/image\/sign\/bird-photos\//);
        expect(await img.evaluate((e: HTMLImageElement) => e.naturalWidth)).toBeGreaterThan(0);
      }
      // Willow: the resized copy fails, so the original shows.
      await expect(chip("Willow").getByTestId("bird-thumb")).toHaveAttribute("data-photo", "loaded");
      await expect(chip("Willow").locator("img")).toHaveAttribute("src", /\/object\/sign\/bird-photos\//);
      // Max: no photo, so his initial on forest, never an empty circle.
      await expect(chip("Max").getByTestId("bird-thumb")).toHaveAttribute("data-photo", "initial");
      await expect(chip("Max").getByTestId("bird-thumb")).toHaveText("M");
      expect(await chip("Max").getByTestId("bird-thumb").evaluate((e) => getComputedStyle(e).backgroundColor)).toBe("rgb(26, 61, 46)");

      // Selected (the default): pale lime, 2px forest border, bold, a check.
      const style = (name: string) => chip(name).evaluate((e) => {
        const c = getComputedStyle(e);
        return { bg: c.backgroundColor, border: `${c.borderTopWidth} ${c.borderTopColor}`, weight: c.fontWeight, color: c.color, check: !!e.querySelector("svg"), h: e.getBoundingClientRect().height };
      });
      const on = await style("Echo");
      expect(on).toMatchObject({ bg: "rgb(205, 234, 176)", border: "2px rgb(26, 61, 46)", weight: "700", color: "rgb(26, 61, 46)", check: true });
      await chip("Echo").click();
      await expect(chip("Echo")).toHaveAttribute("aria-pressed", "false");
      // Not selected: white, 1px light border, regular, no check, same height.
      const off = await style("Echo");
      expect(off).toMatchObject({ bg: "rgb(255, 255, 255)", border: "1px rgb(201, 211, 200)", weight: "400", color: "rgb(26, 61, 46)", check: false });
      expect(off.h).toBe(on.h);
      await context.close();
    }
  });


  test("welcome shows once: first visit goes to welcome, setup saves, then never again", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true, setupDone: false });
    await page.goto("/flock");
    await expect(page).toHaveURL(/\/flock\/welcome$/);
    const welcome = page.getByTestId("flock-welcome");
    await expect(welcome.getByText("Founding member · 7 of 50")).toBeVisible();
    await expect(welcome.getByRole("heading", { level: 1 })).toHaveText("Welcome to the Flock, Brittany");
    await expect(welcome.getByText("This is a place to learn alongside other bird people, share how your birds are doing, and do some good together.")).toBeVisible();
    await expect(welcome.getByText("Takes about a minute")).toBeVisible();
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);

    await welcome.getByRole("button", { name: "Let's get you set up" }).click();
    await expect(page).toHaveURL(/\/flock\/setup$/);
    await expect(page.getByRole("progressbar", { name: "Setup progress" })).toBeVisible();
    await expect(page.getByTestId("setup-region")).toHaveText("Great Lakes · IL · IN · MI · OH");
    await expect(page.getByText("Members see your region, never your address.")).toBeVisible();
    await expect(page.getByText("Only their name, species, and photo. Care records stay private.")).toBeVisible();
    const chips = page.locator("[data-bird-chip]");
    expect(await chips.count()).toBeGreaterThan(0);
    for (const c of await chips.all()) await expect(c).toHaveAttribute("aria-pressed", "true");
    const first = chips.first();
    const firstId = await first.getAttribute("data-bird-chip");
    await first.click();
    await expect(first).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: "Go to the community" }).click();
    await expect(page).toHaveURL(/\/flock$/);
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    const saved = state.saves.at(-1)!;
    expect(saved.region_slug).toBe("great-lakes");
    expect(saved.display_name).toBe("Brittany");
    expect(typeof saved.setup_completed_at).toBe("string");
    expect(state.shownSaves.find((r) => r.bird_id === firstId)?.shown).toBe(false);
    expect(state.shownSaves.filter((r) => r.bird_id !== firstId).every((r) => r.shown)).toBe(true);

    // Never again.
    await page.goto("/flock");
    await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/flock$/);
    await page.goto("/flock/library");
    await expect(page).toHaveURL(/\/flock\/library$/);
    await context.close();
  });

  test("changing region moves you to that chapter at once", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/chapter");
    await expect(page.getByTestId("chapter-line")).toHaveText("Great Lakes · IL · IN · MI · OH");
    await expect(page.getByTestId("chapter-count")).toContainText("2 members");
    await page.getByRole("link", { name: "See members" }).click();
    await expect(page).toHaveURL(/\/flock\/chapter\?tab=members$/);
    await expect(page.getByTestId("chapter-members").getByText("Ada L.")).toBeVisible();
    // The old members screen's address lands on the tab.
    await page.goto("/flock/members");
    await expect(page).toHaveURL(/\/flock\/chapter\?tab=members$/);

    await page.goto("/flock/you");
    await page.getByRole("link", { name: "Edit profile" }).click();
    await expect(page).toHaveURL(/\/flock\/you\/edit$/);
    await page.getByRole("button", { name: "Change" }).click();
    await page.getByTestId("region-list").locator("[data-region='texas']").click();
    await expect(page.getByTestId("edit-region")).toHaveText("Texas · TX");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page).toHaveURL(/\/flock\/you$/);
    await expect(page.getByTestId("you-line")).toHaveText("Texas · Founding member");

    await page.goto("/flock/chapter");
    await expect(page.getByTestId("chapter-line")).toHaveText("Texas · TX");
    await expect(page.getByTestId("chapter-count")).toContainText("3 members · meetups unlock at 15");
    await context.close();
  });

  test("Other region: no chapter yet, and a way to pick one", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true, region: "other" });
    await page.goto("/flock/chapter");
    await expect(page.getByTestId("chapter-line")).toHaveText("No chapter yet");
    await page.getByRole("button", { name: "Choose your region" }).click();
    await expect(page.getByTestId("region-list").locator("[data-region='other']")).toHaveCount(0);
    await page.getByTestId("region-list").locator("[data-region='california']").click();
    await expect(page.getByTestId("chapter-line")).toHaveText("California · CA");
    await context.close();
  });

  test("You and Privacy: what members see, and what they never see", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock");
    await page.getByRole("link", { name: "You" }).click();
    await expect(page).toHaveURL(/\/flock\/you$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Brittany K.");
    await expect(page.getByText("Community is separate from care reminders")).toBeVisible();
    await expect(page.getByText("Founding · $15/mo · first 6 months free once the Flock opens")).toBeVisible();
    await page.getByRole("button", { name: /Privacy/ }).click();
    await expect(page).toHaveURL(/\/flock\/you\/privacy$/);
    const see = page.getByTestId("privacy-see");
    const never = page.getByTestId("privacy-never");
    for (const x of ["Your display name", "Your region (your chapter)", "Your bio", "Your profile photo", "The birds you choose to show: their name, species, and photo"]) {
      await expect(see.getByText(x, { exact: true })).toBeVisible();
    }
    for (const x of ["Your email", "Your address", "Your birds' care records and care plans", "Your sits and sitters", "Health checks and health notes", "Weights"]) {
      await expect(never.getByText(x, { exact: true })).toBeVisible();
    }
    await page.getByRole("link", { name: "Choose which birds members meet" }).click();
    await expect(page).toHaveURL(/\/flock\/you\/edit#birds$/);
    await context.close();
  });
});
