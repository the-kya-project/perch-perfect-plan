// Transactional email templates (warm palette, inline styles for mail-client
// consistency). Pure string builders — no secrets, no Node APIs.
//
// LOCALIZATION: user-facing prose lives in the server-only `emails` catalog and
// is resolved per email from the recipient's (or, for account-less invitees, the
// sender's) locale — see src/lib/i18n/emailI18n.server.ts. Each builder takes an
// optional `locale`; an absent/unknown locale falls back to English, so a send
// never fails on a missing translation. Escaping semantics are unchanged from
// the pre-i18n templates: values are pre-escaped per field by each builder and
// the email i18n instance interpolates with escapeValue:false, so shell() and
// the block helpers below emit their inputs raw and must never double-escape.
//
// NOTE: output is no longer byte-identical to the pre-i18n templates. shell()
// was re-cut against the monthly-newsletter design language — Georgia for the
// band heading and the field-notes title, an 8px outer gutter, table-based
// layout with an MSO width wrapper, a table CTA, and an optional preheader —
// and then gained the two slots the onboarding series needs (nextUp,
// healthNote). Copy and per-builder escaping are untouched; only the chrome
// changed.
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

// ── Design tokens ────────────────────────────────────────────────────────────
// Exact values from the brand brief. Georgia is the serif voice everywhere the
// app would use Fraunces (headings, the month, numbers): web fonts are stripped
// by Gmail and Outlook, and Georgia ships on effectively every device.
const SANS = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const C = {
  ground: "#f4f1e8",
  card: "#ffffff",
  green: "#1a3d2e",
  border: "#e3ded0",
  rule: "#eee6d4",
  muted: "#8a897f",
  secondary: "#5f5e5a",
  teal: "#5a8c7a",
} as const;

/** Eyebrow: 11px uppercase, wide tracking, muted. The small-caps label that
 *  opens a section. */
function eyebrow(text: string, color: string = C.muted): string {
  return `<p style="margin:0;font-family:${SANS};font-size:11px;line-height:17px;letter-spacing:.11em;text-transform:uppercase;color:${color};">${text}</p>`;
}


// ── The letter layout ────────────────────────────────────────────────────────
// The seven onboarding letters use letterShell() instead of shell(). It is a
// SEPARATE layout, not a variant: shell() keeps rendering the rest of the
// programme (drip nudges, sits, handoffs, invites, the serious-concern alert)
// byte-for-byte as before, and nothing below is reachable from it.
//
// What a letter has that shell() does not:
//   • a cream masthead — 150px lockup, "Letter n of 7" on the right
//   • a 7-segment progress rule, the first n segments filled
//   • an optional full-bleed hero on a deep-green cell, so blocked images
//     leave the alt text legible in lime on green rather than white on white
//   • the kicker and heading on WHITE in Georgia 30/37, not a green band
//   • a "Next letter · Day n" hand-off block
//   • a cream footer with the parrot mark and the foot text
//
// Source of truth is docs/email-redesign/templates/NN-name.html — the design
// handback. `npm run email:preview -- --check` diffs this output against it.
// Keep the two in step: if a value here changes, change it there too.

// Asset host. The default matches the handback exactly; point it at a Vercel
// preview to check unreleased images in a real inbox before they are merged.
const ASSETS = process.env.EMAIL_ASSET_BASE || "https://app.thekyaproject.com";

// Letter palette, on top of C. Muted is darkened to #75746b from the C.muted
// #8a897f used elsewhere — small print on cream needed the contrast.
const L = {
  mid: "#2d6a4f",      // kickers, statements, the "Normal" pill
  lime: "#cdeab0",     // on deep green: labels, bars, hero alt text
  limeSoft: "#9bcab8", // the weight card's smaller labels and axis
  onGreen: "#d6e8dc",  // body copy inside a deep-green card
  pill: "#efe9da",     // the health-check question cards
  household: "#e8f0ec",// the household card in the sharing pair
  muted: "#75746b",    // health note and foot text
} as const;

