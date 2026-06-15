// Browser-side video conversion to H.264 MP4 (AAC audio) using ffmpeg.wasm.
// Solves the iPhone HEVC/.mov problem so the same clip plays in Chrome / Android.
// Single-threaded core; loaded lazily from a CDN so the main bundle stays small.

const CORE_VERSION = "0.12.10";
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

export const MAX_CLIP_SECONDS = 45;
export const MAX_CLIP_BYTES = 25 * 1024 * 1024;

let ffmpegPromise: Promise<any> | null = null;

async function loadFfmpeg() {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ff = new FFmpeg();
      await ff.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ff;
    })().catch((err) => {
      ffmpegPromise = null;
      throw err;
    });
  }
  return ffmpegPromise;
}

/** Probe duration in seconds. Returns 0 if metadata can't be read. */
export function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = url;
    const done = (d: number) => { URL.revokeObjectURL(url); resolve(d); };
    v.onloadedmetadata = () => done(isFinite(v.duration) ? v.duration : 0);
    v.onerror = () => done(0);
  });
}

export type ConvertResult = {
  file: File;
  converted: boolean;
  /** Reason conversion was skipped or failed; absent on success. */
  reason?: string;
};

/**
 * Convert a clip to H.264 MP4 + AAC audio so it plays in every browser.
 * On failure, returns the original file with `converted: false` and a reason —
 * the caller decides whether to upload it anyway.
 */
export async function convertToMp4H264(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ConvertResult> {
  try {
    const ff = await loadFfmpeg();
    const { fetchFile } = await import("@ffmpeg/util");
    const extMatch = file.name.match(/\.[a-zA-Z0-9]+$/);
    const inName = `input${extMatch ? extMatch[0] : ".mov"}`;
    const outName = "output.mp4";

    await ff.writeFile(inName, await fetchFile(file));

    const progress = (e: { progress: number }) => {
      const p = Math.max(0, Math.min(1, e.progress || 0));
      onProgress?.(p);
    };
    ff.on("progress", progress);

    // ultrafast + crf 26: keep transcode quick on phones; quality is fine for
    // short sitter reference clips. yuv420p + faststart for broad playback.
    await ff.exec([
      "-i", inName,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "26",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",
      outName,
    ]);

    ff.off("progress", progress);

    const data = (await ff.readFile(outName)) as Uint8Array;
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});

    const base = file.name.replace(/\.[^.]+$/, "") || "clip";
    const out = new File([data as BlobPart], `${base}.mp4`, { type: "video/mp4" });
    return { file: out, converted: true };
  } catch (err: any) {
    return { file, converted: false, reason: err?.message ?? "Conversion failed" };
  }
}
