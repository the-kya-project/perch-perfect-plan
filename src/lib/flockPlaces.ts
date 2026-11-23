// Chapter collections (backlog 1.6): the chapter's Resources tab. Data and the
// pure helpers scripts/flock-shell.test.ts pins. Reads and writes go through
// database functions (20261123140000_flock_chapter_places.sql). Flock code only.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** The three groups, in the order the tab shows them. */
export const PLACE_KINDS = ["vet", "rescue", "shop"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export type Place = {
  place_id: string; region_slug: string; kind: PlaceKind; name: string; area: string | null; phone: string | null;
  website: string | null; note: string | null; position: number; updated_at: string;
};
export type PlaceRules = { region_slug: string | null; region_name: string | null; can_manage: boolean; pending: number; is_lead: boolean };
export type PlaceSuggestion = {
  place_id: string; region_slug: string; region_name: string | null; kind: PlaceKind; name: string; area: string | null;
  note: string | null; suggested_by_name: string | null; created_at: string;
};
export type PlaceDraft = { id: string | null; region: string; kind: PlaceKind; name: string; area: string; phone: string; website: string; note: string };

/** Field limits, the same as the table's checks. */
export const PLACE_LIMITS = { name: 120, area: 120, phone: 40, website: 500, note: 300 } as const;

export const placeKeys = {
  list: (region: string | null) => ["flock", "places", "list", region ?? "mine"] as const,
  rules: (region: string | null) => ["flock", "places", "rules", region ?? "mine"] as const,
  suggestions: ["flock", "review", "places"] as const,
};

/** A chapter's live listings: your own (region null), or one you manage. */
export function useChapterPlaces(region: string | null = null, enabled = true) {
  return useQuery({
    queryKey: placeKeys.list(region),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Place[]> => asArray<Place>(must(await sb.rpc("flock_chapter_places", { p_region: region }))),
  });
}

export function usePlaceRules(region: string | null = null, enabled = true) {
  return useQuery({
    queryKey: placeKeys.rules(region),
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<PlaceRules | null> => asArray<PlaceRules>(must(await sb.rpc("flock_place_rules", { p_region: region })))[0] ?? null,
  });
}

/** Suggestions waiting for the caller (admins: every chapter; a lead: their own). */
export function usePlaceSuggestions(enabled: boolean) {
  return useQuery({
    queryKey: placeKeys.suggestions,
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<PlaceSuggestion[]> => asArray<PlaceSuggestion>(must(await sb.rpc("flock_place_suggestions"))),
  });
}

export async function suggestPlace(kind: PlaceKind, name: string, area: string, note: string): Promise<string> {
  return must(await sb.rpc("flock_place_suggest", { p_kind: kind, p_name: name.trim(), p_area: area.trim() || null, p_note: note.trim() || null }));
}

export async function savePlace(d: PlaceDraft): Promise<string> {
  return must(await sb.rpc("flock_place_save", {
    p_id: d.id, p_region: d.region, p_kind: d.kind, p_name: d.name.trim(), p_area: d.area.trim() || null,
    p_phone: d.phone.trim() || null, p_website: d.website.trim() || null, p_note: d.note.trim() || null,
  }));
}

export async function movePlace(id: string, direction: -1 | 1): Promise<void> {
  must(await sb.rpc("flock_place_move", { p_id: id, p_direction: direction }));
}

export async function removePlace(id: string): Promise<void> {
  must(await sb.rpc("flock_place_remove", { p_id: id }));
}

export async function reviewPlace(id: string, decision: "approve" | "decline"): Promise<void> {
  must(await sb.rpc("flock_place_review", { p_id: id, p_decision: decision }));
}

export function useInvalidatePlaces() {
  const qc = useQueryClient();
  return () => Promise.all([
    qc.invalidateQueries({ queryKey: ["flock", "places"] }),
    qc.invalidateQueries({ queryKey: ["flock", "review"] }),
  ]);
}

// ---- Pure helpers -----------------------------------------------------------------------

/** Listings grouped Avian vets, Rescues, Shops and services, every group
 *  present (an empty one invites a suggestion), each in the managers' order. */
export function groupPlaces(places: Place[]): { kind: PlaceKind; places: Place[] }[] {
  return PLACE_KINDS.map((kind) => ({
    kind,
    places: places.filter((p) => p.kind === kind).sort((a, b) => a.position - b.position),
  }));
}

/** A tel: link: digits and a leading +, or null when there's nothing to dial. */
export function telHref(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 3) return null;
  return `tel:${raw.startsWith("+") ? "+" : ""}${digits}`;
}

/** A website link the browser can open: http(s) only, https:// added to a
 *  bare address ("example.com"); null for anything else. */
export function websiteHref(url: string | null | undefined): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : /^[a-z][a-z\d+.-]*:/i.test(raw) ? null : `https://${raw}`;
  if (!withScheme) return null;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

/** "Updated Nov 22" (this year) or "Updated Nov 22, 2025". */
export function updatedDay(iso: string, lang: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(lang, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
