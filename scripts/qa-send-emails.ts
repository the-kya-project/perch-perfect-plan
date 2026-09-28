// QA harness: send every email in the programme to one inbox, through the real
// Brevo path, so they can be read as recipients will see them.
//
//   npm run email:qa                    → all 26 to brittany@thekyaproject.com
//   npm run email:qa -- --dry           → list what would send, send nothing
//   npm run email:qa -- you@example.com
//   npm run email:qa -- --only welcome  → just the ones whose label matches
//
// Credentials: the Brevo vars are stored in Vercel as Secret, so `vercel env
// pull` returns [SENSITIVE] and no one can read them back. Put them in
// .env.email-qa at the repo root instead (gitignored by the .env* rule):
//
//   BREVO_API_KEY=xkeysib-...
//   BREVO_SENDER_EMAIL=...
//   BREVO_SENDER_NAME=The Kya Project
//
// Anything already exported in the shell wins over the file. Not wired into the
// app; nothing imports this.
import * as fs from "node:fs";
import * as T from "@/lib/emailTemplates";
import { buildWelcomeEmail, buildSeriesWeighingEmail, buildSeriesHealthCheckEmail, buildSeriesCarePlanEmail, buildSeriesJournalEmail, buildSeriesSharingEmail } from "@/lib/flockEmails";

