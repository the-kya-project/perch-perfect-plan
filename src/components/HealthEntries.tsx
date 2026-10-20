// Rows for the combined daily check + weight log (Health tab "Recent" and the
// Health history page): day groups in white cards, one ~58px row per entry.
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight, Scale } from "lucide-react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { K, KyaCard } from "@/components/kya";
import { formatLocalDate, formatLocalTime } from "@/lib/dates";
import { sitTitle } from "@/lib/sitText";
import { answerCounts, groupByDay, localDay, thingsToWatch, type HistoryEntry, type HistorySit } from "@/lib/healthHistory";

export type EntryContext = {
  birdName: (id: string) => string;
  sits: HistorySit[];
  names: Record<string, string>;
  myId: string | null | undefined;
};

/** The person covering a sit: the sitter's name, or the household member's. */
export function sitCaregiverName(t: TFunction, sit: HistorySit, names: Record<string, string>): string {
  if (sit.caregiver_user_id) return names[sit.caregiver_user_id] || t("healthHistory.householdMember", "Household member");
  return sit.sitter_name?.trim() || sit.sitter_email?.trim() || t("healthHistory.yourSitter", "Your sitter");
}

/** Who logged an entry: "You", the sitter's name, or the member's name. */
export function entryWho(t: TFunction, e: HistoryEntry, ctx: EntryContext): string {
  if (e.bySitter) {
    const sit = e.sitId ? ctx.sits.find((s) => s.id === e.sitId) : undefined;
    return sit ? sitCaregiverName(t, sit, ctx.names) : t("healthHistory.yourSitter", "Your sitter");
  }
  if (ctx.myId && e.userId === ctx.myId) return t("healthHistory.you", "You");
  return (e.userId && ctx.names[e.userId]) || t("healthHistory.householdMember", "Household member");
}

function mealText(t: TFunction, m: string | null): string | null {
  if (m === "before_meal") return t("dailyCheck.beforeMealLower", "before meal");
  if (m === "after_meal") return t("dailyCheck.afterMealLower", "after meal");
  return null;
}

/** "10 of 10 normal" / "9 normal, 1 not sure" for a sitter's check. */
export function sitterAnswerLine(t: TFunction, e: HistoryEntry & { kind: "check" }): string {
  const c = answerCounts(e);
  if (c.notSure === 0 && c.concerning === 0) return t("healthHistory.nOfNNormal", "{{n}} of {{total}} normal", { n: c.normal, total: c.total });
  const parts = [t("healthHistory.nNormal", "{{count}} normal", { count: c.normal })];
  if (c.notSure) parts.push(t("healthHistory.nNotSure", "{{count}} not sure", { count: c.notSure }));
  if (c.concerning) parts.push(t("healthHistory.nConcerning", "{{count}} concerning", { count: c.concerning }));
  return parts.join(", ");
}

function SitterTag() {
  const { t } = useTranslation();
  return (
    <span className="ml-1.5 inline-flex items-center rounded-full px-2 py-[1px] align-[1px] text-[11.5px] font-[700]" style={{ background: K.lime, color: K.forest }}>
      {t("healthHistory.sitterTag", "Sitter")}
    </span>
  );
}

function EntryIcon({ e }: { e: HistoryEntry }) {
  const tile = "grid size-9 shrink-0 place-items-center rounded-[12px]";
  if (e.kind === "weight") return <span className={tile} style={{ background: K.mist, color: K.forest }}><Scale className="size-[18px]" /></span>;
  if (thingsToWatch(e) > 0) {
    return (
      <span className={tile} style={{ background: K.amberBg, color: K.amberText }}>
        <span className="grid size-[19px] place-items-center rounded-full border-2 text-[11px] font-[800] leading-none" style={{ borderColor: K.amberText }}>!</span>
      </span>
    );
  }
  return <span className={tile} style={{ background: K.forest, color: K.lime }}><Check className="size-[18px]" strokeWidth={2.8} /></span>;
}

export function EntryRow({ e, ctx, last }: { e: HistoryEntry; ctx: EntryContext; last: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const name = ctx.birdName(e.birdId);
  const time = formatLocalTime(new Date(e.at), { hour: "numeric", minute: "2-digit" });
  const who = entryWho(t, e, ctx);
  let what: React.ReactNode;
  let detail: string[];
  if (e.kind === "weight") {
    what = <>{t("healthHistory.weighed", "Weighed")} <b>{t("healthHistory.grams", "{{n}} g", { n: e.grams.toLocaleString() })}</b></>;
    detail = [time, mealText(t, e.meal), who].filter(Boolean) as string[];
  } else {
    const n = thingsToWatch(e);
    if (e.bySitter) {
      what = n > 0 ? t("healthHistory.checkToWatch", "Daily check, {{count}} things to watch", { count: n }) : t("healthHistory.dailyCheck", "Daily check");
      detail = [sitterAnswerLine(t, e), time, who];
    } else {
      what = n > 0 ? t("healthHistory.checkToWatch", "Daily check, {{count}} things to watch", { count: n }) : t("healthHistory.checkAllNormal", "Daily check, all normal");
      detail = [time, who];
    }
  }
  const open = () =>
    e.kind === "check"
      ? navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId: e.birdId, scanId: e.id } })
      : navigate({ to: "/birds/$birdId/weight", params: { birdId: e.birdId } });
  return (
    <button
      type="button"
      onClick={open}
      className="flex min-h-[58px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-black/[0.03]"
      style={{ borderBottom: last ? undefined : `1px solid ${K.line}`, color: K.forest }}
    >
      <EntryIcon e={e} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-[1.35]">
          <b className="font-[700]">{name}</b>
          {e.bySitter && <SitterTag />}
          {" · "}{what}
        </span>
        <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: K.quiet }}>{detail.join(" · ")}</span>
      </span>
      <ChevronRight className="size-[18px] shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
    </button>
  );
}

/** "Tuesday, June 30", plus " · during Sam's sit" when a sit covers that day. */
export function dayLabel(t: TFunction, day: string, ctx: EntryContext): string {
  const [y, m, d] = day.split("-").map(Number);
  const label = formatLocalDate(new Date(y, m - 1, d), { weekday: "long", month: "long", day: "numeric" });
  const sit = ctx.sits.find((s) => s.start_date <= day && day <= s.end_date);
  return sit ? t("healthHistory.dayDuringSit", "{{day}} · during {{sit}}", { day: label, sit: sitTitle(t, {}, sitCaregiverName(t, sit, ctx.names)) }) : label;
}

export function EntryDays({ entries, ctx }: { entries: HistoryEntry[]; ctx: EntryContext }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      {groupByDay(entries, localDay).map((g) => (
        <div key={g.day}>
          <p className="m-0 mb-2 px-1 text-[13px] font-[700]" style={{ color: K.quiet }}>{dayLabel(t, g.day, ctx)}</p>
          <KyaCard>
            {g.entries.map((e, i) => <EntryRow key={`${e.kind}-${e.id}`} e={e} ctx={ctx} last={i === g.entries.length - 1} />)}
          </KyaCard>
        </div>
      ))}
    </div>
  );
}
