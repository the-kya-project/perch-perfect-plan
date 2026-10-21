import type { TFunction } from "i18next";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { pickLocale } from "@/lib/i18n";
import { objectPronoun, possessivePronoun } from "@/lib/i18n/pronouns";
import { AlertTriangle, ChevronLeft, Check, X } from "lucide-react";
import { K, SERIF } from "@/components/kya";
import { birdNames } from "@/lib/birdNames";

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
// Takes the sitter view's own t: it runs its own i18n instance and language.
function formatNames(t: TFunction, names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return t("nameList.yourBird", "your bird");
  return birdNames(t, n);
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

type CoachStep = { target: string; text: string; place: "top" | "bottom" | "auto"; route: "home" | "today" | "careplan" | "guide"; emphasis?: boolean };
type Phase = null | "welcome" | "overview" | "coach" | "closing";
type Spot = { rect: { top: number; left: number; width: number; height: number; bottom: number } | null; vw: number; vh: number };

const PAD = 6;
const GAP = 12;

export function SitterOnboarding({ birds, bird, careSections, hasClips, token }: { birds: any[]; bird: any; careSections?: string[]; hasClips?: boolean; token: string }) {
  const { t, i18n } = useTranslation();
  const locale = pickLocale(i18n.language);
  const [phase, setPhase] = useState<Phase>(null);
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const navigate = useNavigate();
  const stepRef = useRef(0);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubbleH, setBubbleH] = useState(150);

  const list = Array.isArray(birds) && birds.length ? birds : bird ? [bird] : [];
  const names = list.map((b) => (b?.name ?? "").toString().trim()).filter(Boolean);
  const allNames = formatNames(t, names);
  const activeName = (bird?.name ?? names[0] ?? "your bird").toString().trim() || "your bird";
  const obj = objectPronoun(bird?.sex, locale);
  const poss = possessivePronoun(bird?.sex, locale);
  // Stable key so a new careSections array ref each render doesn't rebuild steps.
  const careKey = (careSections ?? []).join(",");

  const steps = useMemo<CoachStep[]>(() => {
    const s: CoachStep[] = [];
    const single = list.length <= 1;
    const cpText: Record<string, string> = {
      food: t("sitterOnboarding.step.cp.food", "What {{name}} eats, how much, and when.", { name: activeName }),
      handling: t("sitterOnboarding.step.cp.handling", "How to interact with {{name}} safely.", { name: activeName }),
      home: t("sitterOnboarding.step.cp.home", "{{name}}'s environment and what to watch for.", { name: activeName }),
      health: t("sitterOnboarding.step.cp.health", "{{name}}'s normal baseline and any conditions.", { name: activeName }),
      emergency: t("sitterOnboarding.step.cp.emergency", "Vet and owner contacts if something's wrong."),
    };

    // Home — intro the Home nav tab, then the birds, then tapping into one.
    // One-bird sits have no Home tab (they open straight on Today), so these
    // two steps would point at nothing.
    if (!single) s.push({
      target: "nav-home",
      route: "home",
      place: "top",
      text: t("sitterOnboarding.step.homeNav", "This is your home base — every bird you're caring for and what each one still needs today."),
    });
    if (!single) s.push({
      target: "bird-card",
      route: "home",
      place: "auto",
      text: single
        ? t("sitterOnboarding.step.birdCard.single", "Tap {{name}} to open {{their}} day.", { name: activeName, their: poss })
        : t("sitterOnboarding.step.birdCard.multi", "Tap a bird to open their day and check in on them."),
    });

    // Today — intro the tab, then tour the screen top to bottom.
    s.push({
      target: "nav-today",
      route: "today",
      place: "top",
      text: t("sitterOnboarding.step.todayNav", "The Today tab — {{name}}'s daily routine and health check, all in one place.", { name: activeName }),
    });
    s.push({
      target: "welcome-card",
      route: "today",
      place: "auto",
      text: single
        ? t("sitterOnboarding.step.welcomeCard.single", "This is {{name}}'s card — photo and key info at a glance. This screen shows everything for {{them}}.", { name: activeName, them: obj })
        : t("sitterOnboarding.step.welcomeCard.multi", "This is {{name}}'s card — photo and key info at a glance. This screen shows everything for the bird you've selected.", { name: activeName }),
    });
    if (!single) {
      s.push({
        target: "bird-switcher",
        route: "today",
        place: "bottom",
        text: t("sitterOnboarding.step.birdSwitcher", "Switch between the birds you're caring for up here — each has their own day and care plan."),
      });
    }
    s.push({
      target: "scan-card",
      route: "today",
      place: "auto",
      text: t("sitterOnboarding.step.scanCard", "Do this every day. It's a quick health check, and {{name}}'s results are shared with the owner — it's how you both catch any early signs of illness, since birds tend to hide when they're unwell.", { name: activeName }),
    });
    s.push({
      target: "daily-checklist",
      route: "today",
      place: "auto",
      text: t("sitterOnboarding.step.dailyChecklist", "Work through {{name}}'s tasks here — grouped by morning, midday, and evening — and check them off as you go.", { name: activeName }),
    });
    if (hasClips) {
      s.push({
        target: "owner-tips",
        route: "today",
        place: "auto",
        text: t("sitterOnboarding.step.ownerTips", "Tips from the owner — short clips showing how things are done for {{name}}.", { name: activeName }),
      });
    }
    s.push({
      target: "care-plan-link",
      route: "today",
      place: "auto",
      text: t("sitterOnboarding.step.carePlanLink", "For everything specific to {{name}}, tap here for {{their}} full care plan — your source of truth for caring for {{them}}.", { name: activeName, their: poss, them: obj }),
    });

    // Full care plan — section by section, the bird-specific source of truth,
    // in the order the care plan view shows them (food, health, behavior, home
    // with the emergency details last).
    const CP_ORDER = ["food", "health", "handling", "home", "emergency"];
    const orderedCare = [...(careSections ?? [])].sort((a, b) => CP_ORDER.indexOf(a) - CP_ORDER.indexOf(b));
    for (const key of orderedCare) {
      if (CP_TARGET[key]) s.push({ target: CP_TARGET[key], route: "careplan", place: "auto", text: cpText[key] });
    }

    // Parrots 101 — intro the nav tab, then the on-screen search + topics.
    s.push({
      target: "nav-guide",
      route: "guide",
      place: "top",
      text: t("sitterOnboarding.step.guideNav", "The basics of parrot care, in plain language — general info for all parrots."),
    });
    s.push({
      target: "guide-search",
      route: "guide",
      place: "bottom",
      text: t("sitterOnboarding.step.guideSearch", "Search here to find anything fast."),
    });
    s.push({
      target: "guide-topics",
      route: "guide",
      place: "bottom",
      text: t("sitterOnboarding.step.guideTopics", "Or tab through these topics to browse by subject."),
    });

    // Emergency — last, on the always-present nav button.
    s.push({
      target: "nav-emergency",
      route: "guide",
      place: "top",
      emphasis: true,
      text: t("sitterOnboarding.step.emergencyNav", "And if something's ever wrong, the Emergency button is always here. When in doubt, reach out — it's better to check."),
    });

    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, activeName, obj, poss, careKey, hasClips, t]);

  useEffect(() => {
    // The owner's setup "sitter preview" iframe loads the real sitter view with
    // ?preview — don't run onboarding there (it would cover the preview).
    const isPreview =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).has("preview");
    if (isPreview) return;
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setPhase("welcome");
    } catch {}
    const onReplay = () => {
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
    } else if (cur.route === "guide") {
      navigate({ to: "/sitter/$token/guide", params: { token }, search: { birdId: bird?.id } });
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
  // Skip or finish: dismiss and land on the home base — Home for multi-bird sits,
  // the bird's Today for single-bird sits.
  function finishWalkthrough() {
    markSeenAndClose();
    if (list.length > 1) navigate({ to: "/sitter/$token/home", params: { token } });
    else navigate({ to: "/sitter/$token", params: { token }, search: { birdId: bird?.id } });
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
      setPhase("closing"); // after the last bubble, show the warm closing screen
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
      className="pointer-events-auto inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[14px] font-[700] text-white shadow"
      style={{ background: K.red }}
    >
      <AlertTriangle className="size-4" aria-hidden="true" /> {t("sitterOnboarding.emergency", "Emergency")}
    </Link>
  );
  // Close (X), top left: same as Skip — dismiss and land on the home base.
  const CloseButton = (
    <button
      type="button"
      onClick={finishWalkthrough}
      aria-label={t("sitterOnboarding.close", "Close")}
      className="pointer-events-auto grid size-11 shrink-0 place-items-center rounded-full bg-white shadow active:scale-95"
      style={{ color: K.forest }}
    >
      <X className="size-5" aria-hidden="true" />
    </button>
  );
  const primaryBtn = "inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700] active:scale-[0.99]";
  const primaryStyle = { background: K.sunflower, borderColor: K.forest, color: K.forest };
  const skipLink = (
    <button type="button" onClick={finishWalkthrough} className="mt-2 inline-flex min-h-[44px] items-center text-[15px] font-[700] underline" style={{ color: K.moss }}>
      {t("sitterOnboarding.skip", "Skip")}
    </button>
  );

  // ---- Welcome + overview + closing (white card on mist) ----
  if (phase === "welcome" || phase === "overview" || phase === "closing") {
    const title = (text: string) => (
      <h1 className="m-0 mt-5 text-[26px] font-[700] leading-[1.15]" style={{ fontFamily: SERIF, color: K.forest }}>{text}</h1>
    );
    const body = (text: string) => (
      <p className="m-0 mt-3 text-[15px] leading-[1.55]" style={{ color: K.ink }}>{text}</p>
    );
    return (
      <div className="setup-frame fixed inset-0 z-50 flex flex-col overflow-y-auto" style={{ background: K.mist, color: K.forest }}>
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pb-2 pt-[max(env(safe-area-inset-top),0.9rem)]">
          {CloseButton}
          {EmergencyLink}
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-10">
          <div className="rounded-[20px] bg-white px-5 pb-5 pt-6 text-center">
            {phase === "welcome" ? (
              <>
                <div className="flex items-center justify-center -space-x-3">
                  {list.slice(0, 4).map((b, i) =>
                    b?.photo_url ? (
                      <img
                        key={b.id ?? i}
                        src={b.photo_url}
                        alt={b.name ?? ""}
                        style={{ objectPosition: b.photo_position ?? "50% 20%" }}
                        className="size-16 rounded-[16px] object-cover ring-[3px] ring-white"
                      />
                    ) : (
                      <div key={b?.id ?? i} className="grid size-16 place-items-center rounded-[16px] text-2xl font-[700] ring-[3px] ring-white" style={{ background: K.lime, color: K.forest }}>
                        {(b?.name?.slice(0, 1) ?? "?").toUpperCase()}
                      </div>
                    ),
                  )}
                </div>
                {title(t("sitterOnboarding.welcome.heading", "You're caring for {{names}}", { names: allNames }))}
                {body(t("sitterOnboarding.welcome.body", "Everything you need is right here. Let's take a minute to show you around."))}
                <button type="button" onClick={() => setPhase("overview")} className={`${primaryBtn} mt-6`} style={primaryStyle}>
                  {t("sitterOnboarding.welcome.cta", "Show me around")}
                </button>
                {skipLink}
              </>
            ) : phase === "overview" ? (
              <>
                <h1 className="m-0 text-[26px] font-[700] leading-[1.15]" style={{ fontFamily: SERIF, color: K.forest }}>{t("sitterOnboarding.overview.title", "How this app works")}</h1>
                {body(t("sitterOnboarding.overview.body", "This app has everything you need to care for {{names}}: a daily routine and a quick health check, a parrot care guide, and an emergency button if anything's ever wrong. It takes about a minute to learn — we'll point out each part.", { names: allNames }))}
                <button type="button" onClick={startCoach} className={`${primaryBtn} mt-6`} style={primaryStyle}>
                  {t("sitterOnboarding.overview.cta", "Got it, show me around")}
                </button>
                {skipLink}
              </>
            ) : (
              <>
                <div className="mx-auto grid size-14 place-items-center rounded-full" style={{ background: K.forest, color: K.lime }}>
                  <Check className="size-7" aria-hidden="true" />
                </div>
                {title(t("sitterOnboarding.closing.heading", "That's everything"))}
                {body(t("sitterOnboarding.closing.allSet", "You're all set to care for {{names}}. Want to see this again? Tap the question mark in the upper right anytime.", { names: allNames }))}
                <button type="button" onClick={finishWalkthrough} className={`${primaryBtn} mt-6`} style={primaryStyle}>
                  {t("sitterOnboarding.coach.gotIt", "Got it")}
                </button>
              </>
            )}
          </div>
        </div>
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
          className={`pointer-events-none absolute rounded-[16px] ring-[3px] transition-all duration-200 ${cur.emphasis ? "ring-[#f2b33d]" : "ring-[#cdeab0]"}`}
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

      {/* Close (top left) + persistent Emergency (top right). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 mx-auto flex max-w-md items-center justify-between px-4 pt-[max(env(safe-area-inset-top),0.9rem)]">
        {CloseButton}
        {EmergencyLink}
      </div>

      {/* Bubble: white card, step count, forest progress dots, Back + sunflower Next */}
      <div ref={bubbleRef} className="setup-frame pointer-events-auto absolute rounded-[20px] bg-white p-4 shadow-xl" style={{ ...bubbleStyle, color: K.forest }}>
        <p className="m-0 text-[13px] font-[700]" style={{ color: K.quiet }}>{t("sitterOnboarding.coach.stepProgress", "Step {{current}} of {{total}}", { current: step + 1, total: steps.length })}</p>
        <p className="m-0 mt-1.5 text-[15px] leading-[1.45]" style={{ color: K.forest }}>{cur.text}</p>
        {/* Dots wrap onto a second line on long tours instead of pushing Next off the card. */}
        <div className="mt-3 flex flex-wrap items-center gap-1" aria-hidden="true">
          {steps.map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{ width: i === step ? 16 : 6, background: i <= step ? K.forest : "#d5dfd5" }}
            />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={back} className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full px-2 text-[14px] font-[700]" style={{ color: K.quiet }}>
            <ChevronLeft className="size-4" aria-hidden="true" /> {t("sitterOnboarding.coach.back", "Back")}
          </button>
          <button
            type="button"
            onClick={next}
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border-2 px-5 text-[15px] font-[700] active:scale-[0.98]"
            style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
          >
            {t("sitterOnboarding.coach.next", "Next")}
          </button>
        </div>
      </div>
    </div>
  );
}
