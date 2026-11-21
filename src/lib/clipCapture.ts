/**
 * Rules for a clip recording the camera interrupted (ClipRecorder.tsx), kept
 * free of app imports so scripts/drafts.test.ts can run them under Node.
 */

/** Less than this captured when the camera dropped: not worth keeping. */
export const MIN_KEEP_SECONDS = 2;

/** No timer tick for this long = the page was suspended (the camera stops with
 *  it). Well above the stalls a slow phone has while encoding video. */
export const SUSPEND_GAP_MS = 3000;

/** Seconds of video captured: from the start to the last moment the page was
 *  running. A long gap since the last tick means the page was suspended, so
 *  that time isn't counted. */
export function capturedSeconds(startedAt: number, lastTickAt: number, now: number): number {
  const end = now - lastTickAt > SUSPEND_GAP_MS ? lastTickAt : now;
  return Math.max(0, (end - startedAt) / 1000);
}

/** After a camera drop: offer "Keep this clip" only with real video and at
 *  least MIN_KEEP_SECONDS of it. */
export function canKeepInterrupted(seconds: number, hasVideo: boolean): boolean {
  return hasVideo && seconds >= MIN_KEEP_SECONDS;
}

export type RecorderPhase = "idle" | "ready" | "recording" | "stopping" | "review" | "interrupted" | "saved";

/**
 * May an app update reload the page now without losing this recorder's work?
 * Not while recording or uploading (nothing could keep it), nor while a
 * recorded clip isn't saved on the device yet. A live preview has nothing to
 * lose; a clip saved on the device comes back after the reload.
 */
export function recorderKeepable(s: { phase: RecorderPhase; uploading: boolean; draftSaved: boolean }): boolean {
  if (s.uploading || s.phase === "recording" || s.phase === "stopping") return false;
  const holdsClip = s.phase === "review" || s.phase === "interrupted" || s.phase === "saved";
  return !holdsClip || s.draftSaved;
}
