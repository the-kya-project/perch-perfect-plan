import { useEffect, useRef, useState } from "react";
import { Loader2, AlertTriangle, Play } from "lucide-react";
import { track } from "@/lib/analytics";
import { isStreamUrl } from "@/lib/clipRef";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";

// Overlays on the video: deep forest (K.forestDeep, #12291f) at an opacity, so
// white text always reads. Light while it loads (the poster still shows
// through), near-solid for the error so the message is the only thing there.
const OVERLAY_LIGHT = "rgba(18, 41, 31, 0.55)";
const OVERLAY_DARK = "rgba(18, 41, 31, 0.92)";

// Stream iframes fire no error event for an expired signed link — the frame
// either errors (rare) or just never reports a load. If onLoad hasn't fired
// within this budget, treat it as a dead link and try a fresh one.
const IFRAME_LOAD_TIMEOUT_MS = 15_000;

/**
 * Inline HTML5 video player for owner-recorded clips.
 * - Uses signed, streamable URLs (no `download` flag) so the browser can issue
 *   HTTP range requests for 206 Partial Content playback.
 * - Always renders <video controls playsInline preload="metadata"> — never a
 *   download link or new-tab redirect.
 * - Shows a buffering state and a clear error state instead of failing silently.
 *   The error says who can fix it: the owner re-uploads; a sitter asks the
 *   owner (`audience="sitter"` + `ownerName`). Defaults to the owner wording.
 * - Signed links expire. On a load/playback failure the player re-mints the
 *   link ONCE through `refreshSrc` (the caller's existing minting path) before
 *   giving up and showing the error state.
 */
