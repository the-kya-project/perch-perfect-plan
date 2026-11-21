import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { CLIP_PROCESSING_BUDGET_MS, clipProcessingSince, resetClipWait } from "@/lib/journeyData";
import type { JourneyClip } from "@/lib/journeyMedia.functions";
import { clipPhase, type ClipPhase } from "@/lib/journeys";
import { noteMediaError } from "@/lib/saveErrors";

// Journey clips on every screen (story viewer, Day one vs. now, the journey
// grid, Today's milestone cards). Never shows the video player's own error:
//   - still processing on Cloudflare → "Getting the clip ready…" while the
//     clips are asked for again every few seconds; after about two minutes,
//     "This clip is still processing. Check back in a minute." + Try again;
//   - can't be played (processing failed, signing failed, the player or video
//     errored or never loaded) → "We couldn't play this clip. Try again in a
//     moment." + Try again, and one save_errors row (noteMediaError).
// Where the browser plays HLS itself (Safari and the iPhone app's WebKit view)
// the clip plays in a plain <video>, whose errors the app can see; elsewhere
// in Cloudflare's player, watched for 15 seconds for a load.

const LOAD_TIMEOUT_MS = 15_000;


/** Where a clip stands for this screen, and Try again. `failed` can also be
 *  set by the player (markFailed). */
export function useClipPhase(journeyId: string, clip: JourneyClip | undefined, loading: boolean, refetch: () => unknown) {
  const [playerFailed, setPlayerFailed] = useState(false);
  const [, tick] = useState(0);
  const noted = useRef(false);
  const updateId = clip?.updateId;
  const since = updateId ? clipProcessingSince(journeyId, updateId) : undefined;
  const processing = clip?.status === "processing";
  // Re-render once the two-minute budget runs out.
  useEffect(() => {
    if (!processing || since === undefined) return;
    const left = since + CLIP_PROCESSING_BUDGET_MS - Date.now();
    if (left <= 0) return;
    const t = window.setTimeout(() => tick((n) => n + 1), left + 50);
    return () => window.clearTimeout(t);
  }, [processing, since]);
  useEffect(() => { setPlayerFailed(false); noted.current = false; }, [updateId]);

  const phase = clipPhase({ status: clip?.status, loading, playerFailed, processingSince: since, now: Date.now(), budgetMs: CLIP_PROCESSING_BUDGET_MS });

  useEffect(() => {
    if (phase === "failed" && !noted.current && (clip?.status === "failed" || playerFailed)) {
      noted.current = true;
      noteMediaError("journey_clip");
    }
  }, [phase, clip?.status, playerFailed]);

  const retry = () => {
    if (updateId) resetClipWait(journeyId, updateId);
    setPlayerFailed(false);
    noted.current = false;
    void refetch();
  };
  return { phase, retry, markFailed: () => setPlayerFailed(true) };
}

