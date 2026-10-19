/**
 * Per-email measurement: one name for every email the app sends.
 *
 * The name does two jobs, so a single string ties the two tools together:
 *   1. It goes to Brevo as the send's tag, so Transactional → Statistics can
 *      show opens and clicks for that email on its own. Without it every app
 *      email lands in one undifferentiated pile.
 *   2. It becomes utm_campaign on every link back into the app, so PostHog
 *      can show which email brought someone back (and what they did next).
 *
 * Pure string work, no server imports, so scripts/email-tracking.test.ts can
 * exercise it directly.
 */

/** Every email the app sends. Names match the notification audit. */
export type EmailTag =
  // Getting started (onboarding cron) — the stage key is the tag.
  | "welcome"
  | "series_weighing"
  | "series_health_check"
  | "series_care_plan"
  | "series_journal"
  | "series_sharing"
  | "series_vet"
  // Behavioural drip (legacy cohort)
  | "add_first_bird"
  | "log_first_weight"
  | "run_first_scan"
  | "start_care_plan"
  | "weight_trend"
  // Reminders, monthly, one-off, life events
  | "care_plan_reminder"
  | "flock_report"
  | "app_launch"
  | "bereavement"
  // Care during a sit
  | "sitter_daily_log"
  | "scan_alert"
  | "sitter_concern"
  | "sit_assigned"
  | "sit_updated"
  | "sit_cancelled"
  | "sitter_invite"
  | "sitter_invite_updated"
  | "sitter_invite_cancelled"
  // Household and handoffs
  | "household_invite"
  | "handoff_invite"
  | "handoff_accepted"
  | "handoff_declined"
  // scripts/qa-send-emails.ts previews to the founder, kept out of real numbers
  | "qa_preview";

const APP_ORIGINS = ["https://app.thekyaproject.com"];

function appOrigins(): string[] {
  const extra = typeof process !== "undefined" ? process.env.APP_URL : undefined;
  return extra && !APP_ORIGINS.includes(extra.replace(/\/$/, ""))
    ? [...APP_ORIGINS, extra.replace(/\/$/, "")]
    : APP_ORIGINS;
}

/** Images, fonts and the like are fetched by the mail client, not clicked. */
const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|mp4)$/i;

/** Should this URL carry campaign params? Only clickable links into the app. */
function trackable(url: string): boolean {
  const origin = appOrigins().find(
    (o) =>
      url === o || url.startsWith(`${o}/`) || url.startsWith(`${o}?`) || url.startsWith(`${o}#`),
  );
  if (!origin) return false;
  const rest = url.slice(origin.length);
  const path = rest.split(/[?#]/)[0] || "/";
  // Unsubscribe and other API endpoints are not page views.
  if (path.startsWith("/api/")) return false;
  if (ASSET_EXT.test(path)) return false;
  // A link that already names its own campaign (the app launch email builds
  // its own utm_content per button) keeps it untouched.
  if (/[?&](amp;)?utm_/.test(rest)) return false;
  return true;
}

function addParams(url: string, tag: EmailTag, amp: string): string {
  const hashAt = url.indexOf("#");
  const base = hashAt === -1 ? url : url.slice(0, hashAt);
  const hash = hashAt === -1 ? "" : url.slice(hashAt);
  const sep = base.includes("?") ? amp : "?";
  return `${base}${sep}utm_source=email${amp}utm_medium=email${amp}utm_campaign=${tag}${hash}`;
}

/** Add utm params to every app link in an email's HTML (href attributes only,
 *  so <img src> assets are never touched). */
export function tagHtmlLinks(html: string, tag: EmailTag): string {
  return html.replace(/href=(["'])(.*?)\1/gi, (whole, q: string, url: string) =>
    trackable(url) ? `href=${q}${addParams(url, tag, "&amp;")}${q}` : whole,
  );
}

/** Same for the plain-text part, where links are bare URLs. */
export function tagTextLinks(text: string, tag: EmailTag): string {
  return text.replace(/https:\/\/[^\s<>()"']+/g, (url) => {
    // Trailing sentence punctuation belongs to the prose, not the URL.
    const m = url.match(/^(.*?)([.,;:!?]*)$/);
    const core = m ? m[1] : url;
    const tail = m ? m[2] : "";
    return trackable(core) ? `${addParams(core, tag, "&")}${tail}` : url;
  });
}
