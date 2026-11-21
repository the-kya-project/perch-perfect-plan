/**
 * Bereavement notes, reviewed by Brittany before they go out.
 *
 *   1. A bird is marked as passed (markBirdPassed, or the daily cron as a
 *      safety net) → queueBereavementReviews() makes a review row and emails
 *      Brittany: who, which bird, how long it had been in the app, and the
 *      exact note the owner would get, with a link to the review page.
 *   2. The review page (/api/public/bereavement-review/$reviewId/$sig) shows
 *      the same and two buttons. "Send this note" → sendReviewedNote(); "Don't
 *      send" → decision 'skip'. Nothing reaches the owner without the first.
 *
 * The link is signed with the cron secret, like the unsubscribe links, so it
 * works from her inbox without a login. Opening it (GET) never acts: mail
 * scanners prefetch links, and a prefetch must not send a condolence note.
 *
 * Rules carried over from the old automatic note: once per bird ever
 * (bereavement_email_log), never for a bird marked before BEREAVEMENT_LAUNCH,
 * never on a handoff (a transferred bird's passed_at stays null), reply-to is
 * Brittany.
 */
import { realFirstName } from "./personName";
import { createHmac } from "node:crypto";

// Birds marked as passed before this never get a note (see the original
// rationale in docs/email-plan.md: a condolence note ten weeks late is worse
// than silence).
export const BEREAVEMENT_LAUNCH = "2026-09-23T00:00:00Z";

/** A bird marked as passed this soon after being added is almost certainly a
 *  past loss being recorded, not a new one. Flagged in the review email. */
const PAST_LOSS_MINUTES = 10;

const APP_URL = () => process.env.APP_URL || "https://app.thekyaproject.com";

function secret(): string {
  const s = process.env.CARE_PLAN_REMINDER_SECRET;
  if (!s) throw new Error("CARE_PLAN_REMINDER_SECRET is required to sign bereavement review links");
  return s;
}

export function reviewSig(reviewId: string): string {
  return createHmac("sha256", secret())
    .update(`bereavement-review:${reviewId}`)
    .digest("hex")
    .slice(0, 32);
}

export function reviewSigValid(reviewId: string, sig: string): boolean {
  const want = reviewSig(reviewId);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export function reviewUrl(reviewId: string): string {
  return `${APP_URL()}/api/public/bereavement-review/${reviewId}/${reviewSig(reviewId)}`;
}

/** "Willow", "Willow and Moxie", "Echo, Willow and Moxie". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

type Bird = { id: string; name: string; owner_id: string; passed_at: string; created_at: string };

export type ReviewDetails = {
  id: string;
  ownerId: string;
  decision: "send" | "skip" | null;
  decidedAt: string | null;
  birds: Bird[];
  names: string;
  ownerEmail: string;
  ownerName: string;
  firstName?: string;
  locale?: string;
  pastLoss: boolean;
  /** How long each bird was in the app before it was marked, for the reviewer. */
  inAppFor: string[];
};

function humanGap(fromIso: string, toIso: string): string {
  const s = Math.max(
    0,
    Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 1000),
  );
  if (s < 90) return `${s} seconds`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} minutes`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hours`;
  return `${Math.round(h / 24)} days`;
}

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

async function ownerContact(sb: any, ownerId: string) {
  const { data: profile } = await sb
    .from("profiles")
    .select("email, display_name, first_name, locale")
    .eq("id", ownerId)
    .maybeSingle();
  let email = (profile?.email ?? "").toString().trim();
  if (!email) {
    const { data: au } = await sb.auth.admin.getUserById(ownerId);
    email = au?.user?.email ?? "";
  }
  const displayName = (profile?.display_name ?? "").toString().trim();
  // Real names only: never the part of the address before the @, which the
  // capitalising below would otherwise turn into "W4hnt2hfdm".
  const first = realFirstName(profile ?? {}, email, profile?.email);
  return {
    email,
    displayName: displayName || email,
    // "MARTA" → "Marta": a note that shouts the reader's name reads as automated.
    firstName: first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : undefined,
    locale: (profile?.locale ?? undefined) as string | undefined,
  };
}

