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
