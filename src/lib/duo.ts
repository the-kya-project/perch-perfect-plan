import { useSyncExternalStore } from "react";

/**
 * iPhone Duo layouts (web only; no fold or hinge detection — that needs the
 * native app). Apple's guidance for the foldable: on the folded cover screen,
 * and on the unfolded screen held sideways, navigation moves to a column on
 * the edge where the status bar and camera sit. Unfolded and upright keeps the
 * bottom tab bar.
 *
 *   "sideways" — unfolded, held sideways (951×669 points). Landscape, at least
 *                700px wide, and tall enough that no current iPhone held
 *                sideways matches (those are at most ~440px tall); capped below
 *                iPad sizes, touch only so a small desktop window never does.
 *   "cover"    — the folded cover screen (382×837 points, portrait). No other
 *                iPhone is 380–384px wide.
 *
 * Everything else (every current iPhone, the Duo unfolded upright, iPad,
 * desktop) matches neither and keeps today's layout.
 */
export const DUO_SIDEWAYS_QUERY =
  "(orientation: landscape) and (min-width: 700px) and (max-width: 1000px) and (min-height: 600px) and (max-height: 720px) and (hover: none) and (pointer: coarse)";
export const DUO_COVER_QUERY =
  "(orientation: portrait) and (min-width: 380px) and (max-width: 384px) and (min-aspect-ratio: 2/5) and (max-aspect-ratio: 1/2) and (hover: none) and (pointer: coarse)";

export type DuoMode = "sideways" | "cover" | null;

function read(): DuoMode {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  if (window.matchMedia(DUO_SIDEWAYS_QUERY).matches) return "sideways";
  if (window.matchMedia(DUO_COVER_QUERY).matches) return "cover";
  return null;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const lists = [window.matchMedia(DUO_SIDEWAYS_QUERY), window.matchMedia(DUO_COVER_QUERY)];
  lists.forEach((l) => l.addEventListener("change", onChange));
  return () => lists.forEach((l) => l.removeEventListener("change", onChange));
}

/** The Duo layout this screen is in, or null for today's layout. Null on the
 *  server and during hydration, so the first render always matches. */
export function useDuoMode(): DuoMode {
  return useSyncExternalStore(subscribe, read, () => null);
}
