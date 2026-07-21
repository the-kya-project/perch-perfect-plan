// Transactional email templates (warm palette, inline styles for mail-client
// consistency). Pure string builders — no secrets, no Node APIs.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export type BuiltEmail = { subject: string; html: string; text: string };

function shell(opts: {
  kicker: string;
  heading: string;
  body: string;
  cta: string;
  link: string;
  foot: string;
  /** Optional "From the field notes" blog block rendered under the CTA. */
  reading?: { title: string; teaser: string; url: string };
}): string {
  const reading = opts.reading
    ? `
      <div style="margin-top:20px;padding:14px 16px;background:#f4f1e8;border-radius:12px;">
        <p style="margin:0;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#8a897f;">From the field notes</p>
        <p style="margin:6px 0 0;font-size:14px;"><a href="${opts.reading.url}" style="color:#1a3d2e;font-weight:600;">${opts.reading.title}</a></p>
        <p style="margin:4px 0 0;font-size:12.5px;color:#5f5e5a;line-height:1.5;">${opts.reading.teaser}</p>
      </div>`
    : "";
  // Email header: horizontal-cream lockup served from production via an
  // ABSOLUTE URL (relative paths can't resolve inside a recipient's inbox).
  // Plain-text fallback line "Kya & Co. — by The Kya Project" lives in the
  // text/* bodies and the footer.
  return `
<div style="background:#f4f1e8;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e3ded0;">
    <div style="background:#f4f1e8;padding:20px 24px;text-align:left;border-bottom:1px solid #eee6d4;">
      <img src="https://app.thekyaproject.com/brand/lockups/horizontal-cream.png" width="280" alt="Kya & Co. — by The Kya Project" style="display:block;width:280px;max-width:100%;height:auto;" />
    </div>
    <div style="background:#1a3d2e;padding:20px 24px;">
      <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.85);">${opts.kicker}</p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:500;color:#fff;">${opts.heading}</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 8px;font-size:15px;color:#1a3d2e;">${opts.body}</p>
      <a href="${opts.link}" style="display:inline-block;margin-top:12px;background:#1a3d2e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;">${opts.cta}</a>${reading}
      <p style="margin:20px 0 0;font-size:12px;color:#8a897f;line-height:1.5;">${opts.foot}</p>
      <p style="margin:18px 0 0;font-size:11px;color:#8a897f;text-align:center;border-top:1px solid #eee6d4;padding-top:12px;">Kya &amp; Co. — by The Kya Project</p>
    </div>
  </div>
</div>`;
}

// "Sitter added a daily log" — sent for all-clear scans when the owner opts in
// (flagged scans use the always-on health alert, not this one).
export function buildDailyLogEmail(opts: { birdName: string; sitterName: string; link: string }): BuiltEmail {
  const bird = escapeHtml(opts.birdName);
  const sitter = escapeHtml(opts.sitterName);
  return {
    subject: `${opts.birdName}: daily health check logged — all clear`,
    html: shell({
      kicker: "Daily update",
      heading: `${bird}'s sitter logged an all-clear health check`,
      body: `${sitter} just completed ${bird}'s daily health check and nothing was flagged.`,
      cta: "View the health check",
      link: opts.link,
      foot: "You're getting this because daily health-check emails are on. You can turn them off in the app's notification settings.",
    }),
    text: `${opts.birdName}'s sitter logged an all-clear daily health check.\n\nView it: ${opts.link}`,
  };
}

// "Care plan update reminder" — sent by the reminder cron when the owner opts in.
export function buildCarePlanReminderEmail(opts: { birdName: string; link: string }): BuiltEmail {
  const bird = escapeHtml(opts.birdName);
  return {
    subject: `${opts.birdName} has a sit coming up — review the care plan?`,
    html: shell({
      kicker: "Care plan check-in",
      heading: `${bird} has a sit coming up`,
      body: `It's been a while since ${bird}'s care plan was updated, and a sit starts soon. Take a minute to review it so your sitter has the latest.`,
      cta: "Review the care plan",
      link: opts.link,
      foot: "You're getting this because care-plan reminder emails are on. You can turn them off in the app's notification settings.",
    }),
    text: `${opts.birdName} has a sit coming up — review the care plan: ${opts.link}`,
  };
}

