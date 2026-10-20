import { createFileRoute, useRouter, useCanGoBack, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { ShieldCheck, Smartphone } from "lucide-react";
import { Trans } from "react-i18next";
import { toast } from "sonner";
import {
  detectPushSupport,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentEndpoint,
  getNotificationPermission,
  type PushSupport,
} from "@/lib/push";
import { NotificationsBlockedModal } from "@/components/NotificationsBlockedModal";
import {
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
  savePushToken,
  deletePushToken,
} from "@/lib/push.functions";
import { isNativeApp } from "@/lib/nativeApp";
import {
  registerForNativePush,
  unregisterNativePush,
  nativePushPermission,
  nativePushAvailable,
  nativePushOptedOut,
  setNativePushOptedOut,
} from "@/lib/pushNative";
import { markNotificationsReviewed } from "@/components/OwnerChecklist";
import { detectWebPlatform, APP_STORE_URL, PLAY_STORE_URL } from "@/lib/storeLinks";
import { K, KyaPage, KyaHeader, KyaBody, KyaCard, KyaIconTile, KyaGroupLabel, KyaSwitch, KyaLink, KyaPrimaryButton, KyaSecondaryButton, KyaBackRow, KyaTitle } from "@/components/kya";
import { friendlyError } from "@/lib/errorMessage";
import i18next from "i18next";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/scans/settings")({
  head: () => ({ meta: [{ title: i18next.t("notifSettings.metaTitle", "Notification settings — Kya & Co.") }] }),
  component: NotificationsSettingsPage,
});

type Prefs = {
  notify_sitter_opened: boolean;
  notify_sitter_log: boolean;
  notify_care_plan_reminder: boolean;
  push_sitter_opened: boolean;
  push_sitter_log: boolean;
  push_care_plan_reminder: boolean;
  push_weight_reminder: boolean;
  push_checkin_reminder: boolean;
  notify_monthly_letter: boolean;
  notify_onboarding: boolean;
};

type Row = {
  emailKey?: keyof Prefs; // push-only rows (reminder nudges) have no email counterpart
  pushKey: keyof Prefs;
  title: string;
  desc: string;
};

const getRows = (t: TFunction): Row[] => [
  {
    emailKey: "notify_sitter_log",
    pushKey: "push_sitter_log",
    title: t("notifSettings.rowSitterLogTitle", "Sitter added a daily log"),
    desc: t("notifSettings.rowSitterLogDesc", "Tell me when a sitter posts a new daily log entry during a sit."),
  },
  {
    emailKey: "notify_care_plan_reminder",
    pushKey: "push_care_plan_reminder",
    title: t("notifSettings.rowCarePlanTitle", "Care plan update reminder"),
    desc: t("notifSettings.rowCarePlanDesc", "Remind me to review the care plan before an upcoming sit."),
  },
  {
    pushKey: "push_weight_reminder",
    title: t("notifSettings.rowWeightTitle", "Weigh-in reminders"),
    desc: t("notifSettings.rowWeightDesc", "Nudge me when a bird is due for a weight check, based on my own logging rhythm."),
  },
  {
    pushKey: "push_checkin_reminder",
    title: t("notifSettings.rowCheckinTitle", "Check-in reminders"),
    desc: t("notifSettings.rowCheckinDesc", "A gentle reminder if it's been a while since the last entry."),
  },
];

const getEmailRows = (t: TFunction): Array<{ key: keyof Prefs; title: string; desc: string }> => [
  {
    key: "notify_monthly_letter",
    title: t("notifSettings.flockReportTitle", "The Flock Report"),
    desc: t("notifSettings.flockReportDesc", "A monthly look at your flock's numbers, a care note, and the latest from The Kya Project. Sent on the 2nd."),
  },
  {
    key: "notify_onboarding",
    title: t("notifSettings.onboardingTitle", "Getting-started emails"),
    desc: t("notifSettings.onboardingDesc", "A short tour of the app over your first couple of weeks."),
  },
];

