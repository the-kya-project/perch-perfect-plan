import type { TFunction } from "i18next";
import { ageLabel } from "@/components/BirdPickers";
import { ageFromBirthDate } from "@/lib/parrot-data";

// One source for a bird's age, used by every screen that shows it. A saved
// hatch date wins, so the age keeps up with each birthday and always agrees
// with the hatch-day card on Moments; without one, the age the owner picked.
export function birdAge(bird: { age?: string | null; birth_date?: string | null } | null | undefined): string | null {
  if (!bird) return null;
  return ageFromBirthDate(bird.birth_date) ?? (bird.age?.trim() || null);
}

/** The age as display text ("10 years"), or null when unknown. */
export function birdAgeLabel(t: TFunction, bird: { age?: string | null; birth_date?: string | null } | null | undefined): string | null {
  const a = birdAge(bird);
  return a ? ageLabel(t, a) : null;
}
