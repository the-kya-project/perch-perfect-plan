import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Check, X } from "lucide-react";
import { PhotoCropper } from "@/components/PhotoCropper";
import { OptionalDate } from "@/components/BirdPickers";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability } from "@/lib/useCapability";
import { signBirdPhoto, persistBirdPhoto } from "@/lib/birdPhoto";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { InkHero, Card, PrimaryButton } from "@/components/system";

export const Route = createFileRoute("/_authenticated/birds/$birdId/identity")({
  head: () => ({ meta: [{ title: "Identity — Kya & Co." }] }),
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
  is_foster: boolean | null;
  intake_date: string | null;
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

// Subject pronoun + its matching copy forms, derived ONCE from the bird's sex so
// the identity hero headline and the footer line always agree (the footer used
// to be hardcoded "she's"). Defaults to "they" when sex is unknown or null,
// matching the rest of the app's gender-neutral language for unknowns.
function birdPronoun(sex: string | null | undefined): { subject: string; be: string; contraction: string } {
  const s = (sex ?? "").trim().toLowerCase();
  if (s === "female") return { subject: "she", be: "is", contraction: "she's" };
  if (s === "male") return { subject: "he", be: "is", contraction: "he's" };
  return { subject: "they", be: "are", contraction: "they're" };
}

// Pronoun-aware identity hero — "Who she is on paper." / "Who he is on paper."
// / "Who they are on paper."
function identityHeadline(sex: string | null | undefined): string {
  const p = birdPronoun(sex);
  return `Who ${p.subject} ${p.be} on paper.`;
}

function IdentityFacet() {
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const role = useBirdRole(birdId);
  const isOwner = role === "owner"; // household members view identity read-only
  // Editing the bird's identity is part of managing the flock (RLS: birds → manage_flock).
  const canEditIdentity = useCapability("manage_flock", { birdId });

  const { data: bird } = useQuery({
    queryKey: ["bird-identity", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("owner_id, name, species, age, photo_url, photo_position, sex, sex_method, flight_status, birth_date, microchip, band_number, origin, acquired_on, is_foster, intake_date")
        .eq("id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data as Identity | null;
    },
  });

  const name = bird?.name ?? "this bird";
  // 800px — the SAME width the Home flock card / bird-record hero resolve at, so
  // the Identity circle gets byte-for-byte the same cropped image they do. A
  // smaller transform (e.g. 256) crops to a different effective aspect on this
  // bucket, which made the circle frame a different part of the bird than Home.
  const photoOf = useBirdPhotos([bird?.photo_url], 800);
  const photo = photoOf(bird?.photo_url);
  const initial = (bird?.name?.slice(0, 1) ?? "?").toUpperCase();

  // An edit here must show in Basics, the bird-record home, and the vet summary.
  const crossInvalidate = () =>
    ["bird-identity", "bird-basics", "bird", "bird-setup", "bird-record", "vet-bird"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k, birdId] }));

  const goBack = () => navigate({ to: "/birds/$birdId", params: { birdId } });

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          eyebrow="Identity"
          headline={identityHeadline(bird?.sex)}
          body="The part of the record that never changes."
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          trailingIcons={
            bird && !editing && canEditIdentity ? (
              <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[14px] font-[500] text-white active:bg-white/15">
                <Pencil className="size-3.5" /> Edit
              </button>
            ) : undefined
          }
        />

        <main className="space-y-4 px-5 pt-5">
          {!bird ? (
            <div className="h-40 animate-pulse rounded-[18px] bg-[var(--cream2)]" />
          ) : editing ? (
            <IdentityForm birdId={birdId} bird={bird} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); crossInvalidate(); }} />
          ) : (
            <>
              {/* Shared core (same birds columns the Basics tab edits) */}
              <Card className="flex items-center gap-4 p-4">
                {/* Same shared crop the flock card uses, so the circle frames
                    the bird's face (stored focal point, or top-biased default
                    for birds never repositioned) instead of centering on feet. */}
                <div className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--cream2)] ring-1 ring-[var(--line)]">
                  {photo ? (
                    <BirdPhotoCrop url={photo.url} original={photo.original} position={bird.photo_position ?? "50% 20%"} alt={name} />
                  ) : (
                    <span className="text-2xl font-[500] text-[var(--moss)]">{initial}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="t-item truncate text-[17px]">{bird.name}</p>
                  <p className="t-meta mt-0.5 truncate">{[bird.species || "Parrot", bird.age].filter(Boolean).join(" · ")}</p>
                </div>
              </Card>

              {/* Deeper record (Identity only) */}
              <Card>
                <Row label="Sex" value={sexValue(bird)} />
                <Row label="Flight" value={flightLabel(bird.flight_status)} />
                <Row label="Hatch date" value={bird.birth_date ? `${fmtDate(bird.birth_date)} (≈ ${approxAge(bird.birth_date)})` : null} />
                <Row label="Microchip" value={bird.microchip} />
                <Row label="Leg band" value={bird.band_number} emptyText="None" />
                <Row label="Origin" value={bird.origin} />
                <Row label="Came home" value={bird.acquired_on ? fmtDate(bird.acquired_on) : null} last />
              </Card>
              <p className="t-meta px-1 text-center leading-relaxed">
                These details build the vet summary and travel with {name} if {birdPronoun(bird.sex).contraction} ever rehomed.
              </p>
            </>
          )}
        </main>
      </div>
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
    <div className={`flex min-h-[44px] items-baseline gap-3 px-4 py-3 ${last ? "" : "border-b border-[var(--line2)]"}`}>
      <span className="t-eyebrow w-28 shrink-0 text-[var(--mute2)]">{label}</span>
      <span className={`min-w-0 flex-1 text-[14px] ${filled ? "text-[var(--ink)]" : "italic text-[var(--mute2)]"}`}>{filled ? value : emptyText}</span>
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
    is_foster: !!bird.is_foster,
    intake_date: bird.intake_date ?? "",
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
        is_foster: f.is_foster,
        intake_date: f.intake_date || null,
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
    <Card className="space-y-3 p-4">
      {/* Shared core: photo, name, species, age — same columns as the Basics tab */}
      <div className="flex items-start gap-3">
        {photoDisplay ? (
          <PhotoCropper src={photoDisplay} position={photoPosition ?? undefined} onChange={setPhotoPosition} size={96} />
        ) : (
          <div className="t-eyebrow grid size-24 place-items-center rounded-xl bg-[var(--cream2)] text-[var(--mute2)]">No photo</div>
        )}
        <div className="flex-1 space-y-2 pt-1">
          <label className={`inline-flex min-h-[44px] items-center rounded-lg bg-[var(--pale2)] px-3 text-[13px] font-[500] text-[var(--ink)] ${photoBusy ? "cursor-default opacity-60" : "cursor-pointer"}`}>
            {photoBusy ? "Processing…" : photoDisplay ? "Change photo" : "Add photo"}
            <input type="file" accept="image/*,.heic,.heif" disabled={photoBusy} className="hidden" onChange={onPhoto} />
          </label>
          {photoDisplay && (
            <button type="button" onClick={() => { setPhotoDisplay(null); setPhotoRef(null); setPhotoPosition(null); }} className="ml-2 text-[13px] font-[500] text-[var(--amber-ink)] underline">Remove</button>
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

      <div className="rounded-xl border border-[var(--line)] bg-[var(--cream2)] p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={f.is_foster} onChange={(e) => setF((p) => ({ ...p, is_foster: e.target.checked }))} className="mt-0.5 size-5 shrink-0 accent-[var(--ink)]" />
          <span className="min-w-0">
            <span className="t-item block">This is a foster</span>
            <span className="t-meta mt-0.5 block leading-relaxed">You're caring for them while they find a permanent home.</span>
          </span>
        </label>
        {f.is_foster && (
          <div className="mt-3 border-t border-[var(--line2)] pt-3">
            <Field label="Came to you"><input className={INPUT} type="date" max={today} value={f.intake_date} onChange={(e) => set("intake_date", e.target.value)} /></Field>
          </div>
        )}
      </div>

      <p className="t-meta">All fields are optional — partial records are fine.</p>

      <div className="flex gap-2 pt-1">
        <div className="flex-1">
          <PrimaryButton tone="ink" type="button" onPress={save} disabled={saving} icon={<Check className="size-4" />}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </div>
        <button type="button" onClick={onClose} disabled={saving} className="grid min-h-[44px] min-w-[44px] place-items-center rounded-[12px] border border-[var(--line)] px-4 text-[var(--mute)] disabled:opacity-50">
          <X className="size-4" />
        </button>
      </div>
    </Card>
  );
}

const INPUT = "h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--cream2)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--moss)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-[500] text-[var(--mute)]">{label}</span>
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
