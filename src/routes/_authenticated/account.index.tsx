import { createFileRoute, Link, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";
import i18next from "i18next";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { deleteMyAccount } from "@/lib/account.functions";
import { APP_VERSION } from "@/lib/version";
import { ArrowLeft, ShieldAlert, Bell, Smartphone, Lock, X, Archive, Users, Flower2, Languages, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAppSurface } from "@/lib/appSurface";
import {
  APP_STORE_BADGE, APP_STORE_BADGE_SIZE, APP_STORE_URL,
  PLAY_STORE_BADGE, PLAY_STORE_BADGE_SIZE, PLAY_STORE_URL,
} from "@/lib/storeLinks";
import { InkHero, Card, RecordRow, IconTile, SectionHead, PrimaryButton } from "@/components/system";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errorMessage";
import { OWNER_I18N_ENABLED, SUPPORTED_LOCALES, isLocale, type Locale } from "@/lib/i18n/config";
import { saveOwnerLocale } from "@/lib/i18n/ownerLocale";

// Each language is named in itself, never translated: someone looking for
// Nederlands has to recognise it whatever language the app is showing.
const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", nl: "Nederlands" };

// Support inbox for the "Help & support" row. If this address changes, update it
// here (and ideally point it at a monitored mailbox).
const SUPPORT_EMAIL = "brittany@thekyaproject.com";

export const Route = createFileRoute("/_authenticated/account/")({
  head: () => ({ meta: [{ title: i18next.t("account.pageTitle", "Account — Kya & Co.") }] }),
  component: AccountPage,
});

function AccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteMyAccount);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [name, setName] = useState("");

  // The Remembering entry shows only when there's a passed bird to remember.
  const { data: rememberingCount = 0 } = useQuery({
    queryKey: ["remembering-count"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return 0;
      const { count } = await supabase
        .from("birds")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", u.user.id)
        .not("passed_at", "is", null);
      return count ?? 0;
    },
  });
  const hasRemembering = rememberingCount > 0;

  // App + email language (profiles.locale). Only read once the owner-app
  // language switch is on; until then the row is hidden.
  const { data: locale = null } = useQuery({
    queryKey: ["profile-locale"],
    enabled: OWNER_I18N_ENABLED,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("locale").eq("id", u.user.id).maybeSingle();
      const l = (data as { locale?: string | null } | null)?.locale;
      return isLocale(l) ? l : null;
    },
  });
  const [languageOpen, setLanguageOpen] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Same per-surface rule as Settings and the checklists: inside the app there
  // is nothing to install, on a phone browser we point at the store, and on a
  // desktop we do not push an install at all.
  const surface = useAppSurface();
  const showGetApp = surface.surface === "mobile-web";

  useEffect(() => {
    (async () => {
      const { data: u } = await getLocalUser();
      const user = u.user;
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email ?? "");
      setPendingEmail((user as { new_email?: string | null }).new_email ?? null);
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      setName(p?.display_name ?? "");
    })();
  }, []);

  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/dashboard" }));

  async function signOut() {
    await supabase.auth.signOut();
    toast.success(t("account.signedOut", "Signed out."));
    navigate({ to: "/", replace: true });
  }

  const initial = (name.trim()[0] || email.trim()[0] || "?").toUpperCase();
  const emailPending = pendingEmail && pendingEmail.toLowerCase() !== email.toLowerCase();

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          eyebrow={t("account.account", "Account")}
          headline={t("account.yourAccount", "Your account")}
        />

        <main className="space-y-6 px-5 pt-5">
          {/* Identity */}
          <Card>
            <div className="flex items-center gap-3 p-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-xl font-[500] text-white">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="t-item truncate">{name.trim() || t("account.yourName", "Your name")}</p>
                <p className="t-meta truncate">{email}</p>
                {emailPending && (
                  <p className="mt-0.5 truncate text-[11px] text-[var(--amber-ink)]">{t("account.emailChangePending", "Change to {{email}} pending — confirm the emailed links.", { email: pendingEmail })}</p>
                )}
              </div>
              <button onClick={() => setEditOpen(true)} className="shrink-0 text-[13px] font-[500] text-[var(--moss)] active:opacity-70">{t("account.edit", "Edit")}</button>
            </div>
          </Card>

          {/* Care settings */}
          <div>
            <SectionHead title={t("account.careSettings", "Care settings")} />
            <Card>
              <Link to="/dashboard" search={{ emergencyDefaults: true }} className="block">
                <RecordRow
                  leading={<IconTile tone="pale" icon={<ShieldAlert className="size-5" />} />}
                  title={t("account.emergencyDefaults", "Emergency defaults")}
                  subtitle={t("account.vetContactsSpendLimitUsed", "Vet, contacts & spend limit — used for every bird.")}
                />
              </Link>
              <Link to="/scans/settings" className="block">
                <RecordRow
                  leading={<IconTile icon={<Bell className="size-5" />} />}
                  title={t("account.notifications", "Notifications")}
                  subtitle={t("account.howYouHearAboutHealth", "How you hear about health checks and updates.")}
                />
              </Link>
              <Link to="/household" className="block">
                <RecordRow
                  leading={<IconTile icon={<Users className="size-5" />} />}
                  title={t("account.household", "Household")}
                  subtitle={t("account.peopleWhoHelpCareFor", "People who help care for your birds.")}
                  last={!showGetApp}
                />
              </Link>
              {showGetApp && (
                <>
                  <RecordRow
                    onClick={() => window.open(surface.storePlatform === "ios" ? APP_STORE_URL : PLAY_STORE_URL, "_blank", "noopener")}
                    leading={<IconTile icon={<Smartphone className="size-5" />} />}
                    title={t("account.getTheKyaCoApp", "Get the Kya & Co. app")}
                    subtitle={t("account.remindersQuickLoggingAndYour", "Reminders, quick logging, and your flock's whole record, right on your phone. Same account, nothing to move over.")}
                    last
                  />
                  <div className="px-4 pb-4">
                    <img
                      src={surface.storePlatform === "ios" ? APP_STORE_BADGE : PLAY_STORE_BADGE}
                      width={(surface.storePlatform === "ios" ? APP_STORE_BADGE_SIZE : PLAY_STORE_BADGE_SIZE).width}
                      height={(surface.storePlatform === "ios" ? APP_STORE_BADGE_SIZE : PLAY_STORE_BADGE_SIZE).height}
                      alt={surface.storePlatform === "ios" ? t("account.appStoreBadgeAlt", "Download on the App Store") : t("account.playStoreBadgeAlt", "Get it on Google Play")}
                      className="block"
                    />
                  </div>
                </>
              )}
            </Card>
          </div>

          {/* Account */}
          <div>
            <SectionHead title={t("account.account", "Account")} />
            <Card>
              <Link to="/account/security" className="block">
                <RecordRow
                  leading={<IconTile icon={<Lock className="size-5" />} />}
                  title={t("account.passwordSignIn", "Password & sign-in")}
                  subtitle={t("account.manageHowYouLogIn", "Manage how you log in.")}
                />
              </Link>
              {OWNER_I18N_ENABLED && (
                <RecordRow
                  onClick={() => setLanguageOpen(true)}
                  leading={<IconTile icon={<Languages className="size-5" />} />}
                  title={t("account.language", "Language")}
                  subtitle={locale ? LANGUAGE_NAMES[locale] : t("account.sameAsPhone", "Same as your phone")}
                />
              )}
              <Link to="/past-birds" className="block">
                <RecordRow
                  leading={<IconTile icon={<Archive className="size-5" />} />}
                  title={t("account.birdsYouVeHelpedFind", "Birds you've helped find a home")}
                  last={!hasRemembering}
                />
              </Link>
              {/* Remembering — memorials for birds that have passed. Shown only
                  when there is someone to remember; visited by choice, no count. */}
              {hasRemembering && (
                <Link to="/remembering" className="block">
                  <RecordRow
                    leading={<IconTile icon={<Flower2 className="size-5" />} />}
                    title={t("account.remembering", "Remembering")}
                    last
                  />
                </Link>
              )}
            </Card>
          </div>

          {/* Legal / meta */}
          <div>
            <SectionHead title={t("account.legal", "Legal")} />
            <Card>
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Kya%20%26%20Co.%20support`} className="block">
                <RecordRow title={t("account.helpSupport", "Help & support")} chevron />
              </a>
              <Link to="/privacy" className="block">
                <RecordRow title={t("account.privacyPolicy", "Privacy policy")} chevron />
              </Link>
              <Link to="/terms" className="block">
                <RecordRow title={t("account.termsOfService", "Terms of service")} chevron last />
              </Link>
            </Card>
          </div>

          <p className="t-meta text-center">{t("account.version", "Version {{version}}", { version: APP_VERSION })}</p>

          <PrimaryButton tone="outline" onPress={signOut}>{t("account.signOut", "Sign out")}</PrimaryButton>

          <button
            onClick={() => setDeleteOpen(true)}
            className="block w-full min-h-[44px] py-1 text-center text-[13px] font-[500] text-[var(--red-ink)] active:opacity-70"
          >
            {t("account.deleteAccount", "Delete account")}
          </button>
        </main>
      </div>

      {languageOpen && (
        <LanguageModal userId={userId} current={locale} onClose={() => setLanguageOpen(false)} />
      )}
      {editOpen && (
        <EditIdentityModal
          userId={userId}
          name={name}
          email={email}
          onName={setName}
          onPendingEmail={setPendingEmail}
          onClose={() => setEditOpen(false)}
        />
      )}
      {deleteOpen && (
        <DeleteAccountModal
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await deleteFn();
            await qc.cancelQueries();
            qc.clear();
            await supabase.auth.signOut();
            toast.success(t("account.yourAccountAndAllData", "Your account and all data have been deleted."));
            navigate({ to: "/", replace: true });
          }}
        />
      )}
    </div>
  );
}

// ---------- Modals ----------

function LanguageModal({
  userId, current, onClose,
}: {
  userId: string | null;
  current: Locale | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [saving, setSaving] = useState<Locale | null>(null);

  async function choose(next: Locale) {
    if (!userId || next === current) { onClose(); return; }
    setSaving(next);
    try {
      await saveOwnerLocale(userId, next);
      qc.setQueryData(["profile-locale"], next);
      onClose();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <ModalShell title={t("account.language", "Language")} onClose={onClose}>
      <p className="mb-3 text-sm text-[var(--mute)]">{t("account.usedInTheAppAnd", "Used in the app and in emails we send you.")}</p>
      <div className="overflow-hidden rounded-xl bg-white">
        {SUPPORTED_LOCALES.map((l, i) => (
          <button
            key={l}
            lang={l}
            onClick={() => void choose(l)}
            disabled={saving !== null}
            className={`flex w-full items-center justify-between px-4 py-3 text-left text-[var(--ink)] ${i > 0 ? "border-t border-black/5" : ""}`}
          >
            <span>{LANGUAGE_NAMES[l]}</span>
            {(saving ?? current) === l && <Check className="size-5 text-[var(--ink)]" />}
          </button>
        ))}
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-[var(--cream)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-[500] text-[var(--ink)]">{title}</h2>
          <button onClick={onClose} aria-label={t("account.close", "Close")} className="rounded-full p-1 text-[var(--mute)] hover:bg-black/5">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditIdentityModal({
  userId, name, email, onName, onPendingEmail, onClose,
}: {
  userId: string | null;
  name: string;
  email: string;
  onName: (v: string) => void;
  onPendingEmail: (v: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Split the stored full name into first + last for editing; recombine on save.
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const [firstInput, setFirstInput] = useState(parts[0] ?? "");
  const [lastInput, setLastInput] = useState(parts.slice(1).join(" "));
  const [emailInput, setEmailInput] = useState(email);
  const [saving, setSaving] = useState(false);

  const fullName = [firstInput.trim(), lastInput.trim()].filter(Boolean).join(" ");
  const nameDirty = fullName !== name.trim();
  const emailDirty = emailInput.trim().length > 0 && emailInput.trim().toLowerCase() !== email.toLowerCase();

  async function save() {
    if (!userId || (!nameDirty && !emailDirty)) { onClose(); return; }
    setSaving(true);
    try {
      if (nameDirty) {
        // Keep all three name fields consistent so the first_name-preferring
        // greeting reflects the edit. display_name + full_name = "First Last";
        // first_name = the first name.
        const first = firstInput.trim() || null;
        const { error } = await supabase
          .from("profiles")
          .update({ display_name: fullName || null, full_name: fullName || null, first_name: first } as any)
          .eq("id", userId);
        if (error) throw error;
        onName(fullName);
      }
      if (emailDirty) {
        const next = emailInput.trim().toLowerCase();
        const { error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/dashboard` });
        if (error) throw error;
        onPendingEmail(next);
        toast.success(t("account.confirmationLinksSentToYour", "Confirmation links sent to your current and new email — both must be confirmed."));
      } else if (nameDirty) {
        toast.success(t("account.nameUpdated", "Name updated."));
      }
      onClose();
    } catch (e: any) {
      toast.error(friendlyError(e, t("account.couldNotSave", "Could not save changes.")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={t("account.editYourDetails", "Edit your details")} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="t-eyebrow block text-[var(--mute)]">{t("account.firstName", "First name")}</label>
          <input
            value={firstInput}
            onChange={(e) => setFirstInput(e.target.value)}
            placeholder={t("account.brittany", "Brittany")}
            autoComplete="given-name"
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--moss)]"
          />
        </div>
        <div>
          <label className="t-eyebrow block text-[var(--mute)]">{t("account.lastName", "Last name")}</label>
          <input
            value={lastInput}
            onChange={(e) => setLastInput(e.target.value)}
            placeholder={t("account.king", "King")}
            autoComplete="family-name"
            className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--moss)]"
          />
        </div>
      </div>
      <label className="t-eyebrow mt-4 block text-[var(--mute)]">{t("account.emailAddress", "Email address")}</label>
      <input
        type="email"
        value={emailInput}
        onChange={(e) => setEmailInput(e.target.value)}
        placeholder={t("account.youExampleCom", "you@example.com")}
        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--moss)]"
      />
      <p className="t-meta mt-1.5">{t("account.changingYourEmailSendsA", "Changing your email sends a confirmation link to both your current and new address. Both must be confirmed.")}</p>
      <div className="mt-4">
        <PrimaryButton tone="ink" onPress={save} disabled={saving || (!nameDirty && !emailDirty)}>
          {saving ? t("account.saving", "Saving…") : t("account.saveChanges", "Save changes")}
        </PrimaryButton>
      </div>
    </ModalShell>
  );
}

function DeleteAccountModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => Promise<void> }) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const ready = confirmText.trim().toUpperCase() === "DELETE";

  async function run() {
    if (!ready) return;
    setDeleting(true);
    try {
      await onConfirm();
    } catch (e: any) {
      toast.error(friendlyError(e, t("account.couldNotDelete", "Could not delete account.")));
      setDeleting(false);
    }
  }

  return (
    <ModalShell title={t("account.deleteAccount", "Delete account")} onClose={deleting ? () => {} : onClose}>
      <p className="t-body text-[var(--mute)]">
        <Trans
          i18nKey="account.deletePermanentlyBody"
          defaults="This permanently deletes your account and <1>everything in it</1> — your birds, care plans, clips, sits, sitter logs, and your contact record. Sitter links stop working. This cannot be undone."
          components={{ 1: <strong className="text-[var(--ink)]" /> }}
        />
      </p>
      <label className="t-eyebrow mt-4 block text-[var(--mute)]">{t("account.typeDeleteToConfirm", "Type DELETE to confirm")}</label>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={t("account.delete", "DELETE")}
        autoCapitalize="characters"
        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--red-line)]"
      />
      <button
        onClick={run}
        disabled={!ready || deleting}
        className="mt-4 w-full min-h-[44px] rounded-[12px] bg-[var(--red-deep)] py-3 text-[15px] font-[500] text-white disabled:opacity-50"
      >
        {deleting ? t("account.deleting", "Deleting…") : t("account.permanentlyDelete", "Permanently delete my account")}
      </button>
      <button onClick={onClose} disabled={deleting} className="mt-2 w-full min-h-[44px] py-2 text-center text-[13px] font-[500] text-[var(--mute)] disabled:opacity-50">
        {t("account.cancel", "Cancel")}
      </button>
    </ModalShell>
  );
}
