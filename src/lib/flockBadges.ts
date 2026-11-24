// Flock badges (backlog 1.13a). Flock code only.
//
// The database decides what's earned (20261124013000_flock_badges.sql):
// flock_my_badges records anything new and returns the whole set, and
// flock_member_badges returns what a profile shows (hidden badges, blocks and
// "Just me" journeys already left out). This file holds the order, the words
// and which celebration to show.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

/** The Flock set, in the order the Badges screen shows them. */
export const FLOCK_BADGES = ["first_steps", "journey_finisher", "trick_star", "good_neighbor", "voice_of_the_flock", "challenge_champ"] as const;
export type FlockBadge = (typeof FLOCK_BADGES)[number];

/** Journey finisher's levels: how many finished journeys each one takes. */
export const FINISHER_LEVELS = [1, 3, 10] as const;

/** A badge as your own Badges screen gets it; level 0 = not earned yet. */
export type MyBadge = { badge: FlockBadge; level: number; earned_at: string | null; unseen: boolean; at_launch: boolean };
/** A badge a profile shows. */
export type ShownBadge = { badge: FlockBadge; level: number };

/** Rows from flock_my_badges, kept to known badges, every badge present and
 *  in screen order (a missing one counts as not earned). */
export function cleanMyBadges(rows: unknown): MyBadge[] {
  const list = Array.isArray(rows) ? rows : [];
  return FLOCK_BADGES.map((badge) => {
    const r = list.find((x) => x && (x as { badge?: unknown }).badge === badge) as Record<string, unknown> | undefined;
    const level = r && typeof r.level === "number" && r.level > 0 ? Math.trunc(r.level) : 0;
    return {
      badge,
      level,
      earned_at: level > 0 && typeof r?.earned_at === "string" ? r.earned_at : null,
      unseen: level > 0 && r?.unseen === true,
      at_launch: level > 0 && r?.at_launch === true,
    };
  });
}

/** Rows from flock_member_badges, kept to known, earned badges in order. */
export function cleanShownBadges(rows: unknown): ShownBadge[] {
  const list = Array.isArray(rows) ? rows : [];
  return FLOCK_BADGES.flatMap((badge) => {
    const r = list.find((x) => x && (x as { badge?: unknown }).badge === badge) as { level?: unknown } | undefined;
    return r && typeof r.level === "number" && r.level > 0 ? [{ badge, level: Math.trunc(r.level) }] : [];
  });
}

export function earnedCount(badges: MyBadge[]): number {
  return badges.filter((b) => b.level > 0).length;
}

/** What Today celebrates:
 *  - "launch": the first time badges were worked out found two or more from
 *    the member's history, so one "Here's what you've already earned".
 *  - "new": each badge or level earned since, one card each.
 *  Nothing when everything has been seen. */
export type BadgeCelebration = { kind: "launch"; badges: MyBadge[] } | { kind: "new"; badges: MyBadge[] } | null;

export function celebrationFor(badges: MyBadge[]): BadgeCelebration {
  const unseen = badges.filter((b) => b.level > 0 && b.unseen);
  if (unseen.length === 0) return null;
  const launch = unseen.filter((b) => b.at_launch);
  if (launch.length >= 2) return { kind: "launch", badges: launch };
  return { kind: "new", badges: unseen };
}

/** The next Journey finisher level, or null at the top (or for other badges). */
export function nextLevel(badge: FlockBadge, level: number): number | null {
  if (badge !== "journey_finisher") return null;
  return FINISHER_LEVELS.find((n) => n > level) ?? null;
}

// Words ------------------------------------------------------------------------

export function badgeName(t: TFunction, badge: FlockBadge): string {
  switch (badge) {
    case "first_steps": return t("flock.badges.name.firstSteps", "First steps");
    case "journey_finisher": return t("flock.badges.name.journeyFinisher", "Journey finisher");
    case "trick_star": return t("flock.badges.name.trickStar", "Trick star");
    case "good_neighbor": return t("flock.badges.name.goodNeighbor", "Good neighbor");
    case "voice_of_the_flock": return t("flock.badges.name.voice", "Voice of the Flock");
    case "challenge_champ": return t("flock.badges.name.challengeChamp", "Challenge champ");
  }
}