// "You've been invited to help care for <birds>" — household sharing invite.
// inviterName is the owner's display name; birdNames is a human list already
// joined ("Willow and Moxie"). Warm and dignified; expiry note included.
export function buildHouseholdInviteEmail(opts: {
  inviterName: string;
  birdNames: string;
  link: string;
}): BuiltEmail {
  const inviter = escapeHtml(opts.inviterName);
  const birds = escapeHtml(opts.birdNames);
  const body =
    `${inviter} invited you to help care for ${birds} on Kya & Co.. ` +
    `You'll be able to see each bird's care plan, weight, journal, and health checks — ` +
    `and log weights, journal entries, and daily health checks alongside ${inviter}. ` +
    `You won't be able to change the care plan or who has access; ${inviter} stays the owner. ` +
    `This invite expires in 14 days.`;
  return {
    subject: `${opts.inviterName} invited you to help care for ${opts.birdNames}`,
    html: shell({
      kicker: "Household invite",
      heading: `${inviter} invited you to help care for ${birds}`,
      body,
      cta: "Accept the invite",
      link: opts.link,
      foot: "If you didn't expect this, you can ignore this email — nothing happens until you accept. The invite link expires in 14 days.",
    }),
    text:
      `${opts.inviterName} invited you to help care for ${opts.birdNames} on Kya & Co..\n\n` +
      `You'll be able to view each bird's record and log weights, journal entries, and health checks. ` +
      `You can't change the care plan or access; ${opts.inviterName} stays the owner.\n\n` +
      `Accept (expires in 14 days): ${opts.link}\n\n` +
      `If you didn't expect this, you can ignore this email.`,
  };
}

// "<sender> is handing off <bird> to you" — in-app handoff invitation.
export function buildHandoffInviteEmail(opts: { senderName: string; birdName: string; link: string }): BuiltEmail {
  const sender = escapeHtml(opts.senderName);
  const bird = escapeHtml(opts.birdName);
  return {
    subject: `${opts.senderName} is handing off ${opts.birdName} to you`,
    html: shell({
      kicker: "Bird handoff",
      heading: `${sender} is handing off ${bird} to you`,
      body:
        `${sender} wants to pass ${bird}'s full record to you on Kya & Co. — ` +
        `care plan, identity, weight history, journal, and moments, so you have everything they learned while caring for ${bird}. ` +
        `Once you accept, the record is yours and ${sender} no longer has access. This link expires in 14 days.`,
      cta: "Review the handoff",
      link: opts.link,
      foot: "If you weren't expecting this, you can ignore this email — nothing transfers until you accept.",
    }),
    text:
      `${opts.senderName} is handing off ${opts.birdName} to you on Kya & Co..\n\n` +
      `You'll receive ${opts.birdName}'s full record (care plan, identity, weights, journal, moments). ` +
      `Once you accept, it's yours and ${opts.senderName} no longer has access.\n\n` +
      `Review (expires in 14 days): ${opts.link}`,
  };
}

// "<recipient> accepted — <bird> is theirs now" — notify the sender it's done.
export function buildHandoffAcceptedEmail(opts: { birdName: string; recipientLabel: string }): BuiltEmail {
  const bird = escapeHtml(opts.birdName);
  const who = escapeHtml(opts.recipientLabel);
  return {
    subject: `${opts.birdName}'s handoff is complete`,
    html: shell({
      kicker: "Handoff complete",
      heading: `${bird} has a new home`,
      body:
        `${who} accepted the handoff, so ${bird}'s record is now theirs and has left your account. ` +
        `You'll find a memory of ${bird} in Past birds. Thank you for taking such good care of them.`,
      cta: "View Past birds",
      link: "https://app.thekyaproject.com/past-birds",
      foot: "This is a one-time confirmation. There's nothing else to do.",
    }),
    text: `${who} accepted the handoff. ${opts.birdName}'s record is now theirs and has left your account. A memory is saved in Past birds.`,
  };
}

// "<bird>'s handoff was declined" — notify the sender, gently.
export function buildHandoffDeclinedEmail(opts: { birdName: string }): BuiltEmail {
  const bird = escapeHtml(opts.birdName);
  return {
    subject: `${opts.birdName}'s handoff was declined`,
    html: shell({
      kicker: "Handoff declined",
      heading: `${bird}'s handoff wasn't accepted`,
      body:
        `The handoff for ${bird} was declined, so nothing changed — ${bird} is still in your account and you still have full access. ` +
        `You can start a new handoff whenever you're ready.`,
      cta: "Open Kya & Co.",
      link: "https://app.thekyaproject.com",
      foot: "No action needed.",
    }),
    text: `${opts.birdName}'s handoff was declined. Nothing changed — ${opts.birdName} is still in your account.`,
  };
}

// ---------------------------------------------------------------------------
// Onboarding product emails — sent (at most once each, one per day max) by the
// onboarding-emails cron route based on what the account has actually done.
// These are core product communication, not marketing.
// ---------------------------------------------------------------------------

const ONBOARDING_FOOT =
  "You're getting this because you have a Kya & Co. account and haven't finished setting up. Each of these setup notes is sent at most once.";

