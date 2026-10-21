import { useEffect, useRef, useState } from "react";
import { Video, Square, RotateCcw, Check, AlertTriangle, Upload, Loader2 } from "lucide-react";
import { createClipUpload, getClipStatus } from "@/lib/clips.functions";
import { cfRef } from "@/lib/clipRef";
import { track } from "@/lib/analytics";
import { nativePlatform } from "@/lib/nativeApp";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { friendlyError } from "@/lib/errorMessage";

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

/**
 * Resumable upload of a file to a Cloudflare Stream tus upload URL. tus retries
 * and resumes on transient network drops (common on mobile) instead of failing
 * the whole transfer — which is what the old single multipart POST did.
 */
async function tusUpload(uploadURL: string, file: File, onProgress: (pct: number) => void, onStart?: (abort: () => void) => void): Promise<void> {
  // Load tus only when an upload actually starts — it's ~100KB and otherwise
  // would sit in the main bundle that loads on every screen.
  const tus = await import("tus-js-client");
  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      // The upload was already created server-side; PATCH directly to its URL.
      uploadUrl: uploadURL,
      endpoint: uploadURL,
      // Multiple of 256 KiB (Cloudflare requirement); 16 MB chunks resume well on mobile.
      chunkSize: 16 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      removeFingerprintOnSuccess: true,
      onError: (err) => reject(err instanceof Error ? err : new Error(String(err))),
      onProgress: (sent, total) => {
        if (total > 0) onProgress(Math.round((sent / total) * 100));
      },
      onSuccess: () => resolve(),
    });
    upload.start();
    // "Cancel upload": stop sending and settle as cancelled (not an error).
    onStart?.(() => {
      void upload.abort(true).catch(() => {});
      reject(new UploadCancelled());
    });
  });
}

class UploadCancelled extends Error {
  constructor() { super("cancelled"); }
}

/** Poll the transcode status until ready (best-effort; resolves on timeout so a
 *  still-processing clip's reference is still saved). Resolves false on timeout;
 *  throws on transcode error. */