// The two table openings the handback uses, reproduced including its spacing so
// the diff against it stays clean. GRID is the general full-width wrapper; BARE
// is the collapsed one used inside the weight chart.
const GRID_BASE = "width:100%;border-collapse:separate;border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt;";
const grid = (extra = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"  style="${GRID_BASE}${extra}">`;
const BARE = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">`;

// ── Body pieces ──────────────────────────────────────────────────────────────
// Each one emits exactly what the templates contain. Inputs arrive pre-escaped
// from the catalog, same contract as the rest of this file.

/** Opening paragraph, Georgia 18/29. One per letter, under the heading. */
const lead = (s: string) =>
  `<p style="margin:0 0 18px;font-family:${SERIF};font-size:18px;line-height:29px;color:${C.green};">${s}</p>`;

/** Standard body paragraph, sans 15/25. */
const para = (s: string) =>
  `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:25px;color:${C.green};">${s}</p>`;

/** A body paragraph that introduces a list — tighter, semibold. */
const paraLeadIn = (s: string) =>
  `<p style="margin:0 0 12px;font-family:${SANS};font-size:15px;line-height:25px;color:${C.green};font-weight:600;">${s}</p>`;

/** The pull-quote: Georgia italic 21/31 in mid green, its own ruled row. */
const statement = (s: string) =>
  `${grid()}<tr><td style="padding:4px 0 22px;">
          <p style="margin:0;font-family:${SERIF};font-style:italic;font-size:21px;line-height:31px;color:${L.mid};">${s}</p>
        </td></tr></table>`;

/** Small italic caption under a product moment. */
const caption = (s: string) =>
  `<p style="margin:0 0 22px;font-family:${SANS};font-size:12.5px;line-height:19px;color:${C.secondary};font-style:italic;">${s}</p>`;

/** Paragraph inside a note card. */
const noteP = (s: string) =>
  `<p style="margin:0 0 14px;font-family:${SANS};font-size:14.5px;line-height:23px;color:${C.green};">${s}</p>`;

/** A bullet inside a note card: a hanging dot in its own 20px cell, so a wrapped
 *  second line indents under the text rather than under the dot. */
const noteBullets = (items: string[]) =>
  `${grid()}${items
    .map(
      (s) => `<tr>
<td width="20" valign="top" style="width:20px;padding:0 0 12px;font-family:${SANS};font-size:9px;line-height:23px;color:${C.teal};">&#9679;</td>
<td valign="top" style="padding:0 0 12px;font-family:${SANS};font-size:14.5px;line-height:23px;color:${C.green};">${s}</td>
</tr>`,
    )
    .join("")}</table>`;

/** The cream inset with a teal label. `margin` varies by letter. */
const note = (label: string, inner: string, margin = "4px 0 22px") =>
  `${grid(`margin:${margin};`)}<tr>
<td bgcolor="${C.ground}" style="padding:20px 22px 8px;background-color:${C.ground};border:1px solid ${C.border};border-radius:14px;">
<p style="margin:0 0 12px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${C.teal};">${label}</p>
${inner}
</td>
</tr></table>`;

/** Numbered steps, ruled top and bottom, the numeral in Georgia. */
const steps = (items: string[]) =>
  `${grid("margin:0 0 18px;border-top:1px solid " + C.border + ";border-bottom:1px solid " + C.border + ";")}${items
    .map((s, i) => {
      const rule = i === 0 ? "" : `border-top:1px solid ${C.rule};`;
      return `<tr>
<td width="46" valign="top" style="width:46px;padding:14px 0 14px;${rule}font-family:${SERIF};font-size:28px;line-height:28px;color:${C.teal};">${i + 1}</td>
<td valign="top" style="padding:14px 0 14px;${rule}font-family:${SANS};font-size:15px;line-height:24px;color:${C.green};">${s}</td>
</tr>`;
    })
    .join("")}</table>`;

/** CTA. mso-padding-alt because Outlook drops padding on an inline-block
 *  anchor; the trailing arrow is part of the label in the handback. */
const button = (label: string, href: string, margin: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:${margin};border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt;">
<tr>
<td bgcolor="${C.green}" style="background-color:${C.green};border-radius:12px;mso-padding-alt:14px 24px;">
<a href="${href}" style="display:block;padding:14px 24px;font-family:${SANS};font-size:15px;line-height:22px;font-weight:600;color:#ffffff;text-decoration:none;">${label}&nbsp;&nbsp;&rarr;</a>
</td>
</tr>
</table>`;

/** Sign-off, with the founder line under it. */
const signature = (signoff: string, title: string) =>
  `<p style="margin:0 0 4px;font-family:${SERIF};font-size:18px;line-height:27px;color:${C.green};font-style:italic;">${signoff}</p>
<p style="margin:0 0 0px;font-family:${SANS};font-size:12.5px;line-height:19px;color:${C.secondary};">${title}</p>`;

/** The deep-green card that closes the last letter. */
const finale = (label: string, body: string) =>
  `${grid("margin:6px 0 22px;")}<tr>
<td bgcolor="${C.green}" style="padding:22px 22px 20px;background-color:${C.green};border-radius:16px;">
<p style="margin:0 0 10px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${L.lime};">${label}</p>
<p style="margin:0 0 0px;font-family:${SANS};font-size:15px;line-height:24px;color:#ffffff;">${body}</p>
</td>
</tr></table>`;

/** Hybrid columns: inline-block divs that wrap on a phone, with MSO tables so
 *  the Word engine still gets a two-column row. The calc() is the standard
 *  fluid-hybrid switch — no media queries anywhere in these emails.
 *  `total` is the content width (520 less the 24px gutters, less the gap). */
function columns(cells: string[], total: number, gap: number): string {
  const each = Math.floor((total - gap * (cells.length - 1)) / cells.length);
  const mso = (s: string) => `<!--[if mso]>${s}<![endif]-->`;
  const spacer = `${mso(`<td width="${gap}" style="width:${gap}px;">&nbsp;</td>`)}
<div style="display:inline-block;width:${gap}px;height:12px;vertical-align:top;">
</div>`;
  const col = (inner: string) =>
    `${mso(`<td width="${each}" valign="top" style="width:${each}px;">`)}
<div style="display:inline-block;vertical-align:top;width:100%;max-width:${each}px;min-width:${each}px;max-width:100%;width:calc((${total}px - 100%) * ${total});font-size:15px;line-height:25px;">
${inner}
</div>
${mso("</td>")}`;
  return `<div style="margin:2px 0 22px;">
<div style="font-size:0;line-height:0;text-align:left;">
${mso(`<table role="presentation" width="${total}" cellpadding="0" cellspacing="0" border="0"><tr>`)}
${cells.map(col).join("\n" + spacer + "\n")}
${mso("</tr></table>")}
</div>
</div>`;
}

// ── Product moments ──────────────────────────────────────────────────────────
// Each letter shows the screen it is describing. These are HTML, not
// screenshots: text in an image is unreadable when images are blocked, which is
// the default in most clients, and it cannot be translated.

/** Ninety days of readings, one bar per day. Heights are the handback's own
 *  sample series — a dip and a recovery, so the shape reads as a real trend. */
const TREND = [19, 17, 13, 10, 6, 5, 8, 12, 15, 14, 18, 20, 19, 24, 28, 32, 34, 33, 31, 33, 37, 41, 43, 40, 34, 31, 28, 27, 24, 20];

function weightCard(o: { inApp: string; label: string; value: string; summary: string; axisStart: string; axisEnd: string }): string {
  const bars = TREND.map(
    (h, i) => `<td valign="bottom" style="${i === 0 ? "" : "padding-left:2px;"}height:46px;">
${BARE}
<tr>
<td height="${h}" bgcolor="${L.lime}" style="height:${h}px;line-height:${h}px;font-size:0;background-color:${L.lime};border-radius:2px 2px 0 0;">&nbsp;</td>
</tr>
</table>
</td>`,
  ).join("\n");
  return `${grid("margin:6px 0 10px;")}<tr>
<td bgcolor="${C.green}" style="padding:22px 22px 18px;background-color:${C.green};border-radius:16px;">
<p style="margin:0 0 14px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${L.lime};">${o.inApp}</p>
<p style="margin:0 0 2px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${L.limeSoft};font-weight:600;">${o.label}</p>
<p style="margin:0 0 2px;font-family:${SANS};font-size:40px;line-height:46px;color:#ffffff;font-weight:300;letter-spacing:-.5px;">${o.value}</p>
<p style="margin:0 0 18px;font-family:${SANS};font-size:14px;line-height:21px;color:${L.onGreen};">${o.summary}</p>
${grid("table-layout:fixed;")}<tr>
${bars}
</tr>
</table>
${grid()}<tr>
<td style="padding:8px 0 0;font-family:${SANS};font-size:11px;line-height:14px;color:${L.limeSoft};">${o.axisStart}</td>
<td align="right" style="padding:8px 0 0;font-family:${SANS};font-size:11px;line-height:14px;color:${L.limeSoft};text-align:right;">${o.axisEnd}</td>
</tr>
</table>
</td>
</tr></table>`;
}

/** The health check: one card per question, with the three answer pills. The
 *  first pill is shown chosen, which is what a normal day looks like. */
function questionCards(o: { inApp: string; title: string; intro: string; questions: string[]; answers: [string, string, string]; more: string }): string {
  const pill = (text: string, chosen: boolean) =>
    chosen
      ? `<td align="center" bgcolor="${L.mid}" style="padding:7px 4px;background-color:${L.mid};border:1px solid ${L.mid};border-radius:9px;font-family:${SANS};font-size:12px;line-height:16px;color:#ffffff;text-align:center;">${text}</td>`
      : `<td align="center" bgcolor="#ffffff" style="padding:7px 4px;background-color:#ffffff;border:1px solid ${C.border};border-radius:9px;font-family:${SANS};font-size:12px;line-height:16px;color:${C.secondary};text-align:center;">${text}</td>`;
  const gapCell = `<td width="6" style="width:6px;font-size:0;">&nbsp;</td>`;
  const card = (q: string) => `<tr>
<td style="padding:0 0 10px;">
${grid()}<tr>
<td bgcolor="${L.pill}" style="padding:14px 14px 14px;background-color:${L.pill};border-radius:12px;">
<p style="margin:0 0 10px;font-family:${SANS};font-size:14px;line-height:20px;color:${C.green};font-weight:600;">${q}</p>
${grid("table-layout:fixed;")}<tr>
${pill(o.answers[0], true)}
${gapCell}
${pill(o.answers[1], false)}
${gapCell}
${pill(o.answers[2], false)}
</tr>
</table>
</td>
</tr>
</table>
</td>
</tr>`;
  return `${grid("margin:4px 0 24px;")}<tr>
<td bgcolor="${C.ground}" style="padding:20px 18px 16px;background-color:${C.ground};border:1px solid ${C.border};border-radius:16px;">
<p style="margin:0 0 10px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${C.teal};">${o.inApp}</p>
<p style="margin:0 0 4px;font-family:${SERIF};font-size:17px;line-height:24px;color:${C.green};">${o.title}</p>
<p style="margin:0 0 14px;font-family:${SANS};font-size:13.5px;line-height:20px;color:${C.secondary};">${o.intro}</p>
${grid()}${o.questions.map(card).join("\n")}
</table>
<p style="margin:0 0 2px;font-family:${SANS};font-size:13px;line-height:19px;color:${C.secondary};font-style:italic;">${o.more}</p>
</td>
</tr></table>`;
}

/** The care plan's six sections, 3x2. The first two are limed: they are the
 *  ones the letter tells you to start with, so the colour carries the advice. */
function sectionGrid(names: string[]): string {
  const cell = (name: string, i: number) => {
    const hot = i < 2;
    const bg = hot ? L.lime : C.ground;
    const num = hot ? L.mid : C.teal;
    return `<td width="33%" valign="top" bgcolor="${bg}" style="width:33%;padding:14px 12px 13px;background-color:${bg};border-radius:12px;">
<p style="margin:0 0 6px;font-family:${SANS};font-size:11px;line-height:14px;letter-spacing:.1em;color:${num};font-weight:700;">${String(i + 1).padStart(2, "0")}</p>
<p style="margin:0;font-family:${SERIF};font-size:16px;line-height:21px;color:${C.green};">${name}</p>
</td>`;
  };
  const gapCell = `<td width="8" style="width:8px;font-size:0;">&nbsp;</td>`;
  const row = (slice: string[], offset: number) =>
    `<tr>
${slice.map((n, i) => cell(n, offset + i)).join("\n" + gapCell + "\n")}
</tr>`;
  return `${grid("table-layout:fixed;margin:4px 0 10px;")}${row(names.slice(0, 3), 0)}
<tr>
<td height="8" style="height:8px;line-height:8px;font-size:0;">&nbsp;</td>
</tr>
${row(names.slice(3, 6), 3)}
</table>`;
}

/** One journal entry, as it would read on the record. */
function journalEntry(o: { label: string; date: string; body: string; moment: string }): string {
  return `${grid("margin:0 0 24px;")}<tr>
<td style="padding:20px 22px 16px;border:1px solid ${C.border};border-radius:16px;background-color:${C.card};">
${grid()}<tr>
<td style="font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${C.teal};">${o.label}</td>
<td align="right" style="font-family:${SANS};font-size:12.5px;line-height:16px;color:${C.secondary};text-align:right;">${o.date}</td>
</tr>
</table>
<p style="margin:14px 0 16px;font-family:${SERIF};font-style:italic;font-size:19px;line-height:29px;color:${C.green};">${o.body}</p>
${grid()}<tr>
<td style="padding:12px 0 0;border-top:1px solid ${C.rule};font-family:${SANS};font-size:13px;line-height:19px;color:${L.mid};font-weight:600;">${o.moment}</td>
</tr>
</table>
</td>
</tr></table>`;
}

/** The two ways to share, side by side: a sitter link and household access. */
function sharingCards(o: { sitterLabel: string; sitterBody: string; sitterFoot: string; householdLabel: string; householdBody: string; householdFoot: string }): string {
  const card = (bg: string, label: string, body: string, foot: string) =>
    `${grid()}<tr>
<td bgcolor="${bg}" style="padding:18px 18px 16px;background-color:${bg};border-radius:14px;">
<p style="margin:0 0 10px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${L.mid};">${label}</p>
<p style="margin:0 0 14px;font-family:${SANS};font-size:14.5px;line-height:23px;color:${C.green};">${body}</p>
${grid()}<tr>
<td style="padding:10px 0 0;border-top:1px solid ${C.border};font-family:${SANS};font-size:12.5px;line-height:18px;color:${C.secondary};">${foot}</td>
</tr>
</table>
</td>
</tr>
</table>`;
  return columns(
    [
      card(C.ground, o.sitterLabel, o.sitterBody, o.sitterFoot),
      card(L.household, o.householdLabel, o.householdBody, o.householdFoot),
    ],
    470,
    16,
  );
}

/** The ruled list of questions a record can answer, in the last letter. */
function vetQuestions(label: string, questions: string[]): string {
  const rows = questions
    .map(
      (q, i) => `<tr>
<td style="padding:12px 0;${i === 0 ? "" : `border-top:1px solid ${C.border};`}font-family:${SERIF};font-style:italic;font-size:18px;line-height:26px;color:${C.green};">${q}</td>
</tr>`,
    )
    .join("\n");
  return note(label, `${grid("margin:0 0 8px;")}${rows}
</table>`, "0px 0 22px");
}

// ── letterShell ──────────────────────────────────────────────────────────────

function letterShell(opts: {
  /** Which letter this is, 1-7. Drives the masthead label and the progress
   *  rule. Omit it for a letter that is not part of the series (the monthly
   *  recap): the rule is then not drawn and `mastLabel` names the letter. */
  n?: number;
  /** Masthead label, when this is not one of the seven ("October letter"). */
  mastLabel?: string;
  /** Raw <tr> rows emitted after the body row — for a letter whose body is
   *  several full-width sections rather than one column of prose. */
  rows?: string;
  /** Day the next letter lands. Omitted on the last one, which has no hand-off. */
  nextDay?: number;
  kicker: string;
  heading: string;
  /** Full-bleed image above the heading. Welcome, weighing and care plan only. */
  hero?: { file: string; alt: string };
  bodyHtml: string;
  nextUp?: string;
  /** Health-adjacent letters only. Not boilerplate. */
  healthNote?: string;
  preview?: string;
  foot: string;
  t: EmailT;
}): string {
  const t = opts.t;
  const TOTAL = 7;

  const preheader = opts.preview
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${opts.preview}${"&#8203;&nbsp;".repeat(12)}</div>`
    : "";

  // Progress: one cell per letter, the first n filled. The 2px white border-left
  // is the gap — border-spacing would be dropped by Outlook.
  const segments = Array.from({ length: TOTAL }, (_, i) => {
    const on = i < (opts.n ?? 0);
    const bg = on ? C.green : C.border;
    const edge = i === 0 ? "" : "border-left:2px solid #ffffff;";
    return `<td height="3" bgcolor="${bg}" style="height:3px;line-height:3px;font-size:0;background-color:${bg};${edge}">&nbsp;</td>`;
  }).join("\n");

  // Deep green behind the hero so the alt text reads in lime when the image is
  // blocked, instead of white-on-white.
  const hero = opts.hero
    ? `<tr>
<td bgcolor="${C.green}" style="padding:0;background-color:${C.green};line-height:0;font-size:0;">
<img src="${ASSETS}/brand/email/${opts.hero.file}" width="520" alt="${opts.hero.alt}" style="display:block;width:100%;max-width:520px;height:auto;border:0;font-family:${SERIF};font-style:italic;font-size:16px;line-height:24px;color:${L.lime};padding:0;" />
</td>
</tr>`
    : "";

  const nextUp =
    opts.nextUp && opts.nextDay !== undefined
      ? `<tr>
<td style="padding:26px 24px 0;">
${grid()}<tr>
<td style="padding:18px 0 0;border-top:1px solid ${C.rule};">
<p style="margin:0 0 6px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${C.secondary};font-weight:600;">${t("email.series.nextLabel", { day: opts.nextDay })}</p>
<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:16px;line-height:25px;color:${C.secondary};">${opts.nextUp}</p>
</td>
</tr>
</table>
</td>
</tr>`
      : "";

  const healthNote = opts.healthNote
    ? `<tr>
<td style="padding:22px 24px 0;">
<p style="margin:0 0 0px;font-family:${SANS};font-size:12px;line-height:18px;color:${L.muted};font-style:italic;">${opts.healthNote}</p>
</td>
</tr>`
    : "";

  return `
<div style="background-color:${C.ground};padding:24px 8px;font-family:${SANS};-webkit-text-size-adjust:100%;">${preheader}
  <!--[if mso]><table role="presentation" width="520" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:520px;margin:0 auto;table-layout:fixed;border-collapse:separate;border-spacing:0;border:1px solid ${C.border};border-radius:16px;background-color:${C.card};overflow:hidden;mso-table-lspace:0pt;mso-table-rspace:0pt;">
<tr>
<td bgcolor="${C.ground}" style="padding:16px 24px;background-color:${C.ground};border-bottom:1px solid ${C.rule};border-radius:16px 16px 0 0;">
${grid()}<tr>
<td valign="middle" style="padding:0;">
<img src="${ASSETS}/brand/email/lockup.png" width="150" alt="${t("email.series.lockupAlt")}" style="display:block;width:150px;height:auto;border:0;font-family:${SERIF};font-size:20px;line-height:26px;font-weight:bold;color:${C.green};" />
</td>
<td valign="middle" align="right" style="padding:0 0 0 12px;font-family:${SANS};font-size:10.5px;line-height:15px;letter-spacing:.14em;text-transform:uppercase;font-weight:600;color:${C.secondary};text-align:right;">${opts.mastLabel ?? t("email.series.letterOf", { n: opts.n })}</td>
</tr>
</table>
</td>
</tr>
${opts.n === undefined ? "" : `<tr>
<td style="padding:0;">
${grid()}<tr>
${segments}
</tr>
</table>
</td>
</tr>`}
${hero}
<tr>
<td style="padding:30px 24px 0;">
<p style="margin:0 0 12px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${L.mid};">${opts.kicker}</p>
<h1 style="margin:0;font-family:${SERIF};font-size:30px;line-height:37px;font-weight:normal;letter-spacing:-.2px;color:${C.green};">${opts.heading}</h1>
</td>
</tr>
<tr>
<td style="padding:22px 24px 0;">
${opts.bodyHtml}
</td>
</tr>
${opts.rows ?? ""}
${nextUp}
${healthNote}
<tr>
<td height="28" style="height:28px;line-height:28px;font-size:0;">&nbsp;</td>
</tr>
<tr>
<td bgcolor="${C.ground}" style="padding:24px 32px 26px;background-color:${C.ground};border-top:1px solid ${C.rule};border-radius:0 0 16px 16px;">
<img src="${ASSETS}/brand/email/mark.png" width="30" alt="" style="display:block;width:30px;height:auto;border:0;margin:0 auto 10px;" />
<p style="margin:0 0 12px;font-family:${SANS};font-size:12px;line-height:18px;color:${L.muted};text-align:center;">${opts.foot}</p>
<p style="margin:0 0 0px;font-family:${SERIF};font-size:13px;line-height:19px;color:${C.green};text-align:center;font-style:italic;">${t("email.shell.footNote")}</p>
</td>
</tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</div>`;
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
  /** Inbox preview line (the grey text beside the subject). Hidden in the body.
   *  Optional so existing callers are unaffected; supply it for anything where
   *  the first body words make a poor preview. */
  preview?: string;
  /** Localized chrome. When omitted (the account-less sitter-invite emails),
   *  the English literals are used. */
  t?: EmailT;
}): string {
  const accent = opts.accent ?? C.green;
  const footGap = opts.footGap ?? 20;
  const fieldNotes = opts.t ? opts.t("email.shell.fieldNotes") : "From the field notes";
  const footNote = opts.t ? opts.t("email.shell.footNote") : "Kya &amp; Co. — by The Kya Project";

  // Hidden preheader. Trailing entities stop the client pulling body text in
  // after it to pad the preview line.
  const preheader = opts.preview
    ? `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${opts.preview}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>`
    : "";

  // "From the field notes": a ruled section with an eyebrow and a serif linked
  // title — the same rhythm the monthly newsletter uses for its blog block,
  // instead of the old cream inset box.
  const reading = opts.reading
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
        <tr><td style="padding:20px 0 0;border-top:1px solid ${C.rule};">
          ${eyebrow(fieldNotes)}
          <h2 style="margin:8px 0 0;font-family:${SERIF};font-size:20px;line-height:27px;font-weight:normal;"><a href="${opts.reading.url}" style="color:${C.green};text-decoration:underline;">${opts.reading.title}</a></h2>
          <p style="margin:6px 0 0;font-family:${SANS};font-size:13.5px;line-height:21px;color:${C.secondary};">${opts.reading.teaser}</p>
        </td></tr>
      </table>`
    : "";

  // The onboarding series' hand-off line. Same ruled rhythm as the field-notes
  // block, in the serif italic so it reads as an aside rather than more body
  // copy. The spacer row is how you get air above a border in Outlook, which
  // drops margins on tables.
  const nextUp = opts.nextUp
    ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
        <tr><td height="22" style="height:22px;line-height:22px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:17px 0 0;border-top:1px solid ${C.rule};">
          <p style="margin:0;font-family:${SERIF};font-style:italic;font-size:15px;line-height:23px;color:${C.secondary};">${opts.nextUp}</p>
        </td></tr>
      </table>`
    : "";

  const healthNote = opts.healthNote
    ? `
      <p style="margin:22px 0 0;font-family:${SANS};font-size:11.5px;font-style:italic;line-height:1.5;color:${C.muted};">${opts.healthNote}</p>`
    : "";

  // Table-based button with mso-padding-alt: Outlook's Word engine drops
  // padding on an inline-block anchor, which used to collapse the CTA to bare
  // text on a coloured strip.
  const cta = opts.cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt;">
        <tr><td bgcolor="${accent}" style="background-color:${accent};border-radius:12px;mso-padding-alt:13px 22px;">
          <a href="${opts.link}" style="display:block;padding:13px 22px;font-family:${SANS};font-size:15px;line-height:22px;font-weight:600;color:#ffffff;text-decoration:none;">${opts.cta}</a>
        </td></tr>
      </table>`
    : "";

  // Outer gutter is 8px per side (was 24) so the card keeps its full width on a
  // 320px screen. The MSO conditional pins the card to 520px in the Word
  // engine, which ignores max-width entirely and would otherwise let it run the
  // full width of the reading pane.
  return `
<div style="background-color:${C.ground};padding:24px 8px;font-family:${SANS};-webkit-text-size-adjust:100%;">${preheader}
  <!--[if mso]><table role="presentation" width="520" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:520px;margin:0 auto;table-layout:fixed;border-collapse:separate;border-spacing:0;border:1px solid ${C.border};border-radius:16px;background-color:${C.card};mso-table-lspace:0pt;mso-table-rspace:0pt;">
    <tr><td bgcolor="${C.ground}" style="padding:20px 24px;background-color:${C.ground};border-bottom:1px solid ${C.rule};border-radius:16px 16px 0 0;">
      <img src="https://app.thekyaproject.com/brand/lockups/horizontal-cream.png" width="280" alt="Kya &amp; Co. — by The Kya Project" style="display:block;width:280px;max-width:100%;height:auto;border:0;font-family:${SERIF};font-size:22px;line-height:28px;color:${C.green};" />
    </td></tr>
    <tr><td bgcolor="${accent}" style="padding:18px 24px;background-color:${accent};">
      ${eyebrow(opts.kicker, "rgba(255,255,255,.85)")}
      <h1 style="margin:7px 0 0;font-family:${SERIF};font-size:21px;line-height:28px;font-weight:500;color:#ffffff;">${opts.heading}</h1>
    </td></tr>
    <tr><td style="padding:24px;">
      ${opts.bodyHtml ?? `<p style="margin:0;font-family:${SANS};font-size:15px;line-height:1.6;color:${C.green};">${opts.body}</p>`}${cta}${reading}${nextUp}${healthNote}
      <p style="margin:${footGap}px 0 0;font-family:${SANS};font-size:${opts.footFine ? "11.5" : "12"}px;line-height:1.5;color:${C.muted};${opts.footFine ? "font-style:italic;" : ""}">${opts.foot}</p>
      <p style="margin:18px 0 0;font-family:${SANS};font-size:11px;line-height:17px;color:${C.muted};text-align:center;border-top:1px solid ${C.rule};padding-top:12px;">${footNote}</p>
    </td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
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

// ── The onboarding letters (days 0, 3, 6, 9, 12, 15, 18) ─────────────────────
// Seven letters on letterShell(). Send timing, triggers, subjects, preview text
// and CTA targets are unchanged; only the layout and the product moments are
// new. Structure is set by docs/email-redesign/templates/NN-name.html — see the
// note above letterShell() before changing any of it.
//
// Heroes are on three letters only (welcome, weighing, care plan). The rest
// lead with type, because a photograph on every one stops meaning anything.

// ── Welcome (day 0) ──────────────────────────────────────────────────────────
// A personal note from Brittany, not a product announcement: it is signed by
// her, invites a reply, and the send sets reply-to accordingly.
export function buildWelcomeEmail(opts: { firstName?: string; link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  const hi = opts.firstName
    ? t("email.welcome.hiName", { firstName: escapeHtml(opts.firstName) })
    : t("email.welcome.hiNoName");
  // Two sentences, one paragraph — each stays its own key.
  const leadCopy = `${t("email.welcome.founder")} ${t("email.welcome.birds")}`;
  return {
    subject: t("email.welcome.subject"),
    html: letterShell({
      n: 1,
      nextDay: 3,
      preview: t("email.welcome.preview"),
      kicker: t("email.welcome.kicker"),
      heading: t("email.welcome.heading"),
      hero: { file: "welcome.jpg", alt: t("email.welcome.heroAlt") },
      bodyHtml:
        para(hi) +
        lead(leadCopy) +
        para(t("email.welcome.built")) +
        paraLeadIn(t("email.welcome.startThisWeek")) +
        steps([
          t("email.welcome.stepAddBird"),
          t("email.welcome.stepWeight"),
          t("email.welcome.stepScan"),
        ]) +
        statement(t("email.welcome.together")) +
        para(t("email.welcome.series")) +
        para(t("email.welcome.carePlan")) +
        para(t("email.welcome.reply")) +
        button(t("email.welcome.cta"), opts.link, "6px 0 26px") +
        signature(t("email.welcome.signoff"), t("email.series.signTitle")),
      nextUp: t("email.welcome.nextUp"),
      healthNote: t("email.welcome.healthNote"),
      foot: t("email.welcome.foot"),
      t,
    }),
    text: t("email.welcome.text", { link: opts.link }),
  };
}

// Day 3 — weighing. The only letter that can solve the scale problem: someone
// without a gram scale is stuck whatever comes later. The product moment is the
// weight card, with ninety days of readings as one line.
export function buildSeriesWeighingEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesWeighing.subject"),
    html: letterShell({
      n: 2,
      nextDay: 6,
      preview: t("email.seriesWeighing.preview"),
      kicker: t("email.seriesWeighing.kicker"),
      heading: t("email.seriesWeighing.heading"),
      hero: { file: "weighing.jpg", alt: t("email.seriesWeighing.heroAlt") },
      bodyHtml:
        lead(t("email.seriesWeighing.lead")) +
        note(
          t("email.seriesWeighing.card1Label"),
          noteBullets([t("email.seriesWeighing.card1Li1"), t("email.seriesWeighing.card1Li2")]),
        ) +
        para(t("email.seriesWeighing.p2")) +
        para(t("email.seriesWeighing.p3")) +
        weightCard({
          inApp: t("email.moment.inTheApp"),
          label: t("email.seriesWeighing.momentLabel"),
          value: t("email.seriesWeighing.momentValue"),
          summary: t("email.seriesWeighing.momentSummary"),
          axisStart: t("email.seriesWeighing.momentAxisStart"),
          axisEnd: t("email.seriesWeighing.momentAxisEnd"),
        }) +
        caption(t("email.seriesWeighing.momentCaption")) +
        para(t("email.seriesWeighing.p4")) +
        button(t("email.seriesWeighing.cta"), opts.link, "8px 0 8px"),
      nextUp: t("email.seriesWeighing.nextUp"),
      healthNote: t("email.seriesWeighing.healthNote"),
      foot: t("email.seriesWeighing.foot"),
      t,
    }),
    text: t("email.seriesWeighing.text", { link: opts.link }),
  };
}

