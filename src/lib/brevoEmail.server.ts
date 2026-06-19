/**
 * Server-only Brevo transactional email sender.
 *
 * Used for owner alerts (e.g. a sitter flags a health concern on the daily
 * scan). Imported dynamically inside server-function handlers so the API key
 * never reaches the client bundle.
 *
 * Required Vercel env vars (server-side):
 *   BREVO_API_KEY       same key used by the capture-lead edge function
 *   BREVO_SENDER_EMAIL  a sender verified in Brevo (Senders, Domains & Dedicated IPs)
 *   BREVO_SENDER_NAME   optional display name (defaults to "The Kya Project")
 *
 * Returns a result object instead of throwing so callers can fire-and-forget
 * without ever breaking the primary action (the scan still logs if email fails).
 */

const BREVO_SMTP_URL = "https://api.brevo.com/v3/smtp/email";

export interface TransactionalEmail {
  to: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export async function sendTransactionalEmail(
  email: TransactionalEmail,
): Promise<{ ok: boolean; skipped?: string; status?: number }> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "The Kya Project";
  if (!apiKey) { console.warn("[brevoEmail] skipped: BREVO_API_KEY not set"); return { ok: false, skipped: "brevo-api-key-not-configured" }; }
  if (!senderEmail) { console.warn("[brevoEmail] skipped: BREVO_SENDER_EMAIL not set"); return { ok: false, skipped: "brevo-sender-not-configured" }; }
  if (!email.to) { console.warn("[brevoEmail] skipped: no recipient"); return { ok: false, skipped: "no-recipient" }; }

  try {
    const res = await fetch(BREVO_SMTP_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: email.to, name: email.toName || undefined }],
        subject: email.subject,
        htmlContent: email.htmlContent,
        textContent: email.textContent,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("[brevoEmail] send failed", res.status, text);
      return { ok: false, status: res.status };
    }
    console.log("[brevoEmail] sent ok", res.status, "to", email.to);
    return { ok: true, status: res.status };
  } catch (err) {
    console.error("[brevoEmail] network error", err);
    return { ok: false, skipped: "network-error" };
  }
}
