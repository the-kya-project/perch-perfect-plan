import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { BrandLockup } from "@/components/BrandLogo";
import { K, KyaHeader, KyaHeading, KyaIconButton, KyaLink, KyaPrimaryButton } from "@/components/kya";
import { ChevronLeft, ArrowRight, Feather, X } from "lucide-react";
import { setTourDemo } from "@/lib/tourDemo";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

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
function getSteps(t: TFunction): Step[] {
  return [
    { target: "owner-tab-home", headline: t("ownerOnboarding.homeTitle", "Home is where you land"), body: t("ownerOnboarding.homeBody", "Here you'll find daily check-ins, your flock, and anything happening soon. It's the screen you'll open most.") },
    { target: "owner-today", headline: t("ownerOnboarding.todayTitle", "Today, at a glance"), body: t("ownerOnboarding.todayBody", "Sits starting, hatch days, a foster settling in — whatever's worth knowing today shows up here first.") },
    { target: "owner-flock", headline: t("ownerOnboarding.flockTitle", "Each bird gets a record"), body: t("ownerOnboarding.flockBody", "Tap a bird to see their care plan, weight history, journal, identity, and photos. The works.") },
    { target: "owner-fosters", headline: t("ownerOnboarding.fostersHeadline", "Fostering a bird?"), body: t("ownerOnboarding.fostersBody", "They live here while they're with you — until they're adopted, or until you decide they're staying. (It happens.)") },
    { headline: t("ownerOnboarding.handoffTitle", "Saying goodbye? Hand off the record"), body: t("ownerOnboarding.handoffBody", "When a bird moves to a new home their full record can transfer with them. Care plan, history, identity, everything.") },
    { target: "owner-household", headline: t("ownerOnboarding.householdHeadline", "Family who shares the care?"), body: t("ownerOnboarding.householdBody", "Spouse, partner, kids, roommates — add them as household. They get access to your care plan and health checks so they can step in when needed.") },
    { target: "owner-tab-sits", headline: t("ownerOnboarding.sitsTitle", "Going away? Set up a sit"), body: t("ownerOnboarding.sitsBody", "Pet sitters get a temporary link — just for the trip. Household members get more details and a daily checklist.") },
    { target: "owner-tab-activity", headline: t("ownerOnboarding.activityTitle", "Daily health checks"), body: t("ownerOnboarding.activityBody", "Quick questions to track health. Pet sitters are asked to run a health check daily. Flags show up fast when something's off.") },
    { target: "owner-tab-explore", headline: t("ownerOnboarding.exploreTitle", "Stories, education, and conservation"), body: t("ownerOnboarding.exploreBody", "What The Kya Project is up to. Field notes, deep dives, community and other ways to get involved. Read when you have a minute.") },
  ];
}
const STEP_COUNT = 9;
const TOTAL = STEP_COUNT + 1; // + wrap-up = 10

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

/** Tour progress as dots (forest = reached), with the step count for screen readers. */
function ProgressDots({ n, total, label }: { n: number; total: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="sr-only">{label}</span>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`h-2 rounded-full transition-all ${i === n - 1 ? "w-5" : "w-2"}`}
          style={{ background: i < n ? K.forest : "#c9d6c9" }}
        />
      ))}
    </div>
  );
}

/** Sunflower main button for the coach bubble, sized to its label. */
function CoachNext({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border-2 px-5 text-[15px] font-[700] active:scale-[0.99]"
      style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
    >
      {children}
    </button>
  );
}
type Spot = { rect: { top: number; left: number; width: number; height: number; bottom: number } | null; vw: number; vh: number };

