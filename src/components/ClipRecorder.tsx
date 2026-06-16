import { useEffect, useRef, useState } from "react";
import { Video, Square, RotateCcw, Check, AlertTriangle } from "lucide-react";

/**
 * Camera-only clip recorder using MediaRecorder.
 *
 * - 720p (1280x720) rear camera + audio.
 * - Negotiates an inline-playable MIME: prefers MP4 (Safari/iOS), falls back to
 *   WebM (Chrome/Firefox/Android). The resulting File carries the matching
 *   extension and Content-Type so signed-URL playback "just works".
 * - Shows a live MM:SS timer and auto-stops at MAX_SECONDS.
 * - No file picker, no camera-roll path, no transcode.
 */
export const MAX_SECONDS = 180; // 3 min cap
export const MAX_BYTES = 150 * 1024 * 1024;

type Candidate = { mime: string; ext: "mp4" | "webm"; contentType: "video/mp4" | "video/webm" };

const CANDIDATES: Candidate[] = [
  { mime: "video/mp4;codecs=h264,aac", ext: "mp4", contentType: "video/mp4" },
  { mime: "video/mp4;codecs=avc1,mp4a", ext: "mp4", contentType: "video/mp4" },
  { mime: "video/mp4", ext: "mp4", contentType: "video/mp4" },
  { mime: "video/webm;codecs=vp9,opus", ext: "webm", contentType: "video/webm" },
  { mime: "video/webm;codecs=vp8,opus", ext: "webm", contentType: "video/webm" },
  { mime: "video/webm", ext: "webm", contentType: "video/webm" },
];

function pickCandidate(): Candidate | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const c of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return c;
    } catch {}
  }
  return null;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function ClipRecorder({
  baseName,
  disabled,
  onRecorded,
}: {
  /** File base name (without extension), e.g. "clip-feeding". */
  baseName: string;
  disabled?: boolean;
  onRecorded: (file: File) => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const candidateRef = useRef<Candidate | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<"idle" | "ready" | "recording" | "stopping">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAll() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    try { recorderRef.current?.state !== "inactive" && recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function start() {
    setError(null);
    const cand = pickCandidate();
    if (!cand) { setError("Your browser can't record video here. Try Safari (iOS) or Chrome."); return; }
    candidateRef.current = cand;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: "environment" },
        },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }
      setPhase("ready");
    } catch (e: any) {
      setError(e?.message ?? "Couldn't access the camera. Check your browser permissions.");
      setPhase("idle");
    }
  }

  function beginRecording() {
    const stream = streamRef.current;
    const cand = candidateRef.current;
    if (!stream || !cand) return;
    chunksRef.current = [];
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: cand.mime });
    } catch {
      try { rec = new MediaRecorder(stream); } catch (e: any) {
        setError(e?.message ?? "Couldn't start the recorder.");
        return;
      }
    }
    recorderRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.onerror = () => setError("Recording failed. Please try again.");
    rec.onstop = () => finalize();
    rec.start(1000); // 1s chunks so we get data even on early stop
    setElapsed(0);
    setPhase("recording");
    const startedAt = Date.now();
    tickRef.current = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(s);
      if (s >= MAX_SECONDS) stop();
    }, 250);
  }

  function stop() {
    if (phase !== "recording") return;
    setPhase("stopping");
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    try { recorderRef.current?.stop(); } catch {}
  }

  async function finalize() {
    const cand = candidateRef.current!;
    const blob = new Blob(chunksRef.current, { type: cand.contentType });
    chunksRef.current = [];
    stopAll();
    setPhase("idle");
    if (!blob.size) { setError("No video captured. Please try again."); return; }
    if (blob.size > MAX_BYTES) { setError("Clip is too large. Try a shorter recording."); return; }
    const file = new File([blob], `${baseName}.${cand.ext}`, { type: cand.contentType });
    await onRecorded(file);
  }

  function cancel() {
    chunksRef.current = [];
    stopAll();
    setPhase("idle");
    setElapsed(0);
  }

  if (phase === "idle") {
    return (
      <div className="space-y-2">
        <button
          type="button"
          disabled={disabled}
          onClick={start}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sage-200 bg-sage-50 p-4 text-sm font-semibold text-sage-700 disabled:opacity-50"
        >
          <Video className="size-4" /> Record a clip (up to {Math.floor(MAX_SECONDS / 60)} min)
        </button>
        {error && (
          <p className="flex items-start gap-1.5 text-xs text-warn-red">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-black ring-1 ring-sage-200">
        <video ref={videoRef} playsInline muted className="aspect-video w-full object-contain" />
        {phase === "recording" && (
          <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-warn-red/90 px-2 py-0.5 text-[11px] font-bold text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" />
            REC {fmt(elapsed)} / {fmt(MAX_SECONDS)}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {phase === "ready" && (
          <>
            <button
              type="button"
              onClick={beginRecording}
              className="flex-1 rounded-xl bg-warn-red py-2 text-sm font-semibold text-white"
            >
              <span className="inline-flex items-center justify-center gap-1.5"><Video className="size-4" /> Start recording</span>
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm font-semibold text-sage-700"
            >
              <span className="inline-flex items-center gap-1.5"><RotateCcw className="size-4" /> Cancel</span>
            </button>
          </>
        )}
        {phase === "recording" && (
          <button
            type="button"
            onClick={stop}
            className="flex-1 rounded-xl bg-sage-900 py-2 text-sm font-semibold text-white"
          >
            <span className="inline-flex items-center justify-center gap-1.5"><Square className="size-4" /> Stop & save</span>
          </button>
        )}
        {phase === "stopping" && (
          <div className="flex-1 rounded-xl bg-sage-100 py-2 text-center text-sm font-semibold text-sage-700">
            <span className="inline-flex items-center gap-1.5"><Check className="size-4" /> Finalizing…</span>
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-warn-red">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
