import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SetupShell, SETUP_STEPS, TOTAL_STEPS } from "@/components/SetupShell";
import { EMERGENCY_FIELDS, EMERGENCY_LABELS, REQUIRED_FIELDS, mergeEmergency, type EmergencyField } from "@/lib/emergency";
import { Plus, X } from "lucide-react";
import { PhotoCropper } from "@/components/PhotoCropper";
import { AgePicker, BirdField, SpeciesPicker } from "@/components/BirdPickers";

const setupSearch = z.object({
  step: z.coerce.number().int().min(1).max(TOTAL_STEPS).optional(),
});


/**
 * Debounced autosave that ALSO supports an imperative flush from the parent
 * wizard. When the user clicks Next/Back, the wizard calls the registered
 * flush function so pending edits are persisted before the step unmounts.
 */
function useDebouncedAutosave(
  save: () => Promise<void>,
  deps: React.DependencyList,
  enabled: boolean,
  registerFlush?: (fn: (() => Promise<void>) | null) => void,
  delay = 500,
) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void saveRef.current();
    }, delay);
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    if (!registerFlush) return;
    const flush = async () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      await saveRef.current();
    };
    registerFlush(flush);
    return () => registerFlush(null);
  }, [registerFlush]);
}

export const Route = createFileRoute("/_authenticated/birds/$birdId/setup")({
  head: () => ({ meta: [{ title: "Set up bird — Parrot Care Co-Pilot" }] }),
  validateSearch: setupSearch,
  component: BirdSetup,
});

