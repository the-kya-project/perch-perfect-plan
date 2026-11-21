/**
 * Onboarding as one system: which email (if any) an account gets today.
 *
 * Pure — no database, no clock reads. The cron route loads raw rows, turns them
 * into an `OnboardingAccount` with `buildAccounts`, and asks `decide` what to do.
 * The dry run and the 30-day `simulate` use exactly the same two functions, so a
 * plan shown for review is the plan the cron would carry out.
 *
 * THE SLOTS. Every account walks one ordered list:
 *
 *   welcome → add_first_bird → add_first_bird_reminder → series_weighing →
 *   series_health_check → series_care_plan → series_journal → series_sharing →
 *   series_vet
 *
 * Each slot is settled exactly once, as SENT or SKIPPED (with a reason), in
 * onboarding_email_log. A settled slot never runs again, which is what makes
 * "never re-send" and "at most two add-a-bird nudges" hold.
 *
 * THE WELCOME is not sent from here. The onboarding-welcome hook (every 15
 * minutes, src/lib/welcomeTiming.ts) sends it about an hour after the account
 * is confirmed. Until the welcome is settled this batch holds the account
 * (`awaiting_welcome`), so the two never both send it. A welcome still unsent
 * WELCOME_MISSED_AFTER_HOURS after confirmation is skipped `welcome_missed`
 * and the series goes on without it; an account that never confirms waits.
 *
 * THE CADENCE. One email per run. The first email after the welcome is due 3
 * UTC calendar days after SIGN-UP (the day the account was created), whenever
 * the welcome itself went out. After that, each is due 3 UTC calendar days
 * after the last onboarding email that was SENT. Calendar days, not hours: the
 * cron fires at 15:00 and a run a few seconds earlier than the last one must not
 * slip a whole day. A skip does not use up the gap — the run moves straight on
 * to the next slot — so a skipped stage never leaves a six-day hole.
 *
 * The two nudges only ever go to an account with no bird, and they sit in the
 * cadence where the next series email would have gone, so the series still runs
 * in full afterwards (no-bird accounts get every series stage, with the add-a-bird
 * button). If a bird turns up, any nudge not yet sent is skipped.
 */

/** Accounts created before this never entered the series; their automated
 *  onboarding is retired (decision A, 2026-10-14). */
export const SERIES_LAUNCH = "2026-09-25T00:00:00Z";

export const SPACING_DAYS = 3;

/** The welcome hook sends within this many hours of confirmation, never later. */
export const WELCOME_WINDOW_HOURS = 48;
/** The daily batch gives up on a welcome this long after confirmation: an hour
 *  past the hook's window, so the two never act on the same account. */
export const WELCOME_MISSED_AFTER_HOURS = WELCOME_WINDOW_HOURS + 1;

export const SLOTS = [
  "welcome",
  "add_first_bird",
  "add_first_bird_reminder",
  "series_weighing",
  "series_health_check",
  "series_care_plan",
  "series_journal",
  "series_sharing",
  "series_vet",
] as const;
export type Slot = (typeof SLOTS)[number];

export type SkipReason =
  | "has_bird"
  | "already_weighed"
  | "already_checked"
  | "care_plan_complete"
  | "already_journaled"
  | "already_shared"
  | "cannot_share"
  /** The welcome wasn't sent within its window after confirmation. */
  | "welcome_missed"
  /** The address can't take email: Brevo has it blocked (hard bounce, spam
   *  complaint, unsubscribed, blocked by us) or it is a reserved test domain. */
  | "undeliverable";

export type CtaVariant = "standard" | "no_bird";

/**
 * Where each stage's button goes once the reader has a bird, as the path under
 * /birds/:id/. The same value rides on the no-bird button as /birds/new?next=…,
 * so adding a bird lands the reader on the feature the email was about.
 */
export const STAGE_FEATURE: Partial<Record<Slot, BirdFeature>> = {
  series_weighing: "weight",
  series_health_check: "scan",
  series_care_plan: "plan",
  series_journal: "journal",
  series_sharing: "access",
  series_vet: "vet-summary",
};

