import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { getConfirmationStatus } from "@/lib/confirmation.functions";
import { CONFIRM_RESEND_COOLDOWN_S, confirmRedirectTo, stashSignInPrefill } from "@/lib/confirmResend";
import { K, KyaLabel, KyaPrimaryButton } from "@/components/kya";
import { FrontDoorBody, FrontDoorError, FrontDoorHeader, FrontDoorPage, LegalLinks } from "@/components/frontDoor";
import { ConfirmationWaitNote, NewestLinkSent } from "@/components/CheckEmailView";
import { PENDING_EMAIL_KEY } from "./confirm-email";

// Where a sign-up confirmation link lands when Supabase rejected it: expired,
// already used, or replaced by a newer email (every resend invalidates the
// previous link). The _authenticated guard sends /welcome?error_code=… here.
//
// Supabase's error is the same in all three cases, so this page sorts it out:
//   • signed in already (confirmed in another tab) → straight on to the app
//   • the account is confirmed → sign-in, with the email filled in
//   • otherwise → one tap sends a new link, and says only that one will work
// The email comes from this browser's sign-up when there is one; a link opened
// in a different browser (Mail → Safari after signing up in the app) starts
// with an empty field.
export const Route = createFileRoute("/link-expired")({
  ssr: false,
  validateSearch: z.object({ reason: z.string().max(64).optional() }),
  head: () => ({
    meta: [
      { title: i18next.t("linkExpired.pageTitle", "Link expired — Kya & Co.") },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: LinkExpired,
});

function readPendingEmail(): string {
  try { return window.sessionStorage.getItem(PENDING_EMAIL_KEY) ?? ""; } catch { return ""; }
}

function LinkExpired() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { reason } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const left = useRef(false);

  function goToSignIn(address: string) {
    if (left.current) return;
    left.current = true;
    stashSignInPrefill(address);
    try { window.sessionStorage.removeItem(PENDING_EMAIL_KEY); } catch { /* storage blocked */ }
    navigate({ to: "/auth", search: { mode: "signin" as const }, replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    const stored = readPendingEmail();
    track("confirm_link_expired", { reason: reason ?? "unknown", had_email: !!stored });
    if (stored) setEmail(stored);
    void (async () => {
      // Confirmed and signed in already (the newer link worked in this browser).
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        left.current = true;
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      if (!stored) return;
      const status = await getConfirmationStatus({ data: { email: stored } }).catch(() => ({ confirmed: false }));
      if (!cancelled && status.confirmed) goToSignIn(stored);
    })();
    return () => { cancelled = true; };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  async function sendNewLink() {
    const address = email.trim();
    if (sending || cooldown > 0) return;
    if (!address) {
      setError(t("linkExpired.enterEmail", "Enter the email you signed up with."));
      return;
    }
    setSending(true);
    setError(null);
    try {
      const status = await getConfirmationStatus({ data: { email: address } }).catch(() => ({ confirmed: false }));
      if (status.confirmed) {
        track("confirm_resend_from_expired", { ok: true, already_confirmed: true });
        goToSignIn(address);
        return;
      }
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: address,
        options: { emailRedirectTo: confirmRedirectTo() },
      });
      if (error) throw error;
      try { window.sessionStorage.setItem(PENDING_EMAIL_KEY, address); } catch { /* storage blocked */ }
      setSent(true);
      setCooldown(CONFIRM_RESEND_COOLDOWN_S);
      track("confirm_resend_from_expired", { ok: true, already_confirmed: false });
    } catch (err) {
      setError(authErrorMessage(err, t("linkExpired.couldNotSend", "Couldn't send a new link. Try again in a moment.")));
      track("confirm_resend_from_expired", { ok: false });
    } finally {
      setSending(false);
    }
  }

  const buttonLabel = cooldown > 0
    ? t("linkExpired.sendNewLinkIn", "Send a new link ({{cooldown}}s)", { cooldown })
    : t("linkExpired.sendNewLink", "Send a new link");

  return (
    <FrontDoorPage>
      <FrontDoorHeader
        onBack={() => navigate({ to: "/" })}
        title={t("linkExpired.title", "This link has expired")}
        line={t("linkExpired.line", "It may have been replaced by a newer email, or it's too old to use. We can send you a fresh one.")}
      />
      <FrontDoorBody>
        {error && <FrontDoorError>{error}</FrontDoorError>}
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => { e.preventDefault(); void sendNewLink(); }}
        >
          <div className="flex flex-col gap-1.5">
            <KyaLabel htmlFor="link-expired-email">{t("linkExpired.email", "Your email")}</KyaLabel>
            <input
              id="link-expired-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => { setEmail(e.target.value); setSent(false); }}
              className="kya-input"
              placeholder="you@example.com"
            />
          </div>
          <KyaPrimaryButton
            onClick={() => void sendNewLink()}
            disabled={sending || cooldown > 0}
            icon={sending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : undefined}
          >
            {buttonLabel}
          </KyaPrimaryButton>
        </form>
        {sent && <NewestLinkSent />}
        <div className="flex justify-center">
          <ConfirmationWaitNote />
        </div>
        <p className="m-0 text-center text-[12.5px]" style={{ color: K.quiet }}>
          {t("linkExpired.alreadyConfirmed", "Already confirmed?")}{" "}
          <Link to="/auth" search={{ mode: "signin" as const }} className="inline-flex min-h-[44px] items-center font-[700]" style={{ color: K.moss }}>
            {t("linkExpired.signIn", "Sign in")}
          </Link>
        </p>
        <div className="mt-auto pt-2">
          <LegalLinks />
        </div>
      </FrontDoorBody>
    </FrontDoorPage>
  );
}
