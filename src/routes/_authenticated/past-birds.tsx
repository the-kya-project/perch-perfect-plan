import { createFileRoute, Link, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPastBirds } from "@/lib/handoff.functions";
import { ArrowLeft, Archive, Loader2 } from "lucide-react";

// Past birds archive — read-only, sender-side memory of birds handed off.
// Snapshots only (not linked to live records). Newest departures first.
export const Route = createFileRoute("/_authenticated/past-birds")({
  head: () => ({ meta: [{ title: "Past birds — Parrot Care Co-Pilot" }] }),
  component: PastBirds,
});

function PastBirds() {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/account" }));

  const getBirds = useServerFn(getPastBirds);
  const { data, isLoading } = useQuery({ queryKey: ["past-birds"], queryFn: () => getBirds() });
  const birds = data?.birds ?? [];

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <header className="bg-[#1a3d2e] pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 pb-5 pt-1">
          <button onClick={goBack} aria-label="Back" className="-ml-1 rounded-full p-1.5 text-white hover:bg-white/10"><ArrowLeft className="size-6" /></button>
          <h1 className="text-[27px] font-medium leading-tight text-white">Past birds</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-5 pt-5">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#5f5e5a]"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        ) : birds.length === 0 ? (
          <div className="rounded-[20px] bg-[#efe9da] p-8 text-center">
            <Archive className="mx-auto size-7 text-[#9a978c]" />
            <p className="mt-3 text-sm text-[#5f5e5a]">No past birds yet. When you hand off a bird, a memory of them will live here.</p>
            <Link to="/dashboard" className="mt-4 inline-block rounded-[14px] bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">Back to your flock</Link>
          </div>
        ) : (
          <>
            {birds.map((b: any) => (
              <article key={b.id} className="rounded-[16px] bg-white p-4 ring-1 ring-[#e3dcc9]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-medium text-[#1a3d2e]">{b.bird_name}</h2>
                    {b.species && <p className="text-xs italic text-[#5f5e5a]">{b.species}</p>}
                  </div>
                  {b.was_foster && <span className="shrink-0 rounded-full bg-[#e3efe2] px-2 py-0.5 text-[10px] font-medium text-[#2d6a4f]">Foster</span>}
                </div>
                <p className="mt-2 text-sm text-[#5f5e5a]">With you {rangeLabel(b.intake_date, b.departed_on)}</p>
                <p className="mt-0.5 text-sm text-[#1a3d2e]">{destinationLabel(b)}</p>
              </article>
            ))}
            <p className="px-1 pt-2 text-center text-xs leading-relaxed text-[#8a897f]">
              Their full records went with them. You can see who they were and where they went.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function destinationLabel(b: any): string {
  if (b.recipient_name) return `Handed off to ${b.recipient_name}`;
  if (b.mode === "pdf") return "PDF handoff";
  return "Handed off";
}
function rangeLabel(intake: string | null, departed: string): string {
  const dep = fmt(departed);
  return intake ? `${fmt(intake)} – ${dep}` : `until ${dep}`;
}
function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
