import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SetupShell, SETUP_STEPS, TOTAL_STEPS } from "@/components/SetupShell";
import { Plus, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/birds/$birdId/setup")({
  head: () => ({ meta: [{ title: "Set up bird — Parrot Care Companion" }] }),
  component: BirdSetup,
});

function BirdSetup() {
  const { birdId } = Route.useParams();
  const navigate = useNavigate();

  const { data: bird, isLoading } = useQuery({
    queryKey: ["bird-setup", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, name, setup_complete, setup_step")
        .eq("id", birdId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const [step, setStep] = useState<number>(2);
  const [saving, setSaving] = useState(false);

  // Initialise step from stored progress; clamp to 2..TOTAL_STEPS (step 1 lives in new.tsx)
  useEffect(() => {
    if (!bird) return;
    if (bird.setup_complete) {
      navigate({ to: "/birds/$birdId", params: { birdId }, replace: true });
      return;
    }
    const stored = Number(bird.setup_step ?? 0);
    setStep(Math.min(TOTAL_STEPS, Math.max(2, stored || 2)));
  }, [bird, birdId, navigate]);

  async function persistStep(nextStep: number, complete = false) {
    setSaving(true);
    const { error } = await supabase
      .from("birds")
      .update({ setup_step: nextStep, setup_complete: complete } as any)
      .eq("id", birdId);
    setSaving(false);
    if (error) { toast.error(error.message); return false; }
    return true;
  }

  async function onNext() {
    if (step >= TOTAL_STEPS) {
      const ok = await persistStep(TOTAL_STEPS, true);
      if (ok) {
        toast.success(`${bird?.name ?? "Bird"} setup complete.`);
        navigate({ to: "/birds/$birdId", params: { birdId } });
      }
      return;
    }
    const next = step + 1;
    const ok = await persistStep(next);
    if (ok) setStep(next);
  }

  async function onBack() {
    if (step <= 2) return; // Step 1 lives in /birds/new; basics are editable via the tabs.
    const prev = step - 1;
    const ok = await persistStep(prev);
    if (ok) setStep(prev);
  }

  async function onSaveAndExit() {
    const ok = await persistStep(step);
    if (ok) {
      toast.success("Progress saved.");
      navigate({ to: "/dashboard" });
    }
  }

  if (isLoading || !bird || bird.setup_complete) {
    return (
      <SetupShell step={step} title="Loading…">
        <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />
      </SetupShell>
    );
  }

  const meta = SETUP_STEPS[step - 1];
  const isLast = step === TOTAL_STEPS;

  return (
    <SetupShell
      step={step}
      title={meta.title}
      saving={saving}
      onBack={onBack}
      onNext={onNext}
      onSaveAndExit={onSaveAndExit}
      nextLabel={isLast ? "Finish setup" : "Next"}
      backDisabled={step <= 2}
    >
      <StepBody step={step} birdId={birdId} birdName={bird.name} />
    </SetupShell>
  );
}

function StepBody({ step, birdId, birdName }: { step: number; birdId: string; birdName: string }) {
  if (step === 5) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
          <p className="text-sm font-semibold">You're ready to finish setup for {birdName}.</p>
          <p className="mt-1 text-sm text-sage-600">
            Tap <strong>Finish setup</strong> to mark this bird's plan complete. You can edit anything later from the tabs.
          </p>
        </div>
        <Link
          to="/birds/$birdId"
          params={{ birdId }}
          className="block rounded-xl border border-sage-200 bg-white p-3 text-center text-sm font-semibold text-sage-700"
        >
          Jump to full editor
        </Link>
      </div>
    );
  }

  const blurbs: Record<number, { lead: string; hint: string }> = {
    2: {
      lead: "Care plan — diet, housing, handling, behavior and health notes.",
      hint: "We'll add the structured fields here in the next iteration. For now, tap Next to advance, or open the full editor to fill it in.",
    },
    3: {
      lead: "Daily routine — wake, feed, out-of-cage, bedtime.",
      hint: "Routine builder is coming next. Skip ahead and you can add tasks from the Routine tab any time.",
    },
    4: {
      lead: "Emergency info — vets, contacts, and home info for sitters.",
      hint: "Most of this is inherited from your account defaults. The full form lives on the Emergency tab.",
    },
  };
  const b = blurbs[step] ?? { lead: "", hint: "" };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <p className="text-sm font-semibold">{b.lead}</p>
        <p className="mt-2 text-sm text-sage-600">{b.hint}</p>
      </div>
      <Link
        to="/birds/$birdId"
        params={{ birdId }}
        className="block rounded-xl border border-sage-200 bg-white p-3 text-center text-sm font-semibold text-sage-700"
      >
        Open the full editor for this step
      </Link>
    </div>
  );
}