/** The only values /birds/new accepts for `next`. */
export const BIRD_FEATURES = ["weight", "scan", "plan", "journal", "access", "vet-summary"] as const;
export type BirdFeature = (typeof BIRD_FEATURES)[number];

// ── Raw rows, as the route selects them ─────────────────────────────────────

export type RawRows = {
  profiles: Array<{ id: string; created_at: string; notify_onboarding: boolean | null }>;
  birds: Array<{ id: string; owner_id: string; name: string | null; created_at: string; passed_at: string | null; setup_complete: boolean | null }>;
  /** bird_members rows. Only role = 'household' matters here. */
  members: Array<{ bird_id: string; user_id: string; role: string }>;
  /** household_member_permissions rows. */
  permissions: Array<{ owner_id: string; member_user_id: string; capabilities: string[] | null }>;
  weights: Array<{ bird_id: string; source: string | null }>;
  dailyLogs: Array<{ bird_id: string; source: string | null }>;
  journals: Array<{ bird_id: string; sit_id: string | null }>;
  invites: Array<{ owner_id: string }>;
  sits: Array<{ owner_id: string; sitter_name: string | null }>;
  log: Array<{ user_id: string; stage: string; status: string | null; sent_at: string }>;
  /** Users who got an engagement push nudge today (UTC). */
  pushedToday: string[];
  /** Users who got The Flock Report today (UTC). */
  flockReportToday: string[];
  /** auth.users.email_confirmed_at per user (onboarding_confirmations()).
   *  A user missing here counts as unconfirmed. */
  confirmations?: Array<{ user_id: string; email_confirmed_at: string | null }>;
};

export type LogEntry = { stage: string; status: "sent" | "skipped"; at: string };

export type OnboardingAccount = {
  userId: string;
  createdAt: string;
  /** When the email address was confirmed; null if it hasn't been. */
  confirmedAt: string | null;
  notifyOnboarding: boolean;
  /** Owns a living bird, or is a household member of someone else's. */
  hasBird: boolean;
  /** The bird the buttons point at: oldest owned, else oldest shared. */
  linkBird: { id: string; name: string | null } | null;
  /** Owns no living bird, shares none, and has a bird that passed. */
  onlyPassedBirds: boolean;
  done: { weighed: boolean; checked: boolean; carePlanComplete: boolean; journaled: boolean; shared: boolean };
  /** A household member (no bird of their own) without "Manage the household". */
  cannotShare: boolean;
  log: LogEntry[];
  pushedToday: boolean;
  flockReportToday: boolean;
};

/** Sitters are excluded from every "already did it" check; owners and
 *  household members both count (decision B). */
const BY_HOUSEHOLD = new Set(["owner", "household"]);
const PREVIEW_SITTER = "__preview__";

