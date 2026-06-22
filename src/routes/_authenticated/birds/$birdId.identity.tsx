import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, IdCard, Pencil, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/birds/$birdId/identity")({
  head: () => ({ meta: [{ title: "Identity — Parrot Care Co-Pilot" }] }),
  component: IdentityFacet,
});

type Identity = {
  name: string;
  species: string | null;
  sex: string | null;
  sex_method: string | null;
  birth_date: string | null;   // reused as hatch date
  microchip: string | null;
  band_number: string | null;
  origin: string | null;
  acquired_on: string | null;
};

const SEX_LABEL: Record<string, string> = { female: "Female", male: "Male", unknown: "Unknown" };
const METHOD_LABEL: Record<string, string> = { dna: "DNA confirmed", surgical: "Surgically sexed", visual: "Visual", unknown: "" };
const blank = (v: string | null | undefined) => !((v ?? "").trim());

function IdentityFacet() {
  const { birdId } = Route.useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: bird } = useQuery({
    queryKey: ["bird-identity", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("name, species, sex, sex_method, birth_date, microchip, band_number, origin, acquired_on")
        .eq("id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data as Identity | null;
    },
  });

  const name = bird?.name ?? "this bird";
  const hasAny = bird && [bird.species, bird.sex, bird.birth_date, bird.microchip, bird.band_number, bird.origin, bird.acquired_on].some((v) => !blank(v));

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/birds/$birdId" params={{ birdId }} aria-label="Back to bird record" className="-ml-1 rounded p-1 text-[#1a3d2e]">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 text-base font-medium text-[#1a3d2e]">Identity</h1>
          {bird && !editing && (
            <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#e8f0ec] px-3.5 text-sm font-medium text-[#1a3d2e]">
              <Pencil className="size-3.5" /> Edit
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {!bird ? (
          <div className="h-40 animate-pulse rounded-[16px] bg-[#efe9da]" />
        ) : editing ? (
          <IdentityForm birdId={birdId} bird={bird} onClose={() => setEditing(false)} onSaved={() => {
            setEditing(false);
            qc.invalidateQueries({ queryKey: ["bird-identity", birdId] });
            qc.invalidateQueries({ queryKey: ["vet-bird", birdId] });   // feeds the vet summary
            qc.invalidateQueries({ queryKey: ["bird-record", birdId] }); // record-home identity strip
          }} />
        ) : !hasAny ? (
          <section className="rounded-[16px] bg-[#efe9da] p-8 text-center">
            <IdCard className="mx-auto size-7 text-[#2d6a4f]" />
            <p className="mt-3 text-sm text-[#1a3d2e]">Who is {name}, on paper? Microchip and band, sex, hatch date, and where they came from.</p>
            <button type="button" onClick={() => setEditing(true)} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-5 text-sm font-medium text-white">
              <Pencil className="size-4" /> Add identity details
            </button>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-[16px] bg-white ring-1 ring-[#e3dcc9]">
              <Row label="Species" value={bird.species} />
              <Row label="Sex" value={sexValue(bird)} />
              <Row label="Hatch date" value={bird.birth_date ? `${fmtDate(bird.birth_date)} (≈ ${approxAge(bird.birth_date)})` : null} />
              <Row label="Microchip" value={bird.microchip} />
              <Row label="Leg band" value={bird.band_number} emptyText="None" />
              <Row label="Origin" value={bird.origin} />
              <Row label="Came home" value={bird.acquired_on ? fmtDate(bird.acquired_on) : null} last />
            </section>
            <p className="px-1 text-xs leading-relaxed text-[#8a897f]">
              These details build the vet summary and travel with {name} if she's ever rehomed.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function sexValue(b: Identity): string | null {
  if (blank(b.sex)) return null;
  const sex = SEX_LABEL[b.sex!] ?? b.sex!;
  const method = b.sex_method ? METHOD_LABEL[b.sex_method] : "";
  return method ? `${sex} · ${method}` : sex;
}

function Row({ label, value, emptyText = "—", last }: { label: string; value: string | null | undefined; emptyText?: string; last?: boolean }) {
  const filled = !blank(value);
  return (
    <div className={`flex items-baseline gap-3 px-4 py-3 ${last ? "" : "border-b border-[#ece6d6]"}`}>
      <span className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-[#8a897f]">{label}</span>
      <span className={`min-w-0 flex-1 text-sm ${filled ? "text-[#1a3d2e]" : "italic text-[#9a978c]"}`}>{filled ? value : emptyText}</span>
    </div>
  );
}

function IdentityForm({ birdId, bird, onClose, onSaved }: { birdId: string; bird: Identity; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    species: bird.species ?? "",
    sex: bird.sex ?? "",
    sex_method: bird.sex_method ?? "",
    birth_date: bird.birth_date ?? "",
    microchip: bird.microchip ?? "",
    band_number: bird.band_number ?? "",
    origin: bird.origin ?? "",
    acquired_on: bird.acquired_on ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const clean = (v: string) => (v.trim() ? v.trim() : null);
      const { error } = await supabase.from("birds").update({
        species: clean(f.species),
        sex: clean(f.sex),
        sex_method: clean(f.sex_method),
        birth_date: f.birth_date || null,
        microchip: clean(f.microchip),
        band_number: clean(f.band_number),
        origin: clean(f.origin),
        acquired_on: f.acquired_on || null,
      } as any).eq("id", birdId);
      if (error) throw error;
      toast.success("Identity saved.");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="space-y-3 rounded-[16px] bg-white p-4 ring-1 ring-[#e3dcc9]">
      <Field label="Species"><input className={INPUT} value={f.species} maxLength={80} onChange={(e) => set("species", e.target.value)} /></Field>

      <Field label="Sex">
        <div className="grid grid-cols-2 gap-2">
          <select className={INPUT} value={f.sex} onChange={(e) => set("sex", e.target.value)}>
            <option value="">Not set</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="unknown">Unknown</option>
          </select>
          <select className={INPUT} value={f.sex_method} onChange={(e) => set("sex_method", e.target.value)}>
            <option value="">Method…</option>
            <option value="dna">DNA</option>
            <option value="surgical">Surgical</option>
            <option value="visual">Visual</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
      </Field>

      <Field label="Hatch date"><input type="date" className={INPUT} value={f.birth_date} max={today} onChange={(e) => set("birth_date", e.target.value)} /></Field>
      <Field label="Microchip"><input className={INPUT} value={f.microchip} maxLength={60} onChange={(e) => set("microchip", e.target.value)} /></Field>
      <Field label="Leg band"><input className={INPUT} value={f.band_number} maxLength={60} onChange={(e) => set("band_number", e.target.value)} /></Field>
      <Field label="Origin"><input className={INPUT} value={f.origin} maxLength={200} placeholder="e.g. captive-bred, wild-hatched / rescued" onChange={(e) => set("origin", e.target.value)} /></Field>
      <Field label="Came home"><input type="date" className={INPUT} value={f.acquired_on} max={today} onChange={(e) => set("acquired_on", e.target.value)} /></Field>

      <p className="text-[11px] text-[#8a897f]">All fields are optional — partial records are fine.</p>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={save} disabled={saving} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-[#1a3d2e] text-sm font-medium text-white disabled:opacity-50">
          <Check className="size-4" /> {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onClose} disabled={saving} className="min-h-[44px] rounded-[14px] border border-[#c8bfa6] px-4 text-sm font-medium text-[#5f5e5a]">
          <X className="size-4" />
        </button>
      </div>
    </section>
  );
}

const INPUT = "h-11 w-full rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] px-3 text-sm text-[#1a3d2e] outline-none focus:border-[#2d6a4f]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">{label}</span>
      {children}
    </label>
  );
}

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function approxAge(iso: string): string {
  const days = Math.floor((Date.now() - +new Date(`${iso}T12:00:00`)) / 86_400_000);
  if (days < 0) return "—";
  const years = Math.floor(days / 365);
  if (years >= 1) return `${years} year${years === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  if (months >= 1) return `${months} month${months === 1 ? "" : "s"}`;
  return `${days} day${days === 1 ? "" : "s"}`;
}
