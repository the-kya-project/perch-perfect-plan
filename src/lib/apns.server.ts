/**
 * APNs sender (iOS native push). Server-only.
 *
 * Talks to Apple directly -- no Firebase in the iOS binary, matching how the
 * Facebook SDK is kept out (see CLAUDE.md). That costs us this file and nothing
 * else: APNs is a plain HTTP/2 POST with a signed JWT.
 *
 * Two things force implementation details here:
 *   1. APNs is HTTP/2 ONLY. Node's global `fetch` (undici) speaks HTTP/1.1, so
 *      this uses `node:http2` rather than fetch.
 *   2. The provider token is an ES256 JWT. Apple wants the JOSE form (raw r||s,
 *      64 bytes), NOT the DER encoding `crypto.sign` produces by default --
 *      hence `dsaEncoding: "ieee-p1363"`. Getting this wrong yields a confusing
 *      403 InvalidProviderToken.
 *
 * No JWT dependency is added; `node:crypto` covers it.
 */
// node:crypto and node:http2 are imported DYNAMICALLY, inside the functions
// that use them. The `.server.ts` suffix is a convention in this repo, not a
// bundler guarantee: Vite still walks this module's static imports, and neither
// builtin has a browser shim, so a top-level import resolves to
// __vite-browser-external and fails the production build with
// `"createSign" is not exported`. node:process is fine at the top level (it IS
// shimmed) — these two are not.
//
// The type-only import below is erased at compile time and emits no runtime
// require, so it does not reintroduce the problem.
import type { ClientHttp2Session } from "node:http2";

const PROD_HOST = "https://api.push.apple.com";
const SANDBOX_HOST = "https://api.sandbox.push.apple.com";

export interface ApnsMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Outcome per token so the caller can prune dead rows. */
export type ApnsResult = { ok: true } | { ok: false; prune: boolean; reason: string };

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Accept a .p8 as raw PEM, PEM with escaped newlines, or base64 of the file. */
function normalisePem(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    return trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
  }
  // No PEM header: assume base64 of the whole file.
  const decoded = Buffer.from(trimmed, "base64").toString("utf8");
  if (!decoded.includes("BEGIN PRIVATE KEY")) {
    throw new Error("APNS_PRIVATE_KEY is neither PEM nor base64-encoded PEM");
  }
  return decoded;
}

/**
 * Apple requires the provider token be refreshed at least hourly and NOT more
 * often than every 20 minutes -- reissuing on every send earns a 429
 * TooManyProviderTokenUpdates. Cached per warm instance and reissued at 45min.
 */
let cachedToken: { jwt: string; issuedAt: number } | null = null;

async function providerToken(): Promise<string> {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const privateKey = process.env.APNS_PRIVATE_KEY;
  if (!keyId || !teamId || !privateKey) throw new Error("apns-not-configured");

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedToken.issuedAt < 45 * 60) return cachedToken.jwt;

  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = base64url(JSON.stringify({ iss: teamId, iat: now }));
  const signingInput = `${header}.${claims}`;

  // A .p8 is multi-line PEM, which is awkward to get into an env var intact:
  // pasting mangles it and piping it into a CLI prompt loses the first line.
  // So accept three shapes — raw PEM, PEM with escaped \n, or base64 of the
  // whole file — and normalise here. base64 is the one to prefer when setting
  // it, because it is a single line and cannot be corrupted in transit.
  const pem = normalisePem(privateKey);

  const { createSign } = await import("node:crypto");
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: pem, dsaEncoding: "ieee-p1363" });

  const jwt = `${signingInput}.${base64url(signature)}`;
  cachedToken = { jwt, issuedAt: now };
  return jwt;
}

/** One HTTP/2 POST to /3/device/<token>. Resolves with Apple's status + reason. */
async function post(
  host: string,
  deviceToken: string,
  payload: string,
  jwt: string,
  topic: string,
): Promise<{ status: number; reason: string }> {
  const http2 = (await import("node:http2")).default;
  return new Promise((resolve) => {
    let session: ClientHttp2Session;
    try {
      session = http2.connect(host);
    } catch (err) {
      resolve({ status: 0, reason: `connect-failed:${String(err)}` });
      return;
    }
    // A dead socket must not hang a cron invocation.
    const timer = setTimeout(() => {
      try { session.destroy(); } catch { /* already gone */ }
      resolve({ status: 0, reason: "timeout" });
    }, 10_000);

    session.on("error", (err) => {
      clearTimeout(timer);
      try { session.destroy(); } catch { /* already gone */ }
      resolve({ status: 0, reason: `session-error:${err.message}` });
    });

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let status = 0;
    let raw = "";
    req.on("response", (headers) => { status = Number(headers[":status"] ?? 0); });
    req.setEncoding("utf8");
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      clearTimeout(timer);
      try { session.close(); } catch { /* already gone */ }
      let reason = "";
      if (raw) { try { reason = JSON.parse(raw).reason ?? ""; } catch { reason = raw.slice(0, 120); } }
      resolve({ status, reason });
    });
    req.on("error", (err) => {
      clearTimeout(timer);
      try { session.destroy(); } catch { /* already gone */ }
      resolve({ status: 0, reason: `request-error:${err.message}` });
    });

    req.end(payload);
  });
}

/**
 * Send one alert to one device token.
 *
 * Environment handling: a TestFlight/dev build registers a SANDBOX token and an
 * App Store build a PRODUCTION one, and the two servers reject each other's
 * tokens with 400 BadDeviceToken. Rather than store which is which per row, we
 * try production and fall back to sandbox on exactly that error -- so an
 * internal test build and a shipped build both work with no extra column.
 */
export async function sendApns(deviceToken: string, msg: ApnsMessage): Promise<ApnsResult> {
  const topic = process.env.APNS_BUNDLE_ID || "com.thekyaproject.app";
  let jwt: string;
  try {
    jwt = await providerToken();
  } catch {
    return { ok: false, prune: false, reason: "apns-not-configured" };
  }

  const payload = JSON.stringify({
    aps: {
      alert: { title: msg.title, body: msg.body },
      sound: "default",
      "thread-id": msg.tag,
    },
    // Read by the app when the user taps the notification.
    url: msg.url,
  });

  let res = await post(PROD_HOST, deviceToken, payload, jwt, topic);
  if (res.status === 400 && res.reason === "BadDeviceToken") {
    res = await post(SANDBOX_HOST, deviceToken, payload, jwt, topic);
  }

  if (res.status === 200) return { ok: true };

  // 410 Unregistered: app deleted. 400 BadDeviceToken after BOTH hosts: the
  // token is not ours. Either way the row is dead and should go.
  const prune =
    res.status === 410 ||
    (res.status === 400 && ["BadDeviceToken", "DeviceTokenNotForTopic"].includes(res.reason));
  return { ok: false, prune, reason: res.reason || `status-${res.status}` };
}

/** True when the APNs credentials are present, so callers can skip cleanly. */
export function apnsConfigured(): boolean {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY);
}