export function buildAccounts(raw: RawRows): OnboardingAccount[] {
  const birdById = new Map(raw.birds.map((b) => [b.id, b]));
  const group = <T,>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const k = key(r);
      const arr = m.get(k);
      if (arr) arr.push(r);
      else m.set(k, [r]);
    }
    return m;
  };
  const birdsByOwner = group(raw.birds, (b) => b.owner_id);
  const memberRowsByUser = group(raw.members.filter((m) => m.role === "household"), (m) => m.user_id);
  const weightBirds = new Set(raw.weights.filter((w) => BY_HOUSEHOLD.has(w.source ?? "")).map((w) => w.bird_id));
  const checkBirds = new Set(raw.dailyLogs.filter((d) => BY_HOUSEHOLD.has(d.source ?? "")).map((d) => d.bird_id));
  const journalBirds = new Set(raw.journals.filter((j) => !j.sit_id).map((j) => j.bird_id));
  const inviteOwners = new Set(raw.invites.map((i) => i.owner_id));
  const sitOwners = new Set(raw.sits.filter((s) => s.sitter_name !== PREVIEW_SITTER).map((s) => s.owner_id));
  const managers = new Set(
    raw.permissions
      .filter((p) => (p.capabilities ?? []).includes("manage_household"))
      .map((p) => `${p.owner_id}:${p.member_user_id}`),
  );
  const logByUser = group(raw.log, (l) => l.user_id);
  const pushed = new Set(raw.pushedToday);
  const flock = new Set(raw.flockReportToday);
  const confirmedAt = new Map((raw.confirmations ?? []).map((c) => [c.user_id, c.email_confirmed_at]));
  const byAge = (a: { created_at: string }, b: { created_at: string }) =>
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

  return raw.profiles.map((p) => {
    const owned = birdsByOwner.get(p.id) ?? [];
    const ownedLiving = owned.filter((b) => !b.passed_at).sort(byAge);
    const shared = (memberRowsByUser.get(p.id) ?? [])
      .map((m) => birdById.get(m.bird_id))
      .filter((b): b is NonNullable<typeof b> => !!b && !b.passed_at && b.owner_id !== p.id)
      .sort(byAge);
    const accessible = [...ownedLiving, ...shared];
    const ids = accessible.map((b) => b.id);
    const memberOnly = ownedLiving.length === 0 && shared.length > 0;
    // Whose household this account can share from: its own, plus any household
    // it manages as a member.
    const managedOwners = new Set(shared.map((b) => b.owner_id).filter((o) => managers.has(`${o}:${p.id}`)));
    const shareOwners = new Set<string>([p.id, ...managedOwners]);
    const linkBird = ownedLiving[0] ?? shared[0] ?? null;

    return {
      userId: p.id,
      createdAt: p.created_at,
      confirmedAt: confirmedAt.get(p.id) ?? null,
      notifyOnboarding: p.notify_onboarding !== false,
      hasBird: accessible.length > 0,
      linkBird: linkBird ? { id: linkBird.id, name: linkBird.name } : null,
      onlyPassedBirds: accessible.length === 0 && owned.some((b) => !!b.passed_at),
      done: {
        weighed: ids.some((id) => weightBirds.has(id)),
        checked: ids.some((id) => checkBirds.has(id)),
        carePlanComplete: accessible.some((b) => b.setup_complete === true),
        journaled: ids.some((id) => journalBirds.has(id)),
        shared: [...shareOwners].some((o) => inviteOwners.has(o) || sitOwners.has(o)),
      },
      cannotShare: memberOnly && managedOwners.size === 0,
      log: (logByUser.get(p.id) ?? []).map((l) => ({
        stage: l.stage,
        status: l.status === "skipped" ? "skipped" : "sent",
        at: l.sent_at,
      })),
      pushedToday: pushed.has(p.id),
      flockReportToday: flock.has(p.id),
    } satisfies OnboardingAccount;
  });
}

// ── The decision ────────────────────────────────────────────────────────────

export type HoldReason =
  | "opted_out"
  | "pre_series"
  | "bird_passed"
  | "sent_today"
  | "flock_report_today"
  | "pushed_today"
  | "not_due"
  | "finished"
  /** The welcome hook hasn't sent (or settled) the welcome yet. */
  | "awaiting_welcome";

export type Decision =
  | { kind: "hold"; reason: HoldReason; nextDue?: string }
  | {
      kind: "act";
      /** Slots settled as skipped on this run, in order. Written even when the
       *  send that follows fails — the facts that caused them still hold. */
      skips: Array<{ stage: Slot; reason: SkipReason }>;
      /** The one email to send, or null when every remaining slot skipped. */
      send: { stage: Slot; ctaVariant: CtaVariant } | null;
    };

const utcDay = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const dayNumber = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);

export function addDays(day: string, n: number): string {
  return new Date((dayNumber(day) + n) * 86_400_000).toISOString().slice(0, 10);
}

/** Every onboarding slot this account has settled, sent or skipped. */
export function settledSlots(log: LogEntry[]): Set<string> {
  return new Set(log.map((l) => l.stage));
}

