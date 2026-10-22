/**
 * Which Supabase project a build or server talks to, and the guard that keeps
 * Vercel preview deployments off the production database.
 *
 * Production is unchanged: its builds read the same VITE_/SUPABASE_ variables
 * they always have, and nothing here runs for them. Every preview uses the
 * persistent "staging" Supabase branch through the general Preview variables
 * in Vercel (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY); the
 * production Supabase variables are scoped to Production only. A PR with its
 * own migrations still gets a Supabase preview branch for testing the SQL, but
 * its Vercel preview stays on staging.
 *
 * A preview must never resolve to production. If it does (a Vercel setting
 * drifts, someone re-adds Preview to a production variable), the build fails
 * and the server clients refuse to start, rather than quietly writing to real
 * people's data.
 *
 * Imported by vite.config.ts at build time, so keep it free of app imports.
 */

export const PRODUCTION_SUPABASE_REF = "koyqdyamazuuwvqbttnj";

export const PREVIEW_ON_PRODUCTION_MESSAGE =
  "This Vercel preview resolved to the PRODUCTION Supabase project. Previews must use " +
  "the staging Supabase branch. Check the Preview-scoped " +
  "Supabase variables in Vercel (Settings → Environment Variables).";

type Env = Record<string, string | undefined>;

// Unprefixed first: it is the name the server reads at runtime, so the browser
// bundle and the server functions always agree on one project. A VITE_ copy
// that names a different project fails the build instead of splitting them.
const URL_KEYS = ["SUPABASE_URL", "VITE_SUPABASE_URL"];
const PUBLISHABLE_KEY_KEYS = ["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"];

/** Project ref from a Supabase URL (`https://<ref>.supabase.co`), else the host. */
export function supabaseRef(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".supabase.co") ? host.split(".")[0] : host;
  } catch {
    return null;
  }
}

export function isProductionSupabase(url: string): boolean {
  return supabaseRef(url) === PRODUCTION_SUPABASE_REF;
}

/** Runtime guard for server code that reads SUPABASE_URL from process.env. */
export function assertNotProductionInPreview(url: string | undefined, vercelEnv: string | undefined): void {
  if (vercelEnv === "preview" && url && isProductionSupabase(url)) {
    console.error(`[Supabase] ${PREVIEW_ON_PRODUCTION_MESSAGE}`);
    throw new Error(PREVIEW_ON_PRODUCTION_MESSAGE);
  }
}

/**
 * Build-time resolution for a Vercel preview. Throws (failing the build) when
 * the settings are missing, disagree with each other, or point at production.
 * Only the URL and the publishable key are returned: both ship to the browser
 * by design. Secret keys are never read here.
 */
export function resolvePreviewSupabase(env: Env): { url: string; publishableKey: string; ref: string } {
  const urls = URL_KEYS.flatMap((key) => {
    const value = env[key]?.trim();
    return value ? [{ key, value, ref: supabaseRef(value) }] : [];
  });
  if (urls.length === 0) {
    throw new Error(
      "This Vercel preview has no Supabase URL. Previews need the Preview-scoped staging " +
        "variables in Vercel (SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY).",
    );
  }
  const refs = new Set(urls.map((u) => u.ref));
  if (refs.size > 1) {
    // Refs are public (they are in every API URL), so naming them is safe.
    const detail = urls.map((u) => `${u.key}=${u.ref}`).join(", ");
    throw new Error(`This Vercel preview's Supabase URL variables disagree (${detail}). They must name one project.`);
  }
  const { value: url, ref } = urls[0];
  if (!ref || ref === PRODUCTION_SUPABASE_REF) throw new Error(PREVIEW_ON_PRODUCTION_MESSAGE);

  const publishableKey = PUBLISHABLE_KEY_KEYS.map((key) => env[key]?.trim()).find(Boolean);
  if (!publishableKey) {
    throw new Error(`This Vercel preview has a Supabase URL (${ref}) but no publishable key.`);
  }
  return { url, publishableKey, ref };
}
