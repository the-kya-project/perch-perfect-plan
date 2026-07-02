import { createFileRoute, Link, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPastBirds } from "@/lib/handoff.functions";
import { ArrowLeft, Feather, Loader2 } from "lucide-react";
import { InkHero, Card, IconTile, StatusPill, PrimaryButton } from "@/components/system";

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
                  <PastBirdCard key={b.id} bird={b} last={i === birds.length - 1} />
                ))}
              </Card>
              <p className="px-1 pt-2 text-center t-meta leading-relaxed">
                Their full records went with them. These are your keepsakes: who they were and where they went.
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// Static keepsake card — everything shows on the card itself (no tap target, no
// detail view). Text wraps freely so the dates and destination are never clipped.
function PastBirdCard({ bird: b, last }: { bird: any; last: boolean }) {
  return (
    <div className={`px-4 py-3.5 ${last ? "" : "border-b border-[var(--line2)]"}`}>
      <div className="flex items-start gap-3">
        {b.photo_thumb ? (
          <img src={b.photo_thumb} alt="" className="size-10 shrink-0 rounded-full object-cover ring-1 ring-[var(--line2)]" />
        ) : (
          <IconTile tone="pale" icon={<Feather className="size-5" />} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="t-item">{b.bird_name}</span>
            {b.was_foster && <StatusPill tone="good">Foster</StatusPill>}
          </div>
          {b.species && <p className="t-meta mt-0.5">{b.species}</p>}
          <div className="mt-2 space-y-0.5">
            <p className="t-meta leading-relaxed">{withYouLabel(b.intake_date, b.departed_on)}</p>
            <p className="t-meta leading-relaxed">{whereLabel(b)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Where they went — from the sender's own handoff record (they entered the
// recipient's name), so it's safe to show back to them.
function whereLabel(b: any): string {
  const on = ` on ${fmt(b.departed_on)}`;
  if (b.recipient_name) return `Found a home with ${b.recipient_name}${on}`;
  if (b.mode === "pdf") return `Left as a PDF handoff${on}`;
  return `Found a new home${on}`;
}
function withYouLabel(intake: string | null, departed: string): string {
  return intake ? `With you from ${fmt(intake)} to ${fmt(departed)}` : `With you until ${fmt(departed)}`;
}
function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