export async function loadReview(reviewId: string): Promise<ReviewDetails | null> {
  const sb = await admin();
  const { data: r } = await sb
    .from("bereavement_reviews")
    .select("*")
    .eq("id", reviewId)
    .maybeSingle();
  if (!r) return null;
  const { data: birds } = await sb
    .from("birds")
    .select("id, name, owner_id, passed_at, created_at")
    .in("id", r.bird_ids);
  const list = (birds ?? []) as Bird[];
  const c = await ownerContact(sb, r.owner_id);
  return {
    id: r.id,
    ownerId: r.owner_id,
    decision: r.decision,
    decidedAt: r.decided_at,
    birds: list,
    names: joinNames(list.map((b) => b.name)),
    ownerEmail: c.email,
    ownerName: c.displayName,
    firstName: c.firstName,
    locale: c.locale,
    pastLoss: list.some(
      (b) =>
        b.passed_at &&
        new Date(b.passed_at).getTime() - new Date(b.created_at).getTime() <
          PAST_LOSS_MINUTES * 60_000,
    ),
    inAppFor: list.map((b) => `${b.name}: ${humanGap(b.created_at, b.passed_at)}`),
  };
}

/** The note exactly as the owner would receive it. `names` above is for the
 *  English review email; the owner's note joins the names in their language
 *  ("Willow en Moxie", not "Willow and Moxie"). */
export async function buildNoteFor(d: ReviewDetails) {
  const { buildBereavementEmail } = await import("@/lib/emailTemplates");
  const { joinNamesLocalized } = await import("@/lib/emailLocale.server");
  const birdNames = d.birds.map((b) => b.name);
  return buildBereavementEmail({
    firstName: d.firstName,
    birdName: joinNamesLocalized(birdNames, d.locale, "bird"),
    birdCount: birdNames.length,
    locale: d.locale,
  });
}

function founderEmailHtml(
  d: ReviewDetails,
  note: { subject: string; html: string },
  url: string,
): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const flag = d.pastLoss
    ? `<p style="margin:0 0 14px;padding:10px 12px;background:#f6e7c4;border-radius:8px;color:#854f0b;font-size:14px;line-height:1.5;"><b>Likely a past loss.</b> This bird was marked as passed minutes after being added, so the owner may be recording a bird they lost a while ago.</p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a3d2e;max-width:560px;margin:0 auto;padding:20px;">
  <p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5a8c7a;">Bereavement note waiting for you</p>
  <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;">${esc(d.ownerName)} marked ${esc(d.names)} as passed</h1>
  ${flag}
  <table style="font-size:14px;line-height:1.6;margin:0 0 16px;border-collapse:collapse;">
    <tr><td style="padding:2px 12px 2px 0;color:#5b6b61;">Owner</td><td>${esc(d.ownerName)} · ${esc(d.ownerEmail)}</td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#5b6b61;">In the app for</td><td>${esc(d.inAppFor.join("; "))}</td></tr>
  </table>
  <p style="margin:0 0 18px;"><a href="${url}" style="display:inline-block;background:#1a3d2e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">Review and send</a></p>
  <p style="margin:0 0 8px;font-size:13px;color:#5b6b61;">Nothing goes to ${esc(d.ownerName)} until you press Send on that page. Here is the note they would get:</p>
  <div style="border:1px solid #e3ded0;border-radius:12px;overflow:hidden;">
    <p style="margin:0;padding:10px 14px;background:#efe9da;font-size:13px;"><b>Subject:</b> ${esc(note.subject)}</p>
    ${note.html}
  </div>
</div>`;
}

/**
 * Queue a review for every passed bird that has neither been sent a note nor
 * been reviewed, one review per owner, and email Brittany about each. Safe to
 * call repeatedly: a bird already in a review row is never queued again.
 * Pass birdIds to limit it to just-marked birds (the markBirdPassed path).
 */
