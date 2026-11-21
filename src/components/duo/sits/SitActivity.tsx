// A sit's activity rows, number tiles and delete control. Shared by the phone
// sit page (/sits/$sitId) and the iPhone Duo Sits screen (SitsDuo).
import type { ReactNode } from "react";
import { Activity, AlertTriangle, BookOpen, CheckSquare, Image as ImageIcon, Scale } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaIconTile, KyaLink } from "@/components/kya";
import { formatLocalDateTime } from "@/lib/dates";
import { renderDerivedTask } from "@/lib/routineTaskRender";
import type { DerivedTask } from "@/lib/derivedTasks";
import type { SitActivity, useSitDelete } from "@/components/duo/sits/sitsData";

export function fmtWhen(iso: string): string {
  return formatLocalDateTime(new Date(iso), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ActivityRow({ a, last, birdLabel }: { a: SitActivity; last: boolean; birdLabel: (id: string) => string }) {
  const { t, i18n } = useTranslation();
  const when = fmtWhen(a.at);
  if (a.kind === "scan") {
    const triage = a.status === "red" || a.status === "yellow";
    return (
      <Row last={last} leading={<KyaIconTile tone={triage ? "amber" : "forest"}><Activity className="size-[18px]" /></KyaIconTile>}
        title={a.status === "red"
          ? t("sitDetail.scanConcern", "{{bird}} · health check — concern flagged", { bird: birdLabel(a.bird_id) })
          : a.status === "yellow"
            ? t("sitDetail.scanCheck", "{{bird}} · health check — something to check", { bird: birdLabel(a.bird_id) })
            : t("sitDetail.scanClear", "{{bird}} · health check — all clear", { bird: birdLabel(a.bird_id) })}
        subtitle={`${when}${a.reasons ? ` · ${a.reasons.replace(/ \| /g, " · ")}` : ""}`}
      />
    );
  }
  if (a.kind === "weight") {
    return (
      <Row last={last} leading={<KyaIconTile><Scale className="size-[18px]" /></KyaIconTile>}
        title={t("sitDetail.weightRow", "{{bird}} · {{grams}} g", { bird: birdLabel(a.bird_id), grams: a.grams })}
        subtitle={when}
      />
    );
  }
  if (a.kind === "journal") {
    return (
      <Row last={last} leading={<KyaIconTile><BookOpen className="size-[18px]" /></KyaIconTile>}
        title={`${birdLabel(a.bird_id)} · ${a.title}`}
        subtitle={`${a.kindLabel ? `${a.kindLabel} · ` : ""}${when}`}
      />
    );
  }
  if (a.kind === "photo") {
    return (
      <Row last={last} leading={<KyaIconTile><ImageIcon className="size-[18px]" /></KyaIconTile>}
        title={t("sitDetail.photoRow", "{{bird}} · photo", { bird: birdLabel(a.bird_id) })}
        subtitle={when}
      />
    );
  }
  // Derived tasks render in the UI language; owner-typed titles show verbatim.
  const taskLabel = a.derived
    ? renderDerivedTask(a.derived as DerivedTask, i18n.getFixedT(i18n.language, "routine"), i18n.language).title
    : (a.label ?? t("sitDetail.routineTask", "Routine task"));
  return (
    <Row last={last} leading={<KyaIconTile><CheckSquare className="size-[18px]" /></KyaIconTile>}
      title={t("sitDetail.taskComplete", "Task complete — {{label}}", { label: taskLabel })}
      subtitle={when}
    />
  );
}

function Row({ leading, title, subtitle, last }: { leading: ReactNode; title: string; subtitle: string; last: boolean }) {
  return (
    <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5" style={{ borderBottom: last ? undefined : `1px solid ${K.line}` }}>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[15px] font-[600]">{title}</p>
        <p className="m-0 truncate text-[13px]" style={{ color: K.quiet }}>{subtitle}</p>
      </div>
    </div>
  );
}

export function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-1 py-3.5 text-center">
      <p className="m-0 text-[20px] font-[700]">{value}</p>
      <p className="m-0 text-[11.5px] leading-[1.25]" style={{ color: K.quiet }}>{label}</p>
    </div>
  );
}

/** "Delete this sit" and its confirm (from useSitDelete). */
export function DeleteSitControl({ del }: { del: ReturnType<typeof useSitDelete> }) {
  const { t } = useTranslation();
  if (!del.canDelete) return null;
  return del.confirmingDelete ? (
    <div className="rounded-[16px] p-3.5 text-left" style={{ background: "#fcebeb" }}>
      {del.isActiveSit && (
        <p className="m-0 mb-2 flex items-start gap-2 text-[14px] font-[700]" style={{ color: K.red }}>
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t("sitDetail.activeWarning", "This sit is active right now — a sitter is covering. Deleting it ends their access immediately.")}
        </p>
      )}
      <p className="m-0 text-[14px] leading-[1.5]">
        {t("sitDetail.deleteConfirmChecks", "Delete this sit? This can't be undone. Logs recorded during it (daily checks, weights, and photos) are kept but no longer tied to the sit; its checklist and task completions are removed.")}
      </p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={del.deleteSit} disabled={del.deleting} className="min-h-[48px] flex-1 rounded-full px-4 text-[15px] font-[700] text-white disabled:opacity-50" style={{ background: K.red }}>
          {del.deleting ? t("sitDetail.deleting", "Deleting…") : t("sitDetail.deleteSit", "Delete sit")}
        </button>
        <button type="button" onClick={() => del.setConfirmingDelete(false)} disabled={del.deleting} className="min-h-[48px] rounded-full border-2 bg-white px-5 text-[15px] font-[700] disabled:opacity-50" style={{ borderColor: K.forest, color: K.forest }}>{t("sitDetail.keep", "Keep")}</button>
      </div>
    </div>
  ) : (
    <KyaLink color={K.red} onClick={() => del.setConfirmingDelete(true)}>{t("sitDetail.deleteThisSit", "Delete this sit")}</KyaLink>
  );
}
