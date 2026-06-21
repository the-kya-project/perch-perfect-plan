import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

// Persistent "check your email" screen shown after a signup that requires email
// confirmation. Unlike a toast, it stays put until the owner confirms. The email
// they signed up with is stashed in sessionStorage (not the URL — it's personal
// data) by the auth page right before navigating here.
export const PENDING_EMAIL_KEY = "ppc_pending_confirm_email";
const RESEND_UNTIL_KEY = "ppc_confirm_resend_until";
const RESEND_COOLDOWN_S = 30;

export const Route = createFileRoute("/confirm-email")({
  head: () => ({ meta: [{ title: "Confirm your email — Parrot Care Co-Pilot" }] }),
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
  const navigate = useNavigate();
  const [email] = useState(readEmail);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
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
      toast.success("Confirmation email sent again.");
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't resend. Try again in a moment.");
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
    <div className="grid min-h-screen place-items-center bg-[#f4f1e8] px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center">
          <BrandLogo size="lg" />
        </div>

        <div className="mx-auto mt-8 grid size-14 place-items-center rounded-full bg-[#cdeab0]">
          <Mail className="size-7 text-[#1a3d2e]" />
        </div>

        <h1 className="mt-5 text-2xl font-medium leading-tight text-[#1a3d2e]">Check your email</h1>
        <p className="mt-3 text-sm leading-relaxed text-[#5f5e5a]">
          We sent a confirmation link to
        </p>
        <p className="mt-1 break-all text-sm font-semibold text-[#1a3d2e]">{email}</p>
        <p className="mt-3 text-sm leading-relaxed text-[#5f5e5a]">
          Click it to activate your account. Keep this tab open — once you confirm, we'll take you straight in.
        </p>
        <p className="mt-3 text-xs leading-relaxed text-[#5f5e5a]">
          Don't see it? Check your spam or junk folder — and give it a minute to arrive.
        </p>

        <button
          onClick={resend}
          disabled={cooldown > 0 || resending}
          className="mt-8 w-full rounded-xl bg-[#1a3d2e] py-3 text-sm font-medium text-white active:scale-[0.99] disabled:opacity-50"
        >
          {resending ? "Sending…" : cooldown > 0 ? `Resend email (${cooldown}s)` : "Didn't get it? Resend email"}
        </button>

        <p className="mt-4 text-xs text-[#5f5e5a]">
          Wrong email address?{" "}
          <button onClick={useDifferentEmail} className="font-medium text-[#1a3d2e] underline">
            Go back and fix it
          </button>
        </p>

        <p className="mt-6 text-[11px] text-[#5f5e5a]">
          Already confirmed?{" "}
          <Link to="/auth" search={{ mode: "signin" as const }} className="font-medium underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
