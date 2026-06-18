import { useEffect, useRef, useState } from "react";
import { Video, Square, RotateCcw, Check, AlertTriangle, Upload, Loader2 } from "lucide-react";

/** Prominent, labeled progress block shared by the checking/uploading states. */
export function UploadProgress({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="rounded-xl border-2 border-sage-200 bg-sage-50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-sage-700">
        <Loader2 className="size-4 animate-spin" />
        {label}
      </div>
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-sage-200">
        <div
          className="h-full w-2/5 rounded-full bg-sage-600"
          style={{ animation: "clip-indeterminate 1.2s ease-in-out infinite" }}
        />
      </div>
      {hint && <p className="mt-2 text-xs text-sage-500">{hint}</p>}
      <style>{`@keyframes clip-indeterminate{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}`}</style>
    </div>
  );
}

/**
 * Clip recorder + uploader.
 *
 * Record path (MediaRecorder):
 * - 720p (1280x720) rear camera + audio.
 * - Negotiates an inline-playable MIME: prefers MP4 (Safari/iOS), falls back to
 *   WebM (Chrome/Firefox/Android). The resulting File carries the matching
 *   extension and Content-Type so signed-URL playback "just works".
 * - Shows a live MM:SS timer and auto-stops at MAX_SECONDS.
 *
 * Upload path (file picker):
 * - Accepts an existing video file (e.g. from the camera roll).
 * - Validates type and size, and rejects clips longer than MAX_SECONDS when the
 *   browser can read the duration.
 *
 * Both paths hand the same File to onRecorded, so storage and playback are
 * identical regardless of source.
 */
export const MAX_SECONDS = 60; // 1 min cap — bounds file size and keeps clips short
// Generous raw limit so a 1-minute iPhone original (HEVC .mov, often 60–150MB)
// is accepted. NOTE: until server-side transcoding is added, this raw file is
// what gets stored — see the transcoding flag in the upload handlers.
export const MAX_BYTES = 200 * 1024 * 1024;

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

/** Best-effort read of a video file's duration in seconds; null if unreadable. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(v.duration) ? v.duration : null);
      };
      v.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      v.src = url;
    } catch { resolve(null); }
  });
}

export function ClipRecorder({
  baseName,
  disabled,
  uploading,
  onRecorded,
}: {
  /** File base name (without extension), e.g. "clip-feeding". */
  baseName: string;
  disabled?: boolean;
  /** Parent is uploading the handed-off file to storage — show a prominent bar. */
  uploading?: boolean;
  onRecorded: (file: File) => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const candidateRef = useRef<Candidate | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<"idle" | "ready" | "recording" | "stopping">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

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

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;
    setError(null);
    // Accept by MIME or extension. iPhone clips are often video/quicktime (.mov,
    // frequently HEVC); some browsers report an empty type for .mov/.m4v, so fall
    // back to the file extension before rejecting.
    const isVideo =
      file.type.startsWith("video/") || /\.(mov|mp4|m4v|hevc|3gp|webm)$/i.test(file.name);
    if (!isVideo) {
      setError("Please choose a video file (.mov or .mp4).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That video is too large (max ${Math.round(MAX_BYTES / (1024 * 1024))}MB). Please record a shorter clip.`);
      return;
    }
    setChecking(true);
    const duration = await readDuration(file);
    setChecking(false);
    if (duration != null && duration > MAX_SECONDS + 1) {
      setError(`That clip is ${fmt(Math.round(duration))} long. Please keep clips under 1 minute.`);
      return;
    }
    await onRecorded(file);
  }

  if (phase === "idle") {
    // While the parent is uploading the handed-off file (or we're reading a
    // picked file's duration), take over the whole control with one prominent,
    // labeled progress bar \u2014 no record/upload affordances to re-trigger.
    if (uploading || checking) {
      return (
        <UploadProgress
          label={uploading ? "Uploading your clip\u2026" : "Checking video\u2026"}
          hint={
            uploading
              ? "This can take a moment on slower connections. Please keep this screen open."
              : "Making sure the clip is under 1 minute."
          }
        />
      );
    }
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

        <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-sage-500">
          <div className="h-px flex-1 bg-sage-200" />
          or
          <div className="h-px flex-1 bg-sage-200" />
        </div>

        <label
          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sage-200 bg-sage-50 p-4 text-sm font-semibold text-sage-700 ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          <Upload className="size-4" />
          Upload a video
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,video/quicktime,.mov,.mp4,.m4v,.hevc"
            className="hidden"
            disabled={disabled}
            onChange={onPick}
          />
        </label>

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
            <span className="inline-flex items-center gap-1.5"><Check className="size-4" /> Finalizing\u2026</span>
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
