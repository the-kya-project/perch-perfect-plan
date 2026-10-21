import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { speciesLabel } from "@/lib/speciesLabel";
import { Stethoscope, ChevronRight, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";

// One "bird in your care" card: photo + name + today's task progress (+ optional
// health-scan status), in the Kya & Co. white-card look.
//
// `scan` is optional — surfaces without per-bird scan status show task progress
// only. `expanded` (when the card acts as an in-place expander) flips the
// chevron; omit it for navigation.
export type BirdScan = { done: boolean; status?: string | null };

export function BirdCareCard({
  name, species, photoUrl, photoPosition, tasksDone, tasksTotal, scan, onClick, coach, expanded,
}: {
  name: string;
  species?: string | null;
  photoUrl?: string | null;
  photoPosition?: string | null;
  tasksDone: number;
  tasksTotal: number;
  scan?: BirdScan | null;
  onClick: () => void;
  coach?: string;
  expanded?: boolean;
}) {
  const { t } = useTranslation();
  const pct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
  const allDone = tasksTotal > 0 && tasksDone === tasksTotal;
  const initial = (name?.slice(0, 1) ?? "?").toUpperCase();
  const scanLabel = !scan
    ? null
    : !scan.done
      ? t("birdCareCard.healthCheckNotDone", "Health check not done yet")
      : scan.status === "red" || scan.status === "yellow"
        ? t("birdCareCard.healthCheckFlagged", "Health check flagged")
        : t("birdCareCard.healthCheckDoneToday", "Health check done today");
  const scanColor = !scan ? null
    : !scan.done ? K.amberText
    : scan.status === "red" ? K.red
    : scan.status === "yellow" ? K.amberText
    : K.moss;

  return (
    <button
      type="button"
      onClick={onClick}
      data-coach={coach}
      className="flex min-h-[76px] w-full items-center gap-3 rounded-[20px] bg-white px-4 py-3 text-left active:bg-black/[0.03]"
      style={{ color: K.forest }}
    >
      {photoUrl ? (
        <div className="relative size-14 shrink-0 overflow-hidden rounded-full">
          <BirdPhotoCrop url={photoUrl} original={photoUrl} position={photoPosition ?? "50% 20%"} alt={name} />
        </div>
      ) : (
        <div className="grid size-14 shrink-0 place-items-center rounded-full text-[20px] font-[700] text-white" style={{ background: K.forest }}>{initial}</div>
      )}

      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[15px] font-[700]">{name}</p>
        <p className="m-0 mt-0.5 truncate text-[13px]" style={{ color: K.quiet }}>
          {[
            species ? speciesLabel(t, species) : null,
            tasksTotal === 0
              ? t("birdCareCard.noRoutineTasks", "No routine tasks")
              : allDone
                ? t("birdCareCard.allDone", "All {{total}} done", { total: tasksTotal })
                : t("birdCareCard.doneOf", "{{done}} of {{total}} done", { done: tasksDone, total: tasksTotal }),
          ].filter(Boolean).join(" · ")}
        </p>
        {tasksTotal > 0 && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#d6dfd5" }} aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: K.forest }} />
          </div>
        )}
        {scanLabel && scanColor && (
          <p className="m-0 mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-[700]" style={{ color: scanColor }}>
            <Stethoscope className="size-3.5" aria-hidden="true" />
            {scanLabel}
          </p>
        )}
      </div>

      {expanded === undefined ? (
        <ChevronRight className="size-[18px] shrink-0 self-center" style={{ color: K.quiet }} aria-hidden="true" />
      ) : (
        <ChevronDown className={`size-[18px] shrink-0 self-center transition-transform ${expanded ? "rotate-180" : ""}`} style={{ color: K.quiet }} aria-hidden="true" />
      )}
    </button>
  );
}
