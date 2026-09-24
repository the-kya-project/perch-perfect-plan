// Transactional email templates (warm palette, inline styles for mail-client
// consistency). Pure string builders — no secrets, no Node APIs.
//
// LOCALIZATION: user-facing prose lives in the server-only `emails` catalog and
// is resolved per email from the recipient's (or, for account-less invitees, the
// sender's) locale — see src/lib/i18n/emailI18n.server.ts. Each builder takes an
// optional `locale`; an absent/unknown locale falls back to English, so a send
// never fails on a missing translation. English output is byte-identical to the
// pre-i18n templates (values are pre-escaped per field exactly as before, and
// the email i18n instance interpolates with escapeValue:false).
//
// The external (token-link) sitter trio is NOT localized here — it's account-
// less and keyed off a per-sit locale picker that doesn't exist yet (A3). Those
// three builders keep their English literals and call shell() without `t`.

import { emailT } from "./i18n/emailI18n.server";

type EmailT = ReturnType<typeof emailT>;

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export type BuiltEmail = { subject: string; html: string; text: string };

// ── Body blocks ──────────────────────────────────────────────────────────────
// Shared by the onboarding series so seven emails can't drift apart. Every
// input arrives pre-escaped from the catalog (see the escaping note up top).
const bodyP = (s: string) =>
  `<p style="margin:0 0 13px;font-size:15px;line-height:1.6;color:#1a3d2e;">${s}</p>`;
const cardP = (s: string) =>
  `<p style="margin:0 0 11px;font-size:14.5px;line-height:1.58;color:#1a3d2e;">${s}</p>`;
const cardLi = (s: string) =>
  `<p style="margin:0 0 11px;font-size:14.5px;line-height:1.58;color:#1a3d2e;">&bull;&nbsp; ${s}</p>`;

/** The cream inset with a teal label — "What you need", "Worth knowing". */
function noteCard(label: string, inner: string): string {
  return `<div style="margin:6px 0 20px;padding:18px 20px 7px;background:#f4f1e8;border:1px solid #e0d8c4;border-radius:14px;">
      <p style="margin:0 0 11px;font-size:11px;line-height:17px;letter-spacing:.12em;text-transform:uppercase;font-weight:600;color:#5a8c7a;">${label}</p>${inner}</div>`;
}