// Day 6 — the daily health check. The moment shows three of the questions with
// their answer pills, so the habit is recognisable before you open the app.
export function buildSeriesHealthCheckEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesHealthCheck.subject"),
    html: letterShell({
      n: 3,
      nextDay: 9,
      preview: t("email.seriesHealthCheck.preview"),
      kicker: t("email.seriesHealthCheck.kicker"),
      heading: t("email.seriesHealthCheck.heading"),
      bodyHtml:
        lead(t("email.seriesHealthCheck.lead")) +
        para(t("email.seriesHealthCheck.p2")) +
        questionCards({
          inApp: t("email.moment.inTheApp"),
          title: t("email.seriesHealthCheck.momentTitle"),
          intro: t("email.seriesHealthCheck.momentIntro"),
          questions: [
            t("email.seriesHealthCheck.q1"),
            t("email.seriesHealthCheck.q2"),
            t("email.seriesHealthCheck.q3"),
          ],
          answers: [
            t("email.scanReason.normal"),
            t("email.scanReason.notSure"),
            t("email.scanReason.concerning"),
          ],
          more: t("email.seriesHealthCheck.more"),
        }) +
        note(t("email.seriesHealthCheck.card1Label"), noteP(t("email.seriesHealthCheck.card1P1"))) +
        para(t("email.seriesHealthCheck.p3")) +
        button(t("email.seriesHealthCheck.cta"), opts.link, "8px 0 8px"),
      nextUp: t("email.seriesHealthCheck.nextUp"),
      healthNote: t("email.seriesHealthCheck.healthNote"),
      foot: t("email.seriesHealthCheck.foot"),
      t,
    }),
    text: t("email.seriesHealthCheck.text", { link: opts.link }),
  };
}

