import { useRef, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { track } from "@/lib/analytics";

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
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const firedRef = useRef(false);

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <video
        src={src}
        poster={poster}
        controls
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
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
            <Loader2 className="size-3.5 animate-spin" /> Loading clip…
          </div>
        </div>
      )}
      {state === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-sage-900/95 p-3 text-center text-white">
          <div className="flex max-w-[90%] flex-col items-center gap-1.5">
            <AlertTriangle className="size-5 text-warn-amber" />
            <p className="text-xs font-semibold">This clip can't play here.</p>
            <p className="text-[11px] opacity-80">
              Ask the owner to re-upload it from the bird's setup so it's converted for all devices.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
