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
  /** Build D: who this account has blocked (hidden from feeds, threads and lists, as the database does). */
  blocks: { user_id: string; display_name: string | null; photo_path: null; blocked_at: string }[];
  /** Build H: the founding members page, and this account's own choice (null = no founding spot). */
  founders: { display_name: string; photo_path: string | null; chapter_name: string | null; spot_number: number }[];
  foundersShow: boolean | null;
  /** Backlog 1.6: the chapter's listings, suggestions waiting, and whether this account manages the chapter. */
  places: Record<string, any>[];
  placeSuggestions: Record<string, any>[];
  placeManage: boolean;
  /** Backlog 1.8: votes, as flock_votes_current / flock_vote return them. */
  votes: Record<string, any>[];
  /** Backlog 1.13a: this account's badges (flock_my_badges), what profiles show (flock_member_badges, by user id), and the profile switch. */
  badges: { badge: string; level: number; earned_at: string | null; unseen: boolean; at_launch: boolean }[];
  memberBadges: Record<string, { badge: string; level: number }[]>;
  badgesShown: boolean;
  /** Backlog 1.10: challenges as flock_challenge(s) return them, and their entries (post rows plus `prompt`). */
  challenges: Record<string, any>[];
  challengeEntries: Record<string, any>[];
  /** Build C: where this account stands (flock_my_access), and its join calls. */
  access: { member_now: boolean; has_membership: boolean; agreed: boolean; is_admin: boolean; guidelines_version: string; opens_at: string | null; season_ends_at: string | null };
  joinResult: string;
  /** Backlog 1.11: buddy pods, as the flock_pod* functions return them. */
  pods: {
    canWait: boolean;
    journey: Record<string, { state: string; pod_id: string | null; waiting: number; can_wait: boolean }>;
    pod: Record<string, any> | null;
    members: Record<string, any>[];
    feed: Record<string, any>[];
    mine: Record<string, any>[];
    admin: Record<string, any>[];
    adminMembers: Record<string, any>[];
  };
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
    blocks: [],
    founders: [],
    foundersShow: false,
    places: [],
    placeSuggestions: [],
    placeManage: false,
    votes: [],
    badges: [],
    memberBadges: {},
    badgesShown: true,
    challenges: [],
    challengeEntries: [],
    access: { member_now: true, has_membership: true, agreed: true, is_admin: true, guidelines_version: "2026-12", opens_at: null, season_ends_at: "2027-07-06T04:00:00Z" },
    joinResult: "joined",
    pods: { canWait: true, journey: {}, pod: null, members: [], feed: [], mine: [], admin: [], adminMembers: [] },
  };
  const blocked = (id: string) => state.blocks.some((b) => b.user_id === id);
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
  await context.route(`${MOCK}/rest/v1/founding_claims**`, (route) => {
    const row = state.foundersShow == null ? null : { show_on_founders_page: state.foundersShow };
    return wantsObject(route) ? (row ? json(route, row) : json(route, { code: "PGRST116" }, 406)) : json(route, row ? [row] : []);
  });
  await context.route(`${MOCK}/rest/v1/rpc/founding_set_show`, async (route) => {
    const args = (route.request().postDataJSON() ?? {}) as Record<string, any>;
    state.calls.push({ fn: "founding_set_show", args });
    state.foundersShow = args.p_show === true;
    return json(route, state.foundersShow);
  });
  await context.route(`${MOCK}/rest/v1/entitlements**`, (route) =>
    json(route, [{ plan: "founding", status: "trialing", source: "founding", starts_at: null, current_period_end: null, free_until: null }]));
  await context.route(`${MOCK}/rest/v1/rpc/admin_*`, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/").pop()!;
    const args = (route.request().postDataJSON() ?? {}) as Record<string, any>;
    state.calls.push({ fn, args });
    if (fn === "admin_ideas_schedule") return json(route, state.schedule);
    if (fn === "admin_ideas_unscheduled") return json(route, []);
    if (fn === "admin_pods") return json(route, state.pods.admin);
    if (fn === "admin_pod_members") return json(route, state.pods.adminMembers);
    if (fn === "admin_pod_waitlist") return json(route, [{ template_slug: "step-up", template_name: "Step up", waiting: 2, oldest: new Date().toISOString() }]);
    if (fn === "admin_save_idea") return json(route, "00000000-0000-4000-8000-0000000082aa");
    if (fn === "admin_challenges") {
      return json(route, state.challenges.map((c) => ({ challenge_id: c.challenge_id, kind: c.kind, title: c.title, region_slug: c.region_slug, region_name: c.region_name,
        state: c.state, starts_on: c.starts_on, ends_on: c.ends_on, member_count: c.member_count, entry_count: 0, updated_at: new Date().toISOString() })));
    }
    if (fn === "admin_challenge_save") return json(route, "00000000-0000-4000-8000-0000000097aa");
    if (fn === "admin_challenge_featurable") return json(route, []);
    if (fn === "admin_votes") {
      return json(route, state.votes.map((v) => ({ vote_id: v.vote_id, question: v.question, audience: v.audience, state: v.state, closes_at: v.closes_at,
        voters: v.voters, choice_count: v.choices.length, updated_at: v.closes_at })));
    }
    return json(route, null);
  });
  await context.route(`${MOCK}/rest/v1/rpc/flock_*`, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/").pop();
    const args = (route.request().postDataJSON() ?? {}) as Record<string, any>;
    if (fn === "flock_my_access") return json(route, [state.access]);
    if (fn === "flock_agree") {
      state.calls.push({ fn, args });
      if (args.p_adult !== true) return json(route, { code: "22023", message: "adult_required" }, 400);
      if (args.p_guidelines_version !== state.access.guidelines_version) return json(route, { code: "22023", message: "guidelines_outdated" }, 400);
      state.access = { ...state.access, agreed: true };
      state.profile = { ...(state.profile ?? { user_id: userId, bio: null, photo_path: null, setup_completed_at: null }), display_name: args.p_display_name, region_slug: args.p_region };
      return json(route, state.access.guidelines_version);
    }
    if (fn === "flock_join") {
      state.calls.push({ fn, args });
      if (!state.access.agreed) return json(route, { code: "42501", message: "agree_first" }, 403);
      const started = !state.access.opens_at || new Date(state.access.opens_at) <= new Date();
      state.access = { ...state.access, has_membership: true, member_now: state.access.member_now || started };
      return json(route, [{ result: state.joinResult, starts_at: state.access.opens_at, ends_at: state.access.season_ends_at }]);
    }
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
    if (fn === "flock_founders") return json(route, state.founders);
    if (fn === "flock_my_badges") return json(route, state.badges);
    if (fn === "flock_badges_seen") {
      for (const b of state.badges) if (!args.p_badges || args.p_badges.includes(b.badge)) b.unseen = false;
      return json(route, null);
    }
    if (fn === "flock_member_badges") return json(route, state.memberBadges[args.p_user_id] ?? []);
    if (fn === "flock_badges_shown") return json(route, state.badgesShown);
    if (fn === "flock_set_badges_shown") { state.badgesShown = args.p_shown === true; return json(route, state.badgesShown); }
    const ago = (mins: number) => new Date(Date.now() - mins * 60_000).toISOString();
    const counts = (r: any) => ({ great_job: r.great_job ?? 0, been_there: r.been_there ?? 0, rooting_for_you: r.rooting_for_you ?? 0, love_this: r.love_this ?? 0, mine: r.mine ?? [] });
    const postRow = (p: any) => ({
      ...counts(p), post_id: p.post_id, author_id: p.author_id, author_name: p.author_name, author_region: p.author_region ?? "Great Lakes", author_photo_path: null,
      author_is_founder: false, space: p.space, region_slug: p.space === "chapter" ? "great-lakes" : null, region_name: p.space === "chapter" ? "Great Lakes" : null,
      title: p.title ?? null, body: p.body, photo_count: p.photo_count ?? 0, bird_id: null, bird_name: null, bird_has_photo: false, status: p.status, review_note: null,
      created_at: p.created_at, edited_at: p.edited_at ?? null, is_mine: p.author_id === userId,
      comment_count: state.comments.filter((c) => c.subject_id === p.post_id).length,
    });
    if (fn === "flock_feed") {
      const visible = state.posts.filter((p) => (p.status === "live" || p.author_id === userId) && !blocked(p.author_id))
        .filter((p) => args.p_space === "everything" || p.space === args.p_space)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return json(route, visible.map(postRow));
    }
    if (fn === "flock_post") { const p = state.posts.find((x) => x.post_id === args.p_post_id && !blocked(x.author_id)); return json(route, p ? [postRow(p)] : []); }
    if (fn === "flock_block") {
      if (args.p_on === false) state.blocks = state.blocks.filter((b) => b.user_id !== args.p_user_id);
      else if (!blocked(args.p_user_id)) {
        const name = state.posts.find((p) => p.author_id === args.p_user_id)?.author_name ?? state.comments.find((c) => c.author_id === args.p_user_id)?.author_name ?? null;
        state.blocks.unshift({ user_id: args.p_user_id, display_name: name, photo_path: null, blocked_at: ago(0) });
      }
      return json(route, null);
    }
    if (fn === "flock_my_blocks") return json(route, state.blocks);
    if (fn === "flock_vet_signs") return json(route, ["fluffed up", "sleeping a lot", "isn't eating", "tail bobbing", "bleeding"]);
    if (fn === "flock_vet_sign_tiers") return json(route, [
      ...["fluffed up all day", "sleeping a lot", "isn't eating", "tail bobbing", "bleeding"].map((phrase) => ({ phrase, tier: "today" })),
      ...["won't stop bleeding", "teflon fumes", "pan fumes", "ate chocolate", "keeps vomiting"].map((phrase) => ({ phrase, tier: "urgent" })),
    ]);
    if (fn === "flock_post_create") {
      if (state.rateLimit === "posts") return json(route, { code: "P0001", message: "rate_limited", details: "posts", hint: null }, 400);
      const post_id = `00000000-0000-4000-8000-0000000080${String(state.posts.length + 1).padStart(2, "0")}`;
      const status = args.p_space === "good" ? "pending" : "live";
      state.posts.push({ post_id, author_id: userId, author_name: state.profile?.display_name ?? "Brittany K.", space: args.p_space, title: args.p_title, body: args.p_body, status, created_at: ago(0) });
      return json(route, [{ post_id, status }]);
    }
    if (fn === "flock_post_edit") { const p = state.posts.find((x) => x.post_id === args.p_post_id); if (p) { p.title = args.p_title; p.body = args.p_body; p.edited_at = ago(0); } return json(route, p?.space === "good" ? "pending" : "live"); }
    if (fn === "flock_comments_for") {
      return json(route, state.comments.filter((c) => c.subject_type === args.p_subject_type && c.subject_id === args.p_subject_id && !blocked(c.author_id)).map((c) => ({
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
    if (fn === "flock_chapter_places") return json(route, state.places);
    if (fn === "flock_place_rules") {
      return json(route, [{ region_slug: args.p_region ?? "great-lakes", region_name: args.p_region === "texas" ? "Texas" : "Great Lakes", can_manage: state.placeManage,
        pending: state.placeManage ? state.placeSuggestions.length : 0, is_lead: false }]);
    }
    if (fn === "flock_place_suggestions") return json(route, state.placeManage ? state.placeSuggestions : []);
    if (fn === "flock_place_suggest") {
      const pending = state.placeSuggestions.length;
      state.placeSuggestions.push({ place_id: `00000000-0000-4000-8000-0000000084${String(pending + 1).padStart(2, "0")}`, region_slug: "great-lakes", region_name: "Great Lakes",
        kind: args.p_kind, name: args.p_name, area: args.p_area, note: args.p_note, suggested_by_name: "Brittany K.", created_at: ago(0) });
      return json(route, state.placeSuggestions[pending].place_id);
    }
    if (fn === "flock_place_review") {
      const sug = state.placeSuggestions.find((x) => x.place_id === args.p_id);
      state.placeSuggestions = state.placeSuggestions.filter((x) => x.place_id !== args.p_id);
      if (sug && args.p_decision === "approve") state.places.push({ ...sug, phone: null, website: null, position: 99, updated_at: ago(0) });
      return json(route, null);
    }
    if (fn === "flock_place_save") return json(route, "00000000-0000-4000-8000-0000000085aa");
    if (fn === "flock_place_move" || fn === "flock_place_remove") return json(route, null);
    if (fn === "flock_votes_current") return json(route, state.votes.filter((v) => v.state !== "draft"));
    if (fn === "flock_vote") return json(route, state.votes.filter((v) => v.vote_id === args.p_id));
    if (fn === "flock_vote_cast") {
      state.calls.push({ fn, args });
      const v = state.votes.find((x) => x.vote_id === args.p_vote_id);
      if (v?.my_choice) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "P0001", message: "already_voted" }) });
      if (v) { v.voters += 1; v.my_choice = args.p_choice_id; }
      return json(route, null);
    }
    if (fn === "flock_pod_can_wait") return json(route, state.pods.canWait);
    if (fn === "flock_pod_for_journey") { const x = state.pods.journey[args.p_journey_id]; return json(route, x ? [x] : []); }
    if (fn === "flock_pod_wait") {
      state.pods.journey[args.p_journey_id] = { state: "waiting", pod_id: null, waiting: 1, can_wait: false };
      return json(route, [{ state: "waiting", pod_id: null }]);
    }
    if (fn === "flock_pod_unwait") { delete state.pods.journey[args.p_journey_id]; return json(route, null); }
    if (fn === "flock_my_pods") return json(route, state.pods.mine);
    if (fn === "flock_pod") return json(route, state.pods.pod && state.pods.pod.pod_id === args.p_pod_id ? [state.pods.pod] : []);
    if (fn === "flock_pod_members") return json(route, state.pods.members);
    if (fn === "flock_pod_feed") return json(route, state.pods.feed.map(postRow));
    if (fn === "flock_pod_post_create") {
      const post = { post_id: "00000000-0000-4000-8000-0000000091aa", author_id: userId, author_name: "Brittany K.", space: "pod", body: args.p_body, status: "live", created_at: ago(0) };
      state.pods.feed.unshift(post);
      if (state.pods.pod) state.pods.pod.checked_in_this_week = true;
      return json(route, [{ post_id: post.post_id, status: "live" }]);
    }
    if (fn === "flock_pod_finished_seen") { if (state.pods.pod) state.pods.pod.my_finished = false; return json(route, null); }
    if (fn === "flock_pod_leave") return json(route, null);
    if (fn === "flock_challenges_current") return json(route, state.challenges.filter((c) => c.state === "open"));
    if (fn === "flock_challenge") return json(route, state.challenges.filter((c) => c.challenge_id === args.p_id));
    if (fn === "flock_challenge_entries") return json(route, state.challengeEntries.filter((e) => e.challenge_id === args.p_id));
    if (fn === "flock_challenge_join" || fn === "flock_challenge_set_feature" || fn === "flock_challenge_entry_create") {
      const c =state.challenges.find((x) => x.challenge_id === args.p_id);
      if (!c) return json(route, { code: "P0002", message: "not found" }, 404);
      if (fn === "flock_challenge_join") {
        Object.assign(c, { joined: true, my_bird_id: args.p_bird_id, my_bird_name: "Echo", feature_ok: args.p_feature_ok, member_count: c.member_count + 1 });
        return json(route, null);
      }
      if (fn === "flock_challenge_set_feature") { c.feature_ok = args.p_ok; return json(route, null); }
      const id = `00000000-0000-4000-8000-0000000098${String(state.challengeEntries.length).padStart(2, "0")}`;
      state.challengeEntries.unshift({ post_id: id, challenge_id: c.challenge_id, author_id: userId, author_name: "Brittany K.", author_region: "Great Lakes", author_photo_path: null,
        author_is_founder: false, space: "challenge", region_slug: null, region_name: null, title: null, body: args.p_body, photo_count: 0, bird_id: null, bird_name: null,
        bird_has_photo: false, status: "live", review_note: null, created_at: new Date().toISOString(), edited_at: null, is_mine: true, comment_count: 0,
        great_job: 0, been_there: 0, rooting_for_you: 0, love_this: 0, mine: [], prompt: args.p_prompt });
      const p = c.prompts.find((x: any) => x.position === args.p_prompt);
      if (p) { p.done = true; c.done_count += 1; }
      c.finished = c.kind === "standalone" && c.prompts.every((x: any) => x.done);
      return json(route, id);
    }
    if (fn === "flock_challenge_finished") return json(route, state.challenges.find((x) => x.challenge_id === args.p_id)?.finished === true);
    if (fn === "flock_todays_idea") return json(route, state.idea ? [state.idea] : []);
    if (fn === "flock_idea_try") { if (state.idea) { state.idea.my_outcome = args.p_outcome; state.idea.my_bird_id = args.p_bird_id; } return json(route, null); }
    if (fn === "flock_report") return json(route, null);
    if (fn === "flock_notifications_list") {
      const f = args.p_filter;
      return json(route, state.notifications.filter((n) => f === "all" || (f === "replies" && n.kind === "reply") || (f === "cheers" && n.kind === "cheer") || (f === "chapter" && n.kind === "chapter")));
    }
    if (fn === "flock_notifications_mark_read") { for (const n of state.notifications) n.unread = false; return json(route, null); }
    if (fn === "flock_can_review") return json(route, true);
    if (fn === "flock_review_post_spaces") return json(route, (args.p_post_ids as string[]).map((id) => state.posts.find((p) => p.post_id === id)).filter(Boolean).map((p) => ({ post_id: p!.post_id, space: p!.space, chapter_name: p!.space === "chapter" ? "Great Lakes" : null })));
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

async function open(browser: Browser, baseURL: string, opts: { admin: boolean; membersOpen?: boolean; size?: "phone" | "duo"; setupDone?: boolean; region?: string; storagePhotos?: boolean; journeys?: JourneyMockOpts }): Promise<{ context: BrowserContext; page: Page; flockChunks: string[]; state: FlockState; journeys: JourneyState }> {
  const context = await browser.newContext({
    ...(opts.size === "duo" ? DUO : IPHONE),
    locale: "en-US", serviceWorkers: "block", baseURL,
  });
  const fx = duoFixture(baseURL, Date.now());
  // membersOpen: opening day set and the members switch on (build C), so the
  // door is open to a signed-in non-admin too.
  fx.rpc.flock_enabled = opts.admin || !!opts.membersOpen;
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
  id: string; birdName: string; slug?: string; custom?: { name: string; milestones: string[]; description?: string }; done: number; status?: string; pausedReason?: string;
  /** Diet conversion's vet card answer. */
  vetCheck?: "talked" | "will_call";
  lastPostedDaysAgo?: number; visibility?: string;
  /** Someone else's journey (a made-up member), not one of the signed-in owner's birds. */
  owner?: string; region?: string;
  /** How many clips it has: the first is the day-one clip, one is a Question, the newest is a Big moment. */
  clips?: number; followers?: number; following?: boolean;
};
type JourneyMockOpts = {
  tier?: "free" | "flock"; openCustom?: number; knownSlugs?: string[];
  seed?: SeedJourney[]; canAddClip?: boolean;
  weight?: {
    level: "none" | "notice" | "pause"; start: number; now: number;
    /** The smoothed rules (journey_weight_check since 20261108160000). */
    avg?: number; pauseKind?: "drop" | "slide" | "sudden"; recheck?: boolean; missed?: boolean;
    excluded?: { grams: number; daysAgo: number; reason: "other_time" | "unconfirmed" }[];
    /** The starting week is over (diet_starting_weight, 20261125030000); default true. */
    startSet?: boolean;
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
    flock: { max_clip_seconds: 1200, max_clips_per_journey: null, max_open_custom: null, max_upload_bytes: 2000000000, can_use_premium: true, can_share: true, can_view_community: true },
  }[tier];
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  const journeys = new Map<string, any>();
  const lastPosted = new Map<string, string>();
  const make = (id: string, birdId: string, tp: (typeof JOURNEY_TEMPLATES)[number] | undefined, custom: { name: string; milestones?: string[] | null; description?: string | null } | null, extra: Record<string, any>) => {
    const ms = tp ? tp.milestones.map((m) => ({ title: m.title, words: { ask: m.ask, done_line: m.done_line } })) : (custom!.milestones ?? []).map((title) => ({ title, words: null }));
    return {
      id, bird_id: birdId, template_id: tp?.id ?? null, custom_name: custom?.name ?? null, status: "active", visibility: "community", rhythm: "most_days",
      started_at: new Date(Date.now() - 16 * 86_400_000).toISOString(), finished_at: null as string | null, paused_reason: null, vet_check: null, vet_remind_after: null,
      custom_description: custom?.description ?? null, source_journey_id: null as string | null,
      template: tp ? { name: tp.name, slug: tp.slug } : null, bird: { name: birds.find((b) => b.id === birdId)?.name ?? "", passed_at: null },
      milestones: ms.map((m, i) => ({ id: `${id}-m${i + 1}`, position: i + 1, title: m.title, state: "todo", reached_at: null, shared_at: null, words: m.words })),
      ...extra,
    };
  };
  const updates = new Map<string, any[]>();
  /** Updates posted during the test. */
  const posted: { update_id: string; journey_id: string; caption: string | null; is_question: boolean; is_day_one: boolean; created_at: string }[] = [];
  /** "This was a big moment" updates (the newest of each seeded journey with 2+ clips, and new posts that say so). */
  const bigMoments = new Set<string>();
  const follows = new Set<string>();
  const meta = new Map<string, { owner: string; region: string | null; mine: boolean; followers: number }>();
  for (const sj of opts.seed ?? []) {
    const bird = birds.find((b) => b.name === sj.birdName) ?? { id: `00000000-0000-4000-8000-0000000075${sj.id.slice(-2)}`, name: sj.birdName };
    const j = make(sj.id, bird.id, JOURNEY_TEMPLATES.find((x) => x.slug === sj.slug), sj.custom ?? null,
      { status: sj.status ?? "active", paused_reason: sj.pausedReason ?? null, visibility: sj.visibility ?? "community", vet_check: sj.vetCheck ?? null });
    j.milestones.forEach((m: any, i: number) => { if (i < sj.done) m.state = "reached"; });
    if (j.status === "finished") j.finished_at = new Date(Date.now() - 3_600_000).toISOString();
    journeys.set(sj.id, j);
    if (sj.lastPostedDaysAgo != null) lastPosted.set(sj.id, new Date(Date.now() - sj.lastPostedDaysAgo * 86_400_000).toISOString());
    if (sj.owner) j.bird = { name: sj.birdName, passed_at: null };
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
    if (n > 1) bigMoments.add(`${sj.id}:${updates.get(sj.id)![0].update_id}`);
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
    // One journey's own updates (the household reads the table): the share card's big moment.
    const jid = url.searchParams.get("journey_id")?.replace(/^eq\./, "");
    if (jid) return json(route, [...(updates.get(jid) ?? []), ...posted.filter((p) => p.journey_id === jid)].map((u) => ({
      id: u.update_id, clip_ref: "cfstream:0123456789abcdef", engagement: "all_in", caption: u.caption, is_question: u.is_question, is_day_one: u.is_day_one,
      is_big_moment: bigMoments.has(`${jid}:${u.update_id}`), milestone_position: null, created_at: u.created_at,
    })));
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
    // The table only ever returns the household's own journeys (RLS).
    return json(route, [...journeys.values()].filter((j) => (meta.get(j.id)?.mine ?? true) && (!status || j.status === status)));
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
      const jn = make(id, args.p_bird_id, tp, tp ? null : { name: args.p_custom_name, description: args.p_custom_description ?? null },
        { visibility: args.p_visibility, rhythm: args.p_rhythm, started_at: new Date().toISOString() });
      jn.milestones.forEach((m: any) => { if ((args.p_already ?? []).includes(m.position)) m.state = "already"; });
      journeys.set(id, jn);
      return json(route, id);
    }
    // Skills from the Flock (1.20c): other members' own community journeys with an update.
    const memberSkill = (x: any) => !x.template_id && x.visibility === "community" && !(meta.get(x.id)?.mine ?? true) && (updates.get(x.id) ?? []).length > 0;
    if (fn === "journey_member_skills") {
      if (tier === "free") return json(route, []);
      const q = String(args.p_q ?? "").toLowerCase();
      return json(route, [...journeys.values()].filter(memberSkill)
        .filter((x) => !q || `${x.custom_name} ${x.custom_description ?? ""}`.toLowerCase().includes(q))
        .map((x) => ({ ...card(x), skill: x.custom_name, description: x.custom_description, updates: (updates.get(x.id) ?? []).length })));
    }
    if (fn === "journey_custom_about") {
      if (!j || j.template_id) return json(route, []);
      const src = j.source_journey_id ? journeys.get(j.source_journey_id) : undefined;
      return json(route, [{ description: j.custom_description, is_member_skill: memberSkill(j), source_journey_id: src?.id ?? null, source_bird_name: src?.bird?.name ?? null }]);
    }
    if (fn === "journey_start_member_skill") {
      const src = journeys.get(args.p_source_id);
      state.starts.push(args);
      const id = `00000000-0000-4000-8000-0000000072${String(state.starts.length).padStart(2, "0")}`;
      const jn = make(id, args.p_bird_id, undefined, { name: src.custom_name, description: src.custom_description },
        { visibility: args.p_visibility, rhythm: args.p_rhythm, started_at: new Date().toISOString(), source_journey_id: src.id });
      journeys.set(id, jn);
      return json(route, id);
    }
    if (fn === "journey_post_update") {
      const id = `00000000-0000-4000-8000-0000000073${String(posted.length + 10).padStart(2, "0")}`;
      posted.push({ update_id: id, journey_id: args.p_journey_id, caption: args.p_caption, is_question: /\?/.test(args.p_caption ?? ""), is_day_one: false, created_at: new Date().toISOString() });
      if (args.p_big_moment) bigMoments.add(`${args.p_journey_id}:${id}`);
      return json(route, id);
    }
    if (fn === "journey_finish" && j) {
      j.status = args.p_how === "learned" ? "finished" : "happy_where_we_are";
      j.finished_at = new Date().toISOString(); j.paused_reason = null;
      return json(route, j.status);
    }
    if (fn === "journey_vet_sign_tiers") return json(route, [
      ...["fluffed up all day", "sleeping a lot", "isn't eating", "tail bobbing", "bleeding"].map((phrase) => ({ phrase, tier: "today" })),
      ...["won't stop bleeding", "teflon fumes", "ate chocolate"].map((phrase) => ({ phrase, tier: "urgent" })),
    ]);
    if (fn === "journey_big_moments") return json(route, (updates.get(args.p_journey_id) ?? []).filter((u) => bigMoments.has(`${args.p_journey_id}:${u.update_id}`)).map((u) => ({ update_id: u.update_id })));
    if (fn === "journey_following_latest") {
      return json(route, [...journeys.values()].filter((x) => follows.has(x.id)).map((x) => ({ journey_id: x.id, update_id: (updates.get(x.id) ?? [])[0]?.update_id ?? null })));
    }
    if (fn === "journey_skill_journeys") {
      if (tier === "free") return json(route, []);
      return json(route, [...journeys.values()].filter((x) => x.visibility === "community" && !(meta.get(x.id)?.mine ?? true)).map(card)
        .filter((c) => c.template_slug === args.p_template_slug));
    }
    if (fn === "journey_moment_cards") {
      return json(route, [...journeys.values()].filter((x) => follows.has(x.id)).flatMap((x) => {
        const c = card(x); const m = meta.get(x.id);
        const base = { journey_id: x.id, bird_id: x.bird_id, bird_name: c.bird_name, bird_has_photo: false, skill: c.skill, template_slug: c.template_slug,
          owner_name: m?.owner ?? null, owner_region: m?.region ?? null };
        const big = (updates.get(x.id) ?? []).filter((u) => bigMoments.has(`${x.id}:${u.update_id}`)).map((u) => ({ ...base, card_kind: "big_moment", update_id: u.update_id,
          happened_at: new Date(Date.now() - 2 * 3_600_000).toISOString(), caption: u.caption, has_clip: true,
          great_job: 12, been_there: 4, rooting_for_you: 0, love_this: 0, mine: [] }));
        const learned = x.status === "finished" ? [{ ...base, card_kind: "learned", update_id: null, happened_at: x.finished_at, caption: null, has_clip: false,
          great_job: 0, been_there: 0, rooting_for_you: 0, love_this: 0, mine: [] }] : [];
        return [...big, ...learned];
      }));
    }
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
        window_from: new Date(Date.now() - 16 * 86_400_000).toISOString(), window_to: new Date(Date.now() - 9 * 86_400_000).toISOString(),
        start_set: w ? (w.startSet ?? true) : false, start_set_at: w && (w.startSet ?? true) ? new Date(Date.now() - 9 * 86_400_000).toISOString() : null }]);
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
const FLOCK_CHUNK = /\/assets\/(?!FlockHealthDuo)(Flock\w+|SpacesSheet|CommentThread|ReportSheet|IdeaParts|EventParts|PodParts|admin\.(?:review|ideas|library|pods)|LibraryParts|AdminOnly|Post(?:Compose|Feed|Parts)|Journey\w+|[jJ]ourney\w*(\.[\w$-]+)*|flock\w*(\.[\w$-]+)*)-[\w-]+\.js/;

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
    await expect(type).toHaveText(["All", "Guides", "Checklists", "Videos", "Links"]);
    await expect(subject).toHaveText(["Foraging", "Diet", "Training", "Hormones", "Conservation"]);
    // Nothing published yet: the shelves are filling.
    await expect(page.getByTestId("flock-empty")).toContainText("The shelves are filling");
    await type.filter({ hasText: "Videos" }).click();
    await subject.filter({ hasText: "Hormones" }).click();
    await expect(page).toHaveURL(/type=videos/);
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
  test("pick a bird, pick a skill from one list, read about it, choose how often and who sees it, start: the database gets exactly that", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { knownSlugs: ["target-training"] } });
    await page.goto("/flock/journeys");
    await page.getByTestId("start-journey").click();
    await expect(page).toHaveURL(/\/flock\/journeys\/start$/);
    // A full screen: no tab bar.
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Echo" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pick a skill");
    const list = page.getByTestId("template-list");
    // One list, no free/Flock split: Handling and health, Foundations, Food, Tricks.
    await expect(list.getByRole("heading")).toHaveText(["Handling and health", "Foundations", "Food", "Tricks"]);
    await expect(list.getByRole("heading", { name: "Flock journeys" })).toHaveCount(0);
    await expect(list.locator("[data-template]")).toHaveCount(7);
    await expect(list.locator("[data-skill-group='tricks'] [data-template]")).toHaveCount(2);
    // Already knows it: says so, and it can still be started.
    await expect(list.locator("[data-template='target-training']")).toContainText("Echo already knows this");
    await expect(list.locator("[data-template='step-up']")).toContainText("So your bird steps onto your hand calmly and by choice");
    await expect(list.locator("[data-locked]")).toHaveCount(0);
    await expect(page.getByTestId("write-own")).toHaveText("Your own skill");
    await list.locator("[data-template='step-up']").click();

    await expect(page).toHaveURL(/\/flock\/journeys\/setup\?/);
    const setup = page.getByTestId("journey-setup");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Step up");
    await expect(setup.getByTestId("skill-description")).toContainText("So your bird steps onto your hand calmly and by choice");
    await expect(setup.getByTestId("safety-notes")).toContainText("Never withhold food to make a bird hungrier for training.");
    await expect(setup.getByTestId("skill-video")).toHaveCount(0);
    // No milestone checklist, no "already does", no day-one clip, no tips list.
    await expect(setup.locator("[data-position]")).toHaveCount(0);
    await expect(setup.getByText("Where is Echo starting?")).toHaveCount(0);
    await expect(setup.getByTestId("day-one-add")).toHaveCount(0);
    await expect(setup.getByTestId("how-to")).toHaveCount(0);
    // How others did it: a Flock member sees the section (empty here).
    await expect(setup.getByTestId("how-others")).toContainText("How others did it");
    await expect(setup.getByTestId("how-others-empty")).toBeVisible();
    await expect(setup.getByTestId("rhythm").locator("[aria-checked='true']")).toHaveText("A few times a week");
    await expect(setup.getByTestId("visibility").locator("[role='radio']")).toHaveText(["The community", "Just me"]);
    await expect(setup.getByTestId("visibility").locator("[aria-checked='true']")).toHaveText("The community");
    await setup.getByTestId("rhythm").getByRole("radio", { name: "Most days" }).click();
    await page.getByRole("button", { name: "Start Echo's journey" }).click();

    await expect(page).toHaveURL(/\/flock\/journeys\/00000000-0000-4000-8000-000000007201$/);
    expect(journeys.starts).toHaveLength(1);
    expect(journeys.starts[0]).toMatchObject({ p_template_slug: "step-up", p_custom_name: null, p_already: null, p_rhythm: "most_days", p_visibility: "community", p_day_one_clip: null });
    await expect(page.getByTestId("journey-page")).toBeVisible();
    await expect(page.getByTestId("progress-bar")).toHaveCount(0);
    await context.close();
  });

  test("How others did it: other members' community journeys for the skill, and their tips", async ({ browser, baseURL }) => {
    const kiwi = { id: "00000000-0000-4000-8000-0000000074a3", birdName: "Kiwi", slug: "step-up", done: 0, owner: "Alex R.", region: "Great Lakes", status: "finished" };
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { seed: [kiwi], finisherTips: { "step-up": ["Keep your hand still and let them choose."] } } });
    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Echo" }).click();
    await page.locator("[data-template='step-up']").click();
    const others = page.getByTestId("how-others");
    await expect(others.getByTestId("finisher-tips")).toContainText("Keep your hand still and let them choose.");
    await expect(others.locator(`[data-other-journey='${kiwi.id}']`)).toContainText("Kiwi · Alex R.");
    await expect(others.locator(`[data-other-journey='${kiwi.id}']`)).toContainText(/Learned it in \d+ days?/);
    await expect(others.getByTestId("how-others-empty")).toHaveCount(0);
    await others.locator(`[data-other-journey='${kiwi.id}']`).click();
    await expect(page).toHaveURL(new RegExp(`/flock/journeys/${kiwi.id}$`));
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
    // The "How to make it work" tips list is gone (its protective lines are safety notes now).
    await expect(setup.getByTestId("how-to")).toHaveCount(0);
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

  test("the eclectus alert sits above the vet card only when its switch is on; other species never see it", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    const row = (id: string, name: string, species: string | null) => ({ id, name, species, sex: null, photo_url: null, birth_date: "2020-05-01", passed_at: null });
    await context.route(`${MOCK}/rest/v1/birds**`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([row("00000000-0000-4000-8000-0000000071c1", "Ruby", "Eclectus"), row("00000000-0000-4000-8000-0000000071c2", "Rio", null)]) }));
    let on = false;
    const asked: string[] = [];
    await context.route(`${MOCK}/rest/v1/rpc/health_feature_enabled`, (route) => {
      asked.push(route.request().postDataJSON()?.p_feature);
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(on) });
    });
    // Off (as it ships): the vet card alone.
    await page.goto("/flock/journeys/setup?bird=00000000-0000-4000-8000-0000000071c1&template=diet-conversion");
    await expect(page.getByTestId("diet-vet-card")).toBeVisible();
    await expect(page.getByTestId("diet-eclectus")).toHaveCount(0);
    expect(asked).toContain("diet_eclectus_alert");
    await context.close();

    const o = await open(browser, baseURL!, { admin: true });
    await o.context.route(`${MOCK}/rest/v1/birds**`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([row("00000000-0000-4000-8000-0000000071c1", "Ruby", "Eclectus"), row("00000000-0000-4000-8000-0000000071c2", "Rio", null)]) }));
    on = true;
    await o.context.route(`${MOCK}/rest/v1/rpc/health_feature_enabled`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(on) }));
    // On: the alert comes first, then the vet card.
    await o.page.goto("/flock/journeys/setup?bird=00000000-0000-4000-8000-0000000071c1&template=diet-conversion");
    const alert = o.page.getByTestId("diet-eclectus");
    await expect(alert).toHaveText("Eclectus have specific food needs. They generally do best on plenty of fresh vegetables and fruit, and many avian vets advise caution with heavily fortified pellets and added vitamins. Please make a plan with your avian vet before changing Ruby's food.");
    const [a, v] = await Promise.all([alert.boundingBox(), o.page.getByTestId("diet-vet-card").boundingBox()]);
    expect(a!.y).toBeLessThan(v!.y);
    // Unknown species: no species alert, the general vet card.
    await o.page.goto("/flock/journeys/setup?bird=00000000-0000-4000-8000-0000000071c2&template=diet-conversion");
    await expect(o.page.getByTestId("diet-vet-card")).toBeVisible();
    await expect(o.page.getByTestId("diet-eclectus")).toHaveCount(0);
    await o.context.close();
  });

  test("Diet conversion pages: the vet reminder only for \"I'll call\" once the starting weight is set, and the disclaimer at the bottom", async ({ browser, baseURL }) => {
    const id = "00000000-0000-4000-8000-0000000074a2";
    // No milestone reached: the reminder follows the starting weight alone.
    const diet = { id, birdName: "Willow", slug: "diet-conversion", done: 0, vetCheck: "will_call" as const };
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

    // Still in the starting week (even with milestone history), or "I've talked": no reminder. Another journey: no disclaimer.
    o = await open(browser, baseURL!, { admin: true, journeys: { weight: { level: "none", start: 400, now: 401, startSet: false }, seed: [{ ...diet, done: 0 },{ ...diet, id: "00000000-0000-4000-8000-0000000074b2", birdName: "Echo", vetCheck: "talked" }, { id: "00000000-0000-4000-8000-0000000074b3", birdName: "Max", slug: "step-up", done: 1 }] } });
    await o.page.goto(`/flock/journeys/${id}`);
    await expect(o.page.getByTestId("journey-page")).toBeVisible();
    await expect(o.page.getByTestId("vet-reminder")).toHaveCount(0);
    await expect(o.page.getByTestId("diet-disclaimer")).toBeVisible();
    await o.page.goto("/flock/journeys/00000000-0000-4000-8000-0000000074b2");
    await expect(o.page.getByTestId("journey-page")).toBeVisible();
    await expect(o.page.getByTestId("vet-reminder")).toHaveCount(0);
    await o.page.goto("/flock/journeys/00000000-0000-4000-8000-0000000074b3");
    await expect(o.page.getByTestId("journey-page")).toBeVisible();
    await expect(o.page.getByTestId("diet-disclaimer")).toHaveCount(0);
    await o.context.close();
  });

  test("your own skill: a name and a description, no steps; one of the 14's names suggests that skill", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Max" }).click();
    await page.getByTestId("write-own").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your own skill");
    await expect(page.getByTestId("custom-milestones")).toHaveCount(0);
    const start = page.getByRole("button", { name: "Start Max's journey" });
    await expect(start).toBeDisabled();
    await page.getByTestId("custom-name").fill("step up");
    await expect(page.getByTestId("skill-suggestion")).toContainText("Step up is one of our skills, with its description and safety notes.");
    await expect(page.getByTestId("skill-suggestion").getByRole("button", { name: "Start Step up instead" })).toBeVisible();
    await page.getByTestId("custom-name").fill("Bath time");
    await expect(page.getByTestId("skill-suggestion")).toHaveCount(0);
    await expect(start).toBeEnabled();
    await page.getByTestId("custom-description").fill("Splashing in a shallow dish.");
    await expect(page.getByTestId("custom-description-count")).toHaveText("28 of 500");
    await page.getByTestId("visibility").getByRole("radio", { name: "Just me" }).click();
    await start.click();
    await expect(page).toHaveURL(/\/flock\/journeys\/0000/);
    expect(journeys.starts[0]).toMatchObject({ p_template_slug: null, p_custom_name: "Bath time", p_custom_milestones: null, p_custom_description: "Splashing in a shallow dish.", p_visibility: "private" });
    await expect(page.getByTestId("journey-page")).toBeVisible();
    await expect(page.getByTestId("member-supplied")).toHaveCount(0);
    await context.close();
  });

  test("skills from the Flock: search, the member-supplied label, start this skill, report it", async ({ browser, baseURL }) => {
    const SOURCE = "00000000-0000-4000-8000-0000000074c1";
    const { context, page, journeys, state } = await open(browser, baseURL!, { admin: true, journeys: { seed: [
      { id: SOURCE, birdName: "Sunny", custom: { name: "Bell ringing", milestones: [], description: "Rings the bell when it wants out." }, done: 0, owner: "Robin P.", clips: 1 },
      { id: "00000000-0000-4000-8000-0000000074c2", birdName: "Pip", custom: { name: "Quiet mornings", milestones: [] }, done: 0, owner: "Robin P.", clips: 0 },
    ] } });
    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Max" }).click();
    await page.getByTestId("from-flock-skills").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Skills from the Flock");
    await expect(page.getByTestId("member-supplied-note")).toContainText("A member shared this skill. It hasn't been reviewed by The Kya Project.");
    // Only a skill with an update is findable.
    const rows = page.locator("[data-member-skill]");
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Bell ringing");
    await expect(rows).toContainText("From Sunny's journey · Robin P.");
    await expect(rows.getByTestId("member-supplied")).toHaveText("Member-supplied journey");
    await page.getByTestId("member-skills-search").fill("harness");
    await expect(page.getByTestId("member-skills-empty")).toHaveText("No shared skills match that yet.");
    await page.getByTestId("member-skills-search").fill("wants out");
    await expect(rows).toHaveCount(1);
    await rows.click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bell ringing");
    await expect(page.getByTestId("member-supplied-note")).toBeVisible();
    await expect(page.getByTestId("skill-description")).toHaveText("Rings the bell when it wants out.");
    await expect(page.getByTestId("see-source")).toHaveText("See Sunny's journey");
    await page.getByRole("button", { name: "Start this skill" }).click();
    await expect(page).toHaveURL(/\/flock\/journeys\/0000/);
    expect(journeys.starts.at(-1)).toMatchObject({ p_source_id: SOURCE, p_visibility: "community" });
    expect(journeys.starts.at(-1)!.p_bird_id).toBeTruthy();
    // The copy is yours: no label, and "Started from Sunny's journey" links back.
    await expect(page.getByTestId("member-supplied")).toHaveCount(0);
    await expect(page.getByTestId("started-from")).toHaveText("Started from Sunny's journey");
    await page.getByTestId("started-from").click();
    await expect(page).toHaveURL(new RegExp(`/flock/journeys/${SOURCE}`));
    // The source journey: labeled, "Start this skill", and "Report this skill" in its menu.
    await expect(page.getByTestId("member-supplied-note")).toBeVisible();
    await expect(page.getByTestId("start-this-skill")).toBeVisible();
    await page.getByTestId("journey-other-menu").click();
    await page.getByRole("button", { name: "Report this skill" }).click();
    const sheet = page.getByTestId("report-sheet");
    await sheet.locator("[data-reason='unsafe']").click();
    await sheet.getByRole("button", { name: "Send report" }).click();
    await expect(page.getByTestId("report-done")).toBeVisible();
    expect(state.calls.find((c) => c.fn === "flock_report")!.args).toMatchObject({ p_subject_type: "journey", p_subject_id: SOURCE, p_reason: "unsafe" });
    // The Journeys tab labels it too.
    await page.goto("/flock/journeys");
    await expect(page.locator(`[data-journey-card='${SOURCE}']`).getByTestId("member-supplied")).toBeVisible();
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

  test("a good day: post a big moment with a question, no milestone question, then a share card", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [stepUp] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1`);
    await page.getByTestId("post-update").click();
    await expect(page.getByTestId("post-camera")).toBeVisible();
    await expect(page.getByTestId("working-on")).toHaveCount(0);
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);

    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1/post?clip=${CLIP}`);
    const compose = page.getByTestId("post-compose");
    await expect(compose.getByText("How into it was Echo?")).toBeVisible();
    const post = page.getByRole("button", { name: "Post", exact: true });
    await expect(post).toBeDisabled();
    await compose.getByTestId("engagement").getByRole("radio", { name: "All in" }).click();
    await compose.getByTestId("caption").fill("Three seconds on my hand! Almonds or walnuts?");
    // A question on a community journey shows to the Flock too.
    await expect(compose.getByTestId("ask-community")).toHaveText("Your question will show to the Flock too, so members can answer.");
    await expect(compose.getByTestId("ask-flock")).toHaveCount(0);
    await expect(compose.getByTestId("posting-to")).toContainText("Posting to your followers and the community");
    await expect(compose.getByTestId("posting-to").getByRole("button", { name: "Change" })).toBeVisible();
    await compose.getByTestId("big-moment").getByRole("switch", { name: "This was a big moment" }).click();
    await post.click();

    const after = page.getByTestId("after-post");
    await expect(after).toContainText("Posted to Echo's journey");
    await expect(after.getByRole("heading")).toHaveText("What a moment for Echo!");
    await expect(after.getByRole("button", { name: "Yes!" })).toHaveCount(0);
    await expect(page.getByTestId("tip")).toHaveCount(0);
    const posted = journeys.calls.find((c) => c.fn === "journey_post_update")!;
    expect(posted.args).toMatchObject({ p_journey_id: "00000000-0000-4000-8000-0000000074a1", p_clip_ref: CLIP, p_engagement: "all_in",
      p_caption: "Three seconds on my hand! Almonds or walnuts?", p_big_moment: true });
    expect(journeys.calls.some((c) => c.fn === "journey_reach_milestone")).toBe(false);
    await after.getByRole("button", { name: "Make a share card" }).click();
    await expect(page).toHaveURL(/\/card\?kind=moment&u=0000/);
    await expect(page.getByTestId("card-preview")).toHaveAttribute("alt", "A big moment for Echo!");
    await context.close();
  });

  test("a distracted day: a tip for next time, and an ordinary update isn't a big moment", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [stepUp] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1/post?clip=${CLIP}`);
    await page.getByTestId("engagement").getByRole("radio", { name: "Distracted" }).click();
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.getByTestId("tip")).toContainText("A tip for next time");
    await expect(page.getByTestId("tip")).toContainText("Keep it to a few minutes, and stop while your bird still wants more.");
    await expect(page.getByTestId("make-share-card")).toHaveCount(0);
    expect(journeys.calls.find((c) => c.fn === "journey_post_update")!.args).toMatchObject({ p_big_moment: false });
    await page.getByRole("button", { name: "Back to the journey" }).click();
    await expect(page).toHaveURL(new RegExp(`/flock/journeys/00000000-0000-4000-8000-0000000074a1$`));
    await context.close();
  });

  test("the vet nudge runs on every caption: the card first, and posting is never blocked", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [stepUp] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1/post?clip=${CLIP}`);
    await page.getByTestId("engagement").getByRole("radio", { name: "Not today" }).click();
    await page.getByTestId("caption").fill("Echo has been fluffed up all day and sleeping a lot. Should we keep training?");
    await page.getByRole("button", { name: "Post", exact: true }).click();
    const card = page.getByTestId("vet-nudge");
    await expect(card.getByRole("heading")).toHaveText("This sounds like something for your avian vet");
    await expect(card.getByTestId("find-vet")).toHaveAttribute("href", "https://www.aav.org/page/FindAVet2");
    expect(journeys.calls.some((c) => c.fn === "journey_post_update")).toBe(false);
    await card.getByTestId("post-anyway").click();
    await expect(page.getByTestId("after-post")).toContainText("Posted to Echo's journey");
    expect(journeys.calls.filter((c) => c.fn === "journey_post_update")).toHaveLength(1);
    await context.close();
  });

  test("Ask the Flock on a private journey: members can share it; free accounts see the Flock sheet", async ({ browser, baseURL }) => {
    const priv = { ...stepUp, visibility: "private" };
    let o = await open(browser, baseURL!, { admin: true, journeys: { seed: [priv] } });
    await o.page.goto(`/flock/journeys/${priv.id}/post?clip=${CLIP}`);
    await o.page.getByTestId("caption").fill("How long did step up take your bird?");
    const ask = o.page.getByTestId("ask-flock");
    await expect(ask).toContainText("Only you can see this journey, so only you will see the question.");
    await ask.getByRole("button", { name: "Ask the Flock" }).click();
    await o.page.getByTestId("change-visibility").getByRole("radio", { name: "The community" }).click();
    await expect.poll(() => o.journeys.calls.find((c) => c.fn === "journey_set_visibility")?.args).toMatchObject({ p_journey_id: priv.id, p_visibility: "community" });
    await o.context.close();

    o = await open(browser, baseURL!, { admin: true, journeys: { tier: "free", seed: [priv] } });
    await o.page.goto(`/flock/journeys/${priv.id}/post?clip=${CLIP}`);
    await o.page.getByTestId("caption").fill("How long did step up take your bird?");
    await o.page.getByTestId("ask-flock").getByRole("button", { name: "Ask the Flock" }).click();
    const sheet = o.page.getByTestId("flock-only-sheet");
    await expect(sheet).toHaveAttribute("data-reason", "ask");
    await expect(o.page.getByRole("heading", { name: "Ask the Flock" })).toBeVisible();
    await expect(sheet).toContainText("In the Flock, you can ask other members about your journey");
    await expect(sheet).not.toContainText("$");
    await o.context.close();
  });

  test("[Bird] learned it!: the journey ends, the skill is on the list, a tip for the next person", async ({ browser, baseURL }) => {
    const spin = { id: "00000000-0000-4000-8000-0000000074a2", birdName: "Willow", slug: "spin", done: 0 };
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [spin] } });
    await page.goto(`/flock/journeys/${spin.id}`);
    await page.getByTestId("learned-it").getByRole("button", { name: "Willow learned it!" }).click();
    const confirm = page.getByTestId("learned-confirm");
    await expect(confirm).toContainText("This finishes the journey and adds spin to Willow's skills.");
    await confirm.getByRole("button", { name: "Finish the journey" }).click();
    await expect(page).toHaveURL(/\/finished$/);
    expect(journeys.calls.find((c) => c.fn === "journey_finish")!.args).toEqual({ p_journey_id: spin.id, p_how: "learned" });
    await expect(page.getByTestId("finished-title")).toHaveText("Willow learned spin!");
    await expect(page.getByText("Spin is now on Willow's skill list.")).toBeVisible();
    await expect(page.getByText("Shown to members who start Spin later.")).toBeVisible();
    await page.getByTestId("finisher-tip").fill("Pick one direction and stay with it.");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page).toHaveURL(new RegExp(`/flock/journeys/${spin.id}$`));
    expect(journeys.calls.find((c) => c.fn === "journey_save_finisher_tip")!.args).toMatchObject({ p_journey_id: spin.id, p_body: "Pick one direction and stay with it." });
    expect(journeys.calls.some((c) => c.fn === "journey_share_milestone")).toBe(false);
    await context.close();
  });

  test("Diet conversion finishes as \"[Bird] is on the new diet\"; a weight pause can't be finished as learned", async ({ browser, baseURL }) => {
    const diet = { id: "00000000-0000-4000-8000-0000000074a2", birdName: "Willow", slug: "diet-conversion", done: 2, vetCheck: "talked" as const };
    let o = await open(browser, baseURL!, { admin: true, journeys: { seed: [diet], weight: { level: "none", start: 400, now: 401 } } });
    await o.page.goto(`/flock/journeys/${diet.id}`);
    await o.page.getByTestId("learned-it").getByRole("button", { name: "Willow is on the new diet" }).click();
    await o.page.getByTestId("learned-confirm").getByRole("button", { name: "Finish the journey" }).click();
    await expect(o.page).toHaveURL(/\/finished$/);
    await expect(o.page.getByTestId("finished-title")).toHaveText("Willow is on the new diet");
    await expect(o.page.getByText("is now on Willow's skill list.")).toHaveCount(0);
    await o.context.close();

    o = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ ...diet, status: "paused", pausedReason: "weight_drop" }], weight: { level: "pause", start: 400, now: 378 } } });
    await o.page.goto(`/flock/journeys/${diet.id}`);
    await expect(o.page.getByTestId("weight-paused")).toBeVisible();
    await expect(o.page.getByTestId("learned-it")).toHaveCount(0);
    await o.context.close();
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
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { tier: "free", seed: [stepUp], canAddClip: false } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1/post`);
    const card = page.getByTestId("clip-limit");
    await expect(card.getByRole("heading")).toHaveText("This journey has 10 clips");
    await expect(card.getByRole("link", { name: "Compare with Flock membership" })).toHaveAttribute("href", "/flock/you/membership");
    await context.close();
  });

  test("free accounts post privately: Posting to just you, no Change", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { tier: "free", seed: [{ ...stepUp, visibility: "private" }] } });
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

  test("your journey: header, the skill folded away, no steps, clip grid with tags, learned it, and the menu", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [mine] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a1`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Echo · Step up");
    await expect(page.getByText("Day 17 · 6 following")).toBeVisible();
    await expect(page.getByTestId("journey-progress")).toHaveCount(0);
    await expect(page.getByTestId("progress-bar")).toHaveCount(0);
    // The description and safety notes fold away under the header.
    const about = page.getByTestId("skill-about");
    await expect(about.getByTestId("skill-description")).toBeHidden();
    await about.locator("summary").click();
    await expect(about.getByTestId("skill-description")).toContainText("So your bird steps onto your hand calmly and by choice");
    await expect(about.getByTestId("safety-notes")).toContainText("Stop at the first sign of stress.");
    await expect(page.getByTestId("post-update")).toBeVisible();
    await expect(page.getByRole("button", { name: "Day one vs. now" })).toBeVisible();
    await expect(page.getByTestId("learned-it")).toHaveText("Echo learned it!");
    const grid = page.getByTestId("clip-grid");
    await expect(grid.locator("[data-tile]")).toHaveCount(4);
    await expect(grid.locator("[data-tag='big_moment']")).toHaveText(/Big moment/);
    await expect(grid.locator("[data-tag='milestone']")).toHaveCount(0);
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
    await expect(page.getByTestId("delete-confirm")).toContainText("This removes the journey and its 4 clips for good. It can't be undone.");
    await page.getByRole("button", { name: "Keep it" }).click();
    await expect(page.getByTestId("journey-menu")).toBeVisible();
    // We're happy where we are: ends it through journey_finish.
    await page.getByTestId("journey-menu").locator("[data-menu='happy']").click();
    await expect.poll(() => journeys.calls.find((c) => c.fn === "journey_finish")?.args).toEqual({ p_journey_id: "00000000-0000-4000-8000-0000000074a1", p_how: "happy_where_we_are" });
    await context.close();
  });

  test("someone else's community journey: Follow (members), no menu, no posting", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [kiwi] } });
    await page.goto(`/flock/journeys/00000000-0000-4000-8000-0000000074a3`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kiwi · Recall");
    await expect(page.getByTestId("journey-menu-button")).toHaveCount(0);
    await expect(page.getByTestId("post-update")).toHaveCount(0);
    await expect(page.getByTestId("learned-it")).toHaveCount(0);
    const follow = page.getByTestId("follow");
    await expect(follow).toHaveText("Follow");
    await follow.click();
    await expect(follow).toHaveText("Following");
    expect(journeys.calls.find((c) => c.fn === "journey_follow")!.args).toMatchObject({ p_journey_id: "00000000-0000-4000-8000-0000000074a3", p_follow: true });
    await context.close();
  });

  test("the Journeys tab: your journeys first, then From the Flock with big cards, and the chips change what's shown", async ({ browser, baseURL }) => {
    const done = { id: "00000000-0000-4000-8000-0000000074a5", birdName: "Max", slug: "wave", done: 0, status: "finished" };
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [mine, done, kiwi, { ...mango, following: true }] } });
    await page.goto("/flock/journeys");
    // Your journeys: active ones first, then finished; never other members'.
    const yours = page.getByTestId("your-journeys");
    await expect(yours.getByRole("heading")).toHaveText("Your journeys");
    await expect(yours.locator("[data-your-journey]")).toHaveCount(2);
    await expect(yours.locator("[data-your-journey]").first()).toHaveAttribute("data-status", "active");
    await expect(yours.locator("[data-your-journey]").first()).toContainText("Echo · Step up");
    await expect(yours.locator(`[data-your-journey='${done.id}']`)).toContainText(/Learned it · \d+ days?/);
    await expect(page.getByTestId("start-journey")).toHaveText("Start something new");
    const flock = page.getByTestId("from-the-flock");
    await expect(flock.getByRole("heading", { name: "From the Flock" })).toBeVisible();
    const cards = flock.getByTestId("journey-cards").locator("[data-journey-card]");
    await expect(cards).toHaveCount(2);
    await expect(page.locator("[data-journey-card='00000000-0000-4000-8000-0000000074a3']")).toContainText("Kiwi · Recall");
    await expect(page.locator("[data-journey-card='00000000-0000-4000-8000-0000000074a3']")).toContainText("Day 17 · Alex R. · 2 following");
    await expect(page.locator("[data-journey-card='00000000-0000-4000-8000-0000000074a3']")).not.toContainText(" of 7");
    await page.getByTestId("journeys-chips").getByRole("button", { name: "Tricks" }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText("Mango · Spin");
    await page.getByTestId("journeys-chips").getByRole("button", { name: "Following" }).click();
    await expect(cards).toHaveCount(1);
    await page.getByTestId("journeys-chips").getByRole("button", { name: "Basics" }).click();
    await expect(cards).toHaveCount(1);
    expect(journeys.calls.filter((c) => c.fn === "journey_feed").map((c) => c.args.p_filter)).toEqual(expect.arrayContaining(["for_you", "tricks", "following", "basics"]));
    await cards.first().click();
    await expect(page).toHaveURL(/\/flock\/journeys\/0000/);
    await context.close();
  });

  test("Today: followed journeys as rings with Day N, big-moment and learned-it cards with reactions, and the story viewer", async ({ browser, baseURL }) => {
    const finished = { id: "00000000-0000-4000-8000-0000000074a6", birdName: "Sunny", slug: "wave", done: 0, owner: "Priya S.", status: "finished", following: true };
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ ...kiwi, following: true }, { ...mango, following: true }, finished] } });
    await page.goto("/flock");
    const rings = page.getByTestId("follow-rings");
    await expect(rings.getByRole("heading")).toHaveText("Journeys you follow");
    await expect(rings.locator("[data-ring]")).toHaveCount(3);
    await expect(rings.locator("[data-ring='00000000-0000-4000-8000-0000000074a3'] [data-testid='ring-day']")).toHaveText("Day 17");
    await expect(rings.locator(`[data-ring='${finished.id}'] [data-testid='ring-day']`)).toHaveText("Learned it");
    await expect(rings).not.toContainText(" of 7");
    expect(journeys.calls.some((c) => c.fn === "journey_following_latest")).toBe(true);
    expect(journeys.calls.some((c) => c.fn === "journey_milestone_cards")).toBe(false);
    const learned = page.locator(`[data-moment-card='${finished.id}']`);
    await expect(learned).toHaveAttribute("data-kind", "learned");
    await expect(learned.getByTestId("moment-pill")).toHaveText("Learned it · Sunny's wave");
    await expect(learned).toContainText("Sunny learned wave!");
    const card = page.locator("[data-moment-card='00000000-0000-4000-8000-000000009002']");
    await expect(card).toHaveAttribute("data-kind", "big_moment");
    await expect(card).toContainText("Alex R. · Great Lakes · 2h");
    await expect(card.getByTestId("moment-pill")).toHaveText("Big moment · Kiwi's recall");
    await expect(card.locator("[data-reaction]")).toHaveText(["Great job · 12", "Been there · 4", "Rooting for you", "Love this"]);
    await card.locator("[data-reaction='been_there']").click();
    await expect(card.locator("[data-reaction='been_there']")).toHaveText("Been there · 5");
    expect(journeys.calls.find((c) => c.fn === "journey_react")!.args).toMatchObject({ p_subject_type: "journey_update", p_subject_id: "00000000-0000-4000-8000-000000009002", p_kind: "been_there", p_on: true });

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

  test("comments on a big-moment card: the journey in the header, the comment saved on the update", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ ...kiwi, following: true }] } });
    await page.goto("/flock");
    const card = page.locator("[data-moment-card='00000000-0000-4000-8000-000000009002']");
    await card.getByTestId("card-comments").click();
    await expect(page).toHaveURL(/\/flock\/comments\/journey_update\/00000000-0000-4000-8000-000000009002\?/);
    await expect(page.getByTestId("thread-line")).toHaveText("Kiwi · Recall · Alex R.");
    await expect(page.getByTestId("no-comments")).toBeVisible();
    await expect(page.getByTestId("comment-box")).toBeFocused();
    await page.getByTestId("comment-box").fill("Rooting for Kiwi!");
    await page.getByTestId("comment-send").click();
    expect(state.calls.find((c) => c.fn === "flock_comment_create")!.args).toMatchObject({
      p_subject_type: "journey_update", p_subject_id: "00000000-0000-4000-8000-000000009002", p_reply_to: null, p_body: "Rooting for Kiwi!" });
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
    await expect(page.getByTestId("compare-summary")).toHaveText("16 days, 4 sessions, 1 big moment.");
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
  test("every skill can be started; How others did it opens the Flock sheet with no price; only Just me; one custom journey at a time", async ({ browser, baseURL }) => {
    const { context, page, journeys } = await open(browser, baseURL!, { admin: true, journeys: { tier: "free", openCustom: 1, finisherTips: { wave: ["Reward the first lift."] } } });
    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Buzz" }).click();
    // No locks, no Flock-only group: a trick opens its page like any other skill.
    await expect(page.locator("[data-locked]")).toHaveCount(0);
    await expect(page.getByTestId("template-list").getByRole("heading", { name: "Tricks" })).toBeVisible();
    await page.locator("[data-template='wave']").click();
    await expect(page).toHaveURL(/\/flock\/journeys\/setup\?.*template=wave/);
    await expect(page.getByTestId("flock-only-sheet")).toHaveCount(0);
    // Community content never shows: no tips, no other journeys, just one row that explains the Flock.
    await expect(page.getByTestId("how-others")).toHaveCount(0);
    await expect(page.getByTestId("finisher-tips")).toHaveCount(0);
    await page.getByTestId("how-others-locked").click();
    const sheet = page.getByTestId("flock-only-sheet");
    await expect(page.getByText("Part of the Flock", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "See how others did it" })).toBeVisible();
    await expect(sheet).toContainText("In the Flock, members share their journeys and what helped them, so you can see how other birds learned wave.");
    await expect(sheet).toContainText("The Flock is The Kya Project's community, where you'll find your local chapter, a library of guides and recordings, and other members' journeys.");
    await expect(sheet).toContainText("Join the Flock early, while it's free for everyone.");
    await expect(sheet.getByRole("button", { name: "Join the Flock free" })).toBeVisible();
    await expect(sheet).not.toContainText("$");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("visibility").locator("[role='radio']")).toHaveText(["Just me"]);
    await expect(page.getByText("Sharing journeys with the community comes with Flock membership.")).toBeVisible();
    await page.getByRole("button", { name: "Start Buzz's journey" }).click();
    await expect.poll(() => journeys.starts.length).toBe(1);
    expect(journeys.starts[0]).toMatchObject({ p_template_slug: "wave", p_visibility: "private" });
    expect(journeys.calls.some((c) => c.fn === "journey_skill_journeys" || c.fn === "journey_finisher_tips_for")).toBe(false);

    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Buzz" }).click();
    // No "Skills from the Flock" for a free account (1.20c), and no call for them.
    await expect(page.getByTestId("write-own")).toBeVisible();
    await expect(page.getByTestId("from-flock-skills")).toHaveCount(0);
    expect(journeys.calls.some((c) => c.fn === "journey_member_skills")).toBe(false);
    await page.getByTestId("write-own").click();
    await expect(page.getByTestId("custom-limit-sheet")).toHaveText(
      "Free accounts can have one custom journey going at a time. Flock members can start as many as they like.Got it");
    await page.getByRole("button", { name: "Got it" }).click();
    // The Journeys tab: no From the Flock for a free account.
    await page.goto("/flock/journeys");
    await expect(page.getByTestId("start-journey")).toBeVisible();
    await expect(page.getByTestId("from-the-flock")).toHaveCount(0);
    await context.close();
  });
});

