/**
 * The app-launch announcement. A ONE-OFF — not part of any programme, not on
 * any cron, and deliberately in its own file.
 *
 * It borrows the Flock Club shell and its blocks, and changes nothing shared:
 * flockClub.ts, emailTemplates.ts and the existing builders are untouched, so
 * Friday's Flock Report cannot be affected by anything here.
 *
 * Three pieces of this design have no matching block kind — the badge row, the
 * lime panel with a white button inside it, and the forest "Sneak peek" panel
 * with ruled items. Adding block kinds would mean editing flockClub.ts, so
 * instead each one is emitted as a `p` holding a unique token, and the rendered
 * shell has that whole paragraph swapped for hand-built table markup (see
 * `splice`). The trick stays entirely inside this file and produces valid
 * markup, rather than nesting tables inside a <p>.
 *
 * The App Store badge is a PNG here, not the SVG the app uses. Gmail does not
 * render SVG images in email, so the badge would simply be missing for most
 * readers. The PNG is Apple's own file rendered at 2x by the resvg this repo
 * already vendors for the weight charts — the same artwork, not a redraw.
 */
import { flockShell, FC, type FlockBlock } from "./flockClub";
import type { BuiltEmail } from "./emailTemplates";

const APP_URL = "https://app.thekyaproject.com";
const ASSETS = process.env.EMAIL_ASSET_BASE || APP_URL;

// Same stacks as flockClub.ts. Duplicated rather than imported because they are
// not exported, and this email has to sit beside the others without a visible
// seam — Gmail loads neither, so the fallbacks are what most people see.
const HEAD_FONT = "'Bricolage Grotesque','Avenir Next','Segoe UI',Helvetica,sans-serif";
const BODY_FONT = "'DM Sans','Helvetica Neue',Helvetica,'Segoe UI',sans-serif";
const RESET = "border-collapse:separate;border-spacing:0;mso-table-lspace:0pt;mso-table-rspace:0pt;";

const utm = (content: string) => `utm_source=email&utm_campaign=app-launch&utm_content=${content}`;
export const LINKS = {
  button: `${APP_URL}/get-app?${utm("button")}`,
  badgeIos: `${APP_URL}/get-app?store=ios&${utm("badge-ios")}`,
  badgeAndroid: `${APP_URL}/get-app?store=android&${utm("badge-android")}`,
  review: `${APP_URL}/review?${utm("review")}`,
};

const SLOT_BADGES = "@@APP_LAUNCH_BADGES@@";
const SLOT_FAVOR = "@@APP_LAUNCH_FAVOR@@";
const SLOT_PEEK = "@@APP_LAUNCH_PEEK@@";

/** "AVAILABLE ON" over the two official store badges, side by side. */
const badgesHtml = () => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${RESET}margin:0 0 22px;">
<tr><td style="padding:0 0 8px;font-family:${BODY_FONT};font-size:10.5px;line-height:14px;letter-spacing:.09em;font-weight:700;color:${FC.muted};">AVAILABLE ON</td></tr>
<tr><td style="padding:0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${RESET}"><tr>
<td valign="middle" style="padding:0 10px 0 0;"><a href="${LINKS.badgeIos}"><img src="${ASSETS}/brand/store/app-store-badge@2x.png" width="120" height="40" alt="Download on the App Store" style="display:block;width:120px;height:40px;border:0;" /></a></td>
<td valign="middle" style="padding:0;"><a href="${LINKS.badgeAndroid}"><img src="${ASSETS}/brand/store/google-play-badge.png" width="155" height="60" alt="Get it on Google Play" style="display:block;width:155px;height:60px;border:0;" /></a></td>
</tr></table>
</td></tr></table>`;

/** The lime "A small favor" panel, with a white button inside it. */
const favorHtml = () => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${RESET}margin:0 0 22px;">
<tr><td style="padding:22px;background-color:${FC.lime};border-radius:20px;">
<p style="margin:0 0 10px;font-family:${HEAD_FONT};font-size:22px;line-height:27px;font-weight:800;letter-spacing:-0.4px;color:${FC.forest};">A small favor</p>
<p style="margin:0 0 16px;font-family:${BODY_FONT};font-size:15px;line-height:23px;color:${FC.forest};">Kya &amp; Co. is brand new in the stores, and those first few reviews go a long way toward helping other bird people find it. If the app has made caring for your flock a little easier, I'd be grateful if you left a rating and a sentence or two about why.</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${RESET}">
<tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:2px solid ${FC.forest};border-radius:999px;mso-padding-alt:13px 24px;">
<a href="${LINKS.review}" style="display:block;padding:13px 24px;font-family:${BODY_FONT};font-size:15px;line-height:21px;font-weight:700;color:${FC.forest};text-decoration:none;">Leave a review&nbsp;&nbsp;&rarr;</a>
</td></tr></table>
</td></tr></table>`;

