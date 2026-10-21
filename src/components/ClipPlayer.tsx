import { useRef, useState } from "react";
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

/**
 * Inline HTML5 video player for owner-recorded clips.
 * - Uses signed, streamable URLs (no `download` flag) so the browser can issue
 *   HTTP range requests for 206 Partial Content playback.
 * - Always renders <video controls playsInline preload="metadata"> — never a
 *   download link or new-tab redirect.
 * - Shows a buffering state and a clear error state instead of failing silently.
 *   The error says who can fix it: the owner re-uploads; a sitter asks the
 *   owner (`audience="sitter"` + `ownerName`). Defaults to the owner wording.
 */
export function ClipPlayer({
  src,
  label,
  className = "",
  poster,
  audience = "owner",
  ownerName,
}: {
  src: string;
  label?: string;
  className?: string;
  poster?: string;
  /** Who is watching: changes the error's next step. */
  audience?: "owner" | "sitter";
  /** Sitter view: the owner's first name for "Ask [owner] to upload it again." */
  ownerName?: string;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const firedRef = useRef(false);

  // Cloudflare Stream clips play through the Stream iframe player (handles HLS +
  // signed playback across all browsers). Legacy Supabase clips use <video>.
  if (isStreamUrl(src)) {
    return (
      <div className={`relative overflow-hidden bg-black ${className}`}>
        <iframe
          src={src}
          title={label ?? t("clipPlayer.clip", "Clip")}
          loading="lazy"
          className="size-full"
          style={{ border: 0 }}
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
          allowFullScreen
          onLoad={() => { if (!firedRef.current) { firedRef.current = true; track("clip_viewed", { has_label: !!label }); } }}
        />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <video
        src={src}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        className="size-full object-contain"
        onLoadedMetadata={() => setState("ready")}
        onCanPlay={() => setState("ready")}
        onError={() => setState("error")}
        onPlay={() => { if (!firedRef.current) { firedRef.current = true; track("clip_viewed", { has_label: !!label }); } }}
        aria-label={label}
      />
      {state === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-white" style={{ background: OVERLAY_LIGHT }}>
          <div className="flex min-h-[40px] items-center gap-2 rounded-full px-4 py-2 text-[14px] font-[700]" style={{ background: K.forestDeep }} role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("clipPlayer.loading", "Loading clip…")}
          </div>
        </div>
      )}
      {state === "error" && (
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
      )}
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
export function PosterClipPlayer({ src, duration, className = "", label, audience, ownerName }: { src: string; duration?: number | null; className?: string; label?: string; audience?: "owner" | "sitter"; ownerName?: string }) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  if (playing) {
    let url = src;
    if (isStreamUrl(src)) {
      try { const u = new URL(src); u.searchParams.set("autoplay", "true"); url = u.toString(); } catch { /* keep src */ }
    }
    return <ClipPlayer src={url} label={label} className={className} audience={audience} ownerName={ownerName} />;
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