test("everyone else: every /flock URL sends them Home and no Community code loads", async ({ browser, baseURL }) => {
  for (const size of ["phone", "duo"] as const) {
    const { context, page, flockChunks } = await open(browser, baseURL!, { admin: false, size });
    // The gate (flock_enabled) is the only Community call a non-admin ever makes.
    const calls: string[] = [];
    context.on("request", (r) => { const m = r.url().match(/\/rpc\/((?:flock|journey)_\w+)/); if (m && m[1] !== "flock_enabled") calls.push(m[1]); });
    // Nor the library's table or files.
    context.on("request", (r) => { if (/\/rest\/v1\/library_resources\b|\/storage\/v1\/object\/(?:sign\/)?flock-library\//.test(r.url())) calls.push(r.url()); });
    for (const path of ["/flock", "/flock/journeys", "/flock/journeys/start", "/flock/journeys/setup?bird=x&template=step-up", "/flock/journeys/known?bird=x", "/flock/journeys/00000000-0000-4000-8000-0000000074a1/post", "/flock/journeys/00000000-0000-4000-8000-0000000074a1/finished", "/flock/journeys/00000000-0000-4000-8000-0000000074a1/story", "/flock/journeys/00000000-0000-4000-8000-0000000074a1/compare", "/flock/chapter", "/flock/library", "/flock/spaces", "/flock/learn", "/flock?space=good",
      "/flock/post/new", "/flock/post/00000000-0000-4000-8000-0000000079a1", "/flock/you/notifications", "/admin/review", "/flock/idea", "/admin/ideas", "/flock/chapter?tab=events", "/flock/events/new",
      "/flock/chapter?tab=resources", "/flock/places", "/flock/places?region=texas",
      "/flock/library/00000000-0000-4000-8000-0000000090a1", "/flock/library?type=guides&subject=foraging&q=cups", "/admin/library", "/admin/library/new",
      "/admin/library/00000000-0000-4000-8000-0000000090a1",
      "/flock/votes/00000000-0000-4000-8000-0000000095a1", "/admin/votes", "/admin/votes/new", "/admin/votes/00000000-0000-4000-8000-0000000095a1",
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
    await page.getByTestId("post-body-input").fill("Echo has been fluffed up all day, sleeping a lot since yesterday and isn\u2019t eating much. Should I worry?");
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

  test("an everyday post brings up no vet card", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/post/new");
    await page.getByTestId("post-body-input").fill("Is avocado safe for parrots? Smoky loves his bath, all fluffed up. That's a burning question.");
    await page.getByTestId("composer-post").click();
    await expect(page).toHaveURL(/\/flock\?space=learn$/);
    expect(created(state, "flock_post_create")[0].args).toMatchObject({ p_vet_nudged: false });
    await context.close();
  });

  test("the urgent vet card: an emergency phrase wins over a today one, and posting is still never blocked", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/post/new");
    // Today and urgent both match: urgent wins.
    await page.getByTestId("post-body-input").fill("Echo has been fluffed up all day and I think he breathed the Teflon fumes.");
    await page.getByTestId("composer-post").click();
    const card = page.getByTestId("vet-nudge");
    await expect(card).toHaveAttribute("data-tier", "urgent");
    await expect(card.getByRole("heading")).toHaveText("This could be an emergency");
    await expect(card).toContainText("Call your avian vet or an emergency vet now. Please don't wait for replies here.");
    await expect(card.getByTestId("find-vet")).toHaveText("Find an emergency vet");
    await expect(card.getByTestId("find-vet")).toHaveAttribute("href", "https://www.aav.org/page/FindAVet2");
    expect(created(state, "flock_post_create")).toHaveLength(0);
    // Editing the text puts the card away; a today phrase alone brings back the today card.
    await page.getByTestId("post-body-input").fill("Echo has been fluffed up all day.");
    await expect(card).toHaveCount(0);
    await page.getByTestId("composer-post").click();
    await expect(page.getByTestId("vet-nudge")).toHaveAttribute("data-tier", "today");
    await expect(page.getByTestId("vet-nudge").getByRole("heading")).toHaveText("This sounds like something for your avian vet");
    // Urgent again, then post anyway.
    await page.getByTestId("post-body-input").fill("Kiwi ate chocolate and keeps vomiting.");
    await page.getByTestId("composer-post").click();
    await expect(page.getByTestId("vet-nudge")).toHaveAttribute("data-tier", "urgent");
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
    await expect(page.getByTestId("action-sheet").getByRole("button")).toHaveText(["Reply", "Report", "Block Priya S.", "Block and report", "Cancel"]);
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
    await expect(page.getByTestId("action-sheet").getByRole("button")).toHaveText(["Reply", "Report", "Block Alex R.", "Block and report", "Cancel"]);
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
    await expect(page.getByTestId("action-sheet").getByRole("button")).toHaveText(["Reply", "Report", "Block Alex R.", "Block and report", "Cancel"]);
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
    await expect(page.getByTestId("action-sheet").getByRole("button")).toHaveText(["Reply", "Report", "Block Alex R.", "Block and report", "Cancel"]);
    await page.getByTestId("action-sheet").locator("[data-action='report']").click();
    await page.getByTestId("report-sheet").locator("[data-reason='spam']").click();
    await page.getByTestId("report-sheet").getByRole("button", { name: "Send report" }).click();
    expect(state.calls.filter((c) => c.fn === "flock_report").at(-1)!.args).toMatchObject({ p_subject_type: "comment", p_subject_id: COMMENT, p_reason: "spam", p_note: null });
    await context.close();
  });

  test("block from a post, block and report from a comment, and unblock from Blocked members", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    seedPost(state);
    const PRIYA = "00000000-0000-4000-8000-00000000e002";
    const PRIYA_POST = "00000000-0000-4000-8000-0000000079a2";
    const PRIYA_COMMENT = "00000000-0000-4000-8000-0000000079c2";
    state.posts.push({ post_id: PRIYA_POST, author_id: PRIYA, author_name: "Priya S.", space: "learn", body: "Our first foraging box!", status: "live", created_at: hoursAgo(3) });
    state.comments.push({ comment_id: PRIYA_COMMENT, subject_type: "post", subject_id: POST, author_id: PRIYA, author_name: "Priya S.", body: "Please don't.", created_at: hoursAgo(0.5) });

    // Block from a post's menu: a calm confirmation, and the post is gone.
    await page.goto("/flock");
    await page.locator(`[data-post='${POST}']`).getByTestId("post-more").click();
    await page.getByTestId("action-sheet").locator("[data-action='block']").click();
    await expect(page.getByRole("heading", { name: "Block Alex R.?" })).toBeVisible();
    await expect(page.getByText("They won't be told.")).toBeVisible();
    await page.getByTestId("confirm-delete").click();
    await expect.poll(() => state.calls.find((c) => c.fn === "flock_block")?.args).toMatchObject({ p_user_id: ALEX, p_on: true });
    await expect(page.locator(`[data-post='${POST}']`)).toHaveCount(0);
    await expect(page.locator(`[data-post='${PRIYA_POST}']`)).toBeVisible();

    // Block and report from a comment: the report goes first, then the block.
    state.blocks = [];
    await page.goto(`/flock/post/${POST}`);
    await page.locator(`[data-comment='${PRIYA_COMMENT}']`).getByTestId("comment-more").click();
    await page.getByTestId("action-sheet").locator("[data-action='block-report']").click();
    const sheet = page.getByTestId("report-sheet");
    await sheet.locator("[data-reason='unkind']").click();
    await sheet.getByRole("button", { name: "Report and block" }).click();
    await expect(page.getByTestId("report-done")).toContainText("You've also blocked Priya S.");
    const order = state.calls.filter((c) => c.fn === "flock_report" || c.fn === "flock_block").map((c) => c.fn);
    expect(order.slice(-2)).toEqual(["flock_report", "flock_block"]);
    expect(state.calls.filter((c) => c.fn === "flock_report").at(-1)!.args).toMatchObject({ p_subject_type: "comment", p_subject_id: PRIYA_COMMENT, p_reason: "unkind" });
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.locator(`[data-comment='${PRIYA_COMMENT}']`)).toHaveCount(0);

    // Flock settings, Blocked members: the list, and Unblock.
    await page.goto("/flock/you");
    await page.getByText("Blocked members").click();
    await expect(page).toHaveURL(/\/flock\/you\/blocked$/);
    await expect(page.getByTestId("blocked-list").locator("li")).toHaveText([/Priya S\./]);
    await page.getByTestId("unblock").click();
    await expect(page.getByRole("heading", { name: "Unblock Priya S.?" })).toBeVisible();
    await page.getByTestId("confirm-delete").click();
    await expect.poll(() => state.calls.filter((c) => c.fn === "flock_block").at(-1)?.args).toMatchObject({ p_user_id: PRIYA, p_on: false });
    await expect(page.getByText("No one is blocked")).toBeVisible();
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
    seedPost(state);
    // Reached from Flock settings (reviewers only), with the waiting count.
    await page.goto("/flock/you");
    const entry = page.getByTestId("you-review-queue");
    await expect(entry).toContainText("Admin · 3 waiting");
    await entry.getByRole("button", { name: /Review queue/ }).click();
    await expect(page).toHaveURL(/\/admin\/review$/);
    await expect(page.getByRole("heading", { level: 1, name: "Review queue" })).toBeVisible();
    await expect(page.getByTestId("queue-chips").getByRole("button")).toHaveText(["All 3", "Do good 2", "Events 0", "Places 0", "Reports 1"]);
    const roof = page.locator("[data-subject='00000000-0000-4000-8000-0000000079d1']");
    await expect(roof).toContainText("Help Midwest Avian Rescue replace its aviary roof");
    // Each item names its author, space and date.
    await expect(roof.getByTestId("queue-item-label")).toHaveText("Do good");
    await expect(roof).toContainText("Jordan L. · Great Lakes · 3h");
    const reported = page.locator("[data-subject='00000000-0000-4000-8000-0000000079d3']");
    await expect(reported.getByTestId("queue-item-label")).toHaveText("Report · comment · Learn together");
    await expect(reported).toContainText("Reported by 2 members · 1h");
    expect(state.calls.find((c) => c.fn === "flock_review_post_spaces")!.args).toMatchObject({ p_post_ids: [POST] });
    await roof.locator("[data-act='approve']").click();
    expect(state.calls.find((c) => c.fn === "flock_review_post")!.args).toMatchObject({ p_post_id: "00000000-0000-4000-8000-0000000079d1", p_decision: "approve" });
    await expect(page.getByTestId("queue-chips").getByRole("button")).toHaveText(["All 2", "Do good 1", "Events 0", "Places 0", "Reports 1"]);

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
    await expect(page.getByTestId("queue-chips").getByRole("button")).toHaveText(["All 2", "Do good 0", "Events 2", "Places 0", "Reports 0"]);
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

  test("the Resources tab: directory cards in three groups, Suggest a place, and the review", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.places = [
      { place_id: "00000000-0000-4000-8000-0000000086a1", region_slug: "great-lakes", kind: "vet", name: "Lakeshore Bird & Exotic Clinic", area: "Fort Wayne, IN",
        phone: "(260) 555-0100", website: "https://lakeshorebirds.example.com", note: "Sees macaws and greys. Open Saturdays.", position: 1, updated_at: "2026-11-22T15:00:00Z" },
      { place_id: "00000000-0000-4000-8000-0000000086a2", region_slug: "great-lakes", kind: "rescue", name: "Birds and Beaks", area: "Indiana",
        phone: null, website: null, note: "Adoptions, fostering, and great advice.", position: 1, updated_at: "2026-11-02T15:00:00Z" },
    ];
    await page.goto("/flock/chapter?tab=resources");
    await expect(page.getByTestId("places-disclaimer")).toHaveText("Places members in your chapter recommend. These are community picks, not endorsements.");
    await expect(page.locator("[data-place-group] h2")).toHaveText(["Avian vets", "Rescues", "Shops and services"]);
    const vet = page.locator("[data-place='00000000-0000-4000-8000-0000000086a1']");
    await expect(vet).toContainText("Fort Wayne, IN");
    await expect(vet.getByTestId("place-call")).toHaveAttribute("href", "tel:2605550100");
    await expect(vet.getByTestId("place-website")).toHaveAttribute("href", "https://lakeshorebirds.example.com/");
    // A directory, not a post: nothing to react to, comment on or open.
    await expect(vet.getByRole("button")).toHaveCount(0);
    await expect(page.locator("[data-place='00000000-0000-4000-8000-0000000086a2'] [data-testid='place-call']")).toHaveCount(0);
    await expect(page.locator("[data-place-group='shop'] [data-testid='place-group-empty']")).toBeVisible();
    await expect(page.getByTestId("places-manage")).toHaveCount(0);

    await page.getByTestId("suggest-place").click();
    const sheet = page.getByTestId("suggest-place-sheet");
    await sheet.locator("[data-kind='shop']").click();
    await sheet.getByTestId("place-name").fill("Feather & Perch");
    await sheet.getByTestId("place-area").fill("Ann Arbor, MI");
    await sheet.getByTestId("place-note").fill("Great toys and they know their birds.");
    await sheet.getByRole("button", { name: "Send suggestion" }).click();
    await expect(page.getByTestId("place-sent")).toBeVisible();
    expect(state.calls.find((c) => c.fn === "flock_place_suggest")?.args).toMatchObject({ p_kind: "shop", p_name: "Feather & Perch", p_area: "Ann Arbor, MI" });
    // Not shown until it's approved.
    await expect(page.locator("[data-place-group='shop'] [data-place]")).toHaveCount(0);

    // The chapter's managers see it waiting and approve it in the review queue.
    state.placeManage = true;
    await page.goto("/admin/review?filter=places");
    await expect(page.getByTestId("queue-chips").getByRole("button")).toHaveText(["All 1", "Do good 0", "Events 0", "Places 1", "Reports 0"]);
    const item = page.locator("[data-queue-item='place']");
    await expect(item.getByTestId("queue-item-label")).toHaveText("Place suggestion · Shop or service · Great Lakes chapter");
    await expect(item).toContainText("Feather & Perch");
    await item.locator("[data-act='approve']").click();
    await expect(page.getByTestId("queue-empty")).toBeVisible();
    expect(state.calls.find((c) => c.fn === "flock_place_review")?.args).toMatchObject({ p_decision: "approve" });

    await page.goto("/flock/chapter?tab=resources");
    await expect(page.locator("[data-place-group='shop'] [data-place]")).toContainText("Feather & Perch");
    await page.getByTestId("places-manage-link").click();
    await expect(page).toHaveURL(/\/flock\/places/);
    const rows = page.getByTestId("manage-places").locator("[data-manage-place]");
    await expect(rows).toHaveCount(3);
    await expect(rows.first().getByTestId("place-updated")).toHaveText(/^Updated Nov 22/);
    await expect(rows.first().locator("[data-act='up']")).toBeDisabled();
    await rows.first().locator("[data-act='edit']").click();
    const form = page.getByTestId("place-form");
    await form.getByTestId("place-website-input").fill("mailto:vet@example.com");
    await expect(form.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await form.getByTestId("place-website-input").fill("lakeshorebirds.example.com");
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(form).toHaveCount(0);
    expect(state.calls.find((c) => c.fn === "flock_place_save")?.args).toMatchObject({ p_region: "great-lakes", p_kind: "vet", p_website: "lakeshorebirds.example.com" });
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

test.describe("do good voting (admin, phone)", () => {
  const OPEN = "00000000-0000-4000-8000-0000000095a1";
  const CLOSED = "00000000-0000-4000-8000-0000000095a2";
  const choice = (id: string, name: string, extra: Record<string, unknown> = {}) =>
    ({ choice_id: id, name, blurb: null, photo_path: null, percent: null, share: null, from_votes: null, votes: null, top: false, ...extra });
  const SHARED = "00000000-0000-4000-8000-0000000095a3";
  const votes = () => [
    { vote_id: OPEN, question: "Where should this quarter's donation go?", description: "20% of every membership goes to rescue and conservation partners.",
      audience: "members", state: "open", closes_at: new Date(Date.now() + 9 * 86_400_000).toISOString(), voters: 31, my_choice: null, announcement: null,
      choices: [choice("00000000-0000-4000-8000-0000000096a1", "The Macaw Society", { blurb: "Protects wild macaw nests in Tambopata, Peru.", votes: 16 }),
        choice("00000000-0000-4000-8000-0000000096a2", "Birds and Beaks Rescue", { votes: 10 }), choice("00000000-0000-4000-8000-0000000096a3", "Armonía", { votes: 5 })] },
    { vote_id: SHARED, question: "Where should last quarter's donation go?", description: null, audience: "members", state: "closed", closes_at: new Date(Date.now() - 86_400_000).toISOString(),
      voters: 64, my_choice: null, announcement: "Thank you for voting. The donation goes out this month.",
      choices: [choice("00000000-0000-4000-8000-0000000096c1", "Partner rescue A", { percent: 33, share: 33, from_votes: 23, votes: 21 }),
        choice("00000000-0000-4000-8000-0000000096c2", "Conservation project B", { percent: 48, share: 44, from_votes: 34, votes: 31 }),
        choice("00000000-0000-4000-8000-0000000096c3", "Partner rescue C", { percent: 19, share: 23, from_votes: 13, votes: 12 })] },
    { vote_id: CLOSED, question: "Which expert Q&A first?", description: null, audience: "founders", state: "closed", closes_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      voters: 2, my_choice: null, announcement: "Thank you for voting. The vet Q&A comes first.",
      choices: [choice("00000000-0000-4000-8000-0000000096b1", "Avian vet Q&A", { percent: 100, votes: 2, top: true }), choice("00000000-0000-4000-8000-0000000096b2", "Behaviorist Q&A", { percent: 0, votes: 0 })] },
  ];

  test("an open vote on Today and Do good, one final vote, and shared results after it closes", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.votes = votes();
    // Today: open votes only.
    await page.goto("/flock");
    await expect(page.getByTestId("vote-card")).toHaveCount(1);
    const card = page.locator(`[data-vote='${OPEN}']`);
    await expect(card).toContainText(/^Vote open · closes /);
    await expect(card.getByTestId("vote-count")).toHaveText("31 members have voted");
    await expect(page.getByTestId("manage-votes")).toHaveCount(0);
    // Do good: the open vote first, then the closed ones, pointing to results.
    await page.goto("/flock?space=good");
    await expect(page.getByTestId("vote-card")).toHaveCount(3);
    await expect(page.getByTestId("vote-card").first()).toHaveAttribute("data-vote", OPEN);
    await expect(page.locator(`[data-vote='${SHARED}']`).getByTestId("vote-outcome")).toHaveText("Every partner gets at least 10%. Your votes decided the rest.");
    const closed = page.locator(`[data-vote='${CLOSED}']`);
    await expect(closed.getByTestId("vote-outcome")).toHaveText("Founders chose Avian vet Q&A.");
    await expect(closed.getByTestId("vote-founders")).toHaveText("Founders");
    await expect(page.getByTestId("manage-votes")).toBeVisible();

    // Choosing: the note, nothing picked yet, then one choice and the final line.
    await card.getByTestId("vote-now").click();
    await expect(page).toHaveURL(new RegExp(`/flock/votes/${OPEN}`));
    await expect(page.getByTestId("vote-note")).toHaveText("Every partner gets at least 10%. Your vote decides how the rest is shared. You can vote once.");
    await expect(page.getByRole("button", { name: "Pick one to vote" })).toBeDisabled();
    await expect(page.getByTestId("vote-results-card")).toHaveCount(0);
    await page.getByRole("radio", { name: /Armonía/ }).click();
    await expect(page.getByTestId("vote-final")).toHaveText("Your vote is final once you tap the button.");
    await page.getByRole("button", { name: "Vote for Armonía" }).click();

    // After voting: the thank-you with the partner, and no way to change it.
    await expect(page.getByRole("heading", { name: "Thanks for voting" })).toBeVisible();
    await expect(page.getByTestId("vote-saved")).toContainText("Armonía");
    await expect(page.getByTestId("vote-count")).toHaveText("32 members have voted so far.");
    await expect(page.getByText("Every partner gets at least 10%, and the votes share out the rest.")).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await expect(page.getByTestId("vote-page").getByText(/change/i)).toHaveCount(0);
    expect(state.calls.find((c) => c.fn === "flock_vote_cast")?.args).toEqual({ p_vote_id: OPEN, p_choice_id: "00000000-0000-4000-8000-0000000096a3" });
    // Admins see the counts while it's open.
    await expect(page.getByTestId("vote-admin-counts")).toContainText("Counts (admins only) · 32 votes");
    await page.getByTestId("vote-back-good").click();
    await expect(page.locator(`[data-vote='${OPEN}']`).getByTestId("vote-now")).toHaveText("See your vote");

    // A closed donation vote: the ring, partners by share, the two-part line and the note.
    await page.goto(`/flock/votes/${SHARED}`);
    await expect(page.getByTestId("vote-page")).toHaveAttribute("data-state", "closed");
    await expect(page.getByRole("heading", { name: "How this quarter's donation is handled" })).toBeVisible();
    await expect(page.getByTestId("vote-ring").getByRole("img")).toHaveAttribute("aria-label", "Donation shares: Conservation project B 44%, Partner rescue A 33%, Partner rescue C 23%");
    await expect(page.getByTestId("vote-share")).toHaveText(["44%", "33%", "23%"]);
    const top = page.locator("[data-result='00000000-0000-4000-8000-0000000096c2']");
    await expect(top).toContainText("48% of the votes");
    await expect(top).toContainText("10% guaranteed + 34% from votes");
    await expect(page.getByTestId("vote-announcement")).toContainText("A note from Brittany");
    await expect(page.getByRole("radio")).toHaveCount(0);

    // A founders-only vote with two voters: results show, with no donation wording.
    await page.goto(`/flock/votes/${CLOSED}`);
    await expect(page.getByTestId("vote-top")).toHaveText("Avian vet Q&A");
    await expect(page.locator("[data-result='00000000-0000-4000-8000-0000000096b2']")).toContainText("0%");
    await expect(page.getByTestId("vote-announcement")).toContainText("Thank you for voting. The vet Q&A comes first.");
    await expect(page.getByTestId("vote-page").getByText(/guaranteed|donation/i)).toHaveCount(0);

    // The admin's closed view: the shares to use.
    await page.goto(`/admin/votes/${SHARED}`);
    await expect(page.getByTestId("vote-admin-shares")).toContainText("Use these shares when you send the donation.");
    await expect(page.getByTestId("vote-admin-counts")).toContainText("Counts (admins only) · 64 votes");

    // The admin list.
    await page.goto("/admin/votes");
    await expect(page.getByTestId("admin-votes-list").locator("[data-vote]")).toHaveCount(3);
    await expect(page.locator(`[data-vote='${OPEN}'] [data-testid='vote-status']`)).toHaveText("Open");
    await context.close();
  });
});

test.describe("badges (admin, phone)", () => {
  const day = "2026-11-20T15:00:00Z";
  const none = (badge: string) => ({ badge, level: 0, earned_at: null, unseen: false, at_launch: false });

  test("history earns one \"Here's what you've already earned\", and Not now puts it away for good", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.badges = [
      { badge: "first_steps", level: 1, earned_at: day, unseen: true, at_launch: true },
      { badge: "journey_finisher", level: 3, earned_at: day, unseen: true, at_launch: true },
      none("trick_star"), none("good_neighbor"),
      { badge: "voice_of_the_flock", level: 1, earned_at: day, unseen: true, at_launch: true },
      none("challenge_champ"),
    ];
    await page.goto("/flock");
    const dialog = page.getByTestId("badges-launch");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Here's what you've already earned")).toBeVisible();
    await expect(dialog.locator("[data-badge]")).toHaveCount(3);
    await expect(dialog.locator("[data-badge='journey_finisher']")).toContainText("3 journeys");
    await expect(page.getByTestId("badge-earned")).toHaveCount(0);
    await page.getByTestId("badges-launch-later").click();
    await expect(dialog).toHaveCount(0);
    expect(state.calls.filter((c) => c.fn === "flock_badges_seen").at(-1)!.args).toEqual({ p_badges: ["first_steps", "journey_finisher", "voice_of_the_flock"] });
    await page.reload();
    await expect(page.getByTestId("today-chips")).toBeVisible();
    await expect(page.getByTestId("badges-launch")).toHaveCount(0);
    await context.close();
  });

  test("a new badge gets its own card on Today, and Got it clears it", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.badges = [
      { badge: "first_steps", level: 1, earned_at: day, unseen: false, at_launch: true },
      { badge: "journey_finisher", level: 3, earned_at: day, unseen: true, at_launch: false },
      none("trick_star"), none("good_neighbor"), none("voice_of_the_flock"), none("challenge_champ"),
    ];
    await page.goto("/flock");
    const card = page.getByTestId("badge-earned");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Badge earned");
    await expect(card).toContainText("Journey finisher · 3 journeys");
    await expect(card).toContainText("You've finished 3 journeys.");
    await expect(page.getByTestId("badges-launch")).toHaveCount(0);
    await card.getByTestId("badge-earned-done").click();
    await expect(page.getByTestId("badge-earned")).toHaveCount(0);
    expect(state.calls.filter((c) => c.fn === "flock_badges_seen").at(-1)!.args).toEqual({ p_badges: ["journey_finisher"] });
    await context.close();
  });

  test("the Badges screen: reached from Flock settings, earned in color, the rest gray with how to earn them", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.badges = [
      { badge: "first_steps", level: 1, earned_at: day, unseen: false, at_launch: true },
      { badge: "journey_finisher", level: 3, earned_at: day, unseen: true, at_launch: false },
      none("trick_star"), none("good_neighbor"), none("voice_of_the_flock"), none("challenge_champ"),
    ];
    await page.goto("/flock/you");
    await expect(page.getByTestId("you-badges")).toContainText("2 of 6 earned");
    await page.getByTestId("you-badges").getByText("Badges", { exact: true }).click();
    await expect(page).toHaveURL(/\/flock\/you\/badges$/);
    await expect(page.getByText("2 of 6 earned")).toBeVisible();
    const grid = page.getByTestId("badges-grid");
    await expect(grid.locator("[data-badge]")).toHaveCount(6);
    await expect(grid.locator("[data-earned='true']")).toHaveCount(2);
    await expect(grid.locator("[data-badge]")).toHaveText([/First steps/, /Journey finisher/, /Trick star/, /Good neighbor/, /Voice of the Flock/, /Challenge champ/]);
    // The first one not earned yet is picked to start, with how to earn it.
    await expect(page.getByTestId("badge-how")).toHaveText("Trick star: finish any tricks journey.");
    await grid.locator("[data-badge='good_neighbor']").click();
    await expect(page.getByTestId("badge-how")).toContainText("have a Do good post approved");
    await grid.locator("[data-badge='journey_finisher']").click();
    await expect(page.getByTestId("badge-earned-on")).toContainText("3 journeys reached November 20, 2026.");
    await expect(page.getByTestId("badge-earned-on")).toContainText("Next level at 10 journeys.");
    // Opening the screen counts as seeing the new one.
    await expect.poll(() => state.calls.some((c) => c.fn === "flock_badges_seen" && c.args.p_badges === null)).toBe(true);
    await context.close();
  });

  test("a member's profile shows the badges the database returns for it, beside the founder badge", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    const ADA = "00000000-0000-4000-8000-00000000f001";
    const CY = "00000000-0000-4000-8000-00000000f002";
    state.roster = [
      { user_id: ADA, display_name: "Ada L.", photo_path: null, is_founder: true, is_lead: false, birds: [] },
      { user_id: CY, display_name: "Cy T.", photo_path: null, is_founder: false, is_lead: false, birds: [] },
    ];
    state.memberBadges = { [ADA]: [{ badge: "first_steps", level: 1 }, { badge: "journey_finisher", level: 10 }] };
    await page.goto(`/flock/members/${ADA}`);
    const pills = page.getByTestId("member-badges").locator("li");
    await expect(pills).toHaveText(["First steps", "Journey finisher · 10 journeys"]);
    await expect(page.getByTestId("member-founder-link")).toBeVisible();
    expect(state.calls.filter((c) => c.fn === "flock_member_badges").at(-1)!.args).toEqual({ p_user_id: ADA });
    // None (hidden, blocked or not earned): no badge row at all.
    await page.goto(`/flock/members/${CY}`);
    await expect(page.getByText("Cy T.").first()).toBeVisible();
    await expect(page.getByTestId("member-badges")).toHaveCount(0);
    await context.close();
  });

  test("Edit profile: \"Show my badges on my profile\" is on until turned off, and saves at once", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/you/edit");
    const toggle = page.getByTestId("badges-toggle");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(toggle).toContainText("Show my badges on my profile.");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(state.calls.filter((c) => c.fn === "flock_set_badges_shown").at(-1)!.args).toEqual({ p_shown: false });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(state.calls.filter((c) => c.fn === "flock_set_badges_shown").at(-1)!.args).toEqual({ p_shown: true });
    await context.close();
  });
});

test.describe("the founding members page (admin, phone)", () => {
  test("the page: a thank-you line, opted-in founders in spot order with photo, name, chapter and spot; reached from Flock settings", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.founders = [
      { display_name: "Ada L.", photo_path: null, chapter_name: "Great Lakes", spot_number: 1 },
      { display_name: "Cleo M.", photo_path: null, chapter_name: "Texas", spot_number: 3 },
    ];
    await page.goto("/flock/you");
    await page.getByText("Founding members", { exact: true }).click();
    await expect(page).toHaveURL(/\/flock\/founders$/);
    await expect(page.getByText("Thank you to the first 50, who helped start the Flock.")).toBeVisible();
    const rows = page.getByTestId("founders-list").locator("li");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Ada L.");
    await expect(rows.nth(0)).toContainText("Great Lakes");
    await expect(rows.nth(0)).toContainText("#1");
    await expect(rows.nth(1)).toContainText("Cleo M.");
    await expect(rows.nth(1)).toContainText("#3");
    expect(state.calls.some((c) => c.fn === "flock_founders")).toBe(true);
    await context.close();
  });

  test("the empty state: a gentle line when nobody has chosen to appear yet", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/founders");
    await expect(page.getByText("No one here yet")).toBeVisible();
    await expect(page.getByText("Founding members can choose to appear here.", { exact: false })).toBeVisible();
    await context.close();
  });

  test("links: the founding perk line and a profile's founder badge open the page", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/you/membership");
    await page.getByTestId("membership-founders-link").click();
    await expect(page).toHaveURL(/\/flock\/founders$/);
    const ADA = "00000000-0000-4000-8000-00000000f001";
    state.roster = [{ user_id: ADA, display_name: "Ada L.", photo_path: null, is_founder: true, is_lead: false, birds: [] }];
    await page.goto(`/flock/members/${ADA}`);
    await page.getByTestId("member-founder-link").click();
    await expect(page).toHaveURL(/\/flock\/founders$/);
    await context.close();
  });

  test("a founder's toggle on Edit profile: unchecked until chosen, saved at once, and can be turned off", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/you/edit");
    const toggle = page.getByTestId("founders-toggle");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await expect(toggle).toContainText("Show me on the founding members page.");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    expect(state.calls.filter((c) => c.fn === "founding_set_show").at(-1)!.args).toEqual({ p_show: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(state.calls.filter((c) => c.fn === "founding_set_show").at(-1)!.args).toEqual({ p_show: false });
    await context.close();
  });

  test("no toggle for someone without a founding spot", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.foundersShow = null;
    await page.route(`${MOCK}/rest/v1/rpc/flock_my_setup`, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([{ suggested_region: "great-lakes", founding_spot: null, setup_completed_at: new Date().toISOString() }]) }));
    await page.goto("/flock/you/edit");
    await expect(page.getByTestId("edit-name")).toBeVisible();
    await expect(page.getByTestId("founders-toggle")).toHaveCount(0);
    await context.close();
  });

  test("the claim page: \"Show me on the founding members page\" is unchecked by default and goes with the claim", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.foundersShow = null;  // no claim yet
    const posts: string[] = [];
    await page.route("**/_serverFn/**", (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      posts.push(route.request().postData() ?? "");
      return route.fulfill({ status: 500, body: "stopped by the test" });
    });
    await page.goto("/founding?claim=1");
    const box = page.getByTestId("founding-show-on-page");
    await expect(box).toBeVisible();
    await expect(box).not.toBeChecked();
    await page.locator("#founding-region").selectOption("great-lakes");
    await page.getByRole("button", { name: "Confirm my founding spot" }).click();
    await expect.poll(() => posts.length).toBe(1);
    await box.check();
    await page.getByRole("button", { name: "Confirm my founding spot" }).click();
    await expect.poll(() => posts.length).toBe(2);
    expect(posts[0]).toContain("showOnFoundersPage");
    expect(posts[1]).toContain("showOnFoundersPage");
    expect(posts[0]).not.toEqual(posts[1]);
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
    await expect(page.getByText("Founding · free while we're getting started, then $15/mo for life")).toBeVisible();
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


/** Answer the app's own server functions for clips and photos (they run on the
 *  test server, which can't reach Cloudflare or Storage): plain JSON
 *  `{ result }`, which the server-function client unwraps as is. */
async function mockMediaFns(context: BrowserContext, answer: {
  clips?: () => unknown[]; photos?: () => Record<string, unknown>;
}) {
  await context.route("**/_serverFn/**", async (route) => {
    const body = route.request().postData() ?? "";
    const reply = (v: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: v }) });
    if (answer.clips && body.includes("journeyId")) return reply(answer.clips());
    if (answer.photos && body.includes("postIds")) return reply(answer.photos());
    return route.continue();
  });
}

