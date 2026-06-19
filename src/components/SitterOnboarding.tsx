import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { AlertTriangle, ChevronLeft } from "lucide-react";

// First-visit sitter onboarding: a two-screen welcome, then a coach-mark bubble
// walkthrough that points at the REAL on-screen elements (tagged with
// data-coach="..."). Additive only — it never changes the underlying screens.
// Skippable, non-blocking (Emergency always reachable), first-visit-only via
// localStorage, and replayable via replaySitterOnboarding().

const SEEN_KEY = "ppc_sitter_onboarded"; // per-device; fine if it re-shows after clearing data
const REPLAY_EVENT = "sitter:replay-onboarding";

export function replaySitterOnboarding() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REPLAY_EVENT));
}

// "Willow" / "Willow and Moxie" / "Willow, Moxie, and Kiwi"
function formatNames(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return "your bird";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(", ")}, and ${n[n.length - 1]}`;
}

function objectPronoun(sex: string | null | undefined): string {
  const s = (sex ?? "").toString().trim().toLowerCase();
  return s.startsWith("f") ? "her" : s.startsWith("m") ? "him" : "them";
}
function possessivePronoun(sex: string | null | undefined): string {
  const s = (sex ?? "").toString().trim().toLowerCase();
  return s.startsWith("f") ? "her" : s.startsWith("m") ? "his" : "their";
}

// A fixed-position element (the bottom nav) shouldn't be scrolled to — only
// in-page targets (cards, care-plan sections) need the page scrolled.
function isFixedEl(el: HTMLElement | null): boolean {
  let n: HTMLElement | null = el;
  while (n && n !== document.body) {
    if (window.getComputedStyle(n).position === "fixed") return true;
    n = n.parentElement;
  }
  return false;
}

const CP_TARGET: Record<string, string> = {
  food: "cp-food",
  handling: "cp-handling",
  home: "cp-home",
  health: "cp-health",
  emergency: "cp-emergency",
};

type CoachStep = { target: string; text: string; place: "top" | "bottom" | "auto"; route: "home" | "today" | "careplan"; emphasis?: boolean };
type Phase = null | "welcome" | "overview" | "coach";
type Spot = { rect: { top: number; left: number; width: number; height: number; bottom: number } | null; vw: number; vh: number };

const PAD = 6;
const GAP = 12;

export function SitterOnboarding({ birds, bird, careSections, token }: { birds: any[]; bird: any; careSections?: string[]; token: string }) {
  const [phase, setPhase] = useState<Phase>(null);
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const navigate = useNavigate();
  const router = useRouter();
  const stepRef = useRef(0);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubbleH, setBubbleH] = useState(150);
  // When replayed from a header chip / "?" icon, remember where the sitter was so
  // we can return them there when the walkthrough ends (first-run has no origin).
  const replayReturnRef = useRef<string | null>(null);

  const list = Array.isArray(birds) && birds.length ? birds : bird ? [bird] : [];
  const names = list.map((b) => (b?.name ?? "").toString().trim()).filter(Boolean);
  const allNames = formatNames(names);
  const activeName = (bird?.name ?? names[0] ?? "your bird").toString().trim() || "your bird";
  const obj = objectPronoun(bird?.sex);
  const poss = possessivePronoun(bird?.sex);
  // Stable key so a new careSections array ref each render doesn't rebuild steps.
  const careKey = (careSections ?? []).join(",");

  const steps = useMemo<CoachStep[]>(() => {
    const s: CoachStep[] = [];
    const cpText: Record<string, string> = {
      food: `What ${activeName} eats, how much, and when.`,
      handling: `How to interact with ${activeName} safely.`,
      home: `${activeName}'s environment and what to watch for.`,
      health: `${activeName}'s normal baseline and any conditions.`,
      emergency: "Vet and owner contacts if something's wrong.",
    };

    s.push({
      target: "nav-home",
      route: "home",
      place: "top",
      text: "This is your home base. You'll see all the birds you're caring for and what each one still needs today.",
    });
    if (list.length > 1) {
      s.push({
        target: "bird-card",
        route: "home",
        place: "auto",
        text: `Tap a bird to see their day and check in on them. You can switch between ${allNames} anytime.`,
      });
    }

    // Full care plan: the bird-specific source of truth (distinct from Parrots 101).
    s.push({
      target: "care-plan-link",
      route: "today",
      place: "auto",
      text: `This is ${activeName}'s full care plan — everything specific to ${obj}: ${poss} food, routine, handling, home, and emergency info. This is your source of truth for caring for ${obj}.`,
    });
    for (const key of careSections ?? []) {
      if (CP_TARGET[key]) s.push({ target: CP_TARGET[key], route: "careplan", place: "auto", text: cpText[key] });
    }
    s.push({
      target: "cp-header",
      route: "careplan",
      place: "auto",
      text: `Remember — this care plan is specific to ${activeName}. Parrots 101 is general parrot care; come here for what's true for ${obj}.`,
    });

    // The daily scan — the most important thing a sitter does.
    s.push({
      target: "scan-card",
      route: "today",
      place: "auto",
      text: `Do this every day. It's a quick health check, and ${activeName}'s results are shared with the owner — it's how you both catch any early signs of illness, since birds tend to hide when they're unwell.`,
    });
    s.push({
      target: "nav-guide",
      route: "today",
      place: "top",
      text: `General parrot care, for when you want to understand something. For ${activeName}'s specific needs, use ${poss} care plan.`,
    });
    s.push({
      target: "nav-emergency",
      route: "today",
      place: "top",
      emphasis: true,
      text: "If something's ever wrong, this is always here. You'll never be in trouble for using it.",
    });
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, allNames, activeName, obj, poss, careKey]);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setPhase("welcome");
    } catch {}
    const onReplay = () => {
      replayReturnRef.current = router.state.location.href;
      setStep(0);
      stepRef.current = 0;
      setPhase("welcome");
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  // Measure + track the current coach target. Retries until the element renders
  // (it may be on a route we just navigated to), and re-measures on resize/scroll.
  useEffect(() => {
    if (phase !== "coach") return;
    const cur = steps[step];
    if (!cur) return;

    // Targets live on different screens — the bird card on Home, the care-plan
    // sections inside the care sheet, the scan card on a bird's Today — so make
    // sure we're on the right screen before pointing at the target. The retry
    // loop below waits for it to render after navigation.
    if (cur.route === "home") {
      navigate({ to: "/sitter/$token/home", params: { token } });
    } else if (cur.route === "careplan") {
      navigate({ to: "/sitter/$token/care-sheet", params: { token }, search: { birdId: bird?.id } });
    } else {
      navigate({ to: "/sitter/$token", params: { token }, search: { birdId: bird?.id } });
    }

    let raf = 0;
    let tries = 0;

    const measure = (): boolean => {
      const el = document.querySelector(`[data-coach="${cur.target}"]`);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (!el) {
        setSpot({ rect: null, vw, vh });
        return false;
      }
      const r = el.getBoundingClientRect();
      setSpot({ rect: { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom }, vw, vh });
      return true;
    };

    const tick = () => {
      const el = document.querySelector(`[data-coach="${cur.target}"]`) as HTMLElement | null;
      // Scroll in-page targets so their top sits ~25% down — keeps the section's
      // heading visible with room for the bubble. Fixed nav items aren't scrolled.
      if (el && !isFixedEl(el)) {
        const r = el.getBoundingClientRect();
        const delta = r.top - window.innerHeight * 0.25;
        if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: "auto" });
      }
      const ok = measure();
      if (!ok && tries < 40) {
        tries += 1;
        raf = requestAnimationFrame(tick);
      }
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
  }, [phase, step, steps]);

  // Track the bubble's real height so the clamp above can keep it on-screen.
  useLayoutEffect(() => {
    if (phase !== "coach") return;
    const h = bubbleRef.current?.offsetHeight;
    if (h && Math.abs(h - bubbleH) > 2) setBubbleH(h);
  });

  // Close without navigating — used by the Emergency link so it keeps its own
  // navigation to the emergency screen.
  function markSeenAndClose() {
    try { window.localStorage.setItem(SEEN_KEY, "1"); } catch {}
    setPhase(null);
  }
  // Skip / Done: dismiss. On replay, return the sitter to where they launched it;
  // on first run, land on the Today tab.
  function dismissToToday() {
    markSeenAndClose();
    const ret = replayReturnRef.current;
    replayReturnRef.current = null;
    if (ret) router.history.push(ret);
    else navigate({ to: "/sitter/$token", params: { token } });
  }

  function startCoach() {
    // The per-step effect navigates to the screen each target lives on (Home
    // first, then a bird's Today), so we just enter the coach at step 0.
    setStep(0);
    stepRef.current = 0;
    setPhase("coach");
  }

  function next() {
    if (step < steps.length - 1) {
      const n = step + 1;
      stepRef.current = n;
      setStep(n);
    } else {
      dismissToToday();
    }
  }
  function back() {
    if (step > 0) {
      const n = step - 1;
      stepRef.current = n;
      setStep(n);
    } else {
      setPhase("overview");
    }
  }

  if (phase === null) return null;

  const EmergencyLink = (
    <Link
      to="/sitter/$token/emergency"
      params={{ token }}
      onClick={markSeenAndClose}
      className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full bg-[#993C1D] px-3 py-1.5 text-xs font-semibold text-white shadow"
    >
      <AlertTriangle className="size-3.5" /> Emergency
    </Link>
  );

  // ---- Welcome + overview (full-screen warm cards) ----
  if (phase === "welcome" || phase === "overview") {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-[#1a3d2e] text-white">
        <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),0.9rem)] pb-2">
          {EmergencyLink}
          <button onClick={dismissToToday} className="text-sm font-medium text-[#cdeab0] underline">Skip</button>
        </div>

        {phase === "welcome" ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
            <div className="flex items-center justify-center -space-x-3">
              {list.slice(0, 4).map((b, i) =>
                b?.photo_url ? (
                  <img
                    key={b.id ?? i}
                    src={b.photo_url}
                    alt={b.name ?? ""}
                    style={{ objectPosition: b.photo_position ?? "50% 20%" }}
                    className="size-16 rounded-2xl object-cover ring-2 ring-[#1a3d2e]"
                  />
                ) : (
                  <div key={b?.id ?? i} className="grid size-16 place-items-center rounded-2xl bg-white/10 text-2xl font-medium ring-2 ring-[#1a3d2e]">
                    {(b?.name?.slice(0, 1) ?? "?").toUpperCase()}
                  </div>
                ),
              )}
            </div>
            <h1 className="mt-5 text-[22px] font-medium leading-tight">You're caring for {allNames}.</h1>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/85">
              Everything you need is right here. Let's take a minute to show you around.
            </p>
            <button onClick={() => setPhase("overview")} className="mt-7 w-full max-w-xs rounded-2xl bg-[#cdeab0] py-3 text-sm font-semibold text-[#1a3d2e]">
              Show me around
            </button>
            <button onClick={dismissToToday} className="mt-3 text-sm font-medium text-[#cdeab0] underline">Skip</button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
            <h1 className="text-[22px] font-medium leading-tight">How this app works</h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/85">
              This app has everything you need to care for {allNames}: a daily routine and a quick health
              check, a parrot care guide, and an emergency button if anything's ever wrong. It takes about a
              minute to learn — we'll point out each part.
            </p>
            <button onClick={startCoach} className="mt-7 w-full max-w-xs rounded-2xl bg-[#cdeab0] py-3 text-sm font-semibold text-[#1a3d2e]">
              Got it, show me around
            </button>
            <button onClick={dismissToToday} className="mt-3 text-sm font-medium text-[#cdeab0] underline">Skip</button>
          </div>
        )}
      </div>
    );
  }

  // ---- Coach-mark walkthrough ----
  const cur = steps[step];
  const rect = spot?.rect ?? null;
  const vw = spot?.vw ?? (typeof window !== "undefined" ? window.innerWidth : 360);
  const vh = spot?.vh ?? (typeof window !== "undefined" ? window.innerHeight : 640);
  const BW = Math.min(300, vw - 24);

  // Bubble placement: always position by `top` (computed from the measured bubble
  // height) and CLAMP it fully on-screen between the sticky header and the bottom
  // nav — so the Next button is always reachable without scrolling, no matter
  // where the target is.
  const SAFE_TOP = 58; // clears the sticky layout header
  const safeBottom = vh - 84; // clears the bottom nav + safe area
  let bubbleStyle: React.CSSProperties;
  if (!rect) {
    const top = Math.max(SAFE_TOP, Math.min((vh - bubbleH) / 2, safeBottom - bubbleH));
    bubbleStyle = { left: (vw - BW) / 2, top, width: BW };
  } else {
    const left = Math.min(Math.max(rect.left + rect.width / 2 - BW / 2, 12), vw - BW - 12);
    const fitsBelow = rect.bottom + GAP + bubbleH <= safeBottom;
    const fitsAbove = rect.top - GAP - bubbleH >= SAFE_TOP;
    let top: number;
    if (cur.place === "top" && fitsAbove) top = rect.top - GAP - bubbleH;
    else if (fitsBelow) top = rect.bottom + GAP;
    else if (fitsAbove) top = rect.top - GAP - bubbleH;
    else top = rect.top + GAP; // target taller than the gap — sit near its top
    top = Math.max(SAFE_TOP, Math.min(top, safeBottom - bubbleH));
    bubbleStyle = { left, top, width: BW };
  }

  return (
    <div className="fixed inset-0 z-50">
      {/* Transparent capture layer — keeps the app behind inert during the tour. */}
      <div className="absolute inset-0" />

      {/* Spotlight: a transparent hole over the target with a huge dimming shadow. */}
      {rect && (
        <div
          className={`pointer-events-none absolute rounded-xl ring-2 transition-all duration-200 ${cur.emphasis ? "ring-[#f4a259]" : "ring-[#cdeab0]"}`}
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(20,40,30,0.6)",
          }}
        />
      )}
      {/* When the target isn't found, dim the whole screen so the bubble still reads. */}
      {!rect && <div className="absolute inset-0 bg-[#1a3d2e]/60" />}

      {/* Persistent Emergency (top-left) + Skip (top-right). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),0.9rem)]">
        {EmergencyLink}
        <button onClick={dismissToToday} className="pointer-events-auto rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#1a3d2e] shadow">
          Skip
        </button>
      </div>

      {/* Bubble */}
      <div ref={bubbleRef} className="pointer-events-auto absolute rounded-2xl bg-white p-4 shadow-xl" style={bubbleStyle}>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#5f5e5a]">Step {step + 1} of {steps.length}</p>
        <p className="mt-1.5 text-sm font-medium leading-snug text-[#1a3d2e]">{cur.text}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button onClick={back} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-[#5f5e5a]">
            <ChevronLeft className="size-4" /> Back
          </button>
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <span key={i} className={`size-1.5 rounded-full ${i === step ? "bg-[#1a3d2e]" : "bg-[#d8d2c2]"}`} />
            ))}
          </div>
          <button onClick={next} className="rounded-lg bg-[#1a3d2e] px-4 py-1.5 text-xs font-semibold text-white">
            {step === steps.length - 1 ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
