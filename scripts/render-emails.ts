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
import * as T2 from "@/lib/flockEmails";
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

// The Flock Report, in four shapes: a typical flock, one bird, a flock with
// gaps in it, and one big enough to trip the name list.
const A2 = APP;
const wi = (days: number[], base: number) => days.map((d, i) => ({ day: d, g: base + ((i * 7) % 11) - 5 }));
const bird = (name: string, species: string, o: Partial<T2.FlockBird> = {}): T2.FlockBird => ({
  name, species, href: `${A2}/birds/demo`,
  weighIns: wi([2, 5, 9, 12, 16, 19, 23, 26, 29], 752),
  checks: 22, journal: 4, planUpdated: "12 Sep",
  ...o,
});
const FLOCK6: T2.FlockBird[] = [
  bird("Juno", "Blue-throated macaw"),
  bird("Pip", "Cockatiel", { weighIns: [], checks: 8, journal: 1, planUpdated: null }),
  bird("Echo", "Red-crowned amazon", { checks: 0, journal: 2 }),
  bird("Buzz", "Timneh African grey", { weighIns: wi([3, 8, 14, 21, 27], 283) }),
  bird("Moxie", "Blue-throated macaw", { weighIns: wi([1, 6, 11, 17, 22, 28], 775), journal: 0 }),
  bird("Willow", "Blue and gold macaw", { weighIns: wi([4, 10, 15, 20, 25, 30], 1114), planUpdated: null }),
];
const FLOCK8: T2.FlockBird[] = [...FLOCK6, bird("Kiwi", "Green-cheeked conure", { weighIns: wi([7, 18], 64) }), bird("Sol", "Sun conure", { checks: 3 })];
const ART = { title: "Weigh your bird every day: what a gram scale tells you first", url: "https://www.thekyaproject.com/blog/weigh", minutes: 4 };
const monthly: Array<[string, T.BuiltEmail]> = [
  ["08-flock-report", T2.buildFlockReportEmail({ firstName: "Sam", birds: FLOCK6, month: 9, year: 2026, link: APP, coming: { date: "Oct 3", title: "The day Juno came home" }, article: ART })],
  ["08b-flock-report-one", T2.buildFlockReportEmail({ firstName: "Sam", birds: [FLOCK6[0]], month: 9, year: 2026, link: APP, article: ART })],
  ["08c-flock-report-eight", T2.buildFlockReportEmail({ firstName: "Sam", birds: FLOCK8, month: 9, year: 2026, link: APP, article: ART })],
  ["09-flock-report-quiet", T2.buildFlockReportEmail({ firstName: "Sam", month: 9, year: 2026, link: APP, article: ART,
    birds: ["Juno", "Pip", "Echo"].map((n) => ({ name: n, species: "Blue-throated macaw", href: `${A2}/birds/demo`, weighIns: [], checks: 0, journal: 0, planUpdated: null })) })],
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
