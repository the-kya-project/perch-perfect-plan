import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading, KyaPrimaryButton, KyaSheet } from "@/components/kya";
import { flockSheetTitle, journeyDay, journeyDays, possessive, skillInSentence, type FlockSheetReason } from "@/lib/journeys";

const CHIP_ON_BG = "#cdeab0";
const CHIP_OFF_BORDER = "#c9d3c8";

/** Small uppercase label over a group ("The basics · free"). */
export function JourneyEyebrow({ children }: { children: ReactNode }) {
  return <h2 className="m-0 pt-1 text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: "#5a8c7a" }}>{children}</h2>;
}

/** One skill in the picker: name, its short description, and "[Bird]
 *  already knows this" or "Going now" when they apply. Every skill opens. */
export function TemplateRow({ name, meta, known, going, onClick, testId }: {
  name: string;
  meta: string;
  known?: string | null;
  going?: string | null;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-template={testId}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-[14px] bg-white px-3.5 py-2 text-left active:scale-[0.99]"
      style={{ color: K.forest }}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[15px] font-[700]">{name}</span>
        {meta && <span className="line-clamp-2 text-[12.5px] leading-[1.35]" style={{ color: K.quiet }}>{meta}</span>}
        {known && (
          <span className="mt-1 self-start rounded-full px-2 py-[3px] text-[11px] font-[700]" style={{ background: "#e5f4e4", color: K.moss }} data-testid="already-knows">{known}</span>
        )}
      </span>
      {going && (
        <span className="shrink-0 rounded-full px-2 py-[3px] text-[11px] font-[700]" style={{ background: K.amberBg, color: K.amberText }}>{going}</span>
      )}
      <ChevronRight className="size-[18px] shrink-0" style={{ color: K.forest }} aria-hidden="true" />
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

/** A free account reaching for a community feature: "How others did it" on a
 *  skill page, or "Ask the Flock" on a private journey. Every skill can be
 *  started without it. No price: the Flock is free for everyone while it's
 *  getting started. The button goes to the founding page until the join step
 *  exists. */
export function FlockOnlySheet({ reason, skill, onClose }: { reason: FlockSheetReason; skill?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <KyaSheet
      onClose={onClose}
      closeLabel={t("flock.region.close", "Close")}
      title={(
        <div className="flex flex-col gap-1">
          <span className="text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>{t("flock.journeys.flockOnly.eyebrow", "Part of the Flock")}</span>
          <KyaHeading size={23}>{flockSheetTitle(t, reason)}</KyaHeading>
        </div>
      )}
    >
      <div data-testid="flock-only-sheet" data-reason={reason} className="flex flex-col gap-3">
        <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
          {reason === "ask"
            ? t("flock.journeys.flockOnly.askLine", "In the Flock, you can ask other members about your journey and hear from people who've been there.")
            : skill
              ? t("flock.journeys.flockOnly.howOthersLine", "In the Flock, members share their journeys and what helped them, so you can see how other birds learned {{skill}}.", { skill: skillInSentence(skill) })
              : t("flock.journeys.flockOnly.howOthersLineNoSkill", "In the Flock, members share their journeys and what helped them, so you can see how other birds learned.")}
        </p>
        <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
          {t("flock.journeys.flockOnly.aboutCommunity", "The Flock is The Kya Project's community, where you'll find your local chapter, a library of guides and recordings, and other members' journeys.")}
        </p>
        <p className="m-0 rounded-[14px] px-3.5 py-3 text-[15px] font-[700] leading-[1.45]" style={{ background: "#e8f3dc", color: K.forest }}>
          {t("flock.journeys.flockOnly.free", "Join the Flock early, while it's free for everyone.")}
        </p>
        <KyaPrimaryButton onClick={() => void navigate({ to: "/founding", search: { src: "journey-sheet" } })}>
          {t("flock.journeys.flockOnly.join", "Join the Flock free")}
        </KyaPrimaryButton>
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
          {t("flock.journeys.customLimit.line", "Free accounts can have one custom journey going at a time. Flock members can start as many as they like.")}
        </p>
        <KyaPrimaryButton onClick={onClose}>{t("flock.journeys.customLimit.ok", "Got it")}</KyaPrimaryButton>
      </div>
    </KyaSheet>
  );
}

/** A small "Day 12" badge for journey rows (no steps, no progress). */
export function DayBadge({ day, size = 40 }: { day: number; size?: number }) {
  const { t } = useTranslation();
  return (
    <span className="grid shrink-0 place-items-center rounded-full text-center leading-[1.05]" style={{ width: size, height: size, background: "#eef4ec", border: `2px solid ${K.moss}`, color: K.forest }} aria-hidden="true">
      <span className="text-[9.5px] font-[700] uppercase tracking-[0.04em]">{t("flock.journeys.dayShort", "Day")}<br /><span className="text-[12.5px]">{day}</span></span>
    </span>
  );
}

/** "Post an update for…" (Batch 4, screen 1): which journey, with when each
 *  was last posted to, and "Or start a new journey". */
export function WhichJourneySheet({ journeys, onPick, onStartNew, onClose }: {
  journeys: { id: string; title: string; day: number; daysSince: number | null }[];
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
            <DayBadge day={j.day} />
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

/** "Member-supplied journey": the label on a member's own skill wherever it
 *  appears outside its bird's household (journeys redesign, screen 8). */
export function MemberSuppliedTag({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={`self-start rounded-full px-2 py-[3px] text-[11px] font-[700] ${className ?? ""}`} style={{ background: K.amberBg, color: K.amberText }} data-testid="member-supplied">
      {t("flock.journeys.member.label", "Member-supplied journey")}
    </span>
  );
}

/** The label with its line: shared by a member, not reviewed by The Kya Project. */
export function MemberSuppliedNote() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] px-3.5 py-2.5" style={{ background: "#fbf6e8" }} data-testid="member-supplied-note">
      <MemberSuppliedTag />
      <p className="m-0 text-[13px] leading-[1.45]" style={{ color: K.ink }}>
        {t("flock.journeys.member.line", "A member shared this skill. It hasn't been reviewed by The Kya Project.")}
      </p>
    </div>
  );
}

/** "Started from [bird]'s journey", linking to it while it's visible. */
export function StartedFrom({ journeyId, birdName }: { journeyId: string; birdName: string }) {
  const { t } = useTranslation();
  return (
    <Link to="/flock/journeys/$journeyId" params={{ journeyId }} data-testid="started-from"
      className="self-start text-[14px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>
      {t("flock.journeys.member.startedFrom", "Started from {{name}} journey", { name: possessive(birdName) })}
    </Link>
  );
}

/** A skill's short description and its safety notes. On the journey page
 *  they fold away under the header ("About this skill"). */
export function SkillAbout({ description, notes, collapsible }: { description: string | null; notes: string[]; collapsible?: boolean }) {
  const { t } = useTranslation();
  if (!description && notes.length === 0) return null;
  const body = (
    <div className="flex flex-col gap-2.5">
      {description && <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }} data-testid="skill-description">{description}</p>}
      {notes.length > 0 && (
        <section className="rounded-[16px] p-3.5" style={{ background: "#eef4ec" }} data-testid="safety-notes">
          <h3 className="m-0 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.skill.safety", "Safety notes")}</h3>
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {notes.map((n) => <li key={n} className="text-[14px] leading-[1.45]" style={{ color: K.ink }}>{n}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
  if (!collapsible) return body;
  return (
    <details className="group rounded-[16px] bg-white px-3.5 py-2.5" data-testid="skill-about">
      <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 text-[14.5px] font-[700]" style={{ color: K.forest }}>
        <span className="flex-1">{t("flock.journeys.skill.about", "About this skill")}</span>
        <ChevronRight className="size-[18px] shrink-0 transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="pb-1.5 pt-1">{body}</div>
    </details>
  );
}

/** "How others did it" on a skill page: finisher tips and other members'
 *  community journeys for the skill. A free account sees one row that opens
 *  the "Part of the Flock" sheet instead. */
export function HowOthersDidIt({ skill, tips, journeys, canView, onLocked }: {
  skill: string;
  tips: { body: string; total: number }[] | undefined;
  journeys: { journey_id: string; bird_name: string; owner_name: string | null; status: string; started_at: string; finished_at: string | null }[] | undefined;
  canView: boolean;
  onLocked: () => void;
}) {
  const { t } = useTranslation();
  if (!canView) {
    return (
      <button type="button" onClick={onLocked} data-testid="how-others-locked"
        className="flex min-h-[56px] w-full items-center gap-3 rounded-[16px] bg-white px-3.5 py-2 text-left active:scale-[0.99]" style={{ color: K.forest }}>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-[700]">{t("flock.journeys.skill.howOthers", "How others did it")}</span>
          <span className="text-[12.5px]" style={{ color: K.quiet }}>{t("flock.journeys.skill.howOthersLocked", "Journeys and tips from Flock members")}</span>
        </span>
        <ChevronRight className="size-[18px] shrink-0" aria-hidden="true" />
      </button>
    );
  }
  const rows = journeys ?? [];
  return (
    <section className="flex flex-col gap-2" data-testid="how-others">
      <JourneyEyebrow>{t("flock.journeys.skill.howOthers", "How others did it")}</JourneyEyebrow>
      <FinisherTipsCard skill={skill} tips={tips} />
      {rows.map((j) => (
        <Link key={j.journey_id} to="/flock/journeys/$journeyId" params={{ journeyId: j.journey_id }} data-other-journey={j.journey_id}
          className="flex min-h-[52px] items-center gap-3 rounded-[14px] bg-white px-3.5 py-2" style={{ color: K.forest }}>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14.5px] font-[700]">{j.bird_name}{j.owner_name ? ` · ${j.owner_name}` : ""}</span>
            <span className="text-[12.5px]" style={{ color: K.quiet }}>
              {j.status === "finished"
                ? t("flock.journeys.skill.learnedIn", "Learned it in {{count}} days", { count: journeyDays(j.started_at, j.finished_at) })
                : t("flock.journeys.skill.onDay", "Day {{day}}", { day: journeyDay(j.started_at) })}
            </span>
          </span>
          <ChevronRight className="size-[18px] shrink-0" aria-hidden="true" />
        </Link>
      ))}
      {rows.length === 0 && (!tips || tips.length === 0) && (
        <p className="m-0 text-[14px]" style={{ color: K.quiet }} data-testid="how-others-empty">
          {t("flock.journeys.skill.howOthersEmpty", "No one has shared a journey for this skill yet. Yours could be the first.")}
        </p>
      )}
    </section>
  );
}

/** "From members who've done [Skill]" (JourneyEverywhere, screen 8): one tip
 *  at a time, newest first, with "Next tip" (or a swipe) for more, and how many
 *  members shared one. Text only, no names, until step 4. Shows nothing when
 *  there are no tips, or for free accounts (the database returns none). */
export function FinisherTipsCard({ skill, tips }: { skill: string; tips: { body: string; total: number }[] | undefined }) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const [x0, setX0] = useState<number | null>(null);
  if (!tips || tips.length === 0) return null;
  const k = i % tips.length;
  const next = () => setI((n) => n + 1);
  return (
    <section className="flex flex-col gap-1.5 rounded-[18px] px-4 py-3.5" style={{ background: "#fbf3df", color: K.forest }} data-testid="finisher-tips"
      onTouchStart={(e) => setX0(e.touches[0].clientX)}
      onTouchEnd={(e) => { if (x0 != null && Math.abs(e.changedTouches[0].clientX - x0) > 50) next(); setX0(null); }}>
      <h2 className="m-0 text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.amberText }}>
        {t("flock.journeys.tips.eyebrow", "From members who've done {{skill}}", { skill })}
      </h2>
      <p className="m-0 text-[15px] leading-[1.45]" data-testid="finisher-tip-text" aria-live="polite">{`“${tips[k].body}”`}</p>
      <div className="flex items-center gap-3">
        <span className="flex-1 text-[12.5px]" style={{ color: K.quiet }}>
          {t("flock.journeys.tips.shared", "Shared by {{count}} members who finished", { count: tips[0].total })}
        </span>
        {tips.length > 1 && (
          <button type="button" onClick={next} className="min-h-[36px] text-[13px] font-[700]" style={{ color: K.amberText }} data-testid="next-tip">
            {t("flock.journeys.tips.next", "Next tip")}
          </button>
        )}
      </div>
    </section>
  );
}
