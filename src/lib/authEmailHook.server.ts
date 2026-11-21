/**
 * Supabase "Send Email" auth hook: Supabase hands every auth email (signup
 * confirmation, password reset, email change, …) to us instead of sending it,
 * and we send it through Brevo in the user's language.
 *
 * Why: the dashboard templates can't read profiles.locale, so they were
 * English-only. Here the language comes from profiles.locale (the same source
 * every other email uses), falling back to user_metadata.locale, which signUp
 * sets because the profile row isn't committed yet when the signup email goes
 * out (GoTrue sends it inside the signup transaction).
 *
 * Supabase signs each request the Standard Webhooks way. The secret is
 * SEND_EMAIL_HOOK_SECRET, copied from Auth → Hooks ("v1,whsec_<base64>").
 *
 * Failure contract: a non-2xx response makes Supabase fail the auth action and
 * show an error, exactly as an SMTP failure did. So only a real send failure
 * returns an error; a reserved test address (@example.com QA accounts) is
 * skipped with a 200 so those signups still go through.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { buildAuthEmail, type AuthEmailKind } from "./emailTemplates";
import type { EmailTag } from "./emailTracking";
import { APP_LINK_HOST } from "./appLinks";

export type SendEmailHookPayload = {
  user: {
    id: string;
    email: string;
    new_email?: string;
    user_metadata?: Record<string, unknown>;
  };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new: string;
    token_hash_new: string;
  };
};

// ── Signature (Standard Webhooks) ────────────────────────────────────────────

const TOLERANCE_SECONDS = 5 * 60;

/** Verify a Standard Webhooks signature. `secret` is the dashboard value,
 *  "v1,whsec_<base64>" (the prefix is optional). Returns false on any
 *  mismatch, malformed header or a timestamp outside ±5 minutes. */
export function verifyHookSignature(
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  // The header can carry several space-separated "v1,<base64>" signatures
  // (during a secret rotation). Any one matching is enough.
  return signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// ── Which emails to send ─────────────────────────────────────────────────────

export type PlannedAuthEmail = {
  to: string;
  kind: AuthEmailKind;
  tag: EmailTag;
  link?: string;
  code?: string;
  newEmail?: string;
};

/** The /auth/v1/verify link — what {{ .ConfirmationURL }} expanded to in the
 *  dashboard templates. Used only when the link isn't headed back to the app
 *  (see appVerifyUrl). */
export function verifyUrl(supabaseUrl: string, tokenHash: string, type: string, redirectTo: string): string {
  const base = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/verify`;
  const q = new URLSearchParams({ token: tokenHash, type });
  if (redirectTo) q.set("redirect_to", redirectTo);
  return `${base}?${q.toString()}`;
}

/**
 * Our own /verify page, when Supabase was asked to send the person back to the
 * app (redirect_to on app.thekyaproject.com); null otherwise.
 *
 * Why not Supabase's link: it redirects back with a PKCE ?code= that only the
 * browser that started the sign-up can exchange, and iOS never opens an app
 * from another site's redirect. /verify is on our domain, so it's a Universal
 * Link (the app opens it when installed, the browser otherwise), and it redeems
 * the token_hash itself, which works in any browser or the app. `next` is the
 * page redirect_to named, kept as a path so the link can't leave our site.
 */
export function appVerifyUrl(tokenHash: string, type: string, redirectTo: string): string | null {
  let r: URL;
  try {
    r = new URL(redirectTo);
  } catch {
    return null;
  }
  if (r.protocol !== "https:" || r.hostname !== APP_LINK_HOST) return null;
  const q = new URLSearchParams({ token_hash: tokenHash, type });
  const next = `${r.pathname}${r.search}`;
  if (next !== "/") q.set("next", next);
  return `https://${APP_LINK_HOST}/verify?${q.toString()}`;
}

/**
 * Turn a hook payload into the email(s) to send. Usually one; an email change
 * with Secure Email Change on is two (current and new address).
 *
 * Unhandled action types (the security notifications, all off in the
 * dashboard today) return [] — logged by the caller, never a failure.
 */
export function planAuthEmails(p: SendEmailHookPayload, supabaseUrl: string): PlannedAuthEmail[] {
  const d = p.email_data;
  const link = (hash: string, type = d.email_action_type) =>
    appVerifyUrl(hash, type, d.redirect_to) ?? verifyUrl(supabaseUrl, hash, type, d.redirect_to);

  switch (d.email_action_type) {
    case "signup":
      return [{ to: p.user.email, kind: "signup", tag: "auth_signup", link: link(d.token_hash) }];
    case "recovery":
      return [{ to: p.user.email, kind: "recovery", tag: "auth_recovery", link: link(d.token_hash) }];
    case "invite":
      return [{ to: p.user.email, kind: "invite", tag: "auth_invite", link: link(d.token_hash) }];
    case "magiclink":
    case "email":
      return [{ to: p.user.email, kind: "magiclink", tag: "auth_magiclink", link: link(d.token_hash, "magiclink") }];
    case "reauthentication":
      return [{ to: p.user.email, kind: "reauthentication", tag: "auth_reauthentication", code: d.token }];
    case "email_change": {
      // Supabase's field names are reversed for backward compatibility:
      // token_hash goes with the NEW address, token_hash_new with the CURRENT.
      const newEmail = p.user.new_email || "";
      const out: PlannedAuthEmail[] = [];
      if (d.token_hash && newEmail) {
        out.push({ to: newEmail, kind: "emailChangeNew", tag: "auth_email_change", link: link(d.token_hash), newEmail });
      }
      if (d.token_hash_new && p.user.email) {
        out.push({ to: p.user.email, kind: "emailChangeCurrent", tag: "auth_email_change", link: link(d.token_hash_new), newEmail });
      }
      return out;
    }
    default:
      return [];
  }
}

// ── Language ─────────────────────────────────────────────────────────────────

/** profiles.locale when it's set; otherwise user_metadata.locale (set at
 *  signUp); otherwise English. Never throws. */
export async function authEmailLocale(sb: any, user: SendEmailHookPayload["user"]): Promise<string | undefined> {
  try {
    const { data } = await sb.from("profiles").select("locale").eq("id", user.id).maybeSingle();
    const saved = (data as { locale?: unknown } | null)?.locale;
    if (typeof saved === "string" && saved) return saved;
  } catch {
    /* fall through to metadata */
  }
  const meta = user.user_metadata?.locale;
  return typeof meta === "string" ? meta : undefined;
}

// ── Send ─────────────────────────────────────────────────────────────────────

export async function sendAuthEmails(
  planned: PlannedAuthEmail[],
  locale: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { sendTransactionalEmail } = await import("./brevoEmail.server");
  for (const e of planned) {
    const built = buildAuthEmail({ kind: e.kind, link: e.link, code: e.code, newEmail: e.newEmail, locale });
    const res = await sendTransactionalEmail({
      to: e.to,
      subject: built.subject,
      htmlContent: built.html,
      textContent: built.text,
      tag: e.tag,
    });
    if (!res.ok && res.skipped !== "undeliverable-test-domain") {
      return { ok: false, error: res.skipped ?? `brevo-${res.status ?? "error"}` };
    }
  }
  return { ok: true };
}
