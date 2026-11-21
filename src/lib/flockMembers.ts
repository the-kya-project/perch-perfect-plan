// The chapter's Members tab and chapter leads (Community, step 5B). The roster
// comes from flock_chapter_roster (display name, photo, badges, shown birds'
// names and species); leads are made by admins only (admin_set_chapter_lead).
// Pure helpers are pinned by scripts/flock-shell.test.ts. Flock code only.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export type RosterBird = { name: string; species: string | null };
export type RosterMember = { user_id: string; display_name: string; photo_path: string | null; is_founder: boolean; is_lead: boolean; birds: RosterBird[] };

export function useChapterRoster(slug: string | null | undefined) {
  return useQuery({
    queryKey: ["flock", "roster", slug ?? ""] as const,
    enabled: !!slug,
    staleTime: 60_000,
    queryFn: async (): Promise<RosterMember[]> =>
      asArray<RosterMember>(must(await sb.rpc("flock_chapter_roster", { p_region_slug: slug }))).map((m) => ({ ...m, birds: asArray<RosterBird>(m.birds) })),
  });
}

export function useChapterLeadOf(userId: string) {
  return useQuery({
    queryKey: ["flock", "lead-of", userId] as const,
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<string | null> => (must(await sb.rpc("flock_chapter_lead_of", { p_user_id: userId })) as string | null) ?? null,
  });
}

export async function setChapterLead(userId: string, on: boolean): Promise<void> {
  must(await sb.rpc("admin_set_chapter_lead", { p_user_id: userId, p_on: on }));
}

export function useInvalidateMembers() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ["flock", "roster"] }),
    qc.invalidateQueries({ queryKey: ["flock", "lead-of"] }),
  ]);
}

// ---- Species groups for the chips -------------------------------------------------------

/** The group a species belongs to, for "Macaws", "Amazons", "Greys"…
 *  Unknown species keep their own name. */
export type SpeciesGroup = string;
const GROUPS: [RegExp, string][] = [
  [/macaw/i, "macaws"], [/amazon/i, "amazons"], [/cockatoo|galah|corella/i, "cockatoos"], [/\bgr[ae]y\b|congo|timneh/i, "greys"],
  [/cockatiel/i, "cockatiels"], [/conure/i, "conures"], [/budg|parakeet|ringneck/i, "parakeets"], [/lovebird/i, "lovebirds"],
  [/caique/i, "caiques"], [/eclectus/i, "eclectus"], [/parrotlet/i, "parrotlets"], [/pionus/i, "pionus"], [/lor(y|ie|ikeet)/i, "lories"],
  [/quaker|monk parakeet/i, "quakers"], [/senegal|meyer|jardine|poicephalus|red-bellied/i, "poicephalus"],
];
export function speciesGroup(species: string | null | undefined): SpeciesGroup | null {
  const s = (species ?? "").trim();
  if (!s) return null;
  // Quakers are "monk parakeets": check them before the general parakeet group.
  if (/quaker|monk parakeet/i.test(s)) return "quakers";
  for (const [re, g] of GROUPS) if (re.test(s)) return g;
  return s.toLowerCase();
}

/** The most common groups in a chapter, most first (ties by name), up to n. */
export function topGroups(members: RosterMember[], n = 4): SpeciesGroup[] {
  const counts = new Map<string, number>();
  for (const m of members) {
    const seen = new Set<string>();
    for (const b of m.birds) {
      const g = speciesGroup(b.species);
      if (g && !seen.has(g)) { seen.add(g); counts.set(g, (counts.get(g) ?? 0) + 1); }
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([g]) => g);
}

/** Search by name (the member's or a bird's) or species, and filter by group. */
export function filterRoster(members: RosterMember[], query: string, group: SpeciesGroup | null): RosterMember[] {
  const q = query.trim().toLowerCase();
  return members.filter((m) => {
    if (group && !m.birds.some((b) => speciesGroup(b.species) === group)) return false;
    if (!q) return true;
    return m.display_name.toLowerCase().includes(q)
      || m.birds.some((b) => b.name.toLowerCase().includes(q) || (b.species ?? "").toLowerCase().includes(q));
  });
}

/** "Mango, Blue and gold macaw" for one bird; "Echo and Kya" for two;
 *  "Echo, Kya, and Pip" for more. */
export function birdsLine(birds: RosterBird[], and = "and"): string {
  if (birds.length === 0) return "";
  if (birds.length === 1) return [birds[0].name, birds[0].species].filter(Boolean).join(", ");
  const names = birds.map((b) => b.name);
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, ${and} ${names[names.length - 1]}`;
}