function shell(opts: {
  kicker: string;
  heading: string;
  /** Plain prose, wrapped in the standard paragraph. Ignored when `bodyHtml`
   *  is given. */
  body?: string;
  /** Raw body markup, for emails that need more than one paragraph (a list, an
   *  alert box). Emitted as-is instead of the wrapped `body` paragraph — a
   *  caller passing nested `<p>` through `body` would produce invalid HTML. */
  bodyHtml?: string;
  /** Kicker band and CTA colour. Defaults to the brand green. Only the
   *  "something is seriously wrong" email overrides it, so clay red keeps
   *  meaning exactly one thing across the whole programme. */
  accent?: string;
  /** Space above the closing note, in px. */
  footGap?: number;
  /** Render the closing note as fine print — smaller and italic. */
  footFine?: boolean;
  /** CTA button + its href. Omit both for an informational email with no action
   *  (e.g. a cancellation to a token sitter whose link is already dead). */
  cta?: string;
  link?: string;
  foot: string;
  /** Optional "From the field notes" blog block rendered under the CTA. */
  reading?: { title: string; teaser: string; url: string };
  /** One line pointing at the next email, under a rule after the CTA. The
   *  onboarding series uses it so each email hands off to the one after it. */
  nextUp?: string;
  /** Health disclaimer, above the closing note. Health-adjacent emails only —
   *  it is not boilerplate and should not appear on every send. */
  healthNote?: string;
  /** Inbox preview line — the grey text beside the subject. Hidden in the body.
   *  Without it the client pulls the first body words, which for a letter is
   *  "Hi <name>," and tells the reader nothing. */
  preview?: string;
  /** Localized chrome. When omitted (the account-less sitter-invite emails),
   *  the English literals are used. */
  t?: EmailT;
}): string {
  const accent = opts.accent ?? "#1a3d2e";
  const footGap = opts.footGap ?? 20;
  const fieldNotes = opts.t ? opts.t("email.shell.fieldNotes") : "From the field notes";
  const footNote = opts.t ? opts.t("email.shell.footNote") : "Kya &amp; Co. — by The Kya Project";
  const reading = opts.reading
    ? `
      <div style="margin-top:20px;padding:14px 16px;background:#f4f1e8;border-radius:12px;">
        <p style="margin:0;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8a897f;">${fieldNotes}</p>
        <p style="margin:6px 0 0;font-size:14px;"><a href="${opts.reading.url}" style="color:#1a3d2e;font-weight:600;">${opts.reading.title}</a></p>
        <p style="margin:4px 0 0;font-size:12.5px;color:#5f5e5a;line-height:1.5;">${opts.reading.teaser}</p>
      </div>`
    : "";
  // Email header: horizontal-cream lockup served from production via an
  // ABSOLUTE URL (relative paths can't resolve inside a recipient's inbox).
  // Plain-text fallback line "Kya & Co. — by The Kya Project" lives in the
  // text/* bodies and the footer.
  // Hidden preheader. The trailing entities stop the client padding the preview
  // line with body text that follows it.
  const preheader = opts.preview
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${opts.preview}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>`
    : "";
  const nextUp = opts.nextUp
    ? `
      <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #eee6d4;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:14.5px;line-height:1.55;color:#5f5e5a;">${opts.nextUp}</p>`
    : "";
  const healthNote = opts.healthNote
    ? `
      <p style="margin:22px 0 0;font-size:11.5px;font-style:italic;line-height:1.5;color:#8a897f;">${opts.healthNote}</p>`
    : "";

  return `
<div style="background:#f4f1e8;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${preheader}
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e3ded0;">
    <div style="background:#f4f1e8;padding:20px 24px;text-align:left;border-bottom:1px solid #eee6d4;">
      <img src="https://app.thekyaproject.com/brand/lockups/horizontal-cream.png" width="280" alt="Kya & Co. — by The Kya Project" style="display:block;width:280px;max-width:100%;height:auto;" />
    </div>
    <div style="background:${accent};padding:20px 24px;">
      <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.85);">${opts.kicker}</p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:500;color:#fff;">${opts.heading}</h1>
    </div>
    <div style="padding:24px;">
      ${opts.bodyHtml ?? `<p style="margin:0 0 8px;font-size:15px;color:#1a3d2e;">${opts.body}</p>`}${opts.cta ? `
      <a href="${opts.link}" style="display:inline-block;margin-top:12px;background:${accent};color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;">${opts.cta}</a>` : ""}${reading}${nextUp}${healthNote}
      <p style="margin:${footGap}px 0 0;font-size:${opts.footFine ? "11.5" : "12"}px;color:#8a897f;line-height:1.5;${opts.footFine ? "font-style:italic;" : ""}">${opts.foot}</p>
      <p style="margin:18px 0 0;font-size:11px;color:#8a897f;text-align:center;border-top:1px solid #eee6d4;padding-top:12px;">${footNote}</p>
    </div>
  </div>
</div>`;
}

