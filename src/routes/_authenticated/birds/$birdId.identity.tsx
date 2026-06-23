import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Check, X } from "lucide-react";
import { PhotoCropper } from "@/components/PhotoCropper";
import { OptionalDate } from "@/components/BirdPickers";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { signBirdPhoto, persistBirdPhoto } from "@/lib/birdPhoto";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";

export const Route = createFileRoute("/_authenticated/birds/$birdId/identity")({
  head: () => ({ meta: [{ title: "Identity — Parrot Care Co-Pilot" }] }),
  component: IdentityFacet,
});

type Identity = {
  owner_id: string;
  name: string;
  species: string | null;
  age: string | null;
  photo_url: string | null;
  photo_position: string | null;
  sex: string | null;
  sex_method: string | null;
  flight_status: string | null;
  birth_date: string | null;   // reused as hatch date
  microchip: string | null;
  band_number: string | null;
  origin: string | null;
  acquired_on: string | null;
};

// Shared core (photo, name, species, age) lives in the same birds columns the
// Basics tab edits — one source, two views. The deeper fields below stay here.

const SEX_LABEL: Record<string, string> = { female: "Female", male: "Male", unknown: "Unknown" };
const METHOD_LABEL: Record<string, string> = { dna: "DNA confirmed", surgical: "Surgically sexed", visual: "Visual", unknown: "" };
const FLIGHT_LABEL: Record<string, string> = { fully_flighted: "Fully flighted", clipped: "Clipped", partially_clipped: "Partially clipped", unknown: "Unknown" };
function flightLabel(v: string | null | undefined): string | null {
  const k = (v ?? "").trim();
  if (!k || k === "unknown") return null; // hide the row when unset / Unknown
  return FLIGHT_LABEL[k] ?? null;
}
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
        .select("owner_id, name, species, age, photo_url, photo_position, sex, sex_method, flight_status, birth_date, microchip, band_number, origin, acquired_on")
        .eq("id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data as Identity | null;
    },
  });

  const name = bird?.name ?? "this bird";
  const photoOf = useBirdPhotos([bird?.photo_url], 96);
  const photo = photoOf(bird?.photo_url);
  const initial = (bird?.name?.slice(0, 1) ?? "?").toUpperCase();

  // An edit here must show in Basics, the bird-record home, and the vet summary.
  const crossInvalidate = () =>
    ["bird-identity", "bird-basics", "bird", "bird-setup", "bird-record", "vet-bird"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k, birdId] }));

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
          <IdentityForm birdId={birdId} bird={bird} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); crossInvalidate(); }} />
        ) : (
          <>
            {/* Shared core (same birds columns the Basics tab edits) */}
            <section className="flex items-center gap-4 rounded-[16px] bg-white p-4 ring-1 ring-[#e3dcc9]">
              <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e3dcc9] ring-1 ring-[#d8cfb8]">
                {photo ? (
                  <img src={photo.url} alt={name} onError={(e) => { if (photo.original && e.currentTarget.src !== photo.original) e.currentTarget.src = photo.original; }} style={{ objectPosition: bird.photo_position ?? "50% 20%" }} className="size-full object-cover" />
                ) : (
                  <span className="text-2xl font-medium text-[#2d6a4f]">{initial}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-medium text-[#1a3d2e]">{bird.name}</p>
                <p className="mt-0.5 truncate text-sm text-[#5f5e5a]">{[bird.species || "Parrot", bird.age].filter(Boolean).join(" · ")}</p>
              </div>
            </section>

            {/* Deeper record (Identity only) */}
            <section className="overflow-hidden rounded-[16px] bg-white ring-1 ring-[#e3dcc9]">
              <Row label="Sex" value={sexValue(bird)} />
              <Row label="Flight" value={flightLabel(bird.flight_status)} />
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
    name: bird.name ?? "",
    species: bird.species ?? "",
    age: bird.age ?? "",
    sex: bird.sex ?? "",
    sex_method: bird.sex_method ?? "",
    flight_status: bird.flight_status ?? "unknown",
    birth_date: bird.birth_date ?? "",
    microchip: bird.microchip ?? "",
    band_number: bird.band_number ?? "",
    origin: bird.origin ?? "",
    acquired_on: bird.acquired_on ?? "",
  });
  // Photo: display value (signed/data URL) vs the value to persist (path/data/null).
  const [photoDisplay, setPhotoDisplay] = useState<string | null>(null);
  const [photoRef, setPhotoRef] = useState<string | null>(bird.photo_url ?? null);
  const [photoPosition, setPhotoPosition] = useState<string | null>(bird.photo_position ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => { signBirdPhoto(bird.photo_url).then(setPhotoDisplay); }, [bird.photo_url]);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) { toast.error("That photo's a bit too large even after resizing. Try a different one."); return; }
      setPhotoDisplay(dataUrl);
      setPhotoRef(dataUrl);
    } catch {
      toast.error("Couldn't process that photo. Try a different one.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const clean = (v: string) => (v.trim() ? v.trim() : null);
      let ref = photoRef;
      if (typeof ref === "string" && ref.startsWith("data:")) ref = await persistBirdPhoto(bird.owner_id, ref);
      const { error } = await supabase.from("birds").update({
        name: clean(f.name) ?? bird.name, // name is required — keep the old one if blanked
        species: clean(f.species),
        age: clean(f.age),
        sex: clean(f.sex),
        sex_method: clean(f.sex_method),
        flight_status: f.flight_status || "unknown",
        birth_date: f.birth_date || null,
        microchip: clean(f.microchip),
        band_number: clean(f.band_number),
        origin: clean(f.origin),
        acquired_on: f.acquired_on || null,
        photo_url: ref,
        photo_position: photoPosition,
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
      {/* Shared core: photo, name, species, age — same columns as the Basics tab */}
      <div className="flex items-start gap-3">
        {photoDisplay ? (
          <PhotoCropper src={photoDisplay} position={photoPosition ?? undefined} onChange={setPhotoPosition} size={96} />
        ) : (
          <div className="grid size-24 place-items-center rounded-xl bg-[#efe9da] text-[10px] uppercase tracking-wider text-[#8a897f]">No photo</div>
        )}
        <div className="flex-1 space-y-2 pt-1">
          <label className={`inline-block rounded-lg bg-[#e8f0ec] px-3 py-1.5 text-xs font-semibold text-[#1a3d2e] ${photoBusy ? "cursor-default opacity-60" : "cursor-pointer"}`}>
            {photoBusy ? "Processing…" : photoDisplay ? "Change photo" : "Add photo"}
            <input type="file" accept="image/*,.heic,.heif" disabled={photoBusy} className="hidden" onChange={onPhoto} />
          </label>
          {photoDisplay && (
            <button type="button" onClick={() => { setPhotoDisplay(null); setPhotoRef(null); setPhotoPosition(null); }} className="ml-2 text-xs font-semibold text-[#854F0B] underline">Remove</button>
          )}
        </div>
      </div>

      <Field label="Name"><input className={INPUT} value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Species"><input className={INPUT} value={f.species} maxLength={80} onChange={(e) => set("species", e.target.value)} /></Field>
      <Field label="Age"><input className={INPUT} value={f.age} maxLength={40} placeholder="e.g. 6 years" onChange={(e) => set("age", e.target.value)} /></Field>

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

      <Field label="Flight">
        <select className={INPUT} value={f.flight_status} onChange={(e) => set("flight_status", e.target.value)}>
          <option value="unknown">Unknown</option>
          <option value="fully_flighted">Fully flighted</option>
          <option value="clipped">Clipped</option>
          <option value="partially_clipped">Partially clipped</option>
        </select>
      </Field>

      <Field label="Hatch date">
        <OptionalDate value={f.birth_date} max={today} addLabel="Add hatch date" inputClassName={INPUT} onChange={(v) => set("birth_date", v)} />
      </Field>
      <Field label="Microchip"><input className={INPUT} value={f.microchip} maxLength={60} onChange={(e) => set("microchip", e.target.value)} /></Field>
      <Field label="Leg band"><input className={INPUT} value={f.band_number} maxLength={60} onChange={(e) => set("band_number", e.target.value)} /></Field>
      <Field label="Origin"><input className={INPUT} value={f.origin} maxLength={200} placeholder="e.g. captive-bred, wild-hatched / rescued" onChange={(e) => set("origin", e.target.value)} /></Field>
      <Field label="Came home">
        <OptionalDate value={f.acquired_on} max={today} addLabel="Add date" inputClassName={INPUT} onChange={(v) => set("acquired_on", v)} />
      </Field>

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
