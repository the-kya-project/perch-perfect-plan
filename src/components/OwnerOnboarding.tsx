import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { BrandLogo } from "@/components/BrandLogo";
import { ChevronLeft } from "lucide-react";

// First-run owner orientation: a warm welcome screen, then four light coach-mark
// bubbles pointing at the real bottom-nav tabs, then a hand-off bubble on the
// getting-started checklist. Lighter than the sitter walkthrough — it explains
// "where things live," then the checklist drives the actual setup.
//
// Gated account-level by profiles.welcome_seen_at — the DB flag is authoritative
// and per-account, so it shows once for every account (incl. a second account on
// a shared browser) and never re-shows across devices. No localStorage gate: a
// device flag isn't account-scoped, so it would wrongly suppress the welcome for
// a new account that signs in on a browser that already onboarded a different one.
// Replayable via the "?" in the dashboard header (replayOwnerOnboarding).
// Non-blocking + skippable.

const REPLAY_EVENT = "owner:replay-onboarding";

export function replayOwnerOnboarding() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REPLAY_EVENT));
}

const NAV_STEPS: { target: string; text: string }[] = [
  { target: "owner-tab-home", text: "Your birds live here. Build and manage each one's care plan." },
  { target: "owner-tab-sits", text: "Heading out? Create a sit and send your sitter a private link with everything they need." },
  { target: "owner-tab-activity", text: "While you're away, your sitter's daily health checks and updates show up here." },
  { target: "owner-tab-explore", text: "The bigger Kya Project — care tips, the community, and our conservation mission." },
];
const HANDOFF_TARGET = "owner-checklist";
const HANDOFF_TEXT = "Start here. We'll walk you through getting set up — it only takes a few minutes.";

const PAD = 6;
const GAP = 12;

// A fixed element (the bottom nav) shouldn't be scrolled to — only in-page
// targets (the checklist card) need the page scrolled into view.
function isFixedEl(el: HTMLElement | null): boolean {
  let n: HTMLElement | null = el;
  while (n && n !== document.body) {
    if (window.getComputedStyle(n).position === "fixed") return true;
    n = n.parentElement;
  }
  return false;
}

type Phase = null | "welcome" | "coach" | "handoff";
type Spot = { rect: { top: number; left: number; width: number; height: number; bottom: number } | null; vw: number; vh: number };

