// ── Flock Club: the shared email layout ──────────────────────────────────────
//
// Every Kya & Co. email will be built from this. It replaces nothing yet:
// shell() and letterShell() in emailTemplates.ts still render the current
// programme, and this sits alongside them until each email is moved across one
// at a time.
//
// WHAT IS DIFFERENT FROM THE OLD LAYOUTS
//
// 1. A WHOLE DOCUMENT, NOT A FRAGMENT. The old builders returned a <div>, so
//    there was nowhere to put a <head>. Flock Club emits <!doctype html> with a
//    Google Fonts <link> in the head. Gmail strips it and uses the fallback
//    stacks; Apple Mail and iOS Mail load the real faces. That difference is
//    the reason the fallbacks are named specifically rather than left to
//    "sans-serif" — see FONTS below.
//
// 2. CONTENT IS STRUCTURED, NOT MARKUP. Callers pass an array of blocks. The
//    HTML and the plain-text alternative are both rendered from that one array,
//    so they cannot drift apart — previously each builder hand-wrote a separate
//    `text` string that nobody checked against the HTML.
//
// 3. THE SUBJECT IS THE HEADLINE. `headline` is passed once and returned as the
//    subject, so an email cannot say one thing in the inbox and another at the
//    top of the page.
//
// 4. THE DISCLAIMER LIVES IN ONE PLACE. It is emitted by the footer on every
//    email and must never be written into a block.

import { emailT } from "./i18n/emailI18n.server";
import { escapeHtml, type BuiltEmail } from "./emailTemplates";

type EmailT = ReturnType<typeof emailT>;

const ASSETS = process.env.EMAIL_ASSET_BASE || "https://app.thekyaproject.com";

// ── Colour ───────────────────────────────────────────────────────────────────
export const FC = {
  forest: "#1a3d2e",   // header, footer, dark cards, body text
  mid: "#2d6a4f",      // links, photo placeholder
  lime: "#cdeab0",     // pills, highlight cards, number circles
  sunflower: "#f2b33d", // primary buttons and stickers ONLY
  page: "#e9e6dc",     // the page behind the card
  card: "#fbf9f3",     // the email card itself
  panel: "#f4f1e8",    // soft cream panels
  muted: "#5f5e5a",    // muted body text
  footText: "#d6e8dc", // footer copy on forest
  footFine: "#9bcab8", // footer disclaimer, quieter still
} as const;

// ── Type ─────────────────────────────────────────────────────────────────────
// Gmail does not load web fonts, so every stack below has to hold the same feel
// on its own. The headline stack is the one that matters: it must NEVER fall
// through to a serif or to Times, which is what `sans-serif` alone risks on
// older Outlook. Avenir Next (Mac) and Segoe UI (Windows) are the two that
// actually get used in practice.
const HEAD_FONT = "'Bricolage Grotesque','Avenir Next','Segoe UI',Helvetica,sans-serif";
const BODY_FONT = "'DM Sans','Helvetica Neue',Helvetica,'Segoe UI',sans-serif";
const SERIF_FONT = "Fraunces,Georgia,serif";
const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;800&family=Fraunces:ital,wght@0,700;1,400&family=DM+Sans:wght@400;700&display=swap";

const WIDTH = 560;

// Table openers, with the Outlook resets every one of them needs.
const RESET = "border-collapse:separate;border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt;";
const grid = (extra = "") =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${RESET}${extra}">`;

// ── Content blocks ───────────────────────────────────────────────────────────
// One array renders both the HTML and the text. Adding a block kind means
// adding it to BOTH renderers below; the type makes the compiler say so.
export type FlockBlock =
  | { kind: "lead"; text: string }
  | { kind: "p"; text: string }
  | { kind: "small"; text: string }
  | { kind: "card"; title?: string; body: string }
  | { kind: "highlight"; title?: string; body: string; titleSize?: number }
  | { kind: "steps"; items: Array<{ title: string; text: string }> }
  | { kind: "button"; label: string; href: string; needsBird?: boolean }
  | { kind: "subhead"; text: string }
  | { kind: "panel"; title: string; items: Array<{ lead: string; text: string }> }
  | { kind: "tileGrid"; tiles: Array<{ name: string; badge?: string; highlight: boolean }> }
  | { kind: "journalCard"; pill: string; date: string; entry: string; photo: string; photoAlt: string }
  | { kind: "momentStrip"; label: string; text: string }
  | { kind: "quoteCard"; title: string; panelLabel: string; quote: string; note: string }
  | { kind: "checkCard"; title: string; badge: string; questions: string[]; answers: [string, string, string]; note: string }
  | { kind: "dotChart"; badge: string; caption: string; series: number[]; unit: string; axisStart: string; axisEnd: string; note: string }
  | { kind: "photoHighlight"; title: string; body: string; photo: string; photoAlt: string }
  | { kind: "signature" }
  | { kind: "spacer" };