// Day 9 — the care plan. The six sections as a grid, Food and Routine limed
// because those are the two the copy tells you to start with.
export function buildSeriesCarePlanEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesCarePlan.subject"),
    html: letterShell({
      n: 4,
      nextDay: 12,
      preview: t("email.seriesCarePlan.preview"),
      kicker: t("email.seriesCarePlan.kicker"),
      heading: t("email.seriesCarePlan.heading"),
      hero: { file: "care-plan.jpg", alt: t("email.seriesCarePlan.heroAlt") },
      bodyHtml:
        lead(t("email.seriesCarePlan.lead")) +
        sectionGrid(t("email.seriesCarePlan.sections").split("|")) +
        caption(t("email.seriesCarePlan.momentCaption")) +
        para(t("email.seriesCarePlan.p2")) +
        note(t("email.seriesCarePlan.card1Label"), noteP(t("email.seriesCarePlan.card1P1"))) +
        para(t("email.seriesCarePlan.p3")) +
        para(t("email.seriesCarePlan.p4")) +
        para(t("email.seriesCarePlan.p5")) +
        button(t("email.seriesCarePlan.cta"), opts.link, "8px 0 8px"),
      nextUp: t("email.seriesCarePlan.nextUp"),
      foot: t("email.seriesCarePlan.foot"),
      t,
    }),
    text: t("email.seriesCarePlan.text", { link: opts.link }),
  };
}