export async function queueBereavementReviews(
  opts: { birdIds?: string[] } = {},
): Promise<{ queued: number; notified: number }> {
  const sb = await admin();
  let q = sb
    .from("birds")
    .select("id, name, owner_id, passed_at, created_at")
    .not("passed_at", "is", null)
    .gte("passed_at", BEREAVEMENT_LAUNCH);
  if (opts.birdIds?.length) q = q.in("id", opts.birdIds);
  const { data: birds, error } = await q;
  if (error) throw new Error(error.message);
  if (!birds?.length) return { queued: 0, notified: 0 };

  const ids = (birds as Bird[]).map((b) => b.id);
  const [{ data: sent }, { data: reviewed }] = await Promise.all([
    sb.from("bereavement_email_log").select("bird_id").in("bird_id", ids),
    sb.from("bereavement_reviews").select("bird_ids").overlaps("bird_ids", ids),
  ]);
  const done = new Set<string>([
    ...((sent ?? []) as Array<{ bird_id: string }>).map((r) => r.bird_id),
    ...((reviewed ?? []) as Array<{ bird_ids: string[] }>).flatMap((r) => r.bird_ids),
  ]);

  const byOwner = new Map<string, Bird[]>();
  for (const b of birds as Bird[]) {
    if (done.has(b.id)) continue;
    byOwner.set(b.owner_id, [...(byOwner.get(b.owner_id) ?? []), b]);
  }

  const { sendTransactionalEmail, founderReplyTo } = await import("@/lib/brevoEmail.server");
  let queued = 0;
  let notified = 0;
  for (const [ownerId, list] of byOwner) {
    const { data: row, error: insErr } = await sb
      .from("bereavement_reviews")
      .insert({ owner_id: ownerId, bird_ids: list.map((b) => b.id) })
      .select("id")
      .single();
    if (insErr || !row) {
      console.error("[bereavement-review] queue failed", ownerId, insErr?.message);
      continue;
    }
    queued += 1;
    const d = await loadReview(row.id);
    if (!d) continue;
    const note = await buildNoteFor(d);
    const url = reviewUrl(d.id);
    const res = await sendTransactionalEmail({
      to: founderReplyTo().email,
      toName: "Brittany",
      subject: `Review: ${d.ownerName} marked ${d.names} as passed${d.pastLoss ? " (likely a past loss)" : ""}`,
      htmlContent: founderEmailHtml(d, note, url),
      textContent: `${d.ownerName} (${d.ownerEmail}) marked ${d.names} as passed.\nIn the app for: ${d.inAppFor.join("; ")}\n\nReview and send: ${url}\n\nNothing goes out until you press Send.`,
      tag: "bereavement_review",
    });
    if (res.ok) notified += 1;
    // A failed notify still leaves the review queued; it shows up on the next
    // cron run's "waiting" count and the link can be re-sent from the logs.
    else console.error("[bereavement-review] notify failed", d.id, res);
  }
  return { queued, notified };
}

/** Send the reviewed note to the owner and record it. Idempotent: a review
 *  that already has a decision is left alone. */
export async function decideReview(
  reviewId: string,
  decision: "send" | "skip",
): Promise<{ ok: boolean; message: string }> {
  const sb = await admin();
  const d = await loadReview(reviewId);
  if (!d) return { ok: false, message: "This review no longer exists." };
  if (d.decision)
    return {
      ok: true,
      message:
        d.decision === "send"
          ? "This note was already sent."
          : "You already chose not to send this note.",
    };

  // Claim the decision first, so a double-click can't send twice: only the
  // request whose update matches decision IS NULL goes on to send.
  const { data: claimed } = await sb
    .from("bereavement_reviews")
    .update({ decision, decided_at: new Date().toISOString() })
    .eq("id", reviewId)
    .is("decision", null)
    .select("id");
  if (!claimed?.length) return { ok: true, message: "This review was already decided." };

  if (decision === "skip")
    return { ok: true, message: `Not sent. ${d.ownerName} won't receive a note about ${d.names}.` };

  if (!d.ownerEmail) return { ok: false, message: "This owner has no email address on file." };
  const note = await buildNoteFor(d);
  const { sendTransactionalEmail, founderReplyTo } = await import("@/lib/brevoEmail.server");
  const res = await sendTransactionalEmail({
    to: d.ownerEmail,
    toName: d.ownerName,
    subject: note.subject,
    htmlContent: note.html,
    textContent: note.text,
    replyTo: founderReplyTo(),
    tag: "bereavement",
  });
  if (!res.ok) {
    // Release the claim so the button works again.
    await sb
      .from("bereavement_reviews")
      .update({ decision: null, decided_at: null })
      .eq("id", reviewId);
    return { ok: false, message: "The email didn't go out. Try again in a minute." };
  }
  const { error: logErr } = await sb
    .from("bereavement_email_log")
    .insert(d.birds.map((b) => ({ bird_id: b.id, owner_id: d.ownerId })));
  if (logErr) console.error("[bereavement-review] log insert failed", reviewId, logErr.message);
  return { ok: true, message: `Sent to ${d.ownerName}. Replies come to you.` };
}
