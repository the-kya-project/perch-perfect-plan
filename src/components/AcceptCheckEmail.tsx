// "Check your email" for the invite and handoff accept screens, after a new
// account needs its email confirmed. Same screen as /confirm-email
// (CheckEmailView): send it again with a cooldown, a way back to the invite or
// handoff, and sign in for someone who already confirmed. The confirmation
// link brings them back to the accept screen, already signed in.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { CheckEmailView } from "@/components/CheckEmailView";
import { K } from "@/components/kya";

/** Matches /confirm-email: signup just sent the first email. */
const RESEND_COOLDOWN_S = 30;
const SENT_FLASH_MS = 2500;

export function AcceptCheckEmail({ email, returnPath, message, onBack }: {
  email: string;
  /** The accept screen ("/invite/<token>"): where the confirmation link and sign in come back to. */
  returnPath: string;
  message: ReactNode;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const resendUntil = useRef(Date.now() + RESEND_COOLDOWN_S * 1000);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => setCooldown(Math.max(0, Math.ceil((resendUntil.current - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!justSent) return;
    const id = window.setTimeout(() => setJustSent(false), SENT_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [justSent]);

  async function resend() {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: window.location.origin + returnPath },
      });
      if (error) throw error;
      resendUntil.current = Date.now() + RESEND_COOLDOWN_S * 1000;
      setCooldown(RESEND_COOLDOWN_S);
      setJustSent(true);
    } catch (err) {
      setError(authErrorMessage(err, t("confirmEmail.couldNotResend", "Couldn't resend. Try again in a moment.")));
    } finally {
      setResending(false);
    }
  }

  return (
    <CheckEmailView
      email={email}
      kind="signup"
      message={message}
      onBack={onBack}
      onResend={() => void resend()}
      resending={resending}
      cooldown={cooldown}
      justSent={justSent}
      error={error}
      footer={
        <p className="m-0 mt-2 text-[12.5px]" style={{ color: K.quiet }}>
          <Trans
            i18nKey="checkEmail.alreadyConfirmedSignIn"
            defaults="Already confirmed? <go>Sign in</go>"
            components={{ go: <Link to="/auth" search={{ mode: "signin", redirect: returnPath }} className="inline-flex min-h-[44px] items-center font-[700]" style={{ color: K.moss }} /> }}
          />
        </p>
      }
    />
  );
}
