// Care badges (backlog 1.13b), earned by everyone in the care app, behind the
// `care_badges` switch (src/lib/careFeatures.ts; starts off).
//
// The database decides what's earned (20261128160000_care_badges.sql):
// care_my_badges(bird, plan_ready) records anything new for the caller and
// returns all four for that bird. Plan ready is the one rule the app works out
// (the bird page's "Ready" tag, useCarePlanStatus) and passes in. This file
// holds the order, the words and which celebration to show.
//
// No Flock imports: free users load this, and the Flock stays out of their
// bundle (CLAUDE.md, "Flock safety rules").
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { CARE_ART_LEVELS, type CareBadgeId } from "@/lib/badgeArt";
import { useCareFeature } from "@/lib/careFeatures";

const sb = supabase as any;

/** The care set, in the order the Badges screen shows them. */
export const CARE_BADGES = ["steady_scale", "daily_check_in", "plan_ready", "sitter_ready"] as const satisfies readonly CareBadgeId[];
export type CareBadge = (typeof CARE_BADGES)[number];

/** Levels: weeks in a row (Steady scale) and days in a row (Daily check-in).
 *  The same numbers as the art and private.care_badge_levels. */
export const STEADY_SCALE_WEEKS = CARE_ART_LEVELS.steady_scale!;
export const DAILY_CHECK_IN_DAYS = CARE_ART_LEVELS.daily_check_in!;

/** A badge as the bird's Badges screen gets it; level 0 = not earned yet. */
export type MyCareBadge = { badge: CareBadge; level: number; earned_at: string | null; unseen: boolean; at_launch: boolean };

/** Rows from care_my_badges, kept to known badges, every badge present and in
 *  screen order (a missing one counts as not earned). */
