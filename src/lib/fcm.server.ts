/**
 * FCM sender (Android native push). Server-only.
 *
 * Uses the FCM HTTP v1 API, which needs an OAuth2 access token minted from a
 * service account. That is a signed RS256 JWT exchanged at Google's token
 * endpoint -- done here with `node:crypto` rather than pulling in
 * google-auth-library / firebase-admin, both of which are large and would ship
 * a lot of surface for one POST.
 *
 * Android is FCM-only because Capacitor's push plugin requires it there. iOS
 * deliberately does NOT go through FCM -- see apns.server.ts.
 */
// node:crypto is imported dynamically inside accessToken(): a top-level
// import resolves to __vite-browser-external in the client graph and fails
// the production build (see apns.server.ts for the full explanation).

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

export interface FcmMessage {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export type FcmResult = { ok: true } | { ok: false; prune: boolean; reason: string };

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    // Accept either raw JSON or base64-encoded JSON -- pasting a multi-line
    // key into a Vercel env var is error-prone, so base64 is the safer form.
    const text = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const sa = JSON.parse(text) as ServiceAccount;
    if (!sa.client_email || !sa.private_key || !sa.project_id) return null;
    return sa;
  } catch {
    return null;
  }
}

/** Access tokens last an hour; cache per warm instance and refresh at 50min. */
let cachedAccess: { token: string; expiresAt: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccess && cachedAccess.expiresAt - 600 > now) return cachedAccess.token;

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const pem = sa.private_key.includes("\\n")
    ? sa.private_key.replace(/\\n/g, "\n")
    : sa.private_key;

  const { createSign } = await import("node:crypto");
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const jwt = `${signingInput}.${base64url(signer.sign(pem))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    console.error("[fcm] token exchange failed", res.status, (await res.text()).slice(0, 200));
    return null;
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;
  cachedAccess = { token: json.access_token, expiresAt: now + (json.expires_in ?? 3600) };
  return json.access_token;
}

/** Send one notification to one FCM registration token. */
export async function sendFcm(deviceToken: string, msg: FcmMessage): Promise<FcmResult> {
  const sa = serviceAccount();
  if (!sa) return { ok: false, prune: false, reason: "fcm-not-configured" };

  const token = await accessToken(sa);
  if (!token) return { ok: false, prune: false, reason: "fcm-auth-failed" };

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: msg.title, body: msg.body },
          // Tapping the notification opens this; read by the app.
          data: { url: msg.url ?? "", tag: msg.tag ?? "" },
          android: { priority: "HIGH", notification: { tag: msg.tag } },
        },
      }),
    },
  );

  if (res.ok) return { ok: true };

  const text = (await res.text()).slice(0, 300);
  // UNREGISTERED (404) = app uninstalled or token rotated. INVALID_ARGUMENT
  // (400) on the token field = malformed token. Both mean the row is dead.
  const prune =
    res.status === 404 ||
    (res.status === 400 && /INVALID_ARGUMENT/.test(text) && /token/i.test(text));
  if (!prune) console.error("[fcm] send failed", res.status, text);
  return { ok: false, prune, reason: `status-${res.status}` };
}

/** True when FCM credentials are present, so callers can skip cleanly. */
export function fcmConfigured(): boolean {
  return !!serviceAccount();
}