// "Sitter added a daily log" — sent for all-clear scans when the owner opts in
// (flagged scans use the always-on health alert, not this one).
export function buildDailyLogEmail(opts: { birdName: string; sitterName: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const bird = escapeHtml(opts.birdName);
  const sitter = escapeHtml(opts.sitterName);
  return {
    subject: t("email.dailyLog.subject", { birdName: opts.birdName }),
    html: shell({
      kicker: t("email.dailyLog.kicker"),
      heading: t("email.dailyLog.heading", { bird }),
      body: t("email.dailyLog.body", { sitter, bird }),
      cta: t("email.dailyLog.cta"),
      link: opts.link,
      foot: t("email.dailyLog.foot"),
      t,
    }),
    text: t("email.dailyLog.text", { birdName: opts.birdName, link: opts.link }),
  };
}

// "Care plan update reminder" — sent by the reminder cron when the owner opts in.
export function buildCarePlanReminderEmail(opts: { birdName: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const bird = escapeHtml(opts.birdName);
  return {
    subject: t("email.carePlanReminder.subject", { birdName: opts.birdName }),
    html: shell({
      kicker: t("email.carePlanReminder.kicker"),
      heading: t("email.carePlanReminder.heading", { bird }),
      body: t("email.carePlanReminder.body", { bird }),
      cta: t("email.carePlanReminder.cta"),
      link: opts.link,
      foot: t("email.carePlanReminder.foot"),
      t,
    }),
    text: t("email.carePlanReminder.text", { birdName: opts.birdName, link: opts.link }),
  };
}

// "You've been invited to help care for <birds>" — household sharing invite.
// inviterName is the owner's display name; birdNames is a human list already
// joined ("Willow and Moxie"). Warm and dignified; expiry note included.
export function buildHouseholdInviteEmail(opts: {
  inviterName: string;
  birdNames: string;
  link: string;
  locale?: string;
}): BuiltEmail {
  const t = emailT(opts.locale);
  const inviter = escapeHtml(opts.inviterName);
  const birds = escapeHtml(opts.birdNames);
  return {
    subject: t("email.householdInvite.subject", { inviterName: opts.inviterName, birdNames: opts.birdNames }),
    html: shell({
      kicker: t("email.householdInvite.kicker"),
      heading: t("email.householdInvite.heading", { inviter, birds }),
      body: t("email.householdInvite.body", { inviter, birds }),
      cta: t("email.householdInvite.cta"),
      link: opts.link,
      foot: t("email.householdInvite.foot"),
      t,
    }),
    text: t("email.householdInvite.text", { inviterName: opts.inviterName, birdNames: opts.birdNames, link: opts.link }),
  };
}

// "<sender> is handing off <bird> to you" — in-app handoff invitation.
export function buildHandoffInviteEmail(opts: { senderName: string; birdName: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const sender = escapeHtml(opts.senderName);
  const bird = escapeHtml(opts.birdName);
  return {
    subject: t("email.handoffInvite.subject", { senderName: opts.senderName, birdName: opts.birdName }),
    html: shell({
      kicker: t("email.handoffInvite.kicker"),
      heading: t("email.handoffInvite.heading", { sender, bird }),
      body: t("email.handoffInvite.body", { sender, bird }),
      cta: t("email.handoffInvite.cta"),
      link: opts.link,
      foot: t("email.handoffInvite.foot"),
      t,
    }),
    text: t("email.handoffInvite.text", { senderName: opts.senderName, birdName: opts.birdName, link: opts.link }),
  };
}

// "<recipient> accepted — <bird> is theirs now" — notify the sender it's done.
export function buildHandoffAcceptedEmail(opts: { birdName: string; recipientLabel: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const bird = escapeHtml(opts.birdName);
  const who = escapeHtml(opts.recipientLabel);
  return {
    subject: t("email.handoffAccepted.subject", { birdName: opts.birdName }),
    html: shell({
      kicker: t("email.handoffAccepted.kicker"),
      heading: t("email.handoffAccepted.heading", { bird }),
      body: t("email.handoffAccepted.body", { who, bird }),
      cta: t("email.handoffAccepted.cta"),
      link: "https://app.thekyaproject.com/past-birds",
      foot: t("email.handoffAccepted.foot"),
      t,
    }),
    text: t("email.handoffAccepted.text", { who, birdName: opts.birdName }),
  };
}

// "<bird>'s handoff was declined" — notify the sender, gently.
export function buildHandoffDeclinedEmail(opts: { birdName: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const bird = escapeHtml(opts.birdName);
  return {
    subject: t("email.handoffDeclined.subject", { birdName: opts.birdName }),
    html: shell({
      kicker: t("email.handoffDeclined.kicker"),
      heading: t("email.handoffDeclined.heading", { bird }),
      body: t("email.handoffDeclined.body", { bird }),
      cta: t("email.handoffDeclined.cta"),
      link: "https://app.thekyaproject.com",
      foot: t("email.handoffDeclined.foot"),
      t,
    }),
    text: t("email.handoffDeclined.text", { birdName: opts.birdName }),
  };
}

// ---------------------------------------------------------------------------
// Onboarding product emails — sent (at most once each, one per day max) by the
// onboarding-emails cron route based on what the account has actually done.
// These are core product communication, not marketing.
// ---------------------------------------------------------------------------

// Blog posts linked from the drip (verified live on thekyaproject.com 2026-07-20).
// When the planned "why weigh your bird" post is published, point the two
// weight emails at it instead. Blog content is English-only, so the reading
// blocks are not localized.
const BLOG = "https://www.thekyaproject.com/blog";
const READING_THRIVE = {
  title: "What the research actually says parrots need to thrive",
  teaser: "The evidence behind good husbandry — the same ground a care plan covers.",
  url: `${BLOG}/what-the-research-actually-says-parrots-need-to-thrive`,
};
const READING_SIGNS = {
  title: "What parrot welfare research reveals about the signs owners miss",
  teaser: "Parrots are experts at hiding illness. Research on the quiet signals that matter.",
  url: `${BLOG}/what-parrot-welfare-research-reveals-about-the-signs-owners-miss`,
};
const READING_WEIGH = {
  title: "Weigh your bird every day: what a gram scale tells you before your parrot does",
  teaser: "Feathers hide bodies. Grams don't. The case for the ten-second morning habit.",
  url: `${BLOG}/weigh-your-bird-every-day-what-a-gram-scale-tells-you-before-your-parrot-does`,
};

// Stage: signed up, no bird yet.
export function buildOnboardingAddBirdEmail(opts: { firstName?: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  // Greeting is prose too — key both halves so Dutch says "…, jouw" / "Jouw",
  // not the English "your". English output stays byte-identical.
  const hi = opts.firstName
    ? t("email.onboardingAddBird.hiName", { firstName: escapeHtml(opts.firstName) })
    : t("email.onboardingAddBird.hiNoName");
  return {
    subject: t("email.onboardingAddBird.subject"),
    html: shell({
      kicker: t("email.onboardingAddBird.kicker"),
      heading: t("email.onboardingAddBird.heading", { hi }),
      body: t("email.onboardingAddBird.body"),
      cta: t("email.onboardingAddBird.cta"),
      link: opts.link,
      foot: t("email.onboarding.foot"),
      t,
    }),
    text: t("email.onboardingAddBird.text", { link: opts.link }),
  };
}

// Stage: has a bird, care plan untouched.
export function buildOnboardingCarePlanEmail(opts: { birdName: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const bird = escapeHtml(opts.birdName);
  return {
    subject: t("email.onboardingCarePlan.subject", { birdName: opts.birdName }),
    html: shell({
      kicker: t("email.onboardingCarePlan.kicker"),
      heading: t("email.onboardingCarePlan.heading", { bird }),
      body: t("email.onboardingCarePlan.body", { bird }),
      cta: t("email.onboardingCarePlan.cta", { bird }),
      link: opts.link,
      foot: t("email.onboarding.foot"),
      reading: READING_THRIVE,
      t,
    }),
    text: t("email.onboardingCarePlan.text", { birdName: opts.birdName, link: opts.link }),
  };
}

// Stage: has a bird, no weight logged yet.
export function buildOnboardingFirstWeightEmail(opts: { birdName: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const bird = escapeHtml(opts.birdName);
  return {
    subject: t("email.onboardingFirstWeight.subject", { birdName: opts.birdName }),
    html: shell({
      kicker: t("email.onboardingFirstWeight.kicker"),
      heading: t("email.onboardingFirstWeight.heading", { bird }),
      body: t("email.onboardingFirstWeight.body", { bird }),
      cta: t("email.onboardingFirstWeight.cta"),
      link: opts.link,
      foot: t("email.onboarding.foot"),
      reading: READING_WEIGH,
      t,
    }),
    text: t("email.onboardingFirstWeight.text", { birdName: opts.birdName, link: opts.link }),
  };
}

// Stage: has a bird, never run a daily health scan.
export function buildOnboardingHealthScanEmail(opts: { birdName: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const bird = escapeHtml(opts.birdName);
  return {
    subject: t("email.onboardingHealthScan.subject", { birdName: opts.birdName }),
    html: shell({
      kicker: t("email.onboardingHealthScan.kicker"),
      heading: t("email.onboardingHealthScan.heading", { bird }),
      body: t("email.onboardingHealthScan.body", { bird }),
      cta: t("email.onboardingHealthScan.cta"),
      link: opts.link,
      foot: t("email.onboarding.foot"),
      reading: READING_SIGNS,
      t,
    }),
    text: t("email.onboardingHealthScan.text", { birdName: opts.birdName, link: opts.link }),
  };
}

// Stage: first weight just logged — show what it unlocked.
export function buildOnboardingWeightTrendEmail(opts: { birdName: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const bird = escapeHtml(opts.birdName);
  return {
    subject: t("email.onboardingWeightTrend.subject", { birdName: opts.birdName }),
    html: shell({
      kicker: t("email.onboardingWeightTrend.kicker"),
      heading: t("email.onboardingWeightTrend.heading", { bird }),
      body: t("email.onboardingWeightTrend.body", { bird }),
      cta: t("email.onboardingWeightTrend.cta", { bird }),
      link: opts.link,
      foot: t("email.onboarding.foot"),
      reading: READING_WEIGH,
      t,
    }),
    text: t("email.onboardingWeightTrend.text", { birdName: opts.birdName, link: opts.link }),
  };
}

// ── Sit assignment (household caregivers) ────────────────────────────────────
// Transactional, unconditional (not preference-gated): the recipient was made
// responsible for a sit and needs to know. Voice matches the household invite —
// warm, plain, sentence case. `dateRange` and `birdNames` arrive pre-formatted
// from the server fn; `link` is the caregiver's /today view.

// "You're covering <birds>" — a household member was assigned to a sit.
export function buildSitAssignedEmail(opts: {
  ownerName: string;
  birdNames: string;
  dateRange: string;
  link: string;
  locale?: string;
}): BuiltEmail {
  const t = emailT(opts.locale);
  const owner = escapeHtml(opts.ownerName);
  const birds = escapeHtml(opts.birdNames);
  const range = escapeHtml(opts.dateRange);
  return {
    subject: t("email.sitAssigned.subject", { birdNames: opts.birdNames, dateRange: opts.dateRange }),
    html: shell({
      kicker: t("email.sitAssigned.kicker"),
      heading: t("email.sitAssigned.heading", { owner, birds }),
      body: t("email.sitAssigned.body", { owner, birds, range }),
      cta: t("email.sitAssigned.cta"),
      link: opts.link,
      foot: t("email.sitAssigned.foot", { owner }),
      t,
    }),
    text: t("email.sitAssigned.text", { ownerName: opts.ownerName, birdNames: opts.birdNames, dateRange: opts.dateRange, link: opts.link }),
  };
}

// "A sit you're covering changed" — dates and/or bird-set edited. `changeSummary`
// is a pre-built phrase, e.g. "the dates" or "the dates and which birds you're covering".
export function buildSitUpdatedEmail(opts: {
  ownerName: string;
  birdNames: string;
  dateRange: string;
  changeSummary: string;
  link: string;
  locale?: string;
}): BuiltEmail {
  const t = emailT(opts.locale);
  const owner = escapeHtml(opts.ownerName);
  const birds = escapeHtml(opts.birdNames);
  const range = escapeHtml(opts.dateRange);
  const change = escapeHtml(opts.changeSummary);
  return {
    subject: t("email.sitUpdated.subject", { dateRange: opts.dateRange }),
    html: shell({
      kicker: t("email.sitUpdated.kicker"),
      heading: t("email.sitUpdated.heading", { owner }),
      body: t("email.sitUpdated.body", { owner, change, birds, range }),
      cta: t("email.sitUpdated.cta"),
      link: opts.link,
      foot: t("email.sitUpdated.foot"),
      t,
    }),
    text: t("email.sitUpdated.text", { ownerName: opts.ownerName, changeSummary: opts.changeSummary, birdNames: opts.birdNames, dateRange: opts.dateRange, link: opts.link }),
  };
}

// "A sit was cancelled" — the sit was deleted; the caregiver is no longer covering.
export function buildSitCancelledEmail(opts: {
  ownerName: string;
  birdNames: string;
  dateRange: string;
  link: string;
  locale?: string;
}): BuiltEmail {
  const t = emailT(opts.locale);
  const owner = escapeHtml(opts.ownerName);
  const birds = escapeHtml(opts.birdNames);
  const range = escapeHtml(opts.dateRange);
  return {
    subject: t("email.sitCancelled.subject", { birdNames: opts.birdNames, dateRange: opts.dateRange }),
    html: shell({
      kicker: t("email.sitCancelled.kicker"),
      heading: t("email.sitCancelled.heading", { owner }),
      body: t("email.sitCancelled.body", { birds, range, owner }),
      cta: t("email.sitCancelled.cta"),
      link: opts.link,
      foot: t("email.sitCancelled.foot"),
      t,
    }),
    text: t("email.sitCancelled.text", { ownerName: opts.ownerName, birdNames: opts.birdNames, dateRange: opts.dateRange, link: opts.link }),
  };
}

// ── External (token-link) sitter — the invite/update/cancel trio ─────────────
// Distinct from the household-caregiver emails above: the recipient has NO
// account. `link` is the private per-sit token URL (…/sitter/<token>), which
// opens the read-only sitter view with no sign-in. Voice matches the household
// invite — warm, plain, sentence case. Names/dates arrive pre-formatted.
//
// NOT localized (English only): these go to account-less token sitters, whose
// language comes from a per-sit locale picker that doesn't exist yet (A3). They
// call shell() without `t`, so the chrome stays English too.

// "<owner> shared <birds>'s care with you" — sent when an external sit is created.
export function buildSitterInviteEmail(opts: {
  ownerName: string;
  birdNames: string;
  dateRange: string;
  link: string;
}): BuiltEmail {
  const owner = escapeHtml(opts.ownerName);
  const birds = escapeHtml(opts.birdNames);
  const range = escapeHtml(opts.dateRange);
  return {
    subject: `${opts.ownerName} shared ${opts.birdNames}'s care with you — ${opts.dateRange}`,
    html: shell({
      kicker: "Sitter access",
      heading: `${owner} asked you to look after ${birds}`,
      body:
        `${owner} set you up as ${birds}'s sitter from ${range}. Your private link has everything ` +
        `you'll need — the care plan, the daily routine and health check, and emergency contacts. ` +
        `No account or password required.`,
      cta: "Open the care plan",
      link: opts.link,
      foot: "This link is private to you and works only for this sit. If you weren't expecting it, you can ignore this email.",
    }),
    text:
      `${opts.ownerName} set you up as ${opts.birdNames}'s sitter from ${opts.dateRange}. ` +
      `Your private link has the care plan, the daily routine and health check, and emergency contacts — ` +
      `no account needed.\n\nOpen the care plan: ${opts.link}`,
  };
}

// "<owner> updated the sit you're covering" — dates and/or bird-set changed.
// `changeSummary` is a pre-built phrase, e.g. "the dates" or "the dates and
// which birds you're covering". The token link is unchanged.
export function buildSitterInviteUpdatedEmail(opts: {
  ownerName: string;
  birdNames: string;
  dateRange: string;
  changeSummary: string;
  link: string;
}): BuiltEmail {
  const owner = escapeHtml(opts.ownerName);
  const birds = escapeHtml(opts.birdNames);
  const range = escapeHtml(opts.dateRange);
  const change = escapeHtml(opts.changeSummary);
  return {
    subject: `A change to your sit for ${opts.birdNames} — ${opts.dateRange}`,
    html: shell({
      kicker: "Sit updated",
      heading: `${owner} updated the sit you're covering`,
      body:
        `${owner} changed ${change} for the sit covering ${birds}. It now runs ${range}. ` +
        `Your link is the same — open it for the latest care plan and checklist.`,
      cta: "Open the care plan",
      link: opts.link,
      foot: "You're getting this because a sit you're covering on Kya & Co. changed. Your private link is unchanged.",
    }),
    text:
      `${opts.ownerName} changed ${opts.changeSummary} for the sit covering ${opts.birdNames}. ` +
      `It now runs ${opts.dateRange}. Your link is the same.\n\nOpen the care plan: ${opts.link}`,
  };
}

// "<owner> cancelled the sit you were covering" — the sit was deleted, so the
// token link is already dead. Informational only — NO action button.
export function buildSitterInviteCancelledEmail(opts: {
  ownerName: string;
  birdNames: string;
  dateRange: string;
}): BuiltEmail {
  const owner = escapeHtml(opts.ownerName);
  const birds = escapeHtml(opts.birdNames);
  const range = escapeHtml(opts.dateRange);
  return {
    subject: `Cancelled: your sit for ${opts.birdNames} (${opts.dateRange})`,
    html: shell({
      kicker: "Sit cancelled",
      heading: `${owner} cancelled the sit you were covering`,
      body:
        `You're no longer looking after ${birds}. The sit set for ${range} has been cancelled, so ` +
        `there's nothing you need to do — your private link no longer works. ${owner} will be in touch ` +
        `if that changes.`,
      foot: "You're getting this because a sit you were covering on Kya & Co. was cancelled.",
    }),
    text:
      `${opts.ownerName} cancelled the sit for ${opts.birdNames} set for ${opts.dateRange}. ` +
      `You're no longer covering it and your link no longer works — nothing you need to do.`,
  };
}

// ── Welcome (day 0) ──────────────────────────────────────────────────────────
// A personal note from Brittany, not a product announcement: it is signed by
// her, invites a reply, and the send sets reply-to accordingly. Two variants
// off one template — a bird added during signup turns the first step from
// "add your bird" into "<bird>'s record is ready", so day 0 stays ONE email.
export function buildWelcomeEmail(opts: { firstName?: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const hi = opts.firstName
    ? t("email.welcome.hiName", { firstName: escapeHtml(opts.firstName) })
    : t("email.welcome.hiNoName");
  const p = (s: string) => `<p style="margin:0 0 12px;font-size:15px;color:#1a3d2e;line-height:1.6;">${s}</p>`;
  const li = (s: string) =>
    `<p style="margin:0 0 11px 0;font-size:15px;color:#1a3d2e;line-height:1.6;">&bull;&nbsp; ${s}</p>`;
  const bodyHtml =
    p(hi) +
    p(t("email.welcome.founder")) +
    p(t("email.welcome.birds")) +
    p(t("email.welcome.built")) +
    p(t("email.welcome.startThisWeek")) +
    li(t("email.welcome.stepAddBird")) +
    li(t("email.welcome.stepWeight")) +
    li(t("email.welcome.stepScan")) +
    p(t("email.welcome.together")) +
    p(t("email.welcome.series")) +
    p(t("email.welcome.carePlan")) +
    p(t("email.welcome.reply")) +
    p(t("email.welcome.signoff"));
  return {
    subject: t("email.welcome.subject"),
    html: shell({
      preview: t("email.welcome.preview"),
      kicker: t("email.welcome.kicker"),
      heading: t("email.welcome.heading"),
      bodyHtml,
      cta: t("email.welcome.cta"),
      link: opts.link,
      nextUp: t("email.welcome.nextUp"),
      healthNote: t("email.welcome.healthNote"),
      foot: t("email.welcome.foot"),
      footGap: 22,
      footFine: false,
      t,
    }),
    text: t("email.welcome.text", { link: opts.link }),
  };
}

// Day 3 — weighing. The only email in the series that can solve the scale
// problem: someone without a gram scale is stuck whatever comes later.
export function buildSeriesWeighingEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesWeighing.subject"),
    html: shell({
      preview: t("email.seriesWeighing.preview"),
      kicker: t("email.seriesWeighing.kicker"),
      heading: t("email.seriesWeighing.heading"),
      bodyHtml:
        bodyP(t("email.seriesWeighing.lead")) +
        noteCard(t("email.seriesWeighing.card1Label"),
        cardLi(t("email.seriesWeighing.card1Li1")) +
        cardLi(t("email.seriesWeighing.card1Li2"))) +
        bodyP(t("email.seriesWeighing.p2")) +
        bodyP(t("email.seriesWeighing.p3")) +
        bodyP(t("email.seriesWeighing.p4")),
      cta: t("email.seriesWeighing.cta"),
      link: opts.link,
      nextUp: t("email.seriesWeighing.nextUp"),
      healthNote: t("email.seriesWeighing.healthNote"),
      foot: t("email.seriesWeighing.foot"),
      footGap: 22,
      t,
    }),
    text: t("email.seriesWeighing.text", { link: opts.link }),
  };
}

// Day 6 — the daily health check.
export function buildSeriesHealthCheckEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesHealthCheck.subject"),
    html: shell({
      preview: t("email.seriesHealthCheck.preview"),
      kicker: t("email.seriesHealthCheck.kicker"),
      heading: t("email.seriesHealthCheck.heading"),
      bodyHtml:
        bodyP(t("email.seriesHealthCheck.lead")) +
        bodyP(t("email.seriesHealthCheck.p2")) +
        noteCard(t("email.seriesHealthCheck.card1Label"),
        cardP(t("email.seriesHealthCheck.card1P1"))) +
        bodyP(t("email.seriesHealthCheck.p3")),
      cta: t("email.seriesHealthCheck.cta"),
      link: opts.link,
      nextUp: t("email.seriesHealthCheck.nextUp"),
      healthNote: t("email.seriesHealthCheck.healthNote"),
      foot: t("email.seriesHealthCheck.foot"),
      footGap: 22,
      t,
    }),
    text: t("email.seriesHealthCheck.text", { link: opts.link }),
  };
}

// Day 9 — the care plan.
export function buildSeriesCarePlanEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesCarePlan.subject"),
    html: shell({
      preview: t("email.seriesCarePlan.preview"),
      kicker: t("email.seriesCarePlan.kicker"),
      heading: t("email.seriesCarePlan.heading"),
      bodyHtml:
        bodyP(t("email.seriesCarePlan.lead")) +
        bodyP(t("email.seriesCarePlan.p2")) +
        noteCard(t("email.seriesCarePlan.card1Label"),
        cardP(t("email.seriesCarePlan.card1P1"))) +
        bodyP(t("email.seriesCarePlan.p3")) +
        bodyP(t("email.seriesCarePlan.p4")) +
        bodyP(t("email.seriesCarePlan.p5")),
      cta: t("email.seriesCarePlan.cta"),
      link: opts.link,
      nextUp: t("email.seriesCarePlan.nextUp"),
      foot: t("email.seriesCarePlan.foot"),
      footGap: 22,
      t,
    }),
    text: t("email.seriesCarePlan.text", { link: opts.link }),
  };
}

// Day 12 — journal and moments. The one email that asks for no new habit;
// three in a row asking someone to start something is a lot.
export function buildSeriesJournalEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesJournal.subject"),
    html: shell({
      preview: t("email.seriesJournal.preview"),
      kicker: t("email.seriesJournal.kicker"),
      heading: t("email.seriesJournal.heading"),
      bodyHtml:
        bodyP(t("email.seriesJournal.lead")) +
        bodyP(t("email.seriesJournal.p2")) +
        bodyP(t("email.seriesJournal.p3")) +
        bodyP(t("email.seriesJournal.p4")) +
        bodyP(t("email.seriesJournal.p5")),
      cta: t("email.seriesJournal.cta"),
      link: opts.link,
      nextUp: t("email.seriesJournal.nextUp"),
      foot: t("email.seriesJournal.foot"),
      footGap: 22,
      t,
    }),
    text: t("email.seriesJournal.text", { link: opts.link }),
  };
}

// Day 15 — sharing with a sitter or the household.
export function buildSeriesSharingEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesSharing.subject"),
    html: shell({
      preview: t("email.seriesSharing.preview"),
      kicker: t("email.seriesSharing.kicker"),
      heading: t("email.seriesSharing.heading"),
      bodyHtml:
        bodyP(t("email.seriesSharing.lead")) +
        noteCard(t("email.seriesSharing.card1Label"),
        cardP(t("email.seriesSharing.card1P1"))) +
        noteCard(t("email.seriesSharing.card2Label"),
        cardP(t("email.seriesSharing.card2P1"))) +
        bodyP(t("email.seriesSharing.p2")) +
        bodyP(t("email.seriesSharing.p3")),
      cta: t("email.seriesSharing.cta"),
      link: opts.link,
      nextUp: t("email.seriesSharing.nextUp"),
      foot: t("email.seriesSharing.foot"),
      footGap: 22,
      t,
    }),
    text: t("email.seriesSharing.text", { link: opts.link }),
  };
}

// Day 18 — the vet summary. Closes the series and hands off to the monthly
// recap, so the first monthly email does not arrive out of nowhere.
export function buildSeriesVetEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesVet.subject"),
    html: shell({
      preview: t("email.seriesVet.preview"),
      kicker: t("email.seriesVet.kicker"),
      heading: t("email.seriesVet.heading"),
      bodyHtml:
        bodyP(t("email.seriesVet.lead")) +
        bodyP(t("email.seriesVet.p2")) +
        bodyP(t("email.seriesVet.p3")) +
        bodyP(t("email.seriesVet.p4")) +
        noteCard(t("email.seriesVet.card1Label"),
        cardP(t("email.seriesVet.card1P1"))) +
        bodyP(t("email.seriesVet.p5")),
      cta: t("email.seriesVet.cta"),
      link: opts.link,
      healthNote: t("email.seriesVet.healthNote"),
      foot: t("email.seriesVet.foot"),
      footGap: 22,
      t,
    }),
    text: t("email.seriesVet.text", { link: opts.link }),
  };
}

