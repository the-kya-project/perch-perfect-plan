// Which Brevo list-add results are failures worth an alert, and their shape.
//
// Why: until Nov 2026 a missing BREVO_FOUNDING_LIST_ID skipped the Brevo step
// with one console.warn, and nobody heard about it. Every list add now goes
// through addContactToListReported (serverSaveErrors.server.ts), which records
// a public.save_errors row for a failure, so the save-error alerts email
// Brittany:
//   config   a setting is missing: BREVO_API_KEY, or the list's id variable
//   server   Brevo refused the request or couldn't be reached
// Normal skips stay quiet: a preview deployment (Brevo is off there by
// design), a reserved test address, or no email at all.
//
// The target is the setting involved, lowercased to fit the table
// ("brevo_waitlist_list_id", "brevo_api_key"); the alert prints it in capitals.
// No personal data: never the email or the name.
//
// Pure and dependency-free, so scripts/save-errors.test.ts can run it. The
// edge functions keep a copy of the same rules in
// supabase/functions/_shared/saveErrors.ts (Deno can't import from src/).

import type { SaveErrorShape } from "./saveErrors";

/** What addContactToList returns (brevoContacts.server.ts). */
export type ListAddOutcome = { ok: boolean; skipped?: string; status?: number };

/** Skips that are the system working as designed. */
export const QUIET_LIST_SKIPS: ReadonlySet<string> = new Set([
  "preview-deployment",
  "undeliverable-test-domain",
  "no-email",
]);

const TARGET = /^[a-z_][a-z0-9_]{0,62}$/;

function settingTarget(name: string): string | null {
  const t = name.toLowerCase();
  return TARGET.test(t) ? t : null;
}

/** The save_errors shape for a failed list add, or null when it succeeded or
 *  was a normal skip. `listEnvVar` names the list ("BREVO_WAITLIST_LIST_ID"). */
export function listAddFailureShape(result: ListAddOutcome, listEnvVar: string): SaveErrorShape | null {
  if (result.ok) return null;
  if (result.skipped && QUIET_LIST_SKIPS.has(result.skipped)) return null;
  if (result.skipped === "brevo-api-key-not-configured") {
    return { category: "config", sqlstate: null, target: "brevo_api_key", operation: "brevo_list" };
  }
  if (result.skipped === "list-not-configured") {
    return { category: "config", sqlstate: null, target: settingTarget(listEnvVar), operation: "brevo_list" };
  }
  // Brevo answered with an error, couldn't be reached, or anything unforeseen.
  return { category: "server", sqlstate: null, target: settingTarget(listEnvVar), operation: "brevo_list" };
}
