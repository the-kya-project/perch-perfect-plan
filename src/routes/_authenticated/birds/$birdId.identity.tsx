import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Check, X } from "lucide-react";
import { PhotoCropper } from "@/components/PhotoCropper";
import { OptionalDate, ageLabel } from "@/components/BirdPickers";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability } from "@/lib/useCapability";
import { signBirdPhoto, persistBirdPhoto } from "@/lib/birdPhoto";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { InkHero, Card, PrimaryButton } from "@/components/system";
import { friendlyError } from "@/lib/errorMessage";
import { formatLocalDate } from "@/lib/dates";
import { localDateISO } from "@/lib/localDay";

export const Route = createFileRoute("/_authenticated/birds/$birdId/identity")({
  head: () => ({ meta: [{ title: i18next.t("birdIdentity.metaTitle", "Identity — Kya & Co.") }] }),
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

function sexLabel(t: TFunction, v: string): string {
  switch (v) {
    case "female": return t("birdSetup.female", "Female");
    case "male": return t("birdSetup.male", "Male");
    case "unknown": return t("birdSetup.unknown", "Unknown");
    default: return v;
  }
}
function methodLabel(t: TFunction, v: string): string {
  switch (v) {
    case "dna": return t("birdIdentity.methodDnaConfirmed", "DNA confirmed");
    case "surgical": return t("birdIdentity.methodSurgicallySexed", "Surgically sexed");
    case "visual": return t("birdIdentity.methodVisual", "Visual");
    default: return "";
  }
}
function flightLabel(t: TFunction, v: string | null | undefined): string | null {
  const k = (v ?? "").trim();
  if (!k || k === "unknown") return null; // hide the row when unset / Unknown
  switch (k) {
    case "fully_flighted": return t("birdSetup.fullyFlighted", "Fully flighted");
    case "clipped": return t("birdSetup.clipped", "Clipped");
    case "partially_clipped": return t("birdSetup.partiallyClipped", "Partially clipped");
    default: return null;
  }
}
const blank = (v: string | null | undefined) => !((v ?? "").trim());

// Footer copy is pronoun-aware from the bird's sex (she's / he's / they're),
// one whole-sentence key per pronoun so translations can inflect freely.
// Defaults to "they" when sex is unknown or null.

function IdentityFacet() {
  const { t } = useTranslation();
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

  const name = bird?.name ?? t("planEditor.thisBird", "this bird");
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
          eyebrow={t("birdIdentity.eyebrow", "Identity")}
          headline={t("birdIdentity.headline", "{{name}}, on paper.", { name })}
          body={t("birdIdentity.body", "The details that make {{name}} officially {{name}}.", { name })}
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          trailingIcons={
            bird && !editing && canEditIdentity ? (
              <button type="button" onClick={() => setEditing(true)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[14px] font-[500] text-white active:bg-white/15">
                <Pencil className="size-3.5" /> {t("birdIdentity.edit", "Edit")}
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
                  <p className="t-meta mt-0.5 truncate">{[bird.species || t("planEditor.parrot", "Parrot"), bird.age ? ageLabel(t, bird.age) : null].filter(Boolean).join(" · ")}</p>
                </div>
              </Card>

              {/* Deeper record (Identity only) */}
              <Card>
                <Row label={t("birdSetup.sex", "Sex")} value={sexValue(t, bird)} />
                <Row label={t("birdSetup.flight", "Flight")} value={flightLabel(t, bird.flight_status)} />
                <Row label={t("birdPickers.hatchDate", "Hatch date")} value={bird.birth_date ? `${fmtDate(bird.birth_date)} (≈ ${approxAge(t, bird.birth_date)})` : null} />
                <Row label={t("birdIdentity.microchip", "Microchip")} value={bird.microchip} />
                <Row label={t("birdIdentity.legBand", "Leg band")} value={bird.band_number} emptyText={t("birdIdentity.none", "None")} />
                <Row label={t("birdIdentity.origin", "Origin")} value={bird.origin} />
                <Row label={t("birdIdentity.cameHome", "Came home")} value={bird.acquired_on ? fmtDate(bird.acquired_on) : null} last />
              </Card>
              <p className="t-meta px-1 text-center leading-relaxed">
                {(() => {
                  const s = (bird.sex ?? "").trim().toLowerCase();
                  return s === "female"
                    ? t("birdIdentity.footerFemale", "These details build the vet summary and travel with {{name}} if she's ever rehomed.", { name })
                    : s === "male"
                      ? t("birdIdentity.footerMale", "These details build the vet summary and travel with {{name}} if he's ever rehomed.", { name })
                      : t("birdIdentity.footerOther", "These details build the vet summary and travel with {{name}} if they're ever rehomed.", { name });
                })()}
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function sexValue(t: TFunction, b: Identity): string | null {
  if (blank(b.sex)) return null;
  const sex = sexLabel(t, b.sex!);
  const method = b.sex_method ? methodLabel(t, b.sex_method) : "";
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
  const { t } = useTranslation();
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
      if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) { toast.error(t("birdIdentity.photoTooLarge", "That photo's a bit too large even after resizing. Try a different one.")); return; }
      setPhotoDisplay(dataUrl);
      setPhotoRef(dataUrl);
    } catch {
      toast.error(t("newBird.photoProcessError", "Couldn't process that photo. Try a different one."));
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
      toast.success(t("birdIdentity.saved", "Identity saved."));
      onSaved();
    } catch (e: any) {
      toast.error(friendlyError(e, t("birdIdentity.saveFailed", "Couldn't save.")));
    } finally {
      setSaving(false);
    }
  }

  const today = localDateISO();
  return (
    <Card className="space-y-3 p-4">
      {/* Shared core: photo, name, species, age — same columns as the Basics tab */}
      <div className="flex items-start gap-3">
        {photoDisplay ? (
          <PhotoCropper src={photoDisplay} position={photoPosition ?? undefined} onChange={setPhotoPosition} size={96} />
        ) : (
          <div className="t-eyebrow grid size-24 place-items-center rounded-xl bg-[var(--cream2)] text-[var(--mute2)]">{t("birdSetup.noPhoto", "No photo")}</div>
        )}
        <div className="flex-1 space-y-2 pt-1">
          <label className={`inline-flex min-h-[44px] items-center rounded-lg bg-[var(--pale2)] px-3 text-[13px] font-[500] text-[var(--ink)] ${photoBusy ? "cursor-default opacity-60" : "cursor-pointer"}`}>
            {photoBusy ? t("birdSetup.processing", "Processing…") : photoDisplay ? t("birdSetup.changePhoto", "Change photo") : t("birdSetup.addPhoto", "Add photo")}
            <input type="file" accept="image/*,.heic,.heif" disabled={photoBusy} className="hidden" onChange={onPhoto} />
          </label>
          {photoDisplay && (
            <button type="button" onClick={() => { setPhotoDisplay(null); setPhotoRef(null); setPhotoPosition(null); }} className="ml-2 text-[13px] font-[500] text-[var(--amber-ink)] underline">{t("newBird.remove", "Remove")}</button>
          )}
        </div>
      </div>

      <Field label={t("birdSetup.name", "Name")}><input className={INPUT} value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label={t("birdPickers.species", "Species")}><input className={INPUT} value={f.species} maxLength={80} onChange={(e) => set("species", e.target.value)} /></Field>
      <Field label={t("birdPickers.age", "Age")}><input className={INPUT} value={f.age} maxLength={40} placeholder={t("birdIdentity.agePlaceholder", "e.g. 6 years")} onChange={(e) => set("age", e.target.value)} /></Field>

      <Field label={t("birdSetup.sex", "Sex")}>
        <div className="grid grid-cols-2 gap-2">
          <select className={INPUT} value={f.sex} onChange={(e) => set("sex", e.target.value)}>
            <option value="">{t("birdIdentity.notSet", "Not set")}</option>
            <option value="female">{t("birdSetup.female", "Female")}</option>
            <option value="male">{t("birdSetup.male", "Male")}</option>
            <option value="unknown">{t("birdSetup.unknown", "Unknown")}</option>
          </select>
          <select className={INPUT} value={f.sex_method} onChange={(e) => set("sex_method", e.target.value)}>
            <option value="">{t("birdIdentity.methodPlaceholder", "Method…")}</option>
            <option value="dna">{t("birdIdentity.methodDna", "DNA")}</option>
            <option value="surgical">{t("birdIdentity.methodSurgical", "Surgical")}</option>
            <option value="visual">{t("birdIdentity.methodVisual", "Visual")}</option>
            <option value="unknown">{t("birdSetup.unknown", "Unknown")}</option>
          </select>
        </div>
      </Field>

      <Field label={t("birdSetup.flight", "Flight")}>
        <select className={INPUT} value={f.flight_status} onChange={(e) => set("flight_status", e.target.value)}>
          <option value="unknown">{t("birdSetup.unknown", "Unknown")}</option>
          <option value="fully_flighted">{t("birdSetup.fullyFlighted", "Fully flighted")}</option>
          <option value="clipped">{t("birdSetup.clipped", "Clipped")}</option>
          <option value="partially_clipped">{t("birdSetup.partiallyClipped", "Partially clipped")}</option>
        </select>
      </Field>

      <Field label={t("birdPickers.hatchDate", "Hatch date")}>
        <OptionalDate value={f.birth_date} max={today} addLabel={t("birdPickers.addHatchDate", "Add hatch date")} inputClassName={INPUT} onChange={(v) => set("birth_date", v)} />
      </Field>
      <Field label={t("birdIdentity.microchip", "Microchip")}><input className={INPUT} value={f.microchip} maxLength={60} onChange={(e) => set("microchip", e.target.value)} /></Field>
      <Field label={t("birdIdentity.legBand", "Leg band")}><input className={INPUT} value={f.band_number} maxLength={60} onChange={(e) => set("band_number", e.target.value)} /></Field>
      <Field label={t("birdIdentity.origin", "Origin")}><input className={INPUT} value={f.origin} maxLength={200} placeholder={t("birdIdentity.originPlaceholder", "e.g. captive-bred, wild-hatched / rescued")} onChange={(e) => set("origin", e.target.value)} /></Field>
      <Field label={t("birdIdentity.cameHome", "Came home")}>
        <OptionalDate value={f.acquired_on} max={today} addLabel={t("birdPickers.addDate", "Add date")} inputClassName={INPUT} onChange={(v) => set("acquired_on", v)} />
      </Field>

      <div className="rounded-xl border border-[var(--line)] bg-[var(--cream2)] p-3">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={f.is_foster} onChange={(e) => setF((p) => ({ ...p, is_foster: e.target.checked }))} className="mt-0.5 size-5 shrink-0 accent-[var(--ink)]" />
          <span className="min-w-0">
            <span className="t-item block">{t("newBird.isFoster", "This is a foster")}</span>
            <span className="t-meta mt-0.5 block leading-relaxed">{t("birdIdentity.fosterBody", "You're caring for them while they find a permanent home.")}</span>
          </span>
        </label>
        {f.is_foster && (
          <div className="mt-3 border-t border-[var(--line2)] pt-3">
            <Field label={t("newBird.cameToYou", "Came to you")}><OptionalDate value={f.intake_date} max={today} addLabel={t("birdPickers.addDate", "Add date")} inputClassName={INPUT} onChange={(v) => set("intake_date", v)} /></Field>
          </div>
        )}
      </div>

      <p className="t-meta">{t("birdIdentity.allOptional", "All fields are optional — partial records are fine.")}</p>

      <div className="flex gap-2 pt-1">
        <div className="flex-1">
          <PrimaryButton tone="ink" type="button" onPress={save} disabled={saving} icon={<Check className="size-4" />}>
            {saving ? t("birdIdentity.saving", "Saving…") : t("birdIdentity.save", "Save")}
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
  return formatLocalDate(new Date(`${iso}T12:00:00`), { year: "numeric", month: "short", day: "numeric" });
}

function approxAge(t: TFunction, iso: string): string {
  const days = Math.floor((Date.now() - +new Date(`${iso}T12:00:00`)) / 86_400_000);
  if (days < 0) return "—";
  const years = Math.floor(days / 365);
  if (years >= 1) return years === 1 ? t("birdPickers.ageYearsOne", "{{n}} year", { n: years }) : t("birdPickers.ageYearsOther", "{{n}} years", { n: years });
  const months = Math.floor(days / 30);
  if (months >= 1) return months === 1 ? t("birdIdentity.monthsOne", "{{n}} month", { n: months }) : t("birdIdentity.monthsOther", "{{n}} months", { n: months });
  return days === 1 ? t("birdIdentity.daysOne", "{{n}} day", { n: days }) : t("birdIdentity.daysOther", "{{n}} days", { n: days });
}
