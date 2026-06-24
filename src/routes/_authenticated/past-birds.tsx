import { createFileRoute, Link, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPastBirds } from "@/lib/handoff.functions";
import { ArrowLeft, Feather, Loader2 } from "lucide-react";
import { InkHero, Card, RecordRow, IconTile, StatusPill, PrimaryButton } from "@/components/system";

// Past birds archive — read-only, sender-side memory of birds handed off.
// Snapshots only (not linked to live records). Newest departures first.
export const Route = createFileRoute("/_authenticated/past-birds")({
  head: () => ({ meta: [{ title: "Past birds — Kya & Co." }] }),
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
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          eyebrow="Past birds"
          headline="Past birds"
        />

        <main className="space-y-4 px-5 pt-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 t-meta">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : birds.length === 0 ? (
            <Card className="p-8 text-center">
              <IconTile tone="pale" icon={<Feather className="size-5" />} />
              <p className="mt-3 t-body">No past birds yet. When you hand off a bird, a memory of them will live here.</p>
              <div className="mt-4">
                <Link to="/dashboard">
                  <PrimaryButton tone="ink" full={false}>Back to your flock</PrimaryButton>
                </Link>
              </div>
            </Card>
          ) : (
            <>
              <Card>
                {birds.map((b: any, i: number) => (
                  <RecordRow
                    key={b.id}
                    last={i === birds.length - 1}
                    leading={<IconTile tone="pale" icon={<Feather className="size-5" />} />}
                    title={b.bird_name}
                    subtitle={`With you ${rangeLabel(b.intake_date, b.departed_on)} · ${destinationLabel(b)}`}
                    trailing={b.was_foster ? <StatusPill tone="good">Foster</StatusPill> : undefined}
                  />
                ))}
              </Card>
              <p className="px-1 pt-2 text-center t-meta leading-relaxed">
                Their full records went with them. You can see who they were and where they went.
              </p>
            </>
          )}
        </main>
      </div>
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