// Day 12 — journal and moments. The one letter that asks for no new habit;
// three in a row asking someone to start something is a lot.
export function buildSeriesJournalEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesJournal.subject"),
    html: letterShell({
      n: 5,
      nextDay: 15,
      preview: t("email.seriesJournal.preview"),
      kicker: t("email.seriesJournal.kicker"),
      heading: t("email.seriesJournal.heading"),
      bodyHtml:
        lead(t("email.seriesJournal.lead")) +
        journalEntry({
          label: t("email.moment.example"),
          date: t("email.seriesJournal.entryDate"),
          body: t("email.seriesJournal.entry"),
          moment: t("email.seriesJournal.momentLine"),
        }) +
        para(t("email.seriesJournal.p2")) +
        para(t("email.seriesJournal.p3")) +
        para(t("email.seriesJournal.p4")) +
        statement(t("email.seriesJournal.p5")) +
        button(t("email.seriesJournal.cta"), opts.link, "0px 0 8px"),
      nextUp: t("email.seriesJournal.nextUp"),
      foot: t("email.seriesJournal.foot"),
      t,
    }),
    text: t("email.seriesJournal.text", { link: opts.link }),
  };
}

// Day 15 — sharing with a sitter or the household. The two options side by
// side, because the whole point is that they are different things.
export function buildSeriesSharingEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesSharing.subject"),
    html: letterShell({
      n: 6,
      nextDay: 18,
      preview: t("email.seriesSharing.preview"),
      kicker: t("email.seriesSharing.kicker"),
      heading: t("email.seriesSharing.heading"),
      bodyHtml:
        lead(t("email.seriesSharing.lead")) +
        sharingCards({
          sitterLabel: t("email.seriesSharing.card1Label"),
          sitterBody: t("email.seriesSharing.card1P1"),
          sitterFoot: t("email.seriesSharing.sitterAccount"),
          householdLabel: t("email.seriesSharing.card2Label"),
          householdBody: t("email.seriesSharing.card2P1"),
          householdFoot: t("email.seriesSharing.householdAccount"),
        }) +
        para(t("email.seriesSharing.p2")) +
        para(t("email.seriesSharing.p3")) +
        button(t("email.seriesSharing.cta"), opts.link, "8px 0 8px"),
      nextUp: t("email.seriesSharing.nextUp"),
      foot: t("email.seriesSharing.foot"),
      t,
    }),
    text: t("email.seriesSharing.text", { link: opts.link }),
  };
}

