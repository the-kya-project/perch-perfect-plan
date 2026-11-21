// Community (Flock) data: profiles, chapters, shown birds. Flock code only;
// every call here runs inside /flock, which the route guard keeps to admins
// (and members once it opens). The database decides what anyone may see:
// other members' details come only through the flock_* functions
// (20261107180000_flock_profiles.sql), which return just the public fields.
//
// The new tables and functions postdate the generated types, hence `sb`.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { getFlockBirdPhotos } from "@/lib/flockMedia.functions";
import type { EntitlementRow } from "@/lib/flockProfile";

const sb = supabase as any;
const STALE = 60_000;

/** A photo to show: a resized display URL and the full-size original to try
 *  if it fails, or a plain URL. */
export type FlockPhotoSrc = { url: string; original?: string | null } | string | null | undefined;
export type Region = { slug: string; name: string; states: string[]; sort_order: number };
export type MyProfile = {
  user_id: string;
  display_name: string;
  region_slug: string;
  bio: string | null;
  photo_path: string | null;
  setup_completed_at: string | null;
} | null;
export type MySetup = { suggested_region: string | null; founding_spot: number | null; setup_completed_at: string | null };
export type CareName = { first_name: string | null; full_name: string | null };
export type OwnBird = { id: string; name: string; species: string | null; photo_url: string | null };
export type VisibleBird = { bird_id: string; owner_id: string; name: string; species: string | null; has_photo: boolean };
export type MemberProfile = {
  user_id: string; display_name: string; region_slug: string; region_name: string; region_states: string[];
  bio: string | null; photo_path: string | null; is_founder: boolean;
};
export type Chapter = { region_slug: string; name: string; states: string[]; member_count: number };
export type ChapterMember = { user_id: string; display_name: string; photo_path: string | null; is_founder: boolean; bird_names: string[] };

export const flockKeys = {
  me: ["flock", "me"] as const,
  setup: ["flock", "setup"] as const,
  profile: ["flock", "profile"] as const,
  regions: ["flock", "regions"] as const,
  ownBirds: ["flock", "own-birds"] as const,
  shown: ["flock", "shown"] as const,
  entitlements: ["flock", "entitlements"] as const,
  chapter: (slug: string) => ["flock", "chapter", slug] as const,
  members: (slug: string) => ["flock", "members", slug] as const,
  member: (id: string) => ["flock", "member", id] as const,
  visibleBirds: (key: string) => ["flock", "visible-birds", key] as const,
  avatars: (paths: string) => ["flock", "avatars", paths] as const,
  birdPhotos: (ids: string) => ["flock", "bird-photos", ids] as const,
};

async function myId(): Promise<string> {
  const { data } = await getLocalUser();
  if (!data.user) throw new Error("You're signed out.");
  return data.user.id;
}

function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export function useMyId() {
  return useQuery({ queryKey: flockKeys.me, queryFn: myId, staleTime: Infinity });
}

/** Prefills for welcome and setup, and whether setup is done. */
export function useMySetup() {
  return useQuery({
    queryKey: flockKeys.setup,
    staleTime: STALE,
    queryFn: async (): Promise<MySetup> => {
      const rows = must(await sb.rpc("flock_my_setup")) as MySetup[];
      return rows[0] ?? { suggested_region: null, founding_spot: null, setup_completed_at: null };
    },
  });
}

export function useMyProfile() {
  return useQuery({
    queryKey: flockKeys.profile,
    staleTime: STALE,
    queryFn: async (): Promise<MyProfile> => {
      const id = await myId();
      return must(await sb.from("flock_profiles")
        .select("user_id, display_name, region_slug, bio, photo_path, setup_completed_at")
        .eq("user_id", id).maybeSingle()) as MyProfile;
    },
  });
}

/** The care profile's names (your own row), for the default display name and greeting. */
export function useCareName() {
  return useQuery({
    queryKey: ["flock", "care-name"],
    staleTime: Infinity,
    queryFn: async (): Promise<CareName> => {
      const id = await myId();
      const row = must(await sb.from("profiles").select("first_name, full_name").eq("id", id).maybeSingle()) as CareName | null;
      return row ?? { first_name: null, full_name: null };
    },
  });
}

export function useRegions() {
  return useQuery({
    queryKey: flockKeys.regions,
    staleTime: Infinity,
    queryFn: async (): Promise<Region[]> =>
      must(await sb.from("regions").select("slug, name, states, sort_order").order("sort_order")) as Region[],
  });
}

/** Your own birds that could be shown: owned by you, not passed. */
export function useOwnBirds() {
  return useQuery({
    queryKey: flockKeys.ownBirds,
    staleTime: STALE,
    queryFn: async (): Promise<OwnBird[]> => {
      const id = await myId();
      return must(await sb.from("birds").select("id, name, species, photo_url")
        .eq("owner_id", id).is("passed_at", null).order("name")) as OwnBird[];
    },
  });
}

/** Your choices: bird id → shown. Birds never chosen aren't in the map. */
export function useShownChoices() {
  return useQuery({
    queryKey: flockKeys.shown,
    staleTime: STALE,
    queryFn: async (): Promise<Map<string, boolean>> => {
      const rows = must(await sb.from("flock_shown_birds").select("bird_id, shown")) as { bird_id: string; shown: boolean }[];
      return new Map(rows.map((r) => [r.bird_id, r.shown]));
    },
  });
}

