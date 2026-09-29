/**
 * The one-off app-launch send. Not a cron, not a hook — run by hand.
 *
 *   vite-node scripts/send-app-launch.ts                 # dry run: who would get it
 *   vite-node scripts/send-app-launch.ts --test          # one email to the founder
 *   vite-node scripts/send-app-launch.ts --send          # the real list
 *
 * Safety, in order of how much it would hurt to get wrong:
 *   - --send is required. The default prints and sends nothing.
 *   - every send is written to app_launch_email_log BEFORE the next one starts,
 *     and anyone already in that table is skipped, so a re-run after a crash
 *     cannot send twice.
 *   - the QA account is excluded by address, not by flag, so it stays out even
 *     if someone flips its preferences.
 *   - audience is notify_monthly_letter = true, the same opt-out the Flock
 *     Report honours. Someone who turned that off does not get this either.
 */
import * as fs from "node:fs";

for (const f of [".env.email-qa", ".env"]) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, "utf8").split("\n")) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const TEST = process.argv.includes("--test");
const SEND = process.argv.includes("--send");
const FOUNDER = "brittany@thekyaproject.com";
const EXCLUDE = new Set(["brittany+kyatest@thekyaproject.com"]);
const APP_URL = "https://app.thekyaproject.com";

if (!process.env.BREVO_SENDER_EMAIL) {
  const r = await fetch("https://api.brevo.com/v3/senders", {
    headers: { "api-key": process.env.BREVO_API_KEY!, accept: "application/json" },
  });
  const ss = ((await r.json()) as { senders?: Array<{ email: string; name: string; active?: boolean }> }).senders ?? [];
  const pick = ss.find((x) => x.active) ?? ss[0];
  process.env.BREVO_SENDER_EMAIL = pick.email;
  process.env.BREVO_SENDER_NAME = pick.name;
}

const { buildAppLaunchEmail } = await import("@/lib/appLaunchEmail");
const { unsubUrl, unsubHeaders } = await import("@/lib/unsubscribe");
const { sendTransactionalEmail } = await import("@/lib/brevoEmail.server");
const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
const sb = supabaseAdmin as any;

type Row = { id: string; email: string | null; display_name: string | null };
const { data: profiles, error } = await sb
  .from("profiles")
  .select("id, email, display_name")
  .eq("notify_monthly_letter", true);
if (error) throw new Error(error.message);

const audience: Row[] = (profiles ?? []).filter((p: Row) => p.email && !EXCLUDE.has(p.email));
const { data: already } = await sb.from("app_launch_email_log").select("user_id");
const done = new Set<string>((already ?? []).map((r: { user_id: string }) => r.user_id));
const pending = audience.filter((p) => !done.has(p.id));

console.log(`audience: ${audience.length} · already sent: ${done.size} · pending: ${pending.length}`);
console.log(`excluded by address: ${[...EXCLUDE].join(", ")}`);
console.log(`reply-to: ${FOUNDER}\n`);
for (const p of pending) console.log(`  ${p.email}${p.display_name ? `  (${p.display_name})` : ""}`);

if (TEST) {
  const me = audience.find((p) => p.email === FOUNDER) ?? { id: "df4c89f5-0be0-4df2-9ecf-e6818fa7471d", email: FOUNDER, display_name: "Brittany King" };
  const b = buildAppLaunchEmail({ displayName: me.display_name, unsubscribeUrl: unsubUrl(APP_URL, me.id, "monthly") });
  const res = await sendTransactionalEmail({
    to: FOUNDER,
    toName: "Brittany",
    subject: b.subject,
    htmlContent: b.html,
    textContent: b.text,
    replyTo: { email: FOUNDER, name: "Brittany" },
    headers: unsubHeaders(APP_URL, me.id, "monthly"),
  });
  // A test never writes to the log — the founder is on the real list too, and
  // logging here would silently drop her from the actual send.
  console.log(`\nTEST -> ${FOUNDER}: ${res.ok ? "sent" : `FAILED ${JSON.stringify(res)}`}`);
} else if (!SEND) {
  console.log(`\nDRY RUN — nothing sent. Add --test for one to the founder, or --send for the list.`);
} else {
  let sent = 0;
  let failed = 0;
  for (const p of pending) {
    const b = buildAppLaunchEmail({ displayName: p.display_name, unsubscribeUrl: unsubUrl(APP_URL, p.id, "monthly") });
    const res = await sendTransactionalEmail({
      to: p.email!,
      toName: p.display_name ?? undefined,
      subject: b.subject,
      htmlContent: b.html,
      textContent: b.text,
      replyTo: { email: FOUNDER, name: "Brittany" },
      headers: unsubHeaders(APP_URL, p.id, "monthly"),
    });
    if (res.ok) {
      // Log immediately, one at a time. A crash mid-run then resumes cleanly
      // instead of re-sending to everyone already reached.
      await sb.from("app_launch_email_log").insert({ user_id: p.id, email: p.email });
      sent++;
      console.log(`  sent ${p.email}`);
    } else {
      failed++;
      console.log(`  FAILED ${p.email} ${JSON.stringify(res)}`);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  console.log(`\nsent ${sent} · failed ${failed}`);
}
