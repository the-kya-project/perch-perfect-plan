import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading, KyaPrimaryButton, KyaSheet } from "@/components/kya";

const CHIP_ON_BG = "#cdeab0";
const CHIP_OFF_BORDER = "#c9d3c8";

/** Small uppercase label over a group ("The basics · free"). */
export function JourneyEyebrow({ children }: { children: ReactNode }) {
  return <h2 className="m-0 pt-1 text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: "#5a8c7a" }}>{children}</h2>;
}

/** One template in the picker: name, "7 milestones · usually 2–6 weeks", and
 *  either "[Bird] knows this", "Going now", a lock, or a chevron. */
export function TemplateRow({ name, meta, known, going, locked, onClick, testId }: {
  name: string;
  meta: string;
  known?: string | null;
  going?: string | null;
  locked?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      data-template={testId}
      data-locked={locked ? "true" : undefined}
      aria-label={locked ? t("flock.journeys.start.lockedAria", "{{name}}, comes with app premium", { name }) : undefined}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-[14px] bg-white px-3.5 py-2 text-left active:scale-[0.99]"
      style={{ color: K.forest }}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-[700]">{name}</span>
        <span className="text-[12.5px]" style={{ color: K.quiet }}>{meta}</span>
      </span>
      {known ? (
        <span className="shrink-0 rounded-full px-2 py-[3px] text-[11px] font-[700]" style={{ background: "#e5f4e4", color: K.moss }}>{known}</span>
      ) : going ? (
        <span className="shrink-0 rounded-full px-2 py-[3px] text-[11px] font-[700]" style={{ background: K.amberBg, color: K.amberText }}>{going}</span>
      ) : null}
      {locked
        ? <Lock className="size-4 shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
        : <ChevronRight className="size-[18px] shrink-0" style={{ color: K.forest }} aria-hidden="true" />}
    </button>
  );
}

