/**
 * Which Vercel environment this build is for, and the third-party credentials
 * that only production may use.
 *
 * Previews run against the staging Supabase branch (see supabaseEnv.ts), and
 * they must not reach production's outside services either: no analytics or
 * error reports into the production PostHog project, no real email. Vercel's
 * Preview scope no longer holds those credentials, but the PostHog project key
 * is a literal in the code (an env var for it once 500'd production; see
 * analytics.ts), so it is gated here instead: production builds get the key,
 * every other build gets null, and the minifier drops the literal from them.
 *
 * __KYA_DEPLOY_ENV__ is injected by vite.config.ts from VERCEL_ENV at build
 * time ("production" | "preview"; anything else is local development).
 */

export type DeployEnv = "production" | "preview" | "development";

export const DEPLOY_ENV: DeployEnv =
  typeof __KYA_DEPLOY_ENV__ !== "undefined" && __KYA_DEPLOY_ENV__ === "production"
    ? "production"
    : typeof __KYA_DEPLOY_ENV__ !== "undefined" && __KYA_DEPLOY_ENV__ === "preview"
      ? "preview"
      : "development";

/** The production PostHog project key (a public client identifier, not a
 *  secret), or null in any build that is not production. */
export const POSTHOG_PROJECT_KEY: string | null =
  typeof __KYA_DEPLOY_ENV__ !== "undefined" && __KYA_DEPLOY_ENV__ === "production"
    ? "phc_qkMPyAbqFHDcG6FdXFBQUsiyPsbMjbCX2hNSw2bddPKh"
    : null;

/** Server runtime: true inside a Vercel preview deployment. */
export function isPreviewRuntime(): boolean {
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.VERCEL_ENV === "preview";
}
