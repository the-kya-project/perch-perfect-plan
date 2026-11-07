// Journeys data (Community). Every read is a bird the caller can already see,
// or a template; every write goes through a database function that enforces
// the tier rules (20261107200000_journeys_core.sql). Flock code only: imported
// from /flock routes, never from shared code.
//
// The tables and functions postdate the generated types, hence `sb`.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Engagement, JourneyAccess, JourneyRhythm, JourneyStatus, JourneyTemplate, JourneyVisibility, WeightLevel } from "@/lib/journeys";

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
};

export type JourneyBird = { id: string; name: string; species: string | null; sex: string | null; photo_url: string | null };
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
  status: JourneyStatus;
  visibility: JourneyVisibility;
  rhythm: JourneyRhythm;
  started_at: string;
  finished_at: string | null;
  paused_reason: "member" | "weight_drop" | null;
  template: { name: string; slug: string } | null;
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
      const rows = must(await sb.from("journey_templates")
        .select("id, slug, name, category, tier, purpose, done_when, suggested_first, typical_length, safety_notes, safeguards, tips, sort_order, milestones:journey_template_milestones(position, title)")
        .order("sort_order")) as JourneyTemplate[];
      return rows.map((t) => ({ ...t, milestones: [...(t.milestones ?? [])].sort((a, b) => a.position - b.position) }));
    },
  });
}

/** Birds you can start a journey for: yours and your household's, still living. */
export function useJourneyBirds() {
  return useQuery({
    queryKey: journeyKeys.birds,
    staleTime: STALE,
    queryFn: async (): Promise<JourneyBird[]> =>
      must(await sb.from("birds").select("id, name, species, sex, photo_url").is("passed_at", null).order("name")) as JourneyBird[],
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
        .select("id, bird_id, template_id, custom_name, status, visibility, rhythm, started_at, finished_at, paused_reason, template:journey_templates(name, slug), milestones:journey_milestones(id, position, title, state, reached_at, shared_at, words:journey_template_milestones(ask, done_line))")
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
  customMilestones?: string[] | null;
  already: number[];
  rhythm: JourneyRhythm;
  visibility: JourneyVisibility;
  dayOneClip?: string | null;
}): Promise<string> {
  return must(await sb.rpc("journey_start", {
    p_bird_id: input.birdId,
    p_template_slug: input.templateSlug ?? null,
    p_custom_name: input.customName ?? null,
    p_custom_milestones: input.customMilestones ?? null,
    p_already: input.already.length ? input.already : null,
    p_rhythm: input.rhythm,
    p_visibility: input.visibility,
    p_day_one_clip: input.dayOneClip ?? null,
  })) as string;
}

export async function setKnownSkills(birdId: string, templateSlugs: string[]): Promise<number> {
  return must(await sb.rpc("bird_set_known_skills", { p_bird_id: birdId, p_template_slugs: templateSlugs })) as number;
}

export type JourneyUpdate = {
  id: string; clip_ref: string | null; engagement: Engagement | null; caption: string | null;
  is_question: boolean; is_day_one: boolean; milestone_position: number | null; created_at: string;
};

export function useJourneyUpdates(journeyId: string) {
  return useQuery({
    queryKey: journeyKeys.updates(journeyId),
    enabled: !!journeyId,
    staleTime: STALE,
    queryFn: async (): Promise<JourneyUpdate[]> =>
      must(await sb.from("journey_updates")
        .select("id, clip_ref, engagement, caption, is_question, is_day_one, milestone_position, created_at")
        .eq("journey_id", journeyId).order("created_at", { ascending: false })) as JourneyUpdate[],
  });
}

export type ActiveJourney = {
  id: string; bird_id: string; status: JourneyStatus; started_at: string; custom_name: string | null;
  template: { name: string; slug: string } | null; bird: { name: string } | null;
  milestones: { state: string }[]; last_posted: string | null;
};

/** Your active journeys (all birds you can reach), with when each was last posted to. */
export function useActiveJourneys() {
  return useQuery({
    queryKey: journeyKeys.active,
    staleTime: STALE,
    queryFn: async (): Promise<ActiveJourney[]> => {
      const rows = must(await sb.from("journeys")
        .select("id, bird_id, status, started_at, custom_name, template:journey_templates(name, slug), bird:birds(name), milestones:journey_milestones(state)")
        .eq("status", "active").order("started_at")) as Omit<ActiveJourney, "last_posted">[];
      if (rows.length === 0) return [];
      const ups = must(await sb.from("journey_updates").select("journey_id, created_at").in("journey_id", rows.map((r) => r.id))) as { journey_id: string; created_at: string }[];
      const last = new Map<string, string>();
      for (const u of ups) if (!last.has(u.journey_id) || last.get(u.journey_id)! < u.created_at) last.set(u.journey_id, u.created_at);
      return rows.map((r) => ({ ...r, last_posted: last.get(r.id) ?? null }));
    },
  });
}

export function useJourneyTips() {
  return useQuery({
    queryKey: journeyKeys.tips,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<string[]> =>
      (must(await sb.from("journey_tips").select("body").order("sort_order")) as { body: string }[]).map((r) => r.body),
  });
}

export function useFinisherTips(slug: string | null | undefined) {
  return useQuery({
    queryKey: journeyKeys.finisherTips(slug ?? ""),
    enabled: !!slug,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<{ body: string; display_name: string | null; created_at: string }[]> =>
      must(await sb.rpc("journey_finisher_tips_for", { p_template_slug: slug })) as any,
  });
}

export type WeightCheck = {
  start_grams: number | null; current_grams: number | null; drop_pct: number | null; level: WeightLevel; paused: boolean;
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

export async function postJourneyUpdate(journeyId: string, clipRef: string, engagement: Engagement, caption: string): Promise<string> {
  return must(await sb.rpc("journey_post_update", { p_journey_id: journeyId, p_clip_ref: clipRef, p_engagement: engagement, p_caption: caption.trim() || null })) as string;
}
export async function reachMilestone(journeyId: string, position: number): Promise<{ finished: boolean; done: number; total: number }> {
  return (must(await sb.rpc("journey_reach_milestone", { p_journey_id: journeyId, p_position: position })) as any[])[0];
}
export async function saveFinisherTip(journeyId: string, body: string): Promise<void> {
  must(await sb.rpc("journey_save_finisher_tip", { p_journey_id: journeyId, p_body: body }));
}
export async function shareMilestone(journeyId: string, position: number): Promise<void> {
  must(await sb.rpc("journey_share_milestone", { p_journey_id: journeyId, p_position: position }));
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

/** After a change: everything journey-shaped reloads. */
export function useInvalidateJourneys() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["flock", "journeys"] });
}
