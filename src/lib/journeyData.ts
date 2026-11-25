// Journeys data (Community). Every read is a bird the caller can already see,
// or a template; every write goes through a database function that enforces
// the tier rules (20261107200000_journeys_core.sql). Flock code only: imported
// from /flock routes, never from shared code.
//
// The tables and functions postdate the generated types, hence `sb`.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getJourneyClips, getSkillVideo, type JourneyClip } from "@/lib/journeyMedia.functions";
import type { Engagement, JourneyAccess, JourneyRhythm, JourneyStatus, JourneyTemplate, JourneyVisibility, VetCheck, WeightLevel } from "@/lib/journeys";
import { trackFlock } from "@/lib/flockAnalytics";

const sb = supabase as any;
const STALE = 60_000;

function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export const journeyKeys = {
  access: ["flock", "journeys", "access"] as const,
  templates: ["flock", "journeys", "templates"] as const,
  birds: ["flock", "journeys", "birds"] as const,
  skills: (birdId: string) => ["flock", "journeys", "skills", birdId] as const,
  journey: (id: string) => ["flock", "journeys", "journey", id] as const,
  birdJourneys: (birdId: string) => ["flock", "journeys", "bird", birdId] as const,
  updates: (id: string) => ["flock", "journeys", "updates", id] as const,
  active: ["flock", "journeys", "active"] as const,
  tips: ["flock", "journeys", "tips"] as const,
  finisherTips: (slug: string) => ["flock", "journeys", "finisher-tips", slug] as const,
  weight: (id: string) => ["flock", "journeys", "weight", id] as const,
  weights: (birdId: string) => ["flock", "journeys", "weights", birdId] as const,
  allowance: (birdId: string, id: string) => ["flock", "journeys", "allowance", birdId, id] as const,
  feed: (filter: string) => ["flock", "journeys", "feed", filter] as const,
  following: ["flock", "journeys", "following"] as const,
  view: (id: string) => ["flock", "journeys", "view", id] as const,
  viewMilestones: (id: string) => ["flock", "journeys", "view-milestones", id] as const,
  viewUpdates: (id: string) => ["flock", "journeys", "view-updates", id] as const,
  cards: ["flock", "journeys", "moment-cards"] as const,
  clips: (id: string) => ["flock", "journeys", "clips", id] as const,
  yours: ["flock", "journeys", "yours"] as const,
  followingLatest: ["flock", "journeys", "following-latest"] as const,
  bigMoments: (id: string) => ["flock", "journeys", "big-moments", id] as const,
  skillJourneys: (slug: string) => ["flock", "journeys", "skill-journeys", slug] as const,
  vetSigns: ["flock", "journeys", "vet-signs"] as const,
  skillVideo: (slug: string) => ["flock", "journeys", "skill-video", slug] as const,
  memberSkills: (q: string) => ["flock", "journeys", "member-skills", q] as const,
  customAbout: (id: string) => ["flock", "journeys", "custom-about", id] as const,
};

export type JourneyBird = { id: string; name: string; species: string | null; sex: string | null; photo_url: string | null; birth_date: string | null };
export type BirdSkill = { id: string; name: string; template_id: string | null; source: "known" | "journey" };
export type JourneyMilestone = {
  id: string; position: number; title: string; state: "todo" | "already" | "reached"; reached_at: string | null; shared_at: string | null;
  /** The template's phrasing ("fly to you from arm's length" / "flew to you"); null for custom journeys. */
  words: { ask: string | null; done_line: string | null } | null;
};
export type Journey = {
  id: string;
  bird_id: string;
  template_id: string | null;
  custom_name: string | null;
  custom_description: string | null;
  status: JourneyStatus;
  visibility: JourneyVisibility;
  rhythm: JourneyRhythm;
  started_at: string;
  finished_at: string | null;
  paused_reason: "member" | "weight_drop" | null;
  vet_check: VetCheck | null;
  vet_remind_after: string | null;
  /** A bird that has passed: its journeys are read-only. */
  bird: { passed_at: string | null } | null;
  template: { name: string; slug: string } | null;
  /** History only (journeys started before the redesign); Diet conversion's
   *  vet reminder still reads them until 1.20d. */
  milestones: JourneyMilestone[];
};

