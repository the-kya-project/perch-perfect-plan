// Flock stickiness events (payments plan, build E): whether members come back
// and what they do. FLOCK CODE ONLY. Import this from Flock routes, Flock
// components and the Flock data modules, never from the care app or shared
// chrome; scripts/flock-analytics.test.ts fails the build if anything else
// imports it.
//
// The rules:
//  - An event goes out only for someone who can use the Flock: a member
//    (`is_flock_member()`, which counts an entitlement once it has started) or
//    an admin. Anyone else, and anyone whose status can't be read, sends
//    nothing. Signed-out visitors send nothing.
//  - Events describe behavior, never content. Each one carries the member's
//    chapter (region slug), how they're a member (founder, gift holder, free
//    season, chapter lead, paid, comp) and the kind of thing they did. Never
//    post or comment text, titles, photos, bird names or ids, display names, or
//    anything else a member wrote. FLOCK_EVENT_PROPS below is the complete list
//    of keys each event may carry; anything else is dropped before sending.
//  - Admin and test accounts carry `internal: true` (and the person property
//    `flock_internal`) so dashboards can filter them out. Today only admins can
//    open the Flock, so every event before opening day is internal.
//  - Analytics itself stays off in previews and dev (src/lib/analytics.ts);
//    this adds no new script and no new network call beyond the status reads
//    below, which only run once a Flock screen is open.

import { supabase } from "@/integrations/supabase/client";
import { setPersonProperties, track, type AnalyticsEventName } from "./analytics";
import { nativePlatform } from "./nativeApp";

// ---- Events ----------------------------------------------------------------

/** Every Flock event, and the only properties each may carry (besides the
 *  member context every event gets). */
export const FLOCK_EVENT_PROPS = {
  /** Once per member per Flock day (Eastern), on the first Flock screen. */
  flock_active: [],
  /** The join step succeeded. Defined now; build C calls it from the join screen. */
  flock_joined: ["source"],
  flock_post_created: ["space", "status", "has_photo", "photo_count", "has_bird"],
  flock_comment_created: ["subject_type", "is_reply", "has_photo"],
  /** Only when a reaction is added, not when one is taken back. */
  flock_reaction_added: ["subject_type", "kind"],
  flock_library_resource_opened: ["resource_id", "resource_type", "vet_reviewed"],
  flock_journey_started: ["template", "is_custom", "visibility", "milestone_count", "already_count"],
  flock_journey_milestone_reached: ["position", "done", "total"],
  flock_journey_finished: ["total"],
  flock_idea_tried: ["outcome", "has_photo", "has_bird"],
  flock_event_rsvped: ["answer"],
} as const satisfies Record<string, readonly string[]>;

export type FlockEventName = keyof typeof FLOCK_EVENT_PROPS & AnalyticsEventName;
type Value = string | number | boolean | null | undefined;
export type FlockEventProps = Record<string, Value>;

// ---- Who's sending ---------------------------------------------------------

export type Membership = "founding" | "gift" | "free_season" | "chapter_lead" | "paid" | "comp" | "admin";

/** The member context every event carries. */
export type FlockContext = {
  chapter: string;
  membership: Membership;
  founder: boolean;
  gift_holder: boolean;
  free_season: boolean;
  chapter_lead: boolean;
  is_admin: boolean;
  internal: boolean;
};

export type ContextInputs = {
  isAdmin: boolean;
  isMember: boolean;
  email: string | null;
  regionSlug: string | null;
  entitlements: { plan: string; source: string; status: string; starts_at: string | null }[];
  now?: Date;
  /** flock_joined only: someone who joined before opening day has a
   *  membership that hasn't started yet, and still counts for that event. */
  allowPending?: boolean;
};

/** Test accounts: staging's made-up addresses, reserved test domains, and
 *  "+test" addresses. Read from the session; only the yes/no ever leaves the
 *  browser. */