// Day 18 — the vet summary. Closes the series and hands off to the monthly
// recap, so the first monthly letter does not arrive out of nowhere. No
// "next letter" block: there isn't one.
export function buildSeriesVetEmail(opts: { link: string; locale?: string }): BuiltEmail {
  const t = emailT(opts.locale);
  return {
    subject: t("email.seriesVet.subject"),
    html: letterShell({
      n: 7,
      preview: t("email.seriesVet.preview"),
      kicker: t("email.seriesVet.kicker"),
      heading: t("email.seriesVet.heading"),
      bodyHtml:
        lead(t("email.seriesVet.leadIntro")) +
        vetQuestions(t("email.seriesVet.questionsLabel"), [
          t("email.seriesVet.q1"),
          t("email.seriesVet.q2"),
          t("email.seriesVet.q3"),
        ]) +
        para(t("email.seriesVet.p2")) +
        para(t("email.seriesVet.p3")) +
        para(t("email.seriesVet.p4")) +
        button(t("email.seriesVet.cta"), opts.link, "4px 0 24px") +
        finale(t("email.seriesVet.card1Label"), t("email.seriesVet.card1P1")) +
        para(t("email.seriesVet.p5")) +
        signature(t("email.seriesVet.signoff"), t("email.series.signTitle")),
      healthNote: t("email.seriesVet.healthNote"),
      foot: t("email.seriesVet.foot"),
      t,
    }),
    text: t("email.seriesVet.text", { link: opts.link }),
  };
}


// ── The monthly letter ───────────────────────────────────────────────────────
// Sends on the 2nd, recapping the previous month: one letter per account, one
// section per bird. It reuses letterShell() with `mastLabel` instead of the
// series label and no progress rule — the chrome is otherwise identical, which
// is why the two share a shell rather than each carrying a copy.
//
// Structure comes from docs/email-redesign/templates/08-monthly.html (the full
// letter) and 09-monthly-quiet.html (every bird quiet).
//
// The month is NOT baked into the copy. The handback writes "October letter",
// "Weight in September" and "August's 19 g" as literals because it is a single
// rendered example; every one of those is a {{placeholder}} here, and month
// names come from email.monthly.month.N so Dutch gets its own.

/** A bird's month, already computed. The builder does no arithmetic on the
 *  record beyond formatting — the hook owns the queries. */
export type MonthlyBird = {
  name: string;
  species: string;
  recordUrl: string;
  /** The month's readings in order. Drives the chart; empty is fine. */
  weights: number[];
  /** Previous month's spread (max-min), for the comparison line. Null when
   *  there was no previous month to compare, which drops the comparison
   *  rather than inventing one. */
  prevSpread: number | null;
  checks: number;
  flagged: number;
  journalEntries: number;
  journalPhotos: number;
  /** Sections touched this month, already joined ("Food and Routine"). */
  planUpdated: { date: string; sections: string } | null;
  /** A journal line worth quoting. Entries with no body are not quotable, so
   *  the hook passes null and the block is dropped. */
  quote: { date: string; body: string } | null;
  /** Set when the bird is quiet: fewer than four weigh-ins AND no checks. */
  lastWeight: { grams: number; date: string } | null;
  lastCheck: { date: string; flagged: boolean } | null;
};

/** Quiet: too little logged for a recap to say anything. Deliberately generous
 *  — the quiet block is a way back in, not a telling-off. */
export function isQuietMonth(b: MonthlyBird): boolean {
  return b.weights.length < 4 && b.checks === 0;
}

const monthName = (t: EmailT, m: number) => t(`email.monthly.month.${m}`);

/** The dark weight card: typical weight, the month's readings as bars, the
 *  range line, and one sentence about the spread. */
function monthlyWeightCard(t: EmailT, b: MonthlyBird, prevMonth: string, days: number): string {
  const lo = Math.min(...b.weights);
  const hi = Math.max(...b.weights);
  const spread = hi - lo;
  const typical = Math.round(b.weights.reduce((a, x) => a + x, 0) / b.weights.length);
  const span = spread || 1;
  const bars = b.weights
    .map((v, i) => {
      const h = 8 + Math.round(((v - lo) / span) * 32); // 8..40px, the handback's band
      return `<td valign="bottom" style="${i === 0 ? "" : "padding-left:2px;"}height:40px;">
${BARE}
<tr>
<td height="${h}" bgcolor="${L.lime}" style="height:${h}px;line-height:${h}px;font-size:0;background-color:${L.lime};border-radius:2px 2px 0 0;">&nbsp;</td>
</tr>
</table>
</td>`;
    })
    .join("\n");

  // Only claim "tighter" or "wider" when there is a previous month to compare
  // and the two differ. A false claim about someone's numbers is worse than
  // saying less.
  const narrative =
    b.prevSpread === null || b.prevSpread === spread
      ? t("email.monthly.rangeOnly", { bird: b.name, range: spread })
      : spread < b.prevSpread
        ? t("email.monthly.narrowerThan", { bird: b.name, range: spread, prevMonth, prevRange: b.prevSpread })
        : t("email.monthly.widerThan", { bird: b.name, range: spread, prevMonth, prevRange: b.prevSpread });

  const rangeLine =
    b.weights.length === 1
      ? t("email.monthly.weightRangeOne", { days })
      : t("email.monthly.weightRange", { min: lo, max: hi, count: b.weights.length, days });

  return `${grid("margin:0;")}<tr>
<td bgcolor="${C.green}" style="padding:20px 22px 20px;background-color:${C.green};border-radius:16px;">
<p style="margin:0 0 6px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${L.lime};">${t("email.monthly.weightLabel", { prevMonth })}</p>
${grid()}<tr>
<td valign="bottom" style="font-family:${SANS};font-size:40px;line-height:44px;font-weight:300;letter-spacing:-.5px;color:#ffffff;">${typical}&nbsp;g</td>
<td valign="bottom" align="right" style="padding:0 0 6px 12px;font-family:${SANS};font-size:13px;line-height:18px;color:${L.onGreen};text-align:right;">${t("email.monthly.weightTypical")}</td>
</tr>
</table>
<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>
${grid("table-layout:fixed;")}<tr>
${bars}
</tr>
</table>
<p style="margin:0 0 14px;font-family:${SANS};font-size:12.5px;line-height:18px;color:${L.limeSoft};padding-top:8px;">${rangeLine}</p>
${grid()}<tr>
<td style="padding:14px 0 0;border-top:1px solid #2f5a47;font-family:${SERIF};font-style:italic;font-size:16px;line-height:24px;color:#ffffff;">${narrative}</td>
</tr>
</table>
</td>
</tr></table>`;
}

/** One cream stat card. Three of them sit in a hybrid row. */
function monthlyStatCard(label: string, value: string, sub: string): string {
  return `${grid()}<tr>
<td bgcolor="${C.ground}" style="padding:16px 16px 14px;background-color:${C.ground};border-radius:14px;">
<p style="margin:0 0 8px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${C.teal};">${label}</p>
<p style="margin:0 0 4px;font-family:${SERIF};font-size:22px;line-height:28px;color:${C.green};">${value}</p>
<p style="margin:0 0 0px;font-family:${SANS};font-size:12.5px;line-height:18px;color:${C.secondary};">${sub}</p>
</td>
</tr>
</table>`;
}

