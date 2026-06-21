import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SetupShell, SETUP_STEPS, TOTAL_STEPS } from "@/components/SetupShell";
import { EmergencyInfo } from "@/components/EmergencyInfo";
import { Plus, X, Check, Lightbulb, GripVertical, Sparkles } from "lucide-react";
import { PhotoCropper } from "@/components/PhotoCropper";
import { AgePicker, BirdField, SpeciesPicker } from "@/components/BirdPickers";
import { ClipRecorder, UploadProgress, MAX_SECONDS as CLIP_MAX_SECONDS, MAX_BYTES as CLIP_MAX_BYTES } from "@/components/ClipRecorder";
import { ClipPlayer } from "@/components/ClipPlayer";
import { resolveOwnerClipUrl } from "@/lib/clipUrl";
import { isCfClip } from "@/lib/clipRef";
import { FEED_PREFIX, HYG_REMOVE_PREFIX, HYG_WASH_FOOD_PREFIX, HYG_WASH_WATER_PREFIX, WATER_CHANGE_PREFIX, MED_TASK_PREFIX, isDerivedTask, derivedSource, feedTimeToDaypart } from "@/lib/routineTasks";
import { FeedTimePicker } from "@/components/careEditors/FeedTimePicker";
import { normalizeFeedTimes, feedTimeLabel, type FeedTime } from "@/lib/feedTimes";
import { syncFeedingTasks } from "@/lib/feedingSync";
import { formatAmountUnit } from "@/lib/labels";
import { track } from "@/lib/analytics";
import { recomputeSitterIntro } from "@/lib/sitterIntro";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { persistBirdPhoto, signBirdPhoto } from "@/lib/birdPhoto";

const setupSearch = z.object({
  step: z.coerce.number().int().min(1).max(TOTAL_STEPS).optional(),
});


/**
 * Lets the current step signal unsaved edits up to the wizard so the
 * back-to-profile arrow can warn before discarding them. Defaults to a no-op
 * so steps work outside the wizard too.
 */
const SetupDirtyContext = createContext<(dirty: boolean) => void>(() => {});

/**
 * Debounced autosave that ALSO supports an imperative flush from the parent
 * wizard. When the user clicks Next/Back, the wizard calls the registered
 * flush function so pending edits are persisted before the step unmounts.
 * While a save is pending the step is reported "dirty" via SetupDirtyContext.
 */