/**
 * Is this account still in the onboarding series? Used by the monthly letter:
 * someone mid-series gets the series instead of The Flock Report, not both.
 * Opted-out and pre-series accounts are not in it; neither is anyone whose
 * closing email (series_vet) has gone out.
 */
export function inOnboardingSeries(a: Pick<OnboardingAccount, "createdAt" | "notifyOnboarding" | "log">): boolean {
  if (!a.notifyOnboarding) return false;
  if (new Date(a.createdAt) < new Date(SERIES_LAUNCH)) return false;
  return !settledSlots(a.log).has("series_vet");
}

function skipReason(slot: Slot, a: OnboardingAccount, log: LogEntry[]): SkipReason | null {
  switch (slot) {
    case "welcome":
      return null;
    case "add_first_bird":
      return a.hasBird ? "has_bird" : null;
    case "add_first_bird_reminder": {
      // The reminder follows a nudge that actually went out. If the first nudge
      // was skipped, the account had a bird at the time, and "skip any nudge not
      // yet sent once a bird turns up" covers this one too.
      const firstSent = log.some((l) => l.stage === "add_first_bird" && l.status === "sent");
      return a.hasBird || !firstSent ? "has_bird" : null;
    }
    case "series_weighing":
      return a.done.weighed ? "already_weighed" : null;
    case "series_health_check":
      return a.done.checked ? "already_checked" : null;
    case "series_care_plan":
      return a.done.carePlanComplete ? "care_plan_complete" : null;
    case "series_journal":
      return a.done.journaled ? "already_journaled" : null;
    case "series_sharing":
      if (a.cannotShare) return "cannot_share";
      return a.done.shared ? "already_shared" : null;
    case "series_vet":
      return null; // closes the series; never skipped (decision E)
  }
}

export function decide(a: OnboardingAccount, now: Date): Decision {
  if (!a.notifyOnboarding) return { kind: "hold", reason: "opted_out" };
  if (new Date(a.createdAt) < new Date(SERIES_LAUNCH)) return { kind: "hold", reason: "pre_series" };
  // A grieving owner with no other bird gets nothing, and nothing is logged:
  // this is a pause, not a skip, so the series picks up if a bird is added.
  if (a.onlyPassedBirds) return { kind: "hold", reason: "bird_passed" };

  const settled = settledSlots(a.log);
  let pending: Slot[] = SLOTS.filter((s) => !settled.has(s));
  if (pending.length === 0) return { kind: "hold", reason: "finished" };

  // The welcome belongs to the onboarding-welcome hook. Wait for it, unless its
  // window has closed, in which case the welcome is skipped and the series
  // carries on.
  const skips: Array<{ stage: Slot; reason: SkipReason }> = [];
  if (pending[0] === "welcome") {
    const missed = !!a.confirmedAt && now.getTime() - new Date(a.confirmedAt).getTime() > WELCOME_MISSED_AFTER_HOURS * 3_600_000;
    if (!missed) return { kind: "hold", reason: "awaiting_welcome" };
    skips.push({ stage: "welcome", reason: "welcome_missed" });
    pending = pending.slice(1);
  }

  const today = utcDay(now);
  const sentRows = a.log.filter((l) => l.status === "sent").sort((x, y) => x.at.localeCompare(y.at));
  const sends = sentRows.map((l) => utcDay(l.at));
  const lastSent = sends[sends.length - 1];
  if (lastSent === today) return { kind: "hold", reason: "sent_today" };
  // One touch per UTC day across onboarding, push nudges and The Flock Report.
  // Onboarding runs first (15:00, before the 16:00 push job), so on a normal day
  // the email wins; these only bite if the order ever changes, or on the 2nd.
  if (a.flockReportToday) return { kind: "hold", reason: "flock_report_today" };
  if (a.pushedToday) return { kind: "hold", reason: "pushed_today" };
  // Nothing but the welcome sent so far: count from sign-up, not from the
  // welcome (which can go a day later, after a late confirmation or a night).
  const onlyWelcome = sentRows.every((l) => l.stage === "welcome");
  const due = onlyWelcome ? addDays(utcDay(a.createdAt), SPACING_DAYS) : addDays(lastSent!, SPACING_DAYS);
  if (dayNumber(today) < dayNumber(due)) return { kind: "hold", reason: "not_due", nextDue: due };

  for (const slot of pending) {
    const reason = skipReason(slot, a, a.log);
    if (reason) {
      skips.push({ stage: slot, reason });
      continue;
    }
    // The nudges are add-a-bird emails by definition; everything else follows
    // the account's state at send time.
    const ctaVariant: CtaVariant = a.hasBird ? "standard" : "no_bird";
    return { kind: "act", skips, send: { stage: slot, ctaVariant } };
  }
  return { kind: "act", skips, send: null };
}