function NotificationsSettingsPage() {
  const { t } = useTranslation();
  const ROWS = getRows(t);
  const EMAIL_ROWS = getEmailRows(t);
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  // Return to the actual previous screen (account, the notifications inbox, …)
  // rather than a hardcoded target. Fall back to account if opened with no
  // history (e.g. a direct deep link / push).
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/account" }));
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const getVapidKey = useServerFn(getVapidPublicKey);
  const saveSub = useServerFn(savePushSubscription);
  const deleteSub = useServerFn(deletePushSubscription);
  const saveToken = useServerFn(savePushToken);
  const deleteToken = useServerFn(deletePushToken);

  // Native shell: APNs/FCM device token instead of a web-push subscription.
  // Kept in its own state so the two paths never overwrite each other.
  const native = isNativeApp();
  const [nativeToken, setNativeToken] = useState<string | null>(null);
  // Which store to point at when this is a phone BROWSER rather than the app.
  const webPlatform = detectWebPlatform();

  useEffect(() => {
    // Visiting/reviewing notification preferences checks off that getting-started step.
    markNotificationsReviewed();
    (async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles")
        .select(
          "notify_sitter_opened, notify_sitter_log, notify_care_plan_reminder, push_sitter_opened, push_sitter_log, push_care_plan_reminder, push_weight_reminder, push_checkin_reminder, notify_monthly_letter, notify_onboarding",
        )
        .eq("id", u.user.id)
        .maybeSingle();
      // push_weight_reminder/push_checkin_reminder postdate the generated types
      if (data) setPrefs(data as unknown as Prefs);
      if (native) {
        // Older shells (shipped before native push) do not contain the plugin.
        // A Vercel deploy reaches them instantly, so without this they'd get an
        // enable button that always fails. Leave them on the old message.
        if (!(await nativePushAvailable())) {
          setSupport({ ok: false, reason: "native-app" });
          return;
        }
        // detectPushSupport() reports "native-app" (web-push is genuinely
        // unavailable in a WKWebView), but the shell DOES support push via
        // APNs/FCM — so the UI must not treat the shell as unsupported.
        setSupport({ ok: true });
        const p = await nativePushPermission();
        // "prompt" and "unknown" both mean "not decided yet" to this UI, which
        // speaks the web's NotificationPermission vocabulary.
        setPermission(p === "granted" || p === "denied" ? p : "default");
        if (p === "granted" && !nativePushOptedOut()) {
          // Already granted: re-register to pick up a ROTATED token and
          // re-sync it. Silent — the OS does not prompt again. Skipped when
          // push was switched off here, or this would quietly turn it back on.
          const res = await registerForNativePush();
          if (res.ok) {
            setNativeToken(res.token);
            try {
              await saveToken({ data: { token: res.token, transport: res.transport } });
            } catch { /* keep the UI enabled; the next open retries */ }
          }
        }
        return;
      }
      setSupport(detectPushSupport());
      setPermission(getNotificationPermission());
      setPushEndpoint(await getCurrentEndpoint());
    })();

    // Re-check permission when the user comes back to the tab — e.g. after they
    // flip the toggle in their phone's settings — so the blocked banner clears.
    const recheck = async () => {
      if (native) {
        // In the shell, Notification.permission is the WEB permission, which is
        // meaningless here — reading it would wrongly flip the banner to
        // "blocked" after the user tabs away and back. Ask the OS instead.
        const p = await nativePushPermission();
        setPermission(p === "granted" || p === "denied" ? p : "default");
        return;
      }
      setPermission(getNotificationPermission());
      setPushEndpoint(await getCurrentEndpoint());
    };
    window.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      window.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
    // Mount-once on purpose. `saveToken` is a fresh reference every render, so
    // listing it would re-run this effect continuously and re-register push on
    // every render; `native` cannot change during a session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(key: keyof Prefs, next: boolean) {
    if (!prefs) return;
    const prev = prefs[key];
    setPrefs({ ...prefs, [key]: next });
    setSaving(key);
    try {
      const { data: u } = await getLocalUser();
      if (!u.user) throw new Error("Not signed in.");
      const patch: Partial<Prefs> = { [key]: next } as Partial<Prefs>;
      const { error } = await (supabase as any).from("profiles").update(patch).eq("id", u.user.id);
      if (error) throw error;
    } catch (e: unknown) {
      setPrefs({ ...prefs, [key]: prev });
      toast.error(friendlyError(e, t("notifSettings.saveFailed", "Could not save preference.")));
    } finally {
      setSaving(null);
    }
  }

  async function enablePush() {
    // Already blocked at the OS/browser level — requestPermission() won't prompt,
    // so send them to the settings instructions instead of a dead-end toast.
    if (getNotificationPermission() === "denied") {
      setPermission("denied");
      setBlockedOpen(true);
      return;
    }
    setBusy(true);
    try {
      if (native) {
        const res = await registerForNativePush();
        if (!res.ok) {
          if (res.reason === "denied") {
            setPermission("denied");
            setBlockedOpen(true);
          } else {
            toast.error(t("notifSettings.enableFailedRetry", "Could not turn on notifications. Please try again."));
          }
          return;
        }
        await saveToken({ data: { token: res.token, transport: res.transport } });
        setNativePushOptedOut(false);
        setNativeToken(res.token);
        setPermission("granted");
        toast.success(t("notifSettings.pushEnabled", "Push notifications enabled on this device."));
        return;
      }

      const { publicKey } = await getVapidKey();
      const sub = await subscribeToPush(publicKey);
      setPermission(getNotificationPermission());
      if (!sub) {
        // The prompt was dismissed or denied. If it's now hard-denied, guide them
        // to settings; otherwise they just dismissed it and can try again.
        if (getNotificationPermission() === "denied") setBlockedOpen(true);
        else toast.error(t("notifSettings.permissionNotGranted", "Notification permission was not granted."));
        return;
      }
      await saveSub({ data: sub });
      setPushEndpoint(sub.endpoint);
      toast.success(t("notifSettings.pushEnabled", "Push notifications enabled on this device."));
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "ios-not-installed") {
        toast.error(t("notifSettings.iosNotInstalled", "On iPhone, add this app to your Home Screen first."));
      } else {
        toast.error(friendlyError(e, t("notifSettings.enableFailed", "Could not enable push.")));
      }
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    try {
      if (native) {
        // Drop the server row FIRST: if unregister succeeds but the delete
        // fails, the row would keep receiving pushes for a device that can no
        // longer show them.
        if (nativeToken) await deleteToken({ data: { token: nativeToken } });
        await unregisterNativePush();
        setNativePushOptedOut(true);
        setNativeToken(null);
        toast.success(t("notifSettings.pushDisabled", "Push notifications turned off on this device."));
        return;
      }
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await deleteSub({ data: { endpoint } });
      setPushEndpoint(null);
      toast.success(t("notifSettings.pushDisabled", "Push notifications turned off on this device."));
    } catch (e: unknown) {
      toast.error(friendlyError(e, t("notifSettings.disableFailed", "Could not disable push.")));
    } finally {
      setBusy(false);
    }
  }

  const pushEnabled = native ? !!nativeToken : !!pushEndpoint;
  const pushBlocked = support && !support.ok;
  // Supported here, but the user/phone has blocked notifications in settings.
  const permissionDenied = !!support?.ok && permission === "denied" && !pushEnabled;

  // The push card: in the app (or a desktop browser that supports web push)
  // it turns push on; on a phone browser the answer is the app.
  const canTogglePush = native ? !pushBlocked : (webPlatform === "desktop" && !!support?.ok);
  const pushLine = permissionDenied
    ? t("notifSettings.deniedBody", "Notifications are turned off for this app in your device settings. Turn them on there to get sitter alerts on this device.")
    : pushEnabled
      ? t("notifSettings.pushOnLine", "Push is on. The switches below choose what reaches this device.")
      : t("notifSettings.pushLine", "Hear about sitter activity right away.");

  const sw = (key: keyof Prefs | undefined, label: string, needsPush = false) =>
    key ? (
      <span className="inline-flex items-center gap-2 text-[14px] font-[700]">
        {label}
        <KyaSwitch
          label={label}
          checked={prefs ? Boolean(prefs[key]) : false}
          disabled={!prefs || saving === key || (needsPush && !pushEnabled)}
          onChange={(v) => toggle(key, v)}
        />
      </span>
    ) : null;

  const item = (row: Row, last: boolean) => (
    <div key={row.pushKey} className="px-4 py-3" style={{ borderBottom: last ? undefined : `1px solid ${K.line}` }}>
      <p className="m-0 text-[15px] font-[700]">{row.title}</p>
      <p className="m-0 mt-0.5 text-[13.5px] leading-[1.45]" style={{ color: K.quiet }}>{row.desc}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-6">
        {sw(row.emailKey, t("notifSettings.email", "Email"))}
        {sw(row.pushKey, t("notifSettings.colPush", "Push"), true)}
      </div>
    </div>
  );
  const [sitLog, carePlan, weight, checkin] = ROWS;

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <KyaHeader>
          <KyaBackRow label={t("notifSettings.back", "Back")} onBack={goBack} />
          <KyaTitle title={t("notifSettings.headline", "Notifications")} line={t("notifSettings.bodyNew", "Choose what reaches you by email and on this device.")} />
        </KyaHeader>

        <KyaBody className="gap-5">
          {/* Push on this device */}
          {(canTogglePush || !native) && (
            <KyaCard className="p-4">
              <div className="flex items-start gap-3">
                <KyaIconTile><Smartphone className="size-5" /></KyaIconTile>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[16px] font-[700]">{t("notifSettings.pushOnDevice", "Push on this device")}</p>
                  {canTogglePush ? (
                    <p className="m-0 mt-1 text-[14px] leading-[1.45]" style={{ color: K.quiet }}>{pushLine}</p>
                  ) : (
                    <p className="m-0 mt-1 text-[14px] leading-[1.45]" style={{ color: K.quiet }}>{t("notifSettings.pushInApp", "Push works in the Kya & Co. app.")}</p>
                  )}
                </div>
              </div>
              {canTogglePush && (permissionDenied ? (
                <div className="mt-2"><KyaLink onClick={() => setBlockedOpen(true)}>{t("notifSettings.howToTurnOn", "How to turn on notifications")}</KyaLink></div>
              ) : (
                <div className="mt-3">
                  {pushEnabled
                    ? <KyaSecondaryButton className="w-full" onClick={disablePush} disabled={busy}>{t("notifSettings.turnOffPush", "Turn off push")}</KyaSecondaryButton>
                    : <KyaPrimaryButton onClick={enablePush} disabled={busy}>{t("notifSettings.turnOnPush", "Turn on push")}</KyaPrimaryButton>}
                </div>
              ))}
              {!native && (
                <p className="m-0 mt-3 text-[14px]" style={{ color: K.quiet }}>
                  <Trans
                    i18nKey="notifSettings.orGetTheApp"
                    defaults="Or get the app for <1>iPhone</1> or <2>Android</2>."
                    components={{
                      1: <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="-my-3 inline-block py-3 font-[700]" style={{ color: K.moss }} />,
                      2: <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="-my-3 inline-block py-3 font-[700]" style={{ color: K.moss }} />,
                    }}
                  />
                </p>
              )}
            </KyaCard>
          )}

          <section className="flex flex-col gap-2">
            <KyaGroupLabel>{t("notifSettings.duringSits", "During sits")}</KyaGroupLabel>
            <KyaCard>
              {item({ ...sitLog, title: t("notifSettings.sitterPostedLog", "Sitter posted a daily log"), desc: t("notifSettings.sitterPostedLogDesc", "When a sitter's daily check comes back all normal. Anything flagged always reaches you.") }, false)}
              {item({ ...carePlan, title: t("notifSettings.reviewCarePlan", "Review the care plan before a sit"), desc: t("notifSettings.reviewCarePlanDesc", "A reminder a few days before a sit starts.") }, true)}
            </KyaCard>
          </section>

          <section className="flex flex-col gap-2">
            <KyaGroupLabel>{t("notifSettings.reminders", "Reminders")}</KyaGroupLabel>
            <KyaCard>
              {item(weight, false)}
              {item(checkin, true)}
            </KyaCard>
          </section>

          <section className="flex flex-col gap-2">
            <KyaGroupLabel>{t("notifSettings.emailFromUs", "Email from us")}</KyaGroupLabel>
            <KyaCard>
              {EMAIL_ROWS.map((row, i) => (
                <div key={row.key} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: i < EMAIL_ROWS.length - 1 ? `1px solid ${K.line}` : undefined }}>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[15px] font-[700]">{row.title}</p>
                    <p className="m-0 mt-0.5 text-[13.5px] leading-[1.45]" style={{ color: K.quiet }}>{row.desc}</p>
                  </div>
                  <KyaSwitch
                    label={row.title}
                    checked={prefs ? Boolean(prefs[row.key]) : false}
                    disabled={!prefs || saving === row.key}
                    onChange={(v) => toggle(row.key, v)}
                  />
                </div>
              ))}
            </KyaCard>
          </section>

          <KyaCard className="p-4">
            <div className="flex items-start gap-3">
              <KyaIconTile><ShieldCheck className="size-5" /></KyaIconTile>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[16px] font-[700]">{t("notifSettings.alwaysOn", "Always on")}</p>
                <p className="m-0 mt-1 text-[14px] leading-[1.45]" style={{ color: K.quiet }}>
                  {t("notifSettings.alwaysOnBody", "Health and behavior alerts from a sitter, sit updates, and invites always reach you by email.")}
                </p>
              </div>
            </div>
          </KyaCard>

          <p className="m-0 px-1 text-[13.5px]" style={{ color: K.quiet }}>{t("notifSettings.savesAsYouGo", "Changes save as you go.")}</p>
        </KyaBody>
      </div>
      {blockedOpen && <NotificationsBlockedModal onClose={() => setBlockedOpen(false)} />}
    </KyaPage>
  );
}