export function useJourneyAccess() {
  return useQuery({
    queryKey: journeyKeys.access,
    staleTime: STALE,
    queryFn: async (): Promise<JourneyAccess> => (must(await sb.rpc("journey_my_access")) as JourneyAccess[])[0],
  });
}

export function useJourneyTemplates() {
  return useQuery({
    queryKey: journeyKeys.templates,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<JourneyTemplate[]> => {
      return must(await sb.from("journey_templates")
        .select("id, slug, name, category, tier, purpose, safety_notes, safeguards, tips, sort_order, video_ref")
        .order("sort_order")) as JourneyTemplate[];
    },
  });
}

/** Birds you can start a journey for: yours and your household's, still living. */
export function useJourneyBirds() {
  return useQuery({
    queryKey: journeyKeys.birds,
    staleTime: STALE,
    queryFn: async (): Promise<JourneyBird[]> =>
      must(await sb.from("birds").select("id, name, species, sex, photo_url, birth_date").is("passed_at", null).order("name")) as JourneyBird[],
  });
}

export function useBirdSkills(birdId: string | null | undefined) {
  return useQuery({
    queryKey: journeyKeys.skills(birdId ?? ""),
    enabled: !!birdId,
    staleTime: STALE,
    queryFn: async (): Promise<BirdSkill[]> =>
      must(await sb.from("bird_skills").select("id, name, template_id, source").eq("bird_id", birdId).order("added_at")) as BirdSkill[],
  });
}

/** A bird's open journeys (active or paused), to mark templates already going. */
export function useBirdJourneys(birdId: string | null | undefined) {
  return useQuery({
    queryKey: journeyKeys.birdJourneys(birdId ?? ""),
    enabled: !!birdId,
    staleTime: STALE,
    queryFn: async (): Promise<{ id: string; template_id: string | null; status: JourneyStatus }[]> =>
      must(await sb.from("journeys").select("id, template_id, status").eq("bird_id", birdId).in("status", ["active", "paused"])) as any,
  });
}

export function useJourney(id: string) {
  return useQuery({
    queryKey: journeyKeys.journey(id),
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<Journey | null> => {
      const row = must(await sb.from("journeys")
        .select("id, bird_id, template_id, custom_name, custom_description, status, visibility, rhythm, started_at, finished_at, paused_reason, vet_check, vet_remind_after, bird:birds(passed_at), template:journey_templates(name, slug), milestones:journey_milestones(id, position, title, state, reached_at, shared_at, words:journey_template_milestones(ask, done_line))")
        .eq("id", id).maybeSingle()) as Journey | null;
      if (!row) return null;
      return { ...row, milestones: [...(row.milestones ?? [])].sort((a, b) => a.position - b.position) };
    },
  });
}

export async function startJourney(input: {
  birdId: string;
  templateSlug?: string | null;
  customName?: string | null;
  /** Your own skill's description, in the owner's words (optional). */
  customDescription?: string | null;
  rhythm: JourneyRhythm;
  visibility: JourneyVisibility;
  dayOneClip?: string | null;
  /** Diet conversion's vet card answer, saved on the journey. */
  vetCheck?: VetCheck | null;
}): Promise<string> {
  const id = must(await sb.rpc("journey_start", {
    p_bird_id: input.birdId,
    p_template_slug: input.templateSlug ?? null,
    p_custom_name: input.customName ?? null,
    p_custom_milestones: null,
    p_already: null,
    p_rhythm: input.rhythm,
    p_visibility: input.visibility,
    p_day_one_clip: input.dayOneClip ?? null,
    p_custom_description: input.customDescription?.trim() || null,
  })) as string;
  if (input.vetCheck) await setVetCheck(id, input.vetCheck);
  trackFlock("flock_journey_started", {
    template: input.templateSlug ?? "custom", is_custom: !input.templateSlug, visibility: input.visibility,
    milestone_count: null, already_count: 0,
  });
  return id;
}

