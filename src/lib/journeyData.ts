// Journeys data (Community). Every read is a bird the caller can already see,
// or a template; every write goes through a database function that enforces
// the tier rules (20261107200000_journeys_core.sql). Flock code only: imported
// from /flock routes, never from shared code.
//
// The tables and functions postdate the generated types, hence `sb`.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { JourneyAccess, JourneyRhythm, JourneyStatus, JourneyTemplate, JourneyVisibility } from "@/lib/journeys";

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
};

export type JourneyBird = { id: string; name: string; species: string | null; sex: string | null; photo_url: string | null };
export type BirdSkill = { id: string; name: string; template_id: string | null; source: "known" | "journey" };
export type JourneyMilestone = { id: string; position: number; title: string; state: "todo" | "already" | "reached"; reached_at: string | null };
export type Journey = {
  id: string;
  bird_id: string;
  template_id: string | null;
  custom_name: string | null;
  status: JourneyStatus;
  visibility: JourneyVisibility;
  rhythm: JourneyRhythm;
  started_at: string;
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
        .select("id, bird_id, template_id, custom_name, status, visibility, rhythm, started_at, template:journey_templates(name, slug), milestones:journey_milestones(id, position, title, state, reached_at)")
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

/** After a change: everything journey-shaped reloads. */
export function useInvalidateJourneys() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["flock", "journeys"] });
}