/** The bird's name and species, over a heavy rule. */
function monthlyBirdHeading(name: string, species: string): string {
  return `${grid()}<tr>
<td valign="bottom" style="padding:0 0 12px;border-bottom:2px solid ${C.green};">
<p style="margin:0;font-family:${SERIF};font-size:26px;line-height:32px;color:${C.green};">${name}</p>
</td>
<td valign="bottom" align="right" style="padding:0 0 15px 12px;border-bottom:2px solid ${C.green};font-family:${SANS};font-size:13px;line-height:19px;color:${C.secondary};text-align:right;">${species}</td>
</tr>
</table>`;
}

const monthlyRecordLink = (t: EmailT, b: MonthlyBird) =>
  `<div style="height:18px;line-height:18px;font-size:0;">&nbsp;</div>
<p style="margin:0 0 0px;font-family:${SANS};font-size:14px;line-height:20px;color:${L.mid};">
<a href="${b.recordUrl}" style="color:${L.mid};font-weight:600;text-decoration:underline;">${t("email.monthly.recordLink", { bird: b.name })}&nbsp;&rarr;</a>
</p>`;

/** A bird's full section: heading, weight card, three stat cards, an optional
 *  journal quote, and the link to the record. */
function monthlyBirdRow(t: EmailT, b: MonthlyBird, first: boolean, prevMonth: string, days: number): string {
  const checksSub = b.flagged === 0 ? t("email.monthly.checksNoneFlagged") : t("email.monthly.checksFlagged", { count: b.flagged });
  const journalValue = b.journalEntries === 1 ? t("email.monthly.journalValueOne") : t("email.monthly.journalValue", { count: b.journalEntries });
  const journalSub = b.journalPhotos > 0 ? t("email.monthly.journalPhotos", { count: b.journalPhotos }) : t("email.monthly.journalNoPhotos");
  const planValue = b.planUpdated ? b.planUpdated.date : "&mdash;";
  const planSub = b.planUpdated
    ? t("email.monthly.planUpdated", { sections: b.planUpdated.sections })
    : t("email.monthly.planNotUpdated", { prevMonth });

  const quote = b.quote
    ? `${grid()}<tr>
<td style="padding:20px 0 0;">
<p style="margin:0 0 8px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${C.teal};">${t("email.monthly.journalQuoteLabel", { date: b.quote.date })}</p>
<p style="margin:0;font-family:${SERIF};font-style:italic;font-size:19px;line-height:29px;color:${C.green};">&ldquo;${b.quote.body}&rdquo;</p>
</td>
</tr>
</table>`
    : "";

  return `<tr>
<td style="padding:${first ? "8px" : "30px"} 24px 0;">
${monthlyBirdHeading(b.name, b.species)}
${monthlyWeightCard(t, b, prevMonth, days)}
<div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
${columns(
  [
    monthlyStatCard(t("email.monthly.checksLabel"), t("email.monthly.checksValue", { count: b.checks, days }), checksSub),
    monthlyStatCard(t("email.monthly.journalLabel"), journalValue, journalSub),
    monthlyStatCard(t("email.monthly.planLabel"), planValue, planSub),
  ],
  470,
  16,
)}
${quote}
${monthlyRecordLink(t, b)}
</td>
</tr>`;
}

/** A quiet bird: no chart, no scores. What is on the record, and a way back. */
function monthlyQuietRow(t: EmailT, b: MonthlyBird, first: boolean): string {
  const weightCard = b.lastWeight
    ? monthlyStatCard(t("email.monthly.lastLabel"), `${b.lastWeight.grams}&nbsp;g`, t("email.monthly.lastWeight", { date: b.lastWeight.date }))
    : monthlyStatCard(t("email.monthly.lastLabel"), "&mdash;", t("email.monthly.nothingYet"));
  const checkCard = b.lastCheck
    ? monthlyStatCard(t("email.monthly.lastCheckLabel"), b.lastCheck.date, b.lastCheck.flagged ? t("email.monthly.checksFlagged", { count: 1 }) : t("email.monthly.checksNoneFlagged"))
    : monthlyStatCard(t("email.monthly.lastCheckLabel"), "&mdash;", t("email.monthly.nothingYet"));
  return `<tr>
<td style="padding:${first ? "8px" : "30px"} 24px 0;">
${monthlyBirdHeading(b.name, b.species)}
<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:24px;color:${C.green};">${t("email.monthly.quietLead", { bird: b.name })}</p>
${columns([weightCard, checkCard], 470, 16)}
${monthlyRecordLink(t, b)}
</td>
</tr>`;
}

/** "Coming up in October" — dates already on the record. Omitted entirely when
 *  there are none, rather than printing an empty heading. */
function monthlyComingUp(t: EmailT, month: string, items: Array<{ mon: string; day: number; title: string; sub: string }>): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      (it, i) => `<tr>
<td width="64" valign="top" style="width:64px;padding:${i === 0 ? "0px" : "12px"} 16px 12px 0;">
${grid()}<tr>
<td align="center" bgcolor="${C.green}" style="padding:4px 0;background-color:${C.green};border-radius:10px 10px 0 0;font-family:${SANS};font-size:10.5px;line-height:14px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${L.lime};text-align:center;">${it.mon}</td>
</tr>
<tr>
<td align="center" style="padding:6px 0 8px;border:1px solid ${C.border};border-top:0;border-radius:0 0 10px 10px;font-family:${SERIF};font-size:28px;line-height:32px;color:${C.green};text-align:center;">${it.day}</td>
</tr>
</table>
</td>
<td valign="middle" style="padding:${i === 0 ? "0px" : "12px"} 0 12px;${i === 0 ? "" : `border-top:1px solid ${C.rule};`}">
<p style="margin:0 0 4px;font-family:${SERIF};font-size:17px;line-height:24px;color:${C.green};">${it.title}</p>
<p style="margin:0 0 0px;font-family:${SANS};font-size:14px;line-height:21px;color:${C.secondary};">${it.sub}</p>
</td>
</tr>`,
    )
    .join("\n");
  return `<tr>
<td style="padding:30px 24px 0;">
${grid()}<tr>
<td style="padding:24px 0 0;border-top:1px solid ${C.rule};">
<p style="margin:0 0 14px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${L.mid};">${t("email.monthly.comingLabel", { month })}</p>
${grid()}${rows}
</table>
</td>
</tr>
</table>
</td>
</tr>`;
}

/** The care note for the send month — twelve of them, keyed 1-12. */
function monthlyCareNote(t: EmailT, month: number): string {
  const bullets = [1, 2, 3]
    .map(
      (i) => `<tr>
<td width="20" valign="top" style="width:20px;padding:0 0 12px;font-family:${SANS};font-size:9px;line-height:23px;color:${C.teal};">&#9679;</td>
<td valign="top" style="padding:0 0 12px;font-family:${SANS};font-size:14.5px;line-height:23px;color:${C.green};">${t(`email.monthly.care.${month}.n${i}`)}</td>
</tr>`,
    )
    .join("\n");
  return `<tr>
<td style="padding:30px 24px 0;">
${grid()}<tr>
<td bgcolor="${C.ground}" style="padding:20px 22px 8px;background-color:${C.ground};border:1px solid ${C.border};border-radius:14px;">
<p style="margin:0 0 6px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${C.teal};">${t("email.monthly.careLabel")}</p>
<p style="margin:0 0 14px;font-family:${SERIF};font-size:20px;line-height:27px;color:${C.green};">${t(`email.monthly.care.${month}.title`)}</p>
${grid()}${bullets}
</table>
</td>
</tr>
</table>
</td>
</tr>`;
}

/** The newest post from the blog. Omitted when the Webflow pull is not
 *  configured or fails — the letter is about the reader's birds and stands up
 *  without it. */
export type MonthlyArticle = { title: string; intro: string; url: string; minutes: number; imageUrl?: string; imageAlt?: string };

