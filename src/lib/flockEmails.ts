// Emails built on the Flock Club layout.
//
// Each email moves here one at a time. Until an email is listed here it is
// still rendered by emailTemplates.ts and nothing about it has changed.
import { emailT } from "./i18n/emailI18n.server";
import { escapeHtml, type BuiltEmail } from "./emailTemplates";
import { flockShell, type FlockBlock } from "./flockClub";

/**
 * The welcome letter — day 0, and the first email on the Flock Club layout.
 *
 * This REPLACES the letterShell welcome: every caller (the onboarding cron, the
 * QA harness, the preview) builds this one, which is what makes the old
 * email.welcome.* keys genuinely unused rather than merely superseded.
 *
 * The health disclaimer is not in the body. The Flock Club footer emits it on
 * every email, which is the point of it living there.
 *
 * Reply-to is set by the SENDER, not here — the onboarding cron passes
 * founderReplyTo() for this stage, because the copy says "every reply comes
 * straight to me" and that promise has to survive the sender address changing.
 */
export function buildWelcomeEmail(opts: { firstName?: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);

  // Subject and H1 are the same string, greeting by name when we have one.
  const headline = opts.firstName
    ? t("email.welcome.headline", { firstName: escapeHtml(opts.firstName) })
    : t("email.welcome.headlineNoName");

  const blocks: FlockBlock[] = [
    { kind: "p", text: t("email.welcome.p1") },
    { kind: "p", text: t("email.welcome.p2") },
    { kind: "subhead", text: t("email.welcome.stepsHead") },
    {
      kind: "steps",
      items: [
        { title: t("email.welcome.step1Title"), text: t("email.welcome.step1Text") },
        { title: t("email.welcome.step2Title"), text: t("email.welcome.step2Text") },
        { title: t("email.welcome.step3Title"), text: t("email.welcome.step3Text") },
      ],
    },
    { kind: "button", label: t("email.welcome.cta"), href: opts.link },
    {
      kind: "photoHighlight",
      title: t("email.welcome.junoTitle"),
      body: t("email.welcome.junoText"),
      photo: "juno.jpg",
      photoAlt: t("email.welcome.junoAlt"),
    },
    { kind: "p", text: t("email.welcome.p3") },
    { kind: "p", text: t("email.welcome.p4") },
    { kind: "signature" },
  ];

  return flockShell({
    headline,
    preheader: t("email.welcome.preview"),
    pill: t("email.flock.pillFlockmate"),
    hero: { file: "welcome.jpg", alt: t("email.welcome.heroAlt"), sticker: t("email.welcome.sticker") },
    blocks,
    footerWhy: t("email.welcome.foot"),
    link: opts.link,
    locale: opts.locale,
  });
}

/** Juno's 90 days, 40 readings. Fixed demo data — this is a picture of what a
 *  record looks like, not the reader's own. Kept deliberately unremarkable:
 *  the email says nothing about what the shape means. */
const JUNO_WEIGHTS = [
  752, 749, 755, 751, 747, 753, 758, 750, 746, 754,
  757, 752, 748, 756, 751, 745, 753, 759, 750, 747,
  755, 752, 758, 749, 746, 754, 751, 757, 753, 748,
  756, 750, 745, 752, 759, 754, 747, 751, 758, 753,
];

/**
 * Day 3 — weighing. The second email on the Flock Club layout.
 *
 * The CTA link is chosen by the caller. In production the onboarding cron
 * passes `${appUrl}/birds/${birdId}/weight` when the account has a bird and
 * falls back to `/dashboard` when it does not — see onboarding-emails.ts. The
 * `/birds/demo/weight` in the old plain text was only ever the QA harness's
 * sample string; no real send has used it.
 */
export function buildSeriesWeighingEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const blocks: FlockBlock[] = [
    { kind: "p", text: t("email.seriesWeighing.p1") },
    {
      kind: "panel",
      title: t("email.seriesWeighing.needTitle"),
      items: [
        { lead: t("email.seriesWeighing.need1Lead"), text: t("email.seriesWeighing.need1Text") },
        { lead: t("email.seriesWeighing.need2Lead"), text: t("email.seriesWeighing.need2Text") },
        { lead: t("email.seriesWeighing.need3Lead"), text: t("email.seriesWeighing.need3Text") },
      ],
    },
    { kind: "p", text: t("email.seriesWeighing.p2") },
    {
      kind: "dotChart",
      badge: t("email.seriesWeighing.chartBadge"),
      caption: t("email.seriesWeighing.chartCaption"),
      series: JUNO_WEIGHTS,
      unit: " g",
      axisStart: t("email.seriesWeighing.chartAxisStart"),
      axisEnd: t("email.seriesWeighing.chartAxisEnd"),
      note: t("email.seriesWeighing.chartNote"),
    },
    { kind: "button", label: t("email.seriesWeighing.cta"), href: opts.link },
    { kind: "p", text: t("email.seriesWeighing.p3") },
    { kind: "signature" },
  ];
  return flockShell({
    headline: t("email.seriesWeighing.headline"),
    preheader: t("email.seriesWeighing.preview"),
    pill: t("email.flock.pillFlockmate"),
    hero: { file: "weighing.jpg", alt: t("email.seriesWeighing.heroAlt"), sticker: t("email.seriesWeighing.sticker") },
    blocks,
    footerWhy: t("email.seriesWeighing.foot"),
    link: opts.link,
    locale: opts.locale,
  });
}
