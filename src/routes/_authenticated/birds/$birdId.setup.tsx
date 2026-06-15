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
  const [blockNext, setBlockNext] = useState(false);
  useEffect(() => { setBlockNext(false); }, [step]);
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
      nextDisabled={blockNext}
    >
      <StepBody step={step} birdId={birdId} birdName={bird.name} onBlockNext={setBlockNext} />
    </SetupShell>
  );
}

function StepBody({ step, birdId, birdName }: { step: number; birdId: string; birdName: string }) {
  if (step === 2) return <DayInLifeStep birdId={birdId} />;

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
    3: {
      lead: "Care details — diet, housing, handling, behavior and health notes.",
      hint: "We'll add the structured fields here in the next iteration. For now, tap Next to advance, or open the full editor to fill it in.",
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

const TIME_BLOCKS: { key: string; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "midday", label: "Midday" },
  { key: "evening", label: "Evening" },
  { key: "bedtime", label: "Bedtime" },
  { key: "custom", label: "Custom" },
];

const COMMON_TASKS = [
  "Uncover cage",
  "Fresh food",
  "Fresh water",
  "Out-of-cage time",
  "Misting or bath",
  "Training or play",
  "Medication",
  "Cover for night",
];

function DayInLifeStep({ birdId }: { birdId: string }) {
  const qc = useQueryClient();

  const { data: plan } = useQuery({
    queryKey: ["plan", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("care_plans").select("id").eq("bird_id", birdId).maybeSingle();
      return data;
    },
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", plan?.id],
    enabled: !!plan?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("routine_tasks")
        .select("*")
        .eq("care_plan_id", plan!.id)
        .order("category")
        .order("sort_order");
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const t of tasks) (g[t.category] ??= []).push(t);
    return g;
  }, [tasks]);

  function refresh() {
    if (plan?.id) qc.invalidateQueries({ queryKey: ["tasks", plan.id] });
  }

  if (isLoading || !plan) {
    return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <p className="text-sm font-semibold">Walk through a normal day.</p>
        <p className="mt-1 text-sm text-sage-600">What happens, and when? Tap chips to add the usual tasks to each block — they'll appear in the Routine tab.</p>
      </div>

      {TIME_BLOCKS.map((block) => (
        <TimeBlockSection
          key={block.key}
          block={block}
          planId={plan.id}
          tasks={grouped[block.key] ?? []}
          onChange={refresh}
        />
      ))}
    </div>
  );
}

function TimeBlockSection({
  block,
  planId,
  tasks,
  onChange,
}: {
  block: { key: string; label: string };
  planId: string;
  tasks: any[];
  onChange: () => void;
}) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const present = new Map(tasks.map((t) => [t.title.trim().toLowerCase(), t]));

  async function add(title: string) {
    if (busy) return;
    setBusy(true);
    await supabase.from("routine_tasks").insert({
      care_plan_id: planId,
      title,
      category: block.key,
      sort_order: tasks.length,
    } as any);
    setBusy(false);
    onChange();
  }
  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    await supabase.from("routine_tasks").delete().eq("id", id);
    setBusy(false);
    onChange();
  }
  async function toggle(title: string) {
    const existing = present.get(title.trim().toLowerCase());
    if (existing) await remove(existing.id);
    else await add(title);
  }
  async function addCustom() {
    const t = custom.trim();
    if (!t) return;
    await add(t);
    setCustom("");
  }
  async function saveNote(id: string, value: string) {
    await supabase.from("routine_tasks").update({ instructions: value || null } as any).eq("id", id);
    onChange();
  }

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-sage-600">{block.label}</h2>

      <div className="mt-3 flex flex-wrap gap-2">
        {COMMON_TASKS.map((t) => {
          const isOn = present.has(t.trim().toLowerCase());
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              disabled={busy}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 " +
                (isOn
                  ? "border-sage-600 bg-sage-600 text-white"
                  : "border-sage-200 bg-white text-sage-700 hover:bg-sage-50")
              }
            >
              {isOn ? "✓ " : "+ "}{t}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          className="input flex-1"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Add your own…"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!custom.trim() || busy}
          className="rounded-xl bg-sage-100 px-3 text-sm font-semibold text-sage-700 disabled:opacity-50"
          aria-label="Add custom task"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {tasks.length > 0 && (
        <ul className="mt-4 space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="rounded-lg bg-sage-50 p-3">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-semibold">{t.title}</p>
                <button
                  type="button"
                  onClick={() => remove(t.id)}
                  className="rounded p-1 text-sage-600 hover:bg-sage-100"
                  aria-label={`Remove ${t.title}`}
                >
                  <X className="size-4" />
                </button>
              </div>
              <textarea
                className="input area mt-2 text-xs"
                placeholder="Add a note (optional)"
                defaultValue={t.instructions ?? ""}
                onBlur={(e) => {
                  if ((e.target.value ?? "") !== (t.instructions ?? "")) {
                    saveNote(t.id, e.target.value);
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.55rem .7rem;font-size:14px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:50px;line-height:1.4}`}</style>
    </section>
  );
}
