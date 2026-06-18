import { useEffect, useRef, useState } from "react";
import { Video, Square, RotateCcw, Check, AlertTriangle, Upload, Loader2 } from "lucide-react";
import { compressVideo, type CompressStage } from "@/lib/videoCompress";

/**
 * Clip recorder + uploader.
 *
 * Record path (MediaRecorder):
 * - Live 720p rear-camera preview (with audio) the owner can frame and watch
 *   while recording — the stream is attached to the <video> after it mounts, and
 *   the element is muted + playsinline so iOS Safari shows it instead of a black
 *   box. Auto-stops at MAX_SECONDS. After "Stop & save" the owner reviews a
 *   playback of the captured clip and can keep it or re-record.
 *
 * Upload path (file picker):
 * - Accepts an existing video (incl. iPhone HEVC .mov), validates type/duration,
 *   then COMPRESSES it in-browser to a small H.264 MP4 (ffmpeg.wasm, loaded
 *   lazily) before handing it off. If compression can't run, the original is
 *   uploaded instead (subject to the raw size limit).
 *
 * Both paths hand the same File to onRecorded, so storage and playback are
 * identical regardless of source.
 */
export const MAX_SECONDS = 60; // 1 min cap — bounds file size and keeps clips short
// Generous raw limit so a 1-minute iPhone original (HEVC .mov, often 80–150MB at
// 4K) is accepted as a compression fallback. NOTE: the Supabase bucket's
// file_size_limit must be raised to match — see the bucket migration.
export const MAX_BYTES = 250 * 1024 * 1024;

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