export function useMyEntitlements() {
  return useQuery({
    queryKey: flockKeys.entitlements,
    staleTime: STALE,
    queryFn: async (): Promise<EntitlementRow[]> =>
      must(await sb.from("entitlements").select("plan, status, source, starts_at, current_period_end, free_until")) as EntitlementRow[],
  });
}

/** Admins see "Admin access" when they have no membership of their own. */
export function useIsAdmin() {
  return useQuery({
    queryKey: ["flock", "is-admin"],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin");
      return !error && data === true;
    },
  });
}

export function useChapter(slug: string | null | undefined) {
  return useQuery({
    queryKey: flockKeys.chapter(slug ?? ""),
    enabled: !!slug,
    staleTime: STALE,
    queryFn: async (): Promise<Chapter | null> => ((must(await sb.rpc("flock_chapter", { p_region_slug: slug })) as Chapter[])[0] ?? null),
  });
}

export function useChapterMembers(slug: string | null | undefined) {
  return useQuery({
    queryKey: flockKeys.members(slug ?? ""),
    enabled: !!slug,
    staleTime: STALE,
    queryFn: async (): Promise<ChapterMember[]> => must(await sb.rpc("flock_chapter_members", { p_region_slug: slug })) as ChapterMember[],
  });
}

export function useMemberProfile(userId: string) {
  return useQuery({
    queryKey: flockKeys.member(userId),
    enabled: !!userId,
    staleTime: STALE,
    queryFn: async (): Promise<MemberProfile | null> =>
      ((must(await sb.rpc("flock_member_profile", { p_user_id: userId })) as MemberProfile[])[0] ?? null),
  });
}

export function useVisibleBirds(opts: { ownerIds?: string[]; birdIds?: string[] }) {
  const key = JSON.stringify(opts);
  return useQuery({
    queryKey: flockKeys.visibleBirds(key),
    staleTime: STALE,
    queryFn: async (): Promise<VisibleBird[]> =>
      must(await sb.rpc("flock_visible_birds", { p_owner_ids: opts.ownerIds ?? null, p_bird_ids: opts.birdIds ?? null })) as VisibleBird[],
  });
}

/** Signed URLs for profile photos (Flock members can read the bucket). */
export function useAvatarUrls(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: flockKeys.avatars(list.join("|")),
    enabled: list.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.storage.from("flock-avatars").createSignedUrls(list, 3600);
      if (error) throw error;
      return new Map((data ?? []).filter((d) => d.signedUrl && d.path).map((d) => [d.path as string, d.signedUrl as string]));
    },
  });
}

/** Photos of other members' shown birds, signed on the server, resized to
 *  `width` (with the full-size original as a fallback). */
export function useBirdPhotoUrls(birdIds: string[], width: number) {
  const list = [...new Set(birdIds)].sort();
  return useQuery({
    queryKey: flockKeys.birdPhotos(`${width}:${list.join("|")}`),
    enabled: list.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Record<string, FlockPhotoSrc>> => getFlockBirdPhotos({ data: { birdIds: list, width } }),
  });
}

/** Your own birds' photos, through the care app's own resized-photo cache
 *  (useBirdPhotos: a small transformed image, the original as a fallback).
 *  Its key sits outside "flock", so a Community save doesn't re-sign them and
 *  restart every photo. Keyed by bird id. */
export function useOwnBirdPhotoUrls(birds: OwnBird[] | undefined, width: number): { data: Record<string, FlockPhotoSrc> } {
  const photoFor = useBirdPhotos((birds ?? []).map((b) => b.photo_url), width);
  const data: Record<string, FlockPhotoSrc> = {};
  for (const b of birds ?? []) data[b.id] = photoFor(b.photo_url);
  return { data };
}

/** Save your profile (insert or update) and your shown-bird choices. */
export async function saveFlockProfile(input: {
  display_name: string;
  region_slug: string;
  bio?: string | null;
  photo_path?: string | null;
  completeSetup?: boolean;
  shown?: Map<string, boolean>;
}): Promise<void> {
  const id = await myId();
  const row: Record<string, unknown> = { user_id: id, display_name: input.display_name.trim().slice(0, 50), region_slug: input.region_slug };
  if (input.bio !== undefined) row.bio = input.bio?.trim() ? input.bio.trim().slice(0, 280) : null;
  if (input.photo_path !== undefined) row.photo_path = input.photo_path;
  if (input.completeSetup) row.setup_completed_at = new Date().toISOString();
  must(await sb.from("flock_profiles").upsert(row, { onConflict: "user_id" }));
  if (input.shown && input.shown.size > 0) {
    const rows = [...input.shown].map(([bird_id, shown]) => ({ bird_id, user_id: id, shown }));
    must(await sb.from("flock_shown_birds").upsert(rows, { onConflict: "bird_id" }));
  }
}

/** After a save: everything that shows profile data reloads. */
export function useInvalidateFlock() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["flock"] });
}
