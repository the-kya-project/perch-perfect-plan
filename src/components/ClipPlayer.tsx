import { useRef, useState } from "react";
import { Loader2, AlertTriangle, Play } from "lucide-react";
import { track } from "@/lib/analytics";
import { isStreamUrl } from "@/lib/clipRef";
import { useTranslation } from "react-i18next";

/**
 * Inline HTML5 video player for owner-recorded clips.
 * - Uses signed, streamable URLs (no `download` flag) so the browser can issue
 *   HTTP range requests for 206 Partial Content playback.
 * - Always renders <video controls playsInline preload="metadata"> — never a
 *   download link or new-tab redirect.
 * - Shows a buffering state and a clear error state instead of failing silently.
 */
export function ClipPlayer({
  src,
  label,
  className = "",
  poster,
}: {
  src: string;
  label?: string;
  className?: string;
  poster?: string;
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
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40 text-white">
          <div className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold">
            <Loader2 className="size-3.5 animate-spin" /> {t("clipPlayer.loading", "Loading clip…")}
          </div>
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-sage-900/95 p-3 text-center text-white">
          <div className="flex max-w-[90%] flex-col items-center gap-1.5">
            <AlertTriangle className="size-5 text-warn-amber" />
            <p className="text-xs font-semibold">{t("clipPlayer.cantPlay", "This clip can't play here.")}</p>
            <p className="text-[11px] opacity-80">
              {t("clipPlayer.askReupload", "Ask the owner to re-upload it from the bird's setup so it's converted for all devices.")}
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
export function PosterClipPlayer({ src, duration, className = "", label }: { src: string; duration?: number | null; className?: string; label?: string }) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  if (playing) {
    let url = src;
    if (isStreamUrl(src)) {
      try { const u = new URL(src); u.searchParams.set("autoplay", "true"); url = u.toString(); } catch { /* keep src */ }
    }
    return <ClipPlayer src={url} label={label} className={className} />;
  }
  const length = clipLength(duration);
  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={t("clipPlayer.play", "Play clip")}
      className={`relative grid place-items-center overflow-hidden bg-[#1a3d2e] ${className}`}
    >
      <span className="grid size-14 place-items-center rounded-full bg-[#cdeab0] text-[#1a3d2e]">
        <Play className="ml-0.5 size-6 fill-current" aria-hidden="true" />
      </span>
      {length && (
        <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-[13px] font-[700] tabular-nums text-white">{length}</span>
      )}
    </button>
  );
}