/** A data: URL image of a given size (an SVG), for photo frames. */
const svgPhoto = (w: number, h: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#5a8c7a"/><circle cx="${w / 2}" cy="${h * 0.15}" r="${w / 6}" fill="#f2c94c"/></svg>`)}`;

test.describe("photos and clips at their own shape, never the player's error (admin, phone)", () => {
  test("a tall photo: 4:5 with its top kept; a wide one at its own shape; tap opens full screen, swipe between photos", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    const TALL = "00000000-0000-4000-8000-00000000a0a1";
    const MANY = "00000000-0000-4000-8000-00000000a0a2";
    state.posts.push({ post_id: TALL, author_id: "00000000-0000-4000-8000-00000000f002", author_name: "Alex R.", space: "learn", body: "Echo on the perch", photo_count: 1, status: "live", created_at: new Date(Date.now() - 60_000).toISOString() });
    state.posts.push({ post_id: MANY, author_id: "00000000-0000-4000-8000-00000000f002", author_name: "Alex R.", space: "learn", body: "Two views", photo_count: 2, status: "live", created_at: new Date(Date.now() - 120_000).toISOString() });
    await mockMediaFns(context, { photos: () => ({
      [`post:${TALL}`]: [{ url: svgPhoto(900, 1600), original: svgPhoto(900, 1600), width: 900, height: 1600 }],
      [`post:${MANY}`]: [
        { url: svgPhoto(1200, 900), original: svgPhoto(1200, 900), width: 1200, height: 900 },
        { url: svgPhoto(900, 1200), original: svgPhoto(900, 1200), width: 900, height: 1200 },
      ],
    }) });
    await page.goto("/flock?space=learn");
    const tall = page.locator(`[data-post="${TALL}"]`).getByTestId("post-photo");
    await expect(tall).toHaveAttribute("data-ratio", "0.800");
    await expect(tall).toHaveAttribute("data-cropped", "true");
    await expect(tall.locator("img")).toHaveCSS("object-position", "50% 20%");
    const box = await tall.boundingBox();
    expect(box && Math.abs(box.width / box.height - 0.8) < 0.02).toBeTruthy();
    const many = page.locator(`[data-post="${MANY}"]`);
    await expect(many.getByTestId("post-photo").first()).toHaveAttribute("data-ratio", "1.333");
    await expect(many.getByTestId("photo-count")).toHaveText("1 of 2");
    // Full screen, then swipe to the second.
    await many.getByTestId("post-photo").first().getByRole("button").click();
    const viewer = page.getByTestId("photo-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.getByTestId("photo-viewer-image")).toHaveCount(2);
    await expect(viewer.getByTestId("photo-viewer-count")).toHaveText("1 of 2");
    await viewer.locator("div.snap-x").evaluate((el) => el.scrollTo({ left: el.clientWidth }));
    await expect(viewer.getByTestId("photo-viewer-count")).toHaveText("2 of 2");
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await context.close();
  });

  test("a new clip: Getting the clip ready…, asked again until it's ready; one that can't play says so with Try again and records a save error", async ({ browser, baseURL }) => {
    const id = "00000000-0000-4000-8000-0000000074a1";
    let status = "processing";
    let asks = 0;
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ id, birdName: "Buzz", slug: "step-up", done: 1, clips: 2 }] } });
    const saveErrors: any[] = [];
    await context.route(`${MOCK}/rest/v1/save_errors**`, async (route) => { saveErrors.push(route.request().postDataJSON()); await route.fulfill({ status: 201, body: "" }); });
    await mockMediaFns(context, { clips: () => {
      asks++;
      return ["00000000-0000-4000-8000-000000009000", "00000000-0000-4000-8000-000000009001"].map((updateId) => ({ updateId, status }));
    } });
    await page.goto(`/flock/journeys/${id}`);
    await expect(page.getByTestId("clip-grid").getByTestId("clip-tile-state").first()).toHaveAttribute("data-phase", "processing");
    await page.getByTestId("clip-grid").locator("[data-tile]").first().click();
    const state = page.getByTestId("clip-state");
    await expect(state).toHaveAttribute("data-phase", "processing");
    await expect(state).toHaveText(/Getting the clip ready…/);
    await expect.poll(() => asks, { timeout: 15_000 }).toBeGreaterThan(2);
    // Cloudflare says it can't be played: our message, never the player's.
    status = "failed";
    await expect(state).toHaveAttribute("data-phase", "failed", { timeout: 15_000 });
    await expect(state).toContainText("We couldn't play this clip. Try again in a moment.");
    await expect(page.getByTestId("clip-iframe")).toHaveCount(0);
    await expect.poll(() => saveErrors.length).toBeGreaterThan(0);
    expect(saveErrors[0]).toMatchObject({ category: "server", target: "journey_clip" });
    expect(JSON.stringify(saveErrors[0])).not.toContain("Buzz");
    const before = asks;
    await state.getByTestId("clip-retry").click();
    await expect.poll(() => asks).toBeGreaterThan(before);
    await context.close();
  });

  test("a ready clip plays through its signed links on the story viewer and Day one vs. now", async ({ browser, baseURL }) => {
    const id = "00000000-0000-4000-8000-0000000074a1";
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ id, birdName: "Buzz", slug: "step-up", done: 1, clips: 2 }] } });
    const signed = (n: number) => ({ player: `https://iframe.videodelivery.net/signed-token-${n}`, thumbnail: svgPhoto(270, 480), hls: `https://videodelivery.net/signed-token-${n}/manifest/video.m3u8` });
    await mockMediaFns(context, { clips: () => [0, 1].map((n) => ({ updateId: `00000000-0000-4000-8000-00000000900${n}`, status: "ready", ...signed(n) })) });
    // The player asks for the signed link (HLS in WebKit, the Stream player elsewhere).
    // These test links can't really play, so afterwards our own message shows, never the player's.
    const asked = page.waitForRequest(/signed-token-1/);
    await page.goto(`/flock/journeys/${id}/story?u=00000000-0000-4000-8000-000000009001`);
    await asked;
    await expect(page.locator("iframe[src*='videodelivery'], video[src*='videodelivery']").or(page.getByTestId("clip-state"))).toHaveCount(1);
    const both = Promise.all([page.waitForRequest(/signed-token-0/), page.waitForRequest(/signed-token-1/)]);
    await page.goto(`/flock/journeys/${id}/compare`);
    await both;
    await context.close();
  });
});

