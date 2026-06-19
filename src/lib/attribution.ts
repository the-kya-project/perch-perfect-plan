// First-touch signup attribution.
//
// Captures where a visitor first came from (UTMs + referrer + landing page) on
// their first page load and persists it in localStorage with FIRST-TOUCH
// semantics — never overwritten by later visits — so it survives the gap between
// landing and signing up (possibly days later). At signup it's written to the
// user's profile (Supabase) and pushed to Brevo. Capture is additive and must
// never block page load or account creation.

import { supabase } from "@/integrations/supabase/client";
import { captureLead } from "./captureLead";

const KEY = "ppc_attribution_first_touch";
const FRESH_SIGNUP_WINDOW_MS = 30 * 60 * 1000; // only attribute genuinely new users

export type Attribution = {
  source: string;
  medium: string;
  campaign: string;
  term: string;
  content: string;
  referrer: string;
  landing_page: string;
  first_seen_at: string; // ISO timestamp
};

/** Read + store first-touch attribution on first landing. Idempotent: only the
 *  very first call (with no stored value) writes; later loads are no-ops. */
export function captureFirstTouch(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(KEY)) return; // first-touch: don't overwrite

    const params = new URLSearchParams(window.location.search);
    const get = (k: string) => (params.get(k) ?? "").trim();
    const utmSource = get("utm_source");
    const utmMedium = get("utm_medium");
    const referrer = (typeof document !== "undefined" ? document.referrer : "") || "";

    // Source: utm_source → referrer host → "direct". Never blank.
    let source = utmSource;
    let medium = utmMedium;
    if (!source) {
      if (referrer) {
        try {
          source = new URL(referrer).hostname.replace(/^www\./, "");
        } catch {
          source = "referral";
        }
        if (!medium) medium = "referral";
      } else {
        source = "direct";
        if (!medium) medium = "direct";
      }
    }

    const data: Attribution = {
      source,
      medium,
      campaign: get("utm_campaign"),
      term: get("utm_term"),
      content: get("utm_content"),
      referrer,
      landing_page: window.location.pathname + window.location.search,
      first_seen_at: new Date().toISOString(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Never break page load.
  }
}

export function getFirstTouch(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d === "object" && typeof d.source === "string" ? (d as Attribution) : null;
  } catch {
    return null;
  }
}

/** Flat metadata for supabase.auth.signUp({ options: { data } }) → the
 *  handle_new_user trigger copies these onto the profiles row. */
export function attributionMetadata(): Record<string, string> {
  const d = getFirstTouch();
  if (!d) return {};
  return {
    signup_source: d.source,
    signup_medium: d.medium,
    signup_campaign: d.campaign,
    signup_term: d.term,
    signup_content: d.content,
    signup_referrer: d.referrer,
    signup_landing_page: d.landing_page,
    signup_first_seen_at: d.first_seen_at,
  };
}

/** The profiles column patch for the stored attribution. */
function attributionColumns(d: Attribution): Record<string, string> {
  return {
    signup_source: d.source,
    signup_medium: d.medium,
    signup_campaign: d.campaign,
    signup_term: d.term,
    signup_content: d.content,
    signup_referrer: d.referrer,
    signup_landing_page: d.landing_page,
    signup_first_seen_at: d.first_seen_at,
  };
}

/**
 * OAuth signups can't carry signup metadata through the provider round-trip, so
 * fill attribution client-side on return. Only runs for a freshly-created user
 * whose profile has no attribution yet (first-touch on the record), so it never
 * mislabels returning users. Best-effort; never throws.
 */
export async function applyOAuthAttribution(user: { id: string; email?: string | null; created_at?: string; user_metadata?: any }): Promise<void> {
  try {
    if (user.created_at) {
      const age = Date.now() - new Date(user.created_at).getTime();
      if (!Number.isNaN(age) && age > FRESH_SIGNUP_WINDOW_MS) return; // not a fresh signup
    }
    const { data: prof } = await supabase.from("profiles").select("signup_source").eq("id", user.id).maybeSingle();
    if (!prof || (prof as any).signup_source) return; // missing row, or already attributed

    const d = getFirstTouch();
    if (!d) return;

    await supabase.from("profiles").update(attributionColumns(d) as any).eq("id", user.id);

    if (user.email) {
      const fullName = (user.user_metadata?.full_name ?? user.user_metadata?.name ?? "").toString().trim();
      const sp = fullName.indexOf(" ");
      void captureLead({
        email: user.email,
        firstName: sp === -1 ? fullName : fullName.slice(0, sp),
        lastName: sp === -1 ? "" : fullName.slice(sp + 1),
        source: "owner-signup",
        marketingConsent: false,
        attribution: d,
      });
    }
  } catch (err) {
    console.warn("applyOAuthAttribution failed", err);
  }
}