export function cleanCareBadges(rows: unknown): MyCareBadge[] {
  const list = Array.isArray(rows) ? rows : [];
  return CARE_BADGES.map((badge) => {
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

export function careEarnedCount(badges: MyCareBadge[]): number {
  return badges.filter((b) => b.level > 0).length;
}

/** What the bird page celebrates:
 *  - "launch": badges from the bird's history, worked out the first time, two
 *    or more of them, so one "Here's what you've already earned".
 *  - "new": each badge or level earned since, one card each.
 *  Nothing when everything has been seen. */
export type CareBadgeCelebration = { kind: "launch"; badges: MyCareBadge[] } | { kind: "new"; badges: MyCareBadge[] } | null;

export function careCelebrationFor(badges: MyCareBadge[]): CareBadgeCelebration {
  const unseen = badges.filter((b) => b.level > 0 && b.unseen);
  if (unseen.length === 0) return null;
  const launch = unseen.filter((b) => b.at_launch);
  if (launch.length >= 2) return { kind: "launch", badges: launch };
  return { kind: "new", badges: unseen };
}

/** The next level up, or null at the top (or for badges without levels). */
export function careNextLevel(badge: CareBadge, level: number): number | null {
  const levels = CARE_ART_LEVELS[badge];
  if (!levels) return null;
  return levels.find((n) => n > level) ?? null;
}

/** What the bird page passes as Plan ready: undefined until the plan's status
 *  has loaded (so nothing is asked twice for no reason), then whether every
 *  section is ready. */
export function planReadyFor(status: { loaded: boolean; todo: readonly unknown[] }, setupComplete: boolean | null | undefined): boolean | undefined {
  if (!status.loaded) return undefined;
  return !!setupComplete && status.todo.length === 0;
}

// Words ------------------------------------------------------------------------

export function careBadgeName(t: TFunction, badge: CareBadge): string {
  switch (badge) {
    case "steady_scale": return t("careBadges.name.steadyScale", "Steady scale");
    case "daily_check_in": return t("careBadges.name.dailyCheckIn", "Daily check-in");
    case "plan_ready": return t("careBadges.name.planReady", "Plan ready");
    case "sitter_ready": return t("careBadges.name.sitterReady", "Sitter ready");
  }
}

/** "12 weeks" under Steady scale, "30 days" under Daily check-in; nothing for
 *  badges without levels or not earned yet. */
export function careLevelLabel(t: TFunction, badge: CareBadge, level: number): string | null {
  if (level < 1) return null;
  if (badge === "steady_scale") return t("careBadges.weeksN", "{{n}} weeks", { n: level });
  if (badge === "daily_check_in") return t("careBadges.daysN", "{{n}} days", { n: level });
  return null;
}

/** The badge's name with its level: "Steady scale · 12 weeks". */
export function careBadgeTitle(t: TFunction, badge: CareBadge, level: number): string {
  const l = careLevelLabel(t, badge, level);
  return l ? `${careBadgeName(t, badge)} · ${l}` : careBadgeName(t, badge);
}

/** How to earn it, for the Badges screen. */
export function careHowToEarn(t: TFunction, badge: CareBadge, name: string): string {
  switch (badge) {
    case "steady_scale": return t("careBadges.how.steadyScale", "Steady scale: weigh {{name}} at least once a week, 4 weeks in a row. There are levels at 12 and 52 weeks.", { name });
    case "daily_check_in": return t("careBadges.how.dailyCheckIn", "Daily check-in: do {{name}}'s daily health check 7 days in a row. There's a level at 30 days.", { name });
    case "plan_ready": return t("careBadges.how.planReady", "Plan ready: finish every section of {{name}}'s care plan.", { name });
    case "sitter_ready": return t("careBadges.how.sitterReady", "Sitter ready: send a pet sitter link for {{name}}.", { name });
  }
}

/** What you did, for the "Badge earned" card. */
export function careEarnedLine(t: TFunction, badge: CareBadge, level: number, name: string): string {
  switch (badge) {
    case "steady_scale": return t("careBadges.earned.steadyScale", "You've weighed {{name}} {{n}} weeks in a row.", { name, n: level });
    case "daily_check_in": return t("careBadges.earned.dailyCheckIn", "You've checked on {{name}} {{n}} days in a row.", { name, n: level });
    case "plan_ready": return t("careBadges.earned.planReady", "{{name}}'s care plan is ready for anyone who looks after {{name}}.", { name });
    case "sitter_ready": return t("careBadges.earned.sitterReady", "You sent a pet sitter link for {{name}}.", { name });
  }
}

// Data -------------------------------------------------------------------------

export const careBadgeKeys = {
  all: ["care-badges"] as const,
  bird: (birdId: string, planReady: boolean | undefined) => ["care-badges", birdId, planReady ?? null] as const,
};

/** The bird's badges for you, while the switch is on for you (undefined
 *  otherwise, and nothing is asked). Asking also records anything newly earned.
 *  Fails closed: an error (or a database without the migration yet) shows no
 *  badges. */
export function useCareBadges(birdId: string, planReady: boolean | undefined) {
  const on = useCareFeature("care_badges");
  return useQuery({
    queryKey: careBadgeKeys.bird(birdId, planReady),
    enabled: on === true && !!birdId && planReady !== undefined,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<MyCareBadge[] | null> => {
      const { data, error } = await sb.rpc("care_my_badges", { p_bird_id: birdId, p_plan_ready: planReady === true });
      if (error) return null;
      const list = cleanCareBadges(data);
      // No rows at all: the switch went off between the two calls.
      return Array.isArray(data) && data.length > 0 ? list : null;
    },
  });
}

/** Mark these badges' celebration seen for the bird (none given: all of them). */
export async function markCareBadgesSeen(birdId: string, badges?: CareBadge[]): Promise<void> {
  const { error } = await sb.rpc("care_badges_seen", { p_bird_id: birdId, p_badges: badges && badges.length > 0 ? badges : null });
  if (error) throw error;
}

export function useInvalidateCareBadges() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: careBadgeKeys.all });
}