function BirdSetup() {
  const { birdId } = Route.useParams();
  const { step: stepParam } = Route.useSearch();
  const navigate = useNavigate();

  const { data: bird, isLoading } = useQuery({
    queryKey: ["bird-setup", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("*")
        .eq("id", birdId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const [step, setStep] = useState<number>(1);
  const [blockNext, setBlockNext] = useState(false);
  useEffect(() => { setBlockNext(false); }, [step]);
  const [saving, setSaving] = useState(false);

  // Imperative flush registered by the current step's autosave hook.
  // Called before any navigation so pending edits persist immediately.
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const registerFlush = useCallback((fn: (() => Promise<void>) | null) => {
    flushRef.current = fn;
  }, []);
  async function flushPending() {
    try { await flushRef.current?.(); } catch { /* surfaced by per-row toasts */ }
  }

  // Start at step one unless this bird has an unfinished saved position.
  // Explicit ?step= links still open the requested step.
  useEffect(() => {
    if (!bird) return;
    if (stepParam != null) {
      setStep(Math.min(TOTAL_STEPS, Math.max(1, stepParam)));
      return;
    }
    const stored = Number(bird.setup_step ?? 0);
    setStep(!bird.setup_complete && stored > 1 ? Math.min(TOTAL_STEPS, stored) : 1);
  }, [bird, stepParam]);

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
    await flushPending();
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
    if (step <= 1) return;
    await flushPending();
    const prev = step - 1;
    const ok = await persistStep(prev);
    if (ok) setStep(prev);
  }

  async function onSaveAndExit() {
    await flushPending();
    const ok = await persistStep(step);
    if (ok) {
      toast.success("Progress saved.");
      navigate({ to: "/dashboard" });
    }
  }

  async function jumpToStep(target: number) {
    await flushPending();
    const clamped = Math.min(TOTAL_STEPS, Math.max(1, target));
    const ok = await persistStep(clamped);
    if (ok) setStep(clamped);
  }

  async function finishAndGo(opts: { to: "dashboard-newsit" | "tabs" }) {
    await flushPending();
    const ok = await persistStep(TOTAL_STEPS, true);
    if (!ok) return;
    if (opts.to === "dashboard-newsit") {
      navigate({
        to: "/dashboard",
        search: { newSit: true, preselectBirdId: birdId },
      });
    } else {
      navigate({ to: "/birds/$birdId", params: { birdId } });
    }
  }

  if (isLoading || !bird) {
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
      backDisabled={step <= 1}
      nextDisabled={blockNext}
      hideFooter={step === TOTAL_STEPS}
    >
      <StepBody
        step={step}
        birdId={birdId}
        birdName={bird.name}
        onBlockNext={setBlockNext}
        onJumpToStep={jumpToStep}
        onFinish={finishAndGo}
        registerFlush={registerFlush}
      />
    </SetupShell>
  );
}

function StepBody({
  step,
  birdId,
  birdName,
  onBlockNext,
  onJumpToStep,
  onFinish,
  registerFlush,
}: {
  step: number;
  birdId: string;
  birdName: string;
  onBlockNext: (block: boolean) => void;
  onJumpToStep: (target: number) => void;
  onFinish: (opts: { to: "dashboard-newsit" | "tabs" }) => void;
  registerFlush: (fn: (() => Promise<void>) | null) => void;
}) {
  if (step === 1) return <BasicsStep birdId={birdId} onBlockNext={onBlockNext} registerFlush={registerFlush} />;
  if (step === 2) return <DayInLifeStep birdId={birdId} />;
  if (step === 3) return <FoodWaterStep birdId={birdId} birdName={birdName} onBlockNext={onBlockNext} registerFlush={registerFlush} />;
  if (step === 4) return <PersonalityStep birdId={birdId} birdName={birdName} registerFlush={registerFlush} />;
  if (step === 5) return <EnvironmentStep birdId={birdId} registerFlush={registerFlush} />;
  if (step === 6) return <HealthBaselineStep birdId={birdId} birdName={birdName} registerFlush={registerFlush} />;
  if (step === 7) return <WatchFirstClipsStep birdId={birdId} />;
  if (step === 8) return <EmergencyStep birdId={birdId} onBlockNext={onBlockNext} registerFlush={registerFlush} />;
  if (step === 9) return <ReviewStep birdId={birdId} birdName={birdName} onJumpToStep={onJumpToStep} onFinish={onFinish} />;



  const blurbs: Record<number, { lead: string; hint: string }> = {
    8: {
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

function BasicsStep({ birdId, onBlockNext, registerFlush }: { birdId: string; onBlockNext: (block: boolean) => void; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  const qc = useQueryClient();
  const { data: bird, isLoading } = useQuery({
    queryKey: ["bird-basics", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select("*").eq("id", birdId).single();
      if (error) throw error;
      return data as any;
    },
  });
  const [form, setForm] = useState<any>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!bird || hydrated) return;
    setForm(bird);
    setHydrated(true);
  }, [bird, hydrated]);

  useEffect(() => {
    onBlockNext(!form?.name?.trim() || !form?.species?.trim());
  }, [form?.name, form?.species, onBlockNext]);

  useDebouncedAutosave(
    async () => {
      if (!form) return;
      const { id, owner_id, created_at, updated_at, ...patch } = form;
      await supabase.from("birds").update(patch).eq("id", birdId);
      qc.invalidateQueries({ queryKey: ["bird", birdId] });
      qc.invalidateQueries({ queryKey: ["bird-setup", birdId] });
    },
    [form, birdId, qc],
    !!form && hydrated,
    registerFlush,
  );

  if (isLoading || !form) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) { toast.error("Photo must be under 2MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, photo_url: reader.result as string });
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
        <div className="flex items-start gap-3">
          {form.photo_url ? (
            <PhotoCropper src={form.photo_url} position={form.photo_position} onChange={(pos) => setForm({ ...form, photo_position: pos })} size={120} />
          ) : (
            <div className="flex size-[120px] items-center justify-center rounded-xl bg-sage-100 text-[10px] uppercase tracking-wider text-sage-600">No photo</div>
          )}
          <div className="flex-1 space-y-2 pt-1">
            <label className="inline-block cursor-pointer rounded-lg bg-sage-100 px-3 py-1.5 text-xs font-semibold text-sage-700">
              {form.photo_url ? "Change photo" : "Add photo"}
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            </label>
            {form.photo_url && (
              <button type="button" onClick={() => setForm({ ...form, photo_url: null, photo_position: null })} className="ml-2 text-xs font-semibold text-warn-red underline">Remove</button>
            )}
          </div>
        </div>
        <BirdField label="Name"><input className="input" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></BirdField>
        <SpeciesPicker value={form.species ?? ""} onChange={(v) => setForm({ ...form, species: v })} />
        <AgePicker age={form.age ?? ""} birthDate={form.birth_date ?? ""} onChange={(next) => setForm({ ...form, age: next.age, birth_date: next.birthDate })} />
        <div className="grid grid-cols-2 gap-3">
          <BirdField label="Sex">
            <select className="input" value={form.sex ?? ""} onChange={(e) => setForm({ ...form, sex: e.target.value || null })}>
              <option value="">Unknown</option><option>Male</option><option>Female</option>
            </select>
          </BirdField>
          <BirdField label="Flight">
            <select className="input" value={form.flight_status ?? "unknown"} onChange={(e) => setForm({ ...form, flight_status: e.target.value })}>
              <option value="unknown">Unknown</option>
              <option value="fully_flighted">Fully flighted</option>
              <option value="clipped">Clipped</option>
              <option value="partially_clipped">Partially clipped</option>
            </select>
          </BirdField>
        </div>
      </section>
      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}`}</style>
    </div>
  );
}

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
  "Pre-made chop", "Leafy greens", "Carrot", "Bell pepper", "Broccoli", "Sweet potato",
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

const REMOVAL_OPTIONS = [
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
];

const FOOD_BOWL_WASH_OPTIONS = [
  { value: "after_each_fresh", label: "After every fresh-food serving" },
  { value: "once_daily", label: "Once a day" },
  { value: "every_few_days", label: "Every few days" },
];

const WATER_BOWL_WASH_OPTIONS = [
  { value: "once_daily", label: "Once a day" },
  { value: "twice_daily", label: "Twice a day" },
];

// Prefixes used by syncHygieneTasks / syncFeedingTasks so we can update/delete
// the auto-generated rows.
const HYG_REMOVE_PREFIX = "Remove fresh food";
const HYG_WASH_FOOD_PREFIX = "Wash food bowls";
const HYG_WASH_WATER_PREFIX = "Wash water bowl";
const FEED_PREFIX = "Feed:";

// A user-checked sitter task counts as "fresh food served" when the title
// looks like a fresh-food / chop meal task. The auto-generated removal task
// itself is excluded — checking the removal task should NOT start a new timer.
export const FRESH_FOOD_TASK_PATTERN = /\b(fresh|chop|veg|veggies|salad|sprout)\b/i;

type DietItem = { name: string; amount: string; unit: string; times?: string[]; freeFed?: boolean };

function FoodWaterStep({
  birdId,
  birdName,
  onBlockNext,
  registerFlush,
}: {
  birdId: string;
  birdName: string;
  onBlockNext: (block: boolean) => void;
  registerFlush?: (fn: (() => Promise<void>) | null) => void;
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

  // form state — initialized once from plan
  const [diet, setDiet] = useState<string[]>([]);
  const [dietOther, setDietOther] = useState("");
  const [dietDetails, setDietDetails] = useState<Record<string, DietItem[]>>({});
  const [brand, setBrand] = useState("");
  const [amountValue, setAmountValue] = useState("");
  const [amountUnit, setAmountUnit] = useState("");
  const [freshOther, setFreshOther] = useState("");
  const [treatsNotes, setTreatsNotes] = useState("");
  const [treatsFreq, setTreatsFreq] = useState("");
  const [never, setNever] = useState<string[]>([]);
  const [newNever, setNewNever] = useState("");
  const [waterFreq, setWaterFreq] = useState("");
  const [waterNotes, setWaterNotes] = useState("");
  const [storage, setStorage] = useState("");
  const [removalMinutes, setRemovalMinutes] = useState<number>(120);
  const [foodBowlWash, setFoodBowlWash] = useState<string>("after_each_fresh");
  const [waterBowlWash, setWaterBowlWash] = useState<string>("once_daily");
  const [hygieneNotes, setHygieneNotes] = useState<string>("");
  // Per-row in-flight "add a time" input, keyed by `${type}:${index}`.
  const [timeDraft, setTimeDraft] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!plan || hydrated) return;
    const dietTypes = (plan.diet_types ?? []) as string[];
    setDiet(dietTypes);
    setDietOther(plan.diet_other ?? "");
    const seedBrand = plan.food_brand ?? "";
    const seedAmt = plan.amount_value != null ? String(plan.amount_value) : "";
    const seedUnit = plan.amount_unit ?? "";
    setBrand(seedBrand);
    setAmountValue(seedAmt);
    setAmountUnit(seedUnit);
    const dd = { ...((plan.diet_details ?? {}) as Record<string, DietItem[]>) };
    const hasAny = Object.values(dd).some((arr) => Array.isArray(arr) && arr.length);
    if (!hasAny && dietTypes.length && (seedBrand || seedAmt || seedUnit)) {
      dd[dietTypes[0]] = [{ name: seedBrand, amount: seedAmt, unit: seedUnit, times: [] }];
    }
    // Back-compat: seed chop items from legacy fresh_foods list.
    if (dietTypes.includes("chop")) {
      const existing = (dd["chop"] ?? []) as DietItem[];
      const existingNames = new Set(existing.map((i) => i.name.trim().toLowerCase()));
      const legacyFresh = (plan.fresh_foods ?? []) as string[];
      const seeded: DietItem[] = [...existing];
      for (const f of legacyFresh) {
        if (!existingNames.has(f.trim().toLowerCase())) {
          seeded.push({ name: f, amount: "", unit: "", times: [] });
          existingNames.add(f.trim().toLowerCase());
        }
      }
      dd["chop"] = seeded;
    }
    setDietDetails(dd);
    setFreshOther(plan.fresh_foods_other ?? "");
    setTreatsNotes(plan.treats_notes ?? "");
    setTreatsFreq(plan.treats_frequency ?? "");
    const nv = (plan.never_feed ?? []) as string[];
    setNever(nv.length ? nv : NEVER_DEFAULTS);
    setWaterFreq(plan.water_frequency ?? "");
    setWaterNotes(plan.water_notes ?? "");
    setStorage(plan.food_storage ?? "");
    setRemovalMinutes(plan.fresh_food_removal_minutes ?? 120);
    setFoodBowlWash(plan.food_bowl_wash_cadence ?? "after_each_fresh");
    setWaterBowlWash(plan.water_bowl_wash_cadence ?? "once_daily");
    setHygieneNotes(plan.food_hygiene_notes ?? "");
    setHydrated(true);
  }, [plan, hydrated]);

  // Validation: each filled row must have both amount and unit (or neither).
  const dietRowsValid = useMemo(() => {
    for (const t of diet) {
      for (const it of dietDetails[t] ?? []) {
        const a = (it.amount ?? "").trim();
        const u = (it.unit ?? "").trim();
        if ((a === "") !== (u === "")) return false;
      }
    }
    return true;
  }, [diet, dietDetails]);
  useEffect(() => { onBlockNext(!dietRowsValid); }, [dietRowsValid, onBlockNext]);

  // Persist (debounced) whenever form changes after hydration.
  useDebouncedAutosave(
    async () => {
      if (!plan) return;
      const dietLabels = diet.map((d) => DIET_OPTIONS.find((o) => o.value === d)?.label).filter(Boolean) as string[];
      if (diet.includes("other") && dietOther.trim()) dietLabels.push(dietOther.trim());

      const perTypeLines: string[] = [];
      const allFeedingTimes = new Set<string>();
      for (const t of diet) {
        const label = DIET_OPTIONS.find((o) => o.value === t)?.label ?? t;
        const items = (dietDetails[t] ?? []).filter((it) => it.name.trim() || it.amount.trim());
        if (!items.length) continue;
        const parts = items.map((it) => {
          const amt = it.amount.trim() && it.unit ? `${it.amount.trim()} ${it.unit}` : "";
          const when = it.freeFed
            ? "available all day"
            : (it.times ?? []).length ? `@ ${(it.times ?? []).join(", ")}` : "";
          (it.times ?? []).forEach((tm) => allFeedingTimes.add(tm));
          return [it.name.trim(), amt, when].filter(Boolean).join(" — ");
        }).filter(Boolean);
        if (parts.length) perTypeLines.push(`${label}: ${parts.join("; ")}`);
      }

      // Back-compat: derive legacy single brand/amount from the first filled item.
      const firstItem = diet.flatMap((t) => dietDetails[t] ?? []).find((it) => it.name.trim() || it.amount.trim());
      const legacyBrand = (firstItem?.name?.trim() || brand) ?? "";
      const legacyAmtVal = (firstItem?.amount?.trim() || amountValue) ?? "";
      const legacyAmtUnit = firstItem?.unit || amountUnit;
      const amountStr = legacyAmtVal && legacyAmtUnit ? `${legacyAmtVal} ${legacyAmtUnit}` : "";

      const removalLabel = REMOVAL_OPTIONS.find((o) => o.value === removalMinutes)?.label ?? `${removalMinutes} min`;
      const foodWashLabel = FOOD_BOWL_WASH_OPTIONS.find((o) => o.value === foodBowlWash)?.label ?? foodBowlWash;
      const waterWashLabel = WATER_BOWL_WASH_OPTIONS.find((o) => o.value === waterBowlWash)?.label ?? waterBowlWash;

      // Fresh foods list (only meaningful when chop is selected) — derived
      // from chop item names so the care sheet and legacy `fresh_foods`
      // column stay in sync.
      const chopItems = diet.includes("chop") ? (dietDetails["chop"] ?? []) : [];
      const freshList = chopItems.map((it) => it.name.trim()).filter(Boolean);

      const feedingTimesArr = Array.from(allFeedingTimes);

      const foodSummaryParts = [
        dietLabels.length ? `Diet: ${dietLabels.join(", ")}` : "",
        ...perTypeLines,
        perTypeLines.length === 0 && legacyBrand.trim() ? `Brand: ${legacyBrand.trim()}` : "",
        perTypeLines.length === 0 && amountStr ? `Amount per serving: ${amountStr}` : "",
        diet.includes("chop") && freshOther.trim() ? `Other fresh foods: ${freshOther.trim()}` : "",
        storage.trim() ? `Stored: ${storage.trim()}` : "",
        `Freshness & hygiene:\n  • Remove fresh/wet food after ${removalLabel}\n  • Wash food bowls: ${foodWashLabel}\n  • Wash water bowl/bottle: ${waterWashLabel}${hygieneNotes.trim() ? `\n  • Notes: ${hygieneNotes.trim()}` : ""}`,
      ].filter(Boolean);
      const treatLabel = TREAT_FREQ.find((f) => f.value === treatsFreq)?.label;
      const treatsSummary = [treatsNotes.trim(), treatLabel ? `Frequency: ${treatLabel}` : ""].filter(Boolean).join(" — ");
      const waterLabel = WATER_FREQ.find((f) => f.value === waterFreq)?.label;
      const waterSummary = [
        waterLabel ?? "",
        waterNotes.trim(),
        `Wash bowl/bottle ${waterWashLabel.toLowerCase()}`,
      ].filter(Boolean).join(" — ");

      // Persist only currently-selected diet types' details.
      const detailsToSave: Record<string, DietItem[]> = {};
      for (const t of diet) if ((dietDetails[t] ?? []).length) detailsToSave[t] = dietDetails[t];

      // Mirror to the legacy text field too so the sitter view stays consistent.
      const freshRemovalSummary = `Remove fresh / wet food after ${removalLabel}. Fresh food spoils fast and can grow bacteria.`;

      await supabase
        .from("care_plans")
        .update({
          diet_types: diet,
          diet_other: dietOther || null,
          diet_details: detailsToSave,
          food_brand: legacyBrand || null,
          amount_value: legacyAmtVal ? Number(legacyAmtVal) : null,
          amount_unit: legacyAmtUnit || null,
          feeding_times: feedingTimesArr,
          fresh_foods: freshList,
          fresh_foods_other: diet.includes("chop") ? (freshOther || null) : null,
          treats_notes: treatsNotes || null,
          treats_frequency: treatsFreq || null,
          never_feed: never,
          water_frequency: waterFreq || null,
          water_notes: waterNotes || null,
          food_storage: storage || null,
          fresh_food_removal_minutes: removalMinutes,
          food_bowl_wash_cadence: foodBowlWash,
          water_bowl_wash_cadence: waterBowlWash,
          food_hygiene_notes: hygieneNotes || null,
          food_instructions: foodSummaryParts.join("\n") || null,
          treats_allowed: treatsSummary || null,
          foods_never_allowed: never.join(", ") || null,
          water_instructions: waterSummary || null,
          fresh_food_removal: freshRemovalSummary,
        } as any)
        .eq("id", plan.id);

      // Sync auto-generated routine tasks: feeding (per-item × times) and hygiene.
      const allItems: DietItem[] = diet.flatMap((t) => (dietDetails[t] ?? []));
      await syncFeedingTasks(plan.id, allItems);

      const hasFresh = diet.includes("chop") || freshList.length > 0 || freshOther.trim().length > 0;
      await syncHygieneTasks(plan.id, {
        removalLabel,
        foodWashLabel,
        waterWashLabel,
        hasFresh,
      });

      qc.invalidateQueries({ queryKey: ["plan", birdId] });
      qc.invalidateQueries({ queryKey: ["tasks", plan.id] });
    },
    [diet, dietOther, dietDetails, brand, amountValue, amountUnit, freshOther, treatsNotes, treatsFreq, never, waterFreq, waterNotes, storage, removalMinutes, foodBowlWash, waterBowlWash, hygieneNotes],
    !!plan && hydrated,
    registerFlush,
  );

  if (isLoading || !plan) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  function toggleArr<T>(arr: T[], v: T, setter: (a: T[]) => void) {
    setter(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  }

  function toggleFreshFood(label: string) {
    const items = dietDetails["chop"] ?? [];
    const lower = label.trim().toLowerCase();
    const exists = items.some((i) => i.name.trim().toLowerCase() === lower);
    const next = exists
      ? items.filter((i) => i.name.trim().toLowerCase() !== lower)
      : [...items, { name: label, amount: "", unit: "", times: [] }];
    setDietDetails({ ...dietDetails, chop: next });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <p className="text-sm font-semibold">What does {birdName} eat, and how much?</p>
        <p className="mt-1 text-sm text-sage-600">Structured answers help the sitter know exactly what to serve and when.</p>
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

      {/* Per-diet-type items, amounts & feed times */}
      {diet.length > 0 && (
        <Card
          title={diet.length === 1 ? "Items, amounts & feed time(s)" : "Items & amounts per food type"}
          hint="For each item, add the amount and when it's served. Use “Available all day” for food left in the cage."
        >
          <div className="space-y-4">
            {diet.map((t) => {
              const label = DIET_OPTIONS.find((o) => o.value === t)?.label ?? t;
              const items = dietDetails[t] ?? [];
              const update = (next: DietItem[]) =>
                setDietDetails({ ...dietDetails, [t]: next });
              const isChop = t === "chop";
              const selectedFreshNames = new Set(items.map((i) => i.name.trim().toLowerCase()));
              return (
                <div key={t} className="rounded-xl bg-sage-50/60 p-3 ring-1 ring-sage-100">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-sage-800">{label}</p>
                    <button
                      type="button"
                      onClick={() => update([...items, { name: "", amount: "", unit: "", times: [] }])}
                      className="inline-flex items-center gap-1 rounded-lg bg-sage-100 px-2.5 py-1 text-xs font-semibold text-sage-700 hover:bg-sage-200"
                    >
                      <Plus className="size-3.5" /> Add item
                    </button>
                  </div>

                  {isChop && (
                    <div className="mb-3 rounded-lg bg-white p-2 ring-1 ring-sage-100">
                      <p className="mb-1.5 text-xs font-semibold text-sage-600">Fresh foods offered — tap to add as items</p>
                      <div className="flex flex-wrap gap-1.5">
                        {FRESH_FOOD_OPTIONS.map((f) => (
                          <Chip
                            key={f}
                            on={selectedFreshNames.has(f.trim().toLowerCase())}
                            onClick={() => toggleFreshFood(f)}
                          >
                            {f}
                          </Chip>
                        ))}
                      </div>
                      <input
                        className="input mt-2 text-sm"
                        placeholder="Other fresh foods (free text)"
                        value={freshOther}
                        maxLength={300}
                        onChange={(e) => setFreshOther(e.target.value)}
                      />
                    </div>
                  )}

                  {items.length === 0 && (
                    <p className="text-xs text-sage-500">
                      {isChop
                        ? "Pick fresh foods above or tap “Add item” to list your own."
                        : "No items yet. Tap “Add item” to list a brand or food."}
                    </p>
                  )}
                  <div className="space-y-2">
                    {items.map((it, idx) => {
                      const rowInvalid = ((it.amount?.trim() === "") !== (it.unit === ""));
                      const rowKey = `${t}:${idx}`;
                      const draft = timeDraft[rowKey] ?? "";
                      const setDraft = (v: string) => setTimeDraft({ ...timeDraft, [rowKey]: v });
                      const addRowTime = () => {
                        const v = draft.trim();
                        if (!v) return;
                        const cur = it.times ?? [];
                        if (cur.includes(v)) { setDraft(""); return; }
                        const next = items.slice();
                        next[idx] = { ...it, times: [...cur, v], freeFed: false };
                        update(next);
                        setDraft("");
                      };
                      return (
                        <div key={idx} className="rounded-lg bg-white p-2 ring-1 ring-sage-100">
                          <div className="grid grid-cols-[1fr,auto] gap-2">
                            <input
                              className="input"
                              placeholder={isChop ? "e.g. Morning chop mix" : "Brand or item name"}
                              value={it.name}
                              maxLength={120}
                              onChange={(e) => {
                                const next = items.slice();
                                next[idx] = { ...it, name: e.target.value };
                                update(next);
                              }}
                            />
                            <button
                              type="button"
                              aria-label="Remove item"
                              onClick={() => update(items.filter((_, i) => i !== idx))}
                              className="rounded-lg p-2 text-sage-500 hover:bg-sage-100"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                          <div className="mt-2 grid grid-cols-[1fr,1.4fr] gap-2">
                            <input
                              className="input"
                              inputMode="decimal"
                              placeholder="Amount (e.g. 2)"
                              value={it.amount}
                              onChange={(e) => {
                                const next = items.slice();
                                next[idx] = { ...it, amount: e.target.value.replace(/[^0-9.]/g, "") };
                                update(next);
                              }}
                            />
                            <select
                              className="input"
                              value={it.unit}
                              onChange={(e) => {
                                const next = items.slice();
                                next[idx] = { ...it, unit: e.target.value };
                                update(next);
                              }}
                            >
                              <option value="">Pick a unit…</option>
                              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          {rowInvalid && (
                            <p className="mt-1.5 text-xs font-semibold text-warn-red">Add both an amount and a unit, or clear both.</p>
                          )}

                          {/* Per-item feed time(s) */}
                          <div className="mt-2 rounded-md bg-sage-50/70 p-2">
                            <label className="flex items-center gap-2 text-xs font-semibold text-sage-700">
                              <input
                                type="checkbox"
                                className="size-4 accent-sage-600"
                                checked={!!it.freeFed}
                                onChange={(e) => {
                                  const next = items.slice();
                                  next[idx] = {
                                    ...it,
                                    freeFed: e.target.checked,
                                    times: e.target.checked ? [] : (it.times ?? []),
                                  };
                                  update(next);
                                }}
                              />
                              Available all day / free-fed
                            </label>
                            {!it.freeFed && (
                              <div className="mt-2">
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-sage-600">Feed time(s)</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {(it.times ?? []).map((tm) => (
                                    <span key={tm} className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-2.5 py-1 text-xs font-semibold text-sage-700">
                                      {tm}
                                      <button
                                        type="button"
                                        aria-label={`Remove ${tm}`}
                                        onClick={() => {
                                          const next = items.slice();
                                          next[idx] = { ...it, times: (it.times ?? []).filter((x) => x !== tm) };
                                          update(next);
                                        }}
                                        className="rounded-full p-0.5 text-sage-600 hover:bg-sage-200"
                                      >
                                        <X className="size-3" />
                                      </button>
                                    </span>
                                  ))}
                                  {(it.times ?? []).length === 0 && <span className="text-[11px] text-sage-400">No times yet.</span>}
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <input
                                    className="input flex-1 text-sm"
                                    placeholder="e.g. 8:00 AM, Morning, Bedtime"
                                    value={draft}
                                    maxLength={40}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") { e.preventDefault(); addRowTime(); }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={addRowTime}
                                    disabled={!draft.trim()}
                                    className="rounded-xl bg-sage-100 px-3 text-sm font-semibold text-sage-700 disabled:opacity-50"
                                  >
                                    <Plus className="size-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

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

      <Card title="Freshness & hygiene" hint="General defaults — adjust to fit your bird and routine.">
        <label className="text-xs font-semibold text-sage-700">Remove fresh or wet food after</label>
        <select
          className="input mt-1"
          value={String(removalMinutes)}
          onChange={(e) => setRemovalMinutes(Number(e.target.value))}
        >
          {REMOVAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-sage-600">Fresh food spoils fast and can grow bacteria. This tells your sitter when to take it out.</p>

        <label className="mt-3 block text-xs font-semibold text-sage-700">Wash food bowls</label>
        <select
          className="input mt-1"
          value={foodBowlWash}
          onChange={(e) => setFoodBowlWash(e.target.value)}
        >
          {FOOD_BOWL_WASH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label className="mt-3 block text-xs font-semibold text-sage-700">Wash water bowl or bottle</label>
        <select
          className="input mt-1"
          value={waterBowlWash}
          onChange={(e) => setWaterBowlWash(e.target.value)}
        >
          {WATER_BOWL_WASH_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-sage-600">This is washing the bowl itself — separate from how often you change the water.</p>

        <label className="mt-3 block text-xs font-semibold text-sage-700">Other food hygiene notes</label>
        <textarea
          className="input area mt-1"
          placeholder="Optional — anything else the sitter should know about food/water hygiene."
          value={hygieneNotes}
          maxLength={500}
          onChange={(e) => setHygieneNotes(e.target.value)}
        />
      </Card>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}`}</style>
    </div>
  );

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

// ---------- Step 4: Personality & handling ----------

const STEP_UP_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "sometimes", label: "Sometimes" },
  { value: "no", label: "No — cage-only is fine" },
];

function PersonalityStep({ birdId, birdName, registerFlush }: { birdId: string; birdName: string; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  const qc = useQueryClient();
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-personality", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [stepUp, setStepUp] = useState("");
  const [stepUpNotes, setStepUpNotes] = useState("");
  const [handlers, setHandlers] = useState("");
  const [likes, setLikes] = useState("");
  const [fears, setFears] = useState("");
  const [bite, setBite] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!plan || hydrated) return;
    setStepUp(plan.step_up ?? "");
    setStepUpNotes(plan.step_up_notes ?? "");
    setHandlers(plan.handlers ?? "");
    setLikes(plan.likes ?? "");
    setFears(plan.fears_triggers ?? plan.known_triggers ?? "");
    setBite(plan.bite_risk ?? "");
    setHydrated(true);
  }, [plan, hydrated]);

  useDebouncedAutosave(
    async () => {
      if (!plan) return;
      const stepUpLabel = STEP_UP_OPTIONS.find((o) => o.value === stepUp)?.label;
      const handlingSummary = [
        stepUpLabel ? `Step up: ${stepUpLabel}` : "",
        stepUpNotes.trim() ? `Step-up notes: ${stepUpNotes.trim()}` : "",
        handlers.trim() ? `Who can handle: ${handlers.trim()}` : "",
        bite.trim() ? `Bite risk: ${bite.trim()}` : "",
      ].filter(Boolean).join("\n");
      await supabase
        .from("care_plans")
        .update({
          step_up: stepUp || null,
          step_up_notes: stepUpNotes || null,
          handlers: handlers || null,
          likes: likes || null,
          fears_triggers: fears || null,
          bite_risk: bite || null,
          // Mirror to legacy fields visible in the Care plan tab
          handling_rules: handlingSummary || null,
          known_triggers: fears || null,
        } as any)
        .eq("id", plan.id);
      qc.invalidateQueries({ queryKey: ["plan", birdId] });
    },
    [stepUp, stepUpNotes, handlers, likes, fears, bite],
    !!plan && hydrated,
    registerFlush,
  );

  if (isLoading || !plan) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <p className="text-sm font-semibold">How does {birdName} like to be treated?</p>
        <p className="mt-1 text-sm text-sage-600">What should a sitter expect?</p>
      </div>

      <Card title="Does the bird step up?">
        <select className="input" value={stepUp} onChange={(e) => setStepUp(e.target.value)}>
          <option value="">Pick one…</option>
          {STEP_UP_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <textarea
          className="input area mt-2"
          placeholder="Notes (only from certain perches? prefers a hand vs. perch?)"
          value={stepUpNotes}
          maxLength={400}
          onChange={(e) => setStepUpNotes(e.target.value)}
        />
      </Card>

      <Card title="Who can handle, and how">
        <textarea
          className="input area"
          placeholder="e.g. Only me and my partner. Sitter: don't try to handle — talk only."
          value={handlers}
          maxLength={500}
          onChange={(e) => setHandlers(e.target.value)}
        />
      </Card>

      <Card title="Likes">
        <input
          className="input"
          placeholder="e.g. head scratches, millet, shoulder rides"
          value={likes}
          maxLength={300}
          onChange={(e) => setLikes(e.target.value)}
        />
      </Card>

      <Card title="Fears & triggers">
        <textarea
          className="input area"
          placeholder="e.g. panics at the vacuum, hates hats"
          value={fears}
          maxLength={500}
          onChange={(e) => setFears(e.target.value)}
        />
      </Card>

      <Card title="Bite risk & warning signs">
        <textarea
          className="input area"
          placeholder="e.g. low risk, but pinned eyes and tail fan = back off"
          value={bite}
          maxLength={500}
          onChange={(e) => setBite(e.target.value)}
        />
      </Card>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}`}</style>
    </div>
  );
}

// ---------- Step 5: Environment & safety ----------

const OUT_OF_CAGE_OPTIONS = [
  { value: "supervised", label: "Supervised only" },
  { value: "specific_room", label: "Specific room only" },
  { value: "not_while_sitting", label: "Not while sitting" },
];

const HAZARD_OPTIONS = [
  "Other pets",
  "Ceiling fans",
  "Open windows",
  "Young children",
  "Houseplants",
  "Kitchen & nonstick cookware",
  "Candles or diffusers",
];

function EnvironmentStep({ birdId, registerFlush }: { birdId: string; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  const qc = useQueryClient();
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-environment", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [cageLoc, setCageLoc] = useState("");
  const [oocMode, setOocMode] = useState("");
  const [oocNotes, setOocNotes] = useState("");
  const [hazards, setHazards] = useState<string[]>([]);
  const [hazardsOther, setHazardsOther] = useState("");
  const [offLimits, setOffLimits] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!plan || hydrated) return;
    setCageLoc(plan.cage_location ?? "");
    setOocMode(plan.out_of_cage_mode ?? "");
    setOocNotes(plan.out_of_cage_notes ?? plan.out_of_cage_rules ?? "");
    setHazards(plan.hazards ?? []);
    setHazardsOther(plan.hazards_other ?? "");
    setOffLimits(plan.off_limits ?? plan.off_limits_rooms ?? "");
    setHydrated(true);
  }, [plan, hydrated]);

  useDebouncedAutosave(
    async () => {
      if (!plan) return;
      const modeLabel = OUT_OF_CAGE_OPTIONS.find((o) => o.value === oocMode)?.label;
      const oocSummary = [modeLabel ?? "", oocNotes.trim()].filter(Boolean).join(" — ");
      const allHazards = [...hazards, ...(hazardsOther.trim() ? [hazardsOther.trim()] : [])];
      const safetySummary = allHazards.length ? `Hazards: ${allHazards.join(", ")}` : "";
      await supabase
        .from("care_plans")
        .update({
          cage_location: cageLoc || null,
          out_of_cage_mode: oocMode || null,
          out_of_cage_notes: oocNotes || null,
          hazards,
          hazards_other: hazardsOther || null,
          off_limits: offLimits || null,
          // Mirror to legacy fields visible in the Care plan tab
          out_of_cage_rules: oocSummary || null,
          safety_rules: safetySummary || null,
          off_limits_rooms: offLimits || null,
        } as any)
        .eq("id", plan.id);
      qc.invalidateQueries({ queryKey: ["plan", birdId] });
    },
    [cageLoc, oocMode, oocNotes, hazards, hazardsOther, offLimits],
    !!plan && hydrated,
    registerFlush,
  );

  if (isLoading || !plan) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  function toggleHazard(v: string) {
    setHazards(hazards.includes(v) ? hazards.filter((x) => x !== v) : [...hazards, v]);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <p className="text-sm font-semibold">What does a sitter need to know about your home?</p>
      </div>

      <Card title="Cage location & setup notes">
        <textarea
          className="input area"
          placeholder="e.g. Living room, away from the kitchen. Cover is on the side table."
          value={cageLoc}
          maxLength={500}
          onChange={(e) => setCageLoc(e.target.value)}
        />
      </Card>

      <Card title="Out-of-cage rules">
        <select className="input" value={oocMode} onChange={(e) => setOocMode(e.target.value)}>
          <option value="">Pick one…</option>
          {OUT_OF_CAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <textarea
          className="input area mt-2"
          placeholder="Notes (which room? how long? what to watch for?)"
          value={oocNotes}
          maxLength={500}
          onChange={(e) => setOocNotes(e.target.value)}
        />
      </Card>

      <Card title="Home-specific hazards" hint="Tap any that apply, then add your own.">
        <div className="flex flex-wrap gap-2">
          {HAZARD_OPTIONS.map((h) => (
            <Chip key={h} on={hazards.includes(h)} onClick={() => toggleHazard(h)}>{h}</Chip>
          ))}
        </div>
        <input
          className="input mt-3"
          placeholder="Other hazards"
          value={hazardsOther}
          maxLength={300}
          onChange={(e) => setHazardsOther(e.target.value)}
        />
      </Card>

      <Card title="Anything off-limits">
        <textarea
          className="input area"
          placeholder="e.g. No access to the kitchen or bathroom; bedroom door stays closed."
          value={offLimits}
          maxLength={400}
          onChange={(e) => setOffLimits(e.target.value)}
        />
      </Card>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}`}</style>
    </div>
  );
}

