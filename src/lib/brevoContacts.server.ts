/**
 * Server-only: add a person to a Brevo contact list.
 *
 * Shares BREVO_API_KEY with brevoEmail.server.ts and follows its rules:
 * previews never reach Brevo, reserved test domains are refused, and the
 * result is an object, never a throw, so a list sync can't break the action
 * that triggered it.
 *
 * Each list is named by an env var rather than hard-coded (Production only;
 * Brevo is off in previews):
 *   BREVO_FOUNDING_LIST_ID   "Founding 50" (9)
 *   BREVO_WAITLIST_LIST_ID   "TKP Waitlist" (4)
 *
 * Call it through addContactToListReported (serverSaveErrors.server.ts), which
 * records a missing setting or a Brevo error so the save-error alerts email
 * about it. Calling this directly is silent on failure.
 */

import { isUndeliverableAddress } from "./brevoEmail.server";
import type { ListAddOutcome } from "./brevoListFailures";

const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";

export type ListAddResult = ListAddOutcome;

/** Brevo contact attributes this app sends. Brevo rejects attributes the
 *  account hasn't defined, so only ones that exist in the account belong here
 *  (FIRSTNAME and LASTNAME are built in; SOURCE, CHAPTER_LEAD_INTEREST and
 *  PRIMARY_CHAPTER were created for the waitlist form). The two chapter
 *  attributes are Brevo "category" attributes: their value is the option id. */
export type ListContact = {
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Where they came from, e.g. "waitlist-app". Overwrites an existing contact's SOURCE. */
  source?: string | null;
  chapterLeadInterest?: 1 | 2 | null;
  primaryChapter?: number | null;
};

export function listContactAttributes(c: ListContact): Record<string, string | number> {
  const a: Record<string, string | number> = {};
  if (c.firstName) a.FIRSTNAME = c.firstName;
  if (c.lastName) a.LASTNAME = c.lastName;
  if (c.source) a.SOURCE = c.source;
  if (c.chapterLeadInterest) a.CHAPTER_LEAD_INTEREST = c.chapterLeadInterest;
  if (c.primaryChapter) a.PRIMARY_CHAPTER = c.primaryChapter;
  return a;
}

export async function addContactToList(listEnvVar: string, contact: ListContact): Promise<ListAddResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const listId = Number(process.env[listEnvVar]);
  if (process.env.VERCEL_ENV === "preview") { console.warn("[brevoContacts] skipped: Vercel preview (Brevo is off in previews)", { list: listEnvVar }); return { ok: false, skipped: "preview-deployment" }; }
  if (!apiKey) { console.warn("[brevoContacts] skipped: BREVO_API_KEY not set"); return { ok: false, skipped: "brevo-api-key-not-configured" }; }
  if (!Number.isInteger(listId) || listId <= 0) { console.warn(`[brevoContacts] skipped: ${listEnvVar} not set`); return { ok: false, skipped: "list-not-configured" }; }
  if (!contact.email) return { ok: false, skipped: "no-email" };
  if (isUndeliverableAddress(contact.email)) return { ok: false, skipped: "undeliverable-test-domain" };

  try {
    const res = await fetch(BREVO_CONTACTS_URL, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        email: contact.email,
        attributes: listContactAttributes(contact),
        listIds: [listId],
        // An existing contact is added to the list instead of erroring.
        updateEnabled: true,
      }),
    });
    if (!res.ok) {
      console.error("[brevoContacts] list add failed", listEnvVar, res.status, await res.text().catch(() => ""));
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.error("[brevoContacts] network error", listEnvVar, err);
    return { ok: false, skipped: "network-error" };
  }
}