function monthlyArticleBlock(t: EmailT, a: MonthlyArticle | null): string {
  if (!a) return "";
  const img = a.imageUrl
    ? `<img src="${a.imageUrl}" width="470" alt="${a.imageAlt ?? ""}" style="display:block;width:100%;max-width:470px;height:auto;border:0;border-radius:12px;margin:0 0 14px;" />`
    : "";
  return `<tr>
<td style="padding:30px 24px 0;">
${grid()}<tr>
<td style="padding:24px 0 0;border-top:1px solid ${C.rule};">
<p style="margin:0 0 12px;font-family:${SANS};font-size:11px;line-height:16px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:${C.teal};">${t("email.monthly.fieldLabel")}</p>
${img}<p style="margin:0 0 6px;font-family:${SERIF};font-size:20px;line-height:27px;color:${C.green};"><a href="${a.url}" style="color:${C.green};text-decoration:underline;">${a.title}</a></p>
<p style="margin:0 0 10px;font-family:${SANS};font-size:14px;line-height:21px;color:${C.secondary};">${a.intro}</p>
<p style="margin:0 0 0px;font-family:${SANS};font-size:12.5px;line-height:18px;color:${C.secondary};">${t("email.monthly.fieldMeta", { minutes: a.minutes })}&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${a.url}" style="color:${L.mid};font-weight:600;text-decoration:underline;">${t("email.monthly.fieldLink")}&nbsp;&rarr;</a></p>
</td>
</tr>
</table>
</td>
</tr>`;
}

/** "Willow", "Willow and Moxie", "Echo, Willow and Moxie". */
function joinBirdNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

/**
 * The monthly letter. One per account, one section per bird, in the order the
 * caller passes them. Birds marked as passed are the hook's job to exclude —
 * a memorial has no place in a recap.
 *
 * When EVERY bird is quiet the letter changes shape entirely (the handback's
 * 09-monthly-quiet): no per-bird sections, no chart, just what is still on the
 * record and two easy ways back in. A recap of nothing, formatted as a recap,
 * reads as a reprimand.
 */
export function buildMonthlyEmail(opts: {
  firstName?: string;
  birds: MonthlyBird[];
  /** Send month, 1-12. Drives the masthead, the hero and the care note. */
  month: number;
  /** Year of the send month — only used to work out the month being recapped. */
  year: number;
  link: string;
  coming?: Array<{ mon: string; day: number; title: string; sub: string }>;
  article?: MonthlyArticle | null;
  locale?: string;
}): BuiltEmail {
  const t = emailT(opts.locale);
  const month = opts.month;
  const prevMonthNum = month === 1 ? 12 : month - 1;
  const monthLabel = monthName(t, month);
  const prevMonth = monthName(t, prevMonthNum);
  const prevYear = month === 1 ? opts.year - 1 : opts.year;
  const days = new Date(Date.UTC(prevYear, prevMonthNum, 0)).getUTCDate();

  const names = opts.birds.map((b) => escapeHtml(b.name));
  const birdsLabel = joinBirdNames(names);
  const subject =
    names.length === 1
      ? t("email.monthly.subjectOne", { birdName: opts.birds[0].name, prevMonth })
      : names.length === 2
        ? t("email.monthly.subjectTwo", { birdName1: opts.birds[0].name, birdName2: opts.birds[1].name, prevMonth })
        : t("email.monthly.subjectMany", { prevMonth });

  const hi = t("email.monthly.hi", { firstName: escapeHtml(opts.firstName ?? "") });
  const allQuiet = opts.birds.length > 0 && opts.birds.every(isQuietMonth);

  // ── The quiet letter: every bird quiet ────────────────────────────────────
  if (allQuiet) {
    const steps = [t("email.monthly.qStart1"), t("email.monthly.qStart2")];
    const lastCards = opts.birds.flatMap((b) => [
      b.lastWeight
        ? monthlyStatCard(t("email.monthly.lastLabel"), `${b.lastWeight.grams}&nbsp;g`, t("email.monthly.lastWeight", { date: b.lastWeight.date }))
        : monthlyStatCard(t("email.monthly.lastLabel"), "&mdash;", t("email.monthly.nothingYet")),
    ]);
    return {
      subject,
      html: letterShell({
        mastLabel: t("email.monthly.mast", { month: monthLabel }),
        preview: t("email.monthly.preview"),
        kicker: t("email.monthly.kicker", { birds: birdsLabel }),
        heading: t("email.monthly.heading", { prevMonth }),
        hero: { file: `monthly/${String(month).padStart(2, "0")}.jpg`, alt: t(`email.monthly.care.${month}.alt`) },
        bodyHtml:
          para(hi) +
          lead(t("email.monthly.qLead")) +
          (lastCards.length ? columns(lastCards.slice(0, 3), 470, 16) : "") +
          note(t("email.monthly.qStartLabel"), steps.map((s, i) => `<p style="margin:0 0 12px;font-family:${SANS};font-size:14.5px;line-height:23px;color:${C.green};"><b>${i + 1}.</b>&nbsp; ${s}</p>`).join("")) +
          button(t("email.monthly.qCta"), opts.link, "8px 0 8px"),
        rows:
          monthlyCareNote(t, month) +
          monthlyArticleBlock(t, opts.article ?? null) +
          monthlyReplyRow(t),
        healthNote: t("email.monthly.healthNote"),
        foot: t("email.monthly.foot"),
        t,
      }),
      text: monthlyText(t, subject, opts.link),
    };
  }

  // ── The full letter ───────────────────────────────────────────────────────
  const birdRows = opts.birds
    .map((b, i) => (isQuietMonth(b) ? monthlyQuietRow(t, b, i === 0) : monthlyBirdRow(t, b, i === 0, prevMonth, days)))
    .join("\n");

  const closing = `<tr>
<td style="padding:26px 24px 0;">
<p style="margin:0 0 4px;font-family:${SANS};font-size:13px;line-height:20px;color:${C.secondary};font-style:italic;">${t("email.monthly.notGrade")}</p>
${button(t("email.monthly.cta"), opts.link, "14px 0 0px")}
</td>
</tr>`;

  return {
    subject,
    html: letterShell({
      mastLabel: t("email.monthly.mast", { month: monthLabel }),
      preview: t("email.monthly.preview"),
      kicker: t("email.monthly.kicker", { birds: birdsLabel }),
      heading: t("email.monthly.heading", { prevMonth }),
      hero: { file: `monthly/${String(month).padStart(2, "0")}.jpg`, alt: t(`email.monthly.care.${month}.alt`) },
      bodyHtml: para(hi) + lead(t("email.monthly.lead", { birds: birdsLabel })),
      rows:
        birdRows +
        closing +
        monthlyComingUp(t, monthLabel, opts.coming ?? []) +
        monthlyCareNote(t, month) +
        monthlyArticleBlock(t, opts.article ?? null) +
        monthlyReplyRow(t),
      healthNote: t("email.monthly.healthNote"),
      foot: t("email.monthly.foot"),
      t,
    }),
    text: monthlyText(t, subject, opts.link),
  };
}

/** The closing invitation to reply, and Brittany's sign-off. */
function monthlyReplyRow(t: EmailT): string {
  return `<tr>
<td style="padding:30px 24px 0;">
${grid()}<tr>
<td style="padding:24px 0 0;border-top:1px solid ${C.rule};">
<p style="margin:0 0 14px;font-family:${SANS};font-size:15px;line-height:25px;color:${C.green};">${t("email.monthly.reply")}</p>
${signature(t("email.monthly.signoff"), t("email.series.signTitle"))}
</td>
</tr>
</table>
</td>
</tr>`;
}

/** Plain-text alternative. Deliberately short: the value of this letter is the
 *  record laid out visually, and a text dump of every bird's stats reads like a
 *  billing statement. */
function monthlyText(t: EmailT, subject: string, link: string): string {
  return `${subject}\n\n${t("email.monthly.reply")}\n\n${t("email.monthly.cta")}: ${link}\n\n${t("email.monthly.healthNote")}\n\nKya & Co. — by The Kya Project`;
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
