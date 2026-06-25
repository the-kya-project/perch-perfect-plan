import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getSitterDashboard } from "@/lib/sitter.functions";
import { replaySitterOnboarding } from "@/components/SitterOnboarding";
import { Stethoscope, ChevronRight, HelpCircle } from "lucide-react";

// Sitter Home tab: the all-birds home base. Warm welcome + an overview naming
// every bird, then a card per bird with today's task progress and health-scan
// status. Tapping a bird selects it and goes to its Today. Same underlying data
// as each bird's Today, so statuses always agree.

// "Willow" / "Willow and Moxie" / "Willow, Moxie, and Kiwi"
function formatNames(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return "your birds";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(", ")}, and ${n[n.length - 1]}`;
}

export function SitterDashboard({ token }: { token: string }) {
  const fn = useServerFn(getSitterDashboard);
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["sitter-dashboard", token],
    queryFn: () => fn({ data: { token } }),
  });
  const birds = (data?.birds ?? []) as any[];
  const allNames = formatNames(birds.map((b) => b.name));

  return (
    <main className="mx-auto max-w-md space-y-6 px-5 py-6">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-medium leading-tight text-[#1a3d2e]">Welcome back</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[#5f5e5a]">
            {isLoading
              ? "Loading the birds in your care…"
              : `You're caring for ${allNames}. Tap any bird to see their day and check in on how they're doing.`}
          </p>
        </div>
        <button
          onClick={replaySitterOnboarding}
          className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#e8f0ec] px-3 py-1.5 text-xs font-medium text-[#2d6a4f] active:scale-95"
        >
          <HelpCircle className="size-3.5" /> Walkthrough
        </button>
      </header>

      <section data-coach="home-overview">
        <h2 className="text-base font-medium text-[#1a3d2e]">Birds in your care</h2>
        {isLoading ? (
          <p className="mt-3 rounded-2xl bg-[#efe9da] p-4 text-sm text-[#5f5e5a]">Loading…</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {birds.map((b, i) => {
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
                    data-coach={i === 0 ? "bird-card" : undefined}
                    className="flex w-full items-center gap-3 rounded-2xl bg-[#efe9da] p-3 text-left shadow-sm active:scale-[0.99]"
                  >
                    {b.photo_url ? (
                      <img
                        src={b.photo_url}
                        alt={b.name}
                        style={{ objectPosition: b.photo_position ?? "50% 20%" }}
                        className="block size-16 shrink-0 rounded-xl object-cover ring-1 ring-[#e3ded0]"
                      />
                    ) : (
                      <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-[#1a3d2e] text-2xl font-medium text-white">{initial}</div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-base font-medium text-sage-900">{b.name}</p>
                        {b.species && <span className="truncate text-xs text-[#5f5e5a]">{b.species}</span>}
                      </div>

                      <p className="mt-1.5 text-xs text-[#5f5e5a]">
                        {b.tasksTotal === 0 ? "No routine tasks" : allDone ? `All ${b.tasksTotal} done` : `${b.tasksDone} of ${b.tasksTotal} done`}
                      </p>
                      {b.tasksTotal > 0 && (
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white">
                          <div className={`h-full rounded-full ${allDone ? "bg-warn-green" : "bg-[#2d6a4f]"}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}

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
      </section>
    </main>
  );
}
