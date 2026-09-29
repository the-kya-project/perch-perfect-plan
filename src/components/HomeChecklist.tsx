// One-time post-setup checklist for NEW accounts (owner or member). Shown at the
// top of Home; NOT persistent — it auto-hides once every applicable item is done,
// once dismissed, or once the account is no longer new (created > 30 days ago).
// No DB migration: "new" keys off profiles.created_at, dismissal off localStorage.
//
// Role-aware: everyone sees install + notifications; bird owners also get
// "create a care plan" + "add emergency info" (a member helping someone else's
// flock owns no birds, so those don't apply to them).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, X, Download, Bell, ClipboardList, Siren } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { getNotificationPermission } from "@/lib/push";
import { useAppSurface } from "@/lib/appSurface";
import { registerForNativePush } from "@/lib/pushNative";
import { savePushToken } from "@/lib/push.functions";
import { useServerFn } from "@tanstack/react-start";
import {
  APP_STORE_BADGE, APP_STORE_BADGE_SIZE, APP_STORE_URL,
  PLAY_STORE_BADGE, PLAY_STORE_BADGE_SIZE, PLAY_STORE_URL,
} from "@/lib/storeLinks";

const NEW_ACCOUNT_DAYS = 30;
const dismissKey = (uid: string) => `ppc_setup_checklist_dismissed_${uid}`;

