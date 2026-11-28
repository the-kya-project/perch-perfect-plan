// The join step's guidelines version and the Kya team's contact address.
// The guidelines' words now live in src/flock/guidelines/content.ts (the
// walk-through, Nov 28, 2026), with their own version (GUIDELINES_VERSION,
// public.current_guidelines_version()). Flock code only.
//
// FLOCK_GUIDELINES_VERSION is the join record's version (chapter and 18+,
// flock_agree()) and must match private.flock_guidelines_version()
// (20261122100000_flock_open_to_members.sql). It's FROZEN at "2026-12":
// never bump it. The guidelines' only version is GUIDELINES_VERSION
// (src/flock/guidelines/version.ts) with public.current_guidelines_version()
// (20261128210000_flock_join_uses_walkthrough.sql).
import type { TFunction } from "i18next";

export const FLOCK_GUIDELINES_VERSION = "2026-12";

/** Where members reach the Kya team about a problem (Apple 1.2). */
export const FLOCK_CONTACT_EMAIL = "brittany@thekyaproject.com";

/** The contact line, used at the bottom of the guidelines and in settings. */
export function contactLine(t: TFunction): { title: string; body: string } {
  return {
    title: t("flock.guidelines.contactTitle", "Questions or a problem?"),
    body: t("flock.guidelines.contact", "Email the Kya team at {{email}}.", { email: FLOCK_CONTACT_EMAIL }),
  };
}
