/**
 * Apple WeatherKit REST client (backlog D2.2). Server-only.
 *
 * One call: the daily forecast for a point. The point is the middle of a ZIP or
 * postcode area (postcodeCentroids.server.ts), never a person's location, and
 * the request carries nothing about the account.
 *
 * Env (Vercel, Production only): WEATHERKIT_TEAM_ID, WEATHERKIT_KEY_ID,
 * WEATHERKIT_SERVICE_ID, WEATHERKIT_PRIVATE_KEY (the .p8 contents). Missing
 * any of them, or in a preview, there is no call and no weather.
 *
 * The token is an ES256 JWT signed with node:crypto, in the JOSE (raw r||s)
 * form, as apns.server.ts does; no JWT dependency. node:crypto is imported
 * dynamically for the same reason as there (Vite walks static imports).
 */

const BASE = "https://weatherkit.apple.com/api/v1/weather/en";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Accept a .p8 as raw PEM, PEM with escaped newlines, or base64 of the file. */
function normalisePem(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    return trimmed.includes("\\n") ? trimmed.replace(/\\n/g, "\n") : trimmed;
  }
  const decoded = Buffer.from(trimmed, "base64").toString("utf8");
  if (!decoded.includes("BEGIN PRIVATE KEY")) throw new Error("WEATHERKIT_PRIVATE_KEY is neither PEM nor base64-encoded PEM");
  return decoded;
}

export function weatherKitConfigured(): boolean {
  return (
    process.env.VERCEL_ENV !== "preview" &&
    !!process.env.WEATHERKIT_TEAM_ID &&
    !!process.env.WEATHERKIT_KEY_ID &&
    !!process.env.WEATHERKIT_SERVICE_ID &&
    !!process.env.WEATHERKIT_PRIVATE_KEY
  );
}

let cachedToken: { jwt: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - now > 5 * 60) return cachedToken.jwt;
  const teamId = process.env.WEATHERKIT_TEAM_ID!;
  const keyId = process.env.WEATHERKIT_KEY_ID!;
  const serviceId = process.env.WEATHERKIT_SERVICE_ID!;
  const exp = now + 60 * 60;
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId, id: `${teamId}.${serviceId}` }));
  const claims = base64url(JSON.stringify({ iss: teamId, iat: now, exp, sub: serviceId }));
  const signingInput = `${header}.${claims}`;
  const { createSign } = await import("node:crypto");
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: normalisePem(process.env.WEATHERKIT_PRIVATE_KEY!), dsaEncoding: "ieee-p1363" });
  const jwt = `${signingInput}.${base64url(signature)}`;
  cachedToken = { jwt, expiresAt: exp };
  return jwt;
}

/** WeatherKit's JSON with `forecastDaily`. Throws when it isn't configured or
 *  the call fails; the caller treats that as "no forecast". */
export async function fetchDailyForecast(lat: number, lon: number, timeZone: string): Promise<unknown> {
  if (!weatherKitConfigured()) throw new Error("weatherkit-not-configured");
  const url = `${BASE}/${lat.toFixed(2)}/${lon.toFixed(2)}?dataSets=forecastDaily&timezone=${encodeURIComponent(timeZone)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${await token()}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`weatherkit ${res.status}`);
  return res.json();
}
