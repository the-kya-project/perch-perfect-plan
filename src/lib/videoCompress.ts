// Client-side video compression for care-plan clips.
//
// Owners upload clips straight from their phone — a 30–60s iPhone clip can be
// 80–150 MB of 4K HEVC, which both blows past the storage limit and won't play
// in non-Safari browsers. We re-encode in the browser to a small, broadly
// playable H.264 MP4 (≤720p, audio retained) before upload, using ffmpeg.wasm.
//
// ffmpeg.wasm (~30 MB wasm core, loaded from a CDN) is imported LAZILY — only
// when an upload actually starts — so it never slows app startup, especially for
// sitters who never upload. Callers must treat compression as best-effort: if it
// fails (older phone, unsupported browser, out of memory), fall back to
// uploading the original file (subject to the raw size limit).

import type { FFmpeg } from "@ffmpeg/ffmpeg";

// Single-threaded core: no SharedArrayBuffer, so it works on iOS Safari without
// cross-origin-isolation (COOP/COEP) headers. Slower than the MT core, but the
// MT core would require app-wide header changes that break other resources.
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

let ffmpegPromise: Promise<FFmpeg> | null = null;

async function loadFFmpeg(): Promise<FFmpeg> {
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
    })().catch((e) => {
      // Allow a later upload to retry the load instead of caching the failure.
      ffmpegPromise = null;
      throw e;
    });
  }
  return ffmpegPromise;
}

export type CompressStage = "loading" | "compressing";

export type CompressOptions = {
  /** Output file base name (without extension). */
  baseName: string;
  /** "loading" while the wasm core downloads, then "compressing". */
  onStage?: (stage: CompressStage) => void;
  /** Re-encode progress, 0..1 (best-effort — ffmpeg.wasm progress can be coarse). */
  onProgress?: (ratio: number) => void;
};

/**
 * Re-encode a video to a small H.264 MP4 (≤720p, AAC audio, faststart).
 * Decodes HEVC/.mov input and outputs cross-browser-playable .mp4.
 *
 * Throws on any failure — the caller is expected to fall back to the original.
 */
export async function compressVideo(file: File, opts: CompressOptions): Promise<File> {
  opts.onStage?.("loading");
  const ff = await loadFFmpeg();
  const { fetchFile } = await import("@ffmpeg/util");

  const stamp = `${Math.floor(performance.now())}_${Math.floor(file.size % 100000)}`;
  const inName = `in_${stamp}`;
  const outName = `out_${stamp}.mp4`;

  const onProg = (ev: { progress: number }) => {
    const r = ev?.progress;
    if (typeof r === "number" && r >= 0 && r <= 1) opts.onProgress?.(r);
  };

  try {
    await ff.writeFile(inName, await fetchFile(file));
    opts.onStage?.("compressing");
    ff.on("progress", onProg);
    // Fit within a 1280x720 box (works for portrait or landscape), keep aspect,
    // force even dimensions for yuv420p/libx264. CRF 28 + veryfast keeps a
    // 1-minute clip in the ~10–25 MB range while staying tolerable on phones.
    await ff.exec([
      "-i", inName,
      "-vf", "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      outName,
    ]);
    const data = await ff.readFile(outName);
    const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(String(data));
    if (!bytes.length) throw new Error("Compression produced an empty file");
    return new File([bytes as BlobPart], `${opts.baseName}.mp4`, { type: "video/mp4" });
  } finally {
    try { ff.off("progress", onProg); } catch {}
    try { await ff.deleteFile(inName); } catch {}
    try { await ff.deleteFile(outName); } catch {}
  }
}