export function HomeChecklist() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  // Which surface, and what reminders mean there (see lib/appSurface).
  const surface = useAppSurface();
  const saveToken = useServerFn(savePushToken);
  // Web notification permission. Only consulted on desktop now — inside the
  // shell it answers for the WEBVIEW, not the app, which is why the old row
  // never reflected real APNs/FCM state.
  const [notifGranted, setNotifGranted] = useState(false);

  // Account age (new-account gate) + true ownership (owner_id = me, NOT the
  // RLS-broadened Home list which also includes birds you only help with) + the
  // two owner completion signals.
  const { data } = useQuery({
    queryKey: ["setup-checklist"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const id = u.user.id;
      const [profRes, birdsRes, emerRes] = await Promise.all([
        supabase.from("profiles").select("created_at").eq("id", id).maybeSingle(),
        // Active birds only — the checklist's "create a care plan" points at
        // firstBirdId, which must be an active bird, not a passed one.
        supabase.from("birds").select("id, setup_complete").eq("owner_id", id).is("passed_at", null).order("created_at", { ascending: false }),
        supabase.from("owner_emergency_defaults").select("owner_phone, avian_vet_phone").eq("owner_id", id).maybeSingle(),
      ]);
      const owned = (birdsRes.data ?? []) as { id: string; setup_complete: boolean | null }[];
      const em = emerRes.data as any;

      // Emergency info can live on the BIRD as well as on the owner defaults,
      // and mergeEmergency treats the bird's own value as authoritative with
      // the default as fallback. Checking only the defaults meant an owner who
      // filled emergency info on every bird individually — which the rest of
      // the app considers complete — was nagged to "add" it forever, with no
      // way to satisfy the item short of re-entering it as a default.
      const birdIds = owned.map((b) => b.id);
      let perBird: Array<{ bird_id: string; owner_phone: string | null; avian_vet_phone: string | null }> = [];
      if (birdIds.length) {
        const { data: ec } = await supabase
          .from("emergency_contacts").select("bird_id, owner_phone, avian_vet_phone").in("bird_id", birdIds);
        perBird = (ec ?? []) as typeof perBird;
      }
      const filled = (v: unknown) => !!(v ?? "").toString().trim();
      // A default covers every bird, so it alone is enough. Otherwise every
      // active bird must carry its own — one covered bird out of three is not
      // "done". Deliberately the same either/or on the two required fields the
      // previous check used, so this can only ever mark MORE owners complete,
      // never resurface the checklist for someone who had finished it.
      const defaultsCover = filled(em?.owner_phone) || filled(em?.avian_vet_phone);
      const everyBirdCovered = owned.length > 0 && owned.every((b) => {
        const row = perBird.find((r) => r.bird_id === b.id);
        return filled(row?.owner_phone) || filled(row?.avian_vet_phone);
      });

      return {
        id,
        createdAt: profRes.data?.created_at ?? null,
        ownsBirds: owned.length > 0,
        firstBirdId: owned[0]?.id as string | undefined,
        carePlanDone: owned.some((b) => !!b.setup_complete),
        emergencyDone: defaultsCover || everyBirdCovered,
      };
    },
  });

  useEffect(() => {
    setNotifGranted(getNotificationPermission() === "granted");
    if (data?.id) {
      try { setDismissed(localStorage.getItem(dismissKey(data.id)) === "1"); } catch { /* ignore */ }
    }
  }, [data?.id]);

  const isNew = useMemo(() => {
    if (!data?.createdAt) return false;
    const age = Date.now() - new Date(data.createdAt).getTime();
    return age >= 0 && age <= NEW_ACCOUNT_DAYS * 86_400_000;
  }, [data?.createdAt]);

  if (!data || dismissed || !isNew) return null;

  type Item = {
    key: string; label: string; icon: ReactNode; done: boolean;
    onAction?: () => void; hint?: string; badge?: "ios" | "android";
  };

  // ONE reminders step per surface, never two. The old pair — "Install the
  // app" and "Turn on notifications" — was wrong in both live apps: there is
  // nothing to install inside the shell, and the notifications row called
  // Notification.requestPermission(), the WEB api, which answers for the
  // webview rather than the app and so never reflected real APNs/FCM state.
  const remindersStep: Item =
    surface.surface === "native"
      ? surface.nativePermission === "denied"
        ? {
            key: "reminders",
            label: "Turn on reminders",
            icon: <Bell className="size-4" />,
            done: false,
            hint: "Notifications are off. Turn them on in your phone's settings.",
          }
        : {
            key: "reminders",
            label: "Turn on reminders",
            icon: <Bell className="size-4" />,
            done: surface.nativePermission === "granted",
            onAction:
              surface.nativePermission === "granted"
                ? undefined
                : async () => {
                    const res = await registerForNativePush();
                    if (!res.ok) return;
                    try { await saveToken({ data: { token: res.token, transport: res.transport } }); }
                    catch { /* the row stays open; Settings can retry */ }
                  },
          }
      : surface.surface === "mobile-web"
        ? {
            // A phone browser cannot see whether the app is installed, so the
            // honest signal is whether this ACCOUNT has ever registered a
            // device token. Web push on a phone needed the home-screen PWA,
            // which we no longer ask anyone to do — so reminders come with
            // the app, and this replaces both old rows.
            key: "reminders",
            label: "Get the app",
            icon: <Download className="size-4" />,
            done: surface.hasNativeDevice,
            onAction: surface.hasNativeDevice
              ? undefined
              : () => window.open(surface.storePlatform === "ios" ? APP_STORE_URL : PLAY_STORE_URL, "_blank", "noopener"),
            hint: surface.hasNativeDevice
              ? undefined
              : "Reminders, quick logging, and your flock's whole record, right on your phone. Same account, nothing to move over.",
            badge: surface.hasNativeDevice ? undefined : surface.storePlatform,
          }
        : {
            // Desktop web push genuinely works, so it keeps its own row —
            // relabelled to match Settings and the app.
            key: "reminders",
            label: "Turn on reminders",
            icon: <Bell className="size-4" />,
            done: notifGranted,
            onAction: notifGranted
              ? undefined
              : async () => {
                  try {
                    if (typeof Notification !== "undefined") {
                      const p = await Notification.requestPermission();
                      setNotifGranted(p === "granted");
                    }
                  } catch { /* ignore */ }
                },
          };

  const items: Item[] = [remindersStep];
  if (data.ownsBirds) {
    items.push({
      key: "care-plan",
      label: "Create a care plan",
      icon: <ClipboardList className="size-4" />,
      done: data.carePlanDone,
      onAction: () =>
        data.firstBirdId
          ? navigate({ to: "/birds/$birdId/setup", params: { birdId: data.firstBirdId }, search: { step: 1 } })
          : navigate({ to: "/birds/new" }),
    });
    items.push({
      key: "emergency",
      label: "Add emergency info",
      icon: <Siren className="size-4" />,
      done: data.emergencyDone,
      onAction: () => navigate({ to: "/dashboard", search: { emergencyDefaults: true } }),
    });
  }

  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null; // auto-hide once everything applicable is done

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem(dismissKey(data!.id), "1"); } catch { /* ignore */ }
  }

  return (
    <section className="rounded-[18px] bg-white p-4 ring-1 ring-[var(--line2)]" style={{ boxShadow: "0 6px 14px -8px rgba(40,50,40,.08)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="t-section">Finish setting up</p>
          <p className="t-meta mt-0.5">{doneCount} of {items.length} done</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Dismiss checklist" className="grid size-8 shrink-0 place-items-center rounded-full text-[var(--mute2)] active:bg-black/[0.04]">
          <X className="size-4" />
        </button>
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map((it) => {
          const tappable = !it.done && !!it.onAction;
          return (
            <li key={it.key}>
              <button
                type="button"
                disabled={!tappable}
                onClick={it.onAction}
                className={`flex w-full items-center gap-3 rounded-[12px] px-2 py-2 text-left ${tappable ? "active:bg-black/[0.03]" : "cursor-default"}`}
              >
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full ${it.done ? "bg-[var(--lime)] text-[var(--ink)]" : "bg-[var(--cream2)] text-[var(--moss)]"}`}
                >
                  {it.done ? <Check className="size-4" /> : it.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[14px] font-[500] ${it.done ? "text-[var(--mute)] line-through" : "text-[var(--ink)]"}`}>{it.label}</span>
                  {!it.done && it.hint && <span className="block text-[12px] leading-snug text-[var(--mute)]">{it.hint}</span>}
                  {!it.done && it.badge && (
                    <img
                      src={it.badge === "ios" ? APP_STORE_BADGE : PLAY_STORE_BADGE}
                      width={(it.badge === "ios" ? APP_STORE_BADGE_SIZE : PLAY_STORE_BADGE_SIZE).width}
                      height={(it.badge === "ios" ? APP_STORE_BADGE_SIZE : PLAY_STORE_BADGE_SIZE).height}
                      alt={it.badge === "ios" ? "Download on the App Store" : "Get it on Google Play"}
                      className="mt-2 block"
                    />
                  )}
                </span>
                {tappable && <ChevronRight className="size-4 shrink-0 text-[var(--mute2)]" />}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