/** Pick-one chips: pale lime with a 2px forest border when chosen. */
export function ChoiceChips<T extends string>({ label, options, value, onChange, testId, grid }: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  testId?: string;
  grid?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-testid={testId} className={grid ? "grid grid-cols-3 gap-2" : "flex flex-wrap gap-2"}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-value={o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-[44px] rounded-full px-3.5 text-[14px] active:scale-[0.98] ${grid ? "text-center" : ""}`}
            style={on
              ? { background: CHIP_ON_BG, color: K.forest, border: `2px solid ${K.forest}`, fontWeight: 700 }
              : { background: "#fff", color: K.forest, border: `1px solid ${CHIP_OFF_BORDER}`, fontWeight: 400, padding: "0 15px" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Many-at-once chips (known skills): the same look, with a check when on. */
export function ToggleChip({ on, label, onClick, testId }: { on: boolean; label: string; onClick: () => void; testId?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      data-skill={testId}
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-3.5 text-[14px] active:scale-[0.98]"
      style={on
        ? { background: CHIP_ON_BG, color: K.forest, border: `2px solid ${K.forest}`, fontWeight: 700 }
        : { background: "#fff", color: K.forest, border: `1px solid ${CHIP_OFF_BORDER}`, fontWeight: 400, padding: "0 15px" }}
    >
      {on && <Check className="size-4" strokeWidth={2.75} aria-hidden="true" />}
      {label}
    </button>
  );
}

/** The white footer pinned under a flow screen, holding its one main button. */
export function FlowFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-2 bg-white px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2.5" style={{ borderTop: "1px solid #e7ece6" }}>
      {children}
    </div>
  );
}

/** Free users tapping a premium template (Batch 4, screen 7). Payments don't
 *  exist yet, so the main button says "Coming soon" and does nothing. */
export function PremiumSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <KyaSheet
      onClose={onClose}
      closeLabel={t("flock.region.close", "Close")}
      title={(
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>{t("flock.journeys.premium.eyebrow", "App premium")}</span>
          <KyaHeading size={23}>{t("flock.journeys.premium.title", "Tricks come with app premium")}</KyaHeading>
        </div>
      )}
    >
      <div data-testid="premium-sheet" className="flex flex-col gap-3">
        <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
          {t("flock.journeys.premium.line", "Unlock every trick and husbandry journey, unlimited custom journeys, and longer clips, plus the premium care features.")}
        </p>
        <p className="m-0 flex flex-wrap items-baseline gap-x-1.5" style={{ color: K.forest }}>
          <span className="text-[22px] font-[700]">{t("flock.journeys.premium.price", "$9.99")}</span>
          <span className="text-[13px]" style={{ color: K.quiet }}>{t("flock.journeys.premium.priceLine", "a month · or join the Flock to share journeys too")}</span>
        </p>
        <KyaPrimaryButton onClick={() => { /* Payments aren't built yet. */ }}>
          {t("flock.journeys.premium.soon", "Coming soon")}
        </KyaPrimaryButton>
        <Link to="/flock/you/membership" className="self-center py-2 text-[14px] font-[700] underline-offset-4 hover:underline" style={{ color: K.moss }}>
          {t("flock.journeys.premium.compare", "Compare with Flock membership")}
        </Link>
      </div>
    </KyaSheet>
  );
}

/** Free users with a custom journey already open. */
export function CustomLimitSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<KyaHeading size={23}>{t("flock.journeys.customLimit.title", "One custom journey at a time")}</KyaHeading>}>
      <div data-testid="custom-limit-sheet" className="flex flex-col gap-3">
        <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
          {t("flock.journeys.customLimit.line", "You have a journey you wrote yourself going already. Finish it, or mark it \"We're happy where we are,\" to write another. With app premium, you can write as many as you like.")}
        </p>
        <KyaPrimaryButton onClick={onClose}>{t("flock.journeys.customLimit.ok", "Got it")}</KyaPrimaryButton>
      </div>
    </KyaSheet>
  );
}

/** A small progress ring with "3/7" inside, for journey rows. */
export function MiniRing({ done, total, size = 40 }: { done: number; total: number; size?: number }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#dfe7dd" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={K.moss} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <span className="text-[10.5px] font-[700]" style={{ color: K.forest }}>{done}/{total}</span>
    </span>
  );
}

/** "Post an update for…" (Batch 4, screen 1): which journey, with when each
 *  was last posted to, and "Or start a new journey". */
export function WhichJourneySheet({ journeys, onPick, onStartNew, onClose }: {
  journeys: { id: string; title: string; done: number; total: number; daysSince: number | null }[];
  onPick: (id: string) => void;
  onStartNew: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const last = (d: number | null) => d == null ? t("flock.journeys.which.never", "Nothing posted yet")
    : d === 0 ? t("flock.journeys.which.today", "Last posted today")
    : d === 1 ? t("flock.journeys.which.yesterday", "Last posted yesterday")
    : d < 7 ? t("flock.journeys.which.days", "Last posted {{count}} days ago", { count: d })
    : d < 14 ? t("flock.journeys.which.lastWeek", "Last posted last week")
    : t("flock.journeys.which.weeks", "Last posted {{count}} weeks ago", { count: Math.floor(d / 7) });
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<KyaHeading size={23}>{t("flock.journeys.which.title", "Post an update for…")}</KyaHeading>}>
      <div className="flex flex-col gap-2" data-testid="which-journey">
        {journeys.map((j) => (
          <button key={j.id} type="button" data-journey={j.id} onClick={() => onPick(j.id)}
            className="flex min-h-[60px] items-center gap-3 rounded-[14px] px-3 py-2 text-left active:scale-[0.99]"
            style={{ border: `1px solid ${K.line}`, color: K.forest }}>
            <MiniRing done={j.done} total={j.total} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[15px] font-[700]">{j.title}</span>
              <span className="text-[12.5px]" style={{ color: K.quiet }}>{last(j.daysSince)}</span>
            </span>
            <ChevronRight className="size-[18px] shrink-0" aria-hidden="true" />
          </button>
        ))}
        <button type="button" onClick={onStartNew} className="self-start py-2 text-[14px] font-[700]" style={{ color: K.moss }}>
          {t("flock.journeys.which.startNew", "Or start a new journey")}
        </button>
      </div>
    </KyaSheet>
  );
}
