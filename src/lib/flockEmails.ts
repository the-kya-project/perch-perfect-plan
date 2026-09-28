// Emails built on the Flock Club layout.
//
// Each email moves here one at a time. Until an email is listed here it is
// still rendered by emailTemplates.ts and nothing about it has changed.
import { emailT } from "./i18n/emailI18n.server";
import { escapeHtml, type BuiltEmail } from "./emailTemplates";
import { flockShell, FC, type FlockBlock } from "./flockClub";

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
export function buildSeriesWeighingEmail(opts: { link: string; hasBird?: boolean; locale?: string }): BuiltEmail {
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
    { kind: "button", label: t("email.seriesWeighing.cta"), href: opts.link, needsBird: true },
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
    hasBird: opts.hasBird,
    locale: opts.locale,
  });
}

/**
 * Day 6 — the daily health check. The card shows a real check: q1-q3 are the
 * app's own question wording from src/lib/triage.ts, with "the bird" swapped
 * for Juno, so the email is not teaching a screen that does not exist.
 */
export function buildSeriesHealthCheckEmail(opts: { link: string; hasBird?: boolean; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const blocks: FlockBlock[] = [
    { kind: "p", text: t("email.seriesHealthCheck.p1") },
    {
      kind: "checkCard",
      title: t("email.seriesHealthCheck.cardTitle"),
      badge: t("email.seriesHealthCheck.cardBadge"),
      questions: [
        t("email.seriesHealthCheck.q1"),
        t("email.seriesHealthCheck.q2"),
        t("email.seriesHealthCheck.q3"),
      ],
      answers: [t("email.scanReason.normal"), t("email.scanReason.notSure"), t("email.scanReason.concerning")],
      note: t("email.seriesHealthCheck.cardNote"),
    },
    { kind: "highlight", title: t("email.seriesHealthCheck.boringTitle"), body: t("email.seriesHealthCheck.boringText"), titleSize: 22 },
    { kind: "p", text: t("email.seriesHealthCheck.p2") },
    { kind: "button", label: t("email.seriesHealthCheck.cta"), href: opts.link, needsBird: true },
    { kind: "p", text: t("email.seriesHealthCheck.p3") },
    { kind: "signature" },
  ];
  return flockShell({
    headline: t("email.seriesHealthCheck.headline"),
    preheader: t("email.seriesHealthCheck.preview"),
    pill: t("email.flock.pillFlockmate"),
    hero: { file: "health-check.jpg", alt: t("email.seriesHealthCheck.heroAlt"), sticker: t("email.seriesHealthCheck.sticker") },
    blocks,
    footerWhy: t("email.seriesHealthCheck.foot"),
    link: opts.link,
    hasBird: opts.hasBird,
    locale: opts.locale,
  });
}

/**
 * Day 9 — the care plan.
 *
 * The tiles follow CARE_PLAN_SECTIONS in src/components/CarePlanView.tsx:
 * food, behavior, home, health, routine, emergency. Routine sits FIFTH in the
 * app, not second, so the two "start here" tiles are not adjacent. The email
 * follows the app rather than the other way round — a reader who opens the
 * plan should find it laid out the way the email just showed them. Only the
 * two starting sections are labelled; the rest show their name alone, so the
 * grid does not imply an order to work through.
 */
export function buildSeriesCarePlanEmail(opts: { link: string; hasBird?: boolean; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const start = t("email.seriesCarePlan.startHere");
  const blocks: FlockBlock[] = [
    { kind: "p", text: t("email.seriesCarePlan.p1") },
    {
      kind: "tileGrid",
      tiles: [
        { name: t("email.seriesCarePlan.secFood"), badge: start, highlight: true },
        { name: t("email.seriesCarePlan.secBehavior"), highlight: false },
        { name: t("email.seriesCarePlan.secHome"), highlight: false },
        { name: t("email.seriesCarePlan.secHealth"), highlight: false },
        { name: t("email.seriesCarePlan.secRoutine"), badge: start, highlight: true },
        { name: t("email.seriesCarePlan.secEmergency"), highlight: false },
      ],
    },
    { kind: "p", text: t("email.seriesCarePlan.p2") },
    {
      kind: "quoteCard",
      title: t("email.seriesCarePlan.exampleTitle"),
      panelLabel: t("email.seriesCarePlan.exampleLabel"),
      quote: t("email.seriesCarePlan.exampleQuote"),
      note: t("email.seriesCarePlan.exampleNote"),
    },
    { kind: "p", text: t("email.seriesCarePlan.p3") },
    { kind: "p", text: t("email.seriesCarePlan.p4") },
    { kind: "button", label: t("email.seriesCarePlan.cta"), href: opts.link, needsBird: true },
    { kind: "signature" },
  ];
  return flockShell({
    headline: t("email.seriesCarePlan.headline"),
    preheader: t("email.seriesCarePlan.preview"),
    pill: t("email.flock.pillFlockmate"),
    hero: { file: "care-plan.jpg", alt: t("email.seriesCarePlan.heroAlt"), sticker: t("email.seriesCarePlan.sticker") },
    blocks,
    footerWhy: t("email.seriesCarePlan.foot"),
    link: opts.link,
    hasBird: opts.hasBird,
    locale: opts.locale,
  });
}

/**
 * Day 12 — journal and Moments. The one letter that asks for no new habit.
 *
 * "Moments" is the app's own name (/birds/$birdId/moments), and journal
 * entries really do take a photo (journal_entries.photo_path), so the sample
 * card is showing something that exists.
 */
export function buildSeriesJournalEmail(opts: { link: string; hasBird?: boolean; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const blocks: FlockBlock[] = [
    { kind: "p", text: t("email.seriesJournal.p1") },
    {
      kind: "journalCard",
      pill: t("email.seriesJournal.cardPill"),
      date: t("email.seriesJournal.cardDate"),
      entry: t("email.seriesJournal.cardEntry"),
      photo: "journal-photo.jpg",
      photoAlt: t("email.seriesJournal.cardPhotoAlt"),
    },
    { kind: "momentStrip", label: t("email.seriesJournal.momentLabel"), text: t("email.seriesJournal.momentText") },
    { kind: "p", text: t("email.seriesJournal.p2") },
    { kind: "p", text: t("email.seriesJournal.p3") },
    { kind: "p", text: t("email.seriesJournal.p4") },
    { kind: "button", label: t("email.seriesJournal.cta"), href: opts.link, needsBird: true },
    { kind: "p", text: t("email.seriesJournal.p5") },
    { kind: "signature" },
  ];
  return flockShell({
    headline: t("email.seriesJournal.headline"),
    preheader: t("email.seriesJournal.preview"),
    pill: t("email.flock.pillFlockmate"),
    hero: { file: "journal.jpg", alt: t("email.seriesJournal.heroAlt"), sticker: t("email.seriesJournal.sticker") },
    blocks,
    footerWhy: t("email.seriesJournal.foot"),
    link: opts.link,
    hasBird: opts.hasBird,
    locale: opts.locale,
  });
}

/**
 * Day 15 — sharing. Two tickets: a guest pass and a house key.
 *
 * t2Text says what a household member can DO, not what they can see. A member
 * sees the whole record — has_capability(bird, user, 'view') is true for any
 * of them — so "the parts you choose to share" would promise a privacy control
 * the app does not have.
 */
export function buildSeriesSharingEmail(opts: { link: string; hasBird?: boolean; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const blocks: FlockBlock[] = [
    { kind: "p", text: t("email.seriesSharing.p1") },
    {
      kind: "tickets",
      items: [
        { bg: FC.sunflower, label: t("email.seriesSharing.t1Label"), title: t("email.seriesSharing.t1Title"), text: t("email.seriesSharing.t1Text"), stub: t("email.seriesSharing.t1Stub") },
        { bg: FC.lime, label: t("email.seriesSharing.t2Label"), title: t("email.seriesSharing.t2Title"), text: t("email.seriesSharing.t2Text"), stub: t("email.seriesSharing.t2Stub") },
      ],
    },
    { kind: "p", text: t("email.seriesSharing.p2") },
    { kind: "p", text: t("email.seriesSharing.p3") },
    { kind: "button", label: t("email.seriesSharing.cta"), href: opts.link, needsBird: true },
    { kind: "signature" },
  ];
  return flockShell({
    headline: t("email.seriesSharing.headline"),
    preheader: t("email.seriesSharing.preview"),
    pill: t("email.flock.pillFlockmate"),
    hero: { file: "sharing.jpg", alt: t("email.seriesSharing.heroAlt"), sticker: t("email.seriesSharing.sticker") },
    blocks,
    footerWhy: t("email.seriesSharing.foot"),
    link: opts.link,
    hasBird: opts.hasBird,
    locale: opts.locale,
  });
}

/**
 * Day 18 — the vet summary, and the end of the tour.
 *
 * Row three reads "last 30 days", not "since last visit": nothing in the app
 * records a vet-visit date. A journal entry can be kind="vet", but no screen
 * derives a last visit from it, so the email must not imply one exists.
 *
 * The card states numbers and nothing else. Characterising them — "steady",
 * "normal", "nothing flagged" — is the reader's job and their vet's.
 */
export function buildSeriesVetEmail(opts: { link: string; hasBird?: boolean; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const blocks: FlockBlock[] = [
    { kind: "p", text: t("email.seriesVet.p1") },
    {
      kind: "summaryCard",
      title: t("email.seriesVet.cardTitle"),
      badge: t("email.seriesVet.cardBadge"),
      rows: [
        { label: t("email.seriesVet.row1Label"), value: t("email.seriesVet.row1Value") },
        { label: t("email.seriesVet.row2Label"), value: t("email.seriesVet.row2Value") },
        { label: t("email.seriesVet.row3Label"), value: t("email.seriesVet.row3Value") },
      ],
    },
    { kind: "subhead", text: t("email.seriesVet.questionsHead") },
    { kind: "bubbles", items: [t("email.seriesVet.q1"), t("email.seriesVet.q2"), t("email.seriesVet.q3")] },
    { kind: "p", text: t("email.seriesVet.p2") },
    { kind: "p", text: t("email.seriesVet.p3") },
    { kind: "button", label: t("email.seriesVet.cta"), href: opts.link, needsBird: true },
    { kind: "highlight", title: t("email.seriesVet.tourTitle"), body: t("email.seriesVet.tourText"), titleSize: 22 },
    { kind: "p", text: t("email.seriesVet.p4") },
    { kind: "signature" },
  ];
  return flockShell({
    headline: t("email.seriesVet.headline"),
    preheader: t("email.seriesVet.preview"),
    pill: t("email.flock.pillFlockmate"),
    hero: { file: "vet.jpg", alt: t("email.seriesVet.heroAlt"), sticker: t("email.seriesVet.sticker") },
    blocks,
    footerWhy: t("email.seriesVet.foot"),
    link: opts.link,
    hasBird: opts.hasBird,
    locale: opts.locale,
  });
}

// ── The Flock Report ─────────────────────────────────────────────────────────
// Reader-facing name only: the route, the log table and the preference column
// are all still "monthly". Sent on the 2nd, recapping the PREVIOUS month —
// every month named in this email is the one being recapped, never the one it
// arrives in.
//
// It states numbers and does not interpret them. No "typical", no "a little
// tighter than last month", no verdict on a weight. Blanks are shown as
// nudges rather than hidden, because a blank the reader can see is the point.

export type FlockBird = {
  name: string;
  species: string;
  href: string;
  /** Every weigh-in that month: day of month, and grams. */
  weighIns: Array<{ day: number; g: number }>;
  checks: number;
  journal: number;
  /** "12 Sep" when the plan was touched that month, else null. */
  planUpdated: string | null;
};

/** "Juno", "Juno and Pip", "Juno, Pip, and Echo" — Oxford comma throughout.
 *  Over six, the first five and a count. */
export function joinFlock(names: string[], andMore: (n: number) => string): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length <= 6) return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
  return `${names.slice(0, 5).join(", ")}, ${andMore(names.length - 5)}`;
}

export function buildFlockReportEmail(opts: {
  firstName?: string;
  birds: FlockBird[];
  /** The month being recapped, 1-12, and its year. */
  month: number;
  year: number;
  link: string;
  /** The soonest Moment falling in the month AFTER the one recapped. */
  coming?: { date: string; title: string } | null;
  article?: { title: string; url: string; minutes: number; imageUrl?: string; imageAlt?: string } | null;
  locale?: string;
}): BuiltEmail {
  const t = emailT(opts.locale);
  const m = opts.month;
  const nextM = m === 12 ? 1 : m + 1;
  const monthName = t(`email.monthly.month.${m}`);
  const nextMonthName = t(`email.monthly.month.${nextM}`);
  const monShort = t(`email.monthly.mon.${m}`);
  const days = new Date(Date.UTC(opts.year, m, 0)).getUTCDate();

  const names = opts.birds.map((b) => escapeHtml(b.name));
  const flock = joinFlock(names, (n) => t("email.monthly.andMore", { n }));
  const one = opts.birds.length === 1;

  const headline = one
    ? t("email.monthly.subjectOne", { birdName: names[0], month: monthName })
    : t("email.monthly.subjectMany", { month: monthName });

  const hi = opts.firstName ? t("email.monthly.hi", { firstName: escapeHtml(opts.firstName) }) : t("email.monthly.hiNoName");

  const sum = (f: (b: FlockBird) => number) => opts.birds.reduce((a, b) => a + f(b), 0);

  const blocks: FlockBlock[] = [
    {
      kind: "totals",
      items: [
        { n: String(sum((b) => b.weighIns.length)), label: t("email.monthly.totalWeighIns") },
        { n: String(sum((b) => b.checks)), label: t("email.monthly.totalChecks") },
        { n: String(sum((b) => b.journal)), label: t("email.monthly.totalJournal") },
      ],
    },
    { kind: "sectionHead", title: t("email.monthly.rollCall"), note: t("email.monthly.rollCallNote") },
    {
      kind: "birdCards",
      birds: opts.birds.map((b) => {
        const latest = b.weighIns.length ? b.weighIns[b.weighIns.length - 1].g : 0;
        return {
          name: escapeHtml(b.name),
          species: escapeHtml(b.species),
          href: b.href,
          chart: b.weighIns.length
            ? {
                points: b.weighIns,
                days,
                axisStart: `${monShort} 1`,
                axisEnd: `${monShort} ${days}`,
                line:
                  b.weighIns.length === 1
                    ? t("email.monthly.weighInLineOne", { g: latest })
                    : t("email.monthly.weighInLine", { n: b.weighIns.length, g: latest }),
              }
            : undefined,
          empty: b.weighIns.length ? undefined : { text: t("email.monthly.noWeighIns", { month: monthName }), cta: t("email.monthly.logOne") },
          rows: [
            b.checks > 0
              ? { label: t("email.monthly.rowChecks"), value: t("email.monthly.rowChecksValue", { n: b.checks, days }) }
              : { label: t("email.monthly.rowChecks"), value: t("email.monthly.doOne"), nudge: true },
            b.journal > 0
              ? {
                  label: t("email.monthly.rowJournal"),
                  value: b.journal === 1 ? t("email.monthly.rowJournalValueOne") : t("email.monthly.rowJournalValue", { n: b.journal }),
                }
              : { label: t("email.monthly.rowJournal"), value: t("email.monthly.addOne"), nudge: true },
            b.planUpdated
              ? { label: t("email.monthly.rowPlan"), value: t("email.monthly.rowPlanValue", { date: b.planUpdated }) }
              : { label: t("email.monthly.rowPlan"), value: t("email.monthly.updatePlan"), nudge: true },
          ],
        };
      }),
    },
  ];

  if (opts.coming) {
    blocks.push({
      kind: "comingUp",
      label: t("email.monthly.comingLabel", { month: nextMonthName.toUpperCase() }),
      text: `${opts.coming.date} · ${escapeHtml(opts.coming.title)}`,
      cta: t("email.monthly.comingCta"),
      href: opts.link,
    });
  }

  blocks.push({
    kind: "careNote",
    pill: t("email.monthly.careNotePill", { month: nextMonthName }),
    title: t(`email.monthly.care.${nextM}.title`),
    tips: [1, 2, 3].map((i) => {
      const raw = t(`email.monthly.care.${nextM}.n${i}`);
      const mm = /^\s*<b>(.*?)<\/b>\s*(.*)$/s.exec(raw);
      return mm ? { lead: mm[1], text: mm[2] } : { lead: "", text: raw };
    }),
  });

  if (opts.article) {
    blocks.push({
      kind: "blogCard",
      label: t("email.monthly.blogLabel", { n: opts.article.minutes }),
      title: opts.article.title,
      cta: t("email.monthly.blogCta"),
      href: opts.article.url,
      image: opts.article.imageUrl,
      imageAlt: opts.article.imageAlt,
    });
  }

  blocks.push({ kind: "mailbag", title: t("email.monthly.mailbagTitle"), text: t("email.monthly.mailbagText") });
  blocks.push({ kind: "button", label: t("email.monthly.cta"), href: opts.link });
  blocks.push({ kind: "signature" });

  return flockShell({
    headline,
    headlineStyle: "lime",
    intro: t("email.monthly.intro", { hi, birds: flock, nextMonth: nextMonthName }),
    preheader: one ? t("email.monthly.previewOne") : t("email.monthly.previewMany", { count: opts.birds.length }),
    pill: t("email.flock.reportPill", { mon: monShort }),
    hero: { file: `monthly/${String(m).padStart(2, "0")}.jpg`, alt: t(`email.monthly.care.${m}.alt`) },
    blocks,
    footerWhy: t("email.monthly.foot"),
    link: opts.link,
    locale: opts.locale,
  });
}