// Minimal dotenv: first file that exists, exported values take precedence.
for (const f of [".env.email-qa", ".env.local", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const DRY = process.argv.includes("--dry");
// --only <substring>: send just the matching labels, for checking one template
// in a real inbox without posting the other 25.
const onlyAt = process.argv.indexOf("--only");
const ONLY = onlyAt !== -1 ? process.argv[onlyAt + 1]?.toLowerCase() : undefined;
if (!DRY && !process.env.BREVO_API_KEY) {
  console.error(
    "Missing BREVO_API_KEY.\n" +
    "It is Secret in Vercel and cannot be pulled. Put it in .env.email-qa at the\n" +
    "repo root (see the header of this file), then run again.",
  );
  process.exit(1);
}
// The sender is whatever Brevo already has verified — no need to remember it.
if (!DRY && !process.env.BREVO_SENDER_EMAIL) {
  const r = await fetch("https://api.brevo.com/v3/senders", {
    headers: { "api-key": process.env.BREVO_API_KEY!, accept: "application/json" },
  });
  if (!r.ok) {
    console.error(`Could not list Brevo senders (${r.status}). Check the API key, or set BREVO_SENDER_EMAIL yourself.`);
    process.exit(1);
  }
  const senders = ((await r.json()) as { senders?: Array<{ email: string; name: string; active: boolean }> }).senders ?? [];
  const pick = senders.find((x) => x.active) ?? senders[0];
  if (!pick) {
    console.error("Brevo has no senders set up. Add and verify one first.");
    process.exit(1);
  }
  process.env.BREVO_SENDER_EMAIL = pick.email;
  process.env.BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || pick.name;
  console.log(`Sending as: ${pick.name} <${pick.email}>\n`);
}
import { sendTransactionalEmail, founderReplyTo } from "@/lib/brevoEmail.server";

// Recipient: first CLI arg, else Brittany's founder address.
const TO = process.argv.find((a) => a.includes("@")) ?? "brittany@thekyaproject.com";
const APP = "https://app.thekyaproject.com";
const BIRD = "Willow";
const RANGE = "3 to 11 October";

// Programme order. Sent in REVERSE so the inbox, newest first, reads 1 to 26
// top to bottom.
const all: Array<[string, { subject: string; html: string; text: string }, boolean?]> = [
  ["01 onboarding · welcome", buildWelcomeEmail({ firstName: "Brittany", link: APP }), true],
  ["02 onboarding · weighing", buildSeriesWeighingEmail({ link: `${APP}/birds/demo/weight` })],
  ["03 onboarding · health check", buildSeriesHealthCheckEmail({ link: `${APP}/birds/demo/scan` })],
  ["04 onboarding · care plan", buildSeriesCarePlanEmail({ link: `${APP}/birds/demo/plan` })],
  ["05 onboarding · journal", buildSeriesJournalEmail({ link: `${APP}/birds/demo/journal` })],
  ["06 onboarding · sharing", buildSeriesSharingEmail({ link: `${APP}/birds/demo/access` })],
  ["07 onboarding · vet summary", T.buildSeriesVetEmail({ link: `${APP}/birds/demo/vet-summary` }), true],

  ["07b monthly · letter", T.buildMonthlyEmail({ firstName: "Brittany", month: new Date().getUTCMonth() + 1, year: new Date().getUTCFullYear(), link: APP,
    birds: [{ name: BIRD, species: "Blue and Gold Macaw", recordUrl: `${APP}/birds/demo`,
      weights: [1139, 1104, 1130, 1127, 1136, 1106, 1130, 1115, 1098, 1099, 1098, 1086],
      prevSpread: 68, checks: 1, flagged: 0, journalEntries: 0, journalPhotos: 0,
      planUpdated: null, quote: null, lastWeight: null, lastCheck: null }] }), true],

  ["08 drip · add first bird", T.buildOnboardingAddBirdEmail({ firstName: "Brittany", link: `${APP}/birds/new` })],
  ["09 drip · first weight", T.buildOnboardingFirstWeightEmail({ birdName: BIRD, link: `${APP}/dashboard` })],
  ["10 drip · health scan", T.buildOnboardingHealthScanEmail({ birdName: BIRD, link: `${APP}/scans` })],
  ["11 drip · care plan", T.buildOnboardingCarePlanEmail({ birdName: BIRD, link: `${APP}/dashboard` })],
  ["12 drip · weight trend", T.buildOnboardingWeightTrendEmail({ birdName: BIRD, link: `${APP}/dashboard` })],

  ["13 alert · serious concern", T.buildSitterConcernEmail({ birdName: BIRD, coveringLabel: "Sam", link: `${APP}/birds/demo` })],
  ["14 letter · bereavement", T.buildBereavementEmail({ firstName: "Brittany", birdName: BIRD })],

  ["15 activity · daily log", T.buildDailyLogEmail({ birdName: BIRD, sitterName: "Sam", link: `${APP}/scans` })],
  ["16 reminder · care plan", T.buildCarePlanReminderEmail({ birdName: BIRD, link: `${APP}/birds/demo/plan` })],

  ["17 household · invite", T.buildHouseholdInviteEmail({ inviterName: "Brittany", birdNames: `${BIRD} and Moxie`, link: `${APP}/invite/demo` })],

  ["18 handoff · invite", T.buildHandoffInviteEmail({ senderName: "Brittany", birdName: BIRD, link: `${APP}/handoff/demo` })],
  ["19 handoff · accepted", T.buildHandoffAcceptedEmail({ birdName: BIRD, recipientLabel: "Sam" })],
  ["20 handoff · declined", T.buildHandoffDeclinedEmail({ birdName: BIRD })],

  ["21 sit · assigned", T.buildSitAssignedEmail({ ownerName: "Brittany", birdNames: BIRD, dateRange: RANGE, link: `${APP}/sits/demo` })],
  ["22 sit · updated", T.buildSitUpdatedEmail({ ownerName: "Brittany", birdNames: BIRD, dateRange: RANGE, changeSummary: "The dates moved by two days.", link: `${APP}/sits/demo` })],
  ["23 sit · cancelled", T.buildSitCancelledEmail({ ownerName: "Brittany", birdNames: BIRD, dateRange: RANGE, link: `${APP}/sits/demo` })],

  ["24 sitter link · invite", T.buildSitterInviteEmail({ ownerName: "Brittany", birdNames: BIRD, dateRange: RANGE, link: `${APP}/sitter/demo` })],
  ["25 sitter link · updated", T.buildSitterInviteUpdatedEmail({ ownerName: "Brittany", birdNames: BIRD, dateRange: RANGE, changeSummary: "The dates moved by two days.", link: `${APP}/sitter/demo` })],
  ["26 sitter link · cancelled", T.buildSitterInviteCancelledEmail({ ownerName: "Brittany", birdNames: BIRD, dateRange: RANGE })],
];

const dry = DRY;
const queue = ONLY ? all.filter(([label]) => label.toLowerCase().includes(ONLY)) : all;
if (ONLY && queue.length === 0) {
  console.error(`No template label matches "${ONLY}". Labels:\n` + all.map(([l]) => "  " + l).join("\n"));
  process.exit(1);
}
let ok = 0, fail = 0;
for (const [label, built, replyToFounder] of [...queue].reverse()) {
  if (dry) { console.log("would send", label.padEnd(30), "|", built.subject); ok++; continue; }
  const res = await sendTransactionalEmail({
    to: TO,
    toName: "Brittany",
    subject: built.subject,
    htmlContent: built.html,
    textContent: built.text,
    ...(replyToFounder ? { replyTo: founderReplyTo() } : {}),
  });
  if (res.ok) { ok++; console.log("sent   ", label.padEnd(30), "|", built.subject); }
  else { fail++; console.log("FAILED ", label.padEnd(30), "|", JSON.stringify(res)); }
  await new Promise((r) => setTimeout(r, 1300));
}
console.log(`\n${ok} ${dry ? "would send" : "sent"}, ${fail} failed`);
