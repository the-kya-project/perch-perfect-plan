import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ShieldAlert, Bell, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  detectPushSupport,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentEndpoint,
  type PushSupport,
} from "@/lib/push";
import {
  getVapidPublicKey,
  savePushSubscription,
  deletePushSubscription,
} from "@/lib/push.functions";
import { markNotificationsReviewed } from "@/components/OwnerChecklist";

export const Route = createFileRoute("/_authenticated/notifications/settings")({
  head: () => ({ meta: [{ title: "Notification settings — Parrot Care Co-Pilot" }] }),
  component: NotificationsSettingsPage,
});

type Prefs = {
  notify_sitter_opened: boolean;
  notify_sitter_log: boolean;
  notify_care_plan_reminder: boolean;
  push_sitter_opened: boolean;
  push_sitter_log: boolean;
  push_care_plan_reminder: boolean;
};

type Row = {
  emailKey: keyof Prefs;
  pushKey: keyof Prefs;
  title: string;
  desc: string;
};

const ROWS: Row[] = [
  {
    emailKey: "notify_sitter_opened",
    pushKey: "push_sitter_opened",
    title: "Sitter opened the care sheet",
    desc: "Tell me when a sitter first opens or starts using the shared care sheet.",
  },
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
];

function NotificationsSettingsPage() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<keyof Prefs | null>(null);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const getVapidKey = useServerFn(getVapidPublicKey);
  const saveSub = useServerFn(savePushSubscription);
  const deleteSub = useServerFn(deletePushSubscription);

  useEffect(() => {
    // Visiting/reviewing notification preferences checks off that getting-started step.
    markNotificationsReviewed();
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase
        .from("profiles")
        .select(
          "notify_sitter_opened, notify_sitter_log, notify_care_plan_reminder, push_sitter_opened, push_sitter_log, push_care_plan_reminder",
        )
        .eq("id", u.user.id)
        .maybeSingle();
      if (data) setPrefs(data as Prefs);
      setSupport(detectPushSupport());
      setPushEndpoint(await getCurrentEndpoint());
    })();
  }, []);

  async function toggle(key: keyof Prefs, next: boolean) {
    if (!prefs) return;
    const prev = prefs[key];
    setPrefs({ ...prefs, [key]: next });
    setSaving(key);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in.");
      const patch: Partial<Prefs> = { [key]: next } as Partial<Prefs>;
      const { error } = await supabase.from("profiles").update(patch).eq("id", u.user.id);
      if (error) throw error;
    } catch (e: unknown) {
      setPrefs({ ...prefs, [key]: prev });
      toast.error(e instanceof Error ? e.message : "Could not save preference.");
    } finally {
      setSaving(null);
    }
  }

  async function enablePush() {
    setBusy(true);
    try {
      const { publicKey } = await getVapidKey();
      const sub = await subscribeToPush(publicKey);
      if (!sub) {
        toast.error("Notification permission was not granted.");
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
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await deleteSub({ data: { endpoint } });
      setPushEndpoint(null);
      toast.success("Push notifications turned off on this device.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not disable push.");
    } finally {
      setBusy(false);
    }
  }

  const pushEnabled = !!pushEndpoint;
  const pushBlocked = support && !support.ok;

  return (
    <div className="min-h-screen bg-sage-50">
      <main className="mx-auto max-w-md px-5 py-6">
        <Link to="/notifications" className="inline-flex items-center gap-1 text-sm text-sage-600">
          <ArrowLeft className="size-4" /> Notifications
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight">Notification settings</h1>
        <p className="mt-1 text-sm text-sage-600">
          Choose which sitter activity reaches you, by email and on this device.
        </p>

        {/* Push enable banner */}
        <section className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-sage-100">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-sage-700" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-sage-900">Push on this device</div>
              {pushBlocked && support?.reason === "ios-not-installed" ? (
                <p className="mt-1 text-xs text-sage-600">
                  On iPhone, add this app to your Home Screen first (Safari Share menu → Add
                  to Home Screen), then come back here.
                </p>
              ) : pushBlocked ? (
                <p className="mt-1 text-xs text-sage-600">
                  This browser doesn't support push notifications.
                </p>
              ) : pushEnabled ? (
                <p className="mt-1 text-xs text-sage-600">
                  Enabled. Per-event push toggles below control what reaches this device.
                </p>
              ) : (
                <p className="mt-1 text-xs text-sage-600">
                  Get instant alerts for sitter activity without needing to check email.
                </p>
              )}
            </div>
            {!pushBlocked && (
              <button
                onClick={pushEnabled ? disablePush : enablePush}
                disabled={busy}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  pushEnabled
                    ? "bg-sage-100 text-sage-800 hover:bg-sage-200"
                    : "bg-sage-700 text-white hover:bg-sage-800"
                } disabled:opacity-50`}
              >
                {pushEnabled ? "Turn off" : "Enable push"}
              </button>
            )}
          </div>
        </section>

        {/* Per-event toggles: email | push */}
        <section className="mt-4">
          <div className="mb-2 flex items-center gap-6 px-4 text-[10px] font-bold uppercase tracking-widest text-sage-500">
            <span className="flex-1">Event</span>
            <span className="w-12 text-center">Email</span>
            <span className="w-12 text-center">Push</span>
          </div>
          <div className="space-y-3">
            {ROWS.map((row) => {
              const emailChecked = prefs ? Boolean(prefs[row.emailKey]) : false;
              const pushChecked = prefs ? Boolean(prefs[row.pushKey]) : false;
              return (
                <div
                  key={row.emailKey}
                  className="flex items-start gap-4 rounded-2xl bg-white p-4 ring-1 ring-sage-100"
                >
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-sage-900">{row.title}</div>
                    <p className="mt-1 text-xs text-sage-600">{row.desc}</p>
                  </div>
                  <input
                    type="checkbox"
                    aria-label={`Email: ${row.title}`}
                    className="mt-1 size-5 w-12 rounded border-sage-300"
                    checked={emailChecked}
                    disabled={!prefs || saving === row.emailKey}
                    onChange={(e) => toggle(row.emailKey, e.target.checked)}
                  />
                  <input
                    type="checkbox"
                    aria-label={`Push: ${row.title}`}
                    className="mt-1 size-5 w-12 rounded border-sage-300 disabled:opacity-40"
                    checked={pushChecked}
                    disabled={!prefs || saving === row.pushKey || !pushEnabled}
                    onChange={(e) => toggle(row.pushKey, e.target.checked)}
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700" />
          <div>
            <div className="text-sm font-semibold text-amber-900">
              Health &amp; behavior alerts are always on
            </div>
            <p className="mt-1 text-xs text-amber-800">
              If a sitter flags a health or behavior concern, we'll always send the alert by
              email and (if enabled) push. This safety alert can't be turned off.
            </p>
          </div>
        </section>

        <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-sage-600">
          <Bell className="size-3.5" />
          Flagged scans always send email; all other events follow the toggles above.
        </p>
      </main>
    </div>
  );
}
