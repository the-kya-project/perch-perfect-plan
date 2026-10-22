/**
 * Server-only: add a person to a Brevo contact list.
 *
 * Shares BREVO_API_KEY with brevoEmail.server.ts and follows its rules:
 * previews never reach Brevo, reserved test domains are refused, and the
 * result is an object, never a throw, so a list sync can't break the action
 * that triggered it.
 *
 * The list is named by an env var rather than hard-coded, so a missing list
 * is a skip, not an error:
 *   BREVO_FOUNDING_LIST_ID   numeric id of the "Founding 50" list (Production only)
 */

import { isUndeliverableAddress } from "./brevoEmail.server";

const BREVO_CONTACTS_URL = "https://api.brevo.com/v3/contacts";

export type ListAddResult = { ok: boolean; skipped?: string; status?: number };

export async function addContactToList(
  listEnvVar: string,
  contact: { email: string; firstName?: string | null },
): Promise<ListAddResult> {
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
        // FIRSTNAME only: Brevo rejects attributes the account hasn't defined.
        attributes: contact.firstName ? { FIRSTNAME: contact.firstName } : {},
        listIds: [listId],
        // An existing contact is added to the list instead of erroring.
        updateEnabled: true,
      }),
    });
    if (!res.ok) {
      console.error("[brevoContacts] list add failed", res.status, await res.text().catch(() => ""));
      return { ok: false, status: res.status };
    }
    return { ok: true, status: res.status };
  } catch (err) {
    console.error("[brevoContacts] network error", err);
    return { ok: false, skipped: "network-error" };
  }
}
