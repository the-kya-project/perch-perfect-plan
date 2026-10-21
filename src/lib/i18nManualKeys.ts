// Keys i18next-parser cannot see at their real call sites.
//
// The parser does not descend into a t() call NESTED inside another t() call's
// options object — the pattern every localized fallback uses: a key whose
// options pass `{ name: raw || t(<fallback key>, <fallback default>) }`.
// (No literal example here: the parser reads comments too and would extract it.)
// Without this file, `npm run i18n:extract` (keepRemoved: false) drops those
// inner keys from en.jsonc, so they ship as code-default English and never
// reach the Dutch catalog.
//
// Each nested call is therefore REPEATED here at top level, where the parser
// does scan it. Keep every entry byte-identical (key AND default) to its real
// call site, and remove an entry when its call site goes away. This function
// exists only for extraction; nothing calls it at runtime.
import type { TFunction } from "i18next";

export function i18nManualKeys(t: TFunction): string[] {
  return [
    // src/components/HouseholdInviteSheet.tsx — added-member toast fallback
    t("householdInvite.member", "Member"),
    // src/components/SitForm.tsx — cancellation-email failure fallback
    t("sitForm.yourHouseholdMember", "your household member"),
    // src/lib/homeData.ts — Today-list "when" metas
    t("home.today.today", "Today"),
    t("home.today.dayAgoOne", "{{n}} day ago"),
    t("home.today.dayAgoOther", "{{n}} days ago"),
    // src/lib/i18n/joinNames.ts — list separator inside nameList.many's head
    t("nameList.sep", ", "),
    // src/routes/_authenticated/birds/$birdId.index.tsx — emergency-info owner fallback
    t("birdRecord.theOwner", "the owner"),
    // src/routes/_authenticated/birds/$birdId.setup.tsx — error-reason + name fallbacks
    t("birdSetup.pleaseTryAgainLower", "please try again."),
    t("birdSetup.birdFallback", "Bird"),
    // src/routes/_authenticated/birds/new.tsx — error-reason fallback
    t("newBird.pleaseTryAgain", "please try again."),
    // src/routes/_authenticated/dashboard.tsx — activity-feed bird fallback
    t("dashboard.activityABird", "A bird"),
    // src/routes/_authenticated/updates.tsx — joined-household member fallback
    t("updates.someone", "Someone"),
    // src/routes/handoff.$token.tsx — handoff-complete bird fallback
    t("handoff.yourBird", "Your bird"),
  ];
}
