import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { getSitterDashboard } from "@/lib/sitter.functions";
import { replaySitterOnboarding } from "@/components/SitterOnboarding";
import { BirdCareCard } from "@/components/BirdCareCard";
import { HelpCircle } from "lucide-react";

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
          <h1 className="text-2xl font-medium leading-tight text-[#1a3d2e]">Welcome</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[#5f5e5a]">
            {isLoading
              ? "Getting the birds ready for you…"
              : `You're looking after ${allNames}. Tap any bird to see their day and how they're doing.`}
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
            {birds.map((b, i) => (
              <li key={b.id}>
                <BirdCareCard
                  name={b.name}
                  species={b.species}
                  photoUrl={b.photo_url}
                  photoPosition={b.photo_position}
                  tasksDone={b.tasksDone}
                  tasksTotal={b.tasksTotal}
                  scan={{ done: b.scanDone, status: b.scanStatus }}
                  coach={i === 0 ? "bird-card" : undefined}
                  onClick={() => navigate({ to: "/sitter/$token", params: { token }, search: { birdId: b.id } })}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