// ── HTML for each block ──────────────────────────────────────────────────────

const pHtml = (s: string) =>
  `<p style="margin:0 0 18px;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${FC.forest};">${s}</p>`;

const leadHtml = (s: string) =>
  `<p style="margin:0 0 18px;font-family:${BODY_FONT};font-size:16px;line-height:26px;color:${FC.forest};">${s}</p>`;

const smallHtml = (s: string) =>
  `<p style="margin:0 0 16px;font-family:${BODY_FONT};font-size:14.5px;line-height:22px;color:${FC.muted};">${s}</p>`;

/** White card: 2px forest border, 18px radius, 16px padding. */
const cardHtml = (title: string | undefined, body: string) =>
  `${grid("margin:0 0 20px;")}<tr>
<td style="padding:16px;background-color:#ffffff;border:2px solid ${FC.forest};border-radius:18px;">
${title ? `<p style="margin:0 0 6px;font-family:${HEAD_FONT};font-size:17px;line-height:24px;font-weight:800;letter-spacing:-0.3px;color:${FC.forest};">${title}</p>` : ""}
<p style="margin:0;font-family:${BODY_FONT};font-size:14.5px;line-height:22px;color:${FC.forest};">${body}</p>
</td>
</tr></table>`;

/** Lime highlight: no border, 20px radius, 20px padding. */
const highlightHtml = (title: string | undefined, body: string, titleSize = 17) =>
  `${grid("margin:0 0 20px;")}<tr>
<td style="padding:20px;background-color:${FC.lime};border-radius:20px;">
${title ? `<p style="margin:0 0 8px;font-family:${HEAD_FONT};font-size:${titleSize}px;line-height:${Math.round(titleSize * 1.3)}px;font-weight:800;letter-spacing:-0.3px;color:${FC.forest};">${title}</p>` : ""}
<p style="margin:0;font-family:${BODY_FONT};font-size:15px;line-height:23px;color:${FC.forest};">${body}</p>
</td>
</tr></table>`;

/** A numbered step: white card, 44px lime circle on the left. The circle is a
 *  table cell with a fixed width and a radius rather than a background image,
 *  so it survives images being blocked. */
const stepsHtml = (items: Array<{ title: string; text: string }>) =>
  items
    .map(
      (it, i) => `${grid("margin:0 0 12px;")}<tr>
<td style="padding:16px;background-color:#ffffff;border:2px solid ${FC.forest};border-radius:18px;">
${grid()}<tr>
<td width="44" valign="top" style="width:44px;padding:0 14px 0 0;">
<table role="presentation" width="44" cellpadding="0" cellspacing="0" border="0" style="width:44px;${RESET}">
<tr><td align="center" height="44" bgcolor="${FC.lime}" style="width:44px;height:44px;background-color:${FC.lime};border-radius:22px;font-family:${HEAD_FONT};font-size:19px;line-height:44px;font-weight:800;color:${FC.forest};text-align:center;">${i + 1}</td></tr>
</table>
</td>
<td valign="top" style="padding:0;">
<p style="margin:0 0 3px;font-family:${HEAD_FONT};font-size:16px;line-height:22px;font-weight:800;letter-spacing:-0.3px;color:${FC.forest};">${it.title}</p>
<p style="margin:0;font-family:${BODY_FONT};font-size:14.5px;line-height:22px;color:${FC.muted};">${it.text}</p>
</td>
</tr>
</table>
</td>
</tr></table>`,
    )
    .join("\n");

/** Primary button: sunflower, forest text, pill, 2px forest border, trailing
 *  arrow. mso-padding-alt because Outlook drops padding on an inline-block a. */
