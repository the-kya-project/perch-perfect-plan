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
    throw new Error(`Cloudflare Stream: ${msg}`);
  }
  return json.result;
}

/**
 * One-time direct-upload URL. The browser POSTs the raw video to `uploadURL`
 * (multipart/form-data, field "file") — no token needed there. Cloudflare
 * transcodes automatically. `requireSignedURLs` keeps clips private (playback
 * needs a signed token, minted per viewer below).
 */
export async function createDirectUpload(opts: { maxDurationSeconds?: number; creator?: string } = {}) {
  const result = await cf(`/stream/direct_upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      maxDurationSeconds: opts.maxDurationSeconds ?? 60,
      requireSignedURLs: true,
      ...(opts.creator ? { creator: opts.creator } : {}),
    }),
  });
  return { uploadURL: result.uploadURL as string, uid: result.uid as string };
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