/** The vet card's answer, or the milestone-2 card's "Remind me later". */
export async function setVetCheck(journeyId: string, choice: VetCheck | "remind_later"): Promise<void> {
  must(await sb.rpc("journey_set_vet_check", { p_journey_id: journeyId, p_choice: choice }));
}

export async function setKnownSkills(birdId: string, templateSlugs: string[]): Promise<number> {
  return must(await sb.rpc("bird_set_known_skills", { p_bird_id: birdId, p_template_slugs: templateSlugs })) as number;
}

export type JourneyUpdate = {
  id: string; clip_ref: string | null; engagement: Engagement | null; caption: string | null;
  is_question: boolean; is_day_one: boolean; is_big_moment: boolean; milestone_position: number | null; created_at: string;
};

export function useJourneyUpdates(journeyId: string) {
  return useQuery({
    queryKey: journeyKeys.updates(journeyId),
    enabled: !!journeyId,
    staleTime: STALE,
    queryFn: async (): Promise<JourneyUpdate[]> =>
      must(await sb.from("journey_updates")
        .select("id, clip_ref, engagement, caption, is_question, is_day_one, is_big_moment, milestone_position, created_at")
        .eq("journey_id", journeyId).order("created_at", { ascending: false })) as JourneyUpdate[],
  });
}

export type YourJourney = {
  id: string; bird_id: string; status: JourneyStatus; started_at: string; finished_at: string | null; custom_name: string | null;
  template: { name: string; slug: string } | null; bird: { name: string; passed_at: string | null } | null;
  last_posted: string | null;
};
/** Kept for the "Post an update for…" sheet. */
export type ActiveJourney = YourJourney;

/** "Your journeys": every journey on birds you can reach (yours and your
 *  household's), with when each was last posted to. The screens sort them
 *  (sortYourJourneys): active and paused first, then finished. */
export function useYourJourneys() {
  return useQuery({
    queryKey: journeyKeys.yours,
    staleTime: STALE,
    queryFn: async (): Promise<YourJourney[]> => {
      const rows = must(await sb.from("journeys")
        .select("id, bird_id, status, started_at, finished_at, custom_name, template:journey_templates(name, slug), bird:birds(name, passed_at)")
        .order("started_at")) as Omit<YourJourney, "last_posted">[];
      if (rows.length === 0) return [];
      const ups = must(await sb.from("journey_updates").select("journey_id, created_at").in("journey_id", rows.map((r) => r.id))) as { journey_id: string; created_at: string }[];
      const last = new Map<string, string>();
      for (const u of ups) if (!last.has(u.journey_id) || last.get(u.journey_id)! < u.created_at) last.set(u.journey_id, u.created_at);
      return rows.map((r) => ({ ...r, last_posted: last.get(r.id) ?? null }));
    },
  });
}

/** Your active journeys (all birds you can reach), with when each was last posted to. */
export function useActiveJourneys() {
  const q = useYourJourneys();
  return { ...q, data: q.data?.filter((j) => j.status === "active") };
}

export function useJourneyTips() {
  return useQuery({
    queryKey: journeyKeys.tips,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<string[]> =>
      (must(await sb.from("journey_tips").select("body").order("sort_order")) as { body: string }[]).map((r) => r.body),
  });
}

/** "From members who've done [Skill]": finished members' tips, newest first,
 *  text only. Flock members get them; free accounts get none,
 *  and nobody gets their own (journey_finisher_tips_for). */