// ---- Share cards (backlog 1.7) --------------------------------------------------------------

test.describe("share cards (admin, phone)", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const size = (page: Page) => page.getByTestId("card-preview").evaluate((img: HTMLImageElement) => `${img.naturalWidth}x${img.naturalHeight}`);

  test("a big moment: post and story sizes, the bird's name on by default, Share downloads the PNG on the web", async ({ browser, baseURL }) => {
    const id = "00000000-0000-4000-8000-0000000074a1";
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ id, birdName: "Echo", slug: "step-up", done: 0, clips: 2 }] } });
    // The newest seeded update is the big moment.
    await page.goto(`/flock/journeys/${id}/card?kind=moment&u=00000000-0000-4000-8000-000000009001`);
    const card = page.getByTestId("share-card");
    await expect(card).toHaveAttribute("data-kind", "moment");
    await expect(card).toHaveAttribute("data-size", "post");
    await expect(page.locator("[data-flock-tab]")).toHaveCount(0);
    await expect(page.getByTestId("card-preview")).toHaveAttribute("src", /^blob:/);
    await expect.poll(() => size(page)).toBe("1080x1350");
    await expect(page.getByTestId("card-preview")).toHaveAttribute("alt", "A big moment for Echo!");
    await page.getByTestId("card-size-story").click();
    await expect.poll(() => size(page)).toBe("1080x1920");
    await expect(page.getByRole("switch", { name: "Show Echo's name" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("On the web, this downloads the image so you can post it.")).toBeVisible();
    let download = page.waitForEvent("download");
    await page.getByTestId("card-share").click();
    expect((await download).suggestedFilename()).toBe("echo-step-up-story.png");
    await expect(page.getByTestId("card-note")).toHaveText("The card is in your downloads, ready to post.");
    // The bird's name off: the card and the file name leave it out.
    await page.getByRole("switch", { name: "Show Echo's name" }).click();
    await expect(page.getByTestId("card-preview")).toHaveAttribute("alt", "A big moment!");
    download = page.waitForEvent("download");
    await page.getByTestId("card-share").click();
    expect((await download).suggestedFilename()).toBe("step-up-story.png");
    // An update that isn't a big moment has no card.
    await page.goto(`/flock/journeys/${id}/card?kind=moment&u=00000000-0000-4000-8000-000000009000`);
    await expect(page.getByTestId("card-unavailable")).toBeVisible();
    await context.close();
  });

  test("a finished journey: the card from the journey page", async ({ browser, baseURL }) => {
    const id = "00000000-0000-4000-8000-0000000074a2";
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { seed: [{ id, birdName: "Willow", slug: "spin", done: 5, status: "finished" }] } });
    await page.goto(`/flock/journeys/${id}`);
    await page.getByRole("button", { name: "Make a share card" }).click();
    await expect(page).toHaveURL(/\/card\?kind=finished$/);
    await expect(page.getByTestId("card-preview")).toHaveAttribute("alt", "Willow learned spin");
    await expect.poll(() => size(page)).toBe("1080x1350");
    // A finished journey offers no more posting or "learned it".
    await page.goBack();
    await expect(page.getByTestId("journey-page")).toBeVisible();
    await expect(page.getByTestId("post-update")).toHaveCount(0);
    await expect(page.getByTestId("learned-it")).toHaveCount(0);
    await context.close();
  });

  test("day one vs. now: two stills from your own clips, story size; never from someone else's journey", async ({ browser, baseURL }) => {
    const id = "00000000-0000-4000-8000-0000000074a1";
    const other = "00000000-0000-4000-8000-0000000074a3";
    const { context, page } = await open(browser, baseURL!, { admin: true, journeys: { seed: [
      { id, birdName: "Buzz", slug: "step-up", done: 1, clips: 2 },
      { id: other, birdName: "Kiwi", slug: "recall", done: 5, clips: 3, owner: "Alex R.", region: "Great Lakes" },
    ] } });
    const signed = (n: number) => ({ player: `https://iframe.videodelivery.net/signed-token-${n}`, thumbnail: svgPhoto(270, 480), hls: `https://videodelivery.net/signed-token-${n}/manifest/video.m3u8` });
    await mockMediaFns(context, { clips: () => [0, 1].map((n) => ({ updateId: `00000000-0000-4000-8000-00000000900${n}`, status: "ready", ...signed(n) })) });
    const asked: string[][] = [];
    await context.route("**/_serverFn/**", async (route) => {
      const body = route.request().postData() ?? "";
      if (!body.includes("cardJourneyId")) return route.fallback();
      const ids = [...body.matchAll(/00000000-0000-4000-8000-0000000090\d\d/g)].map((m) => m[0]);
      asked.push(ids);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: Object.fromEntries(ids.map((u) => [u, PNG])) }) });
    });
    await page.goto(`/flock/journeys/${id}/compare`);
    await page.getByRole("button", { name: "Make a share card" }).click();
    await expect(page).toHaveURL(/kind=compare/);
    await expect(page.getByTestId("share-card")).toHaveAttribute("data-size", "story");
    await expect.poll(() => size(page)).toBe("1080x1920");
    await expect(page.getByTestId("card-preview")).toHaveAttribute("alt", "Buzz, day one and now");
    expect([...new Set(asked.flat())].sort()).toEqual(["00000000-0000-4000-8000-000000009000", "00000000-0000-4000-8000-000000009001"]);
    // Someone else's community journey: no button, and the card screen refuses.
    asked.length = 0;
    await page.goto(`/flock/journeys/${other}/compare`);
    await expect(page.getByTestId("compare-summary")).toBeVisible();
    await expect(page.getByRole("button", { name: "Make a share card" })).toHaveCount(0);
    await page.goto(`/flock/journeys/${other}/card?kind=compare&a=00000000-0000-4000-8000-000000009000&b=00000000-0000-4000-8000-000000009002`);
    await expect(page.getByTestId("card-unavailable")).toBeVisible();
    expect(asked).toEqual([]);
    await context.close();
  });
});

