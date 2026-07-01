import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { InkHero, Card } from "@/components/system";
import { useActiveCaregiver, CaregiverTodayChecklist, CaregiverLoading } from "@/components/CaregiverHome";

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
        <main className="px-5 pt-5">
          {isLoading ? (
            <CaregiverLoading />
          ) : !sit || !bird ? (
            <Card className="p-6 text-center">
              <p className="t-body text-[var(--ink2)]">This sit isn't active right now.</p>
            </Card>
          ) : (
            <CaregiverTodayChecklist sit={sit} birdId={birdId} />
          )}
        </main>
      </div>
    </div>
  );
}