/** "3 journeys" under Journey finisher; nothing for badges without levels. */
export function levelLabel(t: TFunction, badge: FlockBadge, level: number): string | null {
  if (badge !== "journey_finisher" || level < 1) return null;
  return level === 1 ? t("flock.badges.oneJourney", "1 journey") : t("flock.badges.journeysN", "{{n}} journeys", { n: level });
}

/** The badge's name with its level: "Journey finisher · 3 journeys". */
export function badgeTitle(t: TFunction, badge: FlockBadge, level: number): string {
  const l = levelLabel(t, badge, level);
  return l ? `${badgeName(t, badge)} · ${l}` : badgeName(t, badge);
}

/** How to earn it, for the Badges screen. */
export function howToEarn(t: TFunction, badge: FlockBadge): string {
  switch (badge) {
    case "first_steps": return t("flock.badges.how.firstSteps", "First steps: finish your Flock profile and join your chapter.");
    case "journey_finisher": return t("flock.badges.how.journeyFinisher", "Journey finisher: finish a journey. There are levels at 3 and 10 finished journeys.");
    case "trick_star": return t("flock.badges.how.trickStar", "Trick star: finish any tricks journey.");
    case "good_neighbor": return t("flock.badges.how.goodNeighbor", "Good neighbor: have a Do good post approved, or a place you suggested added to your chapter.");
    case "voice_of_the_flock": return t("flock.badges.how.voice", "Voice of the Flock: vote in a Do good vote.");
    case "challenge_champ": return t("flock.badges.how.challengeChamp", "Challenge champ: complete a Flock challenge.");
  }
}

/** What you did, for the "Badge earned" card. */
export function earnedLine(t: TFunction, badge: FlockBadge, level: number): string {
  switch (badge) {
    case "first_steps": return t("flock.badges.earned.firstSteps", "You finished your Flock profile and joined your chapter.");
    case "journey_finisher":
      return level > 1
        ? t("flock.badges.earned.journeysMany", "You've finished {{n}} journeys.", { n: level })
        : t("flock.badges.earned.journeyFirst", "You finished your first journey.");
    case "trick_star": return t("flock.badges.earned.trickStar", "You finished a tricks journey.");
    case "good_neighbor": return t("flock.badges.earned.goodNeighbor", "Something you shared to help other birds was approved.");
    case "voice_of_the_flock": return t("flock.badges.earned.voice", "You voted in a Do good vote.");
    case "challenge_champ": return t("flock.badges.earned.challengeChamp", "You completed a challenge.");
  }
}

// Data -------------------------------------------------------------------------

export const badgeKeys = {
  mine: ["flock", "badges", "mine"] as const,
  shown: ["flock", "badges", "shown"] as const,
  member: (userId: string) => ["flock", "badges", "member", userId] as const,
};

/** Your badges. Asking also records anything newly earned. */
export function useMyBadges() {
  return useQuery({
    queryKey: badgeKeys.mine,
    staleTime: 30_000,
    queryFn: async (): Promise<MyBadge[]> => cleanMyBadges(must(await sb.rpc("flock_my_badges"))),
  });
}

export function useMemberBadges(userId: string) {
  return useQuery({
    queryKey: badgeKeys.member(userId),
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async (): Promise<ShownBadge[]> => cleanShownBadges(must(await sb.rpc("flock_member_badges", { p_user_id: userId }))),
  });
}

/** "Show my badges on my profile" (true unless you've turned it off). */
export function useBadgesShown() {
  return useQuery({
    queryKey: badgeKeys.shown,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean> => must(await sb.rpc("flock_badges_shown")) !== false,
  });
}

export async function setBadgesShown(shown: boolean): Promise<boolean> {
  return must(await sb.rpc("flock_set_badges_shown", { p_shown: shown })) !== false;
}

/** Mark these badges' celebration seen (none given: all of them). */
export async function markBadgesSeen(badges?: FlockBadge[]): Promise<void> {
  must(await sb.rpc("flock_badges_seen", { p_badges: badges && badges.length > 0 ? badges : null }));
}

export function useInvalidateBadges() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["flock", "badges"] });
}