const buttonHtml = (label: string, href: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;${RESET}">
<tr>
<td bgcolor="${FC.sunflower}" style="background-color:${FC.sunflower};border:2px solid ${FC.forest};border-radius:999px;mso-padding-alt:14px 28px;">
<a href="${href}" style="display:block;padding:14px 28px;font-family:${BODY_FONT};font-size:16px;line-height:22px;font-weight:700;color:${FC.forest};text-decoration:none;">${label}&nbsp;&nbsp;&rarr;</a>
</td>
</tr>
</table>`;

/** Signature: 48px forest circle with a lime B, the name in Fraunces italic. */
const signatureHtml = (t: EmailT) =>
  `${grid("margin:6px 0 4px;")}<tr>
<td width="48" valign="top" style="width:48px;padding:0 14px 0 0;">
<table role="presentation" width="48" cellpadding="0" cellspacing="0" border="0" style="width:48px;${RESET}">
<tr><td align="center" height="48" bgcolor="${FC.forest}" style="width:48px;height:48px;background-color:${FC.forest};border-radius:24px;font-family:${SERIF_FONT};font-size:22px;line-height:48px;font-weight:700;color:${FC.lime};text-align:center;">B</td></tr>
</table>
</td>
<td valign="middle" style="padding:0;">
<p style="margin:0;font-family:${SERIF_FONT};font-style:italic;font-size:19px;line-height:26px;color:${FC.forest};">${t("email.flock.signName")}</p>
<p style="margin:0;font-family:${BODY_FONT};font-size:13px;line-height:19px;color:${FC.muted};">${t("email.flock.signTitle")}</p>
</td>
</tr></table>`;

/** Body links. Catalog strings carry bare <a href="…">, so the style is applied
 *  here rather than at every call site. Footer links are styled separately —
 *  mid green on forest green would be unreadable. */
const LINK = `color:${FC.mid};font-weight:700;text-decoration:underline;`;
const styleLinks = (html: string) =>
  html.replace(/<a\s+href="([^"]*)"(?![^>]*\sstyle=)/g, `<a href="$1" style="${LINK}"`);

/** A small headline inside the body — Bricolage 21px, not an H1. */
const subheadHtml = (s: string) =>
  `<p style="margin:2px 0 14px;font-family:${HEAD_FONT};font-size:21px;line-height:27px;font-weight:800;letter-spacing:-0.4px;color:${FC.forest};">${s}</p>`;

/** Lime card with a round photo on the left. The circle is border-radius on the
 *  img: Gmail, Apple Mail and iOS round it; Outlook's Word engine ignores the
 *  radius and shows a square, which is a graceful enough fallback. */
const photoHighlightHtml = (o: { title: string; body: string; photo: string; photoAlt: string }) =>
  `${grid("margin:0 0 20px;")}<tr>
<td style="padding:20px;background-color:${FC.lime};border-radius:20px;">
${grid()}<tr>
<td width="84" valign="top" style="width:84px;padding:0 16px 0 0;">
<img src="${ASSETS}/brand/email/${o.photo}" width="84" height="84" alt="${o.photoAlt}" style="display:block;width:84px;height:84px;border-radius:42px;border:0;" />
</td>
<td valign="top" style="padding:0;">
<p style="margin:0 0 5px;font-family:${HEAD_FONT};font-size:18px;line-height:24px;font-weight:800;letter-spacing:-0.3px;color:${FC.forest};">${o.title}</p>
<p style="margin:0;font-family:${BODY_FONT};font-size:14.5px;line-height:22px;color:${FC.forest};">${o.body}</p>
</td>
</tr>
</table>
</td>
</tr></table>`;

/** Soft cream panel with numbered rows and 32px lime circles. The lead sentence
 *  is bold and runs inline with the rest, so each row reads as a sentence
 *  rather than as a heading with a caption under it. */
const panelHtml = (o: { title: string; items: Array<{ lead: string; text: string }> }) =>
  `${grid("margin:0 0 20px;")}<tr>
<td style="padding:20px;background-color:${FC.panel};border:1px solid #e3ded0;border-radius:18px;">
<p style="margin:0 0 14px;font-family:${HEAD_FONT};font-size:21px;line-height:27px;font-weight:800;letter-spacing:-0.4px;color:${FC.forest};">${o.title}</p>
${grid()}${o.items
    .map(
      (it, i) => `<tr>
<td width="32" valign="top" style="width:32px;padding:0 12px ${i === o.items.length - 1 ? "0" : "14px"} 0;">
<table role="presentation" width="32" cellpadding="0" cellspacing="0" border="0" style="width:32px;${RESET}">
<tr><td align="center" height="32" bgcolor="${FC.lime}" style="width:32px;height:32px;background-color:${FC.lime};border-radius:16px;font-family:${HEAD_FONT};font-size:15px;line-height:32px;font-weight:800;color:${FC.forest};text-align:center;">${i + 1}</td></tr>
</table>
</td>
<td valign="top" style="padding:0 0 ${i === o.items.length - 1 ? "0" : "14px"};font-family:${BODY_FONT};font-size:14.5px;line-height:22px;color:${FC.forest};">
<b style="font-weight:700;">${it.lead}</b> ${it.text}
</td>
</tr>`,
    )
    .join("\n")}
</table>
</td>
</tr></table>`;

/** A 3x2 grid of section tiles. Fixed layout with real spacer cells for the
 *  gaps: percentage widths plus border-spacing behave differently in every
 *  client, and a spacer column is the one thing they all agree on. */
function tileGridHtml(tiles: Array<{ name: string; badge?: string; highlight: boolean }>): string {
  // A tile without a badge centres its name instead of top-aligning it, so it
  // sits level with the badged tiles beside it. Cells in a row already share a
  // height, so this is the only thing needed to make the grid look even.
  const cell = (t: { name: string; badge?: string; highlight: boolean }) =>
    `<td width="32%" valign="${t.badge ? "top" : "middle"}" style="width:32%;padding:14px 12px;background-color:${t.highlight ? FC.lime : "#ffffff"};border:2px solid ${t.highlight ? FC.forest : "#e3ded0"};border-radius:16px;">
${t.badge ? `<p style="margin:0 0 5px;font-family:${BODY_FONT};font-size:11px;line-height:14px;letter-spacing:.09em;font-weight:700;color:${t.highlight ? FC.mid : "#5a8c7a"};">${t.badge}</p>` : ""}
<p style="margin:0;font-family:${HEAD_FONT};font-size:18px;line-height:23px;font-weight:800;letter-spacing:-0.3px;color:${FC.forest};">${t.name}</p>
</td>`;
  const gap = `<td width="8" style="width:8px;font-size:0;">&nbsp;</td>`;
  const row = (r: typeof tiles) => `<tr>${r.map(cell).join(gap)}</tr>`;
  return `${grid("table-layout:fixed;margin:0 0 20px;")}
${row(tiles.slice(0, 3))}
<tr><td height="8" colspan="5" style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
${row(tiles.slice(3, 6))}
</table>`;
}

/** A sample journal entry: the white card, a lime pill and a date, the entry in
 *  the serif, and a photo.
 *
 *  NOT ROTATED. A slight tilt would suit it, but CSS transforms are dropped by
 *  Gmail and by the Outlook Word engine — the card would sit straight for most
 *  readers and askew for a few, which is worse than straight for everyone. A
 *  pre-rotated image is the only way to do it, and that would put the entry
 *  text inside a picture. */
const journalCardHtml = (o: { pill: string; date: string; entry: string; photo: string; photoAlt: string }) =>
  `${grid("margin:0 0 10px;")}<tr>
<td style="padding:16px;background-color:#ffffff;border:2px solid ${FC.forest};border-radius:18px;">
${grid("margin:0 0 12px;")}<tr>
<td valign="middle" style="padding:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${RESET}">
<tr><td bgcolor="${FC.lime}" style="padding:5px 12px;background-color:${FC.lime};border-radius:999px;font-family:${BODY_FONT};font-size:11.5px;line-height:15px;font-weight:700;color:${FC.forest};white-space:nowrap;">${o.pill}</td></tr>
</table>
</td>
<td valign="middle" align="right" style="padding:0 0 0 10px;font-family:${BODY_FONT};font-size:12.5px;line-height:17px;color:${FC.muted};text-align:right;">${o.date}</td>
</tr>
</table>
<p style="margin:0 0 14px;font-family:${SERIF_FONT};font-style:italic;font-size:20px;line-height:30px;color:${FC.forest};">${o.entry}</p>
<img src="${ASSETS}/brand/email/${o.photo}" width="480" alt="${o.photoAlt}" style="display:block;width:100%;max-width:480px;height:auto;border:0;border-radius:12px;" />
</td>
</tr></table>`;

/** The sunflower strip that sits under the journal card. */
const momentStripHtml = (o: { label: string; text: string }) =>
  `${grid("margin:0 0 20px;")}<tr>
<td style="padding:11px 18px;background-color:${FC.sunflower};border:2px solid ${FC.forest};border-radius:999px;">
${grid()}<tr>
<td valign="middle" style="padding:0;font-family:${BODY_FONT};font-size:13.5px;line-height:19px;font-weight:700;color:${FC.forest};white-space:nowrap;">${o.label}</td>
<td valign="middle" align="right" style="padding:0 0 0 12px;font-family:${BODY_FONT};font-size:13.5px;line-height:19px;color:${FC.forest};text-align:right;">${o.text}</td>
</tr>
</table>
</td>
</tr></table>`;

/** A white card wrapping a cream panel with an example in it — the example is
 *  set in the serif so it reads as something someone wrote, not as UI copy. */
const quoteCardHtml = (o: { title: string; panelLabel: string; quote: string; note: string }) =>
  `${grid("margin:0 0 20px;")}<tr>
<td style="padding:16px;background-color:#ffffff;border:2px solid ${FC.forest};border-radius:18px;">
<p style="margin:0 0 14px;font-family:${HEAD_FONT};font-size:21px;line-height:27px;font-weight:800;letter-spacing:-0.4px;color:${FC.forest};">${o.title}</p>
${grid("margin:0 0 12px;")}<tr>
<td style="padding:14px;background-color:${FC.panel};border-radius:12px;">
<p style="margin:0 0 7px;font-family:${BODY_FONT};font-size:11px;line-height:14px;letter-spacing:.09em;font-weight:700;color:#5a8c7a;">${o.panelLabel}</p>
<p style="margin:0;font-family:${SERIF_FONT};font-style:italic;font-size:17px;line-height:26px;color:${FC.forest};">${o.quote}</p>
</td>
</tr>
</table>
<p style="margin:0;font-family:${BODY_FONT};font-size:13px;line-height:20px;color:${FC.muted};">${o.note}</p>
</td>
</tr></table>`;

/** A sample health check: the white card, a row per question on soft cream,
 *  and three answer chips with the first one chosen. The chips are table cells
 *  rather than spans so the pill shape and the selected state survive Outlook,
 *  which would collapse inline-block padding. */
function checkCardHtml(o: { title: string; badge: string; questions: string[]; answers: [string, string, string]; note: string }): string {
  const chip = (text: string, chosen: boolean) =>
    chosen
      ? `<td align="center" bgcolor="${FC.forest}" style="padding:6px 10px;background-color:${FC.forest};border:1px solid ${FC.forest};border-radius:999px;font-family:${BODY_FONT};font-size:11.5px;line-height:15px;font-weight:700;color:#ffffff;text-align:center;">${text}</td>`
      : `<td align="center" bgcolor="#ffffff" style="padding:6px 10px;background-color:#ffffff;border:1px solid #d8d2c0;border-radius:999px;font-family:${BODY_FONT};font-size:11.5px;line-height:15px;color:${FC.muted};text-align:center;">${text}</td>`;
  const gap = `<td width="6" style="width:6px;font-size:0;">&nbsp;</td>`;
  const rows = o.questions
    .map(
      (q) => `<tr>
<td style="padding:0 0 8px;">
${grid()}<tr>
<td style="padding:12px 14px;background-color:${FC.panel};border-radius:14px;">
<p style="margin:0 0 9px;font-family:${BODY_FONT};font-size:14px;line-height:20px;font-weight:700;color:${FC.forest};">${q}</p>
${grid("table-layout:fixed;")}<tr>
${chip(o.answers[0], true)}
${gap}
${chip(o.answers[1], false)}
${gap}
${chip(o.answers[2], false)}
</tr>
</table>
</td>
</tr>
</table>
</td>
</tr>`,
    )
    .join("\n");
  return `${grid("margin:0 0 20px;")}<tr>
<td style="padding:16px;background-color:#ffffff;border:2px solid ${FC.forest};border-radius:18px;">
${grid("margin:0 0 14px;")}<tr>
<td valign="middle" style="padding:0;font-family:${HEAD_FONT};font-size:21px;line-height:27px;font-weight:800;letter-spacing:-0.4px;color:${FC.forest};">${o.title}</td>
<td valign="middle" align="right" style="padding:0 0 0 10px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${RESET}">
<tr><td bgcolor="${FC.lime}" style="padding:5px 12px;background-color:${FC.lime};border-radius:999px;font-family:${BODY_FONT};font-size:11.5px;line-height:15px;font-weight:700;color:${FC.forest};white-space:nowrap;">${o.badge}</td></tr>
</table>
</td>
</tr>
</table>
${grid()}${rows}
</table>
<p style="margin:6px 0 0;font-family:${BODY_FONT};font-size:12.5px;line-height:19px;font-style:italic;color:${FC.muted};">${o.note}</p>
</td>
</tr></table>`;
}

/** A dot chart on the forest card: one dot per reading, its height its weight.
 *
 *  BUILD: a fixed-layout table with one cell per reading. Each cell is the full
 *  chart height and top-aligned, and the dot is pushed down with padding-top.
 *  No absolute positioning, no background images, no text in an image — so it
 *  survives Gmail and the Outlook Word engine, which between them rule out
 *  every other way of placing a point on a plane. The only casualty is the
 *  dot's roundness: Outlook drops border-radius and shows a 7px square.
 *
 *  The axis shows the extremes only, and nothing here characterises the
 *  numbers — the reader draws their own conclusion from the shape. */
function dotChartHtml(o: { badge: string; caption: string; series: number[]; unit: string; axisStart: string; axisEnd: string; note: string }): string {
  const H = 92;
  const DOT = 7;
  const hi = Math.max(...o.series);
  const lo = Math.min(...o.series);
  const span = hi - lo || 1;
  const dots = o.series
    .map((v) => {
      const top = Math.round(((hi - v) / span) * (H - DOT));
      return `<td valign="top" style="height:${H}px;padding:${top}px 0 0;">
<table role="presentation" width="${DOT}" cellpadding="0" cellspacing="0" border="0" style="width:${DOT}px;${RESET}">
<tr><td height="${DOT}" bgcolor="${FC.lime}" style="width:${DOT}px;height:${DOT}px;background-color:${FC.lime};border-radius:${DOT / 2}px;font-size:0;line-height:${DOT}px;">&nbsp;</td></tr>
</table>
</td>`;
    })
    .join("");
  const axisLabel = (s: string) =>
    `<span style="font-family:${BODY_FONT};font-size:11px;line-height:14px;color:${FC.footFine};">${s}</span>`;
  return `${grid("margin:0 0 20px;")}<tr>
<td style="padding:20px;background-color:${FC.forest};border-radius:20px;">
${grid("margin:0 0 16px;")}<tr>
<td valign="middle" style="padding:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${RESET}">
<tr><td bgcolor="${FC.lime}" style="padding:5px 12px;background-color:${FC.lime};border-radius:999px;font-family:${BODY_FONT};font-size:11.5px;line-height:15px;font-weight:700;color:${FC.forest};white-space:nowrap;">${o.badge}</td></tr>
</table>
</td>
<td valign="middle" align="right" style="padding:0 0 0 10px;font-family:${BODY_FONT};font-size:12px;line-height:16px;color:${FC.footFine};text-align:right;">${o.caption}</td>
</tr>
</table>
${grid()}<tr>
<td width="38" valign="top" style="width:38px;padding:0 8px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${RESET}height:${H}px;">
<tr><td height="14" valign="top" align="right" style="height:14px;text-align:right;">${axisLabel(`${hi}${o.unit}`)}</td></tr>
<tr><td valign="bottom" align="right" style="text-align:right;">${axisLabel(`${lo}${o.unit}`)}</td></tr>
</table>
</td>
<td valign="top" style="padding:0;">
${grid("table-layout:fixed;")}<tr>${dots}</tr>
</table>
</td>
</tr>
</table>
${grid("margin:8px 0 0;")}<tr>
<td style="padding:0 0 0 46px;font-family:${BODY_FONT};font-size:11px;line-height:15px;color:${FC.footFine};">${o.axisStart}</td>
<td align="right" style="font-family:${BODY_FONT};font-size:11px;line-height:15px;color:${FC.footFine};text-align:right;">${o.axisEnd}</td>
</tr>
</table>
<p style="margin:14px 0 0;font-family:${BODY_FONT};font-size:13px;line-height:20px;color:${FC.footText};">${o.note}</p>
</td>
</tr></table>`;
}

/** What a block needs beyond its own fields. */
type Ctx = { t: EmailT; hasBird: boolean; addBirdHref: string };

/** A button that goes to a bird's screen is pointless for an account with no
 *  bird yet — it used to fall back to the dashboard, which is a dead end
 *  dressed as a destination. Resolved here rather than in each email, so every
 *  email on this layout gets it without knowing about it. */
function resolveButton(b: { label: string; href: string; needsBird?: boolean }, c: Ctx) {
  return b.needsBird && !c.hasBird
    ? { label: c.t("email.flock.addBirdCta"), href: c.addBirdHref }
    : { label: b.label, href: b.href };
}

function blockHtml(b: FlockBlock, c: Ctx): string {
  const t = c.t;
  switch (b.kind) {
    case "lead": return leadHtml(b.text);
    case "p": return pHtml(b.text);
    case "small": return smallHtml(b.text);
    case "card": return cardHtml(b.title, b.body);
    case "highlight": return highlightHtml(b.title, b.body, b.titleSize);
    case "steps": return stepsHtml(b.items);
    case "button": { const r = resolveButton(b, c); return buttonHtml(r.label, r.href); }
    case "subhead": return subheadHtml(b.text);
    case "panel": return panelHtml(b);
    case "tileGrid": return tileGridHtml(b.tiles);
    case "journalCard": return journalCardHtml(b);
    case "momentStrip": return momentStripHtml(b);
    case "quoteCard": return quoteCardHtml(b);
    case "checkCard": return checkCardHtml(b);
    case "dotChart": return dotChartHtml(b);
    case "photoHighlight": return photoHighlightHtml(b);
    case "signature": return signatureHtml(t);
    case "spacer": return `<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>`;
  }
}

// ── Plain text for each block ────────────────────────────────────────────────
// Rendered from the same array, so the two versions cannot describe different
// emails. Tags are stripped rather than escaped: the catalog stores <b> and
// <br> inside sentences, and a text part must not show them.
const detag = (s: string) =>
  s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ")
   .replace(/&amp;/g, "&").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
   .replace(/&rarr;/g, "->").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
   .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").trim();

function blockText(b: FlockBlock, c: Ctx): string {
  const t = c.t;
  switch (b.kind) {
    case "lead":
    case "p":
    case "small": return detag(b.text);
    case "card":
    case "highlight": return (b.title ? detag(b.title) + "\n" : "") + detag(b.body);
    case "steps": return b.items.map((it, i) => `${i + 1}. ${detag(it.title)} ${detag(it.text)}`).join("\n");
    case "button": { const r = resolveButton(b, c); return `${detag(r.label)}: ${r.href}`; }
    case "subhead": return detag(b.text);
    case "panel": return `${detag(b.title)}\n` + b.items.map((it, i) => `${i + 1}. ${detag(it.lead)} ${detag(it.text)}`).join("\n");
    case "tileGrid": return b.tiles.map((x) => (x.badge ? `${detag(x.badge)} ` : "") + detag(x.name)).join("\n");
    case "journalCard": return `${detag(b.pill)} — ${detag(b.date)}\n${detag(b.entry)}`;
    case "momentStrip": return `${detag(b.label)} — ${detag(b.text)}`;
    case "quoteCard": return `${detag(b.title)}\n${detag(b.panelLabel)}\n${detag(b.quote)}\n${detag(b.note)}`;
    case "checkCard": return `${detag(b.title)}\n` + b.questions.map((q) => `- ${detag(q)} [${detag(b.answers[0])}]`).join("\n") + `\n${detag(b.note)}`;
    case "dotChart": return `${detag(b.badge)} — ${detag(b.caption)}\n${Math.min(...b.series)}${b.unit}–${Math.max(...b.series)}${b.unit}, ${detag(b.axisStart)} to ${detag(b.axisEnd)}\n${detag(b.note)}`;
    case "photoHighlight": return `${detag(b.title)}\n${detag(b.body)}`;
    case "signature": return `${detag(t("email.flock.signName"))}\n${detag(t("email.flock.signTitle"))}`;
    case "spacer": return "";
  }
}

// ── The shell ────────────────────────────────────────────────────────────────

export function flockShell(opts: {
  /** The H1, and the subject. Passed once so the two can never diverge. */
  headline: string;
  /** Inbox preview line. */
  preheader: string;
  /** Right-hand header pill — "Hi, flockmate", "The Flock Report · Sept". */
  pill: string;
  /** Full-width hero. `sticker` puts a sunflower circle on its bottom-right. */
  hero?: { file: string; alt: string; sticker?: string };
  blocks: FlockBlock[];
  /** The one-line "why you're getting this", per email. */
  footerWhy: string;
  link: string;
  /** False when the account has no bird at send time. Any button marked
   *  `needsBird` then becomes "add your bird first" instead. Defaults true so
   *  an email with no bird-specific button need not think about it. */
  hasBird?: boolean;
  locale?: string;
}): BuiltEmail {
  const t = emailT(opts.locale);
  const ctx: Ctx = { t, hasBird: opts.hasBird !== false, addBirdHref: `${ASSETS}/birds/new` };

  const preheader = `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${opts.preheader}${"&#8203;&nbsp;".repeat(12)}</div>`;

  // The sticker is an HTML circle, not a pre-rendered PNG — see the note in the
  // handover. It is pulled up over the photo with a negative margin, which
  // Gmail and Apple Mail honour; Outlook ignores it and the circle sits just
  // below the photo instead, which still reads as intentional.
  const sticker = opts.hero?.sticker
    ? `${grid("margin:-34px 0 0;")}<tr>
<td align="right" style="padding:0 18px 0 0;">
<table role="presentation" width="88" cellpadding="0" cellspacing="0" border="0" style="width:88px;${RESET}">
<tr><td align="center" height="88" bgcolor="${FC.sunflower}" style="width:88px;height:88px;background-color:${FC.sunflower};border:2px solid ${FC.forest};border-radius:44px;font-family:${HEAD_FONT};font-size:13px;line-height:17px;font-weight:800;letter-spacing:-0.2px;color:${FC.forest};text-align:center;">${opts.hero.sticker}</td></tr>
</table>
</td>
</tr></table>`
    : "";

  const hero = opts.hero
    ? `<tr>
<td bgcolor="${FC.mid}" style="padding:0;background-color:${FC.mid};line-height:0;font-size:0;">
<img src="${ASSETS}/brand/email/${opts.hero.file}" width="${WIDTH}" alt="${opts.hero.alt}" style="display:block;width:100%;max-width:${WIDTH}px;height:auto;border:0;font-family:${SERIF_FONT};font-style:italic;font-size:16px;line-height:24px;color:${FC.lime};" />
</td>
</tr>
${opts.hero.sticker ? `<tr><td style="padding:0;">${sticker}</td></tr>` : ""}`
    : "";

  const body = opts.blocks.map((b) => styleLinks(blockHtml(b, ctx))).join("\n");

  const html = `<!doctype html>
<html lang="${opts.locale === "nl" ? "nl" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(detag(opts.headline))}</title>
<link rel="stylesheet" href="${FONT_LINK}">
</head>
<body style="margin:0;padding:0;background-color:${FC.page};">
<div style="background-color:${FC.page};padding:24px 8px;font-family:${BODY_FONT};-webkit-text-size-adjust:100%;">${preheader}
  <!--[if mso]><table role="presentation" width="${WIDTH}" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:${WIDTH}px;margin:0 auto;table-layout:fixed;${RESET}border-radius:20px;background-color:${FC.card};overflow:hidden;">
<tr>
<td bgcolor="${FC.forest}" style="padding:16px 22px;background-color:${FC.forest};">
${grid()}<tr>
<td valign="middle" style="padding:0;">
<img src="${ASSETS}/brand/email/lockup-reversed.png" width="132" alt="${t("email.flock.lockupAlt")}" style="display:block;width:132px;height:auto;border:0;font-family:${HEAD_FONT};font-size:18px;line-height:24px;font-weight:800;color:#ffffff;" />
</td>
<td valign="middle" align="right" style="padding:0 0 0 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${RESET}">
<tr><td bgcolor="${FC.lime}" style="padding:7px 14px;background-color:${FC.lime};border-radius:999px;font-family:${BODY_FONT};font-size:12.5px;line-height:16px;font-weight:700;color:${FC.forest};white-space:nowrap;">${opts.pill}</td></tr>
</table>
</td>
</tr>
</table>
</td>
</tr>
${hero}
<tr>
<td style="padding:28px 22px 0;">
<h1 style="margin:0 0 18px;font-family:${HEAD_FONT};font-size:40px;line-height:43px;font-weight:800;letter-spacing:-0.5px;color:${FC.forest};">${opts.headline}</h1>
${body}
</td>
</tr>
<tr><td height="8" style="height:8px;line-height:8px;font-size:0;">&nbsp;</td></tr>
<tr>
<td bgcolor="${FC.forest}" style="padding:26px 28px 28px;background-color:${FC.forest};text-align:center;">
<img src="${ASSETS}/brand/email/lockup-reversed.png" width="112" alt="${t("email.flock.lockupAlt")}" style="display:block;width:112px;height:auto;border:0;margin:0 auto 14px;font-family:${HEAD_FONT};font-size:16px;line-height:22px;font-weight:800;color:#ffffff;" />
<p style="margin:0 0 10px;font-family:${BODY_FONT};font-size:13px;line-height:20px;color:${FC.footText};text-align:center;">${opts.footerWhy}</p>
<p style="margin:0 0 14px;font-family:${BODY_FONT};font-size:12px;line-height:19px;color:${FC.footFine};text-align:center;">${t("email.flock.disclaimer")}</p>
<p style="margin:0;font-family:${BODY_FONT};font-size:12px;line-height:19px;color:${FC.footFine};text-align:center;">
<a href="${ASSETS}/settings" style="color:${FC.footText};text-decoration:underline;">${t("email.flock.settings")}</a>
&nbsp;&middot;&nbsp;
<a href="${ASSETS}/settings" style="color:${FC.footText};text-decoration:underline;">${t("email.flock.unsubscribe")}</a>
&nbsp;&middot;&nbsp;${t("email.flock.byLine")}</p>
</td>
</tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</div>
</body>
</html>`;

  const text = [
    detag(opts.headline),
    "",
    ...opts.blocks.map((b) => blockText(b, ctx)).filter(Boolean),
    "",
    detag(opts.footerWhy),
    detag(t("email.flock.disclaimer")),
    detag(t("email.flock.byLine")),
  ].join("\n\n");

  return { subject: detag(opts.headline), html, text };
}
