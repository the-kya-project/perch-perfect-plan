// Brittany's final badge art (Kya & Co. badge collection v1), served from
// public/badges/. Every badge has its own earned (color) and unearned (gray)
// file, and badges with levels have a design for each level. Two sizes, both
// resized from her 512px originals and otherwise unchanged:
//   - "lg": 192px, for the 64px circles (Badges screen, celebrations) at 3x.
//   - "sm": 64px, for the small pills on Flock profiles.
//
// No imports on purpose: care code (1.13b) can use the care half without
// pulling in anything from the Flock.

export type BadgeArtSize = "lg" | "sm";

const PX: Record<BadgeArtSize, number> = { lg: 192, sm: 64 };

function artPath(set: "flock" | "care", file: string, earned: boolean, size: BadgeArtSize): string {
  return `/badges/${set}/${earned ? "earned" : "unearned"}/${file}-${PX[size]}.png`;
}

/** The highest level in `levels` that `level` has reached; the first level
 *  when none is (an unearned badge shows its first level, in gray). */
export function artLevel(levels: readonly number[], level: number): number {
  let pick = levels[0];
  for (const n of levels) if (level >= n) pick = n;
  return pick;
}

// Flock badges (1.13a) ---------------------------------------------------------

/** Same ids as FLOCK_BADGES in src/lib/flockBadges.ts. */
type FlockBadgeId = "first_steps" | "journey_finisher" | "trick_star" | "good_neighbor" | "voice_of_the_flock" | "challenge_champ";

const FLOCK_FILES: Record<FlockBadgeId, string> = {
  first_steps: "first-steps",
  journey_finisher: "journey-finisher",
  trick_star: "trick-star",
  good_neighbor: "good-neighbor",
  voice_of_the_flock: "voice-of-the-flock",
  challenge_champ: "challenge-champ",
};

/** Journey finisher's art levels (FINISHER_LEVELS in flockBadges.ts). */
export const FLOCK_ART_LEVELS: Partial<Record<FlockBadgeId, readonly number[]>> = {
  journey_finisher: [1, 3, 10],
};

export function flockBadgeArt(badge: FlockBadgeId, level: number, size: BadgeArtSize = "lg"): string {
  const levels = FLOCK_ART_LEVELS[badge];
  const file = levels ? `${FLOCK_FILES[badge]}-${artLevel(levels, level)}` : FLOCK_FILES[badge];
  return artPath("flock", file, level > 0, size);
}

// Care badges (1.13b, not built yet) -------------------------------------------
// Stored now so 1.13b uses this art. Nothing imports it yet.

export type CareBadgeId = "steady_scale" | "daily_check_in" | "plan_ready" | "sitter_ready";

const CARE_FILES: Record<CareBadgeId, string> = {
  steady_scale: "steady-scale",
  daily_check_in: "daily-check-in",
  plan_ready: "plan-ready",
  sitter_ready: "sitter-ready",
};

/** Levels in weeks (Steady scale) and days (Daily check-in), from the spec. */
export const CARE_ART_LEVELS: Partial<Record<CareBadgeId, readonly number[]>> = {
  steady_scale: [4, 12, 52],
  daily_check_in: [7, 30],
};

const CARE_LEVEL_UNIT: Partial<Record<CareBadgeId, string>> = { steady_scale: "weeks", daily_check_in: "days" };

/** `level` is the weeks or days reached (0 = not earned); 1 for badges
 *  without levels. */
export function careBadgeArt(badge: CareBadgeId, level: number, size: BadgeArtSize = "lg"): string {
  const levels = CARE_ART_LEVELS[badge];
  const file = levels ? `${CARE_FILES[badge]}-${artLevel(levels, level)}-${CARE_LEVEL_UNIT[badge]}` : CARE_FILES[badge];
  return artPath("care", file, level > 0, size);
}
