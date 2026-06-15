import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Plus, Trash2, Link2, Copy, Calendar } from "lucide-react";
import { toast } from "sonner";
import { Disclaimer, VetReviewBanner } from "@/components/Disclaimer";
import { PhotoCropper } from "@/components/PhotoCropper";
import { SpeciesPicker, AgePicker } from "@/components/BirdPickers";


export const Route = createFileRoute("/_authenticated/birds/$birdId")({
  head: () => ({ meta: [{ title: "Care plan — Parrot Care Companion" }] }),
  component: BirdEditor,
});

type Tab = "plan" | "routine" | "emergency" | "sits" | "logs";

function BirdEditor() {
  const { birdId } = Route.useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("plan");

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
      const { data } = await supabase.from("sits").select("*").eq("bird_id", birdId).order("start_date", { ascending: false });
      return data ?? [];
    },
  });

  if (!bird) return <div className="p-6 text-sm text-sage-600">Loading...</div>;

  const tabs: { id: Tab; label: string }[] = [
    { id: "plan", label: "Care plan" },
    { id: "routine", label: "Routine" },
    { id: "emergency", label: "Emergency" },
    { id: "sits", label: "Sits" },
    { id: "logs", label: "Logs" },
  ];

  return (
    <div className="min-h-screen bg-sage-50 pb-20">
      <header className="sticky top-0 z-10 border-b border-sage-100 bg-white">
        <div className="mx-auto max-w-md px-4 py-3">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="rounded p-1 text-sage-600"><ArrowLeft className="size-5" /></Link>
            {bird.photo_url && <img src={bird.photo_url} alt={bird.name} className="size-9 rounded-full object-cover ring-1 ring-sage-200" style={{ objectPosition: bird.photo_position ?? "50% 50%" }} />}
            <div className="flex-1">
              <h1 className="text-sm font-bold">{bird.name}</h1>
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
        {tab === "plan" && plan && <PlanForm birdId={birdId} bird={bird} plan={plan} onSaved={() => { qc.invalidateQueries({ queryKey: ["plan", birdId] }); qc.invalidateQueries({ queryKey: ["bird", birdId] }); }} />}
        {tab === "routine" && plan && <RoutineEditor planId={plan.id} tasks={tasks} onChange={() => qc.invalidateQueries({ queryKey: ["tasks", plan.id] })} />}
        {tab === "emergency" && contacts && <ContactsForm birdId={birdId} contacts={contacts} onSaved={() => qc.invalidateQueries({ queryKey: ["contacts", birdId] })} />}
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

function PlanForm({ birdId, bird, plan, onSaved }: { birdId: string; bird: any; plan: any; onSaved: () => void }) {
  const [b, setB] = useState(bird);
  const [p, setP] = useState(plan);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const { id: bId, owner_id, created_at, updated_at, ...birdPatch } = b;
    const { id: pId, bird_id, created_at: pc, updated_at: pu, ...planPatch } = p;
    await Promise.all([
      supabase.from("birds").update(birdPatch).eq("id", birdId),
      supabase.from("care_plans").update(planPatch).eq("id", plan.id),
    ]);
    setSaving(false);
    toast.success("Care plan saved.");
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
  return (
    <>
      <Disclaimer compact />
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
        <h2 className="text-sm font-bold">Profile</h2>
        <Field label="Medical conditions"><textarea className="input area" value={b.medical_conditions ?? ""} onChange={(e) => setB({ ...b, medical_conditions: e.target.value })} /></Field>
        <Field label="Medications"><textarea className="input area" value={b.medications ?? ""} onChange={(e) => setB({ ...b, medications: e.target.value })} /></Field>
        <Field label="Notes"><textarea className="input area" value={b.notes ?? ""} onChange={(e) => setB({ ...b, notes: e.target.value })} /></Field>
      </section>

      <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
        <h2 className="text-sm font-bold">Health baseline</h2>
        {[
          ["normal_appetite", "Normal appetite"],
          ["normal_droppings", "Normal droppings"],
          ["normal_noise", "Normal noise level"],
          ["normal_activity", "Normal activity"],
          ["normal_sleep", "Sleep / nap habits"],
          ["normal_behavior_with_strangers", "Behavior with strangers"],
          ["known_triggers", "Known bite triggers / hormonal behaviors"],
        ].map(([k, l]) => (
          <Field key={k} label={l}><textarea className="input area" value={p[k] ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></Field>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
        <h2 className="text-sm font-bold">Food & water</h2>
        <div className="rounded-lg bg-warn-amber/10 p-2 text-[11px] font-semibold text-warn-amber">Reminder: do not introduce new foods while the owner is away.</div>
        {[["food_instructions", "Food instructions (pellets, fresh, treats)"], ["water_instructions", "Water"], ["fresh_food_removal", "Fresh food removal timing"], ["treats_allowed", "Treats allowed"], ["foods_never_allowed", "Foods NEVER allowed for this bird"]].map(([k, l]) => (
          <Field key={k} label={l}><textarea className="input area" value={p[k] ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></Field>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
        <h2 className="text-sm font-bold">Handling & home safety</h2>
        {[["handling_rules", "Handling rules (step-up, step-down, refusal)"], ["out_of_cage_rules", "Out-of-cage rules"], ["safety_rules", "Home safety (windows, fans, appliances)"], ["other_pets", "Other pets & separation rules"], ["cleaning_instructions", "Cleaning products / instructions"], ["off_limits_rooms", "Off-limits rooms"]].map(([k, l]) => (
          <Field key={k} label={l}><textarea className="input area" value={p[k] ?? ""} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></Field>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
        <h2 className="text-sm font-bold">When to call</h2>
        <Field label="When to call the owner"><textarea className="input area" value={p.when_to_call_owner ?? ""} onChange={(e) => setP({ ...p, when_to_call_owner: e.target.value })} /></Field>
        <Field label="When to call the vet"><textarea className="input area" value={p.when_to_call_vet ?? ""} onChange={(e) => setP({ ...p, when_to_call_vet: e.target.value })} /></Field>
      </section>

      <button disabled={saving} onClick={save} className="sticky bottom-4 w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white shadow-lg disabled:opacity-50">
        {saving ? "Saving..." : "Save care plan"}
      </button>
    </>
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

function ContactsForm({ birdId, contacts, onSaved }: { birdId: string; contacts: any; onSaved: () => void }) {
  const [c, setC] = useState(contacts);
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const { id, bird_id, updated_at, ...patch } = c;
    await supabase.from("emergency_contacts").update(patch).eq("bird_id", birdId);
    setSaving(false);
    toast.success("Emergency info saved.");
    onSaved();
  }
  const fields: [string, string][] = [
    ["owner_phone", "Owner phone"],
    ["backup_name", "Backup contact name"],
    ["backup_phone", "Backup contact phone"],
    ["avian_vet_name", "Avian vet name"],
    ["avian_vet_phone", "Avian vet phone"],
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
  return (
    <section className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100">
      <h2 className="text-sm font-bold">Emergency contacts & home info</h2>
      <p className="text-xs text-sage-600">This information appears in the sitter's Emergency Mode.</p>
      {fields.map(([k, l]) => (
        <Field key={k} label={l}><input className="input" value={c[k] ?? ""} onChange={(e) => setC({ ...c, [k]: e.target.value })} /></Field>
      ))}
      <button disabled={saving} onClick={save} className="mt-2 w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving..." : "Save emergency info"}</button>
    </section>
  );
}

function SitsPanel({ birdId, sits, onChange }: { birdId: string; sits: any[]; onChange: () => void }) {
  return (
    <>
      <Link to="/birds/$birdId/sits/new" params={{ birdId }} className="flex items-center justify-center gap-2 rounded-xl bg-sage-600 px-4 py-3 text-sm font-semibold text-white">
        <Plus className="size-4" /> Create a sit
      </Link>
      {sits.length === 0 && <p className="text-sm text-sage-600">No sits yet. Create one to generate a secure invite link for your sitter.</p>}
      {sits.map((s) => <SitCard key={s.id} sit={s} onChange={onChange} />)}
    </>
  );
}

function SitCard({ sit, onChange }: { sit: any; onChange: () => void }) {
  const expired = new Date(sit.token_expires_at) < new Date();
  const status = sit.revoked ? "Revoked" : expired ? "Expired" : "Active";
  const url = typeof window !== "undefined" ? `${window.location.origin}/sitter/${sit.invite_token}` : "";
  async function revoke() {
    await supabase.from("sits").update({ revoked: true }).eq("id", sit.id);
    toast.success("Link revoked.");
    onChange();
  }
  async function copy() {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied.");
  }
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Calendar className="size-4 text-sage-600" />
          {sit.start_date} → {sit.end_date}
        </div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${sit.revoked || expired ? "bg-sage-100 text-sage-600" : "bg-warn-green/10 text-warn-green"}`}>{status}</span>
      </div>
      <p className="mt-1 text-xs text-sage-600">Sitter: {sit.sitter_name ?? "—"} {sit.sitter_email && `(${sit.sitter_email})`}</p>
      {!sit.revoked && !expired && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-sage-50 p-2">
          <Link2 className="size-3.5 text-sage-600" />
          <span className="flex-1 truncate text-[11px] text-sage-700">{url}</span>
          <button onClick={copy} className="rounded p-1 text-sage-600"><Copy className="size-3.5" /></button>
        </div>
      )}
      {!sit.revoked && !expired && (
        <button onClick={revoke} className="mt-3 text-xs font-semibold text-warn-red underline">Revoke link</button>
      )}
    </div>
  );
}

function LogsPanel({ birdId }: { birdId: string }) {
  const qc = useQueryClient();
  const [weight, setWeight] = useState("");
  const [wNotes, setWNotes] = useState("");
  const [saving, setSaving] = useState(false);

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
            {daily.map((d: any) => (
              <li key={d.id} className="rounded-xl bg-sage-50 p-3">
                <div className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${triageColor(d.triage_status)}`}>{d.triage_status}</span>
                  <span className="text-[11px] text-sage-600">{new Date(d.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                </div>
                {d.triage_reasons && <p className="mt-2 text-xs text-sage-700">{d.triage_reasons}</p>}
                {d.notes && <p className="mt-1 text-xs italic text-sage-600">"{d.notes}"</p>}
              </li>
            ))}
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