// ── Simulation, for review ──────────────────────────────────────────────────

export type SimEvent =
  | { date: string; userId: string; kind: "sent"; stage: Slot; ctaVariant: CtaVariant }
  | { date: string; userId: string; kind: "skipped"; stage: Slot; reason: SkipReason }
  | { date: string; userId: string; kind: "hold"; reason: HoldReason };

/**
 * Run the daily decision forward `days` times from `start` (the first run's
 * timestamp), assuming every send succeeds and nobody changes anything in the
 * app. Push nudges and The Flock Report are assumed not to fire (the letter is
 * paused; pushes cannot be predicted), so `pushedToday`/`flockReportToday` only
 * apply on the first day. Holds that explain an account's absence for the whole
 * window (opted out, pre-series, finished, passed bird) are reported once.
 */
export function simulate(accounts: OnboardingAccount[], start: Date, days: number): SimEvent[] {
  const events: SimEvent[] = [];
  const state = accounts.map((a) => ({ ...a, log: [...a.log] }));
  const reportedOnce = new Set<string>();
  for (let d = 0; d < days; d++) {
    const now = new Date(start.getTime() + d * 86_400_000);
    const date = utcDay(now);
    for (const a of state) {
      if (d > 0) {
        a.pushedToday = false;
        a.flockReportToday = false;
      }
      const dec = decide(a, now);
      // The welcome hook's part, for a confirmed account: it sends the welcome
      // within the hour, so the simulation does it here on the same day.
      if (dec.kind === "hold" && dec.reason === "awaiting_welcome" && a.confirmedAt) {
        const ctaVariant: CtaVariant = a.hasBird ? "standard" : "no_bird";
        a.log.push({ stage: "welcome", status: "sent", at: now.toISOString() });
        events.push({ date, userId: a.userId, kind: "sent", stage: "welcome", ctaVariant });
        continue;
      }
      if (dec.kind === "hold") {
        const sticky = dec.reason === "opted_out" || dec.reason === "pre_series" || dec.reason === "bird_passed" || dec.reason === "finished";
        if (sticky) {
          const key = `${a.userId}:${dec.reason}`;
          if (!reportedOnce.has(key)) {
            reportedOnce.add(key);
            events.push({ date, userId: a.userId, kind: "hold", reason: dec.reason });
          }
        } else if (dec.reason !== "not_due" && dec.reason !== "sent_today" && dec.reason !== "awaiting_welcome") {
          events.push({ date, userId: a.userId, kind: "hold", reason: dec.reason });
        }
        continue;
      }
      for (const s of dec.skips) {
        a.log.push({ stage: s.stage, status: "skipped", at: now.toISOString() });
        events.push({ date, userId: a.userId, kind: "skipped", stage: s.stage, reason: s.reason });
      }
      if (dec.send) {
        a.log.push({ stage: dec.send.stage, status: "sent", at: now.toISOString() });
        events.push({ date, userId: a.userId, kind: "sent", stage: dec.send.stage, ctaVariant: dec.send.ctaVariant });
      }
    }
  }
  return events;
}
