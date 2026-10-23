/**
 * Gift membership emails: the buyer's receipt and the recipient's gift email.
 *
 * Both are built on the Flock Club shell and sent through
 * sendTransactionalEmail, which refuses to send from a preview deployment.
 * Neither offers an unsubscribe link: they are receipts for a purchase, not a
 * mailing list.
 *
 * deliverGiftEmails() is the single entry point, called by the Stripe webhook
 * right after a purchase is recorded and by the daily gift-emails cron. Each
 * email is CLAIMED before it is sent (its *_emailed_at column is set only if it
 * was null), so a webhook delivered twice, or the cron running while a webhook
 * is mid-flight, sends it once. A failed send releases the claim so the next
 * run tries again.
 */
import { flockShell, type FlockBlock } from "./flockClub";
import { escapeHtml, type BuiltEmail } from "./emailTemplates";
import { emailT } from "./i18n/emailI18n.server";
import { founderReplyTo, sendTransactionalEmail } from "./brevoEmail.server";
import { formatCents, formatGiftDate, giftToday, type GiftPlan } from "./gifts";

const APP_URL = "https://app.thekyaproject.com";

export type GiftRow = {
  id: string;
  plan: GiftPlan;
  buyer_email: string;
  buyer_name: string | null;
  recipient_name: string;
  recipient_email: string | null;
  message: string | null;
  send_on: string | null;
  amount_paid_cents: number;
  promo_code: string | null;
  giving_rate: number | string;
  gift_code: string;
  status: string;
  buyer_emailed_at: string | null;
  recipient_emailed_at: string | null;
};

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

function planWords(t: ReturnType<typeof emailT>, plan: GiftPlan) {
  return plan === "flock_year"
    ? { plan: t("email.gift.planFlock"), badge: t("email.gift.badgeFlock"), timing: t("email.gift.timingFlock") }
    : { plan: t("email.gift.planPremium"), badge: t("email.gift.badgePremium"), timing: t("email.gift.timingPremium") };
}

/** Message text, escaped, with the buyer's line breaks kept. */
const messageHtml = (m: string) => escapeHtml(m).replace(/\r?\n/g, "<br>");

export function buildGiftReceiptEmail(g: GiftRow): BuiltEmail {
  const t = emailT("en");
  const w = planWords(t, g.plan);
  const recipient = escapeHtml(g.recipient_name);
  const first = escapeHtml(firstName(g.buyer_name));
  const redeemLink = `${APP_URL}/redeem`;
  const percent = Math.round(Number(g.giving_rate) * 100);

  const rows = [
    { label: t("email.gift.codeLabel"), value: g.gift_code },
    ...(g.recipient_email && g.send_on
      ? [{ label: t("email.gift.receipt.rowDelivery"), value: escapeHtml(formatGiftDate(g.send_on)) }]
      : []),
    { label: t("email.gift.receipt.rowPaid"), value: formatCents(g.amount_paid_cents) },
    ...(g.promo_code ? [{ label: t("email.gift.receipt.rowPromo"), value: escapeHtml(g.promo_code) }] : []),
  ];

  const blocks: FlockBlock[] = [
    { kind: "p", text: first ? t("email.gift.hi", { first }) : t("email.gift.hiNoName") },
    {
      kind: "p",
      text: g.recipient_email && g.send_on
        ? t("email.gift.receipt.introEmail", { recipient, plan: w.plan, date: escapeHtml(formatGiftDate(g.send_on)) })
        : t("email.gift.receipt.introSelf", { recipient, plan: w.plan }),
    },
    { kind: "summaryCard", title: t("email.gift.receipt.cardTitle", { recipient }), badge: w.badge, rows },
    ...(g.message ? [{ kind: "highlight" as const, title: t("email.gift.receipt.noteTitle"), body: messageHtml(g.message) }] : []),
    { kind: "p", text: t("email.gift.receipt.redeem", { recipient, link: redeemLink }) },
    { kind: "p", text: w.timing },
    { kind: "p", text: t("email.gift.receipt.giving", { percent }) },
    { kind: "p", text: t("email.gift.receipt.reply") },
    { kind: "signature" },
  ];

  return flockShell({
    headline: t("email.gift.receipt.headline"),
    preheader: t("email.gift.receipt.preview", { recipient }),
    pill: t("email.gift.receipt.pill"),
    blocks,
    footerWhy: t("email.gift.receipt.foot"),
    link: APP_URL,
    locale: "en",
  });
}