// Standout step instruction — a dark-green banner so the "here's what this step
// is for" guidance never blends into the form. Used at the top of every step.
function StepInstruction({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-[#1a3d2e] p-3.5">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#cdeab0]" />
      <p className="text-[13px] leading-relaxed text-white">{children}</p>
    </div>
  );
}

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
  // True while there are debounced edits not yet persisted. Lets us flush on
  // unmount (e.g. the owner taps the bottom nav to leave mid-step) so their
  // input is never dropped, while avoiding a redundant save when a deliberate
  // flush (Next/Back/Save & exit) already persisted.
  const pendingRef = useRef(false);
  const setDirty = useContext(SetupDirtyContext);
  const setDirtyRef = useRef(setDirty);
  setDirtyRef.current = setDirty;
  // The first run is hydration (seeding the form), not a user edit.
  const hydratedOnce = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (hydratedOnce.current) { setDirtyRef.current(true); pendingRef.current = true; }
    else hydratedOnce.current = true;
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      try {
        await saveRef.current();
        pendingRef.current = false;
        setDirtyRef.current(false);
      } catch (e: any) {
        // Never fail silently — the owner must know their input didn't save.
        toast.error(`Couldn't save your changes: ${e?.message ?? "please try again."}`);
      }
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
      try {
        await saveRef.current();
        pendingRef.current = false;
        setDirtyRef.current(false);
      } catch (e: any) {
        toast.error(`Couldn't save your changes: ${e?.message ?? "please try again."}`);
        throw e; // surface to flushPending so navigation can be blocked
      }
    };
    registerFlush(flush);
    return () => registerFlush(null);
  }, [registerFlush]);

  // Persist pending edits when this step unmounts by any path that didn't
  // already flush — notably leaving setup via the bottom nav. Fire-and-forget:
  // client-side navigation keeps the request alive. No-op (so no double save)
  // when a deliberate flush already cleared pendingRef.
  useEffect(() => {
    return () => {
      if (pendingRef.current) {
        pendingRef.current = false;
        void saveRef.current().catch(() => {});
      }
    };
  }, []);
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
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setBlockNext(false); setDirty(false); }, [step]);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  // Self-heal: guarantee a care_plan exists for this bird so no setup step can
  // silently no-op and lose the owner's input. The original creation in new.tsx
  // can fail; this also repairs any bird that ended up without a plan.
  const planEnsuredRef = useRef(false);
  useEffect(() => {
    if (!bird || planEnsuredRef.current) return;
    planEnsuredRef.current = true;
    (async () => {
      const { data, error } = await supabase
        .from("care_plans").select("id").eq("bird_id", birdId).maybeSingle();
      if (error || data) return; // already exists, or transient — steps will retry
      const { error: upErr } = await supabase
        .from("care_plans").upsert({ bird_id: birdId }, { onConflict: "bird_id" });
      if (upErr) { toast.error(`Couldn't load this bird's care plan: ${upErr.message}`); return; }
      qc.invalidateQueries(); // plan now exists — refetch the per-step queries
    })();
  }, [bird, birdId, qc]);

  useEffect(() => {
    track("guided_editor_opened", { entry_step: stepParam ?? 1 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Imperative flush registered by the current step's autosave hook.
  // Called before any navigation so pending edits persist immediately.
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const registerFlush = useCallback((fn: (() => Promise<void>) | null) => {
    flushRef.current = fn;
  }, []);
  // Returns false if the current step's pending save failed, so callers can stay
  // put rather than navigate away and lose the owner's input. The error toast is
  // raised by the autosave hook.
  async function flushPending(): Promise<boolean> {
    try { await flushRef.current?.(); return true; }
    catch { return false; }
  }

  // Honor an explicit ?step= link, but only when it actually changes — not on
  // every refetch of `bird`. Re-applying a stale stepParam was bouncing users
  // back to the linked step (e.g. from the Review step back to step 4) whenever
  // the bird query refetched.
  useEffect(() => {
    if (stepParam != null) setStep(Math.min(TOTAL_STEPS, Math.max(1, stepParam)));
  }, [stepParam]);

  // Resume at the saved position once, when the bird first loads, unless an
  // explicit ?step= link is driving the position.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!bird || initializedRef.current) return;
    initializedRef.current = true;
    if (stepParam != null) return;
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
    if (!(await flushPending())) return;
    const completedSection = SETUP_STEPS[step - 1]?.key;
    if (step >= TOTAL_STEPS) {
      const ok = await persistStep(TOTAL_STEPS, true);
      if (ok) {
        track("care_plan_section_completed", { section: completedSection, step });
        track("care_plan_progress", { percent_complete: 100, sections_complete: TOTAL_STEPS, total: TOTAL_STEPS });
        toast.success(`${bird?.name ?? "Bird"} setup complete.`);
        navigate({ to: "/birds/$birdId", params: { birdId } });
      }
      return;
    }
    const next = step + 1;
    const ok = await persistStep(next);
    if (ok) {
      track("care_plan_section_completed", { section: completedSection, step });
      track("care_plan_progress", {
        percent_complete: Math.round(((next - 1) / TOTAL_STEPS) * 100),
        sections_complete: next - 1,
        total: TOTAL_STEPS,
      });
      setStep(next);
    }
  }

  async function onBack() {
    if (step <= 1) return;
    if (!(await flushPending())) return;
    const prev = step - 1;
    const ok = await persistStep(prev);
    if (ok) setStep(prev);
  }

  async function onSaveAndExit() {
    if (!(await flushPending())) return;
    const ok = await persistStep(step);
    if (ok) {
      toast.success("Progress saved.");
      navigate({ to: "/dashboard" });
    }
  }

  async function jumpToStep(target: number) {
    const clamped = Math.min(TOTAL_STEPS, Math.max(1, target));
    if (clamped === step) return;
    if (!(await flushPending())) return;
    const ok = await persistStep(clamped);
    if (ok) setStep(clamped);
  }

  // Header back arrow: return to the bird's profile, discarding any unsaved
  // edits on the current step (the SetupShell confirms first when dirty).
  function exitToProfile() {
    navigate({ to: "/birds/$birdId", params: { birdId } });
  }

  async function finishAndGo(opts: { to: "dashboard-newsit" | "home" }) {
    if (!(await flushPending())) return;
    const ok = await persistStep(TOTAL_STEPS, true);
    if (!ok) return;
    if (opts.to === "dashboard-newsit") {
      navigate({
        to: "/dashboard",
        search: { newSit: true, preselectBirdId: birdId },
      });
    } else {
      // After finishing setup, land on Home so the owner sees their bird and the
      // getting-started checklist — not back at the start of the wizard.
      navigate({ to: "/dashboard" });
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
      birdName={bird.name}
      birdSpecies={bird.species}
      saving={saving}
      isDirty={dirty}
      onExit={exitToProfile}
      onNavigateStep={jumpToStep}
      onBack={onBack}
      onNext={onNext}
      onSaveAndExit={onSaveAndExit}
      nextLabel={isLast ? "Finish setup" : "Next"}
      backDisabled={step <= 1}
      nextDisabled={blockNext}
      hideFooter={step === TOTAL_STEPS}
    >
      <SetupDirtyContext.Provider value={setDirty}>
        <StepBody
          step={step}
          birdId={birdId}
          birdName={bird.name}
          onBlockNext={setBlockNext}
          onJumpToStep={jumpToStep}
          onFinish={finishAndGo}
          registerFlush={registerFlush}
        />
      </SetupDirtyContext.Provider>
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
  onFinish: (opts: { to: "dashboard-newsit" | "home" }) => void;
  registerFlush: (fn: (() => Promise<void>) | null) => void;
}) {
  if (step === 1) return <BasicsStep birdId={birdId} onBlockNext={onBlockNext} registerFlush={registerFlush} />;
  // Food before Routine (step order set in SetupShell.SETUP_STEPS).
  if (step === 2) return <FoodWaterStep birdId={birdId} birdName={birdName} onBlockNext={onBlockNext} registerFlush={registerFlush} />;
  if (step === 3) return <DayInLifeStep birdId={birdId} />;
  if (step === 4) return <PersonalityStep birdId={birdId} birdName={birdName} registerFlush={registerFlush} />;
  if (step === 5) return <EnvironmentStep birdId={birdId} registerFlush={registerFlush} />;
  if (step === 6) return <HealthBaselineStep birdId={birdId} birdName={birdName} onBlockNext={onBlockNext} registerFlush={registerFlush} />;
  if (step === 7) return <OwnerTipsClipsStep birdId={birdId} onBlockNext={onBlockNext} />;
  if (step === 8) return <EmergencyStep birdId={birdId} onBlockNext={onBlockNext} registerFlush={registerFlush} />;
  if (step === 9) return <ReviewStep birdId={birdId} birdName={birdName} onJumpToStep={onJumpToStep} onFinish={onFinish} />;

  return null; // every step (1–9) is handled above
}

const TIME_BLOCKS: { key: string; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "midday", label: "Midday" },
  { key: "evening", label: "Evening" },
  { key: "bedtime", label: "Bedtime" },
  { key: "custom", label: "Custom" },
];

// Pure-rhythm chips only — items with NO structured source elsewhere. Feedings,
// water, cleaning, and medication are auto-derived from the Food / Health tabs
// (see syncFeedingTasks / syncHygieneTasks / syncMedicationTask) and must not be
// re-entered here, or they drift out of sync.
const COMMON_TASKS = [
  "Uncover cage",
  "Open curtains",
  "Out-of-cage time",
  "Training or play",
  "Misting or bath",
  "Close curtains",
  "Cover for night",
];

function BasicsStep({ birdId, onBlockNext, registerFlush }: { birdId: string; onBlockNext: (block: boolean) => void; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  const qc = useQueryClient();
  const { data: bird, isLoading } = useQuery({
    queryKey: ["bird-basics", birdId],
    // Drop the cache when the step unmounts so navigating Back refetches the
    // just-saved values, rather than re-hydrating the form from a stale (still
    // "fresh" under the 60s global staleTime) pre-edit snapshot.
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select("*").eq("id", birdId).single();
      if (error) throw error;
      return data as any;
    },
  });
  const [form, setForm] = useState<any>(null);
  const [hydrated, setHydrated] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  // `form.photo_url` holds a DISPLAYABLE value (signed URL or freshly-picked
  // data: URL); `photoRef` holds what to PERSIST (Storage path, legacy data URL,
  // or null). Keeping them separate avoids writing a transient signed URL to the
  // DB and avoids re-uploading an unchanged photo on every autosave.
  const [photoRef, setPhotoRef] = useState<string | null>(null);

  useEffect(() => {
    if (!bird || hydrated) return;
    setHydrated(true);
    setPhotoRef(bird.photo_url ?? null);
    signBirdPhoto(bird.photo_url).then((url) => {
      setForm({ ...bird, photo_url: url });
    });
  }, [bird, hydrated]);

  useEffect(() => {
    onBlockNext(!form?.name?.trim() || !form?.species?.trim());
  }, [form?.name, form?.species, onBlockNext]);

  useDebouncedAutosave(
    async () => {
      if (!form) return;
      const { id, owner_id, created_at, updated_at, photo_url, ...patch } = form;
      // Persist the Storage path, not the displayable signed/data URL. Upload a
      // freshly-picked photo (data: URL) on first save, then reuse its path.
      let ref = photoRef;
      if (typeof ref === "string" && ref.startsWith("data:")) {
        ref = await persistBirdPhoto(owner_id, ref);
        setPhotoRef(ref);
      }
      await supabase.from("birds").update({ ...patch, photo_url: ref }).eq("id", birdId);
      qc.invalidateQueries({ queryKey: ["bird", birdId] });
      qc.invalidateQueries({ queryKey: ["bird-setup", birdId] });
      // Basics changes name/sex/species/age — refresh the assembled sitter intro.
      void recomputeSitterIntro(birdId);
    },
    [form, photoRef, birdId, qc],
    !!form && hydrated,
    registerFlush,
  );

  if (isLoading || !form) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) {
        toast.error("That photo's a bit too large even after resizing. Try a different photo.");
        return;
      }
      setForm({ ...form, photo_url: dataUrl });
      setPhotoRef(dataUrl);
    } catch {
      toast.error("Couldn't process that photo. Try a different one.");
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <StepInstruction>Start with the essentials — who your bird is, and a photo so your sitter recognizes them right away.</StepInstruction>
      <section className="rounded-2xl bg-[#efe9da] p-4 space-y-3">
        <div className="flex items-start gap-3">
          {form.photo_url ? (
            <PhotoCropper src={form.photo_url} position={form.photo_position} onChange={(pos) => setForm({ ...form, photo_position: pos })} size={120} />
          ) : (
            <div className="flex size-[120px] items-center justify-center rounded-xl bg-sage-100 text-[10px] uppercase tracking-wider text-sage-600">No photo</div>
          )}
          <div className="flex-1 space-y-2 pt-1">
            <label className={`inline-block rounded-lg bg-sage-100 px-3 py-1.5 text-xs font-semibold text-sage-700 ${photoBusy ? "cursor-default opacity-60" : "cursor-pointer"}`}>
              {photoBusy ? "Processing…" : form.photo_url ? "Change photo" : "Add photo"}
              <input type="file" accept="image/*,.heic,.heif" disabled={photoBusy} className="hidden" onChange={onPhoto} />
            </label>
            {form.photo_url && (
              <button type="button" onClick={() => { setForm({ ...form, photo_url: null, photo_position: null }); setPhotoRef(null); }} className="ml-2 text-xs font-semibold text-warn-red underline">Remove</button>
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
      {(!form.name?.trim() || !form.species?.trim()) && (
        <p className="rounded-xl bg-warn-amber/10 px-3 py-2 text-xs font-medium text-warn-amber">
          Add a name and species to continue.
        </p>
      )}
      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}`}</style>
    </div>
  );
}

export function DayInLifeStep({ birdId }: { birdId: string }) {
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
      <StepInstruction>Build the daily rhythm. Feedings, water, cleaning, and medication come in automatically from the Food and Health steps — add anything else here, like uncovering the cage or playtime. Auto-added items are tagged and edited in their own step.</StepInstruction>

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
  const [addingCustom, setAddingCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  // Derived tasks (feeding/water/hygiene/medication) are read-only here — they
  // come from the Food / Health tabs. Only manual rhythm items are editable.
  const derivedTasks = tasks.filter((t) => isDerivedTask(t.title));
  const manualTasks = tasks.filter((t) => !isDerivedTask(t.title));
  const present = new Map(manualTasks.map((t) => [t.title.trim().toLowerCase(), t]));
  const hasItems = derivedTasks.length > 0 || manualTasks.length > 0;
  // One-place rule: a common task is offered as an "add" chip only while it is
  // NOT yet in the routine. Once added it moves into the "In the routine" list.
  const availableChips = COMMON_TASKS.filter((t) => !present.has(t.trim().toLowerCase()));

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
  async function addCustom() {
    const t = custom.trim();
    if (!t) return;
    await add(t);
    setCustom("");
    setAddingCustom(false);
  }
  async function saveNote(id: string, value: string) {
    await supabase.from("routine_tasks").update({ instructions: value || null } as any).eq("id", id);
    onChange();
  }

  return (
    <section className="rounded-[18px] bg-[#efe9da] p-4">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.05em] text-[#1a3d2e]">{block.label}</h2>

      {/* In the routine — everything currently scheduled for this day-part. */}
      {hasItems ? (
        <>
          <p className="mt-3 text-[11px] font-medium text-[#6b6a60]">In the routine</p>
          <ul className="mt-2 space-y-2">
            {/* Auto-derived items, read-only — managed in their source step. */}
            {derivedTasks.map((t) => (
              <li key={t.id} className="flex items-start gap-2.5 rounded-[11px] bg-[#e8f0ec] px-3 py-2.5">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-[#2d6a4f]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[#1f1f1d]">
                    {t.title}
                    {t.time_of_day && <span className="text-sage-500"> · {t.time_of_day}</span>}
                  </p>
                  {t.instructions && <p className="mt-0.5 whitespace-pre-line text-xs text-sage-600">{t.instructions}</p>}
                </div>
                <span className="mt-0.5 shrink-0 rounded-full bg-[#d2e6d9] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[#2d6a4f]">
                  from {derivedSource(t.title)}
                </span>
              </li>
            ))}
            {/* Manual rhythm items, editable here. */}
            {manualTasks.map((t) => (
              <li key={t.id} className="rounded-[11px] bg-white px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <GripVertical className="size-4 shrink-0 text-[#c0bba8]" />
                  <p className="flex-1 text-sm text-[#1f1f1d]">{t.title}</p>
                  <button
                    type="button"
                    onClick={() => remove(t.id)}
                    className="shrink-0 rounded p-0.5 text-[#b0aea2] hover:bg-sage-100"
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
        </>
      ) : (
        <p className="mt-3 text-[13px] text-[#a8a596]">Nothing added yet</p>
      )}

      {/* Add to [day-part] — clearly separated "tap to add" chips. */}
      <div className="mb-2.5 mt-4 flex items-center gap-2">
        <span className="text-[11px] font-medium text-[#8a897f]">Add to {block.label.toLowerCase()}</span>
        <span className="h-px flex-1 bg-black/10" />
      </div>

      <div className="flex flex-wrap gap-2">
        {availableChips.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => add(t)}
            disabled={busy}
            className="flex items-center gap-1 rounded-full border border-dashed border-[#b9c7bd] px-3 py-1.5 text-[13px] text-[#1a3d2e] transition hover:bg-white/50 disabled:opacity-50"
          >
            <Plus className="size-3.5 text-[#5f7a6e]" /> {t}
          </button>
        ))}
        {!addingCustom && (
          <button
            type="button"
            onClick={() => setAddingCustom(true)}
            className="flex items-center gap-1 rounded-full border border-dashed border-[#b9c7bd] px-3 py-1.5 text-[13px] text-[#1a3d2e] transition hover:bg-white/50"
          >
            <Plus className="size-3.5 text-[#5f7a6e]" /> Add your own
          </button>
        )}
      </div>

      {addingCustom && (
        <div className="mt-2.5 flex gap-2">
          <input
            className="input flex-1"
            value={custom}
            autoFocus
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Add your own…"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            onBlur={() => { if (!custom.trim()) setAddingCustom(false); }}
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!custom.trim() || busy}
            className="rounded-xl bg-[#1a3d2e] px-3 text-sm font-semibold text-white disabled:opacity-50"
            aria-label="Add custom task"
          >
            <Plus className="size-4" />
          </button>
        </div>
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

// Prefixes used by the sync functions to find/replace their auto-generated rows
// (and by the builder to mark derived items read-only) live in @/lib/routineTasks.

// A user-checked sitter task counts as "fresh food served" when the title
// looks like a fresh-food / chop meal task. The auto-generated removal task
// itself is excluded — checking the removal task should NOT start a new timer.
export const FRESH_FOOD_TASK_PATTERN = /\b(fresh|chop|veg|veggies|salad|sprout)\b/i;

type DietItem = { name: string; amount: string; unit: string; times?: FeedTime[]; freeFed?: boolean; note?: string | null };

export function FoodWaterStep({
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
    gcTime: 0, // drop cache on unmount so Back refetches saved values (see BasicsStep)
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
          const amt = formatAmountUnit(it.amount, it.unit);
          let when = "";
          if (it.freeFed) {
            when = "available all day";
          } else {
            const labels = normalizeFeedTimes(it.times).map((ft) => feedTimeLabel(ft, "period"));
            labels.forEach((l) => allFeedingTimes.add(l));
            when = labels.length ? `@ ${labels.join(", ")}` : "";
          }
          return [it.name.trim(), amt, when].filter(Boolean).join(" — ");
        }).filter(Boolean);
        if (parts.length) perTypeLines.push(`${label}: ${parts.join("; ")}`);
      }

      // Back-compat: derive legacy single brand/amount from the first filled item.
      const firstItem = diet.flatMap((t) => dietDetails[t] ?? []).find((it) => it.name.trim() || it.amount.trim());
      const legacyBrand = (firstItem?.name?.trim() || brand) ?? "";
      const legacyAmtVal = (firstItem?.amount?.trim() || amountValue) ?? "";
      const legacyAmtUnit = firstItem?.unit || amountUnit;
      const amountStr = formatAmountUnit(legacyAmtVal, legacyAmtUnit);

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
          // Free-text food summary blobs (food_instructions, treats_allowed,
          // foods_never_allowed, water_instructions, fresh_food_removal) are no
          // longer written — the sitter view assembles food display from the
          // structured columns above. See FoodEditor / care-sheet.tsx.
        } as any)
        .eq("id", plan.id);

      // Sync auto-generated routine tasks: feeding (per-item × times) and hygiene.
      const allItems: DietItem[] = diet.flatMap((t) => (dietDetails[t] ?? []));
      await syncFeedingTasks(plan.id, allItems);

      const hasFresh = diet.includes("chop") || freshList.length > 0 || freshOther.trim().length > 0;
      const waterChangeLabel =
        waterFreq === "once" ? "once daily"
        : waterFreq === "twice" ? "twice daily"
        : waterFreq === "more" ? "more than twice daily"
        : null;
      await syncHygieneTasks(plan.id, {
        removalLabel,
        foodWashLabel,
        waterWashLabel,
        waterChangeLabel,
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
      <StepInstruction>What does {birdName} eat, and how much? Structured answers help the sitter know exactly what to serve and when.</StepInstruction>

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

                          {/* Per-item feed time(s) — structured period picker. */}
                          <div className="mt-2">
                            <FeedTimePicker
                              value={{ times: normalizeFeedTimes(it.times), freeFed: !!it.freeFed, note: it.note ?? null }}
                              onChange={(patch) => {
                                const next = items.slice();
                                next[idx] = { ...it, ...patch };
                                update(next);
                              }}
                            />
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
    <section className="rounded-2xl bg-[#efe9da] p-4">
      <h2 className="text-sm font-medium">{title}</h2>
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

export function PersonalityStep({ birdId, birdName, registerFlush }: { birdId: string; birdName: string; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  const qc = useQueryClient();
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-personality", birdId],
    gcTime: 0, // drop cache on unmount so Back refetches saved values (see BasicsStep)
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
      await supabase
        .from("care_plans")
        .update({
          step_up: stepUp || null,
          step_up_notes: stepUpNotes || null,
          handlers: handlers || null,
          likes: likes || null,
          fears_triggers: fears || null,
          bite_risk: bite || null,
          known_triggers: fears || null,
          // handling_rules is no longer stored — the sitter view derives the
          // handling summary from the structured fields above.
        } as any)
        .eq("id", plan.id);
      qc.invalidateQueries({ queryKey: ["plan", birdId] });
      // Behavior changes step-up/handlers/likes — refresh the assembled sitter intro.
      void recomputeSitterIntro(birdId);
    },
    [stepUp, stepUpNotes, handlers, likes, fears, bite],
    !!plan && hydrated,
    registerFlush,
  );

  if (isLoading || !plan) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  return (
    <div className="space-y-4">
      <StepInstruction>How does {birdName} like to be treated? What should a sitter expect?</StepInstruction>

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
  { value: "not_while_sitting", label: "Keep in cage" },
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

export function EnvironmentStep({ birdId, registerFlush }: { birdId: string; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  const qc = useQueryClient();
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-environment", birdId],
    gcTime: 0, // drop cache on unmount so Back refetches saved values (see BasicsStep)
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
  const [otherPets, setOtherPets] = useState("");
  const [cleaning, setCleaning] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!plan || hydrated) return;
    setCageLoc(plan.cage_location ?? "");
    setOocMode(plan.out_of_cage_mode ?? "");
    // Seed notes only from the structured notes field — never from the assembled
    // out_of_cage_rules summary, which would fold the summary back in on re-save
    // and produce "Supervised only — Supervised only".
    setOocNotes(plan.out_of_cage_notes ?? "");
    setHazards(plan.hazards ?? []);
    setHazardsOther(plan.hazards_other ?? "");
    setOffLimits(plan.off_limits ?? plan.off_limits_rooms ?? "");
    setOtherPets(plan.other_pets ?? "");
    setCleaning(plan.cleaning_instructions ?? "");
    setHydrated(true);
  }, [plan, hydrated]);

  useDebouncedAutosave(
    async () => {
      if (!plan) return;
      const modeLabel = OUT_OF_CAGE_OPTIONS.find((o) => o.value === oocMode)?.label;
      // De-dupe so an empty/identical notes value can't repeat the mode label.
      const oocSummary = [...new Set([modeLabel ?? "", oocNotes.trim()].filter(Boolean))].join(" — ");
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
          // Denormalized mirror the sitter view reads as a fallback. The
          // out_of_cage_rules / safety_rules free-text blobs are no longer
          // written — the sitter assembles those from the structured fields.
          off_limits_rooms: offLimits || null,
          other_pets: otherPets || null,
          cleaning_instructions: cleaning || null,
        } as any)
        .eq("id", plan.id);
      qc.invalidateQueries({ queryKey: ["plan", birdId] });
    },
    [cageLoc, oocMode, oocNotes, hazards, hazardsOther, offLimits, otherPets, cleaning],
    !!plan && hydrated,
    registerFlush,
  );

  if (isLoading || !plan) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  function toggleHazard(v: string) {
    setHazards(hazards.includes(v) ? hazards.filter((x) => x !== v) : [...hazards, v]);
  }

  return (
    <div className="space-y-4">
      <StepInstruction>What does a sitter need to know about your home?</StepInstruction>

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

      <Card title="Other pets & separation rules">
        <textarea
          className="input area"
          placeholder="e.g. A cat and a dog — keep them out of the bird room; never leave them together."
          value={otherPets}
          maxLength={500}
          onChange={(e) => setOtherPets(e.target.value)}
        />
      </Card>

      <Card title="Cleaning products & instructions">
        <textarea
          className="input area"
          placeholder="e.g. Wipe the cage tray daily; use only bird-safe cleaner under the sink. No aerosols near the bird."
          value={cleaning}
          maxLength={500}
          onChange={(e) => setCleaning(e.target.value)}
        />
      </Card>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}`}</style>
    </div>
  );
}

