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
    throw new Error(`Cloudflare Stream: ${msg}`);
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

export type StreamStatus = {
  uid: string;
  readyToStream: boolean;
  state: string | undefined; // queued | inprogress | ready | error
  errorReason: string | undefined;
  thumbnail: string | undefined;
  duration: number | undefined;
  // The `creator` we stamped at upload time (= the uploader's user id). Used by
  // the ownership gate to confirm a caller may act on a not-yet-persisted clip.
  creator: string | undefined;
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
    creator: r.creator ?? undefined,
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
