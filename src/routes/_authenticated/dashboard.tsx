import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Bird as BirdIcon, LogOut, ChevronRight, Calendar } from "lucide-react";
import { Disclaimer } from "@/components/Disclaimer";
import { SitCard } from "@/components/SitCard";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your birds — Parrot Care Companion" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: birds = [] } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, name, species, photo_url, photo_position")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sits = [] } = useQuery({
    queryKey: ["all-sits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sits")
        .select("*, sit_birds(bird_id)")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out.");
    navigate({ to: "/" });
  }

  const refreshSits = () => qc.invalidateQueries({ queryKey: ["all-sits"] });
  const birdLookup = Object.fromEntries(birds.map((b: any) => [b.id, b]));

  return (
    <div className="min-h-screen bg-sage-50 pb-20">
      <header className="sticky top-0 z-10 border-b border-sage-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-sm font-bold tracking-tight">Owner dashboard</h1>
            <p className="text-[10px] uppercase tracking-wider text-sage-600">Parrot Care Companion</p>
          </div>
          <button onClick={signOut} className="rounded-full p-2 text-sage-600 hover:bg-sage-100" aria-label="Sign out">
            <LogOut className="size-4" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-4 py-6">
        <Disclaimer compact />

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-base font-bold">Your birds</h2>
            <Link to="/birds/new" className="text-xs font-semibold text-sage-700 underline">+ Add bird</Link>
          </div>
          {birds.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-sage-200 bg-white p-8 text-center">
              <BirdIcon className="mx-auto size-8 text-sage-400" />
              <p className="mt-3 font-semibold">Add your first bird</p>
              <p className="mt-1 text-sm text-sage-600">Build a care plan once. Reuse and enrich it across every sit.</p>
              <Link to="/birds/new" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sage-600 px-4 py-2.5 text-sm font-semibold text-white">
                <Plus className="size-4" /> Add bird
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {birds.map((b: any) => (
                <Link
                  key={b.id}
                  to="/birds/$birdId"
                  params={{ birdId: b.id }}
                  className="block rounded-2xl bg-white p-4 ring-1 ring-sage-100 shadow-sm active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={b.name} photo={b.photo_url} position={b.photo_position} />
                    <div className="flex-1">
                      <p className="font-semibold">{b.name}</p>
                      <p className="text-[11px] uppercase tracking-wider text-sage-600">{b.species ?? "Parrot"}</p>
                    </div>
                    <ChevronRight className="size-4 text-sage-400" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {birds.length > 0 && <DefaultsPanel />}



        {birds.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold">Sits</h2>
            <p className="text-xs text-sage-600">Create one sit that covers any combination of your birds. The sitter gets a single secure invite link.</p>
            <SitForm birds={birds} onCreated={refreshSits} />
            {sits.length === 0 ? (
              <p className="text-sm text-sage-600">No sits yet.</p>
            ) : (
              sits.map((s: any) => {
                const sitBirds = (s.sit_birds ?? [])
                  .map((sb: any) => birdLookup[sb.bird_id])
                  .filter(Boolean);
                return <SitCard key={s.id} sit={s} birds={sitBirds} onChange={refreshSits} />;
              })
            )}
          </section>
        )}
      </main>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:70px}`}</style>
    </div>
  );
}

function Avatar({ name, photo, position }: { name: string; photo?: string | null; position?: string | null }) {
  if (photo) {
    return <img src={photo} alt={name} className="size-12 rounded-full object-cover ring-1 ring-sage-200" style={{ objectPosition: position ?? "50% 50%" }} />;
  }
  return (
    <div className="grid size-12 place-items-center rounded-full bg-sage-100 text-sage-700 font-bold">
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

function SitForm({ birds, onCreated }: { birds: any[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(birds.length === 1 ? [birds[0].id] : []));
  const [sitterName, setSitterName] = useState("");
  const [sitterEmail, setSitterEmail] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  function selectAll() {
    setSelected(new Set(birds.map((b) => b.id)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) { toast.error("Pick at least one bird."); return; }
    if (!start || !end) { toast.error("Pick a start and end date."); return; }
    if (end < start) { toast.error("End date must be on or after start date."); return; }
    setSaving(true);
    try {
      const birdIds = Array.from(selected);
      const [{ data: contacts, error: ecErr }, { data: u }] = await Promise.all([
        supabase
          .from("emergency_contacts")
          .select("bird_id, owner_phone, avian_vet_phone")
          .in("bird_id", birdIds),
        supabase.auth.getUser(),
      ]);
      if (ecErr) { toast.error(ecErr.message); setSaving(false); return; }
      if (!u.user) { toast.error("You're signed out."); setSaving(false); return; }
      const { data: defaults } = await supabase
        .from("owner_emergency_defaults")
        .select("owner_phone, avian_vet_phone")
        .eq("owner_id", u.user.id)
        .maybeSingle();
      const contactByBird = new Map((contacts ?? []).map((c: any) => [c.bird_id, c]));
      const eff = (c: any, k: string) =>
        (c?.[k]?.trim?.() || (defaults as any)?.[k]?.trim?.() || "");
      const missing = birdIds
        .map((id) => {
          const c = contactByBird.get(id);
          const needs: string[] = [];
          if (!eff(c, "owner_phone")) needs.push("your phone");
          if (!eff(c, "avian_vet_phone")) needs.push("avian vet phone");
          return needs.length ? { bird: birds.find((b: any) => b.id === id), needs } : null;
        })
        .filter(Boolean) as { bird: any; needs: string[] }[];
      if (missing.length) {
        const details = missing.map((m) => `${m.bird?.name ?? "Bird"}: ${m.needs.join(" & ")}`).join("; ");
        toast.error(
          `Add the required emergency contacts before sharing a sitter link — ${details}. Set account defaults below, or open the bird's Emergency tab.`,
          { duration: 8000 },
        );
        setSaving(false);
        return;
      }

      const expires = new Date(end + "T23:59:59Z").toISOString();
      const { data: sit, error } = await supabase.from("sits").insert({
        owner_id: u.user.id,
        sitter_name: sitterName || null,
        sitter_email: sitterEmail || null,
        start_date: start, end_date: end,
        notes: notes || null,
        token_expires_at: expires,
        status: "upcoming",
      }).select().single();
      if (error || !sit) { toast.error(error?.message ?? "Could not create sit."); setSaving(false); return; }
      const rows = birdIds.map((bird_id) => ({ sit_id: sit.id, bird_id }));
      const { error: linkErr } = await supabase.from("sit_birds").insert(rows);
      if (linkErr) { toast.error(linkErr.message); setSaving(false); return; }
      toast.success("Sit created.");
      setOpen(false);
      setSitterName(""); setSitterEmail(""); setStart(""); setEnd(""); setNotes("");
      setSelected(new Set(birds.length === 1 ? [birds[0].id] : []));
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-sage-600 px-4 py-3 text-sm font-semibold text-white">
        <Plus className="size-4" /> Create a sit
      </button>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold">New sit</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-sage-600 underline">Cancel</button>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sage-600">Birds included</p>
          {birds.length > 1 && (
            <button type="button" onClick={selectAll} className="text-[11px] font-semibold text-sage-700 underline">Select all</button>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {birds.map((b: any) => {
            const on = selected.has(b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => toggle(b.id)}
                className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-sm ${on ? "border-sage-600 bg-sage-50" : "border-sage-100 bg-white"}`}
              >
                <span className={`grid size-4 shrink-0 place-items-center rounded border-2 ${on ? "border-sage-600 bg-sage-600" : "border-sage-300"}`}>
                  {on && <svg viewBox="0 0 20 20" className="size-3 text-white"><path fill="currentColor" d="M7.629 13.314 4.4 10.085l1.214-1.214 2.015 2.015 5.757-5.757 1.214 1.214z"/></svg>}
                </span>
                <span className="truncate">{b.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Field label="Sitter name"><input className="input" value={sitterName} onChange={(e) => setSitterName(e.target.value)} /></Field>
      <Field label="Sitter email"><input className="input" type="email" value={sitterEmail} onChange={(e) => setSitterEmail(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start"><input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="End"><input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <Field label="Notes for this sit"><textarea className="input area" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

      <button type="submit" disabled={saving} className="w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? "Creating..." : "Create sit & generate link"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-sage-600">{label}</span>
      {children}
    </label>
  );
}

function DefaultsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
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
      return data ?? { owner_id: u.user.id };
    },
  });
  const [d, setD] = useState<any>(defaults ?? {});
  const [saving, setSaving] = useState(false);
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
  const filledCount = defaults
    ? fields.filter(([k]) => typeof (defaults as any)[k] === "string" && (defaults as any)[k].trim()).length
    : 0;

  async function save() {
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Signed out."); setSaving(false); return; }
    const row: Record<string, any> = { owner_id: u.user.id };
    for (const [k] of fields) {
      const v = d[k];
      row[k] = typeof v === "string" && v.trim() === "" ? null : v ?? null;
    }
    const { error } = await supabase
      .from("owner_emergency_defaults")
      .upsert(row, { onConflict: "owner_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Defaults saved. New and existing birds inherit any empty fields.");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["owner-defaults"] });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between">
        <h2 className="text-base font-bold">Account emergency defaults</h2>
        <button
          type="button"
          onClick={() => { setD(defaults ?? {}); setOpen((o) => !o); }}
          className="text-xs font-semibold text-sage-700 underline"
        >
          {open ? "Close" : filledCount > 0 ? "Edit" : "Set up"}
        </button>
      </div>
      <p className="text-xs text-sage-600">
        Set owner phone, avian vet, and other emergency info <em>once</em>. Every bird inherits these unless its Emergency tab overrides a field.
      </p>
      {!open ? (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-sage-100 text-xs text-sage-700">
          {filledCount === 0
            ? "No defaults set yet — each bird needs its own contacts until you fill these in."
            : `${filledCount} of ${fields.length} default fields set.`}
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100">
          {fields.map(([k, l, required]) => (
            <Field key={k} label={required ? `${l} *` : l}>
              <input
                className="input"
                value={d[k] ?? ""}
                onChange={(e) => setD({ ...d, [k]: e.target.value })}
              />
            </Field>
          ))}
          <button disabled={saving} onClick={save} className="mt-2 w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving..." : "Save account defaults"}
          </button>
        </div>
      )}
    </section>
  );
}
