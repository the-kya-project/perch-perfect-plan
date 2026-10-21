import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { K, KyaLabel, KyaLink } from "@/components/kya";
import { FrontDoorBody, FrontDoorError, FrontDoorHeader, FrontDoorPage } from "@/components/frontDoor";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: i18next.t("resetPassword.pageTitle", "Reset password — Kya & Co.") },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only for what the page shows while not ready: a link Supabase already
  // rejected (an error in the URL hash), or one that never produced a session.
  // Readiness itself is unchanged — a late recovery event still makes it ready.
  const [linkLooksBad, setLinkLooksBad] = useState(false);
  useEffect(() => {
    if (/(^|[#&?])error(_code)?=/.test(window.location.hash + window.location.search)) setLinkLooksBad(true);
    const id = window.setTimeout(() => setLinkLooksBad(true), 6000);
    return () => window.clearTimeout(id);
  }, []);

  // Supabase puts the recovery token in the URL hash and exchanges it for a
  // session. Wait for the recovery event (or an existing session) before
  // letting the user submit a new password.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(t("resetPassword.tooShort", "Password must be at least 6 characters."));
      return;
    }
    if (password !== confirm) {
      setError(t("resetPassword.mismatch", "Passwords don't match."));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t("resetPassword.updated", "Password updated. You're signed in."));
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      setError(authErrorMessage(err, t("resetPassword.couldNotUpdate", "Could not update password.")));
    } finally {
      setLoading(false);
    }
  }

  const backToSignIn = () => navigate({ to: "/auth", search: { mode: "signin" } });

  return (
    <FrontDoorPage>
      <FrontDoorHeader
        onBack={backToSignIn}
        title={t("resetPassword.headlineV2", "Set a new password")}
        line={ready ? t("resetPassword.bodyReady", "Choose a new password for your account.") : undefined}
      />
      <FrontDoorBody>
        {!ready && !linkLooksBad && (
          <p className="m-0 flex items-center gap-2 text-[14px]" style={{ color: K.quiet }}>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("resetPassword.checkingLink", "Checking your link…")}
          </p>
        )}
        {!ready && linkLooksBad && (
          <FrontDoorError>
            {t("resetPassword.bodyNotReady", "Open this page from the password reset email you received.")}
          </FrontDoorError>
        )}
        {error && <FrontDoorError>{error}</FrontDoorError>}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <KyaLabel htmlFor="reset-new">{t("resetPassword.newPassword", "New password")}</KyaLabel>
            <input
              id="reset-new"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="kya-input"
              placeholder="••••••••"
              disabled={!ready}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <KyaLabel htmlFor="reset-confirm">{t("resetPassword.confirmNewPassword", "Confirm new password")}</KyaLabel>
            <input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="kya-input"
              placeholder="••••••••"
              disabled={!ready}
            />
          </div>
          <SubmitButton disabled={loading || !ready} busy={loading}>
            {t("resetPassword.saveNewPassword", "Save new password")}
          </SubmitButton>
        </form>

        <div className="flex justify-center">
          <KyaLink onClick={backToSignIn}>{t("resetPassword.backToSignIn", "Back to sign in")}</KyaLink>
        </div>
      </FrontDoorBody>
    </FrontDoorPage>
  );
}

/** KyaPrimaryButton's look as a real submit button, so Enter submits the form. */
function SubmitButton({ children, disabled, busy }: { children: React.ReactNode; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-1 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700] disabled:opacity-45"
      style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
