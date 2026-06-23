// Transactional email templates (warm palette, inline styles for mail-client
// consistency). Pure string builders — no secrets, no Node APIs.

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export type BuiltEmail = { subject: string; html: string; text: string };

function shell(opts: { kicker: string; heading: string; body: string; cta: string; link: string; foot: string }): string {
  return `
<div style="background:#f4f1e8;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e3ded0;">
    <div style="background:#1a3d2e;padding:20px 24px;">
      <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.85);">${opts.kicker}</p>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:500;color:#fff;">${opts.heading}</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 8px;font-size:15px;color:#1a3d2e;">${opts.body}</p>
      <a href="${opts.link}" style="display:inline-block;margin-top:12px;background:#1a3d2e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:600;">${opts.cta}</a>
      <p style="margin:20px 0 0;font-size:12px;color:#8a897f;line-height:1.5;">${opts.foot}</p>
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
    subject: `${opts.birdName}: daily scan logged — all clear`,
    html: shell({
      kicker: "Daily update",
      heading: `${bird}'s sitter logged an all-clear scan`,
      body: `${sitter} just completed ${bird}'s daily health scan and nothing was flagged.`,
      cta: "View the scan",
      link: opts.link,
      foot: "You're getting this because daily-scan emails are on. You can turn them off in the app's notification settings.",
    }),
    text: `${opts.birdName}'s sitter logged an all-clear daily scan.\n\nView it: ${opts.link}`,
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
    `${inviter} invited you to help care for ${birds} on Parrot Care Co-Pilot. ` +
    `You'll be able to see each bird's care plan, weight, journal, and health scans — ` +
    `and log weights, journal entries, and daily scans alongside ${inviter}. ` +
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
      `${opts.inviterName} invited you to help care for ${opts.birdNames} on Parrot Care Co-Pilot.\n\n` +
      `You'll be able to view each bird's record and log weights, journal entries, and scans. ` +
      `You can't change the care plan or access; ${opts.inviterName} stays the owner.\n\n` +
      `Accept (expires in 14 days): ${opts.link}\n\n` +
      `If you didn't expect this, you can ignore this email.`,
  };
}