export function buildGiftRecipientEmail(g: GiftRow): BuiltEmail {
  const t = emailT("en");
  const w = planWords(t, g.plan);
  const buyer = (g.buyer_name ?? "").trim();
  const from = buyer ? escapeHtml(buyer) : t("email.gift.recipient.fromNobody");
  const redeemHref = `${APP_URL}/redeem?code=${encodeURIComponent(g.gift_code)}`;

  const blocks: FlockBlock[] = [
    { kind: "p", text: t("email.gift.hi", { first: escapeHtml(firstName(g.recipient_name)) || escapeHtml(g.recipient_name) }) },
    { kind: "lead", text: t("email.gift.recipient.intro", { from, plan: w.plan }) },
    { kind: "p", text: g.plan === "flock_year" ? t("email.gift.recipient.aboutFlock") : t("email.gift.recipient.aboutPremium") },
    ...(g.message
      ? [{
          kind: "highlight" as const,
          title: buyer ? t("email.gift.recipient.noteTitle", { from }) : t("email.gift.recipient.noteTitleNobody"),
          body: messageHtml(g.message),
        }]
      : []),
    { kind: "summaryCard", title: t("email.gift.recipient.cardTitle"), badge: w.badge, rows: [{ label: t("email.gift.codeLabel"), value: g.gift_code }] },
    { kind: "button", label: t("email.gift.recipient.cta"), href: redeemHref },
    { kind: "p", text: t("email.gift.recipient.howTo") },
    { kind: "p", text: w.timing },
    { kind: "signature" },
  ];

  return flockShell({
    headline: t("email.gift.recipient.headline"),
    preheader: t("email.gift.recipient.preview", { from, plan: w.plan }),
    pill: t("email.gift.recipient.pill"),
    blocks,
    footerWhy: buyer ? t("email.gift.recipient.foot", { from }) : t("email.gift.recipient.footNobody"),
    link: APP_URL,
    locale: "en",
  });
}

const GIFT_COLUMNS =
  "id, plan, buyer_email, buyer_name, recipient_name, recipient_email, message, send_on, amount_paid_cents, promo_code, giving_rate, gift_code, status, buyer_emailed_at, recipient_emailed_at";

type Admin = (typeof import("@/integrations/supabase/client.server"))["supabaseAdmin"];

/** Set `column` to now() only if it is still null. True when this caller won. */
async function claim(sb: Admin, id: string, column: "buyer_emailed_at" | "recipient_emailed_at"): Promise<boolean> {
  const { data, error } = await sb
    .from("gift_purchases")
    .update(column === "buyer_emailed_at" ? { buyer_emailed_at: new Date().toISOString() } : { recipient_emailed_at: new Date().toISOString() })
    .eq("id", id)
    .is(column, null)
    .select("id");
  if (error) throw new Error(`gift email claim failed: ${error.message}`);
  return (data ?? []).length === 1;
}

async function release(sb: Admin, id: string, column: "buyer_emailed_at" | "recipient_emailed_at") {
  await sb.from("gift_purchases").update(column === "buyer_emailed_at" ? { buyer_emailed_at: null } : { recipient_emailed_at: null }).eq("id", id);
}

export type DeliveryResult = { receipt: "sent" | "skipped" | "failed" | "already"; recipient: "sent" | "skipped" | "failed" | "already" | "not_due" | "none" };

/** Send whatever this gift still owes: the buyer's receipt, and the recipient's
 *  email once its date (Indianapolis) has come. Refunded gifts send nothing. */
export async function deliverGiftEmails(giftId: string): Promise<DeliveryResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: g, error } = await supabaseAdmin.from("gift_purchases").select(GIFT_COLUMNS).eq("id", giftId).maybeSingle();
  if (error) throw new Error(`gift lookup failed: ${error.message}`);
  if (!g) throw new Error(`gift ${giftId} not found`);
  const gift = g as unknown as GiftRow;
  const out: DeliveryResult = { receipt: "already", recipient: "none" };
  if (gift.status === "refunded") return { receipt: "skipped", recipient: "skipped" };

  if (!gift.buyer_emailed_at && (await claim(supabaseAdmin, gift.id, "buyer_emailed_at"))) {
    const built = buildGiftReceiptEmail(gift);
    const res = await sendTransactionalEmail({
      to: gift.buyer_email,
      toName: gift.buyer_name ?? undefined,
      subject: built.subject,
      htmlContent: built.html,
      textContent: built.text,
      replyTo: founderReplyTo(),
      tag: "gift_receipt",
    });
    // A deliberate skip (a preview, a reserved test domain) is final; only a
    // real failure is retried.
    if (res.ok) out.receipt = "sent";
    else if (res.skipped && res.skipped !== "network-error") out.receipt = "skipped";
    else { out.receipt = "failed"; await release(supabaseAdmin, gift.id, "buyer_emailed_at"); }
  }

  if (gift.recipient_email && gift.send_on && gift.status === "paid") {
    out.recipient = "already";
    if (gift.send_on > giftToday()) {
      out.recipient = "not_due";
    } else if (!gift.recipient_emailed_at && (await claim(supabaseAdmin, gift.id, "recipient_emailed_at"))) {
      const built = buildGiftRecipientEmail(gift);
      const res = await sendTransactionalEmail({
        to: gift.recipient_email,
        toName: gift.recipient_name,
        subject: built.subject,
        htmlContent: built.html,
        textContent: built.text,
        replyTo: founderReplyTo(),
        tag: "gift_recipient",
      });
      if (res.ok) out.recipient = "sent";
      else if (res.skipped && res.skipped !== "network-error") out.recipient = "skipped";
      else { out.recipient = "failed"; await release(supabaseAdmin, gift.id, "recipient_emailed_at"); }
    }
  }
  return out;
}