export function isTestEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  const [local = "", domain = ""] = e.split("@");
  if (/\+(test|qa|e2e)/.test(local)) return true;
  if (["example.com", "example.org", "example.net"].includes(domain)) return true;
  return /\.(test|invalid|example|localhost)$/.test(domain);
}

const GOOD = new Set(["active", "trialing", "past_due"]);

/** Who this person is to the Flock, or null when they're not in it (and so
 *  must send nothing). Pure: scripts/flock-analytics.test.ts pins it. */
export function flockContext(i: ContextInputs): FlockContext | null {
  const pending = !!i.allowPending && i.entitlements.some((e) => GOOD.has(e.status));
  if (!i.isMember && !i.isAdmin && !pending) return null;
  const t = (i.now ?? new Date()).getTime();
  const live = i.entitlements.filter((e) => GOOD.has(e.status) && (!e.starts_at || new Date(e.starts_at).getTime() <= t));
  const has = (pred: (e: ContextInputs["entitlements"][number]) => boolean) => live.some(pred) || i.entitlements.some((e) => GOOD.has(e.status) && pred(e));
  const founder = has((e) => e.plan === "founding" || e.source === "founding");
  const gift = has((e) => e.source === "gift");
  const freeSeason = live.some((e) => e.source === "free_season");
  const lead = has((e) => e.source === "chapter_lead");
  const paid = live.some((e) => ["stripe", "apple", "google"].includes(e.source));
  // The one label a breakdown shows: what they're most identified by.
  const membership: Membership = founder ? "founding" : paid ? "paid" : gift ? "gift" : lead ? "chapter_lead"
    : freeSeason || (pending && i.entitlements.some((e) => e.source === "free_season")) ? "free_season"
    : i.isMember || pending ? "comp" : "admin";
  return {
    chapter: i.regionSlug || "none",
    membership,
    founder,
    gift_holder: gift,
    free_season: freeSeason,
    chapter_lead: lead,
    is_admin: i.isAdmin,
    internal: i.isAdmin || isTestEmail(i.email),
  };
}

/** The properties an event goes out with, or null when it must not go out.
 *  Keys outside the event's allowlist are dropped, and so is any string that
 *  could be someone's writing (long, or with spaces). */
export function flockEventProps(ctx: FlockContext | null, name: FlockEventName, props: FlockEventProps = {}): FlockEventProps | null {
  if (!ctx) return null;
  const allowed = FLOCK_EVENT_PROPS[name] as readonly string[] | undefined;
  if (!allowed) return null;
  const out: FlockEventProps = { ...ctx, platform: platform() };
  for (const k of allowed) {
    const v = props[k];
    if (v == null) continue;
    if (typeof v === "string" && (v.length > 64 || /\s/.test(v))) continue;
    out[k] = v;
  }
  return out;
}

function platform(): string {
  try { return nativePlatform(); } catch { return "web"; }
}

// ---- Reading the context (cached per account, five minutes) ------------------

type Loaded = { userId: string; at: number; ctx: FlockContext | null };
let cached: Loaded | null = null;
let inflight: Promise<FlockContext | null> | null = null;
let personSetFor: string | null = null;
let activeSentFor: string | null = null;
const TTL = 5 * 60_000;

async function readContext(opts: { allowPending?: boolean } = {}): Promise<FlockContext | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) { cached = null; return null; }
  if (!opts.allowPending && cached && cached.userId === user.id && Date.now() - cached.at < TTL) return cached.ctx;
  const sb = supabase as any;
  const [admin, member, ents, profile] = await Promise.all([
    supabase.rpc("is_admin"),
    sb.rpc("is_flock_member"),
    sb.from("entitlements").select("plan, source, status, starts_at"),
    sb.from("flock_profiles").select("region_slug").eq("user_id", user.id).maybeSingle(),
  ]);
  // Fails closed: if either status read errors, this person sends nothing.
  if (admin.error || member.error) return null;
  const ctx = flockContext({
    isAdmin: admin.data === true,
    isMember: member.data === true,
    email: user.email ?? null,
    regionSlug: profile?.data?.region_slug ?? null,
    entitlements: ents.error ? [] : (ents.data ?? []),
    allowPending: opts.allowPending,
  });
  if (!opts.allowPending) cached = { userId: user.id, at: Date.now(), ctx };
  return ctx;
}