function mb(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
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

/** Prominent, labeled progress block shared by the checking/compressing/uploading states. */
export function UploadProgress({ label, hint, ratio }: { label: string; hint?: string; ratio?: number }) {
  const pct = typeof ratio === "number" ? Math.max(0, Math.min(100, Math.round(ratio * 100))) : null;
  return (
    <div className="rounded-xl border-2 border-sage-200 bg-sage-50 p-4">
      <div className="flex items-center justify-between gap-2 text-sm font-semibold text-sage-700">
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          {label}
        </span>
        {pct != null && <span className="tabular-nums text-sage-600">{pct}%</span>}
      </div>
      <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-sage-200">
        {pct != null ? (
          <div className="h-full rounded-full bg-sage-600 transition-[width] duration-200" style={{ width: `${pct}%` }} />
        ) : (
          <div className="h-full w-2/5 rounded-full bg-sage-600" style={{ animation: "clip-indeterminate 1.2s ease-in-out infinite" }} />
        )}
      </div>
      {hint && <p className="mt-2 text-xs text-sage-500">{hint}</p>}
      <style>{`@keyframes clip-indeterminate{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}`}</style>
    </div>
  );
}

export function ClipRecorder({
  baseName,
  disabled,
  uploading,
  onBusy,
  onRecorded,
}: {
  /** File base name (without extension), e.g. "clip-feeding". */
  baseName: string;
  disabled?: boolean;
  /** Parent is uploading the handed-off file to storage — show a prominent bar. */
  uploading?: boolean;
  /** Fires true while the recorder is mid-flow (framing, recording, compressing)
   *  so the parent can disable Next / re-trigger. */
  onBusy?: (busy: boolean) => void;
  onRecorded: (file: File) => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const candidateRef = useRef<Candidate | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recordedFileRef = useRef<File | null>(null);
  const recordedUrlRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<"idle" | "ready" | "recording" | "stopping" | "review">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [compress, setCompress] = useState<{ stage: CompressStage; progress: number } | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => { stopAll(); revokeRecorded(); onBusy?.(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach the live stream once the <video> is actually mounted (it only renders
  // outside the "idle" phase). Doing this in start() failed because the element
  // wasn't in the DOM yet — the classic black-preview bug.
  useEffect(() => {
    if ((phase === "ready" || phase === "recording") && streamRef.current && videoRef.current) {
      const v = videoRef.current;
      if (v.srcObject !== streamRef.current) {
        v.srcObject = streamRef.current;
        v.muted = true;
        v.play().catch(() => {}); // autoplay promise can reject on iOS — safe to ignore
      }
    }
  }, [phase]);

  // Let the parent disable Next while the recorder is busy (camera live,
  // recording, or compressing). Upload-to-storage is signalled separately via
  // the `uploading` prop the parent already controls.
  useEffect(() => {
    const busy = checking || !!compress || phase === "ready" || phase === "recording" || phase === "stopping" || phase === "review";
    onBusy?.(busy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, compress, phase]);

  function revokeRecorded() {
    if (recordedUrlRef.current) { try { URL.revokeObjectURL(recordedUrlRef.current); } catch {} recordedUrlRef.current = null; }
  }

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
    setNote(null);
    const cand = pickCandidate();
    if (!cand) { setError("Your browser can't record video here. Try Safari on iPhone or Chrome."); return; }
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
      if (!stream.getVideoTracks().length) {
        stream.getTracks().forEach((t) => t.stop());
        setError("No camera was found. Check that another app isn't using it.");
        return;
      }
      streamRef.current = stream;
      setPhase("ready"); // mounts the <video>; the effect above attaches the stream
    } catch (e: any) {
      const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
      setError(
        denied
          ? "Camera access was blocked. Allow camera access in your browser settings, then try again."
          : (e?.message ?? "Couldn't access the camera. Check your browser permissions."),
      );
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

  // Build the captured file and move to the review step (playback) — don't hand
  // off until the owner confirms.
  function finalize() {
    const cand = candidateRef.current!;
    const blob = new Blob(chunksRef.current, { type: cand.contentType });
    chunksRef.current = [];
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;

    if (!blob.size) { setPhase("idle"); setError("No video was captured. Please try recording again."); return; }
    if (blob.size > MAX_BYTES) { setPhase("idle"); setError("That recording is too large. Please record a shorter clip."); return; }

    recordedFileRef.current = new File([blob], `${baseName}.${cand.ext}`, { type: cand.contentType });
    revokeRecorded();
    const url = URL.createObjectURL(blob);
    recordedUrlRef.current = url;
    setRecordedUrl(url);
    setPhase("review");
  }

  async function useRecorded() {
    const file = recordedFileRef.current;
    if (!file) return;
    // Recordings are already 720p and modestly sized, so they skip the ffmpeg
    // compression step and go straight to upload.
    onBusy?.(true);
    try {
      await onRecorded(file);
    } finally {
      onBusy?.(false);
      revokeRecorded();
      setRecordedUrl(null);
      recordedFileRef.current = null;
      setPhase("idle");
    }
  }

  function reRecord() {
    revokeRecorded();
    setRecordedUrl(null);
    recordedFileRef.current = null;
    start();
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
    setNote(null);

    // Accept by MIME or extension. iPhone clips are often video/quicktime (.mov,
    // frequently HEVC); some browsers report an empty type for .mov/.m4v, so fall
    // back to the file extension before rejecting.
    const isVideo =
      file.type.startsWith("video/") || /\.(mov|mp4|m4v|hevc|3gp|webm)$/i.test(file.name);
    if (!isVideo) {
      setError("Please choose a video file, such as a .mov or .mp4.");
      return;
    }

    setChecking(true);
    const duration = await readDuration(file);
    setChecking(false);
    if (duration != null && duration > MAX_SECONDS + 1) {
      setError(`That clip is ${fmt(Math.round(duration))} long. Please keep clips under 60 seconds.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`That video is too large (over ${mb(MAX_BYTES)}). Please record a shorter clip.`);
      return;
    }

    // Compress in-browser (HEVC/.mov → small H.264 .mp4) before upload. Best
    // effort: any failure falls back to uploading the original.
    onBusy?.(true);
    let out = file;
    try {
      setCompress({ stage: "loading", progress: 0 });
      const compressed = await compressVideo(file, {
        baseName,
        onStage: (s) => setCompress((c) => ({ stage: s, progress: s === "loading" ? 0 : (c?.progress ?? 0) })),
        onProgress: (r) => setCompress({ stage: "compressing", progress: r }),
      });
      // Prefer the re-encoded MP4 (plays everywhere) as long as it fits.
      out = compressed.size > 0 && compressed.size <= MAX_BYTES ? compressed : file;
    } catch (err) {
      console.error("[videoCompress] failed; uploading original instead", err);
      out = file;
      setNote("Couldn't compress this video on your device — uploading the original instead, which may take a bit longer.");
    } finally {
      setCompress(null);
    }

    try {
      await onRecorded(out);
    } finally {
      onBusy?.(false);
    }
  }

  // ---- Render ----------------------------------------------------------------

  const noteEl = note && (
    <p className="flex items-start gap-1.5 text-xs text-warn-amber">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>{note}</span>
    </p>
  );
  const errorEl = error && (
    <p className="flex items-start gap-1.5 text-xs text-warn-red">
      <AlertTriangle className="size-3.5 shrink-0" />
      <span>{error}</span>
    </p>
  );

  // Progress states take over the whole control (no record/upload affordances to
  // re-trigger). Order: compressing → uploading → checking.
  if (compress) {
    return (
      <div className="space-y-2">
        <UploadProgress
          label={compress.stage === "loading" ? "Preparing video tools…" : "Compressing video…"}
          ratio={compress.stage === "compressing" ? compress.progress : undefined}
          hint="This can take a moment, especially on older phones. Please keep this screen open."
        />
        {noteEl}
      </div>
    );
  }
  if (uploading) {
    return (
      <div className="space-y-2">
        <UploadProgress label="Uploading…" hint="Almost there — please keep this screen open." />
        {noteEl}
      </div>
    );
  }
  if (checking) {
    return <UploadProgress label="Checking video…" hint="Making sure the clip is under 60 seconds." />;
  }

  if (phase === "review") {
    return (
      <div className="space-y-2">
        <div className="overflow-hidden rounded-xl bg-black ring-1 ring-sage-200">
          {recordedUrl && <video src={recordedUrl} controls playsInline className="aspect-video w-full object-contain" />}
        </div>
        <p className="flex items-center gap-1 text-xs font-semibold text-sage-600"><Check className="size-3.5" /> Clip recorded — review it below.</p>
        <div className="flex gap-2">
          <button type="button" onClick={useRecorded} disabled={disabled} className="flex-1 rounded-xl bg-sage-900 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <span className="inline-flex items-center justify-center gap-1.5"><Check className="size-4" /> Use this clip</span>
          </button>
          <button type="button" onClick={reRecord} disabled={disabled} className="rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm font-semibold text-sage-700 disabled:opacity-50">
            <span className="inline-flex items-center gap-1.5"><RotateCcw className="size-4" /> Re-record</span>
          </button>
        </div>
        {errorEl}
      </div>
    );
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
          <Video className="size-4" /> Record a clip (up to 60 seconds)
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

        {errorEl}
        {noteEl}
      </div>
    );
  }

  // ready | recording | stopping — live camera preview
  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl bg-black ring-1 ring-sage-200">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          webkit-playsinline="true"
          className="aspect-video w-full object-contain"
        />
        {phase === "recording" && (
          <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-warn-red/90 px-2 py-0.5 text-[11px] font-bold text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" />
            REC {fmt(elapsed)} / {fmt(MAX_SECONDS)}
          </div>
        )}
        {phase === "ready" && (
          <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
            Live preview
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
            <span className="inline-flex items-center gap-1.5"><Loader2 className="size-4 animate-spin" /> Finalizing…</span>
          </div>
        )}
      </div>

      {errorEl}
    </div>
  );
}
