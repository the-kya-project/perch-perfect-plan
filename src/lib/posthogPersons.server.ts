// Account deletion → delete the person in PostHog, with their analytics and
// error-report events. SERVER ONLY: reads the persons API key.
//
// Best-effort by design: it runs AFTER the account itself is gone, and a
// PostHog failure is logged (Vercel logs) but never fails the deletion — the
// person asked for their account to be deleted, and that part has happened.
//
// Needs POSTHOG_PERSONS_API_KEY: a PostHog personal API key with only the
// "person write" scope. Deliberately separate from the source-map upload key
// (POSTHOG_CLI_API_KEY), so the build credential can't delete people.
import { hashUserId } from "./userHash";

const PROJECT_ID = 516103;
const BULK_DELETE_URL = `https://us.posthog.com/api/projects/${PROJECT_ID}/persons/bulk_delete/`;
const TIMEOUT_MS = 5000;

export async function deletePostHogPerson(userId: string): Promise<{ ok: boolean; reason?: string }> {
  const key = process.env.POSTHOG_PERSONS_API_KEY;
  if (!key) {
    console.error("[posthog-delete] POSTHOG_PERSONS_API_KEY not set — PostHog data NOT deleted for a deleted account");
    return { ok: false, reason: "not_configured" };
  }
  // Same hash the app identifies with, so it finds the same person.
  const distinctId = await hashUserId(userId);
  if (!distinctId) {
    console.error("[posthog-delete] could not hash the user id — PostHog data NOT deleted");
    return { ok: false, reason: "hash_unavailable" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BULK_DELETE_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ distinct_ids: [distinctId], delete_events: true, delete_recordings: true }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Log the status only — never the distinct id or the response body.
      console.error(`[posthog-delete] PostHog returned ${res.status} — PostHog data NOT deleted for a deleted account`);
      return { ok: false, reason: `http_${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[posthog-delete] request failed — PostHog data NOT deleted:", err instanceof Error ? err.message : String(err));
    return { ok: false, reason: "request_failed" };
  } finally {
    clearTimeout(timer);
  }
}
