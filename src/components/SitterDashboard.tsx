import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getSitterDashboard } from "@/lib/sitter.functions";
import { Stethoscope, ChevronRight } from "lucide-react";

// Multi-bird landing/return screen: every bird with today's task progress and
// health-scan status. Tapping a bird opens that bird's Today. Reflects the same
// data as each bird's Today card, so statuses always agree.
export function SitterDashboard({ token }: { token: string }) {
  const fn = useServerFn(getSitterDashboard);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["sitter-dashboard", token],
    queryFn: () => fn({ data: { token } }),
  });
  const birds = (data?.birds ?? []) as any[];

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-5">
      <div>
        <h1 className="text-xl font-medium text-[#1a3d2e]">Today's birds</h1>
        <p className="mt-1 text-sm text-[#5f5e5a]">Tap a bird to see their routine and run their daily health check.</p>
      </div>

      {isLoading ? (
        <p className="rounded-2xl bg-[#efe9da] p-4 text-sm text-[#5f5e5a]">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {birds.map((b) => {
            const pct = b.tasksTotal > 0 ? Math.round((b.tasksDone / b.tasksTotal) * 100) : 0;
            const allDone = b.tasksTotal > 0 && b.tasksDone === b.tasksTotal;
            const initial = (b.name?.slice(0, 1) ?? "?").toUpperCase();
            const scanAccent = !b.scanDone
              ? { dot: "bg-warn-amber", text: "text-warn-amber", label: "Health check not done yet" }
              : b.scanStatus === "red"
              ? { dot: "bg-warn-red", text: "text-warn-red", label: "Health check flagged" }
              : b.scanStatus === "yellow"
              ? { dot: "bg-warn-amber", text: "text-warn-amber", label: "Health check flagged" }
              : { dot: "bg-warn-green", text: "text-warn-green", label: "Health check done today" };
            return (
              <li key={b.id}>
                <button
                  onClick={() => navigate({ to: "/sitter/$token", params: { token }, search: { birdId: b.id } })}
                  className="flex w-full items-center gap-3 rounded-2xl bg-[#efe9da] p-3 text-left shadow-sm active:scale-[0.99]"
                >
                  {b.photo_url ? (
                    <img
                      src={b.photo_url}
                      alt={b.name}
                      style={{ objectPosition: b.photo_position ?? "50% 20%" }}
                      className="size-16 shrink-0 rounded-xl object-cover ring-1 ring-[#e3ded0]"
                    />
                  ) : (
                    <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-[#1a3d2e] text-2xl font-medium text-white">{initial}</div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-medium text-sage-900">{b.name}</p>
                      {b.species && <span className="truncate text-xs text-[#5f5e5a]">{b.species}</span>}
                    </div>

                    {/* Today's tasks progress */}
                    <p className="mt-1.5 text-xs text-[#5f5e5a]">
                      {b.tasksTotal === 0 ? "No routine tasks" : allDone ? `All ${b.tasksTotal} done` : `${b.tasksDone} of ${b.tasksTotal} done`}
                    </p>
                    {b.tasksTotal > 0 && (
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white">
                        <div className={`h-full rounded-full ${allDone ? "bg-warn-green" : "bg-[#2d6a4f]"}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}

                    {/* Today's scan status */}
                    <p className={`mt-2 inline-flex items-center gap-1.5 text-xs font-medium ${scanAccent.text}`}>
                      <span className={`size-2 rounded-full ${scanAccent.dot}`} />
                      <Stethoscope className="size-3.5" />
                      {scanAccent.label}
                    </p>
                  </div>

                  <ChevronRight className="size-5 shrink-0 self-center text-[#8a897f]" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
