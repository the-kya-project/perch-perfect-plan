// The ONE way a Supabase user id becomes a PostHog distinct_id: SHA-256 of
// `kya:<uuid>`, hex. PostHog never sees the raw id. Shared by the browser
// (analytics identify, error reports) and the server (server-side error reports,
// account deletion), so the same person lines up across all of them — change it
// here and every existing PostHog person is orphaned.
//
// Isomorphic: Web Crypto exists in browsers and in Node 18+ (Vercel functions).
// Returns null when hashing is unavailable — callers must then send nothing
// rather than fall back to the raw id.

export async function hashUserId(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const buf = await subtle.digest("SHA-256", new TextEncoder().encode(`kya:${userId}`));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}
