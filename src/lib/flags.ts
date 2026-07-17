/**
 * Feature flags.
 *
 * Deliberately a source constant, not a Vercel env var: adding VITE_* env vars
 * in Vercel has reliably broken this project's deploys (EnvFileReadError 500s,
 * reproduced twice on 2026-07-17 — see src/lib/analytics.ts). Toggling in
 * production = flip the default here and redeploy. The env override exists for
 * LOCAL DEV ONLY (e.g. VITE_QUICKSTART_ONBOARDING=false in .env.local).
 */

function boolFlag(envValue: unknown, fallback: boolean): boolean {
  if (envValue === undefined || envValue === null || envValue === "") return fallback;
  return String(envValue).toLowerCase() !== "false" && envValue !== "0";
}

/**
 * Quickstart onboarding: welcome leads with "Add my bird" instead of the tour,
 * /birds/new defers optional fields behind a disclosure, and creating a bird
 * lands on Home with a three-door care-profile invite instead of auto-launching
 * the 8-step wizard. Off = the pre-redesign flow, unchanged.
 */
export const QUICKSTART_ONBOARDING: boolean = boolFlag(
  (import.meta as any).env?.VITE_QUICKSTART_ONBOARDING,
  true,
);
