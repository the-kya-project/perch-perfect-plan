import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/birds/new")({
  head: () => ({ meta: [{ title: "Add a bird — Parrot Care Companion" }] }),
  component: NewBird,
});

function NewBird() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState("");
  const [flight, setFlight] = useState("unknown");
  const [normal, setNormal] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: bird, error } = await supabase.from("birds").insert({
      owner_id: u.user.id,
      name,
      species: species || null,
      age: age || null,
      sex: sex || null,
      flight_status: flight,
      normal_weight: normal ? Number(normal) : null,
      normal_weight_min: min ? Number(min) : null,
      normal_weight_max: max ? Number(max) : null,
    }).select().single();
    if (error || !bird) { toast.error(error?.message ?? "Could not create bird."); setLoading(false); return; }
    // Auto-create care plan + emergency contacts shells
    await supabase.from("care_plans").insert({ bird_id: bird.id });
    await supabase.from("emergency_contacts").insert({ bird_id: bird.id });
    toast.success(`${name} added.`);
    navigate({ to: "/birds/$birdId", params: { birdId: bird.id } });
  }

  return (
    <div className="min-h-screen bg-sage-50 pb-20">
      <header className="border-b border-sage-100 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <Link to="/dashboard" className="rounded p-1 text-sage-600"><ArrowLeft className="size-5" /></Link>
          <h1 className="text-sm font-bold">Add a bird</h1>
        </div>
      </header>
      <form onSubmit={submit} className="mx-auto max-w-md space-y-4 px-4 py-6">
        <p className="text-sm text-sage-600">Start with the basics. You can enrich the full care plan after.</p>
        <Field label="Name" required>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Species"><input className="input" value={species} onChange={(e) => setSpecies(e.target.value)} placeholder="Sun Conure" /></Field>
          <Field label="Age"><input className="input" value={age} onChange={(e) => setAge(e.target.value)} placeholder="4 yrs" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sex">
            <select className="input" value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">Unknown</option><option>Male</option><option>Female</option>
            </select>
          </Field>
          <Field label="Flight">
            <select className="input" value={flight} onChange={(e) => setFlight(e.target.value)}>
              <option value="unknown">Unknown</option>
              <option value="fully_flighted">Fully flighted</option>
              <option value="clipped">Clipped</option>
              <option value="partially_clipped">Partially clipped</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Normal (g)"><input className="input" inputMode="decimal" value={normal} onChange={(e) => setNormal(e.target.value)} /></Field>
          <Field label="Min (g)"><input className="input" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} /></Field>
          <Field label="Max (g)"><input className="input" inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} /></Field>
        </div>
        <button disabled={loading} className="mt-3 w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {loading ? "Saving..." : "Save and continue"}
        </button>
      </form>
      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}`}</style>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-sage-600">{label}{required && " *"}</span>
      {children}
    </label>
  );
}
