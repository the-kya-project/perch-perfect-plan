// The Flock's community guidelines (Brittany's final text, Nov 22, 2026):
// the one place their words live. The join
// step shows them in full, and so does the Community guidelines page in Flock
// settings (/flock/guidelines). Flock code only.
//
// FLOCK_GUIDELINES_VERSION must match private.flock_guidelines_version()
// (20261122100000_flock_open_to_members.sql). When the words change, change
// the version in both places together: everyone is asked to agree again on
// their next visit. scripts/flock-shell.test.ts checks the two match.
import type { TFunction } from "i18next";

export const FLOCK_GUIDELINES_VERSION = "2026-12";

/** Where members reach the Kya team about a problem (Apple 1.2). */
export const FLOCK_CONTACT_EMAIL = "brittany@thekyaproject.com";

export type GuidelineSection = { key: string; title: string; body: string };

export function guidelinesIntro(t: TFunction): { title: string; body: string } {
  return {
    title: t("flock.guidelines.introTitle", "Welcome to the Flock"),
    body: t("flock.guidelines.intro", "We're a community of people who love parrots and want to give them good lives. These are the few things we ask of everyone here."),
  };
}

export function guidelineSections(t: TFunction): GuidelineSection[] {
  return [
    { key: "kind", title: t("flock.guidelines.kindTitle", "Be kind."),
      body: t("flock.guidelines.kind", "Everyone here is learning, including the people who've had birds for decades. Disagree with ideas, never with people, and assume the best of each other.") },
    { key: "birds", title: t("flock.guidelines.birdsTitle", "Put the birds first."),
      body: t("flock.guidelines.birds", "Share what keeps parrots safe and healthy. Posts that encourage harmful care, or the sale of wild-caught birds, will be removed.") },
    { key: "vet", title: t("flock.guidelines.vetTitle", "The Flock isn't your vet."),
      body: t("flock.guidelines.vet", "Members share experience, not medical advice. If your bird seems unwell, please call an avian vet before posting.") },
    { key: "selling", title: t("flock.guidelines.sellingTitle", "No selling or spam."),
      body: t("flock.guidelines.selling", "Please don't advertise products, services, or birds for sale. Sharing a rescue that needs help is always welcome.") },
    { key: "yours", title: t("flock.guidelines.yoursTitle", "Share only what's yours."),
      body: t("flock.guidelines.yours", "Post your own photos, videos, and stories, and don't share anything another member told you privately.") },
    { key: "meetups", title: t("flock.guidelines.meetupsTitle", "Meet up safely."),
      body: t("flock.guidelines.meetups", "Chapter events happen in public places, and you're never obligated to share where you live.") },
  ];
}

/** The closing paragraph. */
export function guidelinesClosing(t: TFunction): string {
  return t("flock.guidelines.closing", "If something feels wrong, you can report or block anyone, and the Kya team reviews every report. Members who break these guidelines may have posts removed or lose access to the Flock.");
}

/** The contact line, used at the bottom of the guidelines and in settings. */
export function contactLine(t: TFunction): { title: string; body: string } {
  return {
    title: t("flock.guidelines.contactTitle", "Questions or a problem?"),
    body: t("flock.guidelines.contact", "Email the Kya team at {{email}}.", { email: FLOCK_CONTACT_EMAIL }),
  };
}