// Blog posts linked from the drip (verified live on thekyaproject.com 2026-07-20).
// When the planned "why weigh your bird" post is published, point the two
// weight emails at it instead.
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

// Stage: signed up, no bird yet.
export function buildOnboardingAddBirdEmail(opts: { firstName?: string; link: string }): BuiltEmail {
  const hi = opts.firstName ? `${escapeHtml(opts.firstName)}, your` : "Your";
  return {
    subject: "Your bird's record is ready when you are",
    html: shell({
      kicker: "Getting set up",
      heading: `${hi} flock page is still empty`,
      body:
        "Adding a bird takes about a minute — a name and a species is enough to start. " +
        "Everything else (care plan, weights, photos) can come whenever you like.",
      cta: "Add your bird",
      link: opts.link,
      foot: ONBOARDING_FOOT,
    }),
    text: `Adding a bird takes about a minute — a name and a species is enough to start.\n\nAdd your bird: ${opts.link}`,
  };
}

// Stage: has a bird, care plan untouched.
export function buildOnboardingCarePlanEmail(opts: { birdName: string; link: string }): BuiltEmail {
  const bird = escapeHtml(opts.birdName);
  return {
    subject: `A little about ${opts.birdName} goes a long way`,
    html: shell({
      kicker: "Getting set up",
      heading: `Start ${bird}'s care plan`,
      body:
        `You know ${bird}'s routine by heart — food, quirks, the little rules. Writing even one section down means ` +
        `family, sitters, and anyone helping out can care for ${bird} the way you would. Add a section at a time, in any order.`,
      cta: `Open ${bird}'s care plan`,
      link: opts.link,
      foot: ONBOARDING_FOOT,
      reading: READING_THRIVE,
    }),
    text: `Writing down even one care-plan section means anyone helping out can care for ${opts.birdName} the way you would.\n\nOpen the care plan: ${opts.link}`,
  };
}

// Stage: has a bird, no weight logged yet.
export function buildOnboardingFirstWeightEmail(opts: { birdName: string; link: string }): BuiltEmail {
  const bird = escapeHtml(opts.birdName);
  return {
    subject: `Log ${opts.birdName}'s first weight`,
    html: shell({
      kicker: "Getting set up",
      heading: `${bird}'s weight tells you what words can't`,
      body:
        `Birds hide illness — weight is often the first honest signal. Log ${bird}'s weight once and you've started a baseline; ` +
        `keep it up (a kitchen scale and ten seconds) and the app will show you the trend at a glance.`,
      cta: "Log a weight",
      link: opts.link,
      foot: ONBOARDING_FOOT,
      reading: READING_SIGNS,
    }),
    text: `Weight is often the first honest signal of a bird's health. Log ${opts.birdName}'s first weight to start a baseline: ${opts.link}`,
  };
}

// Stage: has a bird, never run a daily health scan.
export function buildOnboardingHealthScanEmail(opts: { birdName: string; link: string }): BuiltEmail {
  const bird = escapeHtml(opts.birdName);
  return {
    subject: `Two minutes a day builds ${opts.birdName}'s health record`,
    html: shell({
      kicker: "Getting set up",
      heading: `Run ${bird}'s health scan every day`,
      body:
        `The daily health scan takes about two minutes. Log it every day and document what you see, ` +
        `whether something seems off or everything is normal. The normal days count too, because they're what make a change visible. ` +
        `Every scan becomes part of ${bird}'s record, so at the vet you can show exactly what changed, and when.`,
      cta: "Run today's health scan",
      link: opts.link,
      foot: ONBOARDING_FOOT,
      reading: READING_SIGNS,
    }),
    text: `The daily health scan takes about two minutes. Log it every day and document what you see, whether something seems off or everything is normal. It all becomes part of ${opts.birdName}'s record you can bring to the vet.\n\nRun today's health scan: ${opts.link}`,
  };
}

// Stage: first weight just logged — show what it unlocked.
export function buildOnboardingWeightTrendEmail(opts: { birdName: string; link: string }): BuiltEmail {
  const bird = escapeHtml(opts.birdName);
  return {
    subject: `${opts.birdName}'s baseline has begun`,
    html: shell({
      kicker: "Nice work",
      heading: `${bird}'s first weight is on the record`,
      body:
        `Every weigh-in from here builds ${bird}'s trend — steady, up, or down — right on the record and in the vet summary. ` +
        `Weighing at the same time of day (before breakfast works well) keeps the trend honest.`,
      cta: `See ${bird}'s weight page`,
      link: opts.link,
      foot: ONBOARDING_FOOT,
      reading: READING_SIGNS,
    }),
    text: `${opts.birdName}'s first weight is logged. Every weigh-in from here builds the trend on the record and in the vet summary.\n\nSee the weight page: ${opts.link}`,
  };
}
