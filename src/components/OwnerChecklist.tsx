import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { Check, ChevronRight, Share, Sparkles } from "lucide-react";

// Persistent getting-started checklist on the owner dashboard. Steps auto-check
// from real state (defaults saved, bird added, sit created); notifications +
// home-screen are self-attested (per-device localStorage). Dismissible.

const DISMISS_KEY = "ppc_owner_checklist_dismissed";
const NOTIF_KEY = "ppc_owner_notif_reviewed";
const HOMESCREEN_KEY = "ppc_owner_homescreen";

function readFlag(k: string): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(k) === "1"; } catch { return false; }
}
function setFlag(k: string) {
  try { window.localStorage.setItem(k, "1"); } catch {}
}

export function OwnerChecklist({ birds, sits }: { birds: any[]; sits: any[] }) {
  const [dismissed, setDismissed] = useState(() => readFlag(DISMISS_KEY));
  const [notifDone, setNotifDone] = useState(() => readFlag(NOTIF_KEY));
  const [homeDone, setHomeDone] = useState(() => readFlag(HOMESCREEN_KEY));
  const [showHome, setShowHome] = useState(false);

  const { data: defaults } = useQuery({
    queryKey: ["owner-defaults"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("owner_emergency_defaults")
        .select("owner_phone, avian_vet_phone")
        .eq("owner_id", u.user.id)
        .maybeSingle();
      return data ?? null;
    },
  });

  if (dismissed) return null;

  const eff = (k: string) => ((defaults as any)?.[k] ?? "").toString().trim();
  const defaultsDone = !!(eff("owner_phone") && eff("avian_vet_phone"));

  type Step = {
    key: string;
    name: string;
    desc: string;
    done: boolean;
    to?: string;
    search?: Record<string, unknown>;
    home?: boolean;
  };
  const steps: Step[] = [
    { key: "defaults", name: "Set your emergency defaults", desc: "Account-level vet & emergency contacts — they carry over to every bird.", done: defaultsDone, to: "/dashboard", search: { emergencyDefaults: true } },
    { key: "bird", name: "Add your first bird", desc: "Build their care plan.", done: birds.length > 0, to: "/birds/new" },
    { key: "home", name: "Add the app to your home screen", desc: "Open it like a native app.", done: homeDone, home: true },
    { key: "notif", name: "Set notification preferences", desc: "How you hear about scans and updates.", done: notifDone, to: "/notifications/settings" },
    { key: "sit", name: "Create your first sit", desc: "Send a sitter a private link.", done: sits.length > 0, to: "/dashboard", search: { newSit: true } },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  const nextKey = steps.find((s) => !s.done)?.key;

  function dismiss() {
    setFlag(DISMISS_KEY);
    setDismissed(true);
  }

  if (allDone) {
    return (
      <section className="rounded-[20px] bg-[#cdeab0] p-5 text-center">
        <Sparkles className="mx-auto size-6 text-[#1f3d12]" />
        <p className="mt-2 text-lg font-medium text-[#1f3d12]">You're all set!</p>
        <p className="mt-1 text-sm text-[#3f5e22]">Your account is ready. Everything you need is on the dashboard.</p>
        <button onClick={dismiss} className="mt-4 rounded-[14px] bg-[#1a3d2e] px-4 py-2 text-sm font-medium text-white">
          Dismiss
        </button>
      </section>
    );
  }

  return (
    <section data-coach="owner-checklist" className="rounded-[20px] bg-[#efe9da] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-medium text-[#1a3d2e]">Let's get you set up</h2>
          <p className="mt-0.5 text-xs text-[#5f5e5a]">{doneCount} of {steps.length} done</p>
        </div>
        <button onClick={dismiss} className="shrink-0 text-xs font-medium text-[#5f5e5a] underline">Hide this</button>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e3dcc9]">
        <div className="h-full rounded-full bg-[#2d6a4f] transition-all" style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} />
      </div>

      <ul className="mt-3 space-y-2">
        {steps.map((s) => {
          const isNext = s.key === nextKey;
          const body = (
            <>
              <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 ${s.done ? "border-warn-green bg-warn-green text-white" : isNext ? "border-[#2d6a4f]" : "border-[#bcb6a3]"}`}>
                {s.done && <Check className="size-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${s.done ? "text-[#9a978c] line-through" : "text-[#1a3d2e]"}`}>{s.name}</span>
                {!s.done && <span className="mt-0.5 block text-xs text-[#5f5e5a]">{s.desc}</span>}
              </span>
              {!s.done && (
                isNext ? (
                  <span className="shrink-0 self-center rounded-full bg-[#1a3d2e] px-3 py-1 text-xs font-semibold text-white">Start</span>
                ) : (
                  <ChevronRight className="size-4 shrink-0 self-center text-[#8a897f]" />
                )
              )}
            </>
          );
          const rowClass = `flex w-full items-start gap-3 rounded-xl p-2.5 text-left ${isNext ? "bg-white ring-1 ring-[#2d6a4f]/30" : ""}`;

          if (s.done) {
            return <li key={s.key} className="flex items-start gap-3 p-2.5 opacity-70">{body}</li>;
          }
          if (s.home) {
            return (
              <li key={s.key}>
                <button type="button" onClick={() => setShowHome((v) => !v)} className={rowClass}>{body}</button>
                {showHome && (
                  <div className="mt-1 space-y-2 rounded-xl bg-white p-3 ring-1 ring-sage-100">
                    <p className="flex items-start gap-1.5 text-xs text-[#1a3d2e]">
                      <span className="font-semibold">iPhone/iPad:</span> Tap <Share className="mx-0.5 inline size-3.5 align-text-bottom" /> in Safari, then choose <span className="font-semibold">Add to Home Screen</span>.
                    </p>
                    <p className="text-xs text-[#1a3d2e]"><span className="font-semibold">Android:</span> Open the browser menu (⋮) and choose <span className="font-semibold">Install app</span> / Add to Home screen.</p>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => { setFlag(HOMESCREEN_KEY); setHomeDone(true); setShowHome(false); }} className="rounded-lg bg-[#1a3d2e] px-3 py-1.5 text-xs font-semibold text-white">Done</button>
                      <button onClick={() => { setFlag(HOMESCREEN_KEY); setHomeDone(true); setShowHome(false); }} className="rounded-lg border border-[#e0d8c4] px-3 py-1.5 text-xs font-semibold text-[#5f5e5a]">Skip</button>
                    </div>
                  </div>
                )}
              </li>
            );
          }
          return (
            <li key={s.key}>
              <Link to={s.to as any} search={s.search as any} className={rowClass}>{body}</Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Mark the notification-preferences step done (call from the settings page).
export function markNotificationsReviewed() {
  setFlag(NOTIF_KEY);
}
