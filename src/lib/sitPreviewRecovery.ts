/**
 * What the owner's sitter preview does about a frame that hasn't started.
 *
 * The preview (routes/_authenticated/sit-preview.$sitId.tsx) shows the real
 * sitter view in a frame, and the frame always loads the live build. An app
 * left open across a release is still an older build with an older service
 * worker in charge, and on Nov 1, 2026 the frame never started in that state:
 * "Something's taking too long" until the owner closed and reopened the app.
 * The preview now moves onto a waiting build before it opens, and if the frame
 * still hasn't started shortly before the frame's own 10-second check
 * (STARTUP_GUARD in __root.tsx) would give up, it steps in once.
 *
 * Pinned by `npm run test:sit-preview-recovery`.
 */

/** How long the frame may take to start before the preview steps in. Under
 *  the frame's own 10-second startup check, so the owner never sees it. */
export const FRAME_START_MS = 7_000;

export type FrameState = {
  /** The page in the frame has finished starting (its window.__kyaReady). */
  started: boolean;
  /** Since the frame was (re)loaded. */
  elapsedMs: number;
  /** A newer build of the app is waiting for this page. */
  updateReady: boolean;
  /** The frame was already reloaded once. */
  reloadedFrame: boolean;
};

/**
 * - "wait": started, or still within FRAME_START_MS.
 * - "update-app": a newer build is waiting; move the whole app onto it (the
 *   preview opens again on the new build).
 * - "reload-frame": no update to blame; reload the frame, once.
 * - "leave": already reloaded once; let the frame's own screen show, which
 *   has a Try again button.
 */
export type FrameAction = "wait" | "update-app" | "reload-frame" | "leave";

export function stalledFrameAction(s: FrameState): FrameAction {
  if (s.started || s.elapsedMs < FRAME_START_MS) return "wait";
  if (s.updateReady) return "update-app";
  if (!s.reloadedFrame) return "reload-frame";
  return "leave";
}