export function ClipPlayer({
  src,
  label,
  className = "",
  poster,
  audience = "owner",
  ownerName,
  refreshSrc,
}: {
  src: string;
  label?: string;
  className?: string;
  poster?: string;
  /** Who is watching: changes the error's next step. */
  audience?: "owner" | "sitter";
  /** Sitter view: the owner's first name for "Ask [owner] to upload it again." */
  ownerName?: string;
  /** Re-mint the signed URL after it expires (called at most once per clip). Resolve the fresh URL, or null when it can't be re-minted. */
  refreshSrc?: () => Promise<string | null | undefined>;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  // The URL actually rendered: starts as `src`, swapped once by a refresh.
  const [currentSrc, setCurrentSrc] = useState(src);
  // Bumped on a refresh so the element remounts even if the URL is unchanged.
  const [attempt, setAttempt] = useState(0);
  const firedRef = useRef(false);
  const retriedRef = useRef(false);
  const refreshingRef = useRef(false);
  const iframeLoadedRef = useRef(false);

  // A new clip from the parent resets the player and the retry budget.
  useEffect(() => {
    setCurrentSrc(src);
    setState("loading");
    retriedRef.current = false;
  }, [src]);

  // On a load/playback failure: refresh the signed link once through the
  // caller's minting path; only if that also fails, show our own error state.
  async function handleLoadFailure() {
    if (refreshingRef.current) return;
    if (!retriedRef.current && refreshSrc) {
      retriedRef.current = true;
      refreshingRef.current = true;
      try {
        const fresh = await refreshSrc();
        if (fresh) {
          setCurrentSrc(fresh);
          setAttempt((n) => n + 1);
          setState("loading");
          return;
        }
      } catch {
        // fall through to the error state
      } finally {
        refreshingRef.current = false;
      }
    }
    setState("error");
  }

  const stream = isStreamUrl(currentSrc);
  const frameRef = useRef<HTMLDivElement>(null);

  // Stream iframe load watchdog (see IFRAME_LOAD_TIMEOUT_MS above). The iframe
  // is lazy-loaded, so the clock only starts once the player is actually on
  // screen — an offscreen clip that hasn't begun loading is not a failure.
  useEffect(() => {
    if (!stream || state === "error") return;
    iframeLoadedRef.current = false;
    let timer: number | null = null;
    const arm = () => {
      if (timer != null) return;
      timer = window.setTimeout(() => {
        if (!iframeLoadedRef.current) void handleLoadFailure();
      }, IFRAME_LOAD_TIMEOUT_MS);
    };
    let io: IntersectionObserver | null = null;
    const el = frameRef.current;
    if (el && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) { arm(); io?.disconnect(); io = null; }
      });
      io.observe(el);
    } else {
      arm();
    }
    return () => {
      if (timer != null) window.clearTimeout(timer);
      io?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream, currentSrc, attempt, state]);

  const errorOverlay = (
    <div className="absolute inset-0 grid place-items-center p-4 text-center text-white" style={{ background: OVERLAY_DARK }} role="alert">
      <div className="flex max-w-[90%] flex-col items-center gap-2">
        <AlertTriangle className="size-5" style={{ color: K.sunflower }} aria-hidden="true" />
        <p className="m-0 text-[15px] font-[700] leading-[1.4] text-white">
          {audience === "sitter"
            ? t("clipPlayer.didntLoadSitter", "This clip didn't load. Ask {{owner}} to upload it again.", { owner: ownerName || t("sitter.common.theOwner", "the owner") })
            : t("clipPlayer.didntLoadOwner", "This clip didn't load. Try uploading it again.")}
        </p>
      </div>
    </div>
  );

  // Cloudflare Stream clips play through the Stream iframe player (handles HLS +
  // signed playback across all browsers). Legacy Supabase clips use <video>.
  if (stream) {
    return (
      <div ref={frameRef} className={`relative overflow-hidden bg-black ${className}`}>
        {state !== "error" && (
          <iframe
            key={attempt}
            src={currentSrc}
            title={label ?? t("clipPlayer.clip", "Clip")}
            loading="lazy"
            className="size-full"
            style={{ border: 0 }}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
            onLoad={() => {
              iframeLoadedRef.current = true;
              if (!firedRef.current) { firedRef.current = true; track("clip_viewed", { has_label: !!label }); }
            }}
            onError={() => void handleLoadFailure()}
          />
        )}
        {state === "error" && errorOverlay}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      {state !== "error" && (
        <video
          key={attempt}
          src={currentSrc}
          poster={poster}
          controls
          playsInline
          preload="metadata"
          className="size-full object-contain"
          onLoadedMetadata={() => setState("ready")}
          onCanPlay={() => setState("ready")}
          onError={() => void handleLoadFailure()}
          onPlay={() => { if (!firedRef.current) { firedRef.current = true; track("clip_viewed", { has_label: !!label }); } }}
          aria-label={label}
        />
      )}
      {state === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-white" style={{ background: OVERLAY_LIGHT }}>
          <div className="flex min-h-[40px] items-center gap-2 rounded-full px-4 py-2 text-[14px] font-[700]" style={{ background: K.forestDeep }} role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("clipPlayer.loading", "Loading clip…")}
          </div>
        </div>
      )}
      {state === "error" && errorOverlay}
    </div>
  );
}

/** "0:42" from seconds. */
export function clipLength(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * A clip behind a cover: forest panel with a lime play button and the length
 * in a pill. Tapping it loads the real player (Stream clips start playing).
 */
export function PosterClipPlayer({ src, duration, className = "", label, audience, ownerName, refreshSrc }: { src: string; duration?: number | null; className?: string; label?: string; audience?: "owner" | "sitter"; ownerName?: string; refreshSrc?: () => Promise<string | null | undefined> }) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  if (playing) {
    let url = src;
    if (isStreamUrl(src)) {
      try { const u = new URL(src); u.searchParams.set("autoplay", "true"); url = u.toString(); } catch { /* keep src */ }
    }
    return <ClipPlayer src={url} label={label} className={className} audience={audience} ownerName={ownerName} refreshSrc={refreshSrc} />;
  }
  const length = clipLength(duration);
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={t("clipPlayer.play", "Play clip")}
      className={`relative grid place-items-center overflow-hidden ${className}`}
      style={{ background: K.forest }}
    >
      <span className="grid size-14 place-items-center rounded-full" style={{ background: K.lime, color: K.forest }}>
        <Play className="ml-0.5 size-6 fill-current" aria-hidden="true" />
      </span>
      {length && (
        <span className="absolute bottom-3 left-3 rounded-full px-2.5 py-1 text-[14px] font-[700] tabular-nums text-white" style={{ background: OVERLAY_LIGHT }}>{length}</span>
      )}
    </button>
  );
}