export function useFinisherTips(slug: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: journeyKeys.finisherTips(slug ?? ""),
    enabled: enabled && !!slug,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<{ body: string; created_at: string; total: number }[]> =>
      must(await sb.rpc("journey_finisher_tips_for", { p_template_slug: slug })) as any,
  });
}

export type WeightExcluded = { grams: number; measured_at: string; reason: "other_time" | "unconfirmed" | "pending" };
export type WeightCheck = {
  start_grams: number | null; current_grams: number | null; avg_grams: number | null; drop_pct: number | null; level: WeightLevel; paused: boolean;
  /** Which rule paused it: the average past 5%, a slow slide, or a sudden drop the re-weigh confirmed. */
  pause_kind: "drop" | "slide" | "sudden" | null;
  /** A sudden drop waiting for a re-weigh. */
  recheck: boolean; recheck_grams: number | null;
  /** No weigh-in for diet_missed_days days. */
  missed: boolean; days_since_weigh: number | null;
  usual_meal: "before_meal" | "after_meal" | null;
  excluded: WeightExcluded[];
  window_from: string | null; window_to: string | null;
};

/** Diet conversion only: where the weight stands (this may pause the journey). */
export function useWeightCheck(journeyId: string, enabled: boolean) {
  return useQuery({
    queryKey: journeyKeys.weight(journeyId),
    enabled: enabled && !!journeyId,
    staleTime: STALE,
    queryFn: async (): Promise<WeightCheck> => (must(await sb.rpc("journey_weight_check", { p_journey_id: journeyId })) as WeightCheck[])[0],
  });
}

/** Today: your active Diet conversion journeys with no weigh-in for a couple of days. */
export function useWeighReminders(enabled = true) {
  return useQuery({
    queryKey: ["flock", "journeys", "weigh-reminders"] as const,
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<{ journey_id: string; bird_id: string; bird_name: string; days_since_weigh: number }[]> =>
      must(await sb.rpc("journey_weigh_reminders")) as any,
  });
}

/** The bird's weigh-ins since a date (the care app's own weight log, read-only). */
export function useBirdWeights(birdId: string | null | undefined, since: string | null | undefined) {
  return useQuery({
    queryKey: [...journeyKeys.weights(birdId ?? ""), since ?? ""],
    enabled: !!birdId && !!since,
    staleTime: STALE,
    queryFn: async (): Promise<{ grams: number; measured_at: string }[]> =>
      must(await sb.from("weight_entries").select("grams, measured_at").eq("bird_id", birdId).gte("measured_at", since).order("measured_at")) as any,
  });
}

/** May another clip go on this journey, and how long may it be? */
export function useClipAllowance(birdId: string | null | undefined, journeyId: string) {
  return useQuery({
    queryKey: journeyKeys.allowance(birdId ?? "", journeyId),
    enabled: !!birdId && !!journeyId,
    staleTime: 0,
    queryFn: async (): Promise<{ max_seconds: number; max_upload_bytes: number; clips_used: number; clips_max: number | null; can_add: boolean }> =>
      (must(await sb.rpc("journey_clip_allowance", { p_bird_id: birdId, p_journey_id: journeyId })) as any[])[0],
  });
}

export async function postJourneyUpdate(journeyId: string, clipRef: string, engagement: Engagement, caption: string, bigMoment = false): Promise<string> {
  return must(await sb.rpc("journey_post_update", {
    p_journey_id: journeyId, p_clip_ref: clipRef, p_engagement: engagement, p_caption: caption.trim() || null, p_big_moment: bigMoment,
  })) as string;
}
/** "[Bird] learned it!" (adds the skill; Diet conversion adds none) or
 *  "We're happy where we are" (adds nothing). Returns the new status. */
