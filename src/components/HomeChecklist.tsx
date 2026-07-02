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
import { AddToHomeModal } from "@/components/AddToHomeModal";
import { useInstallState, isStandalone, type InstallBranch } from "@/lib/pwaInstall";

const NEW_ACCOUNT_DAYS = 30;
const dismissKey = (uid: string) => `ppc_setup_checklist_dismissed_${uid}`;

// Short, branch-appropriate hint under the "Install the app" row (full steps
// are in the modal it opens). Sentence case, no em dashes.
function installHint(branch: InstallBranch): string {
  switch (branch) {
    case "ios-safari": return "Tap share, then Add to Home Screen. Needed for push alerts.";
    case "ios-other": return "Open this page in Safari to install. Needed for push alerts.";
    case "android-native": return "Tap to install the app for push alerts.";
    case "android-other": return "Add it to your home screen for push alerts.";
    default: return "Optional on a computer. Push alerts are made for your phone.";
  }
}

export function HomeChecklist() {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const { branch: installBranch } = useInstallState();
  // Client-only signals, re-read on mount (and after the notifications tap).
  const [installed, setInstalled] = useState(false);
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
        supabase.from("birds").select("id, setup_complete").eq("owner_id", id).order("created_at", { ascending: false }),
        supabase.from("owner_emergency_defaults").select("owner_phone, avian_vet_phone").eq("owner_id", id).maybeSingle(),
      ]);
      const owned = (birdsRes.data ?? []) as { id: string; setup_complete: boolean | null }[];
      const em = emerRes.data as any;
      return {
        id,
        createdAt: profRes.data?.created_at ?? null,
        ownsBirds: owned.length > 0,
        firstBirdId: owned[0]?.id as string | undefined,
        carePlanDone: owned.some((b) => !!b.setup_complete),
        emergencyDone: !!((em?.owner_phone ?? "").toString().trim() || (em?.avian_vet_phone ?? "").toString().trim()),
      };
    },
  });

  useEffect(() => {
    setInstalled(isStandalone());
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

  type Item = { key: string; label: string; icon: ReactNode; done: boolean; onAction?: () => void; hint?: string };
  const items: Item[] = [
    {
      key: "install",
      label: "Install the app",
      icon: <Download className="size-4" />,
      done: installed,
      onAction: installed ? undefined : () => setInstallOpen(true),
      hint: installed ? undefined : installHint(installBranch),
    },
    {
      key: "notifications",
      label: "Turn on notifications",
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
    },
  ];
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
                </span>
                {tappable && <ChevronRight className="size-4 shrink-0 text-[var(--mute2)]" />}
              </button>
            </li>
          );
        })}
      </ul>
      {installOpen && <AddToHomeModal onClose={() => setInstallOpen(false)} />}
    </section>
  );
}
