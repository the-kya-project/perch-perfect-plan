import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

// Persistent "check your email" screen shown after a signup that requires email
// confirmation. Unlike a toast, it stays put until the owner confirms. The email
// they signed up with is stashed in sessionStorage (not the URL — it's personal
// data) by the auth page right before navigating here.
export const PENDING_EMAIL_KEY = "ppc_pending_confirm_email";
const RESEND_UNTIL_KEY = "ppc_confirm_resend_until";
const RESEND_COOLDOWN_S = 30;

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
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
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

  async function resend() {
    if (cooldown > 0 || resending || !email) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      writeResendUntil(Date.now() + RESEND_COOLDOWN_S * 1000);
      setCooldown(RESEND_COOLDOWN_S);
      toast.success(t("confirmEmail.sentAgain", "Confirmation email sent again."));
    } catch (err: any) {
      toast.error(authErrorMessage(err, t("confirmEmail.couldNotResend", "Couldn't resend. Try again in a moment.")));
    } finally {
      setResending(false);
    }
  }

  // The code in the email is the path that works inside the native apps. The
  // link opens in the phone's browser, which doesn't hold this app's PKCE
  // verifier, so its exchange fails there and the app never gets a session
  // (an Android owner was stranded this way on 2026-10-18). Verifying the code
  // here creates the session in this webview; onAuthStateChange above then
  // takes them to /welcome.
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length !== 6 || verifying || !email) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
      if (error) throw error;
    } catch (err: any) {
      // A wrong or stale code comes back as "Token has expired or is invalid"
      // (code otp_expired), which reads poorly and isn't translated.
      const badCode = err?.code === "otp_expired" || /token has expired or is invalid/i.test(err?.message ?? "");
      const fallback = t("confirmEmail.codeInvalid", "That code didn't work. Check it, or resend for a new one.");
      toast.error(badCode ? fallback : authErrorMessage(err, fallback));
      setVerifying(false);
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
    <div className="grid min-h-screen place-items-center bg-[#f4f1e8] px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center">
          <BrandLogo size="lg" />
        </div>

        <div className="mx-auto mt-8 grid size-14 place-items-center rounded-full bg-[#cdeab0]">
          <Mail className="size-7 text-[#1a3d2e]" />
        </div>

        <h1 className="mt-5 text-2xl font-medium leading-tight text-[#1a3d2e]">{t("confirmEmail.checkYourEmail", "Check your email")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#5f5e5a]">
          {t("confirmEmail.weSentCodeTo", "We sent a 6-digit code to")}
        </p>
        <p className="mt-1 break-all text-sm font-semibold text-[#1a3d2e]">{email}</p>
        <p className="mt-3 text-sm leading-relaxed text-[#5f5e5a]">
          {t("confirmEmail.enterCode", "Enter it below to activate your account.")}
        </p>

        <form onSubmit={verifyCode} className="mt-6">
          <label htmlFor="confirm-code" className="sr-only">
            {t("confirmEmail.codeLabel", "Confirmation code")}
          </label>
          <input
            id="confirm-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            placeholder="000000"
            className="w-full rounded-xl border border-[#d8d3c4] bg-white py-3 text-center font-mono text-2xl tracking-[0.4em] text-[#1a3d2e] placeholder:text-[#d8d3c4] focus:border-[#1a3d2e] focus:outline-none"
          />
          <button
            type="submit"
            disabled={code.length !== 6 || verifying}
            className="mt-3 w-full rounded-xl bg-[#1a3d2e] py-3 text-sm font-medium text-white active:scale-[0.99] disabled:opacity-50"
          >
            {verifying ? t("confirmEmail.verifying", "Checking…") : t("confirmEmail.verify", "Confirm")}
          </button>
        </form>

        <p className="mt-4 text-xs leading-relaxed text-[#5f5e5a]">
          {t("confirmEmail.checkSpam", "Don't see it? Check your spam or junk folder — and give it a minute to arrive.")}
        </p>

        <button
          onClick={resend}
          disabled={cooldown > 0 || resending}
          className="mt-4 w-full rounded-xl border border-[#1a3d2e] py-3 text-sm font-medium text-[#1a3d2e] active:scale-[0.99] disabled:opacity-50"
        >
          {resending ? t("confirmEmail.sending", "Sending…") : cooldown > 0 ? t("confirmEmail.resendCooldown", "Resend email ({{cooldown}}s)", { cooldown }) : t("confirmEmail.resend", "Didn't get it? Resend email")}
        </button>

        <p className="mt-4 text-xs text-[#5f5e5a]">
          {t("confirmEmail.wrongEmail", "Wrong email address?")}{" "}
          <button onClick={useDifferentEmail} className="font-medium text-[#1a3d2e] underline">
            {t("confirmEmail.goBackAndFix", "Go back and fix it")}
          </button>
        </p>

        <p className="mt-6 text-[11px] text-[#5f5e5a]">
          {t("confirmEmail.alreadyConfirmed", "Already confirmed?")}{" "}
          <Link to="/auth" search={{ mode: "signin" as const }} className="font-medium underline">
            {t("confirmEmail.signIn", "Sign in")}
          </Link>
        </p>
      </div>
    </div>
  );
}
