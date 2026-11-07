// Today's idea and "We tried it" (Community, step 4C), and the admin schedule.
// Reads and writes go through database functions
// (20261108120000_flock_todays_idea.sql); photos are signed on the server.
// Flock code only.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getFlockIdeaPhotos, type IdeaPhoto } from "@/lib/flockPostMedia.functions";

const sb = supabase as any;
function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export type IdeaCategory = "enrichment" | "did_you_know" | "project" | "training" | "conservation";
export const IDEA_CATEGORIES: IdeaCategory[] = ["enrichment", "did_you_know", "project", "training", "conservation"];
export type IdeaOutcome = "loved" | "curious" | "not_for";
export const IDEA_OUTCOMES: IdeaOutcome[] = ["loved", "curious", "not_for"];

export type TodaysIdea = {
  idea_id: string; shown_on: string; title: string; category: IdeaCategory; body: string; has_photo: boolean; is_reused: boolean;
  my_outcome: IdeaOutcome | null; my_bird_id: string | null; my_has_photo: boolean;
  /** Null until 5 birds have tried it. */
  tried: number | null; loved_pct: number | null; top_species: string[] | null; photo_count: number;
};

export const ideaKeys = {
  today: ["flock", "ideas", "today"] as const,
  photos: (id: string) => ["flock", "ideas", "photos", id] as const,
  schedule: ["flock", "ideas", "schedule"] as const,
  unscheduled: ["flock", "ideas", "unscheduled"] as const,
};

export function useTodaysIdea() {
  return useQuery({
    queryKey: ideaKeys.today,
    staleTime: 60_000,
    queryFn: async (): Promise<TodaysIdea | null> => {
      const row = asArray<TodaysIdea>(must(await sb.rpc("flock_todays_idea")))[0];
      return row ? { ...row, top_species: row.top_species ? asArray<string>(row.top_species) : null } : null;
    },
  });
}

export function useIdeaPhotos(ideaId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ideaKeys.photos(ideaId ?? ""),
    enabled: !!ideaId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<IdeaPhoto[]> => getFlockIdeaPhotos({ data: { ideaId: ideaId!, width: 600 } }),
  });
}

export async function tryIdea(ideaId: string, outcome: IdeaOutcome, birdId: string | null, photoPath: string | null): Promise<void> {
  must(await sb.rpc("flock_idea_try", { p_idea_id: ideaId, p_outcome: outcome, p_bird_id: birdId, p_photo_path: photoPath }));
}

/** "Sun conure" → "sun conures"; "African grey" → "African greys". For "Most popular with …". */
const PROPER = ["african", "senegal", "quaker", "meyer's", "hahn's", "goffin's", "moluccan", "indian", "patagonian", "jardine's", "timneh", "congo", "bourke's", "lear's", "derbyan"];
export function pluralSpecies(name: string): string {
  const words = name.trim().split(/\s+/).map((w) => (PROPER.includes(w.toLowerCase()) ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()));
  const last = words.length - 1;
  if (last >= 0 && !/s$/.test(words[last])) words[last] = `${words[last]}s`;
  return words.join(" ");
}

// ---- Admin ------------------------------------------------------------------------------------

export type ScheduleDay = {
  day: string; idea_id: string | null; title: string | null; category: IdeaCategory | null; body: string | null;
  status: "draft" | "ready" | null; is_favorite: boolean | null; has_photo: boolean | null;
  reused_idea_id: string | null; reused_title: string | null;
};
export type UnscheduledIdea = { idea_id: string; title: string; category: IdeaCategory; body: string; status: "draft" | "ready"; is_favorite: boolean; scheduled_on: string | null };

export function useIdeaSchedule(enabled: boolean) {
  return useQuery({
    queryKey: ideaKeys.schedule,
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<ScheduleDay[]> => asArray<ScheduleDay>(must(await sb.rpc("admin_ideas_schedule", { p_from: null, p_days: 14 }))),
  });
}

export function useUnscheduledIdeas(enabled: boolean) {
  return useQuery({
    queryKey: ideaKeys.unscheduled,
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<UnscheduledIdea[]> => asArray<UnscheduledIdea>(must(await sb.rpc("admin_ideas_unscheduled"))),
  });
}

export type IdeaDraft = {
  id: string | null; title: string; category: IdeaCategory; body: string; photoPath: string | null;
  status: "draft" | "ready"; isFavorite: boolean; scheduledOn: string | null;
};
export async function saveIdea(d: IdeaDraft): Promise<string> {
  return must(await sb.rpc("admin_save_idea", {
    p_id: d.id, p_title: d.title, p_category: d.category, p_body: d.body, p_photo_path: d.photoPath,
    p_status: d.status, p_is_favorite: d.isFavorite, p_scheduled_on: d.scheduledOn,
  })) as string;
}
export async function swapIdeaDays(a: string, b: string): Promise<void> {
  must(await sb.rpc("admin_swap_idea_days", { p_a: a, p_b: b }));
}
export async function deleteIdea(id: string): Promise<void> {
  must(await sb.rpc("admin_delete_idea", { p_id: id }));
}

export function useInvalidateIdeas() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["flock", "ideas"] });
}
