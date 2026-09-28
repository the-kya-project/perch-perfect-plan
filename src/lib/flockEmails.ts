// Emails built on the Flock Club layout.
//
// Each email moves here one at a time. Until an email is listed here it is
// still rendered by emailTemplates.ts and nothing about it has changed.
//
// COPY IS NOT BEING CHANGED IN THIS PASS. Every string below is the existing
// catalog key, rendered through the new layout so the foundation can be seen
// with real words in it.
import { emailT } from "./i18n/emailI18n.server";
import { escapeHtml, type BuiltEmail } from "./emailTemplates";
import { flockShell, type FlockBlock } from "./flockClub";

/** The onboarding steps are stored as one string each, with the instruction in
 *  <b>…</b> and the explanation after it ("<b>Add your bird.</b> Start with
 *  their name…"). The step row wants those as two fields. Splitting at the
 *  closing tag is a rendering decision, not a copy change — when this email's
 *  copy is revised they should become two keys. */
function splitStep(s: string): { title: string; text: string } {
  const m = /^\s*<b>(.*?)<\/b>\s*(.*)$/s.exec(s);
  return m ? { title: m[1], text: m[2] } : { title: "", text: s };
}

export function buildWelcomeFlockEmail(opts: { firstName?: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const hi = opts.firstName
    ? t("email.welcome.hiName", { firstName: escapeHtml(opts.firstName) })
    : t("email.welcome.hiNoName");

  const blocks: FlockBlock[] = [
    { kind: "p", text: hi },
    // Two sentences, one paragraph — each stays its own key.
    { kind: "lead", text: `${t("email.welcome.founder")} ${t("email.welcome.birds")}` },
    { kind: "p", text: t("email.welcome.built") },
    { kind: "p", text: t("email.welcome.startThisWeek") },
    {
      kind: "steps",
      items: [
        splitStep(t("email.welcome.stepAddBird")),
        splitStep(t("email.welcome.stepWeight")),
        splitStep(t("email.welcome.stepScan")),
      ],
    },
    { kind: "highlight", body: t("email.welcome.together") },
    { kind: "button", label: t("email.welcome.cta"), href: opts.link },
    { kind: "signature" },
  ];

  return flockShell({
    // The H1 is the subject. The old copy had two different strings for these
    // ("Welcome to Kya & Co.!" in the inbox, "A record for your bird starts
    // here" on the page); the heading is the one that says something, so it
    // wins and email.welcome.subject is now unused by this builder.
    headline: t("email.welcome.heading"),
    preheader: t("email.welcome.preview"),
    pill: t("email.flock.pillFlockmate"),
    hero: { file: "welcome.jpg", alt: t("email.welcome.heroAlt"), sticker: t("email.flock.pillFlockmate") },
    blocks,
    // The health disclaimer is NOT here. It is emitted by the footer on every
    // Flock Club email, which is why email.welcome.healthNote goes unused.
    footerWhy: t("email.welcome.foot"),
    link: opts.link,
    locale: opts.locale,
  });
}
