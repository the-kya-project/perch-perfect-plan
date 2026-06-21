// Owner-side clip preview gate. A clip handed off right after upload is still
// transcoding on Cloudflare Stream (PR #76 hands off the reference before the
// transcode finishes, for speed). Embedding the Stream player before the video
// is readyToStream shows a black/errored frame — which clears on refresh once
// transcoding is done. This hook polls the clip's status and only resolves a
// playable URL once it's ready, so callers can show a "processing" placeholder
// instead of a broken player. Legacy Supabase-Storage clips are always ready.

import { useEffect, useState } from "react";
import { getClipStatus } from "./clips.functions";
import { isCfClip, cfUid } from "./clipRef";
import { resolveOwnerClipUrl } from "./clipUrl";

export type ClipPreview = {
  // none: no clip · processing: uploaded, still transcoding · ready: playable
  status: "none" | "processing" | "ready";
  url: string | null;
};

const TRANSCODE_BUDGET_MS = 150_000; // ~2.5 min, matches the recorder's wait
const POLL_INTERVAL_MS = 3_000;

export function useOwnerClipPreview(path: string | null | undefined): ClipPreview {
  const [preview, setPreview] = useState<ClipPreview>({ status: path ? "processing" : "none", url: null });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (!path) {
      setPreview({ status: "none", url: null });
      return;
    }

    // Legacy clips (Supabase Storage paths) have no transcode step — resolve now.
    if (!isCfClip(path)) {
      setPreview({ status: "processing", url: null });
      resolveOwnerClipUrl(path).then((url) => {
        if (!cancelled) setPreview({ status: url ? "ready" : "none", url });
      });
      return () => { cancelled = true; };
    }

    const uid = cfUid(path);
    const deadline = Date.now() + TRANSCODE_BUDGET_MS;

    const showReady = async () => {
      const url = await resolveOwnerClipUrl(path);
      if (!cancelled) setPreview({ status: url ? "ready" : "none", url });
    };

    const poll = async () => {
      let ready = false;
      try {
        const s = await getClipStatus({ data: { uid } });
        ready = !!s?.readyToStream;
      } catch {
        ready = true; // status unknown — don't trap the clip in "processing"
      }
      if (cancelled) return;
      if (ready || Date.now() > deadline) {
        await showReady();
        return;
      }
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    setPreview({ status: "processing", url: null });
    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [path]);

  return preview;
}