export async function finishJourney(journeyId: string, how: "learned" | "happy_where_we_are"): Promise<JourneyStatus> {
  const status = must(await sb.rpc("journey_finish", { p_journey_id: journeyId, p_how: how })) as JourneyStatus;
  if (how === "learned") trackFlock("flock_journey_finished", { total: null });
  return status;
}
export async function saveFinisherTip(journeyId: string, body: string): Promise<void> {
  must(await sb.rpc("journey_save_finisher_tip", { p_journey_id: journeyId, p_body: body }));
}
export async function setJourneyVisibility(journeyId: string, visibility: JourneyVisibility): Promise<void> {
  must(await sb.rpc("journey_set_visibility", { p_journey_id: journeyId, p_visibility: visibility }));
}
export async function setJourneyStatus(journeyId: string, status: "active" | "paused" | "happy_where_we_are"): Promise<void> {
  must(await sb.rpc("journey_set_status", { p_journey_id: journeyId, p_status: status }));
}
export async function resumeAfterVet(journeyId: string): Promise<void> {
  must(await sb.rpc("journey_resume_after_vet", { p_journey_id: journeyId, p_confirmed: true }));
}

// ---- Step 3C: viewing, following, reacting ---------------------------------------

export type ReactionKind = "great_job" | "been_there" | "rooting_for_you" | "love_this";
export const REACTIONS: ReactionKind[] = ["great_job", "been_there", "rooting_for_you", "love_this"];
type ReactionCounts = { great_job: number; been_there: number; rooting_for_you: number; love_this: number; mine: ReactionKind[] };

/** A journey as anyone allowed to see it sees it (journey_view / journey_feed). */
export type JourneyCard = {
  journey_id: string; bird_id: string; bird_name: string; bird_has_photo: boolean; skill: string; template_slug: string | null;
  category: string | null; template_tier: string | null; status: JourneyStatus; visibility: JourneyVisibility;
  started_at: string; finished_at: string | null; done: number; total: number; next_title: string | null;
  owner_id: string; owner_name: string | null; followers: number; following: boolean; is_mine: boolean; last_activity: string;
};
export type ViewMilestone = { milestone_position: number; title: string; state: "todo" | "already" | "reached"; reached_at: string | null };
export type ViewUpdate = ReactionCounts & {
  update_id: string; has_clip: boolean; caption: string | null; is_question: boolean; is_day_one: boolean; is_milestone: boolean;
  milestone_position: number | null; created_at: string;
};
/** Today's journey card from a journey you follow: a "This was a big moment"
 *  update (reactions and comments on the update), or a "learned it" finish. */
export type MomentCard = ReactionCounts & {
  card_kind: "big_moment" | "learned"; journey_id: string; update_id: string | null; bird_id: string; bird_name: string; bird_has_photo: boolean;
  skill: string; template_slug: string | null; owner_name: string | null; owner_region: string | null; happened_at: string;
  caption: string | null; has_clip: boolean;
};
export type JourneysFilterKey = "for_you" | "following" | "tricks" | "basics";

export function useJourneyFeed(filter: JourneysFilterKey) {
  return useQuery({
    queryKey: journeyKeys.feed(filter),
    staleTime: STALE,
    queryFn: async (): Promise<JourneyCard[]> => must(await sb.rpc("journey_feed", { p_filter: filter, p_limit: 60 })) as JourneyCard[],
  });
}

export function useJourneyFollowing() {
  return useQuery({
    queryKey: journeyKeys.following,
    staleTime: STALE,
    queryFn: async (): Promise<JourneyCard[]> => must(await sb.rpc("journey_following")) as JourneyCard[],
  });
}

export function useJourneyView(id: string) {
  return useQuery({
    queryKey: journeyKeys.view(id),
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<JourneyCard | null> => ((must(await sb.rpc("journey_view", { p_journey_id: id })) as JourneyCard[])[0] ?? null),
  });
}

export function useJourneyViewMilestones(id: string) {
  return useQuery({
    queryKey: journeyKeys.viewMilestones(id),
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<ViewMilestone[]> => must(await sb.rpc("journey_view_milestones", { p_journey_id: id })) as ViewMilestone[],
  });
}

