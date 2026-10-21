import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useTranslation, Trans } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { deleteMyAccount } from "@/lib/account.functions";
import { APP_VERSION } from "@/lib/version";
import { ShieldAlert, Bell, Smartphone, Lock, Archive, Users, Flower2, Languages, Check, Globe } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAppSurface } from "@/lib/appSurface";
import {
  APP_STORE_BADGE, APP_STORE_BADGE_SIZE, APP_STORE_URL,
  PLAY_STORE_BADGE, PLAY_STORE_BADGE_SIZE, PLAY_STORE_URL,
} from "@/lib/storeLinks";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaRow, KyaTag, KyaLink, KyaIconTile, KyaPrimaryButton, KyaSheet } from "@/components/kya";
import { PageHeader } from "@/components/headers";
import { useOwnerEmergency } from "@/lib/useOwnerEmergency";
import { missingRequired, type EmergencyValues } from "@/components/EmergencyContacts";
import { getHouseholdAccount } from "@/lib/household.functions";
import { SUPPORT_EMAIL } from "@/lib/support";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errorMessage";
import { OWNER_I18N_ENABLED, SUPPORTED_LOCALES, isLocale, type Locale } from "@/lib/i18n/config";
import { saveOwnerLocale } from "@/lib/i18n/ownerLocale";
import { TimeZoneSheet, ACCOUNT_TIME_ZONE_KEY } from "@/components/TimeZoneSheet";
import { fetchAccountTimeZone } from "@/lib/sitTimeZoneBackfill";
import { timeZoneRowLabel } from "@/lib/sitTimeZoneNames";

// Each language is named in itself, never translated: someone looking for
// Nederlands has to recognise it whatever language the app is showing.
const LANGUAGE_NAMES: Record<Locale, string> = { en: "English", nl: "Nederlands" };


export const Route = createFileRoute("/_authenticated/account/")({
  head: () => ({ meta: [{ title: i18next.t("account.pageTitle", "Account — Kya & Co.") }] }),
  component: AccountPage,
});

function AccountPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteMyAccount);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [providers, setProviders] = useState<string[]>([]);

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

  // Home time zone (profiles.time_zone): sits follow it, not the phone's.
  const { data: timeZone = null } = useQuery({
    queryKey: ACCOUNT_TIME_ZONE_KEY,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      return u.user ? fetchAccountTimeZone(u.user.id) : null;
    },
  });
  const [timeZoneOpen, setTimeZoneOpen] = useState(false);

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
      const fromMeta = ((user.app_metadata as { providers?: string[] } | undefined)?.providers ?? []) as string[];
      const fromIds = (user.identities ?? []).map((i) => i.provider);
      setProviders(Array.from(new Set([...fromMeta, ...fromIds])));
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      setName(p?.display_name ?? "");
    })();
  }, []);

  // Care settings status lines.
  const { data: emergency } = useOwnerEmergency();
  const emergencyGaps = missingRequired((emergency ?? {}) as EmergencyValues);
  const getHousehold = useServerFn(getHouseholdAccount);
  const { data: household } = useQuery({ queryKey: ["household-account"], queryFn: () => getHousehold() });
  const { data: notif } = useQuery({
    queryKey: ["account-notif-status"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const [{ data: p }, { count }] = await Promise.all([
        (supabase as any).from("profiles").select("notify_sitter_log, notify_care_plan_reminder, notify_monthly_letter, notify_onboarding").eq("id", u.user.id).maybeSingle(),
        supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", u.user.id),
      ]);
      const emailOn = !!p && Object.values(p as Record<string, unknown>).some(Boolean);
      return { emailOn, pushOn: (count ?? 0) > 0 };
    },
  });

  const memberNames = ((household?.members ?? []) as { name: string | null; email: string | null }[])
    .map((m) => (m.name?.trim() || m.email?.split("@")[0] || "").split(/\s+/)[0])
    .filter(Boolean);
  const householdLine = memberNames.length === 0
    ? t("account.householdJustYou", "Just you")
    : memberNames.length > 3
      ? t("account.householdYouAndOthers", "You and {{count}} others", { count: memberNames.length })
      : t("account.householdYouAnd", "You and {{names}}", { names: joinAnd(t, memberNames) });
  const notifLine = notif
    ? [notif.emailOn ? t("account.emailOn", "Email on") : t("account.emailOff", "Email off"), notif.pushOn ? t("account.pushOn", "Push on") : t("account.pushOff", "Push off")].join(" · ")
    : "";
  const providerName = (p: string) => p === "google" ? "Google" : p === "apple" ? "Apple" : p === "email" ? t("account.emailAndPassword", "Email and password") : p;
  const signInLine = providers.length ? joinAnd(t, providers.map(providerName)) : "";
  const emergencyTag = emergencyGaps.length === 0
    ? <KyaTag tone="lime">{t("account.ready", "Ready")}</KyaTag>
    : emergencyGaps.length === 2
      ? <KyaTag tone="amber">{t("account.needsTwoNumbers", "Needs 2 numbers")}</KyaTag>
      : <KyaTag tone="amber">{emergencyGaps[0] === "owner_phone" ? t("account.needsYourPhone", "Needs your phone") : t("account.needsVetPhone", "Needs vet phone")}</KyaTag>;

  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/dashboard" }));

  async function signOut() {
    await supabase.auth.signOut();
    toast.success(t("account.signedOut", "Signed out."));
    navigate({ to: "/", replace: true });
  }

  const initial = (name.trim()[0] || email.trim()[0] || "?").toUpperCase();
  const emailPending = pendingEmail && pendingEmail.toLowerCase() !== email.toLowerCase();

  const row = (icon: React.ReactNode, title: string, detail: React.ReactNode | undefined, onClick: () => void, opts: { trailing?: React.ReactNode; last?: boolean; wrap?: boolean } = {}) => (
    <KyaRow leading={<KyaIconTile>{icon}</KyaIconTile>} title={title} detail={detail} trailing={opts.trailing} onClick={onClick} last={opts.last} wrap={opts.wrap} />
  );
  const plain = (title: string, onClick: () => void, last = false) => <KyaRow title={title} onClick={onClick} last={last} />;

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <PageHeader onBack={goBack} title={t("account.yourAccount", "Your account")} />

        <KyaBody className="gap-5">
          {/* Identity */}
          <KyaCard>
            <div className="flex items-center gap-3 p-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-full text-[20px] font-[700]" style={{ background: K.forest, color: K.lime }}>
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[17px] font-[700]">{name.trim() || t("account.yourName", "Your name")}</p>
                <p className="m-0 truncate text-[14px]" style={{ color: K.quiet }}>{email}</p>
                {emailPending && (
                  <p className="m-0 mt-0.5 truncate text-[12.5px]" style={{ color: K.amberText }}>{t("account.emailChangePending", "Change to {{email}} pending — confirm the emailed links.", { email: pendingEmail })}</p>
                )}
              </div>
              <KyaLink onClick={() => setEditOpen(true)}>{t("account.edit", "Edit")}</KyaLink>
            </div>
          </KyaCard>

          {/* Care settings */}
          <section className="flex flex-col gap-2.5">
            <KyaHeading>{t("account.careSettings", "Care settings")}</KyaHeading>
            <KyaCard>
              {row(<ShieldAlert className="size-5" />, t("account.emergencyInfo", "Emergency info"), <>{t("account.emergencyInfoDetail", "Your phone, vets, and where things are")}{emergency !== undefined && <span className="mt-1.5 block">{emergencyTag}</span>}</>, () => navigate({ to: "/account/emergency" }), { wrap: true })}
              {row(<Users className="size-5" />, t("account.household", "Household"), household ? householdLine : undefined, () => navigate({ to: "/household" }))}
              {row(<Bell className="size-5" />, t("account.notifications", "Notifications"), notifLine || undefined, () => navigate({ to: "/scans/settings" }), { last: !showGetApp })}
              {showGetApp && row(
                <Smartphone className="size-5" />,
                t("account.getTheKyaCoApp", "Get the Kya & Co. app"),
                t("account.getTheAppShort", "Reminders and quick logging on your phone"),
                () => window.open(surface.storePlatform === "ios" ? APP_STORE_URL : PLAY_STORE_URL, "_blank", "noopener"),
                { last: true },
              )}
            </KyaCard>
          </section>

          {/* Account */}
          <section className="flex flex-col gap-2.5">
            <KyaHeading>{t("account.account", "Account")}</KyaHeading>
            <KyaCard>
              {row(<Lock className="size-5" />, t("account.passwordSignIn", "Password & sign-in"), signInLine || undefined, () => navigate({ to: "/account/security" }))}
              {OWNER_I18N_ENABLED && row(<Languages className="size-5" />, t("account.language", "Language"), locale ? LANGUAGE_NAMES[locale] : t("account.sameAsPhone", "Same as your phone"), () => setLanguageOpen(true))}
              {row(<Globe className="size-5" />, t("account.timeZone", "Time zone"), timeZone ? timeZoneRowLabel(timeZone, i18n.language) : t("account.timeZoneNotSet", "Not set yet"), () => setTimeZoneOpen(true))}
              {row(<Archive className="size-5" />, t("account.birdsRehomed", "Birds you've helped rehome"), t("account.birdsRehomedDetail", "Birds you've handed off to new owners"), () => navigate({ to: "/past-birds" }), { last: !hasRemembering })}
              {/* Remembering — memorials for birds that have passed. Shown only
                  when there is someone to remember; visited by choice, no count. */}
              {hasRemembering && row(<Flower2 className="size-5" />, t("account.remembering", "Remembering"), undefined, () => navigate({ to: "/remembering" }), { last: true })}
            </KyaCard>
          </section>

          {/* Help and legal */}
          <section className="flex flex-col gap-2.5">
            <KyaHeading>{t("account.helpAndLegal", "Help and legal")}</KyaHeading>
            <KyaCard>
              {plain(t("account.helpSupport", "Help & support"), () => { window.location.href = `mailto:${SUPPORT_EMAIL}?subject=Kya%20%26%20Co.%20support`; })}
              {plain(t("account.privacyPolicy", "Privacy policy"), () => navigate({ to: "/privacy" }))}
              {plain(t("account.termsOfService", "Terms of service"), () => navigate({ to: "/terms" }), true)}
            </KyaCard>
          </section>

          <div className="flex flex-col items-start px-1">
            <p className="m-0 text-[12px]" style={{ color: K.quiet }}>{t("account.version", "Version {{version}}", { version: APP_VERSION })}</p>
            <KyaLink color={K.red} onClick={signOut}>{t("account.signOut", "Sign out")}</KyaLink>
            <KyaLink color={K.red} onClick={() => setDeleteOpen(true)}>{t("account.deleteAccount", "Delete account")}</KyaLink>
          </div>
        </KyaBody>
      </div>

      {languageOpen && (
        <LanguageModal userId={userId} current={locale} onClose={() => setLanguageOpen(false)} />
      )}
      {timeZoneOpen && (
        <TimeZoneSheet userId={userId} current={timeZone} onClose={() => setTimeZoneOpen(false)} />
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
    </KyaPage>
  );
}

