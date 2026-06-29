import { useEffect, useRef, useState } from "react";
import { Video, Square, RotateCcw, Check, AlertTriangle, Upload, Loader2 } from "lucide-react";
import { createClipUpload, getClipStatus } from "@/lib/clips.functions";
import { cfRef } from "@/lib/clipRef";

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
 * - Accepts an existing video (incl. iPhone HEVC .mov), validates type/duration.
 *
 * Both paths upload the raw clip to Cloudflare Stream (direct upload), which
 * transcodes it server-side to H.264 that plays everywhere — no slow on-device
 * compression. The recorder shows "Uploading…" then "Processing…", then hands
 * the resulting "cfstream:<uid>" reference to onUploaded for the parent to
 * persist on the clip column.
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
// Live-counter formatting (one decimal so the number visibly moves during upload).
function mb1(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function speedStr(bps: number) {
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  return `${Math.max(1, Math.round(bps / 1024))} KB/s`;
}
function etaStr(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  return seconds < 60 ? `${Math.ceil(seconds)}s` : fmt(Math.round(seconds));
}
// Above this, warn the user the upload may take a while on cellular.
const LARGE_CLIP_BYTES = 50 * 1024 * 1024;

/** Best-effort read of a video file's duration in seconds; null if unreadable.
 *  Hard 5s cap: a .mov whose metadata can't be probed (common for iPhone HEVC)
 *  must NEVER block the upload — on timeout we resolve null and proceed. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    let url: string | null = null;
    const finish = (val: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (url) URL.revokeObjectURL(url);
      resolve(val);
    };
    const timer = setTimeout(() => finish(null), 5000);
    try {
      url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => finish(Number.isFinite(v.duration) ? v.duration : null);
      v.onerror = () => finish(null);
      v.src = url;
    } catch { finish(null); }
  });
}

/**
 * Resumable upload of a file to a Cloudflare Stream tus upload URL. tus retries
 * and resumes on transient network drops (common on mobile) instead of failing
 * the whole transfer — which is what the old single multipart POST did.
 */
async function tusUpload(
  uploadURL: string,
  file: File,
  onProgress: (sent: number, total: number, speedBps: number) => void,
): Promise<void> {
  // Load tus only when an upload actually starts — it's ~100KB and otherwise
  // would sit in the main bundle that loads on every screen.
  const tus = await import("tus-js-client");
  return new Promise<void>((resolve, reject) => {
    let lastSent = 0;
    let lastTime = Date.now();
    let speed = 0; // bytes/sec, smoothed
    const upload = new tus.Upload(file, {
      // The upload was already created server-side; PATCH directly to its URL.
      uploadUrl: uploadURL,
      endpoint: uploadURL,
      // 4 MB chunks (multiple of 256 KiB, Cloudflare requirement): a dropped
      // chunk on a bad connection re-sends only ~4 MB and progress feels smoother.
      chunkSize: 4 * 1024 * 1024,
      // Finite retry schedule (~4 attempts). When it's exhausted we surface a
      // "try Wi-Fi" message instead of retrying forever and draining the battery.
      retryDelays: [0, 2000, 6000, 15000],
      removeFingerprintOnSuccess: true,
      onError: (err) => reject(err instanceof Error ? err : new Error(String(err))),
      onProgress: (sent, total) => {
        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        if (dt >= 0.25) {
          const inst = (sent - lastSent) / dt;
          speed = speed > 0 ? speed * 0.7 + inst * 0.3 : inst; // EMA smoothing
          lastSent = sent;
          lastTime = now;
        }
        if (total > 0) onProgress(sent, total, speed);
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

/** Poll the transcode status until ready (best-effort; resolves on timeout so a
 *  still-processing clip's reference is still saved). Throws on transcode error. */
async function waitForReady(uid: string): Promise<void> {
  const deadline = Date.now() + 150000; // ~2.5 min
  while (Date.now() < deadline) {
    let s: any = null;
    try { s = await getClipStatus({ data: { uid } }); } catch {}
    if (s?.readyToStream) return;
    if (s?.state === "error") throw new Error("This video couldn't be processed. Please try a different clip.");
    await new Promise((r) => setTimeout(r, 2500));
  }
}

function friendlyUploadError(err: any): string {
  const m = String(err?.message ?? "");
  if (/not configured/i.test(m)) return "Video uploads aren't set up yet — please try again later.";
  if (/processed/i.test(m)) return m;
  // Surface the real Cloudflare error (e.g. auth/subscription) instead of hiding it.
  if (/cloudflare stream/i.test(m)) return `Video service error — ${m}`;
  // tus exhausted its (finite) retries — the connection kept dropping. Stop and
  // point the user at Wi-Fi rather than looping forever / draining the battery.
  if (/tus|http|network|request|connection|timed out|aborted/i.test(m)) {
    return "This clip is having trouble uploading — try again on Wi-Fi?";
  }
  return "Upload failed. Please try again.";
}

/** Prominent, labeled progress block shared by the checking/uploading/processing states. */
export function UploadProgress({ label, hint, ratio, detail }: { label: string; hint?: string; ratio?: number; detail?: string }) {
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
      {detail && <p className="mt-2 text-xs tabular-nums text-sage-600">{detail}</p>}
      {hint && <p className="mt-2 text-xs text-sage-500">{hint}</p>}
      <style>{`@keyframes clip-indeterminate{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}`}</style>
    </div>
  );
}

export function ClipRecorder({
  baseName,
  disabled,
  onBusy,
  onUploaded,
}: {
  /** Unused label retained for call-site compatibility. */
  baseName?: string;
  disabled?: boolean;
  /** Fires true while the recorder is mid-flow (framing, recording, uploading,
   *  processing) so the parent can disable Next / re-trigger. */
  onBusy?: (busy: boolean) => void;
  /** Receives the persisted clip reference ("cfstream:<uid>") once the upload
   *  to Cloudflare Stream completes; the parent saves it on the clip column. */
  onUploaded: (ref: string) => void | Promise<void>;
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
  const [stage, setStage] = useState<{ kind: "uploading" | "processing"; pct?: number; sent?: number; total?: number; speed?: number } | null>(null);
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
    const busy = checking || !!stage || phase === "ready" || phase === "recording" || phase === "stopping" || phase === "review";
    onBusy?.(busy);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, stage, phase]);

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
    // Cap the bitrate so a 60s 720p clip stays small (~2.5 Mbps ≈ ~19 MB),
    // keeping uploads fast; Cloudflare transcodes to its own renditions anyway.
    const recOpts: MediaRecorderOptions = { videoBitsPerSecond: 2_500_000 };
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: cand.mime, ...recOpts });
    } catch {
      try { rec = new MediaRecorder(stream, recOpts); } catch (e: any) {
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

    recordedFileRef.current = new File([blob], `${baseName ?? "clip"}.${cand.ext}`, { type: cand.contentType });
    revokeRecorded();
    const url = URL.createObjectURL(blob);
    recordedUrlRef.current = url;
    setRecordedUrl(url);
    setPhase("review");
  }

  // Upload the raw clip to Cloudflare Stream, wait for transcode, hand the
  // "cfstream:<uid>" reference to the parent. Returns true on success.
  async function uploadToStream(file: File): Promise<boolean> {
    setError(null);
    setNote(null);
    onBusy?.(true);
    try {
      setStage({ kind: "uploading", pct: 0, sent: 0, total: file.size, speed: 0 });
      // Acknowledge a long iPhone clip so the wait isn't a mystery on cellular.
      if (file.size > LARGE_CLIP_BYTES) setNote("Large clip — this may take a minute on cell.");
      const { uploadURL, uid } = await createClipUpload({ data: { uploadLength: file.size } });
      await tusUpload(uploadURL, file, (sent, total, speed) =>
        setStage({ kind: "uploading", pct: Math.round((sent / total) * 100), sent, total, speed }));
      // The clip reference is valid the moment the bytes are up. Hand it off now
      // instead of blocking the owner on Cloudflare's server-side transcode
      // (previously up to ~2.5 min on "Processing…"). The clip keeps transcoding
      // in the background; the Stream player shows a brief loading state if it's
      // opened before it's ready. Best-effort: surface a transcode failure (rare)
      // without blocking — if the recorder is still open the owner sees it.
      await onUploaded(cfRef(uid));
      void waitForReady(uid).catch((err) => {
        console.error("[clip] transcode failed", err);
        setError(friendlyUploadError(err));
      });
      return true;
    } catch (err) {
      console.error("[clip] upload failed", err);
      setError(friendlyUploadError(err));
      return false;
    } finally {
      setStage(null);
      onBusy?.(false);
    }
  }

  async function useRecorded() {
    const file = recordedFileRef.current;
    if (!file) return;
    const ok = await uploadToStream(file);
    if (ok) {
      revokeRecorded();
      setRecordedUrl(null);
      recordedFileRef.current = null;
      setPhase("idle");
    }
    // On failure, stay on the review screen so they can retry "Use this clip".
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

    // Upload the raw clip straight to Cloudflare Stream (it transcodes server-side).
    await uploadToStream(file);
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
  // re-trigger). Order: uploading/processing → checking.
  if (stage) {
    return (
      <div className="space-y-2">
        <UploadProgress
          label={stage.kind === "uploading" ? "Uploading…" : "Processing video…"}
          ratio={stage.kind === "uploading" ? (stage.pct ?? 0) / 100 : undefined}
          detail={
            stage.kind === "uploading" && stage.total
              ? [
                  `${mb1(stage.sent ?? 0)} / ${mb1(stage.total)}`,
                  stage.speed ? `${speedStr(stage.speed)}` : null,
                  stage.speed ? `~${etaStr((stage.total - (stage.sent ?? 0)) / stage.speed)} left` : null,
                ].filter(Boolean).join(" · ")
              : undefined
          }
          hint={
            stage.kind === "uploading"
              ? "Sending your clip to be converted. Please keep this screen open."
              : "Converting your clip so it plays on every device — usually just a few seconds. Please keep this screen open."
          }
        />
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
            // Plain "video/*" only. Adding specific MIME types (video/quicktime)
            // and raw extensions (.mov/.hevc) makes Android's chooser drop the
            // Gallery/Photos option and offer only Camcorder + Files. "video/*"
            // still includes .mov on both platforms; onPick validates by
            // MIME-or-extension so iPhone .mov/HEVC clips are still accepted.
            accept="video/*"
            className="hidden"
            disabled={disabled}
            onChange={onPick}
          />
        </label>

        <p className="text-center text-[11px] text-sage-500">
          Up to {MAX_SECONDS} seconds and {mb(MAX_BYTES)} per clip.
        </p>

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
