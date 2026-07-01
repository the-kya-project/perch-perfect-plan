import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { Stethoscope, ChevronRight, ChevronDown } from "lucide-react";

// One "bird in your care" card: photo + name + today's task progress (+ optional
// health-scan status). Shared by the sitter Home (SitterDashboard) and the
// covering household member's Home so both surfaces use ONE card, not two.
//
// `scan` is optional — the sitter dashboard has per-bird scan status; the
// authenticated caregiver Home shows task progress only. `expanded` (when the
// card acts as an in-place expander) flips the chevron; omit it for navigation.
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
  const pct = tasksTotal > 0 ? Math.round((tasksDone / tasksTotal) * 100) : 0;
  const allDone = tasksTotal > 0 && tasksDone === tasksTotal;
  const initial = (name?.slice(0, 1) ?? "?").toUpperCase();
  const scanAccent = !scan
    ? null
    : !scan.done
      ? { dot: "bg-warn-amber", text: "text-warn-amber", label: "Health check not done yet" }
      : scan.status === "red"
        ? { dot: "bg-warn-red", text: "text-warn-red", label: "Health check flagged" }
        : scan.status === "yellow"
          ? { dot: "bg-warn-amber", text: "text-warn-amber", label: "Health check flagged" }
          : { dot: "bg-warn-green", text: "text-warn-green", label: "Health check done today" };

  return (
    <button
      onClick={onClick}
      data-coach={coach}
      className="flex w-full items-center gap-3 rounded-2xl bg-[#efe9da] p-3 text-left shadow-sm active:scale-[0.99]"
    >
      {photoUrl ? (
        <div className="relative size-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-[#e3ded0]">
          <BirdPhotoCrop url={photoUrl} original={photoUrl} position={photoPosition ?? "50% 20%"} alt={name} />
        </div>
      ) : (
        <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-[#1a3d2e] text-2xl font-medium text-white">{initial}</div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-base font-medium text-sage-900">{name}</p>
          {species && <span className="truncate text-xs text-[#5f5e5a]">{species}</span>}
        </div>

        <p className="mt-1.5 text-xs text-[#5f5e5a]">
          {tasksTotal === 0 ? "No routine tasks" : allDone ? `All ${tasksTotal} done` : `${tasksDone} of ${tasksTotal} done`}
        </p>
        {tasksTotal > 0 && (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white">
            <div className={`h-full rounded-full ${allDone ? "bg-warn-green" : "bg-[#2d6a4f]"}`} style={{ width: `${pct}%` }} />
          </div>
        )}

        {scanAccent && (
          <p className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium ${scanAccent.text}`}>
            <span className={`size-2 rounded-full ${scanAccent.dot}`} />
            <Stethoscope className="size-3.5" />
            {scanAccent.label}
          </p>
        )}
      </div>

      {expanded === undefined ? (
        <ChevronRight className="size-5 shrink-0 self-center text-[#8a897f]" />
      ) : (
        <ChevronDown className={`size-5 shrink-0 self-center text-[#8a897f] transition-transform ${expanded ? "rotate-180" : ""}`} />
      )}
    </button>
  );
}
