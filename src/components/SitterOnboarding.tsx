import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardList, Stethoscope, BookOpen, AlertTriangle, ChevronLeft } from "lucide-react";

// First-visit welcome + a short, skippable walkthrough for sitters. Additive
// overlay only — it never changes the underlying tabs and is always dismissible,
// with the Emergency screen reachable at all times (so a sitter is never trapped
// in onboarding while a bird may be in distress).

const SEEN_KEY = "ppc_sitter_onboarded"; // per-device; fine if it re-shows after clearing data
const REPLAY_EVENT = "sitter:replay-onboarding";

/** Re-run the walkthrough on demand (e.g. the Guide's "How this works" link). */
export function replaySitterOnboarding() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REPLAY_EVENT));
}

type Phase = null | "welcome" | number; // number = walkthrough card index

export function SitterOnboarding({ bird, token }: { bird: any; token: string }) {
  const [phase, setPhase] = useState<Phase>(null);
  const startXRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setPhase("welcome");
    } catch {}
    const onReplay = () => setPhase(0); // replay jumps straight into the cards
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  function finish() {
    try { window.localStorage.setItem(SEEN_KEY, "1"); } catch {}
    setPhase(null);
  }

  if (phase === null) return null;

  const name = (bird?.name ?? "your bird").toString().trim() || "your bird";
  const photo = bird?.photo_url as string | undefined;
  const initial = name.slice(0, 1).toUpperCase();

  const cards = [
    { Icon: ClipboardList, label: "Today", text: "Each day, work through the routine here and run the quick health check." },
    { Icon: Stethoscope, label: "Scan", text: `A daily health scan — a few quick checks to make sure ${name} is doing well. We'll guide you.` },
    { Icon: BookOpen, label: "Guide", text: `General parrot care basics, anytime you want to understand something. ${name}'s specific needs are in the care plan.` },
    { Icon: AlertTriangle, label: "Emergency", text: "If something's wrong, the red Emergency button is always here. You'll never be in trouble for using it.", emphasis: true },
  ];

  const idx = typeof phase === "number" ? phase : -1;
  const onCards = idx >= 0;

  function next() { if (idx < cards.length - 1) setPhase(idx + 1); else finish(); }
  function back() { if (idx > 0) setPhase(idx - 1); else setPhase("welcome"); }

  function onTouchStart(e: React.TouchEvent) { startXRef.current = e.touches[0]?.clientX ?? null; }
  function onTouchEnd(e: React.TouchEvent) {
    if (startXRef.current == null || !onCards) return;
    const dx = (e.changedTouches[0]?.clientX ?? startXRef.current) - startXRef.current;
    startXRef.current = null;
    if (dx < -45) next();
    else if (dx > 45) back();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[#1a3d2e] text-white"
      role="dialog"
      aria-label={`Welcome — caring for ${name}`}
    >
      {/* Always-available Emergency + Skip so the sitter is never trapped. */}
      <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),0.9rem)] pb-2">
        <Link
          to="/sitter/$token/emergency"
          params={{ token }}
          onClick={finish}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#993C1D] px-3 py-1.5 text-xs font-semibold text-white"
        >
          <AlertTriangle className="size-3.5" /> Emergency
        </Link>
        {onCards && (
          <button onClick={finish} className="text-sm font-medium text-[#cdeab0] underline">Skip</button>
        )}
      </div>

      {phase === "welcome" ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 text-center">
          {photo ? (
            <img src={photo} alt={name} className="size-24 rounded-2xl object-cover ring-2 ring-white/20" />
          ) : (
            <div className="grid size-24 place-items-center rounded-2xl bg-white/10 text-3xl font-medium text-white">{initial}</div>
          )}
          <h1 className="mt-5 text-[22px] font-medium leading-tight">You're caring for {name}.</h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-white/85">
            Everything you need is right here — let's take 20 seconds to show you around.
          </p>
          <button
            onClick={() => setPhase(0)}
            className="mt-7 w-full max-w-xs rounded-2xl bg-[#cdeab0] py-3 text-sm font-semibold text-[#1a3d2e]"
          >
            Show me around
          </button>
          <button onClick={finish} className="mt-3 text-sm font-medium text-[#cdeab0] underline">Skip</button>
        </div>
      ) : (
        <div
          className="flex flex-1 flex-col"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {(() => {
            const c = cards[idx];
            return (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <div className={`grid size-16 place-items-center rounded-full ${c.emphasis ? "bg-[#993C1D]" : "bg-white/10"}`}>
                  <c.Icon className="size-7 text-white" />
                </div>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-[#cdeab0]">{c.label}</p>
                <p className="mt-2 max-w-sm text-lg font-medium leading-snug">{c.text}</p>
              </div>
            );
          })()}

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2 pb-4">
            {cards.map((_, i) => (
              <span key={i} className={`size-2 rounded-full transition ${i === idx ? "bg-[#cdeab0]" : "bg-white/25"}`} />
            ))}
          </div>

          {/* Back / Next (Got it on last card) */}
          <div className="flex items-center gap-3 px-6 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
            <button
              onClick={back}
              className="inline-flex items-center gap-1 rounded-2xl border border-white/25 px-4 py-3 text-sm font-medium text-white"
            >
              <ChevronLeft className="size-4" /> Back
            </button>
            <button
              onClick={next}
              className="flex-1 rounded-2xl bg-[#cdeab0] py-3 text-sm font-semibold text-[#1a3d2e]"
            >
              {idx === cards.length - 1 ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
