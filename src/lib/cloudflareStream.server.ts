// Server-only Cloudflare Stream client. The .server.ts suffix keeps this (and
// the API token) out of the client bundle. Env binds per-request on some hosts,
// so read process.env INSIDE the call, never at module scope.
//
// Required env (set in Vercel + Supabase): CLOUDFLARE_ACCOUNT_ID,
// CLOUDFLARE_STREAM_TOKEN (an API token with Account → Stream → Edit).

import process from "node:process";

const API_BASE = "https://api.cloudflare.com/client/v4";

function creds() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  if (!accountId || !token) {
    throw new Error(
      "Cloudflare Stream is not configured (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_STREAM_TOKEN).",
    );
  }
  return { accountId, token };
}

/** Error from the Cloudflare API, carrying the HTTP status for the caller. */
export class CloudflareStreamError extends Error {
  status: number;
  codes: number[];
  constructor(message: string, status: number, codes: number[] = []) {
    super(message);
    this.name = "CloudflareStreamError";
    this.status = status;
    this.codes = codes;
  }
}

async function cf(path: string, init?: RequestInit): Promise<any> {
  const { accountId, token } = creds();
  const res = await fetch(`${API_BASE}/accounts/${accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    const msg = json?.errors?.[0]?.message || res.statusText || "request failed";
    // Log the full Cloudflare error server-side so it shows in runtime logs —
    // a thrown serverFn error comes back as a 200 envelope and is otherwise
    // invisible. Includes the HTTP status and Cloudflare's error array.
    console.error(`[cloudflareStream] ${path} HTTP ${res.status}:`, JSON.stringify(json?.errors ?? json));
    const codes = Array.isArray(json?.errors)
      ? json.errors.map((e: any) => Number(e?.code)).filter((n: number) => Number.isFinite(n))
      : [];
    throw new CloudflareStreamError(`Cloudflare Stream: ${msg}`, res.status, codes);
  }
  return json.result;
}

/**
 * Create a resumable (tus) direct-creator upload. We make the tus creation POST
 * server-side (so the API token stays here) with `?direct_user=true`, which
 * returns a `Location` the browser can upload to via the tus protocol WITHOUT
 * the token. Resumable uploads survive flaky mobile connections — they retry and
 * resume on drops instead of failing the whole transfer.
 *
 * `Upload-Length` (the file's byte size) must be known up front, so the browser
 * passes it in. `requiresignedurls` keeps clips private (signed playback below).
 */
export async function createTusDirectUpload(opts: { uploadLength: number; maxDurationSeconds?: number; creator?: string }) {
  const { accountId, token } = creds();
  const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
  // tus Upload-Metadata: comma-separated "key b64value" pairs; flags are key-only.
  const metadata = [
    "requiresignedurls",
    `maxdurationseconds ${b64(String(opts.maxDurationSeconds ?? 60))}`,
    ...(opts.creator ? [`creator ${b64(opts.creator)}`] : []),
  ].join(",");

  const res = await fetch(`${API_BASE}/accounts/${accountId}/stream?direct_user=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Tus-Resumable": "1.0.0",
      "Upload-Length": String(opts.uploadLength),
      "Upload-Metadata": metadata,
    },
  });
  if (res.status !== 201) {
    const text = await res.text().catch(() => "");
    console.error(`[cloudflareStream] tus create HTTP ${res.status}:`, text.slice(0, 300));
    throw new Error(`Cloudflare Stream: couldn't start upload (HTTP ${res.status}).`);
  }
  const uploadURL = res.headers.get("Location");
  const uid = res.headers.get("stream-media-id");
  if (!uploadURL || !uid) {
    console.error("[cloudflareStream] tus create missing Location/stream-media-id");
    throw new Error("Cloudflare Stream: upload URL missing from response.");
  }
  return { uploadURL, uid };
}

/**
 * Permanently delete one video. Cloudflare returns 200 with an empty result on
 * success. A 404 (already gone) is treated as success: the goal is "this uid no
 * longer exists", and failing a bird/account deletion because a video was
 * already removed would block the caller forever.
 *
 * The check is on the HTTP STATUS, not the message text. It used to regex the
 * error string for "not found|10007|404", which quietly depended on Cloudflare
 * wording: `res.statusText` is an empty string over HTTP/2, so a 404 whose body
 * failed to parse produced the message "request failed", missed the regex, and
 * threw — turning an already-deleted clip into a hard failure. 10003/10007
 * (Cloudflare's own not-found codes) are honoured too, in case a not-found ever
 * arrives with a non-404 status.
 *
 * The configured token needs Account -> Stream -> Edit, which is what the app
 * already requires to create uploads.
 */
export async function deleteVideo(uid: string): Promise<void> {
  try {
    await cf(`/stream/${uid}`, { method: "DELETE" });
  } catch (e: any) {
    if (e instanceof CloudflareStreamError) {
      if (e.status === 404) return;
      if (e.codes.some((c) => c === 10003 || c === 10007)) return;
    }
    throw e;
  }
}

export type StreamStatus = {
  uid: string;
  readyToStream: boolean;
  state: string | undefined; // queued | inprogress | ready | error
  errorReason: string | undefined;
  thumbnail: string | undefined;
  duration: number | undefined;
};

export async function getVideoStatus(uid: string): Promise<StreamStatus> {
  const r = await cf(`/stream/${uid}`, { method: "GET" });
  return {
    uid,
    readyToStream: !!r.readyToStream,
    state: r.status?.state,
    errorReason: r.status?.errReasonText,
    thumbnail: r.thumbnail,
    duration: r.duration,
  };
}

/** Short-lived signed token for private playback of one video. */
export async function signPlaybackToken(uid: string, ttlSeconds = 3600): Promise<string> {
  const r = await cf(`/stream/${uid}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + ttlSeconds }),
  });
  return r.token as string;
}

/** Player iframe URL for a signed token (generic delivery domain). */
export function iframeUrlForToken(token: string): string {
  return `https://iframe.videodelivery.net/${token}`;
}

/** Mint a ready-to-embed signed iframe URL for a video uid. */
export async function signedIframeUrl(uid: string, ttlSeconds = 3600): Promise<string> {
  const token = await signPlaybackToken(uid, ttlSeconds);
  return iframeUrlForToken(token);
}
