// Render every email to an HTML file so it can be read in a browser and diffed
// against the design handback.
//
//   npm run email:preview          → .email-preview/
//   npm run email:preview -- --check  → also diff the 7 series emails against
//                                       docs/email-redesign/templates/
//
// The seven onboarding letters are rendered with the handback's own sample data
// (firstName "Sam", every CTA pointing at the bare app URL), so the output is
// directly comparable to docs/email-redesign/templates/NN-name.html. Everything
// else in the programme is rendered into others/ — that folder is the guard for
// "this work changed the series and nothing else": snapshot it, make a change,
// render again, diff.
//
// Nothing in the app imports this. No credentials, no network.
import * as fs from "node:fs";
import * as path from "node:path";
import * as T from "@/lib/emailTemplates";
import { buildWelcomeEmail, buildSeriesWeighingEmail, buildSeriesHealthCheckEmail, buildSeriesCarePlanEmail, buildSeriesJournalEmail, buildSeriesSharingEmail, buildSeriesVetEmail } from "@/lib/flockEmails";

const OUT = ".email-preview";
const APP = "https://app.thekyaproject.com";
const BIRD = "Willow";
const RANGE = "3 to 11 October";

// The templates are whole documents; shell() and letterShell() return the body
// fragment that Brevo sends. Wrap the fragment in the same head so a diff
// against the handback shows real differences instead of scaffolding.
function page(subject: string, body: string): string {
  // Flock Club builders already return a whole document — wrapping one again
  // would produce nested <html>, which is not what gets sent. Pass it through.
  if (/^\s*<!doctype/i.test(body)) return body;
  // The subject is plain text ("Kya & Co."); a <title> needs it escaped. This
  // wrapper is preview scaffolding only — the sent email has no <title>.
  const title = subject.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f1e8;">
${body}
</body>
</html>
`;
}

// The seven onboarding letters, with the handback's sample data.
const series: Array<[string, T.BuiltEmail]> = [
  ["01-welcome", buildWelcomeEmail({ firstName: "Sam", link: APP })],
  ["02-weighing", buildSeriesWeighingEmail({ link: APP })],
  ["03-health-check", buildSeriesHealthCheckEmail({ link: APP })],
  ["04-care-plan", buildSeriesCarePlanEmail({ link: APP })],
  ["05-journal", buildSeriesJournalEmail({ link: APP })],
  ["06-sharing", buildSeriesSharingEmail({ link: APP })],
  ["07-vet", buildSeriesVetEmail({ link: APP })],
];

// The monthly letter, with the handback's own sample flock (Juno full, Pip
// quiet) so 08-monthly.html and 09-monthly-quiet.html are comparable by eye.
const JUNO: T.MonthlyBird = {
  name: "Juno", species: "Blue-throated macaw", recordUrl: `${APP}/birds/demo`,
  weights: [752, 754, 750, 756, 748, 755, 757, 751, 753, 759, 754, 750, 761, 755, 752, 758, 753, 749, 756, 754, 757, 752, 755, 753],
  prevSpread: 19, checks: 22, flagged: 0, journalEntries: 4, journalPhotos: 6,
  planUpdated: { date: "12 Sep", sections: "Food and Routine" },
  quote: { date: "14 September", body: "Tried the new foraging box this morning. Worked it out in under a minute, then ignored it for the rest of the day." },
  lastWeight: null, lastCheck: null,
};
const PIP: T.MonthlyBird = {
  name: "Pip", species: "Cockatiel", recordUrl: `${APP}/birds/demo2`,
  weights: [92], prevSpread: null, checks: 0, flagged: 0, journalEntries: 0, journalPhotos: 0,
  planUpdated: null, quote: null,
  lastWeight: { grams: 92, date: "18 September" },
  lastCheck: { date: "11 Sep", flagged: false },
};
const ARTICLE = {
  title: "Weigh your bird every day: What a gram scale tells you before your parrot does",
  intro: "Weight is the first honest signal of a parrot's health. Why daily weighing matters, what normal fluctuation looks like, and when the trend means call the vet.",
  url: "https://www.thekyaproject.com/blog/weigh-your-bird-every-day",
  minutes: 4,
};
const monthly: Array<[string, T.BuiltEmail]> = [
  ["08-monthly", T.buildMonthlyEmail({ firstName: "Sam", birds: [JUNO, PIP], month: 10, year: 2026, link: APP,
    coming: [{ mon: "Oct", day: 3, title: "Four years since Juno came home", sub: "It's saved as a moment on Juno's record." }],
    article: ARTICLE })],
  ["09-monthly-quiet", T.buildMonthlyEmail({ firstName: "Sam", birds: [PIP], month: 10, year: 2026, link: APP, article: ARTICLE })],
];

// Everything else that uses shell(). These must not change.
const others: Array<[string, T.BuiltEmail]> = [
  ["drip-add-bird", T.buildOnboardingAddBirdEmail({ firstName: "Sam", link: `${APP}/birds/new` })],
  ["drip-first-weight", T.buildOnboardingFirstWeightEmail({ birdName: BIRD, link: `${APP}/dashboard` })],
  ["drip-health-scan", T.buildOnboardingHealthScanEmail({ birdName: BIRD, link: `${APP}/scans` })],
  ["drip-care-plan", T.buildOnboardingCarePlanEmail({ birdName: BIRD, link: `${APP}/dashboard` })],
  ["drip-weight-trend", T.buildOnboardingWeightTrendEmail({ birdName: BIRD, link: `${APP}/dashboard` })],
  ["alert-serious-concern", T.buildSitterConcernEmail({ birdName: BIRD, coveringLabel: "Sam", link: `${APP}/birds/demo` })],
  ["letter-bereavement", T.buildBereavementEmail({ firstName: "Sam", birdName: BIRD })],
  ["activity-daily-log", T.buildDailyLogEmail({ birdName: BIRD, sitterName: "Sam", link: `${APP}/scans` })],
  ["reminder-care-plan", T.buildCarePlanReminderEmail({ birdName: BIRD, link: `${APP}/birds/demo/plan` })],
  ["household-invite", T.buildHouseholdInviteEmail({ inviterName: "Sam", birdNames: `${BIRD} and Moxie`, link: `${APP}/invite/demo` })],
  ["handoff-invite", T.buildHandoffInviteEmail({ senderName: "Sam", birdName: BIRD, link: `${APP}/handoff/demo` })],
  ["handoff-accepted", T.buildHandoffAcceptedEmail({ birdName: BIRD, recipientLabel: "Sam" })],
  ["handoff-declined", T.buildHandoffDeclinedEmail({ birdName: BIRD })],
  ["sit-assigned", T.buildSitAssignedEmail({ ownerName: "Sam", birdNames: BIRD, dateRange: RANGE, link: `${APP}/sits/demo` })],
  ["sit-updated", T.buildSitUpdatedEmail({ ownerName: "Sam", birdNames: BIRD, dateRange: RANGE, changeSummary: "The dates moved by two days.", link: `${APP}/sits/demo` })],
  ["sit-cancelled", T.buildSitCancelledEmail({ ownerName: "Sam", birdNames: BIRD, dateRange: RANGE, link: `${APP}/sits/demo` })],
  ["sitter-link-invite", T.buildSitterInviteEmail({ ownerName: "Sam", birdNames: BIRD, dateRange: RANGE, link: `${APP}/sitter/demo` })],
  ["sitter-link-updated", T.buildSitterInviteUpdatedEmail({ ownerName: "Sam", birdNames: BIRD, dateRange: RANGE, changeSummary: "The dates moved by two days.", link: `${APP}/sitter/demo` })],
  ["sitter-link-cancelled", T.buildSitterInviteCancelledEmail({ ownerName: "Sam", birdNames: BIRD, dateRange: RANGE })],
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "others"), { recursive: true });

const index: string[] = [];
for (const [name, built] of series) {
  fs.writeFileSync(path.join(OUT, `${name}.html`), page(built.subject, built.html));
  fs.writeFileSync(path.join(OUT, `${name}.txt`), built.text);
  index.push(`<li><a href="${name}.html">${name}</a> — ${built.subject}</li>`);
}
for (const [name, built] of monthly) {
  fs.writeFileSync(path.join(OUT, `${name}.html`), page(built.subject, built.html));
  fs.writeFileSync(path.join(OUT, `${name}.txt`), built.text);
  index.push(`<li><a href="${name}.html">${name}</a> — ${built.subject}</li>`);
}
for (const [name, built] of others) {
  fs.writeFileSync(path.join(OUT, "others", `${name}.html`), page(built.subject, built.html));
  fs.writeFileSync(path.join(OUT, "others", `${name}.txt`), built.text);
  index.push(`<li><a href="others/${name}.html">others/${name}</a> — ${built.subject}</li>`);
}
fs.writeFileSync(
  path.join(OUT, "index.html"),
  page("Email preview", `<div style="font-family:system-ui;padding:24px;"><h1>Email preview</h1><ul>${index.join("")}</ul></div>`),
);

console.log(`${series.length} series + ${monthly.length} monthly + ${others.length} other emails → ${OUT}/`);

// --check: normalize whitespace between tags and compare the series output to
// the handback. Whitespace between tags is not significant in these emails, and
// the generator and the handback differ in how they indent.
// --write: overwrite docs/email-redesign/templates/NN-name.html with the
// current output, in the merge-field form. The handback was the source of
// truth while the design was being handed over; now that the design is edited
// in code, those files are a snapshot of it and --check is a change-detector:
// it tells you when a code change moved the rendered letters, so the move is
// deliberate rather than noticed in someone's inbox. The originals are in git.
if (process.argv.includes("--write")) {
  const forWrite = new Map(series.map(([n, b]) => [n, b.html]));
  forWrite.set("01-welcome", buildWelcomeEmail({ firstName: "{{firstName}}", link: APP }).html);
  for (const [name, built] of series) {
    const out = `docs/email-redesign/templates/${name}.html`;
    fs.writeFileSync(out, page(built.subject, forWrite.get(name)!).replace(/>\s+</g, "><").trim() + "\n");
    console.log(`  wrote ${out}`);
  }
}

if (process.argv.includes("--check")) {
  const norm = (s: string) => s.replace(/>\s+</g, "><").trim();
  // templates/ is the merge-field form, so compare against that form: the only
  // merge field in the seven is the welcome letter's {{firstName}}.
  const forCheck = new Map(series.map(([n, b]) => [n, b.html]));
  forCheck.set("01-welcome", buildWelcomeEmail({ firstName: "{{firstName}}", link: APP }).html);
  let diffs = 0;
  console.log("");
  for (const [name] of series) {
    const theirs = `docs/email-redesign/templates/${name}.html`;
    if (!fs.existsSync(theirs)) { console.log(`?  ${name}: no template to compare`); continue; }
    const a = norm(page(series.find(([n]) => n === name)![1].subject, forCheck.get(name)!));
    const b = norm(fs.readFileSync(theirs, "utf8"));
    if (a === b) { console.log(`ok ${name}`); continue; }
    diffs++;
    // First divergence, with a little context on each side.
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    console.log(`XX ${name}: diverges at byte ${i} of ${b.length}`);
    console.log(`   ...${b.slice(Math.max(0, i - 60), i)}`);
    console.log(`   handback: ${b.slice(i, i + 160)}`);
    console.log(`   rendered: ${a.slice(i, i + 160)}`);
  }
  console.log(`\n${series.length - diffs}/${series.length} match the handback`);
  if (diffs) process.exitCode = 1;
}
