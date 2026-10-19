import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Check, Mail } from "lucide-react";
import { toast } from "sonner";
import { InkHero, Card, RecordRow, StatusPill, IconTile, PrimaryButton, CtaLink } from "@/components/system";
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
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          eyebrow={t("accountSecurity.eyebrow", "Account")}
          headline={t("accountSecurity.headline", "Password & sign-in")}
        />

        <main className="space-y-4 px-5 pt-5">
          {/* Password */}
          <Card className="p-4">
            <h2 className="t-item">{hasPassword ? t("accountSecurity.changePassword", "Change password") : t("accountSecurity.setAPassword", "Set a password")}</h2>
            <p className="t-body mt-1 text-[var(--mute)]">
              {hasPassword
                ? t("accountSecurity.changeBody", "Choose a new password for signing in with your email.")
                : t("accountSecurity.setBody", "Add a password so you can sign in with your email as well as Google.")}
            </p>

            <label className="t-eyebrow mt-4 block text-[var(--mute)]">{t("accountSecurity.newPassword", "New password")}</label>
            <input
              type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password"
              placeholder={t("accountSecurity.newPasswordPlaceholder", "At least 6 characters")}
              className="input mt-1"
            />
            <label className="t-eyebrow mt-3 block text-[var(--mute)]">{t("accountSecurity.confirmNewPassword", "Confirm new password")}</label>
            <input
              type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
              placeholder={t("accountSecurity.reenterPassword", "Re-enter password")}
              className="input mt-1"
            />

            <div className="mt-4">
              <PrimaryButton
                tone="ink"
                onPress={savePassword}
                disabled={saving || !pw || !confirm}
                type="button"
              >
                {saving ? t("accountSecurity.saving", "Saving…") : hasPassword ? t("accountSecurity.updatePassword", "Update password") : t("accountSecurity.setPassword", "Set password")}
              </PrimaryButton>
            </div>

            {hasPassword && (
              <div className="mt-3 flex justify-center">
                <CtaLink
                  label={sendingReset ? t("accountSecurity.sending", "Sending…") : t("accountSecurity.emailResetLink", "Email me a reset link instead")}
                  icon={<span />}
                  onPress={() => { if (!sendingReset) emailResetLink(); }}
                />
              </div>
            )}
          </Card>

          {/* Connected accounts */}
          <div>
            <p className="t-eyebrow mb-2 px-1 text-[var(--mute2)]">{t("accountSecurity.signInMethods", "Sign-in methods")}</p>
            <Card>
              <RecordRow
                leading={<IconTile tone="pale" size={40} icon={<Mail className="size-5" />} />}
                title={t("accountSecurity.emailAndPassword", "Email & password")}
                subtitle={email}
                trailing={
                  hasPassword
                    ? <StatusPill tone="good"><Check className="size-3" /> {t("accountSecurity.passwordSet", "Password set")}</StatusPill>
                    : <StatusPill tone="off">{t("accountSecurity.noPassword", "No password")}</StatusPill>
                }
              />
              <RecordRow
                last
                leading={
                  <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-white ring-1 ring-[var(--line2)]">
                    <GoogleGlyph />
                  </span>
                }
                title="Google"
                subtitle={googleConnected ? (googleEmail ?? t("accountSecurity.connected", "Connected")) : t("accountSecurity.notConnected", "Not connected")}
                trailing={
                  googleConnected
                    ? <StatusPill tone="good"><Check className="size-3" /> {t("accountSecurity.connected", "Connected")}</StatusPill>
                    : <StatusPill tone="off">{t("accountSecurity.notConnected", "Not connected")}</StatusPill>
                }
              />
            </Card>
            {loaded && !hasPassword && !googleConnected && (
              <p className="t-body mt-2 px-1 text-[var(--mute)]">{t("accountSecurity.noMethod", "No sign-in method detected — set a password above to be safe.")}</p>
            )}
          </div>
        </main>
      </div>
    </div>
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
