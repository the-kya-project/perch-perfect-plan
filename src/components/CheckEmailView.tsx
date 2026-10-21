// "Check your email": shown after a sign-up that needs email confirmation
// (/confirm-email) and after a password reset link is sent (/auth, forgot
// password). Forest header with back + logo, a centered mist body with the
// envelope tile, the address in bold, and Open email app / Send it again /
// Use a different email.
import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, Mail } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { K, KyaHeading, KyaLink, KyaPrimaryButton, KyaSecondaryButton } from "@/components/kya";
import { FrontDoorBody, FrontDoorError, FrontDoorHeader, FrontDoorPage } from "@/components/frontDoor";
import { nativePlatform } from "@/lib/nativeApp";

type MailTarget = { href: string; newTab: boolean };

/** The big webmail inboxes, by the address's domain. On a desktop these open
 *  the actual inbox in a new tab, which beats mailto: (a blank compose window,
 *  and nothing at all when no desktop mail app is set up). */
const WEBMAIL: [RegExp, string][] = [
  [/^(gmail|googlemail)\.com$/, "https://mail.google.com/mail/u/0/#inbox"],
  [/^(outlook|hotmail|live|msn)\.[a-z.]+$/, "https://outlook.live.com/mail/0/inbox"],
  [/^(yahoo|ymail)\.[a-z.]+$/, "https://mail.yahoo.com/"],
  [/^(icloud|me|mac)\.com$/, "https://www.icloud.com/mail"],
  [/^aol\.com$/, "https://mail.aol.com/"],
  [/^(proton\.me|protonmail\.com|pm\.me)$/, "https://mail.proton.me/"],
];

/** Where "Open email app" goes. There's always somewhere to go, so it's
 *  always the one sunflower button:
 *  - iOS (app or Safari): message:// opens Mail's inbox.
 *  - Android browser: Chrome resolves the APP_EMAIL intent to the default mail app.
 *  - Android app shell: mailto:. Capacitor hands non-app URLs to ACTION_VIEW,
 *    which can't resolve an intent:// URI but does open the default mail app
 *    for mailto:.
 *  - Desktop: the webmail inbox for the big providers, otherwise mailto:,
 *    which opens the default mail client. */
function mailTarget(email: string): MailTarget {
  const mailto = { href: "mailto:", newTab: false };
  if (typeof window === "undefined") return mailto;
  const platform = nativePlatform();
  if (platform === "ios") return { href: "message://", newTab: false };
  if (platform === "android") return mailto;
  const ua = window.navigator.userAgent;
  const iOSWeb = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);
  if (iOSWeb) return { href: "message://", newTab: false };
  if (/Android/i.test(ua)) return { href: "intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.APP_EMAIL;end", newTab: false };
  const domain = email.split("@")[1]?.trim().toLowerCase() ?? "";
  const webmail = WEBMAIL.find(([re]) => re.test(domain))?.[1];
  return webmail ? { href: webmail, newTab: true } : mailto;
}

export function CheckEmailView({ email, kind, message, onBack, onResend, resending, cooldown, justSent, error, onUseDifferentEmail, footer }: {
  email: string;
  kind: "signup" | "reset";
  /** Replaces the "We sent a link to …" line, for screens that say where the
   *  link leads (the invite and handoff accept screens). */
  message?: ReactNode;
  onBack: () => void;
  onResend: () => void;
  resending: boolean;
  /** Seconds until another send is allowed. */
  cooldown: number;
  /** True for a moment after a resend succeeds, to show "Sent". */
  justSent: boolean;
  error?: ReactNode;
  /** Left out where the address is fixed (an invite or handoff goes to one email). */
  onUseDifferentEmail?: () => void;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  // Read after mount: the server can't know the platform. The button itself
  // renders the same everywhere (only where it goes changes), so the server
  // and client HTML agree and there's no flash of a different main button.
  const [mail, setMail] = useState<MailTarget>({ href: "mailto:", newTab: false });
  useEffect(() => setMail(mailTarget(email)), [email]);
  const openMail = () => {
    if (mail.newTab) window.open(mail.href, "_blank", "noopener,noreferrer");
    else window.location.href = mail.href;
  };

  const resendLabel = resending
    ? t("checkEmail.sending", "Sending…")
    : justSent
      ? t("checkEmail.sent", "Sent")
      : cooldown > 0
        ? t("checkEmail.sendAgainIn", "Send it again ({{cooldown}}s)", { cooldown })
        : t("checkEmail.sendAgain", "Send it again");
  const resendIcon = resending
    ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
    : justSent ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : undefined;

  return (
    <FrontDoorPage>
      <FrontDoorHeader onBack={onBack} />
      <FrontDoorBody className="items-center pt-9 text-center">
        <span className="grid size-[72px] place-items-center rounded-[20px]" style={{ background: K.forest, color: K.lime }} aria-hidden="true">
          <Mail className="size-8" strokeWidth={2} />
        </span>
        <KyaHeading as="h1" size={28} className="mt-1">{t("checkEmail.title", "Check your email")}</KyaHeading>
        <p className="m-0 max-w-[340px] text-[15px] leading-[1.5]" style={{ color: K.ink }}>
          {message ?? (kind === "signup" ? (
            <Trans
              i18nKey="checkEmail.sentLinkSignup"
              defaults="We sent a link to <b>{{email}}</b>. Tap it to finish signing up."
              values={{ email }}
              components={{ b: <strong className="font-[700] [overflow-wrap:anywhere]" style={{ color: K.forest }} /> }}
            />
          ) : (
            <Trans
              i18nKey="checkEmail.sentLinkReset"
              defaults="We sent a link to <b>{{email}}</b>. Tap it to set a new password."
              values={{ email }}
              components={{ b: <strong className="font-[700] [overflow-wrap:anywhere]" style={{ color: K.forest }} /> }}
            />
          ))}
        </p>
        <p className="m-0 max-w-[340px] text-[13.5px] leading-[1.45]" style={{ color: K.quiet }}>
          {t("checkEmail.canTakeAMinute", "It can take a minute. Check spam if it isn't there.")}
        </p>

        {error && <div className="w-full text-left"><FrontDoorError>{error}</FrontDoorError></div>}

        <div className="mt-2 flex w-full flex-col gap-3">
          {/* The one sunflower button, in every state: always tappable, so
              the resend cooldown never leaves a disabled main button with
              nothing else to tap. Send it again stays the white secondary. */}
          <KyaPrimaryButton onClick={openMail}>
            {t("checkEmail.openEmailApp", "Open email app")}
          </KyaPrimaryButton>
          <KyaSecondaryButton
            className="w-full"
            onClick={onResend}
            disabled={resending || cooldown > 0 || justSent}
            icon={resendIcon}
          >
            {resendLabel}
          </KyaSecondaryButton>
          {onUseDifferentEmail && (
            <div className="flex justify-center">
              <KyaLink onClick={onUseDifferentEmail}>{t("checkEmail.useDifferentEmail", "Use a different email")}</KyaLink>
            </div>
          )}
        </div>
        {footer}
      </FrontDoorBody>
    </FrontDoorPage>
  );
}
