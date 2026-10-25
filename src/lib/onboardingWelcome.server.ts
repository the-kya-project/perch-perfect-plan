/**
 * Build and send the onboarding welcome to one account. Shared by the
 * onboarding-welcome hook (the real sends, an hour after confirmation) and the
 * daily onboarding-emails hook (its testSend and resend modes), so both send
 * exactly the same email. Server only: imported dynamically from the routes.
 */
import { realFirstName, realFullName } from "./personName";
import { lifecycleLocaleFor } from "./emailLocale.server";
import { unsubUrl, unsubHeaders } from "./unsubscribe";
import { buildWelcomeEmail } from "./flockEmails";
import { sendTransactionalEmail, founderReplyTo } from "./brevoEmail.server";
import type { CtaVariant } from "./onboardingPlan";

export type WelcomeProfile = {
  email: string | null;
  display_name: string | null;
  first_name: string | null;
  full_name: string | null;
  locale: string | null;
};

export async function sendWelcomeEmail(opts: {
  supabaseAdmin: any;
  appUrl: string;
  userId: string;
  /** The address to send to (profiles.email, else the auth address). */
  to: string;
  profile: WelcomeProfile | undefined;
  /** 'standard' if they have a bird at send time, else 'no_bird'. */
  ctaVariant: CtaVariant;
  test?: boolean;
}) {
  const { supabaseAdmin, appUrl, userId, to, profile, ctaVariant, test = false } = opts;
  // A real first name or none: never the part of the address before the @.
  const firstName = profile ? realFirstName(profile, to, profile.email) : undefined;
  const toName = profile ? realFullName([profile.full_name, profile.display_name], to, profile.email) ?? undefined : undefined;
  // profiles.locale, else the language their auth emails used.
  const locale = await lifecycleLocaleFor(supabaseAdmin, userId, profile?.locale);
  const built = buildWelcomeEmail({
    firstName,
    link: appUrl,
    hasBird: ctaVariant === "standard",
    addBirdLink: `${appUrl}/birds/new`,
    locale,
    unsubscribeUrl: unsubUrl(appUrl, userId, "onboarding"),
  });
  const res = await sendTransactionalEmail({
    to,
    toName,
    subject: built.subject,
    htmlContent: built.html,
    textContent: built.text,
    // Signed by Brittany and asks for a reply.
    replyTo: founderReplyTo(),
    headers: unsubHeaders(appUrl, userId, "onboarding"),
    tag: test ? "qa_preview" : "welcome",
    clicks: { userId, variant: ctaVariant, email: "welcome", test },
  });
  return { ...res, locale, subject: built.subject };
}
