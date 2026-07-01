import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { BrandLockup } from "@/components/BrandLogo";
import { ChevronLeft, ArrowRight, Feather } from "lucide-react";
import { setTourDemo } from "@/lib/tourDemo";

// First-run owner orientation: a warm welcome, then a 10-step guided tour of the
// real Home (nav tabs + content sections) with coach-mark bubbles, ending on a
// "set up your first bird" CTA. Lighter than the sitter walkthrough — it explains
// "where things live," then hands off to bird setup.
//
// Gated account-level by profiles.welcome_seen_at (authoritative, per-account,
// cross-device). Replayable from the "?" in the header (replayOwnerOnboarding):
// it sets a session flag + dispatches an event so it works from any screen
// (the flag re-triggers once the dashboard mounts). Non-blocking + skippable.
//
// Targets resolve via [data-coach="…"]; a step with no target (or whose target
// isn't on screen — e.g. a brand-new owner with no flock yet) renders as a
// centered concept bubble over a dimmed backdrop.

const REPLAY_EVENT = "owner:replay-onboarding";
const REPLAY_FLAG = "owner-replay-tour";

export function replayOwnerOnboarding() {
  try { sessionStorage.setItem(REPLAY_FLAG, "1"); } catch { /* ignore */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REPLAY_EVENT));
}

type Step = {
  target?: string; // data-coach key; absent = centered concept bubble
  headline: string;
  body: string;
};

// 9 explained steps; step index 9 is the wrap-up CTA (rendered specially).
const STEPS: Step[] = [
  { target: "owner-tab-home", headline: "Home is where you land.", body: "Here you'll find daily check-ins, your flock, and anything happening soon. It's the screen you'll open most." },
  { target: "owner-today", headline: "Today, at a glance.", body: "Sits starting, hatch days, a foster settling in — whatever's worth knowing today shows up here first." },
  { target: "owner-flock", headline: "Each bird gets a record.", body: "Tap a bird to see their care plan, weight history, journal, identity, and photos. The works." },
  { target: "owner-fosters", headline: "Fostering a bird?", body: "They live here while they're with you — until they're adopted, or until you decide they're staying. (It happens.)" },
  { headline: "Saying goodbye? Hand off the record.", body: "When a bird moves to a new home their full record can transfer with them. Care plan, history, identity, everything." },
  { target: "owner-household", headline: "Family who shares the care?", body: "Spouse, partner, kids, roommates — add them as household. They get access to your care plan and health checks so they can step in when needed." },
  { target: "owner-tab-sits", headline: "Going away? Set up a sit.", body: "Pet sitters get a temporary link — just for the trip. Household members get more details and a daily checklist." },
  { target: "owner-tab-activity", headline: "Daily health checks.", body: "Quick questions to track health. Pet sitters are asked to run a health check daily. Flags show up fast when something's off." },
  { target: "owner-tab-explore", headline: "Stories, education, conservation.", body: "What The Kya Project is up to. Field notes, deep dives, community and other ways to get involved. Read when you have a minute." },
];
const TOTAL = STEPS.length + 1; // + wrap-up = 10

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