export function OwnerOnboarding() {
  const { t } = useTranslation();
  const STEPS = getSteps(t);
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
  // Also picks the welcome copy, so the welcome waits for it (no copy flash).
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
      await loadBirdCount();
      if (cancelled) return;
      let replay = false;
      try { replay = sessionStorage.getItem(REPLAY_FLAG) === "1"; } catch { /* ignore */ }
      if (replay) { try { sessionStorage.removeItem(REPLAY_FLAG); } catch { /* ignore */ } setStep(0); setPhase("welcome"); return; }
      if (!data?.welcome_seen_at) { setStep(0); setPhase("welcome"); }
    })();
    const onReplay = () => {
      try { sessionStorage.removeItem(REPLAY_FLAG); } catch { /* ignore */ }
      void loadBirdCount().then(() => { setStep(0); setPhase("welcome"); });
    };
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
    // People who already have a bird get a "here's what it can do" welcome;
    // brand-new accounts keep the set-up-your-first-bird welcome.
    const hasBird = birdCount > 0;
    const hiNameReturning = t("ownerOnboarding.hiNameReturning", "Hi, {{name}}", { name: firstName });
    const hiThere = t("ownerOnboarding.hiThere", "Hi there");
    return (
      // Every `sm:` below is iPad/desktop only (Tailwind sm = 640px; the widest
      // iPhone is 440pt), so the phone layout — forest header up top, CTA pinned
      // to the bottom of the mist body — is untouched by construction. Above sm
      // the CTA follows the header instead of sitting a screen below it.
      <div className="setup-frame fixed inset-0 z-[60] flex flex-col overflow-y-auto" style={{ background: K.mist, color: K.forest }}>
        <KyaHeader>
          {/* Close top left, like every task header. */}
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <KyaIconButton label={t("headers.close", "Close")} onClick={finish}><X className="size-5" /></KyaIconButton>
            <BrandLockup orientation="horizontal" variant="ink" size={118} />
          </div>
          {hasBird ? (
            <>
              <KyaHeading as="h1" size={34} className="mt-9 text-white">{firstName ? hiNameReturning : hiThere}</KyaHeading>
              <p className="m-0 mt-2 max-w-[32ch] text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{t("ownerOnboarding.welcomeBodyReturning", "Here's a quick tour of what Kya & Co. can do.")}</p>
            </>
          ) : (
            <>
              <KyaHeading as="h1" size={34} className="mt-9 text-white">{firstName ? hiNameReturning : t("ownerOnboarding.welcomeTitle", "Welcome")}</KyaHeading>
              <p className="m-0 mt-2 max-w-[32ch] text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{t("ownerOnboarding.welcomeBody", "A quick walkthrough first, then we'll set up your bird.")}</p>
            </>
          )}
        </KyaHeader>
        <main className="relative mx-auto -mt-[26px] flex w-full max-w-md flex-1 flex-col rounded-t-[26px] px-4 pb-[max(env(safe-area-inset-bottom),24px)] pt-5 sm:flex-none" style={{ background: K.mist }}>
          <div className="flex-1 sm:hidden" />
          <KyaPrimaryButton onClick={startCoach}>{t("ownerOnboarding.showMeAround", "Show me around")}</KyaPrimaryButton>
          <div className="mt-1 text-center">
            {hasBird ? (
              <KyaLink onClick={finish} className="px-3">{t("ownerOnboarding.notNow", "Not now")}</KyaLink>
            ) : (
              <KyaLink onClick={addBird} className="px-3">{t("ownerOnboarding.skipAndAddMyBird", "Skip and add my bird")}</KyaLink>
            )}
          </div>
        </main>
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
    <div className="setup-frame fixed inset-0 z-[60]" style={{ color: K.forest }}>
      {!centered ? (
        <div
          className="pointer-events-none absolute rounded-[14px] ring-2 ring-[#cdeab0] transition-all duration-200"
          style={{
            top: rect!.top - PAD,
            left: rect!.left - PAD,
            width: rect!.width + PAD * 2,
            height: rect!.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(20,40,30,0.6)",
          }}
        />
      ) : (
        <div className="absolute inset-0" style={{ background: "rgba(26,61,46,0.55)" }} />
      )}

      {/* "Skip tour" is shown once, in the bubble under Back / Next. */}
      <div ref={bubbleRef} className="pointer-events-auto absolute rounded-[20px] bg-white p-4 shadow-xl" style={bubbleStyle}>
        {isWrapUp ? (
          <div className="flex flex-col items-center text-center">
            <ProgressDots n={TOTAL} total={TOTAL} label={t("ownerOnboarding.stepOfSr", "Step {{n}} of {{total}}", { n: TOTAL, total: TOTAL })} />
            <KyaHeading size={22} className="mt-3">{t("ownerOnboarding.thatsTheTourTitle", "That's the tour")}</KyaHeading>
            {birdCount === 0 ? (
              <>
                <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("ownerOnboarding.nowTheFunPart", "Now the fun part — let's set up your first bird.")}</p>
                <div className="mt-4 w-full">
                  <KyaPrimaryButton onClick={addBird} icon={<Feather className="size-4" />}>{t("ownerOnboarding.addMyFirstBird", "Add my first bird")}</KyaPrimaryButton>
                </div>
                <KyaLink onClick={finish} className="mt-1">{t("ownerOnboarding.skipForNow", "Skip for now")}</KyaLink>
                <p className="m-0 mt-1 text-[13px] leading-[1.45]" style={{ color: K.quiet }}>{t("ownerOnboarding.addAnytime", "You can add a bird anytime from Home — tap the ? to revisit the tour.")}</p>
              </>
            ) : (
              <>
                <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("ownerOnboarding.refresher", "Anytime you need a refresher, the ? is right up top.")}</p>
                <div className="mt-4 w-full">
                  <KyaPrimaryButton onClick={finish}>{t("ownerOnboarding.gotIt", "Got it")}</KyaPrimaryButton>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <ProgressDots n={step + 1} total={TOTAL} label={t("ownerOnboarding.stepOfSr", "Step {{n}} of {{total}}", { n: step + 1, total: TOTAL })} />
            <KyaHeading size={20} className="mt-3">{stepDef!.headline}</KyaHeading>
            <p className="m-0 mt-1.5 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{stepDef!.body}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <KyaLink onClick={back} className="shrink-0 pr-2">
                <ChevronLeft className="size-4" /> {t("ownerOnboarding.back", "Back")}
              </KyaLink>
              <CoachNext onClick={next}>
                {t("ownerOnboarding.next", "Next")} <ArrowRight className="size-4" />
              </CoachNext>
            </div>
            <div className="text-center">
              <KyaLink onClick={finish} color={K.quiet}>{t("ownerOnboarding.skipTour", "Skip tour")}</KyaLink>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
