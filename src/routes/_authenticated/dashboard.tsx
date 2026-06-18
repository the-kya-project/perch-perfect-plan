import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Plus, Bird as BirdIcon, LogOut, Calendar, Settings, Bell, Feather } from "lucide-react";
import { Disclaimer } from "@/components/Disclaimer";
import { SitCard } from "@/components/SitCard";
import { toast } from "sonner";
import { computeSetupCompleteness } from "@/lib/setupCompleteness";
import { track } from "@/lib/analytics";
import { AddToHomeScreenPrompt } from "@/components/AddToHomeScreenPrompt";

const dashboardSearch = z.object({
  newSit: z.coerce.boolean().optional(),
  preselectBirdId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Your birds — Parrot Care Co-Pilot" }] }),
  validateSearch: dashboardSearch,
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { newSit, preselectBirdId } = Route.useSearch();

  const { data: profile } = useQuery({
    queryKey: ["owner-profile-name"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      return data ?? null;
    },
  });
  const firstName = (profile?.display_name ?? "").trim().split(/\s+/)[0] || "";
  const greeting = firstName ? `Welcome, ${firstName}!` : "Welcome!";

  const { data: birds = [] } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, owner_id, name, species, photo_url, photo_position, setup_complete, setup_step, normal_weight")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const birdIds = useMemo(() => birds.map((b: any) => b.id), [birds]);
  const ownerId = birds[0]?.owner_id as string | undefined;

  // Pull every input feeding the per-bird completeness indicator in one shot
  // per table to avoid N+1 round trips on the dashboard.
  const { data: completenessData } = useQuery({
    queryKey: ["birds-completeness", birdIds, ownerId],
    enabled: birdIds.length > 0,
    queryFn: async () => {
      const [plansRes, contactsRes, defaultsRes] = await Promise.all([
        supabase.from("care_plans").select("*").in("bird_id", birdIds),
        supabase.from("emergency_contacts").select("*").in("bird_id", birdIds),
        ownerId
          ? supabase
              .from("owner_emergency_defaults")
              .select("*")
              .eq("owner_id", ownerId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
      ]);
      const plans = (plansRes.data ?? []) as any[];
      const planIds = plans.map((p) => p.id);
      const tasksRes = planIds.length
        ? await supabase
            .from("routine_tasks")
            .select("care_plan_id")
            .in("care_plan_id", planIds)
        : { data: [] as any[] };
      const tasksByPlan = new Map<string, number>();
      for (const row of (tasksRes.data ?? []) as any[]) {
        tasksByPlan.set(row.care_plan_id, (tasksByPlan.get(row.care_plan_id) ?? 0) + 1);
      }
      const planByBird = new Map(plans.map((p) => [p.bird_id, p]));
      const contactByBird = new Map(
        ((contactsRes.data ?? []) as any[]).map((c) => [c.bird_id, c]),
      );
      return {
        planByBird,
        tasksByPlan,
        contactByBird,
        defaults: (defaultsRes as any)?.data ?? null,
      };
    },
  });

  const { data: sits = [] } = useQuery({
    queryKey: ["all-sits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sits")
        .select("*, sit_birds(bird_id)")
        // Hide internal preview sits used by the setup flow's review screen.
        .neq("sitter_name", "__preview__")
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

  const today = new Date().toISOString().slice(0, 10);
  const activeSit = (sits as any[]).find((s) => s.start_date <= today && s.end_date >= today) ?? null;

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-20">
      {/* Green brand band */}
      <header className="bg-[#1a3d2e] pt-[max(env(safe-area-inset-top),1rem)]">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 pb-6 pt-3">
          <h1 className="text-[27px] font-medium leading-tight text-white">{greeting}</h1>
          <div className="flex items-center gap-1 text-white">
            <Link to="/notifications" className="rounded-full p-2 hover:bg-white/10" aria-label="Notifications">
              <Bell className="size-5" />
            </Link>
            <Link to="/account" className="rounded-full p-2 hover:bg-white/10" aria-label="Account settings">
              <Settings className="size-5" />
            </Link>
            <button onClick={signOut} className="rounded-full p-2 hover:bg-white/10" aria-label="Sign out">
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-4 py-6">
        <Disclaimer compact />

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-[21px] font-medium text-[#1a3d2e]">Your birds</h2>
            <Link to="/birds/new" className="text-sm font-medium text-[#1a3d2e]">+ Add bird</Link>
          </div>
          {birds.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-[#d8cfb8] bg-[#efe9da] p-8 text-center">
              <BirdIcon className="mx-auto size-8 text-[#2d6a4f]" />
              <p className="mt-3 font-medium text-[#1a3d2e]">Add your first bird</p>
              <p className="mt-1 text-sm text-[#5f5e5a]">Build a care plan once. Reuse and enrich it across every sit.</p>
              <Link to="/birds/new" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">
                <Plus className="size-4" /> Add bird
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {birds.map((b: any) => {
                const plan = completenessData?.planByBird.get(b.id) ?? null;
                const tasksCount = plan ? completenessData?.tasksByPlan.get(plan.id) ?? 0 : 0;
                const contacts = completenessData?.contactByBird.get(b.id) ?? null;
                const defaults = completenessData?.defaults ?? null;
                const completeness = computeSetupCompleteness({ bird: b, plan, tasksCount, contacts, defaults });
                const resumeStep = completeness.firstIncompleteStep ?? Math.max(2, Number(b.setup_step ?? 2));
                return (
                  <BirdCard key={b.id} bird={b} completeness={completeness} resumeStep={resumeStep} />
                );
              })}
            </div>
          )}
        </section>

        {/* Sit prompt — the one bright accent moment */}
        {birds.length > 0 && (
          <SitForm
            birds={birds}
            onCreated={refreshSits}
            initialOpen={!!newSit}
            preselectBirdId={preselectBirdId}
            activeSit={activeSit}
          />
        )}

        {birds.length > 0 && sits.length > 0 && (
          <section id="sits" className="scroll-mt-4 space-y-3">
            <h2 className="text-[21px] font-medium text-[#1a3d2e]">Sits</h2>
            {(sits as any[]).map((s) => {
              const sitBirds = (s.sit_birds ?? [])
                .map((sb: any) => birdLookup[sb.bird_id])
                .filter(Boolean);
              return <SitCard key={s.id} sit={s} birds={sitBirds} onChange={refreshSits} />;
            })}
          </section>
        )}

        {birds.length > 0 && <DefaultsPanel />}

        <AddToHomeScreenPrompt />
      </main>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:70px}`}</style>
    </div>
  );
}

function BirdCard({ bird, completeness, resumeStep }: { bird: any; completeness: any; resumeStep: number }) {
  const ready = completeness.pct >= 100;
  const missing = (completeness.checks ?? []).filter((c: any) => !c.done).map((c: any) => c.label);
  const needCount = missing.length;
  const initial = (bird.name?.slice(0, 1) ?? "?").toUpperCase();

  return (
    <div className="overflow-hidden rounded-[20px] bg-[#efe9da] shadow-sm">
      <Link to="/birds/$birdId" params={{ birdId: bird.id }} className="block active:scale-[0.99]">
        {/* Photo hero — a filled photo gets a 4:3 frame with a top-biased crop
            so a vertical bird stays in view. The empty state uses a shorter
            band with the bird's initial so it doesn't read as dead space. */}
        <div className={`relative grid w-full place-items-center bg-[#e3dcc9] ${bird.photo_url ? "aspect-[4/3]" : "h-24"}`}>
          {bird.photo_url ? (
            <img
              src={bird.photo_url}
              alt={bird.name}
              loading="lazy"
              style={{ objectPosition: bird.photo_position ?? "50% 20%" }}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <span className="flex items-center gap-2 text-[#2d6a4f]">
              <span className="text-3xl font-medium">{initial}</span>
              <Feather className="size-5 opacity-70" />
            </span>
          )}
          <span className="absolute left-3 top-3 rounded-full bg-white/[0.92] px-2.5 py-1 text-[11px] font-medium text-[#1a3d2e] shadow-sm">
            Care plan {completeness.pct}%
          </span>
        </div>
        {/* Name + readiness */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[18px] font-medium leading-tight text-[#1a3d2e]">{bird.name}</p>
              <p className="mt-0.5 text-sm text-[#5f5e5a]">{bird.species ?? "Parrot"}</p>
            </div>
            {ready ? (
              <span className="shrink-0 rounded-full bg-[#d6e8dc] px-3 py-1 text-xs font-medium text-[#1a5e3f]">Ready to share</span>
            ) : (
              <span className="shrink-0 rounded-full bg-[#f4e4c4] px-3 py-1 text-xs font-medium text-[#84600f]">Needs {needCount} {needCount === 1 ? "thing" : "things"}</span>
            )}
          </div>
        </div>
      </Link>
      {!ready && (
        <Link
          to="/birds/$birdId/setup"
          params={{ birdId: bird.id }}
          search={{ step: resumeStep }}
          aria-label={`Care plan ${completeness.pct}% complete — open setup at step ${resumeStep}`}
          className="block border-t border-[#e0d8c4] px-4 py-2.5 transition-colors hover:bg-black/[0.03]"
        >
          <p className="text-xs text-[#5f5e5a]">Add {missing.slice(0, 2).join(" and ").toLowerCase()} to be sitter-ready.</p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#e0d8c4]">
            <div className="h-full rounded-full bg-[#2d6a4f] transition-all" style={{ width: `${Math.max(4, completeness.pct)}%` }} />
          </div>
        </Link>
      )}
    </div>
  );
}

function SitForm({
  birds,
  onCreated,
  initialOpen = false,
  preselectBirdId,
  activeSit,
}: {
  birds: any[];
  onCreated: () => void;
  initialOpen?: boolean;
  preselectBirdId?: string;
  activeSit?: any;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(initialOpen);
  const initialSelection = preselectBirdId
    ? new Set([preselectBirdId])
    : new Set<string>(birds.length === 1 ? [birds[0].id] : []);
  const [selected, setSelected] = useState<Set<string>>(initialSelection);

  // When the dashboard is opened with ?newSit=1, auto-open the form once and
  // clear the search params so refreshes don't keep re-triggering it.
  useEffect(() => {
    if (initialOpen) {
      setOpen(true);
      navigate({ to: "/dashboard", search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1);
      track("sit_created", { bird_count: birdIds.length, days, has_email: !!sitterEmail });
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
    // Active-sit state — reflect rather than prompt.
    if (activeSit) {
      return (
        <div className="rounded-[20px] bg-[#cdeab0] p-5">
          <p className="text-lg font-medium text-[#1f3d12]">Sit active</p>
          <p className="mt-1 text-sm text-[#3f5e22]">A sit is underway right now. Your sitter has their private link.</p>
          <a href="#sits" className="mt-4 inline-flex items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">
            View details
          </a>
        </div>
      );
    }
    // The screen's one accent moment.
    return (
      <div className="relative overflow-hidden rounded-[20px] bg-[#cdeab0] p-5">
        <Feather className="pointer-events-none absolute -right-3 -top-3 size-20 rotate-12 text-[#1f3d12]/10" />
        <p className="text-lg font-medium text-[#1f3d12]">Going away soon?</p>
        <p className="mt-1 max-w-[18rem] text-sm text-[#3f5e22]">Create a sit and send your sitter a private link with everything they need.</p>
        <button onClick={() => setOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">
          <Plus className="size-4" /> New sit
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-[20px] bg-[#efe9da] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#1a3d2e]">New sit</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[#5f5e5a] underline">Cancel</button>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">Birds included</p>
          {birds.length > 1 && (
            <button type="button" onClick={selectAll} className="text-[11px] font-medium text-[#1a3d2e] underline">Select all</button>
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
                className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-sm ${on ? "border-[#2d6a4f] bg-[#e8f0ec]" : "border-[#e0d8c4] bg-white"}`}
              >
                <span className={`grid size-4 shrink-0 place-items-center rounded border-2 ${on ? "border-[#2d6a4f] bg-[#2d6a4f]" : "border-[#bcb6a3]"}`}>
                  {on && <svg viewBox="0 0 20 20" className="size-3 text-white"><path fill="currentColor" d="M7.629 13.314 4.4 10.085l1.214-1.214 2.015 2.015 5.757-5.757 1.214 1.214z"/></svg>}
                </span>
                <span className="truncate text-[#1a3d2e]">{b.name}</span>
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

      <button type="submit" disabled={saving} className="w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white disabled:opacity-50">
        {saving ? "Creating..." : "Create sit & generate link"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">{label}</span>
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
        <h2 className="text-[21px] font-medium text-[#1a3d2e]">Account emergency defaults</h2>
        <button
          type="button"
          onClick={() => { setD(defaults ?? {}); setOpen((o) => !o); }}
          className="text-sm font-medium text-[#1a3d2e] underline"
        >
          {open ? "Close" : filledCount > 0 ? "Edit" : "Set up"}
        </button>
      </div>
      <p className="text-xs text-[#5f5e5a]">
        Set owner phone, avian vet, and other emergency info <em>once</em>. Every bird inherits these unless its Emergency tab overrides a field.
      </p>
      {!open ? (
        <div className="rounded-[20px] bg-[#efe9da] p-4 text-xs text-[#5f5e5a]">
          {filledCount === 0
            ? "No defaults set yet — each bird needs its own contacts until you fill these in."
            : `${filledCount} of ${fields.length} default fields set.`}
        </div>
      ) : (
        <div className="space-y-3 rounded-[20px] bg-[#efe9da] p-4">
          {fields.map(([k, l, required]) => (
            <Field key={k} label={required ? `${l} *` : l}>
              <input
                className="input"
                value={d[k] ?? ""}
                onChange={(e) => setD({ ...d, [k]: e.target.value })}
              />
            </Field>
          ))}
          <button disabled={saving} onClick={save} className="mt-2 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving..." : "Save account defaults"}
          </button>
        </div>
      )}
    </section>
  );
}
