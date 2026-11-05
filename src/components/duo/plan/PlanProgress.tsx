// The care plan's left half on the iPhone Duo (lib/duo.ts) for the section
// editor and the guided walkthrough: on dark forest, a progress ring ("4/7")
// with the bird's name and how many sections are left, then the sections as a
// StepList (done = green check, the open one light and joined to the fold).
// Done comes from useCarePlanStatus, the same answer as the care plan page's
// Ready / To finish tags. Nothing here renders on any other screen size.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ClipboardCheck, Hand, Heart, Home as HomeIcon, Phone, Soup, Sun, Video } from "lucide-react";
import { useCarePlanStatus, type CarePlanRowKey } from "@/lib/useCarePlanStatus";
import { StepList, type Step } from "@/components/duo/DuoBlocks";
import { SERIF } from "@/components/kya";

/** The seven sections the ring counts (the overview's rows, Details aside). */
export const PLAN_ROWS: Exclude<CarePlanRowKey, "details">[] = ["food", "health", "personality", "clips", "day", "environment", "emergency"];

export function planRowIcon(k: CarePlanRowKey | "review"): ReactNode {
  switch (k) {
    case "food": return <Soup />;
    case "health": return <Heart />;
    case "personality": return <Hand />;
    case "clips": return <Video />;
    case "day": return <Sun />;
    case "environment": return <HomeIcon />;
    case "emergency": return <Phone />;
    case "review": return <ClipboardCheck />;
    default: return null;
  }
}

/** "Two" for 2, at the start of a sentence (the overview's words). */
function countWord(t: TFunction, n: number): string {
  switch (n) {
    case 2: return t("planOverview.num2", "Two");
    case 3: return t("planOverview.num3", "Three");
    case 4: return t("planOverview.num4", "Four");
    case 5: return t("planOverview.num5", "Five");
    case 6: return t("planOverview.num6", "Six");
    case 7: return t("planOverview.num7", "Seven");
    default: return String(n);
  }
}

/** Lime ring on forest, "done/total" in the middle. */
function ProgressRing({ done, total, label }: { done: number; total: number; label: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  return (
    <span role="img" aria-label={label} className="relative grid size-[92px] shrink-0 place-items-center">
      <svg viewBox="0 0 92 92" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="46" cy="46" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="8" />
        <circle cx="46" cy="46" r={r} fill="none" stroke="#cdeab0" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <span aria-hidden="true" className="text-[24px] font-[700] leading-none text-white" style={{ fontFamily: SERIF }}>{done}/{total}</span>
    </span>
  );
}

export type PlanStep = { key: string; title: string; row?: CarePlanRowKey; icon?: ReactNode };

/** The dark left half: ring, the bird's name, what's left, the sections. */
export function PlanProgressPane({ birdId, birdName, steps, current, onSelect, top, below }: {
  birdId: string;
  birdName: string;
  steps: PlanStep[];
  current: string;
  onSelect: (key: string) => void;
  /** Above the ring (e.g. RailClose). */
  top?: ReactNode;
  /** Under the list (e.g. a text link). */
  below?: ReactNode;
}) {
  const { t } = useTranslation();
  const { isDone, loaded } = useCarePlanStatus(birdId);
  const done = PLAN_ROWS.filter((k) => isDone(k)).length;
  const total = PLAN_ROWS.length;
  const left = total - done;
  const line = left === 0
    ? t("planDuo.allDone", "Everything's in. Anyone caring for {{name}} has what they need.", { name: birdName })
    : left === 1
      ? t("planDuo.oneMore", "One more and anyone caring for {{name}} has everything.", { name: birdName })
      : t("planDuo.moreLeft", "{{words}} more and anyone caring for {{name}} has everything.", { words: countWord(t, left), name: birdName });

  const list: Step[] = steps.map((s) => ({
    key: s.key,
    title: s.title,
    icon: s.icon,
    done: loaded && !!s.row && isDone(s.row),
  }));

  return (
    <>
      {top}
      <div className="flex items-center gap-4">
        {loaded ? (
          <ProgressRing done={done} total={total} label={t("planDuo.ringLabel", "{{done}} of {{total}} sections done", { done, total })} />
        ) : (
          <span aria-hidden="true" className="size-[92px] shrink-0 rounded-full border-[8px]" style={{ borderColor: "rgba(255,255,255,0.16)" }} />
        )}
        <div className="min-w-0">
          <p className="m-0 text-[13px] font-[700] uppercase tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.72)" }}>{t("planOverview.cardCarePlan", "Care plan")}</p>
          <h1 className="m-0 truncate text-[28px] font-[600] leading-tight" style={{ fontFamily: SERIF }}>{birdName}</h1>
          {loaded && <p className="m-0 mt-1 text-[15px] leading-[1.4]" style={{ color: "rgba(255,255,255,0.82)" }}>{line}</p>}
        </div>
      </div>
      <div className="mt-6">
        <StepList steps={list} current={current} onSelect={onSelect} label={t("planEditor.sectionsAria", "Care plan sections")} />
      </div>
      {below && <div className="mt-5">{below}</div>}
    </>
  );
}