// ---------- Step 6: Health baseline ----------

function HealthBaselineStep({ birdId, birdName, onBlockNext, registerFlush }: { birdId: string; birdName: string; onBlockNext: (block: boolean) => void; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  const qc = useQueryClient();

  const { data: bird } = useQuery({
    queryKey: ["bird-health", birdId],
    gcTime: 0, // drop cache on unmount so Back refetches saved values (see BasicsStep)
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
    gcTime: 0, // drop cache on unmount so Back refetches saved values (see BasicsStep)
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
  const [clipPath, setClipPath] = useState<string | null>(null);
  const [clipPreview, setClipPreview] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // When a clip already exists, the recorder stays collapsed behind a "Replace"
  // button so the saved clip doesn't look like an unfinished upload prompt.
  const [replacingClip, setReplacingClip] = useState(false);
  // True while the recorder is framing/recording/compressing (before upload).
  const [clipBusy, setClipBusy] = useState(false);

  const [initialWeight, setInitialWeight] = useState<string>("");

  // Don't let the owner advance mid-upload (prevents re-trigger / partial saves).
  useEffect(() => { onBlockNext(clipBusy); }, [clipBusy, onBlockNext]);

  useEffect(() => {
    if (!plan || !bird || hydrated) return;
    const w = bird.normal_weight != null ? String(bird.normal_weight) : "";
    setWeight(w);
    setInitialWeight(w);
    setConditions(bird.medical_conditions ?? "");
    setMeds(bird.medications ?? "");
    setMedSchedule(plan.medication_schedule ?? "");
    setWhatsNormal(plan.whats_normal ?? "");
    setClipPath(plan.baseline_clip_path ?? null);
    setHydrated(true);
  }, [plan, bird, hydrated]);

  // Resolve signed preview URLs for any saved baseline media.
  useEffect(() => {
    let cancelled = false;
    // The clip can be a Cloudflare Stream ref or a legacy Supabase path.
    resolveOwnerClipUrl(clipPath).then((u) => { if (!cancelled) setClipPreview(u); });
    return () => { cancelled = true; };
  }, [clipPath]);

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
    [weight, conditions, meds, medSchedule, whatsNormal, clipPath],
    !!plan && !!bird && hydrated,
    registerFlush,
    600,
  );

  // The ClipRecorder uploads to Cloudflare Stream and hands back a
  // "cfstream:<uid>" reference; we persist it (autosave writes baseline_clip_path).
  async function uploadClip(ref: string) {
    if (clipPath && !isCfClip(clipPath)) {
      try { await supabase.storage.from("bird-photos").remove([clipPath]); } catch {}
    }
    setClipPath(ref);
    setReplacingClip(false);
    toast.success("Baseline clip saved.");
  }

  async function removeClip() {
    if (clipPath && !isCfClip(clipPath)) {
      try { await supabase.storage.from("bird-photos").remove([clipPath]); } catch {}
    }
    setClipPath(null);
  }

  if (isLoading || !plan || !bird) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  return (
    <div className="space-y-4">
      <StepInstruction>Help your sitter know what's normal for {birdName}, so they can spot what isn't.</StepInstruction>

      <Card title="Normal weight (grams)" hint="Optional. Updating this adds an entry to the weight log.">
        <input
          className="input"
          inputMode="decimal"
          placeholder="e.g. 410"
          value={weight}
          onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ""))}
        />
      </Card>

      <Card title="Short clip of normal behavior or vocalizing" hint={`Optional, up to ${CLIP_MAX_SECONDS} seconds and ${Math.round(CLIP_MAX_BYTES / (1024 * 1024))} MB. Record at 720p in your browser or upload an existing video. Private — only your assigned sitter can view it.`}>
        {clipPreview && !replacingClip ? (
          <div className="space-y-2">
            <ClipPlayer src={clipPreview} className="aspect-video w-full rounded-xl ring-1 ring-sage-200" />
            <p className="flex items-center gap-1 text-xs font-semibold text-sage-600"><Check className="size-3.5" /> Clip saved</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReplacingClip(true)}
                className="flex-1 rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-sage-700"
              >
                Replace
              </button>
              <button
                type="button"
                onClick={removeClip}
                className="flex-1 rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-warn-red"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <ClipRecorder onBusy={setClipBusy} onUploaded={uploadClip} />
            {clipPreview && replacingClip && (
              <button type="button" onClick={() => setReplacingClip(false)} className="w-full rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-sage-700">
                Keep current clip
              </button>
            )}
          </div>
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
  // Medication is free text (name+dose combined, free-text schedule), so we
  // infer the day-part from the schedule wording when we can, else default to
  // morning. NOTE: there is no discrete scheduled-time field — see summary flag.
  const category = sched ? inferFeedingCategory(sched) : "morning";

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
      category,
      sort_order: 999,
    } as any);
  } else {
    const [first, ...rest] = existing as any[];
    await supabase.from("routine_tasks").update({ title, instructions, category } as any).eq("id", first.id);
    if (rest.length) await supabase.from("routine_tasks").delete().in("id", rest.map((t) => t.id));
  }
}