export function useJourneyViewUpdates(id: string) {
  return useQuery({
    queryKey: journeyKeys.viewUpdates(id),
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<ViewUpdate[]> => must(await sb.rpc("journey_view_updates", { p_journey_id: id })) as ViewUpdate[],
  });
}

export function useMomentCards() {
  return useQuery({
    queryKey: journeyKeys.cards,
    staleTime: STALE,
    queryFn: async (): Promise<MomentCard[]> => must(await sb.rpc("journey_moment_cards", { p_limit: 20 })) as MomentCard[],
  });
}

/** Today's followed rings: the latest clip on each followed journey. */
export function useFollowingLatest(enabled = true) {
  return useQuery({
    queryKey: journeyKeys.followingLatest,
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<Record<string, string | null>> => {
      const rows = must(await sb.rpc("journey_following_latest")) as { journey_id: string; update_id: string | null }[];
      return Object.fromEntries((rows ?? []).map((r) => [r.journey_id, r.update_id]));
    },
  });
}

/** Which of a journey's updates are big moments (only ones you may see). */
export function useBigMoments(journeyId: string, enabled = true) {
  return useQuery({
    queryKey: journeyKeys.bigMoments(journeyId),
    enabled: enabled && !!journeyId,
    staleTime: STALE,
    queryFn: async (): Promise<Set<string>> =>
      new Set(((must(await sb.rpc("journey_big_moments", { p_journey_id: journeyId })) as { update_id: string }[]) ?? []).map((r) => r.update_id)),
  });
}

/** "How others did it": other members' community journeys for one skill
 *  (Flock members only; nothing for anyone else). */
export function useSkillJourneys(slug: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: journeyKeys.skillJourneys(slug ?? ""),
    enabled: enabled && !!slug,
    staleTime: STALE,
    queryFn: async (): Promise<JourneyCard[]> => must(await sb.rpc("journey_skill_journeys", { p_template_slug: slug, p_limit: 6 })) as JourneyCard[],
  });
}

// ---- Skills from the Flock (1.20c) ---------------------------------------------------------

/** A member's own skill, shared with the community with at least one update. */
export type MemberSkill = {
  journey_id: string; skill: string; description: string | null; bird_id: string; bird_name: string; bird_has_photo: boolean;
  owner_id: string; owner_name: string | null; status: JourneyStatus; updates: number; started_at: string; last_activity: string;
};

/** "Skills from the Flock", searched by name and description (Flock members
 *  only; the database gives anyone else nothing). */
export function useMemberSkills(q: string, enabled = true) {
  const query = q.trim();
  return useQuery({
    queryKey: journeyKeys.memberSkills(query),
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<MemberSkill[]> => {
      const rows = must(await sb.rpc("journey_member_skills", { p_q: query || null, p_limit: 30 }));
      return Array.isArray(rows) ? (rows as MemberSkill[]) : [];
    },
  });
}

/** A custom journey's description, whether it's a findable member skill, and
 *  "Started from [bird]'s journey" while the source is visible. */
export type CustomAbout = { description: string | null; is_member_skill: boolean; source_journey_id: string | null; source_bird_name: string | null };
export function useCustomAbout(journeyId: string, enabled = true) {
  return useQuery({
    queryKey: journeyKeys.customAbout(journeyId),
    enabled: enabled && !!journeyId,
    staleTime: STALE,
    queryFn: async (): Promise<CustomAbout | null> => {
      const rows = must(await sb.rpc("journey_custom_about", { p_journey_id: journeyId }));
      return Array.isArray(rows) ? ((rows[0] as CustomAbout | undefined) ?? null) : null;
    },
  });
}

