import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { BrandLockup } from "@/components/BrandLogo";
import { ChevronLeft, ArrowRight, Check } from "lucide-react";
import { useMyPermissions } from "@/lib/useCapability";
import { getMemberOnboardingContext, type MemberHousehold } from "@/lib/onboarding.functions";

// First-run orientation for an ACCOUNT-HOLDING household member (someone added
// to an existing household via invite — NOT the external link-sitter, which has
// its own SitterOnboarding). A member joins an already-populated household, so
// this is a short, context-aware coach-mark tour over their REAL Home: it names
// the owner + birds, then points only at surfaces their capabilities allow. No
// demo mode and no bird-setup step — they don't create birds.
//
// Gated by the SAME profiles.welcome_seen_at as the owner flow (reused so each
// account onboards once and the two never collide — a given account is owner xor
// member at first run; see AppOnboarding's branch). Replayable via the header
// "?" (the shared owner:replay-onboarding event/flag).

const REPLAY_EVENT = "owner:replay-onboarding";
const REPLAY_FLAG = "owner-replay-tour";

type Step = {
  target?: string; // data-coach key; absent = centered concept bubble
  headline: string;
  body: string;
};

// "Buzz" / "Buzz and Willow" / "Buzz, Willow, and Kiwi" / "Buzz, Willow, and 2 more"
function formatBirds(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return "their birds";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  if (n.length === 3) return `${n[0]}, ${n[1]}, and ${n[2]}`;
  return `${n[0]}, ${n[1]}, and ${n.length - 2} more`;
}

function welcomeBody(households: MemberHousehold[]): string {
  if (!households.length) return "You've been added to a household to help care for their birds.";
  const primary = households[0];
  const birds = formatBirds(primary.birdNames);
  if (households.length === 1) {
    return `You've been added to ${primary.ownerName}'s household to help care for ${birds}.`;
  }
  return `You've been added to ${primary.ownerName}'s household (and ${households.length - 1} other${households.length - 1 === 1 ? "" : "s"}) to help care for ${birds}.`;
}

const PAD = 6;
const GAP = 12;

function isFixedEl(el: HTMLElement | null): boolean {
  let n: HTMLElement | null = el;
  while (n && n !== document.body) {
    if (window.getComputedStyle(n).position === "fixed") return true;
    n = n.parentElement;
  }
  return false;
}

type Phase = null | "welcome" | "coach";
type Spot = { rect: { top: number; left: number; width: number; height: number; bottom: number } | null; vw: number; vh: number };