export function OwnerOnboarding() {
  const [phase, setPhase] = useState<Phase>(null);
  const [step, setStep] = useState(0); // 0..3 over NAV_STEPS
  const [spot, setSpot] = useState<Spot | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubbleH, setBubbleH] = useState(150);

  // Decide whether to auto-run, and wire up replay. The account's
  // profiles.welcome_seen_at is the single source of truth — show the welcome
  // whenever it's null for the signed-in user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await getLocalUser();
      if (!u.user || cancelled) return;
      const { data } = await supabase.from("profiles").select("welcome_seen_at").eq("id", u.user.id).maybeSingle();
      if (cancelled) return;
      if (!data?.welcome_seen_at) setPhase("welcome");
    })();
    const onReplay = () => { setStep(0); setPhase("welcome"); };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => { cancelled = true; window.removeEventListener(REPLAY_EVENT, onReplay); };
  }, []);

  const activeTarget = phase === "handoff" ? HANDOFF_TARGET : phase === "coach" ? NAV_STEPS[step]?.target : null;

  // Measure + track the current target; retry until it renders, re-measure on
  // resize/scroll so bubbles stay aligned across widths.
  useEffect(() => {
    if (phase !== "coach" && phase !== "handoff") return;
    const target = activeTarget;
    if (!target) return;

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
        const delta = r.top - window.innerHeight * 0.25;
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
    if (phase !== "coach" && phase !== "handoff") return;
    const h = bubbleRef.current?.offsetHeight;
    if (h && Math.abs(h - bubbleH) > 2) setBubbleH(h);
  });

  function finish() {
    (async () => {
      try {
        const { data: u } = await getLocalUser();
        if (u.user) {
          await supabase.from("profiles").update({ welcome_seen_at: new Date().toISOString() }).eq("id", u.user.id);
        }
      } catch {}
    })();
    setPhase(null);
  }

  function next() {
    if (step < NAV_STEPS.length - 1) setStep(step + 1);
    else setPhase("handoff");
  }
  function back() {
    if (phase === "handoff") setPhase("coach");
    else if (step > 0) setStep(step - 1);
    else setPhase("welcome");
  }

  if (phase === null) return null;

  // ---- Welcome (full-screen warm panel) ----
  if (phase === "welcome") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#1a3d2e] text-white">
        <div className="flex items-center justify-end px-5 pt-[max(env(safe-area-inset-top),0.9rem)] pb-2">
          <button onClick={finish} className="text-sm font-medium text-[#cdeab0] underline">Skip</button>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-12 text-center">
          <BrandLogo variant="dark" size="lg" />
          <h1 className="mt-8 text-[22px] font-medium leading-tight">Welcome to Parrot Care Co-Pilot</h1>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/85">
            Build a care plan once, share it with your sitter when you're away, and stay connected to your birds while you're gone.
          </p>
          <button
            onClick={() => { setStep(0); setPhase("coach"); }}
            className="mt-8 w-full max-w-xs rounded-2xl bg-[#cdeab0] py-3 text-sm font-semibold text-[#1a3d2e]"
          >
            Show me around
          </button>
          <button onClick={finish} className="mt-3 text-sm font-medium text-[#cdeab0] underline">Skip</button>
        </div>
      </div>
    );
  }

  // ---- Coach + hand-off bubbles ----
  const isHandoff = phase === "handoff";
  const text = isHandoff ? HANDOFF_TEXT : NAV_STEPS[step].text;
  const rect = spot?.rect ?? null;
  const vw = spot?.vw ?? (typeof window !== "undefined" ? window.innerWidth : 360);
  const vh = spot?.vh ?? (typeof window !== "undefined" ? window.innerHeight : 640);
  const BW = Math.min(300, vw - 24);

  const SAFE_TOP = 58;
  const safeBottom = vh - 84;
  let bubbleStyle: React.CSSProperties;
  if (!rect) {
    const top = Math.max(SAFE_TOP, Math.min((vh - bubbleH) / 2, safeBottom - bubbleH));
    bubbleStyle = { left: (vw - BW) / 2, top, width: BW };
  } else {
    const left = Math.min(Math.max(rect.left + rect.width / 2 - BW / 2, 12), vw - BW - 12);
    const fitsBelow = rect.bottom + GAP + bubbleH <= safeBottom;
    const fitsAbove = rect.top - GAP - bubbleH >= SAFE_TOP;
    // Nav tabs sit at the bottom, so prefer placing the bubble above them.
    const preferTop = !isHandoff;
    let top: number;
    if (preferTop && fitsAbove) top = rect.top - GAP - bubbleH;
    else if (fitsBelow) top = rect.bottom + GAP;
    else if (fitsAbove) top = rect.top - GAP - bubbleH;
    else top = rect.top + GAP;
    top = Math.max(SAFE_TOP, Math.min(top, safeBottom - bubbleH));
    bubbleStyle = { left, top, width: BW };
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0" />

      {rect && (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-[#cdeab0] transition-all duration-200"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(20,40,30,0.6)",
          }}
        />
      )}
      {!rect && <div className="absolute inset-0 bg-[#1a3d2e]/60" />}

      {/* Skip — always available, top-right. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end px-5 pt-[max(env(safe-area-inset-top),0.9rem)]">
        <button onClick={finish} className="pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#1a3d2e] shadow">
          Skip
        </button>
      </div>

      {/* Bubble */}
      <div ref={bubbleRef} className="pointer-events-auto absolute rounded-2xl bg-white p-4 shadow-xl" style={bubbleStyle}>
        {isHandoff ? (
          <>
            <p className="text-sm font-medium leading-snug text-[#1a3d2e]">{text}</p>
            <p className="mt-2 text-xs leading-snug text-[#5f5e5a]">Want this tour again? Tap the question mark up top anytime.</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button onClick={back} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[#5f5e5a]">
                <ChevronLeft className="size-4" /> Back
              </button>
              <button onClick={finish} className="shrink-0 rounded-lg bg-[#1a3d2e] px-4 py-1.5 text-xs font-semibold text-white">
                Let's go
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#5f5e5a]">Step {step + 1} of {NAV_STEPS.length}</p>
            <p className="mt-1.5 text-sm font-medium leading-snug text-[#1a3d2e]">{text}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button onClick={back} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[#5f5e5a]">
                <ChevronLeft className="size-4" /> Back
              </button>
              <div className="mx-1 h-1 flex-1 overflow-hidden rounded-full bg-[#e8e1d0]">
                <div className="h-full rounded-full bg-[#1a3d2e] transition-[width]" style={{ width: `${Math.round(((step + 1) / NAV_STEPS.length) * 100)}%` }} />
              </div>
              <button onClick={next} className="shrink-0 rounded-lg bg-[#1a3d2e] px-4 py-1.5 text-xs font-semibold text-white">
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
