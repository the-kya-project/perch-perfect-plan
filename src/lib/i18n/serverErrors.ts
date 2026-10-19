// Display-time translation for English error messages that come back from
// server functions (and a few client libs) and end up in a toast.
//
// WHY AT DISPLAY, NOT AT THE THROW
// --------------------------------
// Server throws stay English on purpose: the same Error goes to server logs and
// PostHog, where one language keeps errors groupable, and a server function has
// no reliable view of the caller's UI language anyway. So the client translates
// the KNOWN messages when it shows them. Anything unrecognised is returned as
// null and the caller shows the raw text exactly as before.
//
// Each case is a literal t() call with a serverError.<name> key and the English call so i18next-parser
// extracts it; the English default is the exact server string, so English
// output is byte-identical. When a server message changes, change it here too —
// an unmatched message simply stops being translated, it never breaks.
//
// `t` is passed in so a surface with its own instance (the sitter subtree's
// useTranslation()) can translate in its own language; owner code passes
// nothing and gets the global instance.

import i18next, { type TFunction } from "i18next";

export function translateServerError(raw: string, tr?: TFunction): string | null {
  const t: TFunction = tr ?? i18next.t.bind(i18next);
  switch (raw) {
    // ---- Shared access / lookup ----
    case "Not found.":
      return t("serverError.notFound", "Not found.");
    case "Not allowed.":
      return t("serverError.notAllowed", "Not allowed.");
    case "Not authorized":
      return t("serverError.notAuthorized", "Not authorized");
    case "Bird not found.":
      return t("serverError.birdNotFound", "Bird not found.");

    // ---- Household ----
    case "You can only invite people to birds you own.":
      return t("serverError.inviteOnlyOwnBirds", "You can only invite people to birds you own.");
    case "The owner can't be removed.":
      return t("serverError.ownerCantBeRemoved", "The owner can't be removed.");
    case "You already have access.":
      return t("serverError.alreadyHaveAccess", "You already have access.");
    case "That person isn't in your household yet — invite them by email.":
      return t("serverError.notInHousehold", "That person isn't in your household yet — invite them by email.");
    case "This invite isn't active anymore.":
      return t("serverError.inviteInactive", "This invite isn't active anymore.");
    case "That's your own invite.":
      return t("serverError.ownInvite", "That's your own invite.");
    case "This invite is no longer valid — those birds have moved to another owner.":
      return t("serverError.inviteBirdsMoved", "This invite is no longer valid — those birds have moved to another owner.");

    // ---- Handoff ----
    case "You can only hand off a bird you own.":
      return t("serverError.handoffOnlyOwnBird", "You can only hand off a bird you own.");
    case "There's already a handoff pending for this bird.":
      return t("serverError.handoffAlreadyPending", "There's already a handoff pending for this bird.");
    case "This handoff isn't active anymore.":
      return t("serverError.handoffInactive", "This handoff isn't active anymore.");
    case "That's your own handoff.":
      return t("serverError.ownHandoff", "That's your own handoff.");

    // ---- Sitter link / caregiver sits ----
    case "This is a read-only preview — changes aren't saved.":
      return t("serverError.readOnlyPreview", "This is a read-only preview — changes aren't saved.");
    case "Bird not in this sit.":
      return t("serverError.birdNotInSit", "Bird not in this sit.");
    case "Task not in this sit.":
      return t("serverError.taskNotInSit", "Task not in this sit.");
    case "This sit has no birds.":
      return t("serverError.sitHasNoBirdsThis", "This sit has no birds.");
    case "Sit has no birds.":
      return t("serverError.sitHasNoBirds", "Sit has no birds.");
    case "Sit not found.":
      return t("serverError.sitNotFound", "Sit not found.");
    case "Not the assigned caregiver.":
      return t("serverError.notAssignedCaregiver", "Not the assigned caregiver.");
    case "Sit revoked.":
      return t("serverError.sitRevoked", "Sit revoked.");
    case "Sit isn't active today.":
      return t("serverError.sitNotActiveToday", "Sit isn't active today.");
    case "You're not covering an active sit for this bird.":
      return t("serverError.notCoveringSit", "You're not covering an active sit for this bird.");

    // ---- Clips / media ----
    case "Couldn't start the upload. Please try again.":
      return t("serverError.uploadStartFailed", "Couldn't start the upload. Please try again.");
    case "We couldn't finish removing this bird's photos and videos, so the bird is still here. Please try again.":
      return birdMediaPurgeFailedText(t);

    // ---- Client libs (thrown in English so analytics stay groupable) ----
    case "Google sign-in isn't set up yet on this build.":
      return t("serverError.googleNotConfigured", "Google sign-in isn't set up yet on this build.");
    case "No Google identity token returned.":
      return t("serverError.noGoogleToken", "No Google identity token returned.");
    case "No Apple identity token returned.":
      return t("serverError.noAppleToken", "No Apple identity token returned.");
    case "Sign-in didn't finish. Please try again.":
      return t("serverError.signInTimeout", "Sign-in didn't finish. Please try again.");
    case "Sign-in failed.":
      return t("serverError.signInFailed", "Sign-in failed.");
  }

  // Messages that carry a value (the invited address).
  const invite = /^This invite was sent to (.+)\. Sign in with that email to accept\.$/.exec(raw);
  if (invite) {
    return t("serverError.inviteWrongEmail", "This invite was sent to {{email}}. Sign in with that email to accept.", {
      email: invite[1],
    });
  }
  const handoff = /^This handoff was sent to (.+)\. Sign in with that email to accept\.$/.exec(raw);
  if (handoff) {
    return t("serverError.handoffWrongEmail", "This handoff was sent to {{email}}. Sign in with that email to accept.", {
      email: handoff[1],
    });
  }

  const pdf = /^We couldn't finish removing (.+)'s photos and videos, so they're still in your flock for now\. The PDF you gave the adopter isn't affected\. Please try again\.$/.exec(raw);
  if (pdf) return pdfHandoffFailedText(pdf[1], t);

  return null;
}

/**
 * Display versions of the two purge-failure messages in birdMedia.functions.ts
 * (BIRD_MEDIA_PURGE_FAILED / pdfHandoffFailedMessage). Those constants stay
 * English because the server throws them; screens toast these instead.
 */
export function birdMediaPurgeFailedText(tr?: TFunction): string {
  const t: TFunction = tr ?? i18next.t.bind(i18next);
  return t(
    "serverError.birdMediaPurgeFailed",
    "We couldn't finish removing this bird's photos and videos, so the bird is still here. Please try again.",
  );
}

export function pdfHandoffFailedText(birdName: string, tr?: TFunction): string {
  const t: TFunction = tr ?? i18next.t.bind(i18next);
  return t(
    "serverError.pdfHandoffFailed",
    "We couldn't finish removing {{name}}'s photos and videos, so they're still in your flock for now. The PDF you gave the adopter isn't affected. Please try again.",
    { name: birdName },
  );
}