// ---- The library (20261118120000_flock_library) ---------------------------------------------

type LibraryState = {
  rows: Record<string, any>[];
  searches: Record<string, any>[];
  writes: { method: string; body: any; url: string }[];
  uploads: string[];
  removed: string[];
};

/** The library the way the database answers: flock_library_search and
 *  flock_library_resource return published rows only; the admin reads and
 *  writes library_resources; files in flock-library are signed and uploaded. */
async function mockLibrary(context: BrowserContext, rows: Record<string, any>[] = []): Promise<LibraryState> {
  const state: LibraryState = { rows, searches: [], writes: [], uploads: [], removed: [] };
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
  const full = (r: any) => ({
    summary: "", body: "", topics: [], species: [], cover_path: null, external_url: null, attachment_path: null, status: "draft",
    vet_reviewed: false, vet_reviewer: null, vet_reviewed_on: null, published_at: null, updated_at: new Date().toISOString(), resource_type: "guide", ...r,
  });
  await context.route(`${MOCK}/rest/v1/rpc/flock_library_*`, async (route) => {
    const fn = new URL(route.request().url()).pathname.split("/").pop();
    const a = (route.request().postDataJSON() ?? {}) as Record<string, any>;
    const live = state.rows.map(full).filter((r) => r.status === "published");
    if (fn === "flock_library_search") {
      state.searches.push(a);
      const words = String(a.p_q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
      return json(route, live
        .filter((r) => !a.p_type || r.resource_type === a.p_type)
        .filter((r) => !a.p_topic || r.topics.includes(a.p_topic))
        .filter((r) => words.every((w) => [r.title, r.summary, r.body, ...r.species].join(" ").toLowerCase().includes(w)))
        .sort((x, y) => String(y.published_at).localeCompare(String(x.published_at)))
        .map((r) => ({ ...r, has_attachment: !!r.attachment_path })));
    }
    if (fn === "flock_library_resource") return json(route, live.filter((r) => r.id === a.p_id));
    return json(route, null);
  });
  await context.route(`${MOCK}/rest/v1/library_resources**`, async (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const url = new URL(req.url());
    const idEq = url.searchParams.get("id")?.replace(/^eq\./, "");
    if (req.method() === "GET") return json(route, state.rows.map(full).filter((r) => !idEq || r.id === idEq));
    const body = req.postDataJSON();
    state.writes.push({ method: req.method(), body, url: req.url() });
    if (req.method() === "POST") {
      const id = `00000000-0000-4000-8000-0000000091${String(state.rows.length + 1).padStart(2, "0")}`;
      state.rows.push(full({ ...body, id, published_at: body.status === "published" ? new Date().toISOString() : null }));
      return json(route, [{ id }], 201);
    }
    if (req.method() === "PATCH") {
      const r = state.rows.find((x) => x.id === idEq);
      if (r) Object.assign(r, body, { published_at: r.published_at ?? (body.status === "published" ? new Date().toISOString() : null) });
      return route.fulfill({ status: 204, headers: cors, body: "" });
    }
    if (req.method() === "DELETE") { state.rows = state.rows.filter((x) => x.id !== idEq); return route.fulfill({ status: 204, headers: cors, body: "" }); }
    return json(route, []);
  });
  await context.route(`${MOCK}/storage/v1/object/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (!path.includes("/flock-library")) return route.fallback();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (req.method() === "POST" && path.startsWith("/storage/v1/object/sign/flock-library")) {
      const body = req.postDataJSON() ?? {};
      return json(route, ((body.paths ?? []) as string[]).map((p) => ({ path: p, signedURL: `/object/sign/flock-library/${p}?token=t`, error: null })));
    }
    if (req.method() === "DELETE") { state.removed.push(...(((req.postDataJSON() ?? {}).prefixes ?? []) as string[])); return json(route, []); }
    if (req.method() === "POST" || req.method() === "PUT") {
      const key = path.replace("/storage/v1/object/flock-library/", "");
      state.uploads.push(key);
      return json(route, { Key: `flock-library/${key}`, Id: key });
    }
    // A signed file: a small JPEG for covers, a stub for PDFs.
    if (path.endsWith(".jpg")) return route.fulfill({ status: 200, contentType: "image/jpeg", body: readFileSync("public/brand/email/juno.jpg") });
    return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4\n%%EOF\n" });
  });
  return state;
}

const FORAGING = "00000000-0000-4000-8000-0000000090a1";
const HORMONES = "00000000-0000-4000-8000-0000000090a2";
const VIDEO = "00000000-0000-4000-8000-0000000090a3";
const DRAFT = "00000000-0000-4000-8000-0000000090a4";
const LIBRARY_ROWS = () => [
  { id: FORAGING, title: "Foraging for beginners", summary: "Start small with paper cups and work up.", resource_type: "guide", topics: ["foraging"], species: ["Sun conure", "Caique"],
    body: "# Why forage\nWild parrots spend **hours** finding food.\n\n## Start here\n- Wrap a treat in a paper cup\n- Hand it over\n\n> Stay close the first time.",
    cover_path: "covers/00000000-0000-4000-8000-00000000c0a1.jpg", attachment_path: "files/00000000-0000-4000-8000-00000000f0a1.pdf",
    status: "published", vet_reviewed: true, vet_reviewer: "Dr. Example, DVM", vet_reviewed_on: "2026-11-10", published_at: "2026-11-12T12:00:00Z" },
  { id: HORMONES, title: "Hormone season checklist", summary: "What to change in spring.", resource_type: "checklist", topics: ["hormones"], species: [],
    body: "- [ ] Shorten the day to 10–12 hours\n- [ ] Remove nest-like spaces", status: "published", published_at: "2026-11-14T12:00:00Z" },
  { id: VIDEO, title: "Target training in five minutes", summary: "A chopstick and a treat.", resource_type: "video", topics: ["training"], species: [],
    external_url: "https://example.com/target", status: "published", published_at: "2026-11-13T12:00:00Z" },
  { id: DRAFT, title: "Unfinished draft", summary: "", resource_type: "guide", topics: [], status: "draft" },
];

test.describe("the library (admin, phone)", () => {
  test("the list, the filters and search query real data; drafts never show", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    const lib = await mockLibrary(context, LIBRARY_ROWS());
    await page.goto("/flock/library");
    const results = page.getByTestId("library-results");
    // Newest first; the draft isn't there.
    await expect(results.locator("[data-resource]")).toHaveCount(3);
    await expect(results.locator("[data-resource]").first()).toContainText("Hormone season checklist");
    await expect(results).not.toContainText("Unfinished draft");
    await expect(results.locator(`[data-resource='${FORAGING}']`)).toContainText("Vet reviewed");
    await expect(results.locator(`[data-resource='${HORMONES}'] [data-testid='card-vet']`)).toHaveCount(0);
    await expect(page.getByTestId("manage-library")).toBeVisible();

    const type = page.getByRole("group", { name: "Type" }).getByRole("button");
    const subject = page.getByRole("group", { name: "Subject" }).getByRole("button");
    await type.filter({ hasText: "Videos" }).click();
    await expect(page).toHaveURL(/type=videos/);
    await expect(results.locator("[data-resource]")).toHaveCount(1);
    await expect(results).toContainText("Target training in five minutes");
    expect(lib.searches.at(-1)).toMatchObject({ p_type: "video", p_topic: null, p_q: null });
    await type.filter({ hasText: "All" }).click();
    await subject.filter({ hasText: "Foraging" }).click();
    await expect(results.locator("[data-resource]")).toHaveCount(1);
    expect(lib.searches.at(-1)).toMatchObject({ p_type: null, p_topic: "foraging" });
    await subject.filter({ hasText: "Foraging" }).click();
    await page.getByRole("searchbox", { name: "Search the library" }).fill("caique");
    await expect(page).toHaveURL(/q=caique/);
    await expect(results.locator("[data-resource]")).toHaveCount(1);
    await expect(results).toContainText("Foraging for beginners");
    expect(lib.searches.at(-1)).toMatchObject({ p_q: "caique" });
    await page.getByRole("searchbox", { name: "Search the library" }).fill("pellets");
    await expect(page.getByTestId("flock-empty")).toContainText("Nothing in the library matches that yet.");
    await context.close();
  });

  test("a resource: body, type, tags, the PDF, and the vet badge only when it's on", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await mockLibrary(context, LIBRARY_ROWS());
    await page.goto("/flock/library");
    await page.locator(`[data-resource='${FORAGING}']`).click();
    await expect(page).toHaveURL(new RegExp(`/flock/library/${FORAGING}$`));
    const view = page.getByTestId("resource-view");
    await expect(view.getByRole("heading", { level: 2, name: "Foraging for beginners" })).toBeVisible();
    await expect(page.getByTestId("resource-type")).toHaveText("Guide");
    await expect(page.getByTestId("vet-badge")).toContainText("Reviewed by an avian vet");
    await expect(page.getByTestId("vet-badge")).toContainText("Dr. Example, DVM");
    await expect(page.getByTestId("resource-tags")).toContainText("Foraging");
    await expect(page.getByTestId("resource-tags")).toContainText("Sun conure");
    await expect(page.getByTestId("resource-tags")).toContainText("Caique");
    const body = page.getByTestId("resource-body");
    await expect(body.getByRole("heading", { name: "Why forage" })).toBeVisible();
    await expect(body.locator("strong")).toHaveText("hours");
    await expect(body.locator("li")).toHaveText(["Wrap a treat in a paper cup", "Hand it over"]);
    await expect(page.getByTestId("resource-pdf")).toHaveAttribute("href", /flock-library\/files\/.+\.pdf\?token=t/);
    await expect(page.getByTestId("resource-cover")).toBeVisible();
    // The Library tab stays current.
    await expect(page.locator("[data-flock-tab='library']").first()).toHaveAttribute("aria-current", "page");

    // A checklist ticks, and no vet badge when the flag is off.
    await page.goto(`/flock/library/${HORMONES}`);
    await expect(page.getByTestId("resource-type")).toHaveText("Checklist");
    await expect(page.getByTestId("vet-badge")).toHaveCount(0);
    const box = page.getByTestId("checklist").getByRole("checkbox").first();
    await box.check();
    await expect(box).toBeChecked();
    await page.reload();
    await expect(page.getByTestId("checklist").getByRole("checkbox").first()).toBeChecked();

    // A video opens its link; a draft or unknown id reads as not found.
    await page.goto(`/flock/library/${VIDEO}`);
    await expect(page.getByTestId("resource-link")).toHaveAttribute("href", "https://example.com/target");
    await expect(page.getByTestId("resource-link")).toHaveText("Watch the video");
    await page.goto(`/flock/library/${DRAFT}`);
    await expect(page.getByTestId("flock-empty")).toContainText("This isn't in the library");
    await context.close();
  });

  test("admin: write a resource, preview it, publish, edit it live, unpublish, delete", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    const lib = await mockLibrary(context, []);
    await page.goto("/flock/library");
    await expect(page.getByTestId("flock-empty")).toContainText("The shelves are filling");
    await page.getByTestId("manage-library").click();
    await expect(page).toHaveURL(/\/admin\/library$/);
    await expect(page.getByTestId("admin-library-empty")).toBeVisible();
    await page.getByTestId("new-resource").click();
    await expect(page).toHaveURL(/\/admin\/library\/new$/);
    await expect(page.getByTestId("editor-status")).toHaveText("Draft");

    await page.getByTestId("resource-title").fill("Foraging for beginners");
    await page.locator("[data-choice='type-checklist']").click();
    // Not publishable yet: it says what's missing.
    await expect(page.getByTestId("publish-needs")).toContainText("a short summary, at least one topic");
    await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
    await page.getByTestId("resource-summary").fill("Start small with paper cups.");
    await page.getByTestId("resource-body-input").fill("# Start here\n- [ ] Wrap a treat in a paper cup\n- [ ] Hand it over");
    await page.locator("[data-choice='topic-foraging']").click();
    await page.getByTestId("resource-species").fill("Sun conure, caique, Sun Conure");
    await page.getByRole("switch", { name: "Reviewed by an avian vet" }).click();
    await page.getByTestId("resource-reviewer").fill("Dr. Example, DVM");

    // A cover photo and a PDF go to the private bucket.
    await page.getByTestId("cover-input").setInputFiles("public/brand/email/juno.jpg");
    await expect(page.getByText("Cover photo added")).toBeVisible();
    await page.getByTestId("pdf-input").setInputFiles({ name: "foraging.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
    await expect(page.getByText("PDF attached")).toBeVisible();
    expect(lib.uploads).toHaveLength(2);
    expect(lib.uploads[0]).toMatch(/^covers\/[0-9a-f-]{36}\.jpg$/);
    expect(lib.uploads[1]).toMatch(/^files\/[0-9a-f-]{36}\.pdf$/);
    // Not a PDF: a kind message, nothing uploaded.
    await page.getByTestId("pdf-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await expect(page.getByTestId("editor-error")).toHaveText("That isn't a PDF. Choose a .pdf file.");
    expect(lib.uploads).toHaveLength(2);

    // Preview: exactly the member view, unsaved changes included.
    await page.getByRole("tab", { name: "Preview" }).click();
    const preview = page.getByTestId("resource-preview");
    await expect(preview.getByRole("heading", { level: 2, name: "Foraging for beginners" })).toBeVisible();
    await expect(preview.getByTestId("resource-type")).toHaveText("Checklist");
    await expect(preview.getByTestId("vet-badge")).toContainText("Dr. Example, DVM");
    await expect(preview.getByTestId("resource-tags")).toHaveText(/Foraging\s*Sun conure\s*caique/);
    await expect(preview.getByTestId("checklist").getByRole("checkbox")).toHaveCount(2);
    await page.getByRole("tab", { name: "Edit" }).click();

    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByTestId("editor-notice")).toHaveText("Published. Members can find it in the Library.");
    await expect(page).toHaveURL(/\/admin\/library\/00000000-0000-4000-8000-000000009101$/);
    await expect(page.getByTestId("editor-status")).toHaveText("Published");
    const created = lib.writes.find((w) => w.method === "POST")!.body;
    expect(created).toMatchObject({
      title: "Foraging for beginners", resource_type: "checklist", status: "published", topics: ["foraging"], species: ["Sun conure", "caique"],
      vet_reviewed: true, vet_reviewer: "Dr. Example, DVM",
    });
    expect(created.cover_path).toBe(lib.uploads[0]);
    expect(created.attachment_path).toBe(lib.uploads[1]);

    // Edit it live, then unpublish.
    await page.getByTestId("resource-summary").fill("Start small with paper cups, then boxes.");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByTestId("editor-notice")).toHaveText("Saved. Members see the new version.");
    await page.getByRole("button", { name: "Unpublish" }).click();
    await expect(page.getByTestId("editor-notice")).toHaveText("Unpublished. It's a draft again, hidden from members.");
    await expect(page.getByTestId("editor-status")).toHaveText("Draft");
    expect(lib.writes.filter((w) => w.method === "PATCH").map((w) => w.body.status)).toEqual(["published", "draft"]);

    // The list shows it as a draft; members' list is empty again.
    await page.goto("/admin/library");
    await expect(page.getByTestId("admin-library-list").locator("[data-status='draft']")).toContainText("Foraging for beginners");
    await page.goto("/flock/library");
    await expect(page.getByTestId("flock-empty")).toContainText("The shelves are filling");

    // Delete takes its files with it.
    await page.goto("/admin/library/00000000-0000-4000-8000-000000009101");
    await page.getByTestId("delete-resource").click();
    await page.getByTestId("delete-confirm").click();
    await expect(page).toHaveURL(/\/admin\/library$/);
    await expect(page.getByTestId("admin-library-empty")).toBeVisible();
    expect(lib.writes.at(-1)!.method).toBe("DELETE");
    await expect.poll(() => lib.removed.sort()).toEqual([...lib.uploads].sort());
    await context.close();
  });

  test("a video or link can't be published without its web link", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    const lib = await mockLibrary(context, []);
    await page.goto("/admin/library/new");
    await page.getByTestId("resource-title").fill("Target training");
    await page.locator("[data-choice='type-video']").click();
    await page.getByTestId("resource-summary").fill("Five minutes a day.");
    await page.locator("[data-choice='topic-training']").click();
    await expect(page.getByTestId("publish-needs")).toContainText("the web link");
    await expect(page.getByRole("button", { name: "Publish" })).toBeDisabled();
    // A draft saves without it.
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByTestId("editor-notice")).toHaveText("Draft saved. Only admins can see it.");
    await page.getByTestId("resource-url").fill("youtube.com/watch?v=abc");
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByTestId("editor-notice")).toHaveText("Published. Members can find it in the Library.");
    expect(lib.writes.at(-1)!.body).toMatchObject({ status: "published", external_url: "https://youtube.com/watch?v=abc" });
    await context.close();
  });
});

test.describe("joining the Flock (members switch on, phone)", () => {
  const NOT_JOINED = { member_now: false, has_membership: false, agreed: false, is_admin: false, guidelines_version: "2026-12", opens_at: null, season_ends_at: "2027-07-06T04:00:00Z" };

  test("a free account: Community opens the Part of the Flock sheet, then chapter, guidelines, 18+ and agree; Join calls flock_agree then flock_join", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: false, membersOpen: true, setupDone: false });
    state.access = { ...NOT_JOINED };
    await page.goto("/dashboard");
    const community = page.locator('[data-coach="owner-tab-flock"]').first();
    await expect(community).toBeVisible();
    await community.click();
    await expect(page).toHaveURL(/\/flock\/join/);
    const sheet = page.getByTestId("join-flock-sheet");
    await expect(sheet).toBeVisible();
    await expect(page.getByText("Part of the Flock", { exact: true })).toBeVisible();
    // No prices anywhere on the join step.
    expect(await page.locator("body").innerText()).not.toMatch(/\$\s?\d/);
    await sheet.getByRole("button", { name: "Join the Flock free" }).click();
    await expect(sheet).toHaveCount(0);

    // The guidelines, word for word, with the contact line at the bottom.
    const g = page.getByTestId("flock-guidelines");
    await expect(g.getByRole("heading", { name: "Welcome to the Flock" })).toBeVisible();
    await expect(g.locator("li")).toHaveCount(6);
    await expect(g).toContainText("The Flock isn't your vet. Members share experience, not medical advice.");
    await expect(g).toContainText("If something feels wrong, you can report or block anyone, and the Kya team reviews every report.");
    await expect(g.getByTestId("flock-contact-line")).toContainText("Questions or a problem? Email the Kya team at brittany@thekyaproject.com.");
    await expect(g.getByRole("link", { name: "brittany@thekyaproject.com" })).toHaveAttribute("href", "mailto:brittany@thekyaproject.com");

    const submit = page.getByTestId("join-submit");
    await expect(submit).toBeDisabled();
    await page.getByRole("button", { name: "Choose" }).click();
    await page.getByRole("dialog").getByText("Texas").click();
    await expect(page.getByTestId("join-region")).toContainText("Texas");
    await expect(submit).toBeDisabled();
    await page.getByTestId("join-agree").check();
    await expect(submit).toBeDisabled(); // 18+ still unchecked
    await page.getByTestId("join-adult").check();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page).toHaveURL(/\/flock\/welcome/);
    const agree = state.calls.find((c) => c.fn === "flock_agree")!;
    expect(agree.args).toMatchObject({ p_region: "texas", p_adult: true, p_guidelines_version: "2026-12", p_source: "care_app" });
    expect(state.calls.map((c) => c.fn)).toEqual(["flock_agree", "flock_join"]);
    await context.close();
  });

  test("a non-member opening any Flock page goes to the join step; ?source= is passed on", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: false, membersOpen: true, setupDone: false });
    state.access = { ...NOT_JOINED };
    await page.goto("/flock/library");
    await expect(page).toHaveURL(/\/flock\/join/);
    await page.goto("/flock/join?source=email");
    await page.getByTestId("join-flock-sheet").getByRole("button", { name: "Join the Flock free" }).click();
    await page.getByRole("button", { name: "Choose" }).click();
    await page.getByRole("dialog").getByText("Great Lakes").click();
    await page.getByTestId("join-adult").check();
    await page.getByTestId("join-agree").check();
    await page.getByTestId("join-submit").click();
    await expect(page).toHaveURL(/\/flock\/welcome/);
    expect(state.calls.find((c) => c.fn === "flock_agree")!.args.p_source).toBe("email");
    await context.close();
  });

  test("a founder who hasn't agreed: the same guidelines and 18+ step, no intro sheet, no second membership", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: false, membersOpen: true, setupDone: true });
    state.access = { ...NOT_JOINED, member_now: true, has_membership: true };
    state.joinResult = "founder";
    await page.goto("/flock?source=founding");
    await expect(page).toHaveURL(/\/flock\/join/);
    await expect(page.getByTestId("join-flock-sheet")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Before you go in" })).toBeVisible();
    await page.getByRole("button", { name: "Choose" }).click();
    await page.getByRole("dialog").getByText("Great Lakes").click();
    await page.getByTestId("join-adult").check();
    await page.getByTestId("join-agree").check();
    await page.getByTestId("join-submit").click();
    await expect(page).toHaveURL(/\/flock$/);
    expect(state.calls.find((c) => c.fn === "flock_agree")!.args.p_source).toBe("founding");
    await context.close();
  });

  test("joining before opening day: You're in, with the date it opens", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: false, membersOpen: true, setupDone: false });
    state.access = { ...NOT_JOINED, opens_at: "2027-01-05T06:00:00Z" };
    await page.goto("/flock/join?source=gift");
    await page.getByTestId("join-flock-sheet").getByRole("button", { name: "Join the Flock free" }).click();
    await page.getByRole("button", { name: "Choose" }).click();
    await page.getByRole("dialog").getByText("Texas").click();
    await page.getByTestId("join-adult").check();
    await page.getByTestId("join-agree").check();
    await page.getByTestId("join-submit").click();
    await expect(page.getByTestId("flock-join-waiting")).toContainText("The Flock opens on January 5, 2027.");
    await page.goto("/flock");
    await expect(page.getByTestId("flock-join-waiting")).toBeVisible();
    await context.close();
  });

  test("members find the guidelines and the contact line again in Flock settings", async ({ browser, baseURL }) => {
    const { context, page } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/you");
    await expect(page.getByTestId("flock-contact-line")).toContainText("Email the Kya team at brittany@thekyaproject.com.");
    await page.getByText("Community guidelines", { exact: true }).click();
    await expect(page).toHaveURL(/\/flock\/guidelines$/);
    await expect(page.getByTestId("flock-guidelines")).toContainText("No selling or spam. Please don't advertise products, services, or birds for sale.");
    await expect(page.getByTestId("flock-guidelines").getByTestId("flock-contact-line")).toBeVisible();
    await context.close();
  });
});

test.describe("buddy pods (admin, phone)", () => {
  const POD = "00000000-0000-4000-8000-0000000090a1";
  const JOURNEY = "00000000-0000-4000-8000-0000000074a1";
  const STARTED = "00000000-0000-4000-8000-000000007201";
  const pod = (over: Record<string, unknown> = {}) => ({
    pod_id: POD, kind: "journey", status: "active", template_slug: "step-up", template_name: "Step up", region_name: "Great Lakes",
    member_count: 4, my_journey_id: JOURNEY, my_finished: false, checked_in_this_week: false,
    offered_new: false, created_at: new Date().toISOString(), ...over,
  });
  const members = [
    { user_id: "00000000-0000-4000-8000-00000000c009", display_name: "Brittany K.", photo_path: null, is_me: true, bird_id: null, bird_name: "Echo", bird_has_photo: false, stage: "working" },
    { user_id: "00000000-0000-4000-8000-00000000c001", display_name: "Ana", photo_path: null, is_me: false, bird_id: null, bird_name: "Kiwi", bird_has_photo: false, stage: "happy" },
    // A "Just me" journey: the database sends no stage and no hidden bird.
    { user_id: "00000000-0000-4000-8000-00000000c002", display_name: "Marcus", photo_path: null, is_me: false, bird_id: null, bird_name: null, bird_has_photo: false, stage: null },
    { user_id: "00000000-0000-4000-8000-00000000c003", display_name: "Jen", photo_path: null, is_me: false, bird_id: null, bird_name: "Biscuit", bird_has_photo: false, stage: "learned" },
  ];

  test("starting a journey: Pair me with buddies, and the journey goes on the waitlist", async ({ browser, baseURL }) => {
    const { context, page, state, journeys } = await open(browser, baseURL!, { admin: true });
    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Echo" }).click();
    await page.getByTestId("template-list").locator("[data-template='step-up']").click();
    const setup = page.getByTestId("journey-setup");
    const optIn = setup.getByTestId("pod-opt-in");
    await expect(optIn).toContainText("Pair me with buddies working on this too");
    await expect(optIn).toContainText("A small group of 3 to 6 members on the same skill, from your chapter when possible. You can leave anytime.");
    await expect(optIn).toHaveAttribute("aria-checked", "false");
    await optIn.click();
    await expect(optIn).toHaveAttribute("aria-checked", "true");
    // Just me: a line about what buddies see.
    await setup.getByTestId("visibility").getByRole("radio", { name: "Just me" }).click();
    await expect(setup.getByTestId("pod-just-me")).toContainText("Your buddies see your name and that you're on this skill, but not where you are on it.");
    await page.getByRole("button", { name: "Start Echo's journey" }).click();
    await expect(page).toHaveURL(new RegExp(`/flock/journeys/${STARTED}$`));
    expect(journeys.starts).toHaveLength(1);
    expect(state.calls.filter((c) => c.fn === "flock_pod_wait").map((c) => c.args)).toEqual([{ p_journey_id: STARTED }]);
    // The journey page shows the waiting card (SpecPods screen 2).
    const waiting = page.getByTestId("pod-waiting");
    await expect(waiting).toContainText("We're finding your buddies");
    await expect(waiting).toContainText("Your pod starts when 3 members are ready. 1 so far.");
    await waiting.getByTestId("pod-leave-waitlist").click();
    await expect(page.getByTestId("pod-waiting")).toHaveCount(0);
    expect(state.calls.some((c) => c.fn === "flock_pod_unwait" && c.args.p_journey_id === STARTED)).toBe(true);
    // A pod that went quiet: offer new buddies, and a way back to read the old one.
    state.pods.journey[STARTED] = { state: "offer", pod_id: POD, waiting: 0, can_wait: true };
    state.pods.pod = pod({ status: "dissolved" });
    await page.reload();
    const offer = page.getByTestId("pod-offer");
    await expect(offer).toContainText("Your buddy pod has closed");
    await expect(offer.getByRole("button", { name: "Find new buddies" })).toBeVisible();
    await offer.getByTestId("pod-read-old").click();
    await expect(page).toHaveURL(new RegExp(`/flock/pods/${POD}$`));
    await expect(page.getByTestId("pod-ended")).toContainText("This pod has closed because it got quiet.");
    await context.close();
  });

  test("not ticked, nothing is sent; at two pods the box can't be ticked", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.pods.canWait = false;
    await page.goto("/flock/journeys/start");
    await page.getByTestId("pick-bird").locator("[data-bird]", { hasText: "Echo" }).click();
    await page.getByTestId("template-list").locator("[data-template='step-up']").click();
    const optIn = page.getByTestId("pod-opt-in");
    await expect(optIn).toBeDisabled();
    await expect(optIn).toContainText("You're in two buddy pods already, the most at once.");
    await page.getByRole("button", { name: "Start Echo's journey" }).click();
    await expect(page).toHaveURL(new RegExp(`/flock/journeys/${STARTED}$`));
    expect(state.calls.filter((c) => c.fn === "flock_pod_wait")).toHaveLength(0);
    await context.close();
  });

  test("the pod page: members with their stage (none from Just me), the weekly check-in, the pod's feed and Leave pod", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.pods.pod = pod();
    state.pods.members = members;
    state.pods.feed = [{ post_id: "00000000-0000-4000-8000-0000000091a1", author_id: "00000000-0000-4000-8000-00000000c001", author_name: "Ana", space: "pod",
      body: "Kiwi follows the stick across the perch now. Short sessions really are the trick.", status: "live", created_at: new Date(Date.now() - 86_400_000).toISOString() }];
    await page.goto(`/flock/pods/${POD}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Step up pod");
    await expect(page.getByText("4 members · Great Lakes")).toBeVisible();
    const list = page.getByTestId("pod-members");
    await expect(list.locator("[data-member]")).toHaveCount(4);
    await expect(list.locator("[data-member]").first()).toContainText("You · Echo");
    // One pill each, no progress bar (journeys have no milestones since 1.20a).
    await expect(page.getByRole("progressbar")).toHaveCount(0);
    await expect(list.getByTestId("pod-stage")).toHaveCount(3);
    await expect(list.locator("[data-member]").first().getByTestId("pod-stage")).toHaveText("Working on it");
    await expect(list.locator("[data-member='00000000-0000-4000-8000-00000000c001']").getByTestId("pod-stage")).toHaveText("Happy where we are");
    await expect(list.locator("[data-member='00000000-0000-4000-8000-00000000c003']").getByTestId("pod-stage")).toHaveText("Learned it");
    await expect(list.locator("[data-member='00000000-0000-4000-8000-00000000c003']").getByTestId("pod-stage")).toHaveCSS("color", "rgb(255, 255, 255)");
    const hidden = list.locator("[data-member='00000000-0000-4000-8000-00000000c002']");
    await expect(hidden.getByTestId("stage-private")).toHaveText("Journey kept private");
    await expect(hidden.getByTestId("pod-stage")).toHaveCount(0);
    await expect(page.getByTestId("pod-feed")).toContainText("Kiwi follows the stick across the perch now.");
    await expect(page.getByTestId("pod-feed")).toContainText("Buddy pod");
    const weekly = page.getByTestId("pod-weekly");
    await expect(weekly).toContainText("This week");
    await expect(weekly).toContainText("How did step up go?");
    await weekly.getByTestId("pod-check-in").click();
    await expect(page).toHaveURL(new RegExp(`/flock/pods/${POD}/post$`));
    await expect(page.getByTestId("pod-prompt")).toHaveText("How did step up go?");
    // Posts only to the pod: no "Post to" choice.
    await expect(page.getByTestId("post-to")).toHaveCount(0);
    await page.getByTestId("post-body-input").fill("Echo stepped up from the floor twice today.");
    await page.getByTestId("composer-post").click();
    await expect(page).toHaveURL(new RegExp(`/flock/pods/${POD}$`));
    expect(state.calls.find((c) => c.fn === "flock_pod_post_create")!.args).toMatchObject({ p_pod_id: POD, p_body: "Echo stepped up from the floor twice today.", p_photo_paths: [] });
    await expect(page.getByTestId("pod-feed")).toContainText("Echo stepped up from the floor twice today.");
    await expect(page.getByTestId("pod-weekly")).toHaveCount(0);
    await page.getByTestId("pod-leave").click();
    await expect(page.getByText("The others won't be told. They'll just see one fewer member.", { exact: false })).toBeVisible();
    await page.getByTestId("pod-leave-confirm").click();
    await expect(page).toHaveURL(/\/flock\/pods$/);
    expect(state.calls.some((c) => c.fn === "flock_pod_leave" && c.args.p_pod_id === POD)).toBe(true);
    await context.close();
  });

  test("You finished! (either ending), and a closed pod stays readable with no Keep going card", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.pods.pod = pod({ my_finished: true });
    state.pods.members = members;
    await page.goto(`/flock/pods/${POD}`);
    const done = page.getByTestId("pod-finished");
    await expect(done).toContainText("You finished!");
    await expect(done).toContainText("Stay in the pod to cheer the others on, or leave whenever you like.");
    await expect(page.getByTestId("pod-keep-going")).toHaveCount(0);
    await done.getByRole("button", { name: "Stay and cheer" }).click();
    await expect(page.getByTestId("pod-finished")).toHaveCount(0);
    expect(state.calls.some((c) => c.fn === "flock_pod_finished_seen")).toBe(true);

    // Everyone has finished or left: the pod is closed, readable, and asks nothing.
    state.pods.pod = pod({ status: "closed" });
    await page.reload();
    await expect(page.getByTestId("pod-ended")).toContainText("This pod has closed. You can still read what everyone shared.");
    await expect(page.getByTestId("pod-members")).toBeVisible();
    await expect(page.getByTestId("pod-keep-going")).toHaveCount(0);
    await expect(page.getByTestId("pod-weekly")).toHaveCount(0);
    await expect(page.getByTestId("pod-post")).toHaveCount(0);
    await expect(page.getByText("Keep going together?")).toHaveCount(0);
    expect(state.calls.some((c) => c.fn === "flock_pod_keep_going")).toBe(false);
    await context.close();
  });

  test("Flock settings → Buddy pods lists your pods; admins manage them (move, dissolve)", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    const OTHER = "00000000-0000-4000-8000-0000000090a2";
    const now = new Date().toISOString();
    state.pods.mine = [
      { pod_id: null, journey_id: JOURNEY, kind: "waiting", status: "waiting", template_slug: "recall", template_name: "Recall", region_name: null, member_count: 0, created_at: now },
      { pod_id: POD, journey_id: JOURNEY, kind: "journey", status: "active", template_slug: "step-up", template_name: "Step up", region_name: "Great Lakes", member_count: 4, created_at: now },
    ];
    state.pods.admin = [
      { pod_id: POD, kind: "journey", status: "active", template_slug: "step-up", template_name: "Step up", region_name: "Great Lakes", member_count: 4, last_post_at: null, created_at: now, ended_at: null },
      { pod_id: OTHER, kind: "journey", status: "active", template_slug: "step-up", template_name: "Step up", region_name: null, member_count: 3, last_post_at: null, created_at: now, ended_at: null },
    ];
    state.pods.adminMembers = [{ user_id: "00000000-0000-4000-8000-00000000c001", display_name: "Ana", region_name: "Great Lakes", journey_status: "active", joined_at: now, left_at: null }];
    await page.goto("/flock/you");
    await page.getByText("Buddy pods", { exact: true }).click();
    await expect(page).toHaveURL(/\/flock\/pods$/);
    const mine = page.getByTestId("my-pods");
    await expect(mine.locator("[data-pod-state]")).toHaveCount(2);
    await expect(mine.locator("[data-pod-state='waiting']")).toContainText("Recall pod");
    await expect(mine.locator("[data-pod-state='waiting']")).toContainText("We're finding your buddies");
    await expect(mine.locator("[data-pod-state='active']")).toContainText("4 members · Great Lakes");
    await page.getByTestId("manage-pods").click();
    await expect(page).toHaveURL(/\/admin\/pods$/);
    await expect(page.getByTestId("admin-pod-waits")).toContainText("Step up: 2 waiting");
    const row = page.locator(`[data-pod='${POD}']`);
    await row.getByRole("button", { name: /Step up pod/ }).click();
    await row.getByTestId("admin-pod-move").click();
    await row.locator(`[data-target='${OTHER}']`).click();
    await expect.poll(() => state.calls.find((c) => c.fn === "admin_pod_move")?.args).toEqual({ p_user_id: "00000000-0000-4000-8000-00000000c001", p_from: POD, p_to: OTHER });
    await row.getByTestId("admin-pod-dissolve").click();
    await page.getByTestId("confirm-delete").click();
    await expect.poll(() => state.calls.find((c) => c.fn === "admin_pod_dissolve")?.args).toEqual({ p_pod_id: POD });
    await context.close();
  });
});

