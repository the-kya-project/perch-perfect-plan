import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, Stethoscope, ChevronRight } from "lucide-react";
import { InkHero, Card } from "@/components/system";
import { useActiveCaregiver, CaregiverTodayChecklist, CaregiverLoading } from "@/components/CaregiverHome";
import type { ActiveCaregiverBird } from "@/lib/caregiver.functions";

// Full-screen per-bird daily checklist for a covering household member — the
// authenticated equivalent of the sitter's per-bird Today. Reached by tapping a
// bird card in the "Covering …" section on Home. Reuses the same active-caregiver
// data (useActiveCaregiver) and the shared CaregiverTodayChecklist (scoped to the
// bird) + task-completion path — no parallel checklist. Only renders while the
// sit is active and the user is its caregiver (the hook enforces both); otherwise
// it shows a "not active" card.
export const Route = createFileRoute("/_authenticated/covering/$sitId/$birdId")({
  head: () => ({ meta: [{ title: "Daily care — Kya & Co." }] }),
  component: CoveringBirdPage,
});

// Status-aware entry to today's health scan — mirrors the sitter ScanCard's
// treatment (amber = not done, red/amber = flagged, green = done) but links to
// the authenticated scan route. Not parallel scan logic: /birds/$birdId/scan IS
// the shared scan flow.
function ScanEntry({ bird, birdId }: { bird: ActiveCaregiverBird; birdId: string }) {
  const done = bird.scanDone;
  const flagged = bird.scanStatus === "red" || bird.scanStatus === "yellow";
  const tone = !done ? "amber" : bird.scanStatus === "red" ? "red" : flagged ? "amber" : "green";
  const color = tone === "red" ? "text-warn-red" : tone === "amber" ? "text-warn-amber" : "text-warn-green";
  const ring = tone === "red" ? "ring-warn-red/30" : tone === "amber" ? "ring-warn-amber/30" : "ring-warn-green/25";
  const label = !done
    ? "Today's health check — not done yet"
    : flagged
      ? "Health check done — flagged"
      : "Today's health check — done";
  return (
    <Link
      to="/birds/$birdId/scan"
      params={{ birdId }}
      className={`flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ${ring} active:scale-[0.99]`}
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-full bg-[var(--cream2)] ${color}`}>
        <Stethoscope className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-[var(--mute2)]">Daily health check · {bird.name}</span>
        <span className={`block text-sm font-medium ${color}`}>{label}</span>
      </div>
      <ChevronRight className="size-5 shrink-0 self-center text-[var(--mute2)]" />
    </Link>
  );
}

function CoveringBirdPage() {
  const { sitId, birdId } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useActiveCaregiver();
  const sit = data?.sits?.find((s) => s.id === sitId) ?? null;
  const bird = sit?.birds.find((b) => b.id === birdId) ?? null;

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={() => navigate({ to: "/dashboard" })}
          eyebrow={sit?.ownerName ? `Covering ${sit.ownerName}'s flock` : "Daily care"}
          headline={bird ? bird.name : "Daily care"}
          body={bird ? `Today's care for ${bird.name}.` : undefined}
        />
        <main className="space-y-4 px-5 pt-5">
          {isLoading ? (
            <CaregiverLoading />
          ) : !sit || !bird ? (
            <Card className="p-6 text-center">
              <p className="t-body text-[var(--ink2)]">This sit isn't active right now.</p>
            </Card>
          ) : (
            <>
              {/* Daily health scan — a distinct daily action, shown alongside the
                  routine tasks. Reuses the authenticated scan flow
                  (/birds/$birdId/scan, gated by record_health; it tags the scan
                  with the active sit id via useActiveSitIdForBird). */}
              <ScanEntry bird={bird} birdId={birdId} />
              <CaregiverTodayChecklist sit={sit} birdId={birdId} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