export function MemberOnboarding() {
  const [phase, setPhase] = useState<Phase>(null);
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [spot, setSpot] = useState<Spot | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubbleH, setBubbleH] = useState(160);

  const ctxFn = useServerFn(getMemberOnboardingContext);
  const { data: ctx } = useQuery({ queryKey: ["member-onboarding-context"], queryFn: () => ctxFn(), staleTime: 5 * 60_000 });
  const households = ctx?.households ?? [];
  const ownerName = households[0]?.ownerName || "Your household's owner";

  // Capability union across every household this member belongs to — show a step
  // if they can do it ANYWHERE. Mirrors permissions; it does not enforce them.
  const { data: perms } = useMyPermissions();
  const caps = (() => {
    const s = new Set<string>();
    for (const set of perms?.byOwner.values() ?? []) for (const c of set) s.add(c);
    return s;
  })();

  // Steps: baseline always; then capability-gated. Never owner-only concepts
  // (no add-bird, fosters, handoffs, household/permissions management, invites).
  const steps: Step[] = [
    { target: "owner-tab-home", headline: "Home is your hub.", body: "Today's needs and the birds you help care for all live here. It's the screen you'll open most." },
    { target: "owner-flock", headline: "Open any bird to read their plan.", body: "Tap a bird to see their care plan — food, handling, home, health, and emergency info, all in one place." },
  ];
  if (caps.has("log_daily_care")) {
    steps.push({ headline: "Pitch in on daily care.", body: "Open a bird to check off today's tasks, log a weight, or add a moment as you go." });
  }
  if (caps.has("record_health")) {
    steps.push({ target: "owner-tab-activity", headline: "Daily health checks.", body: "Run a quick health scan here. Anything worth a closer look gets flagged fast." });
  }
  if (caps.has("manage_sits")) {
    steps.push({ target: "owner-tab-sits", headline: "Sits live here.", body: "See who's covering each bird and when." });
  }
  const TOTAL = steps.length + 1; // + wrap-up

  const isWrapUp = step === steps.length;
  const stepDef = !isWrapUp ? steps[step] : null;
  const activeTarget = phase === "coach" ? stepDef?.target ?? null : null;
  const isNavTarget = !!activeTarget && activeTarget.startsWith("owner-tab-");

  // First-run gate (welcome_seen_at) + replay wiring. Same flag/event as owner.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await getLocalUser();
      if (!u.user || cancelled) return;
      const { data } = await supabase.from("profiles").select("welcome_seen_at, display_name").eq("id", u.user.id).maybeSingle();
      if (cancelled) return;
      setFirstName(((data?.display_name ?? "").toString().trim().split(/\s+/)[0]) || "");
      let replay = false;
      try { replay = sessionStorage.getItem(REPLAY_FLAG) === "1"; } catch { /* ignore */ }
      if (replay) { try { sessionStorage.removeItem(REPLAY_FLAG); } catch { /* ignore */ } setStep(0); setPhase("welcome"); return; }
      if (!data?.welcome_seen_at) { setStep(0); setPhase("welcome"); }
    })();
    const onReplay = () => { try { sessionStorage.removeItem(REPLAY_FLAG); } catch { /* ignore */ } setStep(0); setPhase("welcome"); };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => { cancelled = true; window.removeEventListener(REPLAY_EVENT, onReplay); };
  }, []);

  // Measure + track the current target; retry until it renders. Centered steps
  // (no target, or a target not on screen) skip this and render mid-screen.
  useEffect(() => {
    if (phase !== "coach" || !activeTarget) { setSpot(null); return; }
    const target = activeTarget;
    let raf = 0;
    let tries = 0;
    const measure = (): boolean => {
      const el = document.querySelector(`[data-coach="${target}"]`);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!el) { setSpot({ rect: null, vw, vh }); return false; }
      const r = el.getBoundingClientRect();
      setSpot({ rect: { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom }, vw, vh });
      return true;
    };
    const tick = () => {
      const el = document.querySelector(`[data-coach="${target}"]`) as HTMLElement | null;
      if (el && !isFixedEl(el)) {
        const r = el.getBoundingClientRect();
        const delta = r.top - window.innerHeight * 0.28;
        if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: "auto" });
      }
      const ok = measure();
      if (!ok && tries < 40) { tries += 1; raf = requestAnimationFrame(tick); }
    };
    tick();
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [phase, step, activeTarget]);

  useLayoutEffect(() => {
    if (phase !== "coach") return;
    const h = bubbleRef.current?.offsetHeight;
    if (h && Math.abs(h - bubbleH) > 2) setBubbleH(h);
  });

  function markSeen() {
    (async () => {
      try {
        const { data: u } = await getLocalUser();
        if (u.user) await supabase.from("profiles").update({ welcome_seen_at: new Date().toISOString() }).eq("id", u.user.id);
      } catch { /* ignore */ }
    })();
  }
  function startCoach() { setStep(0); setPhase("coach"); }
  function finish() { markSeen(); setPhase(null); }
  function next() { setStep((s) => Math.min(s + 1, steps.length)); }
  function back() { if (step > 0) setStep((s) => s - 1); else setPhase("welcome"); }

  if (phase === null) return null;

  // ---- Welcome ----
  if (phase === "welcome") {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--ink)] text-white">
        <div className="px-[22px] pt-[max(env(safe-area-inset-top),18px)]">
          <BrandLockup orientation="horizontal" variant="ink" size={100} />
        </div>
        <div className="flex-1 px-6 pt-[80px]">
          <p className="t-eyebrow text-[var(--teal)]">Welcome</p>
          <h1 className="mt-3 text-[38px] font-[400] leading-[1.05] tracking-[-0.02em]">{firstName ? `Hi, ${firstName}.` : "Welcome."}</h1>
          <p className="mt-3.5 max-w-[32ch] text-[15px] leading-[1.55] text-white/80">{welcomeBody(households)}</p>
          <p className="mt-3 max-w-[32ch] text-[14px] leading-[1.5] text-white/65">Here's a quick look at what you can do.</p>
        </div>
        <div className="px-6 pb-[max(env(safe-area-inset-bottom),24px)]">
          <button
            onClick={startCoach}
            className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-[var(--lime)] py-3.5 text-[14.5px] font-[500] text-[var(--ink)] active:scale-[0.99]"
          >
            <ArrowRight className="size-4" /> Show me around
          </button>
          <div className="mt-3.5 text-center">
            <button onClick={finish} className="text-[13px] font-[500] text-white/60 underline underline-offset-[3px]">Skip for now</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Coach + wrap-up ----
  const rect = spot?.rect ?? null;
  const vw = spot?.vw ?? (typeof window !== "undefined" ? window.innerWidth : 360);
  const vh = spot?.vh ?? (typeof window !== "undefined" ? window.innerHeight : 640);
  const BW = Math.min(300, vw - 24);
  const SAFE_TOP = 58;
  const safeBottom = vh - 84;
  const centered = isWrapUp || !activeTarget || !rect;

  let bubbleStyle: React.CSSProperties;
  if (centered) {
    const top = Math.max(SAFE_TOP, Math.min((vh - bubbleH) / 2, safeBottom - bubbleH));
    bubbleStyle = { left: (vw - BW) / 2, top, width: BW };
  } else {
    const left = Math.min(Math.max(rect.left + rect.width / 2 - BW / 2, 12), vw - BW - 12);
    const fitsBelow = rect.bottom + GAP + bubbleH <= safeBottom;
    const fitsAbove = rect.top - GAP - bubbleH >= SAFE_TOP;
    let top: number;
    if (isNavTarget && fitsAbove) top = rect.top - GAP - bubbleH;
    else if (fitsBelow) top = rect.bottom + GAP;
    else if (fitsAbove) top = rect.top - GAP - bubbleH;
    else top = rect.top + GAP;
    top = Math.max(SAFE_TOP, Math.min(top, safeBottom - bubbleH));
    bubbleStyle = { left, top, width: BW };
  }

  return (
    <div className="fixed inset-0 z-[60]">
      {!centered ? (
        <div
          className="pointer-events-none absolute rounded-[14px] ring-2 ring-[var(--lime)] transition-all duration-200"
          style={{
            top: rect!.top - PAD,
            left: rect!.left - PAD,
            width: rect!.width + PAD * 2,
            height: rect!.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(20,40,30,0.6)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[var(--ink)]/55" />
      )}

      {!isWrapUp && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end px-5 pt-[max(env(safe-area-inset-top),0.9rem)]">
          <button onClick={finish} className="pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-xs font-[500] text-[var(--ink)] shadow">Skip tour</button>
        </div>
      )}

      <div ref={bubbleRef} className="pointer-events-auto absolute rounded-[18px] border border-[var(--line)] bg-[var(--cream)] p-4 shadow-xl" style={bubbleStyle}>
        {isWrapUp ? (
          <div className="text-center">
            <p className="t-eyebrow text-[var(--mute2)]">{TOTAL} of {TOTAL}</p>
            <h2 className="mt-1.5 text-[18px] font-[500] text-[var(--ink)]">You're all set.</h2>
            <p className="mt-2 text-[13px] leading-[1.5] text-[var(--ink2)]">{ownerName} manages everything else — just reach out to them if you ever need to do more.</p>
            <button onClick={finish} className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[13px] bg-[var(--lime)] py-3 text-[14px] font-[500] text-[var(--ink)] active:scale-[0.99]">
              <Check className="size-4" /> Got it
            </button>
            <p className="mt-2.5 text-[11.5px] leading-[1.45] text-[var(--mute)]">Tap the ? in the top bar anytime to revisit this.</p>
          </div>
        ) : (
          <>
            <p className="t-eyebrow text-[var(--mute2)]">{step + 1} of {TOTAL}</p>
            <h2 className="mt-1.5 text-[15px] font-[500] leading-[1.2] text-[var(--ink)]">{stepDef!.headline}</h2>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-[var(--ink2)]">{stepDef!.body}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button onClick={back} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1.5 text-xs font-[500] text-[var(--mute)]">
                <ChevronLeft className="size-4" /> Back
              </button>
              <div className="mx-1 h-1 flex-1 overflow-hidden rounded-full bg-[#e8e1d0]">
                <div className="h-full rounded-full bg-[var(--ink)] transition-[width]" style={{ width: `${Math.round(((step + 1) / TOTAL) * 100)}%` }} />
              </div>
              <button onClick={next} className="inline-flex shrink-0 items-center gap-1 rounded-[10px] bg-[var(--lime)] px-4 py-2 text-[13px] font-[500] text-[var(--ink)]">
                Next <ArrowRight className="size-3.5" />
              </button>
            </div>
            <div className="mt-2 text-center">
              <button onClick={finish} className="text-[12px] font-[500] text-[var(--mute)] underline underline-offset-2">Skip tour</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
