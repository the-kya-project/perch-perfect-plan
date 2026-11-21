// The Flock's community guidelines: the one place their words live. The join
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
    title: t("flock.guidelines.introTitle", "Welcome to the Flock."),
    body: t("flock.guidelines.intro", "This is a place for people who love parrots to learn together, cheer each other on, and do some good for birds everywhere. These guidelines keep it kind, useful and safe. By joining, you agree to them."),
  };
}

export function guidelineSections(t: TFunction): GuidelineSection[] {
  return [
    { key: "kind", title: t("flock.guidelines.kindTitle", "1. Be kind."),
      body: t("flock.guidelines.kind", "Everyone here is learning, including the people who've had birds for decades. Disagree with ideas, never with people. No insults, harassment, pile-ons, or comments about someone's looks, background or beliefs.") },
    { key: "birds", title: t("flock.guidelines.birdsTitle", "2. Put the birds first."),
      body: t("flock.guidelines.birds", "Share what has worked for you and your bird, and say so when you're not sure. Never suggest anything that could hurt a bird, including withholding food to \"motivate\" training, punishment, or unsafe products. If a bird might be sick or hurt, the answer is always \"call your avian vet,\" not a fix from the comments.") },
    { key: "vet", title: t("flock.guidelines.vetTitle", "3. We're not a vet."),
      body: t("flock.guidelines.vet", "Nothing in the Flock replaces an avian vet. Members can share experience, but no one here can diagnose a bird. In an emergency, call your vet or an emergency vet first.") },
    { key: "honest", title: t("flock.guidelines.honestTitle", "4. Keep it honest."),
      body: t("flock.guidelines.honest", "Share your own experience, photos and clips. Don't pass off someone else's work as yours, and don't post things you know aren't true.") },
    { key: "selling", title: t("flock.guidelines.sellingTitle", "5. No selling."),
      body: t("flock.guidelines.selling", "The Flock isn't a marketplace. Please don't sell or rehome birds here, and don't advertise products or services. Sharing a rescue that needs help, a fundraiser, or something that genuinely helped your bird is welcome.") },
    { key: "privacy", title: t("flock.guidelines.privacyTitle", "6. Respect privacy."),
      body: t("flock.guidelines.privacy", "Don't share anyone's address, phone number or other personal details, and don't post photos of other people or their birds without asking. What members share in the Flock stays in the Flock.") },
    { key: "meetups", title: t("flock.guidelines.meetupsTitle", "7. Meet up safely."),
      body: t("flock.guidelines.meetups", "Chapter meetups happen in public places. Leave birds at home unless the host says they're welcome, and never go somewhere that doesn't feel right.") },
    { key: "adults", title: t("flock.guidelines.adultsTitle", "8. Adults only."),
      body: t("flock.guidelines.adults", "The Flock is for people 18 and older.") },
  ];
}

export function guidelinesIfWrong(t: TFunction): { title: string; body: string } {
  return {
    title: t("flock.guidelines.wrongTitle", "If something's wrong:"),
    body: t("flock.guidelines.wrong", "use Report on a post, comment or update, and the Kya team will take a look. Reports are private. You can also block anyone, and neither of you will see the other in the Flock. When someone breaks these guidelines, we may remove their posts, and if it keeps happening, remove them from the Flock."),
  };
}

/** The contact line, used at the bottom of the guidelines and in settings. */
export function contactLine(t: TFunction): { title: string; body: string } {
  return {
    title: t("flock.guidelines.contactTitle", "Questions or a problem?"),
    body: t("flock.guidelines.contact", "Email the Kya team at {{email}}.", { email: FLOCK_CONTACT_EMAIL }),
  };
}