/** "Sam", "Sam and Alex", "Sam, Alex and Jo". */
function joinAnd(t: TFunction, items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return t("account.joinAnd", "{{list}} and {{last}}", { list: items.slice(0, -1).join(", "), last: items[items.length - 1] });
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
      <p className="m-0 mb-3 text-[15px] text-[#5f5e5a]">{t("account.usedInTheAppAnd", "Used in the app and in emails we send you.")}</p>
      <div className="overflow-hidden rounded-[20px] bg-[#f1f5f0]">
        {SUPPORTED_LOCALES.map((l, i) => (
          <button
            key={l}
            lang={l}
            onClick={() => void choose(l)}
            disabled={saving !== null}
            className={`flex min-h-[52px] w-full items-center justify-between px-4 text-left text-[16px] font-[700] text-[#1a3d2e] ${i > 0 ? "border-t border-[#e3ebe2]" : ""}`}
          >
            <span>{LANGUAGE_NAMES[l]}</span>
            {(saving ?? current) === l && <Check className="size-5 text-[#1a3d2e]" />}
          </button>
        ))}
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <KyaSheet onClose={onClose} closeLabel={t("account.close", "Close")} title={<KyaHeading size={24}>{title}</KyaHeading>}>
      {children}
    </KyaSheet>
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
          <label className="mb-1.5 block text-[13.5px] font-[700] text-[#1a3d2e]">{t("account.firstName", "First name")}</label>
          <input
            value={firstInput}
            onChange={(e) => setFirstInput(e.target.value)}
            placeholder={t("account.firstNamePlaceholder", "First name")}
            autoComplete="given-name"
            className="min-h-[48px] w-full rounded-full border-[1.5px] border-[#d5dfd5] bg-white px-4 text-[16px] text-[#1a3d2e] outline-none focus:border-[#2d6a4f]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13.5px] font-[700] text-[#1a3d2e]">{t("account.lastName", "Last name")}</label>
          <input
            value={lastInput}
            onChange={(e) => setLastInput(e.target.value)}
            placeholder={t("account.lastNamePlaceholder", "Last name")}
            autoComplete="family-name"
            className="min-h-[48px] w-full rounded-full border-[1.5px] border-[#d5dfd5] bg-white px-4 text-[16px] text-[#1a3d2e] outline-none focus:border-[#2d6a4f]"
          />
        </div>
      </div>
      <label className="mb-1.5 mt-4 block text-[13.5px] font-[700] text-[#1a3d2e]">{t("account.emailAddress", "Email address")}</label>
      <input
        type="email"
        value={emailInput}
        onChange={(e) => setEmailInput(e.target.value)}
        placeholder={t("account.youExampleCom", "you@example.com")}
        className="min-h-[48px] w-full rounded-full border-[1.5px] border-[#d5dfd5] bg-white px-4 text-[16px] text-[#1a3d2e] outline-none focus:border-[#2d6a4f]"
      />
      <p className="m-0 mt-1.5 px-1 text-[13px] text-[#5f5e5a]">{t("account.changingYourEmailSendsA", "Changing your email sends a confirmation link to both your current and new address. Both must be confirmed.")}</p>
      <div className="mt-4">
        <KyaPrimaryButton onClick={save} disabled={saving || (!nameDirty && !emailDirty)}>
          {saving ? t("account.saving", "Saving…") : t("account.saveChanges", "Save changes")}
        </KyaPrimaryButton>
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
      <p className="m-0 text-[15px] leading-[1.5] text-[#5f5e5a]">
        <Trans
          i18nKey="account.deletePermanentlyBody"
          defaults="This permanently deletes your account and <1>everything in it</1> — your birds, care plans, clips, sits, sitter logs, and your contact record. Sitter links stop working. This cannot be undone."
          components={{ 1: <strong className="text-[#1a3d2e]" /> }}
        />
      </p>
      <label className="mb-1.5 mt-4 block text-[13.5px] font-[700] text-[#1a3d2e]">{t("account.typeDeleteToConfirm", "Type DELETE to confirm")}</label>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder={t("account.delete", "DELETE")}
        autoCapitalize="characters"
        className="min-h-[48px] w-full rounded-full border-[1.5px] border-[#d5dfd5] bg-white px-4 text-[16px] text-[#1a3d2e] outline-none focus:border-[#2d6a4f]"
      />
      <button
        onClick={run}
        disabled={!ready || deleting}
        className="mt-4 min-h-[52px] w-full rounded-full text-[16px] font-[700] text-white disabled:opacity-50" style={{ background: K.red }}
      >
        {deleting ? t("account.deleting", "Deleting…") : t("account.permanentlyDelete", "Permanently delete my account")}
      </button>
      <button onClick={onClose} disabled={deleting} className="mt-2 min-h-[44px] w-full py-2 text-center text-[15px] font-[700] text-[#2d6a4f] disabled:opacity-50">
        {t("account.cancel", "Cancel")}
      </button>
    </ModalShell>
  );
}