/** The forest "Coming to the app" panel: a lime pill, then ruled items. */
const peekHtml = (items: Array<{ lead: string; text: string }>) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${RESET}margin:0 0 22px;">
<tr><td style="padding:22px;background-color:${FC.forest};border-radius:20px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${RESET}margin:0 0 12px;">
<tr><td bgcolor="${FC.lime}" style="padding:5px 13px;background-color:${FC.lime};border-radius:999px;font-family:${BODY_FONT};font-size:11.5px;line-height:15px;font-weight:700;color:${FC.forest};white-space:nowrap;">Sneak peek</td></tr>
</table>
<p style="margin:0 0 8px;font-family:${HEAD_FONT};font-size:22px;line-height:27px;font-weight:800;letter-spacing:-0.4px;color:#ffffff;">Coming to the app</p>
<p style="margin:0 0 14px;font-family:${BODY_FONT};font-size:14.5px;line-height:22px;color:${FC.footText};">Here's a look at what we're working on now. There are no dates yet, but I'll let you know as each one arrives.</p>
${items
    .map(
      (it, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;${RESET}">
<tr><td style="padding:${i === 0 ? "0" : "12px"} 0 12px;${i === 0 ? "" : `border-top:1px solid rgba(255,255,255,.16);`}font-family:${BODY_FONT};font-size:14.5px;line-height:22px;color:${FC.footText};">
<b style="font-weight:700;color:${FC.lime};">${it.lead}</b> ${it.text}
</td></tr></table>`,
    )
    .join("\n")}
</td></tr></table>`;

/**
 * Tighten the footer for this email only.
 *
 * The footer belongs to the shared shell, and shrinking it there would change
 * every email including Friday's Flock Report — so it is adjusted here, on the
 * rendered output, and nowhere else. Each replacement asserts it matched, so
 * this cannot quietly become a no-op if the shell's footer is ever restyled.
 */
function tightenFooter(html: string): string {
  const edits: Array<[string, string]> = [
    ["padding:26px 28px 28px;background-color:", "padding:20px 24px 22px;background-color:"],
    ['width="112" alt', 'width="92" alt'],
    ["width:112px;height:auto;border:0;margin:0 auto 14px;", "width:92px;height:auto;border:0;margin:0 auto 11px;"],
    ["margin:0 0 10px;font-family:${BODY_FONT};font-size:13px;line-height:20px;", "margin:0 0 8px;font-family:${BODY_FONT};font-size:12px;line-height:18px;"],
    ["margin:0 0 14px;font-family:${BODY_FONT};font-size:12px;line-height:19px;", "margin:0 0 10px;font-family:${BODY_FONT};font-size:11px;line-height:17px;"],
    ["margin:0 0 10px;font-family:${BODY_FONT};font-size:12px;line-height:19px;", "margin:0 0 8px;font-family:${BODY_FONT};font-size:11px;line-height:17px;"],
    ["margin:0;font-family:${BODY_FONT};font-size:12px;line-height:19px;", "margin:0;font-family:${BODY_FONT};font-size:11px;line-height:17px;"],
  ];
  let out = html;
  for (const [from, to] of edits) {
    const literal = from.replace("${BODY_FONT}", BODY_FONT);
    const target = to.replace("${BODY_FONT}", BODY_FONT);
    if (!out.includes(literal)) throw new Error(`app-launch email: footer edit did not match — ${literal.slice(0, 60)}`);
    out = out.replace(literal, target);
  }
  return out;
}

/** Swap a token paragraph for real markup, wrapper and all. */
function splice(html: string, token: string, replacement: string): string {
  const re = new RegExp(`<p[^>]*>\\s*${token}\\s*</p>`);
  if (!re.test(html)) throw new Error(`app-launch email: slot ${token} not found in the rendered shell`);
  return html.replace(re, replacement);
}

/** First word of the display name, or a nameless greeting. */
export function greeting(displayName?: string | null): string {
  const first = (displayName ?? "").trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hi there,";
}

export function buildAppLaunchEmail(opts: { displayName?: string | null; unsubscribeUrl?: string }): BuiltEmail {
  const blocks: FlockBlock[] = [
    { kind: "p", text: greeting(opts.displayName) },
    { kind: "p", text: "It's here! You can now download Kya &amp; Co. from the App Store and Google Play." },
    { kind: "p", text: "If you've been using it in your browser, you don't have to start over. Sign in with the same account and everything you've logged will be right where you left it, from weights and daily checks to journal entries and care plan notes." },
    { kind: "button", label: "Get the app", href: LINKS.button },
    { kind: "p", text: SLOT_BADGES },

    { kind: "sectionHead", title: "Why make the switch" },
    { kind: "p", text: "The app does a few things a browser tab can't, and they add up quickly when you're looking after a bird every day." },
    {
      kind: "steps",
      items: [
        { title: "Reminders reach you on time.", text: "The app can let you know when it's time to weigh and when a check-in is due." },
        { title: "Logging takes seconds.", text: "Kya &amp; Co. sits on your Home Screen, so you can add a weight and get on with your morning." },
        { title: "Everything works the way you're used to.", text: "It's the same app you know, living where your phone keeps the things you use every day." },
      ],
    },

    { kind: "p", text: SLOT_FAVOR },
    { kind: "p", text: "And if something isn't working, or there's something you wish it did, just hit reply. I read every note that comes in, and a lot of what we're building next started as an email from someone like you." },

    { kind: "p", text: SLOT_PEEK },
    { kind: "p", text: "Before you go, thank you. Kya &amp; Co. was built for the people who weigh before breakfast, write down the strange new habit, and leave the sitter better notes than they ever got from their own babysitter. You were one of the very first, and I'm really glad you're here." },
    { kind: "signature" },
  ];

  const built = flockShell({
    headline: "Kya &amp; Co. is in the app stores",
    preheader: "Same account, reminders that reach you, and a peek at what we're building next.",
    pill: "Big news",
    hero: { file: "app-launch-hero.jpg", alt: "A bright orange sun conure looking at the camera", sticker: "Now on iPhone + Android" },
    blocks,
    footerWhy: "You're getting this because you have a Kya &amp; Co. account.",
    link: APP_URL,
    unsubscribeUrl: opts.unsubscribeUrl,
  });

  const peekItems = [
    { lead: "The app will learn your bird's normal.", text: "Their numbers will be compared with their own history instead of a general chart for the species." },
    { lead: "Today cards will bring timely tips.", text: "You'll see short notes on what a heat wave, holiday candles, or fireworks night means for a parrot." },
    { lead: "You'll be able to describe your bird out loud.", text: "Talk or type the way you'd tell a friend about them, and the app will draft a care plan for you to review." },
    { lead: "A weekly recap will round things up.", text: "Instead of several separate nudges, you'll get one short look back at your week." },
  ];

  let html = built.html;
  html = splice(html, SLOT_BADGES, badgesHtml());
  html = splice(html, SLOT_FAVOR, favorHtml());
  html = splice(html, SLOT_PEEK, peekHtml(peekItems));
  html = tightenFooter(html);

  // The plain text comes from the same blocks, so the tokens are in it too.
  const text = built.text
    .replace(SLOT_BADGES, `Get the app: ${LINKS.button}\nApp Store: ${LINKS.badgeIos}\nGoogle Play: ${LINKS.badgeAndroid}`)
    .replace(SLOT_FAVOR, `A small favor\nKya & Co. is brand new in the stores, and those first few reviews go a long way toward helping other bird people find it. If the app has made caring for your flock a little easier, I'd be grateful if you left a rating and a sentence or two about why.\nLeave a review: ${LINKS.review}`)
    .replace(SLOT_PEEK, `Sneak peek — Coming to the app\nHere's a look at what we're working on now. There are no dates yet, but I'll let you know as each one arrives.\n\n${peekItems.map((i) => `${i.lead} ${i.text}`).join("\n\n")}`);

  if (html.includes("@@APP_LAUNCH_")) throw new Error("app-launch email: a slot token survived into the HTML");
  if (text.includes("@@APP_LAUNCH_")) throw new Error("app-launch email: a slot token survived into the plain text");

  return { subject: built.subject, html, text };
}
