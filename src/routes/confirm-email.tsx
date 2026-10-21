import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { CheckEmailView } from "@/components/CheckEmailView";
import { K } from "@/components/kya";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

// Persistent "check your email" screen shown after a signup that requires email
// confirmation. Unlike a toast, it stays put until the owner confirms. The email
// they signed up with is stashed in sessionStorage (not the URL — it's personal
// data) by the auth page right before navigating here.
export const PENDING_EMAIL_KEY = "ppc_pending_confirm_email";
const RESEND_UNTIL_KEY = "ppc_confirm_resend_until";
const RESEND_COOLDOWN_S = 30;
const SENT_FLASH_MS = 2500;

export const Route = createFileRoute("/confirm-email")({
  head: () => ({ meta: [{ title: i18next.t("confirmEmail.pageTitle", "Confirm your email — Kya & Co.") }] }),
  component: ConfirmEmail,
});

function readEmail(): string {
  try { return window.sessionStorage.getItem(PENDING_EMAIL_KEY) ?? ""; } catch { return ""; }
}
function readResendUntil(): number {
  try { return Number(window.sessionStorage.getItem(RESEND_UNTIL_KEY) ?? "0") || 0; } catch { return 0; }
}
function writeResendUntil(ts: number) {
  try { window.sessionStorage.setItem(RESEND_UNTIL_KEY, String(ts)); } catch {}
}

function ConfirmEmail() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email] = useState(readEmail);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const proceeded = useRef(false);

  // No pending email (e.g. opened this URL directly) → nothing to confirm.
  useEffect(() => {
    if (!email) navigate({ to: "/auth", search: { mode: "signup" as const }, replace: true });
  }, [email, navigate]);

  // Recognize confirmation and move on. The owner clicks the link in their email
  // (which opens /welcome in a new tab and establishes the session); supabase-js
  // syncs that session across tabs, so this tab sees SIGNED_IN and proceeds too.
  // We also re-check whenever the tab regains focus, as a belt-and-suspenders.
  useEffect(() => {
    const proceed = () => {
      if (proceeded.current) return;
      proceeded.current = true;
      try { window.sessionStorage.removeItem(PENDING_EMAIL_KEY); } catch {}
      navigate({ to: "/welcome", replace: true });
    };
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) proceed();
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) proceed();
    });
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [navigate]);

  // Resend cooldown countdown. Seed from sessionStorage so a refresh keeps it,
  // and start with a cooldown since signup just sent the first email.
  useEffect(() => {
    if (readResendUntil() === 0) writeResendUntil(Date.now() + RESEND_COOLDOWN_S * 1000);
    const tick = () => setCooldown(Math.max(0, Math.ceil((readResendUntil() - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  // "Sent" shows on the button for a moment after a resend, then the countdown.
  useEffect(() => {
    if (!justSent) return;
    const id = window.setTimeout(() => setJustSent(false), SENT_FLASH_MS);
    return () => window.clearTimeout(id);
  }, [justSent]);

  async function resend() {
    if (cooldown > 0 || resending || !email) return;
    setResending(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      writeResendUntil(Date.now() + RESEND_COOLDOWN_S * 1000);
      setCooldown(RESEND_COOLDOWN_S);
      setJustSent(true);
    } catch (err: any) {
      setError(authErrorMessage(err, t("confirmEmail.couldNotResend", "Couldn't resend. Try again in a moment.")));
    } finally {
      setResending(false);
    }
  }

  function useDifferentEmail() {
    try {
      window.sessionStorage.removeItem(PENDING_EMAIL_KEY);
      window.sessionStorage.removeItem(RESEND_UNTIL_KEY);
    } catch {}
    navigate({ to: "/auth", search: { mode: "signup" as const }, replace: true });
  }

  return (
    <CheckEmailView
      email={email}
      kind="signup"
      onBack={useDifferentEmail}
      onResend={resend}
      resending={resending}
      cooldown={cooldown}
      justSent={justSent}
      error={error}
      onUseDifferentEmail={useDifferentEmail}
      footer={
        <p className="m-0 mt-2 text-[12.5px]" style={{ color: K.quiet }}>
          {t("confirmEmail.alreadyConfirmed", "Already confirmed?")}{" "}
          <Link to="/auth" search={{ mode: "signin" as const }} className="inline-flex min-h-[44px] items-center font-[700]" style={{ color: K.moss }}>
            {t("confirmEmail.signIn", "Sign in")}
          </Link>
        </p>
      }
    />
  );
}
