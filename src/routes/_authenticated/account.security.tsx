import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Check, Mail } from "lucide-react";
import { toast } from "sonner";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaField, KyaPrimaryButton, KyaLink, KyaGroupLabel, KyaRow, KyaIconTile, KyaTag } from "@/components/kya";
import { PageHeader } from "@/components/headers";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

export const Route = createFileRoute("/_authenticated/account/security")({
  head: () => ({ meta: [{ title: i18next.t("accountSecurity.pageTitle", "Password & sign-in — Kya & Co.") }] }),
  component: SecurityPage,
});

function SecurityPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const [email, setEmail] = useState("");
  const [providers, setProviders] = useState<string[]>([]);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (user) {
        setEmail(user.email ?? "");
        const fromMeta = (user.app_metadata?.providers as string[] | undefined) ?? [];
        const fromIdentities = (user.identities ?? []).map((i) => i.provider);
        setProviders(Array.from(new Set([...fromMeta, ...fromIdentities])));
        const g = (user.identities ?? []).find((i) => i.provider === "google");
        setGoogleEmail((g?.identity_data as { email?: string } | undefined)?.email ?? null);
      }
      setLoaded(true);
    })();
  }, []);

  const hasPassword = providers.includes("email");
  const googleConnected = providers.includes("google");

  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/account" }));

  async function savePassword() {
    if (pw.length < 6) { toast.error(t("accountSecurity.useSixChars", "Use at least 6 characters.")); return; }
    if (pw !== confirm) { toast.error(t("accountSecurity.mismatch", "Passwords don't match.")); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success(hasPassword ? t("accountSecurity.passwordUpdated", "Password updated.") : t("accountSecurity.passwordSetToast", "Password set — you can now sign in with email too."));
      setPw(""); setConfirm("");
      setProviders((p) => (p.includes("email") ? p : [...p, "email"]));
    } catch (e: any) {
      toast.error(authErrorMessage(e, t("accountSecurity.couldNotUpdate", "Could not update password.")));
    } finally {
      setSaving(false);
    }
  }

  async function emailResetLink() {
    if (!email) return;
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success(t("accountSecurity.resetSent", "Password reset link sent. Check your email."));
    } catch (e: any) {
      toast.error(authErrorMessage(e, t("accountSecurity.couldNotSendReset", "Could not send reset email.")));
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <KyaPage>
      <PageHeader title={t("accountSecurity.headline", "Password & sign-in")} onBack={goBack} />

      <KyaBody>
        {/* Password */}
        <KyaCard className="p-4">
          <KyaHeading>{hasPassword ? t("accountSecurity.changePassword", "Change password") : t("accountSecurity.setAPassword", "Set a password")}</KyaHeading>
          <p className="m-0 mt-1.5 text-[15px] leading-[1.5]" style={{ color: K.quiet }}>
            {hasPassword
              ? t("accountSecurity.changeBody", "Choose a new password for signing in with your email.")
              : t("accountSecurity.setBody", "Add a password so you can sign in with your email as well as Google.")}
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <KyaField
              id="security-new-password"
              label={t("accountSecurity.newPassword", "New password")}
              type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password"
              placeholder={t("accountSecurity.newPasswordPlaceholder", "At least 6 characters")}
            />
            <KyaField
              id="security-confirm-password"
              label={t("accountSecurity.confirmNewPassword", "Confirm new password")}
              type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
              placeholder={t("accountSecurity.reenterPassword", "Re-enter password")}
            />
          </div>

          <div className="mt-4">
            <KyaPrimaryButton onClick={savePassword} disabled={saving || !pw || !confirm}>
              {saving ? t("accountSecurity.saving", "Saving…") : hasPassword ? t("accountSecurity.updatePassword", "Update password") : t("accountSecurity.setPassword", "Set password")}
            </KyaPrimaryButton>
          </div>

          {hasPassword && (
            <div className="mt-2 flex justify-center">
              <KyaLink onClick={() => { if (!sendingReset) emailResetLink(); }}>
                {sendingReset ? t("accountSecurity.sending", "Sending…") : t("accountSecurity.emailResetLink", "Email me a reset link instead")}
              </KyaLink>
            </div>
          )}
        </KyaCard>

        {/* Connected accounts */}
        <section className="flex flex-col gap-2">
          <KyaGroupLabel>{t("accountSecurity.signInMethods", "Sign-in methods")}</KyaGroupLabel>
          <KyaCard>
            <KyaRow
              leading={<KyaIconTile><Mail className="size-5" /></KyaIconTile>}
              title={t("accountSecurity.emailAndPassword", "Email & password")}
              detail={email}
              trailing={
                hasPassword
                  ? <KyaTag tone="lime"><Check className="mr-1 size-3" /> {t("accountSecurity.passwordSet", "Password set")}</KyaTag>
                  : <KyaTag tone="amber">{t("accountSecurity.noPassword", "No password")}</KyaTag>
              }
            />
            <KyaRow
              last
              leading={
                <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white" style={{ boxShadow: `inset 0 0 0 1px ${K.line}` }}>
                  <GoogleGlyph />
                </span>
              }
              title="Google"
              detail={googleConnected ? (googleEmail ?? t("accountSecurity.connected", "Connected")) : t("accountSecurity.notConnected", "Not connected")}
              trailing={
                googleConnected
                  ? <KyaTag tone="lime"><Check className="mr-1 size-3" /> {t("accountSecurity.connected", "Connected")}</KyaTag>
                  : <KyaTag tone="amber">{t("accountSecurity.notConnected", "Not connected")}</KyaTag>
              }
            />
          </KyaCard>
          {loaded && !hasPassword && !googleConnected && (
            <p className="m-0 px-1 text-[14px] leading-[1.5]" style={{ color: K.quiet }}>{t("accountSecurity.noMethod", "No sign-in method detected — set a password above to be safe.")}</p>
          )}
        </section>
      </KyaBody>
    </KyaPage>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
