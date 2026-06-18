import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, Trash2, ChevronDown, AlertTriangle, Wand2 } from "lucide-react";
import { SitCard } from "@/components/SitCard";
import { toast } from "sonner";
import { Disclaimer, VetReviewBanner } from "@/components/Disclaimer";
import { PhotoCropper } from "@/components/PhotoCropper";
import { SpeciesPicker, AgePicker } from "@/components/BirdPickers";
import { computeSetupCompleteness } from "@/lib/setupCompleteness";


const TAB_IDS = ["basics", "routine", "food", "behavior", "home", "health", "clips", "emergency", "sits", "logs"] as const;
type Tab = (typeof TAB_IDS)[number];

const birdSearch = z.object({
  tab: z.enum(TAB_IDS).optional(),
});

export const Route = createFileRoute("/_authenticated/birds/$birdId/")({
  head: () => ({ meta: [{ title: "Care plan — Parrot Care Co-Pilot" }] }),
  validateSearch: birdSearch,
  component: BirdEditor,
});

function BirdEditor() {
  const { birdId } = Route.useParams();
  const { tab: tabParam } = Route.useSearch();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>(tabParam ?? "basics");
  useEffect(() => { if (tabParam) setTab(tabParam); }, [tabParam]);

  const { data: bird } = useQuery({
    queryKey: ["bird", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select("*").eq("id", birdId).single();
      if (error) throw error; return data;
    },
  });
  const { data: plan } = useQuery({
    queryKey: ["plan", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      return data;
    },
  });
  const { data: contacts } = useQuery({
    queryKey: ["contacts", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      return data;
    },
  });
  const { data: defaults } = useQuery({
    queryKey: ["owner-defaults"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("owner_emergency_defaults")
        .select("*")
        .eq("owner_id", u.user.id)
        .maybeSingle();
      return data;
    },
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", plan?.id],
    enabled: !!plan?.id,
    queryFn: async () => {
      const { data } = await supabase.from("routine_tasks").select("*").eq("care_plan_id", plan!.id).order("category").order("sort_order");
      return data ?? [];
    },
  });
  const { data: sits = [] } = useQuery({
    queryKey: ["sits", birdId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sit_birds")
        .select("sit:sits(*)")
        .eq("bird_id", birdId);
      const rows = (data ?? []).map((r: any) => r.sit).filter(Boolean);
      rows.sort((a: any, b: any) => (a.start_date < b.start_date ? 1 : -1));
      return rows;
    },
  });

  if (!bird) return <div className="p-6 text-sm text-sage-600">Loading...</div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: "basics", label: "Basics" },
    { id: "routine", label: "Routine" },
    { id: "food", label: "Food" },
    { id: "behavior", label: "Behavior" },
    { id: "home", label: "Home" },
    { id: "health", label: "Health" },
    { id: "clips", label: "Clips" },
    { id: "emergency", label: "Emergency" },
    { id: "sits", label: "Sits" },
    { id: "logs", label: "Logs" },
  ];

  const completeness = computeSetupCompleteness({ bird, plan, tasksCount: tasks.length, contacts, defaults });
  const isComplete = completeness.firstIncompleteStep === null;

  const onPlanSaved = () => {
    qc.invalidateQueries({ queryKey: ["plan", birdId] });
    qc.invalidateQueries({ queryKey: ["bird", birdId] });
  };

  return (
    <div className="min-h-screen bg-sage-50 pb-20">
      <header className="sticky top-0 z-10 border-b border-sage-100 bg-white">
        <div className="mx-auto max-w-md px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="rounded p-1 text-sage-600"><ArrowLeft className="size-5" /></Link>
            {bird.photo_url && <img src={bird.photo_url} alt={bird.name} className="size-9 rounded-full object-cover ring-1 ring-sage-200" style={{ objectPosition: bird.photo_position ?? "50% 50%" }} />}
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold truncate">{bird.name}</h1>
              <p className="text-[10px] uppercase tracking-wider text-sage-600">{bird.species ?? "Parrot"}</p>
            </div>
          </div>
          <div className="-mx-1 mt-3 flex gap-1 overflow-x-auto pb-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === t.id ? "bg-sage-900 text-white" : "bg-sage-100 text-sage-700"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
        <Link
          to="/birds/$birdId/setup"
          params={{ birdId }}
          search={completeness.firstIncompleteStep ? { step: completeness.firstIncompleteStep } : undefined}
          className="block rounded-2xl bg-sage-900 p-4 text-white shadow-sm ring-1 ring-sage-900/10 active:scale-[0.99]"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Wand2 className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sage-300">Guided care plan editor</p>
              <p className="mt-0.5 text-sm font-semibold leading-snug">Build and edit {bird.name}'s full care plan</p>
              <p className="mt-1 text-[11px] leading-snug text-sage-200">
                Step through every section — feeding, behavior, home, health, clips, emergency — and update it anytime.
              </p>
              <p className="mt-2 text-[11px] font-semibold text-sage-300">
                {isComplete
                  ? `All ${completeness.total} sections complete.`
                  : `${completeness.doneCount} of ${completeness.total} sections complete.`}
              </p>
            </div>
            <span className="shrink-0 self-center rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-sage-900">
              {isComplete ? "Open editor" : completeness.doneCount === 0 ? "Open editor" : "Continue"}
            </span>
          </div>
        </Link>


        {["basics", "food", "behavior", "home", "health", "clips"].includes(tab) && plan && (
          <PlanFormSection
            section={tab as PlanSection}
            birdId={birdId}
            bird={bird}
            plan={plan}
            onSaved={onPlanSaved}
          />
        )}
        {tab === "routine" && plan && <RoutineEditor planId={plan.id} tasks={tasks} onChange={() => qc.invalidateQueries({ queryKey: ["tasks", plan.id] })} />}
        {tab === "emergency" && contacts && <ContactsForm birdId={birdId} contacts={contacts} defaults={defaults ?? null} onSaved={() => qc.invalidateQueries({ queryKey: ["contacts", birdId] })} />}
        {tab === "sits" && <SitsPanel birdId={birdId} sits={sits} onChange={() => qc.invalidateQueries({ queryKey: ["sits", birdId] })} />}
        {tab === "logs" && <LogsPanel birdId={birdId} />}
      </main>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:80px;line-height:1.4}`}</style>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-sage-600">{label}</span>
      {hint && <span className="mb-1 block text-[11px] text-sage-600">{hint}</span>}
      {children}
    </label>
  );
}


type PlanSection = "basics" | "food" | "behavior" | "home" | "health" | "clips";

const CLIP_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "clip_step_up_path", label: "How she steps up", hint: "Hand position, cue word, what works." },
  { key: "clip_food_water_path", label: "Refilling food & water", hint: "Bowls, fill amount, cage-door routine." },
  { key: "clip_locations_path", label: "Where everything is", hint: "Food, treats, towels, carrier, first aid." },
  { key: "clip_bedtime_path", label: "Settling for the night", hint: "Cover, lights, sounds." },
];

function PlanFormSection({ section, birdId, bird, plan, onSaved }: { section: PlanSection; birdId: string; bird: any; plan: any; onSaved: () => void }) {
  const [b, setB] = useState(bird);
  const [p, setP] = useState(plan);
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Re-sync local state when the section changes or fresh data arrives.
  useEffect(() => { setB(bird); }, [bird, section]);
  useEffect(() => { setP(plan); }, [plan, section]);

  async function deleteBird() {
    if (deleteText.trim() !== (bird.name ?? "").trim()) {
      toast.error(`Type "${bird.name}" exactly to confirm.`);
      return;
    }
    setDeleting(true);
    await supabase.from("sit_birds").delete().eq("bird_id", birdId);
    await supabase.from("weight_logs").delete().eq("bird_id", birdId);
    await supabase.from("photo_logs").delete().eq("bird_id", birdId);
    await supabase.from("daily_logs").delete().eq("bird_id", birdId);
    await supabase.from("emergency_contacts").delete().eq("bird_id", birdId);
    if (plan?.id) {
      await supabase.from("routine_tasks").delete().eq("care_plan_id", plan.id);
      await supabase.from("care_plans").delete().eq("id", plan.id);
    }
    const { error } = await supabase.from("birds").delete().eq("id", birdId);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${bird.name} removed.`);
    qc.invalidateQueries({ queryKey: ["birds"] });
    navigate({ to: "/dashboard" });
  }
  async function save() {
    setSaving(true);
    const { id: bId, owner_id, created_at, updated_at, ...birdPatch } = b;
    const { id: pId, bird_id, created_at: pc, updated_at: pu, ...planPatch } = p;
    await Promise.all([
      supabase.from("birds").update(birdPatch).eq("id", birdId),
      supabase.from("care_plans").update(planPatch).eq("id", plan.id),
    ]);
    setSaving(false);
    toast.success("Saved.");
    onSaved();
  }
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) { toast.error("Photo must be under 2MB."); return; }
    const reader = new FileReader();
    reader.onload = () => setB({ ...b, photo_url: reader.result as string });
    reader.readAsDataURL(file);
  }

  const guidedHint = (
    <p className="text-[11px] text-sage-600">
      Need to capture richer details?{" "}
      <Link to="/birds/$birdId/setup" params={{ birdId }} className="font-semibold text-sage-800 underline">
        Open guided setup
      </Link>.
    </p>
  );

  return (
    <>
      <Disclaimer compact />

      {section === "basics" && (
        <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
          <h2 className="text-sm font-bold">Basics</h2>
          <div className="flex items-start gap-3">
            {b.photo_url ? (
              <PhotoCropper
                src={b.photo_url}
                position={b.photo_position}
                onChange={(pos) => setB({ ...b, photo_position: pos })}
                size={120}
              />
            ) : (
              <div className="flex size-[120px] items-center justify-center rounded-xl bg-sage-100 text-[10px] uppercase tracking-wider text-sage-600">No photo</div>
            )}
            <div className="flex-1 space-y-2 pt-1">
              <label className="inline-block cursor-pointer rounded-lg bg-sage-100 px-3 py-1.5 text-xs font-semibold text-sage-700">
                {b.photo_url ? "Change photo" : "Add photo"}
                <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
              </label>
              {b.photo_url && (
                <button type="button" onClick={() => setB({ ...b, photo_url: null, photo_position: null })} className="ml-2 text-xs font-semibold text-warn-red underline">Remove</button>
              )}
            </div>
          </div>
          <Field label="Name"><input className="input" value={b.name ?? ""} onChange={(e) => setB({ ...b, name: e.target.value })} /></Field>
          <SpeciesPicker value={b.species ?? ""} onChange={(v) => setB({ ...b, species: v })} />
          <AgePicker
            age={b.age ?? ""}
            birthDate={b.birth_date ?? ""}
            onChange={(next) => setB({ ...b, age: next.age, birth_date: next.birthDate })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sex">
              <select className="input" value={b.sex ?? ""} onChange={(e) => setB({ ...b, sex: e.target.value || null })}>
                <option value="">Unknown</option><option>Male</option><option>Female</option>
              </select>
            </Field>
            <Field label="Flight">
              <select className="input" value={b.flight_status ?? "unknown"} onChange={(e) => setB({ ...b, flight_status: e.target.value })}>
                <option value="unknown">Unknown</option>
                <option value="fully_flighted">Fully flighted</option>
                <option value="clipped">Clipped</option>
                <option value="partially_clipped">Partially clipped</option>
              </select>
            </Field>
          </div>
        </section>
      )}

      {section === "food" && (
        <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
          <h2 className="text-sm font-bold">Food & water</h2>
          <div className="rounded-lg bg-warn-amber/10 p-2 text-[11px] font-semibold text-warn-amber">Reminder: do not introduce new foods while the owner is away.</div>
          {guidedHint}
          {[["food_instructions", "Food instructions (pellets, fresh, treats)"], ["water_instructions", "Water"], ["fresh_food_removal", "Fresh food removal timing"], ["treats_allowed", "Treats allowed"], ["foods_never_allowed", "Foods NEVER allowed for this bird"]].map(([k, l]) => (
            <Field key={k} label={l}><textarea className="input area" value={p[k] ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></Field>
          ))}
          <div className="rounded-xl bg-sage-50/60 p-3 ring-1 ring-sage-100 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-sage-700">Freshness & hygiene</p>
            <Field label="Remove fresh or wet food after" hint="Fresh food spoils fast and can grow bacteria.">
              <select
                className="input"
                value={String(p.fresh_food_removal_minutes ?? 120)}
                onChange={(e) => setP({ ...p, fresh_food_removal_minutes: Number(e.target.value) })}
              >
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
                <option value="180">3 hours</option>
              </select>
            </Field>
            <Field label="Wash food bowls">
              <select
                className="input"
                value={p.food_bowl_wash_cadence ?? "after_each_fresh"}
                onChange={(e) => setP({ ...p, food_bowl_wash_cadence: e.target.value })}
              >
                <option value="after_each_fresh">After every fresh-food serving</option>
                <option value="once_daily">Once a day</option>
                <option value="every_few_days">Every few days</option>
              </select>
            </Field>
            <Field label="Wash water bowl or bottle" hint="Separate from how often water is changed.">
              <select
                className="input"
                value={p.water_bowl_wash_cadence ?? "once_daily"}
                onChange={(e) => setP({ ...p, water_bowl_wash_cadence: e.target.value })}
              >
                <option value="once_daily">Once a day</option>
                <option value="twice_daily">Twice a day</option>
              </select>
            </Field>
            <Field label="Other food hygiene notes">
              <textarea
                className="input area"
                value={p.food_hygiene_notes ?? ""}
                onChange={(e) => setP({ ...p, food_hygiene_notes: e.target.value })}
              />
            </Field>
          </div>
        </section>
      )}

      {section === "behavior" && (
        <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
          <h2 className="text-sm font-bold">Personality & handling</h2>
          {guidedHint}
          <Field label="Step-up cue & technique"><textarea className="input area" value={p.step_up ?? ""} onChange={(e) => setP({ ...p, step_up: e.target.value })} /></Field>
          <Field label="Step-up notes (refusal, exceptions)"><textarea className="input area" value={p.step_up_notes ?? ""} onChange={(e) => setP({ ...p, step_up_notes: e.target.value })} /></Field>
          <Field label="Who can handle her"><textarea className="input area" value={p.handlers ?? ""} onChange={(e) => setP({ ...p, handlers: e.target.value })} /></Field>
          <Field label="Likes"><textarea className="input area" value={p.likes ?? ""} onChange={(e) => setP({ ...p, likes: e.target.value })} /></Field>
          <Field label="Fears & triggers"><textarea className="input area" value={p.fears_triggers ?? ""} onChange={(e) => setP({ ...p, fears_triggers: e.target.value })} /></Field>
          <Field label="Bite warning signs"><textarea className="input area" value={p.known_triggers ?? ""} onChange={(e) => setP({ ...p, known_triggers: e.target.value })} /></Field>
        </section>
      )}

      {section === "home" && (
        <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
          <h2 className="text-sm font-bold">Environment & safety</h2>
          {guidedHint}
          <Field label="Cage location"><textarea className="input area" value={p.cage_location ?? ""} onChange={(e) => setP({ ...p, cage_location: e.target.value })} /></Field>
          <Field label="Out-of-cage rules"><textarea className="input area" value={p.out_of_cage_rules ?? ""} onChange={(e) => setP({ ...p, out_of_cage_rules: e.target.value })} /></Field>
          <Field label="Home hazards (windows, fans, appliances)"><textarea className="input area" value={p.safety_rules ?? ""} onChange={(e) => setP({ ...p, safety_rules: e.target.value })} /></Field>
          <Field label="Other pets & separation rules"><textarea className="input area" value={p.other_pets ?? ""} onChange={(e) => setP({ ...p, other_pets: e.target.value })} /></Field>
          <Field label="Cleaning products / instructions"><textarea className="input area" value={p.cleaning_instructions ?? ""} onChange={(e) => setP({ ...p, cleaning_instructions: e.target.value })} /></Field>
          <Field label="Off-limits rooms"><textarea className="input area" value={p.off_limits_rooms ?? ""} onChange={(e) => setP({ ...p, off_limits_rooms: e.target.value })} /></Field>
        </section>
      )}

      {section === "health" && (
        <>
          <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
            <h2 className="text-sm font-bold">Baseline weight (grams)</h2>
            <p className="text-xs text-sage-600">Used by the sitter's daily health scan to flag weight loss.</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Normal"><input className="input" inputMode="decimal" value={b.normal_weight ?? ""} onChange={(e) => setB({ ...b, normal_weight: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              <Field label="Min"><input className="input" inputMode="decimal" value={b.normal_weight_min ?? ""} onChange={(e) => setB({ ...b, normal_weight_min: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              <Field label="Max"><input className="input" inputMode="decimal" value={b.normal_weight_max ?? ""} onChange={(e) => setB({ ...b, normal_weight_max: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            </div>
          </section>
          <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
            <h2 className="text-sm font-bold">Conditions & medications</h2>
            <Field label="Medical conditions"><textarea className="input area" value={b.medical_conditions ?? ""} onChange={(e) => setB({ ...b, medical_conditions: e.target.value })} /></Field>
            <Field label="Medications"><textarea className="input area" value={b.medications ?? ""} onChange={(e) => setB({ ...b, medications: e.target.value })} /></Field>
            <Field label="Notes"><textarea className="input area" value={b.notes ?? ""} onChange={(e) => setB({ ...b, notes: e.target.value })} /></Field>
          </section>
          <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
            <h2 className="text-sm font-bold">What's normal</h2>
            {guidedHint}
            <Field label="Normal appetite & behavior summary"><textarea className="input area" value={p.whats_normal ?? ""} onChange={(e) => setP({ ...p, whats_normal: e.target.value })} /></Field>
            {[
              ["normal_appetite", "Normal appetite"],
              ["normal_droppings", "Normal droppings"],
              ["normal_noise", "Normal noise level"],
              ["normal_activity", "Normal activity"],
              ["normal_sleep", "Sleep / nap habits"],
              ["normal_behavior_with_strangers", "Behavior with strangers"],
            ].map(([k, l]) => (
              <Field key={k} label={l}><textarea className="input area" value={p[k] ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></Field>
            ))}
          </section>
          <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
            <h2 className="text-sm font-bold">Baseline media</h2>
            <MediaRow label="Baseline droppings photo" path={p.baseline_droppings_path} onClear={() => setP({ ...p, baseline_droppings_path: null })} />
            <MediaRow label="Normal-behavior clip" path={p.baseline_clip_path} onClear={() => setP({ ...p, baseline_clip_path: null })} />
            <p className="text-[11px] text-sage-600">
              Record or replace in{" "}
              <Link to="/birds/$birdId/setup" params={{ birdId }} className="font-semibold text-sage-800 underline">guided setup</Link>.
            </p>
          </section>
          <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
            <h2 className="text-sm font-bold">When to call</h2>
            <Field label="When to call the owner"><textarea className="input area" value={p.when_to_call_owner ?? ""} onChange={(e) => setP({ ...p, when_to_call_owner: e.target.value })} /></Field>
            <Field label="When to call the vet"><textarea className="input area" value={p.when_to_call_vet ?? ""} onChange={(e) => setP({ ...p, when_to_call_vet: e.target.value })} /></Field>
          </section>
        </>
      )}

      {section === "clips" && (
        <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
          <h2 className="text-sm font-bold">Watch-first clips</h2>
          <p className="text-[11px] text-sage-600">
            Short videos sitters watch first. Record or replace in{" "}
            <Link to="/birds/$birdId/setup" params={{ birdId }} className="font-semibold text-sage-800 underline">guided setup</Link>.
          </p>
          {CLIP_FIELDS.map((c) => (
            <div key={c.key} className="rounded-xl bg-sage-50/60 p-3 ring-1 ring-sage-100 space-y-1">
              <p className="text-xs font-semibold text-sage-800">{c.label}</p>
              <p className="text-[11px] text-sage-600">{c.hint}</p>
              <MediaRow label="" path={p[c.key]} onClear={() => setP({ ...p, [c.key]: null })} />
            </div>
          ))}
        </section>
      )}

      <button disabled={saving} onClick={save} className="sticky bottom-4 w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-50">
        {saving ? "Saving..." : "Save changes"}
      </button>

      {section === "basics" && (
        <section className="rounded-2xl border-2 border-warn-red/30 bg-warn-red/5 p-4 space-y-3">
          <h2 className="text-sm font-bold text-warn-red">Danger zone</h2>
          <p className="text-xs text-sage-700">
            Permanently delete {bird.name} and all of their care plan, routine, emergency info, weight logs, daily scans, and photos. This cannot be undone.
          </p>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-warn-red/40 bg-white px-3 py-2 text-xs font-semibold text-warn-red"
            >
              <Trash2 className="size-4" /> Delete {bird.name}
            </button>
          ) : (
            <div className="space-y-2">
              <label className="block text-[11px] font-semibold text-sage-700">
                Type <span className="font-bold">{bird.name}</span> to confirm
              </label>
              <input
                className="input"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder={bird.name}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={deleting || deleteText.trim() !== (bird.name ?? "").trim()}
                  onClick={deleteBird}
                  className="flex-1 rounded-xl bg-warn-red py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {deleting ? "Deleting..." : `Permanently delete ${bird.name}`}
                </button>
                <button
                  type="button"
                  onClick={() => { setConfirmDelete(false); setDeleteText(""); }}
                  className="rounded-xl border border-sage-200 px-3 py-2.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}

function MediaRow({ label, path, onClear }: { label: string; path: string | null | undefined; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      {label && <span className="text-xs font-semibold text-sage-700">{label}</span>}
      <div className="ml-auto flex items-center gap-2">
        {path ? (
          <>
            <span className="rounded-full bg-warn-green/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn-green">Recorded</span>
            <button type="button" onClick={onClear} className="text-[11px] font-semibold text-warn-red underline">Clear</button>
          </>
        ) : (
          <span className="rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sage-600">Not recorded</span>
        )}
      </div>
    </div>
  );
}

function RoutineEditor({ planId, tasks, onChange }: { planId: string; tasks: any[]; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("morning");
  const [time, setTime] = useState("");
  const [instructions, setInstructions] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("routine_tasks").insert({
      care_plan_id: planId, title, category, time_of_day: time, instructions,
    });
    setTitle(""); setTime(""); setInstructions(""); setAdding(false);
    onChange();
  }
  async function remove(id: string) {
    await supabase.from("routine_tasks").delete().eq("id", id);
    onChange();
  }

  const grouped: Record<string, any[]> = {};
  for (const t of tasks) (grouped[t.category] ??= []).push(t);

  return (
    <>
      <p className="text-sm text-sage-600">Tasks the sitter will check off each day, grouped by time of day.</p>
      {["morning", "midday", "evening", "bedtime", "custom"].map((cat) => (
        <section key={cat} className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-sage-600">{cat}</h2>
          <ul className="mt-2 space-y-2">
            {(grouped[cat] ?? []).map((t) => (
              <li key={t.id} className="flex items-start gap-3 rounded-lg bg-sage-50 p-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold">{t.title}{t.time_of_day && <span className="ml-2 text-[10px] uppercase text-sage-600">{t.time_of_day}</span>}</p>
                  {t.instructions && <p className="mt-0.5 text-xs text-sage-600">{t.instructions}</p>}
                </div>
                <button onClick={() => remove(t.id)} className="rounded p-1 text-sage-600"><Trash2 className="size-4" /></button>
              </li>
            ))}
            {(grouped[cat] ?? []).length === 0 && <li className="text-xs text-sage-400">No tasks yet.</li>}
          </ul>
        </section>
      ))}
      {!adding ? (
        <button onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-sage-200 py-3 text-sm font-semibold text-sage-700">
          <Plus className="size-4" /> Add task
        </button>
      ) : (
        <form onSubmit={add} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100">
          <Field label="Title"><input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fresh water & chop" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Time of day">
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="morning">Morning</option><option value="midday">Midday</option><option value="evening">Evening</option><option value="bedtime">Bedtime</option><option value="custom">Custom</option>
              </select>
            </Field>
            <Field label="Time (optional)"><input className="input" value={time} onChange={(e) => setTime(e.target.value)} placeholder="8:00 AM" /></Field>
          </div>
          <Field label="Instructions"><textarea className="input area" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
          <div className="flex gap-2">
            <button type="submit" className="flex-1 rounded-xl bg-sage-600 py-2.5 text-sm font-semibold text-white">Add</button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-xl border border-sage-200 px-3 py-2.5 text-sm">Cancel</button>
          </div>
        </form>
      )}
    </>
  );
}

function ContactsForm({ birdId, contacts, defaults, onSaved }: { birdId: string; contacts: any; defaults: any | null; onSaved: () => void }) {
  const [c, setC] = useState(contacts);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const { id, bird_id, updated_at, ...rest } = c;
    // Empty strings → null so per-bird value "falls back" to the owner default.
    const patch: Record<string, any> = {};
    for (const [k, v] of Object.entries(rest)) {
      patch[k] = typeof v === "string" && v.trim() === "" ? null : v;
    }
    await supabase.from("emergency_contacts").update(patch as any).eq("bird_id", birdId);
    setSaving(false);
    toast.success("Emergency info saved.");
    onSaved();
  }
  const fields: [string, string, boolean?][] = [
    ["owner_phone", "Owner phone", true],
    ["backup_name", "Backup contact name"],
    ["backup_phone", "Backup contact phone"],
    ["avian_vet_name", "Avian vet name"],
    ["avian_vet_phone", "Avian vet phone", true],
    ["avian_vet_address", "Avian vet address"],
    ["emergency_vet_name", "Emergency vet name"],
    ["emergency_vet_phone", "Emergency vet phone"],
    ["emergency_vet_address", "Emergency vet address"],
    ["poison_control", "Poison control number"],
    ["carrier_location", "Carrier location"],
    ["first_aid_kit_location", "First-aid kit location"],
    ["emergency_authorization", "Emergency-care authorization"],
    ["spending_limit", "Approved spending limit"],
  ];
  const hasAnyDefault = defaults && Object.values(defaults).some((v) => typeof v === "string" && v.trim());
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100">
      <h2 className="text-sm font-bold">Emergency contacts & home info</h2>
      <p className="text-xs text-sage-600">
        Empty fields use your <Link to="/dashboard" className="font-semibold underline">account defaults</Link>.
        Type anything here to override the default for this bird. Owner phone and avian vet phone are required (default or override) before you can share a sitter link.
      </p>
      {!hasAnyDefault && (
        <p className="rounded-lg bg-sage-50 px-3 py-2 text-[11px] text-sage-700">
          No account defaults set yet. Add them once on the <Link to="/dashboard" className="font-semibold underline">dashboard</Link> and every bird will inherit them.
        </p>
      )}
      {fields.map(([k, l, required]) => {
        const raw = c[k];
        const isOverride = typeof raw === "string" && raw.trim() !== "";
        const defaultVal: string = (defaults?.[k] ?? "").toString();
        const inheriting = !isOverride && defaultVal.trim() !== "";
        return (
          <div key={k} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-sage-700">
                {l}{required && <span className="text-warn-red"> *</span>}
              </label>
              {isOverride ? (
                <button
                  type="button"
                  onClick={() => setC({ ...c, [k]: "" })}
                  className="rounded-full bg-warn-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn-amber"
                  title="Clear override and use account default"
                >
                  Override · reset
                </button>
              ) : inheriting ? (
                <span className="rounded-full bg-sage-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sage-700">
                  Default
                </span>
              ) : required ? (
                <span className="rounded-full bg-warn-red/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn-red">
                  Missing
                </span>
              ) : (
                <span className="rounded-full bg-sage-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sage-500">
                  Empty
                </span>
              )}
            </div>
            <input
              className="input"
              value={raw ?? ""}
              placeholder={inheriting ? `Default: ${defaultVal}` : required ? "Required" : "Optional"}
              onChange={(e) => setC({ ...c, [k]: e.target.value })}
            />
          </div>
        );
      })}
      <button disabled={saving} onClick={save} className="mt-2 w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save emergency info"}</button>
    </section>
  );
}

function SitsPanel({ birdId, sits, onChange }: { birdId: string; sits: any[]; onChange: () => void }) {
  return (
    <>
      <div className="rounded-xl bg-sage-100/60 p-3 text-xs text-sage-700">
        Sits are created from the <Link to="/dashboard" className="font-semibold underline">owner dashboard</Link>, where you can include multiple birds in one sit.
      </div>
      {sits.length === 0 && <p className="text-sm text-sage-600">This bird isn't part of any sit yet.</p>}
      {sits.map((s) => <SitCard key={s.id} sit={s} onChange={onChange} />)}
    </>
  );
}

function LogsPanel({ birdId }: { birdId: string }) {
  const qc = useQueryClient();
  const [weight, setWeight] = useState("");
  const [wNotes, setWNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedScan, setExpandedScan] = useState<string | null>(null);

  const { data: weights = [] } = useQuery({
    queryKey: ["weights", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("weight_logs").select("*").eq("bird_id", birdId).order("logged_at", { ascending: false }).limit(30);
      return data ?? [];
    },
  });
  const { data: daily = [] } = useQuery({
    queryKey: ["daily-logs", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("daily_logs").select("*").eq("bird_id", birdId).order("created_at", { ascending: false }).limit(30);
      return data ?? [];
    },
  });
  const { data: photos = [] } = useQuery({
    queryKey: ["photo-logs", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("photo_logs").select("*").eq("bird_id", birdId).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  async function addWeight(e: React.FormEvent) {
    e.preventDefault();
    const grams = parseFloat(weight);
    if (!grams || grams <= 0) { toast.error("Enter a weight in grams."); return; }
    setSaving(true);
    const { error } = await supabase.from("weight_logs").insert({
      bird_id: birdId,
      weight: grams,
      notes: wNotes || null,
      logged_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setWeight(""); setWNotes("");
    qc.invalidateQueries({ queryKey: ["weights", birdId] });
    toast.success("Weight logged.");
  }

  const triageColor = (s: string) =>
    s === "red" ? "bg-warn-red/10 text-warn-red"
    : s === "yellow" ? "bg-warn-amber/10 text-warn-amber"
    : "bg-warn-green/10 text-warn-green";
  const SCAN_COLS: { col: string; label: string }[] = [
    { col: "alertness_status", label: "Alert and responsive" },
    { col: "food_status", label: "Eating normally" },
    { col: "droppings_status", label: "Droppings look normal" },
    { col: "breathing_status", label: "Breathing normally" },
    { col: "posture_status", label: "Perched normally" },
    { col: "behavior_status", label: "Vocalizing as usual" },
    { col: "energy_status", label: "Not fluffed for long stretches" },
    { col: "injury_status", label: "No injury, fall, bite, or scratch" },
    { col: "exposure_status", label: "No exposure to fumes / unsafe items" },
  ];
  const severityRank = (s: string) => (s === "red" ? 0 : s === "yellow" ? 1 : 2);
  const sortedDaily = [...daily].sort((a: any, b: any) => {
    const r = severityRank(a.triage_status) - severityRank(b.triage_status);
    if (r !== 0) return r;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const answerStyle = (a: string | null) =>
    a === "concerning" ? "bg-warn-red/10 text-warn-red"
    : a === "not_sure" ? "bg-warn-amber/10 text-warn-amber"
    : a === "normal" ? "bg-warn-green/10 text-warn-green"
    : "bg-sage-100 text-sage-500";
  const answerLabel = (a: string | null) =>
    a === "concerning" ? "Concerning" : a === "not_sure" ? "Not sure" : a === "normal" ? "Normal" : "—";

  return (
    <>
      <Disclaimer compact />

      <section className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <h2 className="text-sm font-bold">Log weight</h2>
        <p className="mt-1 text-[11px] text-sage-600">Weigh at the same time of day on the same scale for trustworthy trends.</p>
        <form onSubmit={addWeight} className="mt-3 space-y-2">
          <div className="flex gap-2">
            <input className="input" type="number" step="0.1" placeholder="Weight (g)" value={weight} onChange={(e) => setWeight(e.target.value)} />
            <button disabled={saving} className="rounded-xl bg-sage-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Add</button>
          </div>
          <input className="input" placeholder="Notes (optional)" value={wNotes} onChange={(e) => setWNotes(e.target.value)} />
        </form>
        {weights.length > 0 && (
          <ul className="mt-3 divide-y divide-sage-100 text-sm">
            {weights.map((w: any) => (
              <li key={w.id} className="flex items-center justify-between py-2">
                <span className="font-semibold">{w.weight} g</span>
                <span className="text-[11px] text-sage-600">{new Date(w.logged_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <h2 className="text-sm font-bold">Health scans from sitters</h2>
        {daily.length === 0 ? (
          <p className="mt-2 text-sm text-sage-600">No scans logged yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sortedDaily.map((d: any) => {
              const isOpen = expandedScan === d.id;
              const needsAttention = d.triage_status === "red" || d.triage_status === "yellow";
              const linkedPhotos = photos.filter((p: any) => p.daily_log_id === d.id);
              const wrap = d.triage_status === "red"
                ? "border-2 border-warn-red bg-warn-red/5"
                : d.triage_status === "yellow"
                ? "border-2 border-warn-amber bg-warn-amber/5"
                : "border border-sage-100 bg-sage-50";
              return (
                <li key={d.id} className={`rounded-xl ${wrap}`}>
                  <button
                    type="button"
                    onClick={() => setExpandedScan(isOpen ? null : d.id)}
                    className="flex w-full items-center justify-between gap-2 p-3 text-left"
                    aria-expanded={isOpen}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {needsAttention && <AlertTriangle className={`size-4 shrink-0 ${d.triage_status === "red" ? "text-warn-red" : "text-warn-amber"}`} />}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${triageColor(d.triage_status)}`}>{d.triage_status}</span>
                          {needsAttention && (
                            <span className={`text-[11px] font-bold uppercase tracking-wide ${d.triage_status === "red" ? "text-warn-red" : "text-warn-amber"}`}>
                              Needs attention
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-sage-600">{new Date(d.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                      </div>
                    </div>
                    <ChevronDown className={`size-4 shrink-0 text-sage-500 transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-sage-100 px-3 py-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-sage-600">Per-question answers</p>
                        <ul className="mt-2 space-y-1.5">
                          {SCAN_COLS.map((f) => (
                            <li key={f.col} className="flex items-center justify-between gap-3 text-xs">
                              <span className="text-sage-800">{f.label}</span>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${answerStyle(d[f.col])}`}>
                                {answerLabel(d[f.col])}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {d.triage_reasons && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-sage-600">Flagged</p>
                          <p className="mt-1 whitespace-pre-line text-xs text-sage-800">{d.triage_reasons}</p>
                        </div>
                      )}
                      {d.notes && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-sage-600">Sitter notes</p>
                          <p className="mt-1 text-xs italic text-sage-700">"{d.notes}"</p>
                        </div>
                      )}
                      {linkedPhotos.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-sage-600">Photos</p>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {linkedPhotos.map((p: any) => (
                              <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-sage-100">
                                <img src={p.photo_url} alt={p.photo_type} className="size-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <h2 className="text-sm font-bold">Photos from sitters</h2>
        {photos.length === 0 ? (
          <p className="mt-2 text-sm text-sage-600">No photos logged yet.</p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((p: any) => (
              <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-sage-100">
                <img src={p.photo_url} alt={p.photo_type} className="size-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
