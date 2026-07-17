/**
 * Privacy-friendly product analytics wrapper around PostHog.
 *
 * PostHog is initialised by PostHogProvider in src/routes/__root.tsx.
 * This module exposes a thin typed API used throughout the app.
 *
 * Rules:
 *  - Never put PII in capture() properties. PII goes on the person via identify().
 *  - User IDs are hashed before being passed to identify() for extra privacy.
 */

import posthog from "posthog-js";

// ---------------- Event catalogue ----------------

export type AnalyticsEventName =
  | "owner_signup"
  | "guided_editor_opened"
  | "care_plan_section_completed"
  | "care_plan_progress"
  | "sit_created"
  | "sit_edited"
  | "sitter_link_opened"
  | "health_scan_run"
  | "clip_viewed"
  | "care_sheet_viewed"
  | "marketing_opt_in_checked"
  // New events
  | "bird_added"
  | "weight_logged"
  | "care_plan_viewed"
  | "care_plan_editor_opened"
  | "view_as_sitter_opened"
  | "concern_flow_started"
  | "household_member_invited"
  | "bird_handoff_initiated";

type EventProps = Record<string, string | number | boolean | null | undefined>;

// ---------------- Internals ----------------

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/** SHA-256 → hex. Used to hash user ids before identify(). */
async function sha256Hex(input: string): Promise<string> {
  if (!isBrowser() || !window.crypto?.subtle) return input;
  const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Drop any property whose value looks like it could be PII. */
function scrub(props?: EventProps): EventProps {
  if (!props) return {};
  const out: EventProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    const lk = k.toLowerCase();
    if (/email|name|token|note|message|address|phone|url|path|file/.test(lk)) continue;
    if (typeof v === "string" && v.length > 80) continue;
    out[k] = v;
  }
  return out;
}

// ---------------- Public API ----------------

/** No-op kept for call-site compatibility. PostHogProvider handles init. */
export function initAnalytics() {}

/** Track an event. Drops PII-shaped properties before sending. */
export function track(name: AnalyticsEventName, props?: EventProps) {
  if (!isBrowser()) return;
  posthog.capture(name, scrub(props));
}

/** Identify the current user. The id is hashed before being sent. */
export async function identifyUser(userId: string | null | undefined) {
  if (!isBrowser() || !userId) return;
  const hashed = await sha256Hex(`kya:${userId}`);
  posthog.identify(hashed);
}

/** Clear identity on sign-out. */
export function resetUser() {
  if (!isBrowser()) return;
  posthog.reset();
}
