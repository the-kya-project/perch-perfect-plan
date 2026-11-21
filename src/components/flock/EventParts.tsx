import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K } from "@/components/kya";
import { dateBlock, shortWhen, type EventCardRow } from "@/lib/flockEvents";

export function Tag({ children, tone }: { children: React.ReactNode; tone: "online" | "good" | "status" }) {
  const style = tone === "online" ? { background: "#dceaf4", color: "#24506b" }
    : tone === "good" ? { background: K.lime, color: K.forest }
    : { background: K.amberBg, color: K.amberText };
  return <span className="rounded-full px-2 py-0.5 text-[11.5px] font-[700]" style={style}>{children}</span>;
}

/** "14 going", "6 of 10 spots", "22 went". */
export function countLine(t: TFunction, e: Pick<EventCardRow, "going" | "spot_limit">, past: boolean): string {
  if (past) return t("flock.events.went", "{{count}} went", { count: e.going });
  if (e.spot_limit != null) return t("flock.events.spots", "{{going}} of {{limit}} spots", { going: e.going, limit: e.spot_limit });
  return t("flock.events.going", "{{count}} going", { count: e.going });
}

export function statusLabel(t: TFunction, s: EventCardRow["status"]): string | null {
  switch (s) {
    case "pending": return t("flock.events.status.pending", "Waiting for review");
    case "changes_requested": return t("flock.events.status.changes", "Changes requested");
    case "declined": return t("flock.events.status.declined", "Not approved");
    case "cancelled": return t("flock.events.status.cancelled", "Cancelled");
    default: return null;
  }
}

/** One event in the Events tab (Batch 5, screen 1): date block, title, when
 *  and where (or Online), Do good for volunteer days, how many are going. */
export function EventCard({ e, past }: { e: EventCardRow; past: boolean }) {
  const { t, i18n } = useTranslation();
  const { month, day } = dateBlock(e.starts_at, i18n.language);
  const where = e.mode === "online" ? t("flock.events.online", "Online") : e.place_name;
  const status = statusLabel(t, e.status);
  return (
    <Link to="/flock/events/$eventId" params={{ eventId: e.event_id }} data-event={e.event_id}
      className="flex items-center gap-3 rounded-[18px] bg-white p-3.5" style={{ color: K.forest, opacity: e.status === "cancelled" ? 0.6 : 1 }}>
      <span className="flex w-12 shrink-0 flex-col items-center rounded-[12px] py-1.5 leading-tight" style={{ background: past ? K.mist : K.lime }}>
        <span className="text-[11.5px] font-[700] uppercase">{month}</span>
        <span className="text-[20px] font-[700]">{day}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-1.5">
          {e.mode === "online" && <Tag tone="online">{t("flock.events.online", "Online")}</Tag>}
          {e.kind === "volunteer" && <Tag tone="good">{t("flock.space.good", "Do good")}</Tag>}
          {status && <Tag tone="status">{status}</Tag>}
        </span>
        <span className="truncate text-[16px] font-[700]">{e.title}</span>
        <span className="truncate text-[13px]" style={{ color: K.quiet }}>{[shortWhen(e.starts_at, e.ends_at, i18n.language), where].filter(Boolean).join(" · ")}</span>
      </span>
      {(e.status === "live" || past) && <span className="shrink-0 text-[13px] font-[700]" style={{ color: K.moss }} data-testid="event-count">{countLine(t, e, past)}</span>}
    </Link>
  );
}