// ── "Someone flagged something serious" ──────────────────────────────────────
// Replaces an unstyled <p>. The ONLY email allowed the clay-red band: it means
// "call someone now" and stays reserved for that. coveringLabel can carry a
// member's self-chosen display name and birdName is owner text, so both are
// escaped before they reach the markup.
export function buildSitterConcernEmail(opts: { birdName: string; coveringLabel: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const bird = escapeHtml(opts.birdName);
  const covering = escapeHtml(opts.coveringLabel);
  const alert = `<div style="background:#fbf0ec;border:1px solid #e8c9bd;border-radius:12px;padding:14px 16px;margin:0 0 14px;">
        <p style="margin:0;font-size:14px;color:#7a2d18;line-height:1.55;">${t("email.sitterConcern.alert", { covering, bird })}</p>
      </div>`;
  return {
    subject: t("email.sitterConcern.subject", { coveringLabel: opts.coveringLabel, birdName: opts.birdName }),
    html: shell({
      kicker: t("email.sitterConcern.kicker"),
      heading: t("email.sitterConcern.heading", { covering, bird }),
      bodyHtml: alert + `<p style="margin:0;font-size:15px;color:#1a3d2e;line-height:1.6;">${t("email.sitterConcern.body", { bird })}</p>`,
      accent: "#7a2d18",
      cta: t("email.sitterConcern.cta", { bird }),
      link: opts.link,
      foot: t("email.sitterConcern.foot", { bird }),
      footGap: 32,
      t,
    }),
    text: t("email.sitterConcern.text", { coveringLabel: opts.coveringLabel, birdName: opts.birdName, link: opts.link }),
  };
}

// ── When a bird dies ─────────────────────────────────────────────────────────
// Deliberately NOT shell(): no lockup, no kicker band, no button, body set in a
// serif. It should arrive as a letter from Brittany, not a notification from
// software. Names only the bird and assumes nothing about the reader — see
// BUG-6 in docs/qa-bugs-2026-09-16.md on gendered wording in grief copy.
// The farewell screen in the app already covers the practical steps, so this
// deliberately mentions no necropsy, no body care, and nothing to do.
export function buildBereavementEmail(opts: { firstName?: string; birdName: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const bird = escapeHtml(opts.birdName);
  const hi = opts.firstName
    ? t("email.bereavement.hiName", { firstName: escapeHtml(opts.firstName) })
    : t("email.bereavement.hiNoName");
  const p = (s: string) =>
    `<p style="margin:0 0 15px;font-family:Georgia,'Times New Roman',serif;font-size:15.5px;line-height:1.72;color:#2b332c;">${s}</p>`;
  return {
    subject: t("email.bereavement.subject", { birdName: opts.birdName }),
    html: `
<div style="background:#f4f1e8;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e3ded0;">
    <div style="padding:30px 28px;">
      ${p(hi)}${p(t("email.bereavement.sorry", { bird }))}${p(t("email.bereavement.grief"))}${p(t("email.bereavement.record", { bird }))}${p(t("email.bereavement.story", { bird }))}${p(t("email.bereavement.signoff"))}
    </div>
  </div>
</div>`,
    text: t("email.bereavement.text", { birdName: opts.birdName }),
  };
}
