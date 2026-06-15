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

function StepBody({
  step,
  birdId,
  birdName,
  onBlockNext,
}: {
  step: number;
  birdId: string;
  birdName: string;
  onBlockNext: (block: boolean) => void;
}) {
  if (step === 2) return <DayInLifeStep birdId={birdId} />;
  if (step === 3) return <FoodWaterStep birdId={birdId} birdName={birdName} onBlockNext={onBlockNext} />;
  if (step === 4) return <PersonalityStep birdId={birdId} birdName={birdName} />;
  if (step === 5) return <EnvironmentStep birdId={birdId} />;

  if (step === 7) {
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
    6: {
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

// ---------- Step 3: Food & water ----------

const DIET_OPTIONS = [
  { value: "pelleted", label: "Pelleted diet" },
  { value: "seed", label: "Seed mix" },
  { value: "pellet_seed", label: "Pellet & seed blend" },
  { value: "chop", label: "Fresh chop / formulated" },
  { value: "other", label: "Other" },
];

const UNITS = ["tablespoons", "cups", "grams", "scoops", "pieces"];

const FRESH_FOOD_OPTIONS = [
  "Leafy greens", "Carrot", "Bell pepper", "Broccoli", "Sweet potato",
  "Squash", "Apple (no seeds)", "Berries", "Banana", "Cooked grains",
  "Cooked legumes", "Sprouts", "Quinoa",
];

const TREAT_FREQ = [
  { value: "daily", label: "Daily" },
  { value: "few_per_week", label: "A few times a week" },
  { value: "training_only", label: "Training only" },
  { value: "rarely", label: "Rarely" },
];

const WATER_FREQ = [
  { value: "once", label: "Changed once daily" },
  { value: "twice", label: "Changed twice daily" },
  { value: "more", label: "More than twice daily" },
];

const NEVER_DEFAULTS = [
  "Chocolate", "Avocado", "Caffeine", "Alcohol",
  "Onion & garlic", "Salt", "Fruit pits & apple seeds",
];

const FEEDING_PATTERN = /food|feed|chop|pellet|seed|fresh|meal|breakfast|dinner/i;

function FoodWaterStep({
  birdId,
  birdName,
  onBlockNext,
}: {
  birdId: string;
  birdName: string;
  onBlockNext: (block: boolean) => void;
}) {
  const qc = useQueryClient();

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-food", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("care_plans")
        .select("*")
        .eq("bird_id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: routine = [] } = useQuery({
    queryKey: ["plan-routine-times", plan?.id],
    enabled: !!plan?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("routine_tasks")
        .select("title, time_of_day, category")
        .eq("care_plan_id", plan!.id);
      return data ?? [];
    },
  });

  const suggestedTimes = useMemo(() => {
    const out: string[] = [];
    for (const t of routine as any[]) {
      if (!FEEDING_PATTERN.test(t.title ?? "")) continue;
      const slot = (t.time_of_day && String(t.time_of_day).trim()) || capitalize(t.category);
      if (slot && !out.includes(slot)) out.push(slot);
    }
    return out;
  }, [routine]);

  // form state — initialized once from plan
  const [diet, setDiet] = useState<string[]>([]);
  const [dietOther, setDietOther] = useState("");
  const [brand, setBrand] = useState("");
  const [amountValue, setAmountValue] = useState("");
  const [amountUnit, setAmountUnit] = useState("");
  const [feedingTimes, setFeedingTimes] = useState<string[]>([]);
  const [newTime, setNewTime] = useState("");
  const [fresh, setFresh] = useState<string[]>([]);
  const [freshOther, setFreshOther] = useState("");
  const [treatsNotes, setTreatsNotes] = useState("");
  const [treatsFreq, setTreatsFreq] = useState("");
  const [never, setNever] = useState<string[]>([]);
  const [newNever, setNewNever] = useState("");
  const [waterFreq, setWaterFreq] = useState("");
  const [waterNotes, setWaterNotes] = useState("");
  const [storage, setStorage] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!plan || hydrated) return;
    setDiet(plan.diet_types ?? []);
    setDietOther(plan.diet_other ?? "");
    setBrand(plan.food_brand ?? "");
    setAmountValue(plan.amount_value != null ? String(plan.amount_value) : "");
    setAmountUnit(plan.amount_unit ?? "");
    const ft = (plan.feeding_times ?? []) as string[];
    setFeedingTimes(ft.length ? ft : suggestedTimes);
    setFresh(plan.fresh_foods ?? []);
    setFreshOther(plan.fresh_foods_other ?? "");
    setTreatsNotes(plan.treats_notes ?? "");
    setTreatsFreq(plan.treats_frequency ?? "");
    const nv = (plan.never_feed ?? []) as string[];
    setNever(nv.length ? nv : NEVER_DEFAULTS);
    setWaterFreq(plan.water_frequency ?? "");
    setWaterNotes(plan.water_notes ?? "");
    setStorage(plan.food_storage ?? "");
    setHydrated(true);
  }, [plan, suggestedTimes, hydrated]);

  // Validation: never allow amount without unit (or vice versa).
  const amountValid = (amountValue.trim() === "" && amountUnit === "") ||
    (amountValue.trim() !== "" && amountUnit !== "");
  useEffect(() => { onBlockNext(!amountValid); }, [amountValid, onBlockNext]);

  // Persist (debounced) whenever form changes after hydration.
  useEffect(() => {
    if (!plan || !hydrated) return;
    const handle = setTimeout(async () => {
      // Build mirrored text summaries for the existing Care plan tab.
      const dietLabels = diet.map((d) => DIET_OPTIONS.find((o) => o.value === d)?.label).filter(Boolean) as string[];
      if (diet.includes("other") && dietOther.trim()) dietLabels.push(dietOther.trim());
      const amountStr = amountValue && amountUnit ? `${amountValue} ${amountUnit}` : "";
      const foodSummaryParts = [
        dietLabels.length ? `Diet: ${dietLabels.join(", ")}` : "",
        brand.trim() ? `Brand: ${brand.trim()}` : "",
        amountStr ? `Amount per serving: ${amountStr}` : "",
        feedingTimes.length ? `Feeding times: ${feedingTimes.join(", ")}` : "",
        fresh.length || freshOther.trim()
          ? `Fresh foods: ${[...fresh, ...(freshOther.trim() ? [freshOther.trim()] : [])].join(", ")}`
          : "",
        storage.trim() ? `Stored: ${storage.trim()}` : "",
      ].filter(Boolean);
      const treatLabel = TREAT_FREQ.find((f) => f.value === treatsFreq)?.label;
      const treatsSummary = [treatsNotes.trim(), treatLabel ? `Frequency: ${treatLabel}` : ""].filter(Boolean).join(" — ");
      const waterLabel = WATER_FREQ.find((f) => f.value === waterFreq)?.label;
      const waterSummary = [waterLabel ?? "", waterNotes.trim()].filter(Boolean).join(" — ");

      await supabase
        .from("care_plans")
        .update({
          diet_types: diet,
          diet_other: dietOther || null,
          food_brand: brand || null,
          amount_value: amountValue ? Number(amountValue) : null,
          amount_unit: amountUnit || null,
          feeding_times: feedingTimes,
          fresh_foods: fresh,
          fresh_foods_other: freshOther || null,
          treats_notes: treatsNotes || null,
          treats_frequency: treatsFreq || null,
          never_feed: never,
          water_frequency: waterFreq || null,
          water_notes: waterNotes || null,
          food_storage: storage || null,
          // Mirror to legacy text fields so the Care plan tab reflects the flow.
          food_instructions: foodSummaryParts.join("\n") || null,
          treats_allowed: treatsSummary || null,
          foods_never_allowed: never.join(", ") || null,
          water_instructions: waterSummary || null,
        } as any)
        .eq("id", plan.id);
      qc.invalidateQueries({ queryKey: ["plan", birdId] });
    }, 500);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diet, dietOther, brand, amountValue, amountUnit, feedingTimes, fresh, freshOther, treatsNotes, treatsFreq, never, waterFreq, waterNotes, storage, hydrated]);

  if (isLoading || !plan) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  function toggleArr<T>(arr: T[], v: T, setter: (a: T[]) => void) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <p className="text-sm font-semibold">What does {birdName} eat, and how much?</p>
        <p className="mt-1 text-sm text-sage-600">Structured answers help the sitter know exactly what to serve.</p>
      </div>

      {/* Primary diet */}
      <Card title="Primary diet" hint="Choose all that apply.">
        <div className="flex flex-wrap gap-2">
          {DIET_OPTIONS.map((o) => (
            <Chip key={o.value} on={diet.includes(o.value)} onClick={() => toggleArr(diet, o.value, setDiet)}>
              {o.label}
            </Chip>
          ))}
        </div>
        {diet.includes("other") && (
          <input
            className="input mt-3"
            placeholder="Describe the other diet"
            value={dietOther}
            maxLength={200}
            onChange={(e) => setDietOther(e.target.value)}
          />
        )}
      </Card>

      <Card title="Brand or product (optional)">
        <input className="input" value={brand} maxLength={120} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Harrison's High Potency Fine" />
      </Card>

      <Card title="Amount per serving" hint="Always include a unit.">
        <div className="grid grid-cols-[1fr,1.4fr] gap-2">
          <input
            className="input"
            inputMode="decimal"
            placeholder="e.g. 2"
            value={amountValue}
            onChange={(e) => setAmountValue(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          <select className="input" value={amountUnit} onChange={(e) => setAmountUnit(e.target.value)}>
            <option value="">Pick a unit…</option>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        {!amountValid && (
          <p className="mt-2 text-xs font-semibold text-warn-red">Add both an amount and a unit, or clear both.</p>
        )}
      </Card>

      <Card
        title="Feeding schedule"
        hint={suggestedTimes.length ? "Prefilled from your day-in-the-life step. Edit as needed." : "Add the times you feed each day."}
      >
        <div className="flex flex-wrap gap-2">
          {feedingTimes.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-3 py-1.5 text-xs font-semibold text-sage-700">
              {t}
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={() => setFeedingTimes(feedingTimes.filter((x) => x !== t))}
                className="rounded-full p-0.5 text-sage-600 hover:bg-sage-200"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {feedingTimes.length === 0 && <span className="text-xs text-sage-400">No feeding times yet.</span>}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Add a time (e.g. 8:00 AM)"
            value={newTime}
            maxLength={40}
            onChange={(e) => setNewTime(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addTime(); }
            }}
          />
          <button type="button" onClick={addTime} disabled={!newTime.trim()} className="rounded-xl bg-sage-100 px-3 text-sm font-semibold text-sage-700 disabled:opacity-50">
            <Plus className="size-4" />
          </button>
        </div>
      </Card>

      <Card title="Fresh foods offered" hint="Tap any that apply, then add your own.">
        <div className="flex flex-wrap gap-2">
          {FRESH_FOOD_OPTIONS.map((f) => (
            <Chip key={f} on={fresh.includes(f)} onClick={() => toggleArr(fresh, f, setFresh)}>{f}</Chip>
          ))}
        </div>
        <input
          className="input mt-3"
          placeholder="Other fresh foods"
          value={freshOther}
          maxLength={300}
          onChange={(e) => setFreshOther(e.target.value)}
        />
      </Card>

      <Card title="Treats">
        <input
          className="input"
          placeholder="What treats are OK? (e.g. millet spray, almond slivers)"
          value={treatsNotes}
          maxLength={300}
          onChange={(e) => setTreatsNotes(e.target.value)}
        />
        <select className="input mt-2" value={treatsFreq} onChange={(e) => setTreatsFreq(e.target.value)}>
          <option value="">Pick a frequency…</option>
          {TREAT_FREQ.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Card>

      <Card title="Never feed" hint="Common toxic foods are prefilled. Add anything specific to your bird.">
        <div className="flex flex-wrap gap-2">
          {never.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full bg-warn-red/10 px-3 py-1.5 text-xs font-semibold text-warn-red">
              {n}
              <button
                type="button"
                aria-label={`Remove ${n}`}
                onClick={() => setNever(never.filter((x) => x !== n))}
                className="rounded-full p-0.5 hover:bg-warn-red/20"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Add another food to never feed"
            value={newNever}
            maxLength={80}
            onChange={(e) => setNewNever(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNever(); } }}
          />
          <button type="button" onClick={addNever} disabled={!newNever.trim()} className="rounded-xl bg-sage-100 px-3 text-sm font-semibold text-sage-700 disabled:opacity-50">
            <Plus className="size-4" />
          </button>
        </div>
      </Card>

      <Card title="Water">
        <select className="input" value={waterFreq} onChange={(e) => setWaterFreq(e.target.value)}>
          <option value="">Pick a frequency…</option>
          {WATER_FREQ.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <textarea
          className="input area mt-2"
          placeholder="Notes (filter, bottle vs bowl, etc.)"
          value={waterNotes}
          maxLength={400}
          onChange={(e) => setWaterNotes(e.target.value)}
        />
      </Card>

      <Card title="Where food is stored">
        <input
          className="input"
          placeholder="e.g. Pantry, top shelf; fridge bin"
          value={storage}
          maxLength={200}
          onChange={(e) => setStorage(e.target.value)}
        />
      </Card>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}`}</style>
    </div>
  );

  function addTime() {
    const v = newTime.trim();
    if (!v || feedingTimes.includes(v)) { setNewTime(""); return; }
    setFeedingTimes([...feedingTimes, v]);
    setNewTime("");
  }
  function addNever() {
    const v = newNever.trim();
    if (!v || never.includes(v)) { setNewNever(""); return; }
    setNever([...never, v]);
    setNewNever("");
  }
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
      <h2 className="text-sm font-bold">{title}</h2>
      {hint && <p className="mt-1 text-xs text-sage-600">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
        (on
          ? "border-sage-600 bg-sage-600 text-white"
          : "border-sage-200 bg-white text-sage-700 hover:bg-sage-50")
      }
    >
      {on ? "✓ " : "+ "}{children}
    </button>
  );
}

function capitalize(s: string | null | undefined) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