// ---------- Step 6: Health baseline ----------

const MED_TASK_PREFIX = "Medication";

function HealthBaselineStep({ birdId, birdName, registerFlush }: { birdId: string; birdName: string; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  const qc = useQueryClient();

  const { data: bird } = useQuery({
    queryKey: ["bird-health", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, owner_id, normal_weight, medical_conditions, medications")
        .eq("id", birdId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-health", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [weight, setWeight] = useState("");
  const [conditions, setConditions] = useState("");
  const [meds, setMeds] = useState("");
  const [medSchedule, setMedSchedule] = useState("");
  const [whatsNormal, setWhatsNormal] = useState("");
  const [droppingsPath, setDroppingsPath] = useState<string | null>(null);
  const [clipPath, setClipPath] = useState<string | null>(null);
  const [droppingsPreview, setDroppingsPreview] = useState<string | null>(null);
  const [clipPreview, setClipPreview] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [uploading, setUploading] = useState<"photo" | "clip" | null>(null);
  const [initialWeight, setInitialWeight] = useState<string>("");

  useEffect(() => {
    if (!plan || !bird || hydrated) return;
    const w = bird.normal_weight != null ? String(bird.normal_weight) : "";
    setWeight(w);
    setInitialWeight(w);
    setConditions(bird.medical_conditions ?? "");
    setMeds(bird.medications ?? "");
    setMedSchedule(plan.medication_schedule ?? "");
    setWhatsNormal(plan.whats_normal ?? "");
    setDroppingsPath(plan.baseline_droppings_path ?? null);
    setClipPath(plan.baseline_clip_path ?? null);
    setHydrated(true);
  }, [plan, bird, hydrated]);

  // Resolve signed preview URLs for any saved baseline media.
  useEffect(() => {
    let cancelled = false;
    async function sign(path: string | null, setter: (u: string | null) => void) {
      if (!path) { setter(null); return; }
      const { data } = await supabase.storage.from("bird-photos").createSignedUrl(path, 3600);
      if (!cancelled) setter(data?.signedUrl ?? null);
    }
    sign(droppingsPath, setDroppingsPreview);
    sign(clipPath, setClipPreview);
    return () => { cancelled = true; };
  }, [droppingsPath, clipPath]);

  // Debounced persist of text/numeric fields. Also feeds the weight log on change.
  useDebouncedAutosave(
    async () => {
      if (!plan || !bird) return;
      const newWeight = weight.trim() ? Number(weight) : null;
      await supabase
        .from("birds")
        .update({
          normal_weight: newWeight,
          medical_conditions: conditions || null,
          medications: meds || null,
        } as any)
        .eq("id", birdId);

      await supabase
        .from("care_plans")
        .update({
          medication_schedule: medSchedule || null,
          whats_normal: whatsNormal || null,
          baseline_droppings_path: droppingsPath,
          baseline_clip_path: clipPath,
        } as any)
        .eq("id", plan.id);

      // Feed weight log when the normal weight changes.
      if (newWeight != null && weight !== initialWeight) {
        await supabase
          .from("weight_logs")
          .insert({ bird_id: birdId, weight: newWeight, notes: "Baseline weight" } as any);
        setInitialWeight(weight);
      }

      // Auto-create / sync the medication routine task.
      await syncMedicationTask(plan.id, meds, medSchedule);

      qc.invalidateQueries({ queryKey: ["plan", birdId] });
      qc.invalidateQueries({ queryKey: ["tasks", plan.id] });
    },
    [weight, conditions, meds, medSchedule, whatsNormal, droppingsPath, clipPath],
    !!plan && !!bird && hydrated,
    registerFlush,
    600,
  );

  async function uploadPhoto(file: File) {
    if (!bird) return;
    setUploading("photo");
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${bird.owner_id}/baselines/${birdId}/droppings-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("bird-photos").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
      if (error) throw error;
      if (droppingsPath) await supabase.storage.from("bird-photos").remove([droppingsPath]);
      setDroppingsPath(path);
      toast.success("Baseline photo saved.");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function uploadClip(file: File) {
    if (!bird) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("Clip must be under 25 MB.");
      return;
    }
    setUploading("clip");
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const path = `${bird.owner_id}/baselines/${birdId}/clip-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("bird-photos").upload(path, file, {
        contentType: file.type || "video/mp4",
        upsert: true,
      });
      if (error) throw error;
      if (clipPath) await supabase.storage.from("bird-photos").remove([clipPath]);
      setClipPath(path);
      toast.success("Baseline clip saved.");
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function removePhoto() {
    if (droppingsPath) await supabase.storage.from("bird-photos").remove([droppingsPath]);
    setDroppingsPath(null);
  }
  async function removeClip() {
    if (clipPath) await supabase.storage.from("bird-photos").remove([clipPath]);
    setClipPath(null);
  }

  if (isLoading || !plan || !bird) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <p className="text-sm font-semibold">Help your sitter know what's normal for {birdName}, so they can spot what isn't.</p>
      </div>

      <Card title="Normal weight (grams)" hint="Optional. Updating this adds an entry to the weight log.">
        <input
          className="input"
          inputMode="decimal"
          placeholder="e.g. 410"
          value={weight}
          onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </Card>

      <Card title="Photo of normal droppings" hint="Optional. Private — only your assigned sitter can view it.">
        {droppingsPreview ? (
          <div className="space-y-2">
            <img src={droppingsPreview} alt="Baseline droppings" className="h-40 w-full rounded-xl object-cover ring-1 ring-sage-200" />
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer rounded-xl border border-sage-200 bg-white py-2 text-center text-xs font-semibold text-sage-700">
                Replace
                <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
              </label>
              <button type="button" onClick={removePhoto} className="flex-1 rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-warn-red">
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-sage-200 bg-sage-50 p-4 text-center">
            <span className="text-sm font-semibold text-sage-700">{uploading === "photo" ? "Uploading…" : "Tap to upload a photo"}</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
          </label>
        )}
      </Card>

      <Card title="Short clip of normal behavior or vocalizing" hint="Optional, up to 25 MB. Private — only your assigned sitter can view it.">
        {clipPreview ? (
          <div className="space-y-2">
            <video src={clipPreview} controls className="h-48 w-full rounded-xl bg-black object-contain ring-1 ring-sage-200" />
            <div className="flex gap-2">
              <label className="flex-1 cursor-pointer rounded-xl border border-sage-200 bg-white py-2 text-center text-xs font-semibold text-sage-700">
                Replace
                <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadClip(e.target.files[0])} />
              </label>
              <button type="button" onClick={removeClip} className="flex-1 rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-warn-red">
                Remove
              </button>
            </div>
          </div>
        ) : (
          <label className="block cursor-pointer rounded-xl border-2 border-dashed border-sage-200 bg-sage-50 p-4 text-center">
            <span className="text-sm font-semibold text-sage-700">{uploading === "clip" ? "Uploading…" : "Tap to upload a clip"}</span>
            <input type="file" accept="video/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadClip(e.target.files[0])} />
          </label>
        )}
      </Card>

      <Card title="Known conditions">
        <textarea
          className="input area"
          placeholder="e.g. Mild feather plucking; old wing injury (no flight)."
          value={conditions}
          maxLength={500}
          onChange={(e) => setConditions(e.target.value)}
        />
      </Card>

      <Card title="Medications" hint="Adding a medication here also creates a matching task in the Routine tab.">
        <input
          className="input"
          placeholder="e.g. Metacam 0.1ml"
          value={meds}
          maxLength={300}
          onChange={(e) => setMeds(e.target.value)}
        />
        <input
          className="input mt-2"
          placeholder="Schedule (e.g. once daily in the morning with food)"
          value={medSchedule}
          maxLength={300}
          onChange={(e) => setMedSchedule(e.target.value)}
        />
      </Card>

      <Card title="What's normal for this bird">
        <textarea
          className="input area"
          placeholder="e.g. Loud whistles at sunrise and sunset are normal. Naps mid-afternoon for ~30 min. Likes to flap on the perch for exercise."
          value={whatsNormal}
          maxLength={800}
          onChange={(e) => setWhatsNormal(e.target.value)}
        />
      </Card>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}`}</style>
    </div>
  );
}

// Keep exactly one Medication routine task in sync with the medication fields.
async function syncMedicationTask(planId: string, meds: string, schedule: string) {
  const { data: existing } = await supabase
    .from("routine_tasks")
    .select("id, title, instructions")
    .eq("care_plan_id", planId)
    .ilike("title", `${MED_TASK_PREFIX}%`);
  const med = meds.trim();
  const sched = schedule.trim();
  const title = med ? `${MED_TASK_PREFIX}: ${med}` : "";
  const instructions = sched || null;

  if (!med) {
    if (existing && existing.length) {
      await supabase.from("routine_tasks").delete().in("id", existing.map((t: any) => t.id));
    }
    return;
  }

  if (!existing || existing.length === 0) {
    await supabase.from("routine_tasks").insert({
      care_plan_id: planId,
      title,
      instructions,
      category: "morning",
      sort_order: 999,
    } as any);
  } else {
    const [first, ...rest] = existing as any[];
    await supabase.from("routine_tasks").update({ title, instructions } as any).eq("id", first.id);
    if (rest.length) await supabase.from("routine_tasks").delete().in("id", rest.map((t) => t.id));
  }
}

// Keep the auto-generated freshness & hygiene tasks (one per prefix) in sync
// with the owner-selected cadences. Tasks are matched by title prefix so the
// owner can still rename them inline without losing the sync target.
function inferFeedingCategory(time: string): string {
  const s = time.toLowerCase();
  if (/morning|breakfast|am\b|sunrise|wake/.test(s)) return "morning";
  if (/midday|noon|lunch/.test(s)) return "midday";
  if (/evening|dinner|supper|pm\b/.test(s)) return "evening";
  if (/bedtime|night|cover|sleep/.test(s)) return "bedtime";
  // Numeric "8:00 AM" / "14:00" — try to parse the hour.
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (m) {
    let h = parseInt(m[1], 10);
    const ampm = m[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    if (h < 11) return "morning";
    if (h < 14) return "midday";
    if (h < 20) return "evening";
    return "bedtime";
  }
  return "custom";
}

type FeedingItem = { name: string; amount: string; unit: string; times?: string[]; freeFed?: boolean };

async function syncFeedingTasks(planId: string, items: FeedingItem[]) {
  // Wipe and rebuild all auto-generated feeding rows on every save. Keeps the
  // logic dead-simple and matches how the owner expects per-item edits to
  // flow through to the sitter view.
  const { data: existing } = await supabase
    .from("routine_tasks")
    .select("id")
    .eq("care_plan_id", planId)
    .ilike("title", `${FEED_PREFIX}%`);
  const oldIds = ((existing ?? []) as any[]).map((r) => r.id);
  if (oldIds.length) await supabase.from("routine_tasks").delete().in("id", oldIds);

  const rows: any[] = [];
  let order = 100;
  for (const it of items) {
    const name = (it.name ?? "").trim();
    if (!name) continue;
    const amt = it.amount?.trim() && it.unit ? `${it.amount.trim()} ${it.unit}` : "";
    const baseInstr = amt ? `Serve ${amt}.` : "";
    if (it.freeFed) {
      rows.push({
        care_plan_id: planId,
        title: `${FEED_PREFIX} ${name} (available all day)`,
        instructions: [baseInstr, "Keep topped up — this is free-fed in the cage."].filter(Boolean).join(" "),
        category: "custom",
        time_of_day: "Available all day",
        sort_order: order++,
      });
      continue;
    }
    const times = (it.times ?? []).filter((t) => t.trim());
    if (times.length === 0) continue;
    for (const tm of times) {
      rows.push({
        care_plan_id: planId,
        title: `${FEED_PREFIX} ${name}`,
        instructions: baseInstr,
        category: inferFeedingCategory(tm),
        time_of_day: tm,
        sort_order: order++,
      });
    }
  }

  if (rows.length) await supabase.from("routine_tasks").insert(rows as any);
}

async function syncHygieneTasks(
  planId: string,
  args: { removalLabel: string; foodWashLabel: string; waterWashLabel: string; hasFresh: boolean },
) {
  type Spec = { prefix: string; title: string; instructions: string; category: string; sort_order: number; skip: boolean };
  const specs: Spec[] = [
    {
      prefix: HYG_REMOVE_PREFIX,
      title: `${HYG_REMOVE_PREFIX} (within ${args.removalLabel} of serving)`,
      instructions: "Fresh / wet food spoils fast. Take it out within this window to prevent bacteria.",
      category: "midday",
      sort_order: 990,
      skip: !args.hasFresh,
    },
    {
      prefix: HYG_WASH_FOOD_PREFIX,
      title: `${HYG_WASH_FOOD_PREFIX} (${args.foodWashLabel.toLowerCase()})`,
      instructions: "Use hot water and a bottle brush. Rinse thoroughly before refilling.",
      category: "evening",
      sort_order: 991,
      skip: false,
    },
    {
      prefix: HYG_WASH_WATER_PREFIX,
      title: `${HYG_WASH_WATER_PREFIX} (${args.waterWashLabel.toLowerCase()})`,
      instructions: "Wash the bowl/bottle itself — separate from how often water is changed.",
      category: "morning",
      sort_order: 992,
      skip: false,
    },
  ];

  for (const s of specs) {
    const { data: existing } = await supabase
      .from("routine_tasks")
      .select("id")
      .eq("care_plan_id", planId)
      .ilike("title", `${s.prefix}%`);
    const rows = (existing ?? []) as any[];
    if (s.skip) {
      if (rows.length) await supabase.from("routine_tasks").delete().in("id", rows.map((r) => r.id));
      continue;
    }
    if (rows.length === 0) {
      await supabase.from("routine_tasks").insert({
        care_plan_id: planId,
        title: s.title,
        instructions: s.instructions,
        category: s.category,
        sort_order: s.sort_order,
      } as any);
    } else {
      const [first, ...rest] = rows;
      await supabase.from("routine_tasks").update({ title: s.title, instructions: s.instructions } as any).eq("id", first.id);
      if (rest.length) await supabase.from("routine_tasks").delete().in("id", rest.map((r) => r.id));
    }
  }
}

// ---------- Step 7: Watch-first clips ----------

type ClipSlot = {
  key: "step_up" | "food_water" | "locations" | "bedtime";
  column: "clip_step_up_path" | "clip_food_water_path" | "clip_locations_path" | "clip_bedtime_path";
  label: string;
  hint: string;
};

const CLIP_SLOTS: ClipSlot[] = [
  { key: "step_up", column: "clip_step_up_path", label: "How she steps up", hint: "Hand position, cue word, what works." },
  { key: "food_water", column: "clip_food_water_path", label: "How to refill food & water safely", hint: "Show the bowls, fill amount, and any cage-door routine." },
  { key: "locations", column: "clip_locations_path", label: "Where everything is", hint: "Walkthrough: food, treats, towels, carrier, first aid." },
  { key: "bedtime", column: "clip_bedtime_path", label: "Settling her for the night", hint: "Cover routine, lights, sounds." },
];

function WatchFirstClipsStep({ birdId }: { birdId: string }) {
  const qc = useQueryClient();

  const { data: bird } = useQuery({
    queryKey: ["bird-owner", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select("id, owner_id").eq("id", birdId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-clips", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading || !plan || !bird) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <p className="text-sm font-semibold">Record a few short clips so your sitter can see how things are done.</p>
        <p className="mt-1 text-sm text-sage-600">All clips are private — only your assigned sitter can play them.</p>
      </div>

      {CLIP_SLOTS.map((slot) => (
        <ClipSlotCard
          key={slot.key}
          slot={slot}
          path={plan[slot.column] ?? null}
          ownerId={bird.owner_id}
          birdId={birdId}
          planId={plan.id}
          onChange={() => qc.invalidateQueries({ queryKey: ["plan-clips", birdId] })}
        />
      ))}

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}`}</style>
    </div>
  );
}

function ClipSlotCard({
  slot, path, ownerId, birdId, planId, onChange,
}: {
  slot: ClipSlot;
  path: string | null;
  ownerId: string;
  birdId: string;
  planId: string;
  onChange: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function sign() {
      if (!path) { setPreview(null); return; }
      const { data } = await supabase.storage.from("bird-photos").createSignedUrl(path, 3600);
      if (!cancelled) setPreview(data?.signedUrl ?? null);
    }
    sign();
    return () => { cancelled = true; };
  }, [path]);

  async function upload(file: File) {
    if (file.size > 25 * 1024 * 1024) { toast.error("Clip must be under 25 MB."); return; }
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const newPath = `${ownerId}/baselines/${birdId}/clip-${slot.key}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("bird-photos").upload(newPath, file, {
        contentType: file.type || "video/mp4",
        upsert: true,
      });
      if (error) throw error;
      if (path) await supabase.storage.from("bird-photos").remove([path]);
      await supabase.from("care_plans").update({ [slot.column]: newPath } as any).eq("id", planId);
      toast.success(`${slot.label} saved.`);
      onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      if (path) await supabase.storage.from("bird-photos").remove([path]);
      await supabase.from("care_plans").update({ [slot.column]: null } as any).eq("id", planId);
      onChange();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={slot.label} hint={slot.hint}>
      {preview ? (
        <div className="space-y-2">
          <video src={preview} controls className="h-44 w-full rounded-xl bg-black object-contain ring-1 ring-sage-200" />
          <div className="flex gap-2">
            <label className="flex-1 cursor-pointer rounded-xl border border-sage-200 bg-white py-2 text-center text-xs font-semibold text-sage-700">
              {busy ? "Working…" : "Replace"}
              <input type="file" accept="video/*" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </label>
            <button type="button" disabled={busy} onClick={remove} className="flex-1 rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-warn-red disabled:opacity-50">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <label className="block cursor-pointer rounded-xl border-2 border-dashed border-sage-200 bg-sage-50 p-4 text-center">
          <span className="text-sm font-semibold text-sage-700">{busy ? "Uploading…" : "Tap to upload a clip"}</span>
          <input type="file" accept="video/*" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      )}
    </Card>
  );
}

// ---------- Step 8: Emergency ----------

const FIELD_PLACEHOLDERS: Partial<Record<EmergencyField, string>> = {
  owner_phone: "(555) 123-4567",
  backup_phone: "(555) 987-6543",
  avian_vet_phone: "(555) 246-8000",
  emergency_vet_phone: "(555) 911-0000",
  spending_limit: "e.g. up to $500 without calling",
  poison_control: "(888) 426-4435",
};

const MULTI_LINE: EmergencyField[] = [
  "avian_vet_address",
  "emergency_vet_address",
  "carrier_location",
  "first_aid_kit_location",
  "emergency_authorization",
];

const ASPCA_POISON_CONTROL = "(888) 426-4435";

function EmergencyStep({
  birdId,
  onBlockNext,
  registerFlush,
}: {
  birdId: string;
  onBlockNext: (block: boolean) => void;
  registerFlush?: (fn: (() => Promise<void>) | null) => void;
}) {
  const qc = useQueryClient();

  const { data: bird } = useQuery({
    queryKey: ["bird-owner-emerg", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select("id, owner_id").eq("id", birdId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["emergency-contacts", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emergency_contacts")
        .select("*")
        .eq("bird_id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: defaults } = useQuery({
    queryKey: ["owner-emergency-defaults", bird?.owner_id],
    enabled: !!bird?.owner_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("owner_emergency_defaults")
        .select("*")
        .eq("owner_id", bird!.owner_id)
        .maybeSingle();
      return data as any;
    },
  });

  // Local form state per field (string), only the override value (per-bird).
  const [values, setValues] = useState<Record<EmergencyField, string>>(() => emptyValues());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated || isLoading) return;
    const next = emptyValues();
    for (const f of EMERGENCY_FIELDS) next[f] = (contacts?.[f] ?? "") as string;
    // Default the poison control number if neither override nor default is set.
    if (!next.poison_control && !defaults?.poison_control) {
      next.poison_control = ASPCA_POISON_CONTROL;
    }
    setValues(next);
    setHydrated(true);
  }, [contacts, defaults, hydrated, isLoading]);

  // Validation: required fields must have a non-empty merged value
  // (per-bird override OR inherited owner default).
  const merged = useMemo(() => {
    const birdLike: Record<string, any> = {};
    for (const f of EMERGENCY_FIELDS) birdLike[f] = values[f];
    return mergeEmergency(birdLike, defaults ?? null);
  }, [values, defaults]);

  const missing = REQUIRED_FIELDS.filter((f) => !merged[f] || !merged[f]!.trim());
  useEffect(() => { onBlockNext(missing.length > 0); }, [missing.length, onBlockNext]);

  // Debounced persistence to emergency_contacts (upsert by bird_id).
  useDebouncedAutosave(
    async () => {
      const payload: Record<string, any> = { bird_id: birdId };
      for (const f of EMERGENCY_FIELDS) payload[f] = values[f].trim() || null;
      const { error } = await supabase
        .from("emergency_contacts")
        .upsert(payload, { onConflict: "bird_id" });
      if (error) toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["emergency-contacts", birdId] });
    },
    [values, birdId],
    hydrated,
    registerFlush,
  );

  if (isLoading || !bird) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  function set(field: EmergencyField, v: string) {
    setValues((prev) => ({ ...prev, [field]: v }));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <p className="text-sm font-semibold">If something goes wrong, who does your sitter call?</p>
        <p className="mt-1 text-sm text-sage-600">
          Owner phone and avian vet phone are required. Fields with a default from your account are marked <em>inherited</em> — typing in them creates a per-bird override.
        </p>
      </div>

      {EMERGENCY_FIELDS.map((f) => {
        const birdValue = values[f] ?? "";
        const isOverride = birdValue.trim().length > 0;
        const inherited = !isOverride && !!defaults?.[f];
        const inheritedValue = (defaults?.[f] ?? "") as string;
        const placeholder = inherited && inheritedValue
          ? `Inherited: ${inheritedValue}`
          : (FIELD_PLACEHOLDERS[f] ?? "");
        const required = REQUIRED_FIELDS.includes(f);
        const isMissing = required && (!merged[f] || !merged[f]!.trim());

        return (
          <section key={f} className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold">
                {EMERGENCY_LABELS[f]}
                {required && <span className="ml-1 text-warn-red">*</span>}
              </h2>
              {isOverride ? (
                <span className="rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sage-700">
                  Override
                </span>
              ) : inherited ? (
                <span className="rounded-full bg-sage-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sage-600">
                  Inherited
                </span>
              ) : null}
            </div>

            {MULTI_LINE.includes(f) ? (
              <textarea
                className="input area mt-2"
                placeholder={placeholder}
                value={birdValue}
                maxLength={1000}
                onChange={(e) => set(f, e.target.value)}
              />
            ) : (
              <input
                className="input mt-2"
                placeholder={placeholder}
                value={birdValue}
                maxLength={300}
                onChange={(e) => set(f, e.target.value)}
              />
            )}

            {isOverride && inherited === false && defaults?.[f] && (
              <button
                type="button"
                className="mt-2 text-[11px] font-semibold text-sage-600 underline"
                onClick={() => set(f, "")}
              >
                Clear override (use account default)
              </button>
            )}

            {isMissing && (
              <p className="mt-2 text-xs font-semibold text-warn-red">Required.</p>
            )}
          </section>
        );
      })}

      {missing.length > 0 && (
        <div className="rounded-2xl bg-warn-red/10 p-3 text-xs font-semibold text-warn-red">
          Add {missing.map((f) => EMERGENCY_LABELS[f]).join(" and ")} before continuing.
        </div>
      )}

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}`}</style>
    </div>
  );
}

function emptyValues(): Record<EmergencyField, string> {
  const o = {} as Record<EmergencyField, string>;
  for (const f of EMERGENCY_FIELDS) o[f] = "";
  return o;
}

// ---------- Step 9: Review (real sitter preview) ----------

function ReviewStep({
  birdId,
  birdName,
  onJumpToStep,
  onFinish,
}: {
  birdId: string;
  birdName: string;
  onJumpToStep: (target: number) => void;
  onFinish: (opts: { to: "dashboard-newsit" | "tabs" }) => void;
}) {
  // Pull the same shape used elsewhere so the warning list reflects real data.
  const { data: bird } = useQuery({
    queryKey: ["bird-review", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, owner_id, normal_weight")
        .eq("id", birdId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: plan } = useQuery({
    queryKey: ["plan-review", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      return data as any;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks-review", plan?.id],
    enabled: !!plan?.id,
    queryFn: async () => {
      const { data } = await supabase.from("routine_tasks").select("id").eq("care_plan_id", plan!.id);
      return data ?? [];
    },
  });

  const { data: contacts } = useQuery({
    queryKey: ["contacts-review", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      return data as any;
    },
  });

  const { data: defaults } = useQuery({
    queryKey: ["defaults-review", bird?.owner_id],
    enabled: !!bird?.owner_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("owner_emergency_defaults")
        .select("*")
        .eq("owner_id", bird!.owner_id)
        .maybeSingle();
      return data as any;
    },
  });

  // Find-or-create a preview sit so we can render the REAL sitter view.
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function ensurePreviewSit() {
      if (!bird?.owner_id) return;
      try {
        // Look for an existing, valid preview sit that already includes this bird.
        const { data: existing } = await supabase
          .from("sits")
          .select("id, invite_token, token_expires_at, revoked, sit_birds(bird_id)")
          .eq("owner_id", bird.owner_id)
          .eq("sitter_name", "__preview__")
          .eq("revoked", false);
        const match = (existing ?? []).find((s: any) =>
          (s.sit_birds ?? []).some((sb: any) => sb.bird_id === birdId) &&
          new Date(s.token_expires_at) > new Date(),
        );
        if (match) {
          if (!cancelled) setPreviewToken(match.invite_token);
          return;
        }
        // Otherwise create a fresh one. Far-future expiry so the owner can revisit.
        const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        const today = new Date().toISOString().slice(0, 10);
        const { data: sit, error } = await supabase
          .from("sits")
          .insert({
            owner_id: bird.owner_id,
            sitter_name: "__preview__",
            sitter_email: null,
            start_date: today,
            end_date: today,
            notes: "Preview from setup flow",
            token_expires_at: expires,
            status: "upcoming",
          })
          .select()
          .single();
        if (error || !sit) throw new Error(error?.message ?? "Could not build preview");
        const { error: linkErr } = await supabase.from("sit_birds").insert({ sit_id: sit.id, bird_id: birdId });
        if (linkErr) throw new Error(linkErr.message);
        if (!cancelled) setPreviewToken(sit.invite_token);
      } catch (e: any) {
        if (!cancelled) setPreviewError(e.message ?? "Could not build preview");
      }
    }
    ensurePreviewSit();
    return () => { cancelled = true; };
  }, [bird?.owner_id, birdId]);

  // "Before you share" thin/empty checks. Each links to its step.
  const issues = useMemo(() => {
    const list: { label: string; step: number }[] = [];
    if ((tasks?.length ?? 0) === 0) list.push({ label: "No routine tasks yet", step: 2 });
    if (!plan?.diet_types?.length && !plan?.food_instructions) list.push({ label: "No food & water details", step: 3 });
    if (!plan?.handlers && !plan?.likes && !plan?.fears_triggers) list.push({ label: "No personality & handling notes", step: 4 });
    if (!plan?.cage_location && !plan?.out_of_cage_mode && !(plan?.hazards?.length)) list.push({ label: "No environment & safety details", step: 5 });
    if (!bird?.normal_weight && !plan?.baseline_droppings_path && !plan?.baseline_clip_path && !plan?.whats_normal) {
      list.push({ label: "No health baseline (weight, photo, clip, or notes)", step: 6 });
    }
    if (!plan?.clip_step_up_path && !plan?.clip_food_water_path && !plan?.clip_locations_path && !plan?.clip_bedtime_path) {
      list.push({ label: "No watch-first clips", step: 7 });
    }
    const eff = (k: string) => ((contacts?.[k] ?? "").toString().trim() || (defaults?.[k] ?? "").toString().trim());
    if (!eff("owner_phone") || !eff("avian_vet_phone")) {
      list.push({ label: "Required emergency contacts missing", step: 8 });
    }
    return list;
  }, [tasks, plan, bird, contacts, defaults]);

  const previewSrc = previewToken ? `/sitter/${previewToken}?birdId=${birdId}` : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <p className="text-sm font-semibold">Here's exactly what your sitter will see for {birdName}.</p>
        <p className="mt-1 text-sm text-sage-600">Scroll inside the preview to explore the sitter's Today screen.</p>
      </div>

      {issues.length > 0 && (
        <section className="rounded-2xl bg-warn-amber/10 p-4 ring-1 ring-warn-amber/30">
          <h2 className="text-sm font-bold text-warn-amber">Before you share</h2>
          <p className="mt-1 text-xs text-sage-700">A few things are still thin or empty:</p>
          <ul className="mt-2 space-y-1">
            {issues.map((i) => (
              <li key={i.step}>
                <button
                  type="button"
                  onClick={() => onJumpToStep(i.step)}
                  className="text-left text-sm font-semibold text-sage-900 underline decoration-warn-amber underline-offset-2"
                >
                  {i.label} <span className="text-xs text-sage-600">— fix in step {i.step}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl bg-sage-900 ring-1 ring-sage-200">
        <div className="flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/80">
          <span>Sitter preview</span>
          <span className="rounded bg-white/10 px-2 py-0.5">Live</span>
        </div>
        <div className="bg-sage-50">
          {previewError ? (
            <div className="p-6 text-sm text-warn-red">{previewError}</div>
          ) : previewSrc ? (
            <iframe
              src={previewSrc}
              title="Sitter preview"
              className="h-[640px] w-full border-0 bg-sage-50"
            />
          ) : (
            <div className="h-[640px] animate-pulse bg-sage-100" />
          )}
        </div>
      </section>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onFinish({ to: "tabs" })}
          className="w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white"
        >
          Looks good — save
        </button>
        <button
          type="button"
          onClick={() => onFinish({ to: "dashboard-newsit" })}
          className="w-full rounded-xl border border-sage-300 bg-white py-3 text-sm font-semibold text-sage-700"
        >
          Save & create a sit
        </button>
        <button
          type="button"
          onClick={() => onJumpToStep(8)}
          className="block w-full text-center text-xs font-semibold text-sage-700 underline"
        >
          ← Back to Emergency
        </button>
      </div>
    </div>
  );
}
