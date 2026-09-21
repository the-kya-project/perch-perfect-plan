import { createFileRoute, useRouter, useCanGoBack, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { ArrowLeft, ShieldAlert, Bell, Smartphone } from "lucide-react";
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
} from "@/lib/pushNative";
import { markNotificationsReviewed } from "@/components/OwnerChecklist";
import { AddToHomeModal } from "@/components/AddToHomeModal";
import { InkHero, IconTile, Card, PrimaryButton, CtaLink } from "@/components/system";
import { friendlyError } from "@/lib/errorMessage";

export const Route = createFileRoute("/_authenticated/scans/settings")({
  head: () => ({ meta: [{ title: "Notification settings — Kya & Co." }] }),
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
};

type Row = {
  emailKey?: keyof Prefs; // push-only rows (reminder nudges) have no email counterpart
  pushKey: keyof Prefs;
  title: string;
  desc: string;
};

const ROWS: Row[] = [
  {
    emailKey: "notify_sitter_log",
    pushKey: "push_sitter_log",
    title: "Sitter added a daily log",
    desc: "Tell me when a sitter posts a new daily log entry during a sit.",
  },
  {
    emailKey: "notify_care_plan_reminder",
    pushKey: "push_care_plan_reminder",
    title: "Care plan update reminder",
    desc: "Remind me to review the care plan before an upcoming sit.",
  },
  {
    pushKey: "push_weight_reminder",
    title: "Weigh-in reminders",
    desc: "Nudge me when a bird is due for a weight check, based on my own logging rhythm.",
  },
  {
    pushKey: "push_checkin_reminder",
    title: "Check-in reminders",
    desc: "A gentle reminder if it's been a while since the last entry.",
  },
];

function NotificationsSettingsPage() {
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
  const [a2hsOpen, setA2hsOpen] = useState(false);
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

  useEffect(() => {
    // Visiting/reviewing notification preferences checks off that getting-started step.
    markNotificationsReviewed();
    (async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles")
        .select(
          "notify_sitter_opened, notify_sitter_log, notify_care_plan_reminder, push_sitter_opened, push_sitter_log, push_care_plan_reminder, push_weight_reminder, push_checkin_reminder",
        )
        .eq("id", u.user.id)
        .maybeSingle();
      // push_weight_reminder/push_checkin_reminder postdate the generated types
      if (data) setPrefs(data as unknown as Prefs);
      if (native) {
        // detectPushSupport() reports "native-app" (web-push is genuinely
        // unavailable in a WKWebView), but the shell DOES support push via
        // APNs/FCM — so the UI must not treat the shell as unsupported.
        setSupport({ ok: true });
        const p = await nativePushPermission();
        // "prompt" and "unknown" both mean "not decided yet" to this UI, which
        // speaks the web's NotificationPermission vocabulary.
        setPermission(p === "granted" || p === "denied" ? p : "default");
        if (p === "granted") {
          // Already granted: re-register to pick up a ROTATED token and
          // re-sync it. Silent — the OS does not prompt again.
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
      toast.error(friendlyError(e, "Could not save preference."));
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
            toast.error("Could not turn on notifications. Please try again.");
          }
          return;
        }
        await saveToken({ data: { token: res.token, transport: res.transport } });
        setNativeToken(res.token);
        setPermission("granted");
        toast.success("Push notifications enabled on this device.");
        return;
      }

      const { publicKey } = await getVapidKey();
      const sub = await subscribeToPush(publicKey);
      setPermission(getNotificationPermission());
      if (!sub) {
        // The prompt was dismissed or denied. If it's now hard-denied, guide them
        // to settings; otherwise they just dismissed it and can try again.
        if (getNotificationPermission() === "denied") setBlockedOpen(true);
        else toast.error("Notification permission was not granted.");
        return;
      }
      await saveSub({ data: sub });
      setPushEndpoint(sub.endpoint);
      toast.success("Push notifications enabled on this device.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not enable push.";
      if (msg === "ios-not-installed") {
        toast.error("On iPhone, add this app to your Home Screen first.");
      } else {
        toast.error(msg);
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
        setNativeToken(null);
        toast.success("Push notifications turned off on this device.");
        return;
      }
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await deleteSub({ data: { endpoint } });
      setPushEndpoint(null);
      toast.success("Push notifications turned off on this device.");
    } catch (e: unknown) {
      toast.error(friendlyError(e, "Could not disable push."));
    } finally {
      setBusy(false);
    }
  }

  const pushEnabled = native ? !!nativeToken : !!pushEndpoint;
  const pushBlocked = support && !support.ok;
  // Supported here, but the user/phone has blocked notifications in settings.
  const permissionDenied = !!support?.ok && permission === "denied" && !pushEnabled;

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          eyebrow="Notifications"
          headline="Notifications"
          body="Choose which sitter activity reaches you, by email and on this device."
        />

        <main className="space-y-4 px-5 pt-5">
          {/* Push enable banner */}
          <Card>
            <div className="flex items-start gap-3 p-4">
              <IconTile size={38} icon={<Smartphone className="size-5" />} />
              <div className="min-w-0 flex-1">
                <div className="t-item">Push on this device</div>
                {pushBlocked && support?.reason === "ios-not-installed" ? (
                  <p className="t-body mt-1 text-[var(--mute)]">
                    On iPhone, add this app to your home screen first, then come back here.
                  </p>
                ) : pushBlocked ? (
                  <p className="t-body mt-1 text-[var(--mute)]">
                    This browser doesn't support push notifications. Add the app to your home
                    screen to turn push on.
                  </p>
                ) : permissionDenied ? (
                  <p className="t-body mt-1 text-[var(--mute)]">
                    Notifications are turned off for this app in your device settings. Turn them
                    on there to get sitter alerts on this device.
                  </p>
                ) : pushEnabled ? (
                  <p className="t-body mt-1 text-[var(--mute)]">
                    Enabled. Per-event push toggles below control what reaches this device.
                  </p>
                ) : (
                  <p className="t-body mt-1 text-[var(--mute)]">
                    Get instant alerts for sitter activity without needing to check email.
                  </p>
                )}
                {/* The shell is never "blocked" now — it has its own transport —
                    so this only ever fires for browsers/PWAs. */}
                {pushBlocked && (
                  <div className="mt-2">
                    <CtaLink label="How to add this app to your home screen" onPress={() => setA2hsOpen(true)} />
                  </div>
                )}
                {permissionDenied && (
                  <div className="mt-2">
                    <CtaLink label="How to turn on notifications" onPress={() => setBlockedOpen(true)} />
                  </div>
                )}
                {!pushBlocked && !permissionDenied && (
                  <div className="mt-3">
                    <PrimaryButton
                      tone={pushEnabled ? "outline" : "ink"}
                      full={false}
                      onPress={pushEnabled ? disablePush : enablePush}
                      disabled={busy}
                    >
                      {pushEnabled ? "Turn off" : "Enable push"}
                    </PrimaryButton>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Per-event toggles: email | push */}
          <div>
            <div className="mb-2 flex items-center gap-6 px-4">
              <span className="t-eyebrow flex-1 text-[var(--mute2)]">Event</span>
              <span className="t-eyebrow w-12 text-center text-[var(--mute2)]">Email</span>
              <span className="t-eyebrow w-12 text-center text-[var(--mute2)]">Push</span>
            </div>
            <Card>
              {ROWS.map((row, i) => {
                const emailChecked = prefs && row.emailKey ? Boolean(prefs[row.emailKey]) : false;
                const pushChecked = prefs ? Boolean(prefs[row.pushKey]) : false;
                return (
                  <div
                    key={row.pushKey}
                    className={`flex items-start gap-4 px-4 py-3 ${i < ROWS.length - 1 ? "border-b border-[var(--line2)]" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="t-item">{row.title}</div>
                      <p className="t-meta mt-0.5">{row.desc}</p>
                    </div>
                    {row.emailKey ? (
                      <input
                        type="checkbox"
                        aria-label={`Email: ${row.title}`}
                        className="mt-1 size-5 w-12 rounded border-[var(--line)] accent-[var(--moss)]"
                        checked={emailChecked}
                        disabled={!prefs || saving === row.emailKey}
                        onChange={(e) => toggle(row.emailKey!, e.target.checked)}
                      />
                    ) : (
                      <span aria-hidden className="t-meta mt-1 w-12 text-center text-[var(--mute2)]">—</span>
                    )}
                    <input
                      type="checkbox"
                      aria-label={`Push: ${row.title}`}
                      className="mt-1 size-5 w-12 rounded border-[var(--line)] accent-[var(--moss)] disabled:opacity-40"
                      checked={pushChecked}
                      disabled={!prefs || saving === row.pushKey || !pushEnabled}
                      onChange={(e) => toggle(row.pushKey, e.target.checked)}
                    />
                  </div>
                );
              })}
            </Card>
          </div>

          <div className="flex items-start gap-3 rounded-[18px] border border-[var(--amber-line)] bg-[var(--amber-fill)] p-4">
            <IconTile size={38} tone="amber" icon={<ShieldAlert className="size-5" />} />
            <div className="min-w-0 flex-1">
              <div className="t-item text-[var(--amber-ink)]">
                Health &amp; behavior alerts are always on
              </div>
              <p className="t-body mt-1 text-[var(--amber-ink)]">
                If a sitter flags a health or behavior concern, we'll always send the alert by
                email and (if enabled) push. This safety alert can't be turned off.
              </p>
            </div>
          </div>

          <p className="t-meta flex items-center justify-center gap-1.5 pt-2 text-center">
            <Bell className="size-3.5" />
            Flagged scans always send email; all other events follow the toggles above.
          </p>

          {/* Changes save automatically as each toggle flips; this is just a clear
              way to finish and leave the screen on phones. */}
          <PrimaryButton tone="ink" onPress={goBack}>Done</PrimaryButton>
          <p className="t-meta text-center">Your choices save automatically.</p>
        </main>
      </div>

      {a2hsOpen && <AddToHomeModal onClose={() => setA2hsOpen(false)} />}
      {blockedOpen && <NotificationsBlockedModal onClose={() => setBlockedOpen(false)} />}
    </div>
  );
}