async function readUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

// Swappable only for scripts/flock-analytics.test.ts.
let deps = { loadContext: readContext, userId: readUserId, send: track, setPerson: setPersonProperties };

/** Tests only: replace the status read and the sender. */
export function __setFlockAnalyticsDepsForTests(d: Partial<typeof deps>): void {
  deps = { ...deps, ...d };
  cached = null; inflight = null; personSetFor = null; activeSentFor = null;
}

function context(): Promise<FlockContext | null> {
  if (!inflight) inflight = deps.loadContext().catch(() => null).finally(() => { inflight = null; });
  return inflight;
}

/** Forget the cached context (a membership change, sign-out). */
export function resetFlockAnalytics(): void {
  cached = null;
  activeSentFor = null;
}

// ---- Sending ---------------------------------------------------------------

/** Send one Flock event. Never throws and never blocks the caller. */
export function trackFlock(name: FlockEventName, props?: FlockEventProps): Promise<void> {
  return sendWith(context(), name, props);
}

function sendWith(load: Promise<FlockContext | null>, name: FlockEventName, props?: FlockEventProps): Promise<void> {
  return load.then((ctx) => {
    const out = flockEventProps(ctx, name, props);
    if (!out || !ctx) return;
    const key = JSON.stringify(ctx);
    if (personSetFor !== key) {
      personSetFor = key;
      deps.setPerson({
        flock_member: ctx.membership !== "admin",
        flock_membership: ctx.membership,
        flock_founding: ctx.founder,
        flock_gift_holder: ctx.gift_holder,
        flock_free_season: ctx.free_season,
        flock_chapter: ctx.chapter,
        flock_internal: ctx.internal,
      });
    }
    deps.send(name, out);
  }).catch(() => undefined);
}

/** `flock_joined`, from the join screen once `flock_join()` succeeds (build C
 *  wires it). Re-reads the member's status first, so the new member counts.
 *  `source`: where they came from (care_app, email, website, founding, gift). */
export function trackFlockJoined(source: string): Promise<void> {
  resetFlockAnalytics();
  const load = deps.loadContext({ allowPending: true }).catch(() => null);
  return sendWith(load, "flock_joined", { source: joinSource(source) });
}

/** Where someone came from to join; anything else is the care app. */
export const JOIN_SOURCES = ["care_app", "email", "website", "founding", "gift"] as const;
export type JoinSource = (typeof JOIN_SOURCES)[number];
export function joinSource(v: unknown): JoinSource {
  return (JOIN_SOURCES as readonly unknown[]).includes(v) ? (v as JoinSource) : "care_app";
}

/** The Flock's day, Eastern (the same day private.flock_today() uses). */
export function flockDay(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

const ACTIVE_KEY = "kya_flock_active_day";

/** `flock_active`, at most once per account per Flock day on this device.
 *  Called by FlockShell on every Flock screen; only the first of the day sends. */
export function trackFlockActive(now: Date = new Date()): Promise<void> {
  return (async () => {
    const uid = await deps.userId();
    if (!uid) return;
    const mark = `${flockDay(now)}:${uid.slice(0, 8)}`;
    if (activeSentFor === mark) return;
    let stored: string | null = null;
    try { stored = localStorage.getItem(ACTIVE_KEY); } catch { /* private mode */ }
    activeSentFor = mark;
    if (stored === mark) return;
    const ctx = await context();
    if (!ctx) { activeSentFor = null; return; }
    try { localStorage.setItem(ACTIVE_KEY, mark); } catch { /* private mode */ }
    await trackFlock("flock_active");
  })().catch(() => undefined);
}