export function OwnerOnboarding() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>(null);
  const [step, setStep] = useState(0); // 0..STEPS.length (last index = wrap-up)
  const [firstName, setFirstName] = useState("");
  // Actual owned-bird count (NOT demo) — decides the wrap-up variant.
  const [birdCount, setBirdCount] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubbleH, setBubbleH] = useState(160);

  const isWrapUp = step === STEPS.length;
  const stepDef = !isWrapUp ? STEPS[step] : null;
  const activeTarget = phase === "coach" ? stepDef?.target ?? null : null;
  const isNavTarget = !!activeTarget && activeTarget.startsWith("owner-tab-");

  // Owned-bird count from the DB (owner_id = me) — refreshed at every tour start.
  async function loadBirdCount() {
    try {
      const { data: u } = await getLocalUser();
      if (!u.user) return;
      const { count } = await supabase.from("birds").select("id", { count: "exact", head: true }).eq("owner_id", u.user.id);
      setBirdCount(count ?? 0);
    } catch { /* ignore — defaults to 0 (variant A) */ }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await getLocalUser();
      if (!u.user || cancelled) return;
      const { data } = await supabase.from("profiles").select("welcome_seen_at, display_name").eq("id", u.user.id).maybeSingle();
      if (cancelled) return;
      setFirstName(((data?.display_name ?? "").toString().trim().split(/\s+/)[0]) || "");
      void loadBirdCount();
      let replay = false;
      try { replay = sessionStorage.getItem(REPLAY_FLAG) === "1"; } catch { /* ignore */ }
      if (replay) { try { sessionStorage.removeItem(REPLAY_FLAG); } catch { /* ignore */ } setStep(0); setPhase("welcome"); return; }
      if (!data?.welcome_seen_at) { setStep(0); setPhase("welcome"); }
    })();
    const onReplay = () => { try { sessionStorage.removeItem(REPLAY_FLAG); } catch { /* ignore */ } void loadBirdCount(); setStep(0); setPhase("welcome"); };
    window.addEventListener(REPLAY_EVENT, onReplay);
    // Safety: never leave demo mode on if this unmounts mid-tour.
    return () => { cancelled = true; setTourDemo(false); window.removeEventListener(REPLAY_EVENT, onReplay); };
  }, []);

  // Measure + track the current target; retry until it renders, re-measure on
  // resize/scroll. Centered steps (no target) skip this.
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
  function startCoach() { setTourDemo(true); setStep(0); setPhase("coach"); }
  function finish() { setTourDemo(false); markSeen(); setPhase(null); }
  function addBird() { setTourDemo(false); markSeen(); setPhase(null); navigate({ to: "/birds/new" }); }
  function next() { setStep((s) => Math.min(s + 1, STEPS.length)); }
  function back() {
    if (step > 0) setStep((s) => s - 1);
    else setPhase("welcome");
  }

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
          <p className="mt-3.5 max-w-[30ch] text-[15px] leading-[1.55] text-white/80">A quick walkthrough first, then we'll set up your bird.</p>
        </div>
        <div className="px-6 pb-[max(env(safe-area-inset-bottom),24px)]">
          <button
            onClick={startCoach}
            className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-[var(--lime)] py-3.5 text-[14.5px] font-[500] text-[var(--ink)] active:scale-[0.99]"
          >
            <ArrowRight className="size-4" /> Show me around
          </button>
          <div className="mt-3.5 text-center">
            <button onClick={addBird} className="text-[13px] font-[500] text-white/60 underline underline-offset-[3px]">Skip and add my bird</button>
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

  // Centered bubble when there's no target (concept steps, wrap-up, or a target
  // that isn't on screen yet — e.g. a new owner with no flock).
  const centered = isWrapUp || !activeTarget || !rect;

  let bubbleStyle: React.CSSProperties;
  if (centered) {
    const top = Math.max(SAFE_TOP, Math.min((vh - bubbleH) / 2, safeBottom - bubbleH));
    bubbleStyle = { left: (vw - BW) / 2, top, width: BW };
  } else {
    const left = Math.min(Math.max(rect.left + rect.width / 2 - BW / 2, 12), vw - BW - 12);
    const fitsBelow = rect.bottom + GAP + bubbleH <= safeBottom;
    const fitsAbove = rect.top - GAP - bubbleH >= SAFE_TOP;
    // Nav tabs sit at the bottom — prefer placing the bubble above them.
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

      {/* Skip — always available, top-right (hidden on wrap-up, which has its own actions). */}
      {!isWrapUp && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-end px-5 pt-[max(env(safe-area-inset-top),0.9rem)]">
          <button onClick={finish} className="pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-xs font-[500] text-[var(--ink)] shadow">Skip tour</button>
        </div>
      )}

      <div ref={bubbleRef} className="pointer-events-auto absolute rounded-[18px] border border-[var(--line)] bg-[var(--cream)] p-4 shadow-xl" style={bubbleStyle}>
        {isWrapUp ? (
          <div className="text-center">
            <p className="t-eyebrow text-[var(--mute2)]">{TOTAL} of {TOTAL}</p>
            <h2 className="mt-1.5 text-[18px] font-[500] text-[var(--ink)]">That's the tour.</h2>
            {birdCount === 0 ? (
              <>
                <p className="mt-2 text-[13px] leading-[1.5] text-[var(--ink2)]">Now the fun part — let's set up your first bird.</p>
                <button onClick={addBird} className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-[13px] bg-[var(--lime)] py-3 text-[14px] font-[500] text-[var(--ink)] active:scale-[0.99]">
                  <Feather className="size-4" /> Add my first bird
                </button>
                <button onClick={finish} className="mt-2 w-full rounded-[13px] py-2.5 text-[13px] font-[500] text-[var(--mute)] active:scale-[0.99]">
                  Skip for now
                </button>
                <p className="mt-2.5 text-[11.5px] leading-[1.45] text-[var(--mute)]">You can add a bird anytime from Home — tap the ? to revisit the tour.</p>
              </>
            ) : (
              <>
                <p className="mt-2 text-[13px] leading-[1.5] text-[var(--ink2)]">Anytime you need a refresher, the ? is right up top.</p>
                <button onClick={finish} className="mt-3.5 flex w-full items-center justify-center rounded-[13px] bg-[var(--lime)] py-3 text-[14px] font-[500] text-[var(--ink)] active:scale-[0.99]">
                  Got it
                </button>
              </>
            )}
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