test.describe("challenges (admin, phone)", () => {
  const FORAGING = "00000000-0000-4000-8000-0000000097a1";
  const challenge = (over: Record<string, any> = {}) => ({
    challenge_id: FORAGING, kind: "standalone", title: "Foraging week: a new idea every day", description: "A new foraging idea every day for a week.",
    template_slug: null, template_name: null, region_slug: null, region_name: null, state: "open", starts_on: "2026-12-01", ends_on: "2026-12-07", days_left: 4,
    prompts: [
      { position: 1, body: "Paper cup surprise", done: false },
      { position: 2, body: "Shred a cardboard tube", done: false },
      { position: 3, body: "Hide a treat in a basket", done: false },
    ],
    member_count: 63, faces: [{ name: "Ada L.", photo_path: null }, { name: "Cy T.", photo_path: null }],
    joined: false, my_bird_id: null, my_bird_name: null, feature_ok: false, my_journey_id: null,
    done_count: 0, total_count: 3, finished: false, wrap_up: null, pinned_post_id: null, featured_post_ids: [], ...over,
  });

  test("the card on Today and Journeys, joining with a bird, an entry for each prompt, and the celebration", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.challenges = [challenge()];
    await page.goto("/flock");
    const card = page.getByTestId("challenge-card");
    await expect(card).toHaveCount(1);
    await expect(card).toContainText("Challenge · 4 days left");
    await expect(card.getByTestId("challenge-summary")).toHaveText("Standalone challenge · 3 prompts · 63 members joined");
    await expect(card.getByTestId("challenge-open")).toHaveText("Join the challenge");
    // Only on Everything.
    await page.goto("/flock?space=learn");
    await expect(page.getByTestId("challenge-card")).toHaveCount(0);
    await page.goto("/flock/journeys");
    await expect(page.getByTestId("challenge-card")).toHaveCount(1);
    await expect(page.getByTestId("manage-challenges")).toBeVisible();

    // Join: pick a bird; featuring is off unless the member says yes.
    await page.getByTestId("challenge-open").click();
    await expect(page).toHaveURL(new RegExp(`/flock/challenges/${FORAGING}`));
    await expect(page.getByTestId("challenge-no-entries")).toHaveText("No entries yet. Yours could be the first.");
    const join = page.getByTestId("challenge-join");
    await expect(join.getByTestId("challenge-join-button")).toBeDisabled();
    await join.locator("[data-bird]").first().click();
    await expect(join.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    await join.getByTestId("challenge-join-button").click();
    await expect(page.getByTestId("challenge-progress")).toBeVisible();
    expect(state.calls.find((c) => c.fn === "flock_challenge_join")?.args).toMatchObject({ p_id: FORAGING, p_feature_ok: false });

    // Progress: the checklist with the next prompt, and "Post today's entry".
    const progress = page.getByTestId("challenge-progress");
    await expect(progress.locator("[data-prompt='1']")).toHaveAttribute("data-done", "no");
    await expect(progress).toContainText("2 more after this");
    for (const [n, text] of [[1, "Took her ten seconds."], [2, "Shredded in a minute."], [3, "Found it in the basket."]] as const) {
      await page.getByTestId("challenge-post").click();
      await expect(page).toHaveURL(new RegExp(`/flock/challenges/${FORAGING}/entry\\?prompt=${n}`));
      await expect(page.getByTestId("entry-for")).toContainText(`${n}. `);
      await expect(page.getByTestId("post-to")).toHaveCount(0);
      await expect(page.getByTestId("post-title")).toHaveCount(0);
      await page.getByTestId("post-body-input").fill(text);
      await page.getByTestId("composer-post").click();
      await expect(page).toHaveURL(new RegExp(`/flock/challenges/${FORAGING}`));
      await expect(page.getByTestId("challenge-entries")).toContainText(text);
    }
    expect(state.calls.filter((c) => c.fn === "flock_challenge_entry_create").map((c) => c.args.p_prompt)).toEqual([1, 2, 3]);
    // The last prompt: the celebration, and no more posting.
    await expect(page.getByTestId("challenge-finished")).toContainText("You finished!");
    await expect(page.getByTestId("challenge-finished")).toContainText("Challenge champ");
    await expect(page.getByTestId("challenge-post")).toHaveCount(0);
    await expect(page.getByTestId("challenge-page").getByText(/winner|prize|rank/i)).toHaveCount(0);
    await context.close();
  });

  test("a closed challenge: the feed stays readable, the wrap-up shows, and nobody can join", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    state.challenges = [challenge({ state: "closed", days_left: -3, wrap_up: "What a week. Thank you, everyone." })];
    state.challengeEntries = [{ post_id: "00000000-0000-4000-8000-0000000098f1", challenge_id: FORAGING, author_id: "00000000-0000-4000-8000-00000000c001",
      author_name: "Ada L.", author_region: "Great Lakes", author_photo_path: null, author_is_founder: false, space: "challenge", region_slug: null, region_name: null,
      title: null, body: "Mango loved the basket.", photo_count: 0, bird_id: null, bird_name: null, bird_has_photo: false, status: "live", review_note: null,
      created_at: new Date().toISOString(), edited_at: null, is_mine: false, comment_count: 0, great_job: 0, been_there: 0, rooting_for_you: 0, love_this: 0, mine: [], prompt: 3 }];
    await page.goto("/flock");
    await expect(page.getByTestId("today-chips")).toBeVisible();
    await expect(page.getByTestId("challenge-card")).toHaveCount(0);
    await page.goto(`/flock/challenges/${FORAGING}`);
    await expect(page.getByTestId("challenge-closed")).toHaveText("This challenge has closed. Its entries stay here to read.");
    await expect(page.getByTestId("challenge-wrap-up")).toContainText("What a week. Thank you, everyone.");
    await expect(page.getByTestId("challenge-join")).toHaveCount(0);
    await expect(page.getByTestId("challenge-entries")).toContainText("Mango loved the basket.");
    await expect(page.getByTestId("entry-prompt")).toHaveText("3. Hide a treat in a basket");
    await context.close();
  });

  test("admin: Journey or Standalone first, prompts one per line, and no food journeys", async ({ browser, baseURL }) => {
    const { context, page, state } = await open(browser, baseURL!, { admin: true });
    await page.goto("/admin/challenges");
    await expect(page.getByTestId("admin-challenges-empty")).toBeVisible();
    await page.getByTestId("new-challenge").click();
    const form = page.getByTestId("challenge-form");
    await expect(form.locator("[data-choice='kind-standalone']")).toHaveAttribute("aria-checked", "true");
    // Journey: the templates, never diet conversion.
    await form.locator("[data-choice='kind-journey']").click();
    await expect(form.getByTestId("challenge-templates").locator("[data-choice='step-up']")).toBeVisible();
    await expect(form.getByTestId("challenge-templates").locator("[data-choice='diet-conversion']")).toHaveCount(0);
    await form.locator("[data-choice='kind-standalone']").click();
    // Scheduling without the basics says what's missing.
    await page.getByRole("button", { name: "Schedule challenge" }).click();
    await expect(page.getByTestId("challenge-error")).toContainText("a title");
    await form.getByTestId("challenge-title").fill("Foraging week: a new idea every day");
    await form.getByTestId("challenge-prompts-input").fill("Paper cup surprise\n\nShred a cardboard tube\n");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    await form.getByTestId("challenge-starts").fill(today);
    await form.getByTestId("challenge-ends").fill(today);
    await page.getByRole("button", { name: "Schedule challenge" }).click();
    await expect(page).toHaveURL(/\/admin\/challenges$/);
    expect(state.calls.find((c) => c.fn === "admin_challenge_save")?.args).toMatchObject({
      p_id: null, p_kind: "standalone", p_title: "Foraging week: a new idea every day", p_prompts: ["Paper cup surprise", "Shred a cardboard tube"],
      p_template_slug: null, p_region_slug: null, p_starts_on: today, p_ends_on: today,
    });
    expect(state.calls.find((c) => c.fn === "admin_challenge_schedule")?.args).toEqual({ p_id: "00000000-0000-4000-8000-0000000097aa" });
    await context.close();
  });
});