// Keep the auto-generated freshness & hygiene tasks (one per prefix) in sync
// with the owner-selected cadences. Tasks are matched by title prefix so the
// owner can still rename them inline without losing the sync target.
// Stored category for a feeding task. Placement is ultimately decided at render
// time by feedTimeToDaypart (so it's robust to mixed formats and existing data),
// but we still store a sensible category for consistency. "anytime" → "custom".
function inferFeedingCategory(time: string): string {
  const dp = feedTimeToDaypart(time);
  return dp === "anytime" ? "custom" : dp;
}

// syncFeedingTasks now lives in @/lib/feedingSync (shared with the tabbed editor)
// and builds tasks from the structured per-food periods.

async function syncHygieneTasks(
  planId: string,
  args: { removalLabel: string; foodWashLabel: string; waterWashLabel: string; waterChangeLabel: string | null; hasFresh: boolean },
) {
  type Spec = { prefix: string; title: string; instructions: string; category: string; sort_order: number; skip: boolean };
  const specs: Spec[] = [
    {
      // Fresh drinking water — derived from the Food tab's water frequency.
      // Placed in the morning block (start-of-day water change).
      prefix: WATER_CHANGE_PREFIX,
      title: `${WATER_CHANGE_PREFIX} (${args.waterChangeLabel ?? ""})`.replace(" ()", ""),
      instructions: "Give fresh drinking water.",
      category: "morning",
      sort_order: 989,
      skip: !args.waterChangeLabel,
    },
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

// ---------- Step 7: Tips from the owner ----------

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

export function OwnerTipsClipsStep({ birdId, onBlockNext }: { birdId: string; onBlockNext: (block: boolean) => void }) {
  const qc = useQueryClient();
  // Track which slots are mid-upload so Next is disabled until all settle.
  const busyRef = useRef<Set<string>>(new Set());
  const [anyBusy, setAnyBusy] = useState(false);
  function reportBusy(key: string, busy: boolean) {
    if (busy) busyRef.current.add(key);
    else busyRef.current.delete(key);
    setAnyBusy(busyRef.current.size > 0);
  }
  useEffect(() => { onBlockNext(anyBusy); }, [anyBusy, onBlockNext]);

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
      <StepInstruction>Record a few short clips so your sitter can see how things are done. All clips are private — only your assigned sitter can play them.</StepInstruction>

      {CLIP_SLOTS.map((slot) => (
        <ClipSlotCard
          key={slot.key}
          slot={slot}
          path={plan[slot.column] ?? null}
          ownerId={bird.owner_id}
          birdId={birdId}
          planId={plan.id}
          onBusy={reportBusy}
          onChange={() => qc.invalidateQueries({ queryKey: ["plan-clips", birdId] })}
        />
      ))}

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}`}</style>
    </div>
  );
}

function ClipSlotCard({
  slot, path, ownerId, birdId, planId, onBusy, onChange,
}: {
  slot: ClipSlot;
  path: string | null;
  ownerId: string;
  birdId: string;
  planId: string;
  onBusy: (key: string, busy: boolean) => void;
  onChange: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<"uploading" | null>(null);
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    resolveOwnerClipUrl(path).then((u) => { if (!cancelled) setPreview(u); });
    return () => { cancelled = true; };
  }, [path]);

  // The recorder uploads to Cloudflare Stream and returns a "cfstream:<uid>" ref.
  async function upload(ref: string) {
    setBusy("uploading");
    onBusy(slot.key, true);
    try {
      if (path && !isCfClip(path)) {
        try { await supabase.storage.from("bird-photos").remove([path]); } catch {}
      }
      await supabase.from("care_plans").update({ [slot.column]: ref } as any).eq("id", planId);
      setReplacing(false);
      toast.success(`${slot.label} saved.`);
      onChange();
    } catch (e: any) {
      toast.error(e.message ?? "Couldn't save the clip. Please try again.");
    } finally {
      setBusy(null);
      onBusy(slot.key, false);
    }
  }

  async function remove() {
    setBusy("uploading");
    onBusy(slot.key, true);
    try {
      if (path && !isCfClip(path)) {
        try { await supabase.storage.from("bird-photos").remove([path]); } catch {}
      }
      await supabase.from("care_plans").update({ [slot.column]: null } as any).eq("id", planId);
      onChange();
    } finally {
      setBusy(null);
      onBusy(slot.key, false);
    }
  }

  return (
    <Card title={slot.label} hint={slot.hint}>
      {busy === "uploading" ? (
        <UploadProgress label="Uploading your clip…" hint="This can take a moment on slower connections. Please keep this screen open." />
      ) : preview && !replacing ? (
        <div className="space-y-2">
          <ClipPlayer src={preview} className="aspect-video w-full rounded-xl ring-1 ring-sage-200" />
          <p className="flex items-center gap-1 text-xs font-semibold text-sage-600"><Check className="size-3.5" /> Clip saved</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setReplacing(true)} className="flex-1 rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-sage-700">
              Replace
            </button>
            <button type="button" onClick={remove} className="flex-1 rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-warn-red">
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <ClipRecorder onBusy={(b) => onBusy(`${slot.key}:rec`, b)} onUploaded={upload} />
          {preview && replacing && (
            <button type="button" onClick={() => setReplacing(false)} className="w-full rounded-xl border border-sage-200 bg-white py-2 text-xs font-semibold text-sage-700">
              Keep current clip
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------- Step 8: Emergency ----------

// Same shared emergency UI as the bird editor's Emergency tab (read-only
// account info + per-bird "Edit for {bird}" override). Emergency info comes from
// the account-level defaults set before birds exist, so even first-time setup
// shows them read-only rather than asking the owner to re-enter from scratch.
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

  // EmergencyInfo saves each section on demand, so this step never blocks Next
  // or registers a debounced flush.
  useEffect(() => { onBlockNext(false); registerFlush?.(null); }, [onBlockNext, registerFlush]);

  const { data: bird } = useQuery({
    queryKey: ["bird-owner-emerg", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select("id, owner_id, name").eq("id", birdId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: contacts, isLoading } = useQuery({
    queryKey: ["emergency-contacts", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: defaults } = useQuery({
    queryKey: ["owner-emergency-defaults", bird?.owner_id],
    enabled: !!bird?.owner_id,
    queryFn: async () => {
      const { data } = await supabase.from("owner_emergency_defaults").select("*").eq("owner_id", bird!.owner_id).maybeSingle();
      return data as any;
    },
  });

  if (isLoading || !bird) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  return (
    <EmergencyInfo
      birdId={birdId}
      birdName={bird.name ?? "this bird"}
      contacts={contacts ?? null}
      defaults={defaults ?? null}
      onSaved={() => qc.invalidateQueries({ queryKey: ["emergency-contacts", birdId] })}
    />
  );
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
  onFinish: (opts: { to: "dashboard-newsit" | "home" }) => void;
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
    // Map by section key, not hardcoded numbers, so these links stay correct
    // regardless of step order (Food/Routine were reordered).
    const stepOf = (key: string) => SETUP_STEPS.findIndex((s) => s.key === key) + 1;
    const list: { label: string; step: number }[] = [];
    if ((tasks?.length ?? 0) === 0) list.push({ label: "No routine tasks yet", step: stepOf("day") });
    if (!plan?.diet_types?.length && !plan?.food_instructions) list.push({ label: "No food & water details", step: stepOf("food") });
    if (!plan?.handlers && !plan?.likes && !plan?.fears_triggers) list.push({ label: "No personality & handling notes", step: stepOf("personality") });
    if (!plan?.cage_location && !plan?.out_of_cage_mode && !(plan?.hazards?.length)) list.push({ label: "No environment & safety details", step: stepOf("environment") });
    if (!bird?.normal_weight && !plan?.baseline_clip_path && !plan?.whats_normal) {
      list.push({ label: "No health baseline (weight, photo, clip, or notes)", step: stepOf("health") });
    }
    if (!plan?.clip_step_up_path && !plan?.clip_food_water_path && !plan?.clip_locations_path && !plan?.clip_bedtime_path) {
      list.push({ label: "No tips-from-the-owner clips", step: stepOf("clips") });
    }
    const eff = (k: string) => ((contacts?.[k] ?? "").toString().trim() || (defaults?.[k] ?? "").toString().trim());
    if (!eff("owner_phone") || !eff("avian_vet_phone")) {
      list.push({ label: "Required emergency contacts missing", step: stepOf("emergency") });
    }
    return list;
  }, [tasks, plan, bird, contacts, defaults]);

  const previewSrc = previewToken ? `/sitter/${previewToken}?birdId=${birdId}&preview=1` : null;

  return (
    <div className="space-y-4">
      <StepInstruction>Here's exactly what your sitter will see for {birdName}. Scroll inside the preview to explore the sitter's Today screen.</StepInstruction>

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
          onClick={() => onFinish({ to: "home" })}
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
