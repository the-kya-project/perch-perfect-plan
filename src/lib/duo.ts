import { useSyncExternalStore } from "react";

/**
 * The side-column layout (iPhone Duo unfolded and sideways, and any screen
 * like it). Following Apple's guidance, this adapts to the space available
 * rather than detecting a device or its screen size.
 *
 * The column shows when the screen is:
 *   - landscape;
 *   - wide enough for two usable panes split at the center: the right pane
 *     loses the 104px column, so 50vw − 104px ≥ 320px → at least 848px wide;
 *   - tall enough for two scrolling panes (500px). Phones held sideways are at
 *     most ~440px tall, so no regular iPhone ever gets the column;
 *   - touch first (no hover, coarse pointer), so desktop windows keep today's
 *     layout however they're sized.
 *
 * The folded cover screen gets the same layout as a regular iPhone for now:
 * the web app can't tell it apart from an iPhone held upright. It switches to
 * the side column in version 1.2, once the native app reports which screen
 * it's on.
 */
export const DUO_SIDEWAYS_QUERY =
  "(orientation: landscape) and (min-width: 848px) and (min-height: 500px) and (hover: none) and (pointer: coarse)";

export type DuoMode = "sideways" | null;

function read(): DuoMode {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return window.matchMedia(DUO_SIDEWAYS_QUERY).matches ? "sideways" : null;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const list = window.matchMedia(DUO_SIDEWAYS_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** "sideways" when the side-column layout applies, else null (today's
 *  layout). Null on the server and during hydration, so the first render
 *  always matches. */
export function useDuoMode(): DuoMode {
  return useSyncExternalStore(subscribe, read, () => null);
}