/** The message for a clip that isn't playing (null when it's ready). */
export function ClipState({ phase, onRetry, compact = false }: { phase: ClipPhase; onRetry: () => void; compact?: boolean }) {
  const { t } = useTranslation();
  if (phase === "ready") return null;
  const text = phase === "loading" ? t("flock.journeys.clip.loading", "Loading the clip…")
    : phase === "processing" ? t("flock.journeys.clip.processing", "Getting the clip ready…")
    : phase === "stalled" ? t("flock.journeys.clip.stalled", "This clip is still processing. Check back in a minute.")
    : t("flock.journeys.clip.failed", "We couldn't play this clip. Try again in a moment.");
  const spinning = phase === "loading" || phase === "processing";
  return (
    <div className="absolute inset-0 grid place-items-center p-3 text-center text-white" style={{ background: "linear-gradient(180deg,#3b5d4c,#1d3328)" }}
      data-testid="clip-state" data-phase={phase} role={phase === "failed" ? "alert" : "status"}>
      <div className="flex max-w-[92%] flex-col items-center gap-2">
        {spinning ? <Loader2 className={`${compact ? "size-5" : "size-6"} animate-spin`} style={{ color: K.lime }} aria-hidden="true" />
          : phase === "failed" ? <AlertTriangle className="size-5" style={{ color: K.sunflower }} aria-hidden="true" /> : null}
        {(!compact || !spinning) && <p className={`m-0 font-[700] leading-[1.4] ${compact ? "text-[12px]" : "text-[15px]"}`}>{text}</p>}
        {compact && spinning && <span className="sr-only">{text}</span>}
        {(phase === "stalled" || phase === "failed") && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onRetry(); }} data-testid="clip-retry"
            className={`rounded-full font-[700] ${compact ? "min-h-[32px] px-3 text-[12px]" : "min-h-[44px] px-5 text-[14px]"}`} style={{ background: K.sunflower, color: K.forest }}>
            {t("flock.journeys.clip.retry", "Try again")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Can this browser play HLS itself (Safari, the iPhone app's WebKit view)? */
export function playsHlsNatively(): boolean {
  if (typeof document === "undefined") return false;
  try { return document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== ""; } catch { return false; }
}

/** A ready clip: plain <video> over HLS where the browser can, otherwise
 *  Cloudflare's player. Calls onFail when it can't play. */
export function ReadyClip({ clip, title, autoplay = false, muted = true, controls = true, onFail, videoRef, children }: {
  clip: Extract<JourneyClip, { status: "ready" }>; title: string; autoplay?: boolean; muted?: boolean; controls?: boolean;
  onFail: () => void; videoRef?: (el: HTMLVideoElement | null) => void; children?: ReactNode;
}) {
  const [native, setNative] = useState<boolean | null>(null);
  const loaded = useRef(false);
  useEffect(() => { setNative(playsHlsNatively()); }, []);
  useEffect(() => {
    loaded.current = false;
    const t = window.setTimeout(() => { if (!loaded.current) onFail(); }, LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip.hls, native]);
  if (native === null) return null;
  if (native) {
    return (
      <>
        <video ref={videoRef} src={clip.hls} poster={clip.thumbnail} autoPlay={autoplay} muted={muted} controls={controls} playsInline loop={!controls}
          preload="metadata" title={title} className="absolute inset-0 size-full bg-black object-contain" data-testid="clip-video"
          onLoadedMetadata={() => { loaded.current = true; }} onError={() => onFail()} />
        {children}
      </>
    );
  }
  const params = new URLSearchParams({ muted: String(muted), preload: "true", controls: String(controls) });
  if (autoplay) params.set("autoplay", "true");
  return (
    <>
      <iframe src={`${clip.player}?${params.toString()}`} title={title} className="absolute inset-0 size-full border-0" data-testid="clip-iframe"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowFullScreen
        onLoad={() => { loaded.current = true; }} onError={() => onFail()} />
      {children}
    </>
  );
}

/** On a clip's thumbnail (journey grid, Today's cards): a spinner while it's
 *  being prepared, a warning if it can't be played. Tapping the tile opens the
 *  clip, which has Try again. */
export function ClipTileState({ clip }: { clip: JourneyClip | undefined }) {
  const { t } = useTranslation();
  if (!clip || clip.status === "ready") return null;
  const processing = clip.status === "processing";
  return (
    <span className="absolute inset-0 grid place-items-center" style={{ background: "rgba(18,41,31,.45)" }} data-testid="clip-tile-state" data-phase={clip.status}>
      <span className="flex flex-col items-center gap-1 px-1 text-center text-[11px] font-[700] text-white">
        {processing ? <Loader2 className="size-5 animate-spin" style={{ color: K.lime }} aria-hidden="true" /> : <AlertTriangle className="size-4" style={{ color: K.sunflower }} aria-hidden="true" />}
        {processing ? t("flock.journeys.clip.processingShort", "Getting ready…") : t("flock.journeys.clip.failedShort", "Couldn't load")}
      </span>
    </span>
  );
}
