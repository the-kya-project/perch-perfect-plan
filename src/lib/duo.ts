import { useSyncExternalStore } from "react";
import { getNativeDuo, subscribeNativeDuo, type NativeDuoState } from "@/lib/duoNative";

/**
 * The side-column layout: the app's navigation in a column on one edge
 * instead of the bottom tab bar (iPhone Duo; Apple's guidance), and two panes
 * split at the screen's center when there's room.
 *
 * In Safari, the PWA, and native builds before 1.2, it goes by the space
 * available, not the device. The column shows when the screen is:
 *   - landscape;
 *   - wide enough for two usable panes split at the center: the right pane
 *     loses the 104px column, so 50vw − 104px ≥ 320px → at least 848px wide;
 *   - tall enough for two scrolling panes (500px). Phones held sideways are at
 *     most ~440px tall, so no regular iPhone ever gets the column;
 *   - touch first (no hover, coarse pointer), so desktop windows keep today's
 *     layout however they're sized.
 * That can't tell the Duo's folded cover screen from an iPhone held upright,
 * so the cover screen keeps the iPhone layout there.
 *
 * In the iOS app from 1.2, the native DuoBridge plugin (lib/duoNative.ts)
 * reports UIKit's vertical bar edge, which is how the cover screen gets the
 * column. See resolveDuoLayout.
 */
export const DUO_SIDEWAYS_QUERY =
  "(orientation: landscape) and (min-width: 848px) and (min-height: 500px) and (hover: none) and (pointer: coarse)";

export type DuoLayout = {
  /** Which edge the side column sits on, or null for the bottom tab bar. */
  rail: "left" | "right" | null;
  /** Two panes split at the center (Home, bird page, weight, health check). */
  split: boolean;
};

const NONE: DuoLayout = { rail: null, split: false };

/**
 * The layout from what the native app reports (null where there's no
 * plugin) and whether the space rule above matches.
 *
 *   - The system names a vertical bar edge (the cover screen, the inner screen
 *     held sideways): the column goes on that edge, and splits when there's
 *     room for two panes.
 *   - A foldable with no edge (the inner screen upright): bottom bar, as Apple
 *     intends.
 *   - No hinge (every other iPhone and iPad, and anywhere without the plugin):
 *     today's space rule, unchanged.
 */
export function resolveDuoLayout(native: NativeDuoState | null, roomForTwoPanes: boolean): DuoLayout {
  if (native?.verticalBarEdge) return { rail: native.verticalBarEdge, split: roomForTwoPanes };
  if (native?.hingeStatus) return NONE;
  return roomForTwoPanes ? { rail: "right", split: true } : NONE;
}

function readRoom(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(DUO_SIDEWAYS_QUERY).matches;
}

function subscribeRoom(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const list = window.matchMedia(DUO_SIDEWAYS_QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

// One snapshot per distinct layout, so useSyncExternalStore sees stable values.
const SNAPSHOTS = new Map<string, DuoLayout>();
function snapshot(l: DuoLayout): DuoLayout {
  const key = `${l.rail}|${l.split}`;
  if (!SNAPSHOTS.has(key)) SNAPSHOTS.set(key, l);
  return SNAPSHOTS.get(key)!;
}

function subscribe(onChange: () => void): () => void {
  const a = subscribeRoom(onChange);
  const b = subscribeNativeDuo(onChange);
  return () => { a(); b(); };
}

/** The side-column layout here. No column on the server and during
 *  hydration, so the first render always matches. */
export function useDuoLayout(): DuoLayout {
  return useSyncExternalStore(subscribe, () => snapshot(resolveDuoLayout(getNativeDuo(), readRoom())), () => NONE);
}

export type DuoMode = "sideways" | null;

/** "sideways" when the two-pane layouts apply, else null. */
export function useDuoMode(): DuoMode {
  return useDuoLayout().split ? "sideways" : null;
}
