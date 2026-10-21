import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { BrandLockup } from "@/components/BrandLogo";
import { K, KyaHeader, KyaHeading, KyaIconButton, KyaLink, KyaPrimaryButton } from "@/components/kya";
import { ChevronLeft, ArrowRight, Check, X } from "lucide-react";
import { getMemberOnboardingContext, type MemberHousehold } from "@/lib/onboarding.functions";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

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
  if (n.length === 0) return i18next.t("memberOnboarding.theirBirds", "their birds");
  if (n.length === 1) return n[0];
  if (n.length === 2) return i18next.t("memberOnboarding.birdsTwo", "{{a}} and {{b}}", { a: n[0], b: n[1] });
  if (n.length === 3) return i18next.t("memberOnboarding.birdsThree", "{{a}}, {{b}}, and {{c}}", { a: n[0], b: n[1], c: n[2] });
  return i18next.t("memberOnboarding.birdsMore", "{{a}}, {{b}}, and {{n}} more", { a: n[0], b: n[1], n: n.length - 2 });
}

function welcomeBody(households: MemberHousehold[]): string {
  if (!households.length) return i18next.t("memberOnboarding.addedToAHousehold", "You've been added to a household to help care for their birds.");
  const primary = households[0];
  const owner = primary.ownerName || i18next.t("memberOnboarding.yourHouseholdsOwnerLower", "your household's owner");
  const birds = formatBirds(primary.birdNames);
  if (households.length === 1) {
    return i18next.t("memberOnboarding.addedToOwnersHousehold", "You've been added to {{owner}}'s household to help care for {{birds}}.", { owner, birds });
  }
  const others = households.length - 1;
  return others === 1
    ? i18next.t("memberOnboarding.addedToOwnersHouseholdAndOne", "You've been added to {{owner}}'s household (and {{n}} other) to help care for {{birds}}.", { owner, n: others, birds })
    : i18next.t("memberOnboarding.addedToOwnersHouseholdAndOthers", "You've been added to {{owner}}'s household (and {{n}} others) to help care for {{birds}}.", { owner, n: others, birds });
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

export function MemberOnboarding() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>(null);
  const [step, setStep] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [spot, setSpot] = useState<Spot | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubbleH, setBubbleH] = useState(160);

  const ctxFn = useServerFn(getMemberOnboardingContext);
  const { data: ctx } = useQuery({ queryKey: ["member-onboarding-context"], queryFn: () => ctxFn(), staleTime: 5 * 60_000 });
  const households = ctx?.households ?? [];
  const ownerName = households[0]
    ? households[0].ownerName || t("memberOnboarding.yourHouseholdsOwnerLower", "your household's owner")
    : t("memberOnboarding.yourHouseholdsOwner", "Your household's owner");

  // Member tour (owns no birds). Every step anchors to a REAL element on the
  // member's Home: the "[Owner]'s household" section, a household bird card, the
  // Sits tab, and the "Add a bird" control (the "Your birds" / owner-flock
  // section, which shows the add affordance). Fixed 5 steps — welcome (the
  // full-screen intro above) is step 1; these are steps 2–5. Never anchors the
  // member's own empty flock or a nonexistent target. {Owner} = the household
  // owner's real display name (from the onboarding context, first household).
  const steps: Step[] = [
    { target: "member-household", headline: t("memberOnboarding.householdTitle", "Here are the birds you help with"), body: t("memberOnboarding.householdBody", "Tap any bird in {{owner}}'s household to read their care plan: food, handling, home, health, and emergency info, all in one place.", { owner: ownerName }) },
    { target: "member-household-bird", headline: t("memberOnboarding.birdTitle", "Pitch in on daily care"), body: t("memberOnboarding.birdBody", "Open a bird to check off today's tasks, log a weight, or add a moment as you go.") },
    { target: "owner-tab-sits", headline: t("memberOnboarding.sitsTitle", "When {{owner}}'s away, you've got this", { owner: ownerName }), body: t("memberOnboarding.sitsBody", "If {{owner}} puts you in charge of a sit, you'll get a simple daily checklist for their birds, so nothing slips while they're gone.", { owner: ownerName }) },
    { target: "owner-flock", headline: t("memberOnboarding.flockTitle", "Got your own flock? Add them too"), body: t("memberOnboarding.flockBody", "Have birds of your own? Or will you soon? It's just a matter of time. Add them here whenever and manage everyone in one place.") },
  ];
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
      // Same large-screen treatment as the owner welcome — `sm:` and up only, so
      // phones are untouched. A household member is just as likely to be on an
      // iPad as an owner.
      <div className="setup-frame fixed inset-0 z-[60] flex flex-col overflow-y-auto" style={{ background: K.mist, color: K.forest }}>
        <KyaHeader>
          {/* Close top left, like every task header. */}
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <KyaIconButton label={t("headers.close", "Close")} onClick={finish}><X className="size-5" /></KyaIconButton>
            <BrandLockup orientation="horizontal" variant="ink" size={118} />
          </div>
          <KyaHeading as="h1" size={32} className="mt-9 text-white">{t("memberOnboarding.welcomeTitle", "Welcome, you're helping with a flock")}</KyaHeading>
          <p className="m-0 mt-2 max-w-[34ch] text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{t("memberOnboarding.welcomeBody", "{{owner}} added you to help care for their birds. Here's how everything works.", { owner: ownerName })}</p>
        </KyaHeader>
        <main className="relative mx-auto -mt-[26px] flex w-full max-w-md flex-1 flex-col rounded-t-[26px] px-4 pb-[max(env(safe-area-inset-bottom),24px)] pt-5 sm:flex-none" style={{ background: K.mist }}>
          <div className="flex-1 sm:hidden" />
          <KyaPrimaryButton onClick={startCoach}>{t("memberOnboarding.showMeAround", "Show me around")}</KyaPrimaryButton>
          <div className="mt-1 text-center">
            <KyaLink onClick={finish} className="px-3">{t("memberOnboarding.skipForNow", "Skip for now")}</KyaLink>
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
            <ProgressDots n={TOTAL} total={TOTAL} label={t("memberOnboarding.stepOfSr", "Step {{n}} of {{total}}", { n: TOTAL, total: TOTAL })} />
            <KyaHeading size={22} className="mt-3">{t("memberOnboarding.allSetTitle", "You're all set")}</KyaHeading>
            <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("memberOnboarding.ownerManages", "{{owner}} manages everything else. Just reach out to them if you ever need to do more.", { owner: ownerName })}</p>
            <div className="mt-4 w-full">
              <KyaPrimaryButton onClick={finish} icon={<Check className="size-4" />}>{t("memberOnboarding.gotIt", "Got it")}</KyaPrimaryButton>
            </div>
            <p className="m-0 mt-2.5 text-[13px] leading-[1.45]" style={{ color: K.quiet }}>{t("memberOnboarding.revisit", "Tap the ? in the top bar anytime to revisit this.")}</p>
          </div>
        ) : (
          <>
            <ProgressDots n={step + 1} total={TOTAL} label={t("memberOnboarding.stepOfSr", "Step {{n}} of {{total}}", { n: step + 1, total: TOTAL })} />
            <KyaHeading size={20} className="mt-3">{stepDef!.headline}</KyaHeading>
            <p className="m-0 mt-1.5 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{stepDef!.body}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <KyaLink onClick={back} className="shrink-0 pr-2">
                <ChevronLeft className="size-4" /> {t("memberOnboarding.back", "Back")}
              </KyaLink>
              <CoachNext onClick={next}>
                {t("memberOnboarding.next", "Next")} <ArrowRight className="size-4" />
              </CoachNext>
            </div>
            <div className="text-center">
              <KyaLink onClick={finish} color={K.quiet}>{t("memberOnboarding.skipTour", "Skip tour")}</KyaLink>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