async function waitForReady(uid: string): Promise<boolean> {
  const deadline = Date.now() + 150000; // ~2.5 min
  while (Date.now() < deadline) {
    let s: any = null;
    try { s = await getClipStatus({ data: { uid } }); } catch {}
    if (s?.readyToStream) return true;
    if (s?.state === "error") throw new Error("This video couldn't be processed. Please try a different clip.");
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

function friendlyUploadError(err: any): string {
  const m = String(err?.message ?? "");
  if (/not configured/i.test(m)) return i18next.t("clipRecorder.notConfigured", "Video uploads aren't set up yet — please try again later.");
  // waitForReady's own (English) transcode-failure message — shown localized.
  if (m === "This video couldn't be processed. Please try a different clip.") return i18next.t("clipRecorder.couldntProcess", "This video couldn't be processed. Please try a different clip.");
  if (/processed/i.test(m)) return m;
  // Surface the real Cloudflare error (e.g. auth/subscription) instead of hiding it.
  if (/cloudflare stream/i.test(m)) return i18next.t("clipRecorder.serviceError", "Video service error — {{detail}}", { detail: m });
  // tus exhausted its retries (the connection kept dropping). Show the raw
  // detail so a flaky-network failure can be diagnosed from the phone.
  if (/tus|http|network|request|connection|timed out|aborted/i.test(m)) {
    return `${i18next.t("clipRecorder.uploadFailedRetrying", "Upload failed after retrying — check your connection and try again.")}${m ? ` (${m.slice(0, 120)})` : ""}`;
  }
  return i18next.t("clipRecorder.uploadFailed", "Upload failed. Please try again.");
}

/** The clip's in-progress panel (checking, uploading, getting it ready): a
 *  white panel with a bold line, an optional percentage bar, a note, and an
 *  optional cancel. Without `ratio` it shows a spinner instead of a bar. */
export function UploadProgress({ label, hint, ratio, onCancel }: { label: string; hint?: string; ratio?: number; onCancel?: () => void }) {
  const { t } = useTranslation();
  const pct = typeof ratio === "number" ? Math.max(0, Math.min(100, Math.round(ratio * 100))) : null;
  return (
    <div className="flex flex-col gap-2.5 rounded-[16px] bg-white p-4 text-[#1a3d2e]" role="status">
      <div className="flex items-center justify-between gap-2 text-[15.5px] font-[700]">
        <span className="flex items-center gap-2">
          {pct == null && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {label}
        </span>
        {pct != null && <span className="tabular-nums">{pct}%</span>}
      </div>
      {pct != null && (
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#e3ebe2]">
          <div className="h-full rounded-full bg-[#1a3d2e] transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      )}
      {hint && <p className="m-0 text-[14px] leading-[1.45] text-[#3d4f45]">{hint}</p>}
      {onCancel && (
        <div>
          <button type="button" onClick={onCancel} className="inline-flex min-h-[44px] items-center text-[15px] font-[700] text-[#2d6a4f]">
            {t("clipRecorder.cancelUpload", "Cancel upload")}
          </button>
        </div>
      )}
    </div>
  );
}

export function ClipRecorder({
  birdId,
  baseName,
  disabled,
  onBusy,
  onUploading,
  onProgress,
  cancelRef,
  onUploaded,
}: {
  /** The bird this clip belongs to. Sent to createClipUpload, which registers
   *  the minted uid against it in clip_assets — the server-authored binding
   *  every later clip authorization resolves. Required: without it a clip
   *  would exist that nothing could ever authorize. */
  birdId: string;
  /** Unused label retained for call-site compatibility. */
  baseName?: string;
  disabled?: boolean;
  /** Fires true while the recorder is mid-flow (framing, recording, uploading,
   *  processing) so the parent can disable Next / re-trigger. */
  onBusy?: (busy: boolean) => void;
  /** Fires true while a clip is checking or uploading (the footer explains why Next waits). */
  onUploading?: (uploading: boolean) => void;
  /** Upload progress (0–100) while sending; null otherwise. For callers that show it themselves. */
  onProgress?: (pct: number | null) => void;
  /** Set to a function that cancels the upload in progress, or null. */
  cancelRef?: { current: (() => void) | null };
  /** Receives the persisted clip reference ("cfstream:<uid>") once the upload
   *  to Cloudflare Stream completes; the parent saves it on the clip column. */
  onUploaded: (ref: string) => void | Promise<void>;
}) {
  const { t } = useTranslation();
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
  const [stage, setStage] = useState<{ kind: "uploading" | "processing"; pct?: number } | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { stopAll(); revokeRecorded(); onBusy?.(false); onUploading?.(false); onProgress?.(null); };
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
    onUploading?.(checking || !!stage);
    onProgress?.(stage?.kind === "uploading" ? stage.pct ?? 0 : checking ? 0 : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, stage, phase]);

  function revokeRecorded() {
    if (recordedUrlRef.current) { try { URL.revokeObjectURL(recordedUrlRef.current); } catch {} recordedUrlRef.current = null; }
  }

  function stopAll() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    try { recorderRef.current?.state !== "inactive" && recorderRef.current?.stop(); } catch {}
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function start() {
    setError(null);
    setNote(null);
    const cand = pickCandidate();
    if (!cand) { setError(t("clipRecorder.cantRecord", "Your browser can't record video here. Try Safari on iPhone or Chrome.")); return; }
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
        stream.getTracks().forEach((tr) => tr.stop());
        setError(t("clipRecorder.noCamera", "No camera was found. Check that another app isn't using it."));
        return;
      }
      streamRef.current = stream;
      setPhase("ready"); // mounts the <video>; the effect above attaches the stream
    } catch (e: any) {
      const denied = e?.name === "NotAllowedError" || e?.name === "SecurityError";
      setError(
        denied
          ? t("clipRecorder.cameraBlocked", "Camera access was blocked. Allow camera access in your browser settings, then try again.")
          : friendlyError(e, t("clipRecorder.cameraAccessFailed", "Couldn't access the camera. Check your browser permissions."), t),
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
        setError(friendlyError(e, t("clipRecorder.recorderStartFailed", "Couldn't start the recorder."), t));
        return;
      }
    }
    recorderRef.current = rec;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
    rec.onerror = () => setError(t("clipRecorder.recordingFailed", "Recording failed. Please try again."));
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
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;

    if (!blob.size) { setPhase("idle"); setError(t("clipRecorder.nothingCaptured", "No video was captured. Please try recording again.")); return; }
    if (blob.size > MAX_BYTES) { setPhase("idle"); setError(t("clipRecorder.recordingTooLarge", "That recording is too large. Please record a shorter clip.")); return; }

    recordedFileRef.current = new File([blob], `${baseName ?? "clip"}.${cand.ext}`, { type: cand.contentType });
    revokeRecorded();
    const url = URL.createObjectURL(blob);
    recordedUrlRef.current = url;
    setRecordedUrl(url);
    setPhase("review");
  }

  // Upload the raw clip to Cloudflare Stream, wait for transcode, hand the
  // "cfstream:<uid>" reference to the parent. Returns true on success.
  async function uploadToStream(file: File, source: "recorded" | "picked"): Promise<boolean> {
    setError(null);
    setNote(null);
    onBusy?.(true);
    // Timing for analytics: setup (minting the upload URL), sending, and how far
    // a failed or cancelled upload got.
    const sizeMb = Math.round((file.size / 1_000_000) * 10) / 10;
    const base = { size_mb: sizeMb, source, platform: nativePlatform() };
    const started = performance.now();
    let sendStarted: number | null = null;
    let lastPct = 0;
    const secs = (from: number) => Math.round((performance.now() - from) / 100) / 10;
    try {
      setStage({ kind: "uploading", pct: 0 });
      const { uploadURL, uid } = await createClipUpload({ data: { uploadLength: file.size, birdId } });
      sendStarted = performance.now();
      await tusUpload(uploadURL, file, (pct) => { lastPct = pct; setStage({ kind: "uploading", pct }); }, (abort) => { abortRef.current = abort; if (cancelRef) cancelRef.current = abort; });
      const sendS = secs(sendStarted);
      track("clip_upload_done", {
        ...base,
        setup_s: Math.round((sendStarted - started) / 100) / 10,
        send_s: sendS,
        mbps: sendS > 0 ? Math.round(((file.size * 8) / 1_000_000 / sendS) * 10) / 10 : null,
      });
      const sentAt = performance.now();
      // The clip reference is valid the moment the bytes are up. Hand it off now
      // instead of blocking the owner on Cloudflare's server-side transcode
      // (previously up to ~2.5 min on "Processing…"). The clip keeps transcoding
      // in the background; the Stream player shows a brief loading state if it's
      // opened before it's ready. Best-effort: surface a transcode failure (rare)
      // without blocking — if the recorder is still open the owner sees it.
      await onUploaded(cfRef(uid));
      void waitForReady(uid).then((ready) => track("clip_ready", { ...base, ready_s: secs(sentAt), timed_out: !ready })).catch((err) => {
        console.error("[clip] transcode failed", err);
        setError(friendlyUploadError(err));
      });
      return true;
    } catch (err) {
      const after = { ...base, after_s: secs(started), sending: sendStarted != null, pct: Math.round(lastPct) };
      if (err instanceof UploadCancelled) { track("clip_upload_cancelled", after); return false; }
      track("clip_upload_failed", after);
      console.error("[clip] upload failed", err);
      setError(friendlyUploadError(err));
      return false;
    } finally {
      abortRef.current = null;
      if (cancelRef) cancelRef.current = null;
      setStage(null);
      onBusy?.(false);
    }
  }

  async function useRecorded() {
    const file = recordedFileRef.current;
    if (!file) return;
    const ok = await uploadToStream(file, "recorded");
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
      setError(t("clipRecorder.chooseVideo", "Please choose a video file, such as a .mov or .mp4."));
      return;
    }

    setChecking(true);
    const duration = await readDuration(file);
    setChecking(false);

    // Diagnostic: the app and PWA run identical code, so if the native app
    // uploads are slower it's because iOS hands the WKWebview a larger original
    // file than Safari (which auto-compresses photo-library uploads). Compare
    // size/type/platform across the two.
    track("clip_upload_picked", {
      size_mb: Math.round((file.size / 1_000_000) * 10) / 10,
      type: file.type || "unknown",
      duration_s: duration != null ? Math.round(duration) : null,
      platform: nativePlatform(),
    });
    if (duration != null && duration > MAX_SECONDS + 1) {
      setError(t("clipRecorder.clipTooLong", "That clip is {{duration}} long. Please keep clips under 60 seconds.", { duration: fmt(Math.round(duration)) }));
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(t("clipRecorder.videoTooLarge", "That video is too large (over {{size}}). Please record a shorter clip.", { size: mb(MAX_BYTES) }));
      return;
    }

    // Upload the raw clip straight to Cloudflare Stream (it transcodes server-side).
    await uploadToStream(file, "picked");
  }

  // ---- Render ----------------------------------------------------------------

  // The Kya buttons: sunflower for the one main action, white with a forest
  // border for the other.
  const MAIN_BTN = "inline-flex min-h-[52px] min-w-0 items-center justify-center gap-2 rounded-full border-2 border-[#1a3d2e] bg-[#f2b33d] px-5 text-[16px] font-[700] text-[#1a3d2e] disabled:opacity-45";
  const SECOND_BTN = "inline-flex min-h-[52px] shrink-0 items-center justify-center gap-1.5 rounded-full border-2 border-[#1a3d2e] bg-white px-4 text-[15px] font-[700] text-[#1a3d2e] disabled:opacity-45";

  const noteEl = note && (
    <p className="m-0 flex items-start gap-1.5 text-[13.5px] leading-[1.45] text-[#854f0b]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{note}</span>
    </p>
  );
  const errorEl = error && (
    <p className="m-0 flex items-start gap-1.5 text-[13.5px] font-[700] leading-[1.45] text-[#a32d2d]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{error}</span>
    </p>
  );

  // Progress states take over the whole control (no record/upload affordances to
  // re-trigger). Order: uploading/processing → checking.
  if (stage) {
    return (
      <div className="space-y-2">
        <UploadProgress
          label={stage.kind === "uploading" ? t("clipRecorder.uploadingYourClip", "Uploading your clip") : t("clipRecorder.gettingItReady", "Getting it ready…")}
          ratio={stage.kind === "uploading" ? (stage.pct ?? 0) / 100 : undefined}
          hint={stage.kind === "uploading" ? t("clipRecorder.keepScreenOpen", "Keep this screen open. You can move on once it's done.") : undefined}
          onCancel={stage.kind === "uploading" ? () => abortRef.current?.() : undefined}
        />
        {noteEl}
      </div>
    );
  }
  if (checking) {
    return <UploadProgress label={t("clipRecorder.checking", "Checking video…")} hint={t("clipRecorder.checkingHint", "Making sure the clip is under 60 seconds.")} />;
  }

  if (phase === "review") {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="overflow-hidden rounded-[16px] bg-black">
          {recordedUrl && <video src={recordedUrl} controls playsInline className="aspect-video w-full object-contain" />}
        </div>
        <p className="m-0 flex items-center gap-1.5 text-[13.5px] font-[700] text-[#5f5e5a]"><Check className="size-4" aria-hidden="true" /> {t("clipRecorder.recordedReview", "Clip recorded — review it below.")}</p>
        <div className="flex gap-2.5">
          <button type="button" onClick={useRecorded} disabled={disabled} className={`${MAIN_BTN} flex-1`}>
            <Check className="size-5" aria-hidden="true" /> {t("clipRecorder.useClip", "Use this clip")}
          </button>
          <button type="button" onClick={reRecord} disabled={disabled} className={SECOND_BTN}>
            <RotateCcw className="size-4" aria-hidden="true" /> {t("clipRecorder.reRecord", "Re-record")}
          </button>
        </div>
        {errorEl}
      </div>
    );
  }

  if (phase === "idle") {
    const half = "inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-full border-2 border-[#1a3d2e] bg-white px-3 text-[16px] font-[700] text-[#1a3d2e]";
    return (
      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2.5">
          <button type="button" disabled={disabled} onClick={start} className={`${half} disabled:opacity-45`}>
            <Video className="size-5" aria-hidden="true" /> {t("clipRecorder.record", "Record")}
          </button>
          <label className={`${half} cursor-pointer ${disabled ? "pointer-events-none opacity-45" : ""}`}>
            <Upload className="size-5" aria-hidden="true" />
            {t("clipRecorder.upload", "Upload")}
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
        </div>

        <p className="m-0 text-[13.5px] text-[#5f5e5a]">
          {t("clipRecorder.recordingQuicker", "Recording here is quicker than uploading a long phone video.")}
        </p>

        {errorEl}
        {noteEl}
      </div>
    );
  }

  // ready | recording | stopping — live camera preview
  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative overflow-hidden rounded-[16px] bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          webkit-playsinline="true"
          className="aspect-video w-full object-contain"
        />
        {phase === "recording" && (
          <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-full bg-[#a32d2d] px-2.5 py-1 text-[12px] font-[700] text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" />
            {t("clipRecorder.rec", "REC {{elapsed}} / {{max}}", { elapsed: fmt(elapsed), max: fmt(MAX_SECONDS) })}
          </div>
        )}
        {phase === "ready" && (
          <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-[700] text-white">
            {t("clipRecorder.livePreview", "Live preview")}
          </div>
        )}
      </div>

      <div className="flex gap-2.5">
        {phase === "ready" && (
          <>
            <button
              type="button"
              onClick={beginRecording}
              className={`${MAIN_BTN} flex-1`}
            >
              <Video className="size-5" aria-hidden="true" /> {t("clipRecorder.startRecording", "Start recording")}
            </button>
            <button
              type="button"
              onClick={cancel}
              className={SECOND_BTN}
            >
              <RotateCcw className="size-4" aria-hidden="true" /> {t("clipRecorder.cancel", "Cancel")}
            </button>
          </>
        )}
        {phase === "recording" && (
          <button
            type="button"
            onClick={stop}
            className={`${MAIN_BTN} flex-1`}
          >
            <Square className="size-4" aria-hidden="true" /> {t("clipRecorder.stopSave", "Stop & save")}
          </button>
        )}
        {phase === "stopping" && (
          <div className="inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-[#f1f5f0] text-[16px] font-[700] text-[#1a3d2e]">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" /> {t("clipRecorder.finalizing", "Finalizing…")}
          </div>
        )}
      </div>

      {errorEl}
    </div>
  );
}