/** "Start this skill": a copy for your bird (or the open copy it already has). */
export async function startMemberSkill(input: { sourceId: string; birdId: string; rhythm: JourneyRhythm; visibility: JourneyVisibility }): Promise<string> {
  const id = must(await sb.rpc("journey_start_member_skill", {
    p_source_id: input.sourceId, p_bird_id: input.birdId, p_rhythm: input.rhythm, p_visibility: input.visibility,
  })) as string;
  trackFlock("flock_journey_started", { template: "custom", is_custom: true, visibility: input.visibility, milestone_count: null, already_count: 0 });
  return id;
}

/** The vet nudge's phrases for journey captions and questions (free accounts too). */
export function useJourneyVetSigns() {
  return useQuery({
    queryKey: journeyKeys.vetSigns,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<{ phrase: string; tier: "today" | "urgent" }[]> => (must(await sb.rpc("journey_vet_sign_tiers")) as any[]) ?? [],
  });
}

/** A skill's short video, signed for playback, when it has one (none at opening). */
export function useSkillVideo(slug: string | null | undefined, hasVideo: boolean) {
  return useQuery({
    queryKey: journeyKeys.skillVideo(slug ?? ""),
    enabled: hasVideo && !!slug,
    staleTime: 30 * 60_000,
    queryFn: () => getSkillVideo({ data: { slug: slug! } }),
  });
}

// A new clip is still being prepared by Cloudflare for a minute or two. While
// any is, the clips are asked for again every few seconds, for up to two
// minutes per clip (then the screen says "still processing" with Try again).
export const CLIP_POLL_MS = 4_000;
export const CLIP_PROCESSING_BUDGET_MS = 120_000;
const processingSince = new Map<string, number>();
const waitKey = (journeyId: string, updateId: string) => `${journeyId}:${updateId}`;

/** When this clip was first seen still processing (for the two-minute budget). */
export function clipProcessingSince(journeyId: string, updateId: string): number | undefined {
  return processingSince.get(waitKey(journeyId, updateId));
}
/** "Try again": start the two-minute wait over. */
export function resetClipWait(journeyId: string, updateId: string): void {
  processingSince.delete(waitKey(journeyId, updateId));
}

/** Signed playback for a journey's clips (only if you may see the journey),
 *  each ready, processing or failed (journeyMedia.functions.ts). */
export function useJourneyClips(journeyId: string, enabled = true) {
  return useQuery({
    queryKey: journeyKeys.clips(journeyId),
    enabled: enabled && !!journeyId,
    staleTime: 30 * 60_000,
    refetchInterval: (q) => {
      const data = q.state.data as Record<string, JourneyClip> | undefined;
      if (!data) return false;
      const now = Date.now();
      const waiting = Object.values(data).some((c) =>
        c.status === "processing" && now - (processingSince.get(waitKey(journeyId, c.updateId)) ?? now) < CLIP_PROCESSING_BUDGET_MS);
      return waiting ? CLIP_POLL_MS : false;
    },
    queryFn: async (): Promise<Record<string, JourneyClip>> => {
      const rows = await getJourneyClips({ data: { journeyId } });
      const now = Date.now();
      for (const r of rows) {
        const k = waitKey(journeyId, r.updateId);
        if (r.status === "processing") { if (!processingSince.has(k)) processingSince.set(k, now); }
        else processingSince.delete(k);
      }
      return Object.fromEntries(rows.map((r) => [r.updateId, r]));
    },
  });
}

export async function followJourney(journeyId: string, follow: boolean): Promise<number> {
  return must(await sb.rpc("journey_follow", { p_journey_id: journeyId, p_follow: follow })) as number;
}
export async function reactTo(subject: "journey_update" | "journey_milestone", id: string, kind: ReactionKind, on: boolean): Promise<void> {
  must(await sb.rpc("journey_react", { p_subject_type: subject, p_subject_id: id, p_kind: kind, p_on: on }));
  if (on) trackFlock("flock_reaction_added", { subject_type: subject, kind });
}

/** After a change: everything journey-shaped reloads. */
export function useInvalidateJourneys() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["flock", "journeys"] });
}
