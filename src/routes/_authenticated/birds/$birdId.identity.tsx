import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { speciesLabel } from "@/lib/speciesLabel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { PhotoCropper } from "@/components/PhotoCropper";
import { OptionalDate } from "@/components/BirdPickers";
import { birdAgeLabel } from "@/lib/birdAge";
import { ageFromBirthDate } from "@/lib/parrot-data";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useCapability } from "@/lib/useCapability";
import { signBirdPhoto, persistBirdPhoto } from "@/lib/birdPhoto";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { K, KyaPage, KyaBody, KyaCard, KyaField, KyaHeading, KyaLink, KyaPrimaryButton, KyaSecondaryButton } from "@/components/kya";
import { PageHeader, TaskHeader, useGoBack, useLeaveGuard } from "@/components/headers";
import { friendlyError } from "@/lib/errorMessage";
import { LoadError } from "@/components/LoadError";
import { useLoadState } from "@/lib/useTooLong";
import { formatLocalDate } from "@/lib/dates";
import { localDateISO } from "@/lib/localDay";
import { ownerIntakeDate } from "@/lib/intakeDate";

type IdentitySearch = { edit?: 1 };

export const Route = createFileRoute("/_authenticated/birds/$birdId/identity")({
  head: () => ({ meta: [{ title: i18next.t("birdIdentity.metaTitle", "Identity — Kya & Co.") }] }),
  // ?edit=1 opens the edit form straight away (the vet summary's
  // "Missing from [bird]'s record → Add them" link lands here).
  validateSearch: (search: Record<string, unknown>): IdentitySearch => {
    const e = search.edit;
    return e === 1 || e === "1" || e === true ? { edit: 1 } : {};
  },
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
  /** 'auto' = set by the app, not the owner: never shown (src/lib/intakeDate.ts). */
  intake_date_source: string | null;
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
  if (!k || k === "unknown") return null; // unset / Unknown reads as not added
  switch (k) {
    case "fully_flighted": return t("birdSetup.fullyFlighted", "Fully flighted");
    case "clipped": return t("birdSetup.clipped", "Clipped");
    case "partially_clipped": return t("birdSetup.partiallyClipped", "Partially clipped");
    default: return null;
  }
}
const blank = (v: string | null | undefined) => !((v ?? "").trim());

function IdentityFacet() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  // Editing the bird's identity is part of managing the flock (RLS: birds → manage_flock).
  // Household members without it view identity read-only.
  const canEditIdentity = useCapability("manage_flock", { birdId });

  const birdQ = useQuery({
    queryKey: ["bird-identity", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("owner_id, name, species, age, photo_url, photo_position, sex, sex_method, flight_status, birth_date, microchip, band_number, origin, acquired_on, is_foster, intake_date, intake_date_source")
        .eq("id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data as Identity | null;
    },
  });
  const { data: bird } = birdQ;
  // null = the bird is gone or no longer shared with you (no retry); a failed
  // or stalled request gets "Try again". Neither pulses forever.
  const load = useLoadState([birdQ]);
  const birdMissing = birdQ.isSuccess && !bird;

  // ?edit=1 → open the form once the bird and the permission have loaded,
  // then drop the param so a refresh or back doesn't reopen it.
  const editApplied = useRef(false);
  useEffect(() => {
    if (!search.edit || editApplied.current || !bird || !canEditIdentity) return;
    editApplied.current = true;
    setEditing(true);
    navigate({ to: "/birds/$birdId/identity", params: { birdId }, search: {}, replace: true });
  }, [search.edit, bird, canEditIdentity, navigate, birdId]);

  const name = bird?.name ?? t("planEditor.thisBird", "this bird");
  // 800px — the SAME width the Home flock card / bird-record hero resolve at, so
  // the Identity photo gets byte-for-byte the same cropped image they do. A
  // smaller transform (e.g. 256) crops to a different effective aspect on this
  // bucket, which made the tile frame a different part of the bird than Home.
  const photoOf = useBirdPhotos([bird?.photo_url], 800);
  const photo = photoOf(bird?.photo_url);
  const initial = (bird?.name?.slice(0, 1) ?? "?").toUpperCase();

  // An edit here must show in Basics, the bird-record home, and the vet summary.
  const crossInvalidate = () =>
    ["bird-identity", "bird-basics", "bird", "bird-setup", "bird-record", "vet-bird"].forEach((k) =>
      qc.invalidateQueries({ queryKey: [k, birdId] }));

  const goBack = useGoBack(useCallback(() => navigate({ to: "/birds/$birdId", params: { birdId } }), [navigate, birdId]));
  const canEdit = !!bird && canEditIdentity;
  const openEdit = canEdit ? () => setEditing(true) : undefined;
  // Editing is a task: Close top left, and "Leave without saving?" when
  // something has changed. The form reports whether it has.
  const [formDirty, setFormDirty] = useState(false);
  const stopEditing = useCallback(() => { setEditing(false); setFormDirty(false); }, []);
  const { requestClose, guard: leaveGuard } = useLeaveGuard(formDirty, stopEditing);

  const sex = (bird?.sex ?? "").trim().toLowerCase();
  const footnote = sex === "female"
    ? t("birdIdentity.footnoteFemale", "These details build {{name}}'s vet summary and go with her if she's ever rehomed.", { name })
    : sex === "male"
      ? t("birdIdentity.footnoteMale", "These details build {{name}}'s vet summary and go with him if he's ever rehomed.", { name })
      : t("birdIdentity.footnoteOther", "These details build {{name}}'s vet summary and go with them if they're ever rehomed.", { name });

  return (
    <KyaPage>
      {editing && bird ? (
        <TaskHeader
          onClose={requestClose}
          title={t("birdIdentity.editTitleNamed", "Edit {{name}}'s identity", { name: bird.name })}
        />
      ) : (
        <PageHeader
          onBack={goBack}
          title={bird ? t("birdIdentity.title", "{{name}}'s identity", { name: bird.name }) : t("birdIdentity.titleFallback", "Identity")}
          line={t("birdIdentity.body", "The details that make {{name}} officially {{name}}.", { name })}
          action={canEdit && !editing ? { label: t("birdIdentity.edit", "Edit"), icon: <Pencil className="size-4" />, onClick: () => setEditing(true) } : undefined}
        />
      )}
      {leaveGuard}

      <KyaBody>
        {birdMissing || load.failed ? (
          <LoadError
            missing={birdMissing}
            onRetry={load.retry}
            onBack={birdMissing ? () => navigate({ to: "/dashboard" }) : undefined}
            backLabel={birdMissing ? t("loadError.backHome", "Back to home") : undefined}
          />
        ) : !bird ? (
          <div className="h-40 animate-pulse rounded-[20px] bg-white/70" />
        ) : editing ? (
          <IdentityForm birdId={birdId} bird={bird} onClose={requestClose} onDirtyChange={setFormDirty} onSaved={() => { stopEditing(); crossInvalidate(); }} />
        ) : (
          <>
            {/* Shared core (same birds columns the Basics tab edits) */}
            <KyaCard className="flex items-center gap-3 p-4">
              {/* Same shared crop the flock card uses, so the tile frames the
                  bird's face (stored focal point, or top-biased default for
                  birds never repositioned) instead of centering on feet. */}
              <div className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-[16px]" style={{ background: K.forest }}>
                {photo ? (
                  <BirdPhotoCrop url={photo.url} original={photo.original} position={bird.photo_position ?? "50% 20%"} alt={name} />
                ) : (
                  <span className="text-[22px] font-[700]" style={{ color: K.lime, fontFamily: "'Newsreader', Georgia, serif" }}>{initial}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="m-0 truncate text-[17px] font-[700]" style={{ color: K.forest }}>{bird.name}</p>
                <p className="m-0 mt-0.5 truncate text-[14px]" style={{ color: K.quiet }}>
                  {[bird.species ? speciesLabel(t, bird.species) : t("planEditor.parrot", "Parrot"), birdAgeLabel(t, bird)].filter(Boolean).join(" · ")}
                </p>
              </div>
            </KyaCard>

            {/* Deeper record (Identity only) */}
            <KyaCard>
              <Row label={t("birdSetup.sex", "Sex")} value={sexValue(t, bird)} onAdd={openEdit} />
              <Row label={t("birdSetup.flight", "Flight")} value={flightLabel(t, bird.flight_status)} onAdd={openEdit} />
              <Row label={t("birdPickers.hatchDate", "Hatch date")} value={bird.birth_date ? `${fmtDate(bird.birth_date)} (≈ ${approxAge(t, bird.birth_date)})` : null} onAdd={openEdit} />
              <Row label={t("birdIdentity.microchip", "Microchip")} value={bird.microchip} onAdd={openEdit} />
              <Row label={t("birdIdentity.legBand", "Leg band")} value={bird.band_number} onAdd={openEdit} />
              <Row label={t("birdIdentity.origin", "Origin")} value={bird.origin} onAdd={openEdit} />
              <Row label={t("birdIdentity.cameHome", "Came home")} value={bird.acquired_on ? fmtDate(bird.acquired_on) : null} onAdd={openEdit} last={!bird.is_foster} />
              {/* A foster's "Came to you": only a date the owner entered. */}
              {bird.is_foster && (
                <Row label={t("newBird.cameToYou", "Came to you")} value={ownerIntakeDate(bird) ? fmtDate(ownerIntakeDate(bird)!) : null} onAdd={openEdit} last />
              )}
            </KyaCard>
            <p className="m-0 px-1 text-[13px] leading-[1.5]" style={{ color: K.quiet }}>{footnote}</p>
          </>
        )}
      </KyaBody>
    </KyaPage>
  );
}

function sexValue(t: TFunction, b: Identity): string | null {
  if (blank(b.sex)) return null;
  const sex = sexLabel(t, b.sex!);
  const method = b.sex_method ? methodLabel(t, b.sex_method) : "";
  return method ? `${sex} · ${method}` : sex;
}

function Row({ label, value, onAdd, last }: { label: string; value: string | null | undefined; onAdd?: () => void; last?: boolean }) {
  const { t } = useTranslation();
  const filled = !blank(value);
  return (
    <div className="flex min-h-[52px] items-center gap-3 px-4 py-2" style={{ borderBottom: last ? undefined : `1px solid ${K.line}` }}>
      <span className="w-[108px] shrink-0 text-[14px]" style={{ color: K.quiet }}>{label}</span>
      {filled ? (
        <span className="min-w-0 flex-1 break-words py-1.5 text-[15px] font-[600]" style={{ color: K.forest }}>{value}</span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="text-[15px]" style={{ color: K.quiet }}>{t("birdIdentity.notAdded", "Not added")}</span>
          {onAdd && <KyaLink onClick={onAdd} className="px-1">{t("birdIdentity.add", "Add")}</KyaLink>}
        </span>
      )}
    </div>
  );
}

function IdentityForm({ birdId, bird, onClose, onSaved, onDirtyChange }: { birdId: string; bird: Identity; onClose: () => void; onSaved: () => void; onDirtyChange?: (dirty: boolean) => void }) {
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
    // An intake date the app set on its own starts empty ("Add date").
    intake_date: ownerIntakeDate(bird) ?? "",
  });
  // Photo: display value (signed/data URL) vs the value to persist (path/data/null).
  const [photoDisplay, setPhotoDisplay] = useState<string | null>(null);
  const [photoRef, setPhotoRef] = useState<string | null>(bird.photo_url ?? null);
  const [photoPosition, setPhotoPosition] = useState<string | null>(bird.photo_position ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  // Changed since the form opened? Drives the leave-without-saving guard.
  const initial = useRef(JSON.stringify({ f, photoRef, photoPosition }));
  const dirty = JSON.stringify({ f, photoRef, photoPosition }) !== initial.current;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

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
        // A hatch date sets the age, so the two never disagree.
        age: f.birth_date ? ageFromBirthDate(f.birth_date) : clean(f.age),
        sex: clean(f.sex),
        sex_method: clean(f.sex_method),
        flight_status: f.flight_status || "unknown",
        birth_date: f.birth_date || null,
        microchip: clean(f.microchip),
        band_number: clean(f.band_number),
        origin: clean(f.origin),
        acquired_on: f.acquired_on || null,
        is_foster: f.is_foster,
        // "Came to you" is on screen only for a foster, so only then is it
        // saved, and what's saved is the owner's. Otherwise it's left as is.
        ...(f.is_foster ? { intake_date: f.intake_date || null, intake_date_source: f.intake_date ? "owner" : null } : {}),
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
    <>
      <KyaCard className="flex flex-col gap-4 p-4">
        <KyaHeading size={21}>{t("birdIdentity.editTitle", "Edit identity")}</KyaHeading>

        {/* Shared core: photo, name, species, age — same columns as the Basics tab */}
        <div className="flex items-start gap-3">
          {photoDisplay ? (
            <PhotoCropper src={photoDisplay} position={photoPosition ?? undefined} onChange={setPhotoPosition} size={96} />
          ) : (
            <div className="grid size-24 shrink-0 place-items-center rounded-[16px] text-center text-[13px]" style={{ background: K.mist, color: K.quiet }}>{t("birdSetup.noPhoto", "No photo")}</div>
          )}
          <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 pt-1">
            <label
              className={`inline-flex min-h-[44px] items-center rounded-full border-2 bg-white px-4 text-[14px] font-[700] ${photoBusy ? "cursor-default opacity-60" : "cursor-pointer active:scale-[0.99]"}`}
              style={{ borderColor: K.forest, color: K.forest }}
            >
              {photoBusy ? t("birdSetup.processing", "Processing…") : photoDisplay ? t("birdSetup.changePhoto", "Change photo") : t("birdSetup.addPhoto", "Add photo")}
              <input type="file" accept="image/*,.heic,.heif" disabled={photoBusy} className="hidden" onChange={onPhoto} />
            </label>
            {photoDisplay && (
              <KyaLink color={K.red} onClick={() => { setPhotoDisplay(null); setPhotoRef(null); setPhotoPosition(null); }}>{t("newBird.remove", "Remove")}</KyaLink>
            )}
          </div>
        </div>

        <KyaField id="identity-name" label={t("birdSetup.name", "Name")} value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} />
        <KyaField id="identity-species" label={t("birdPickers.species", "Species")} value={f.species} maxLength={80} onChange={(e) => set("species", e.target.value)} />
        <KyaField id="identity-age" label={t("birdPickers.age", "Age")} value={f.age} maxLength={40} placeholder={t("birdIdentity.agePlaceholder", "e.g. 6 years")} onChange={(e) => set("age", e.target.value)} />

        <FormField id="identity-sex" label={t("birdSetup.sex", "Sex")}>
          <div className="grid grid-cols-2 gap-2">
            <select id="identity-sex" className={INPUT} style={INPUT_STYLE} value={f.sex} onChange={(e) => set("sex", e.target.value)}>
              <option value="">{t("birdIdentity.notSet", "Not set")}</option>
              <option value="female">{t("birdSetup.female", "Female")}</option>
              <option value="male">{t("birdSetup.male", "Male")}</option>
              <option value="unknown">{t("birdSetup.unknown", "Unknown")}</option>
            </select>
            <select aria-label={t("birdIdentity.methodLabel", "How sex was determined")} className={INPUT} style={INPUT_STYLE} value={f.sex_method} onChange={(e) => set("sex_method", e.target.value)}>
              <option value="">{t("birdIdentity.methodPlaceholder", "Method…")}</option>
              <option value="dna">{t("birdIdentity.methodDna", "DNA")}</option>
              <option value="surgical">{t("birdIdentity.methodSurgical", "Surgical")}</option>
              <option value="visual">{t("birdIdentity.methodVisual", "Visual")}</option>
              <option value="unknown">{t("birdSetup.unknown", "Unknown")}</option>
            </select>
          </div>
        </FormField>

        <FormField id="identity-flight" label={t("birdSetup.flight", "Flight")}>
          <select id="identity-flight" className={INPUT} style={INPUT_STYLE} value={f.flight_status} onChange={(e) => set("flight_status", e.target.value)}>
            <option value="unknown">{t("birdSetup.unknown", "Unknown")}</option>
            <option value="fully_flighted">{t("birdSetup.fullyFlighted", "Fully flighted")}</option>
            <option value="clipped">{t("birdSetup.clipped", "Clipped")}</option>
            <option value="partially_clipped">{t("birdSetup.partiallyClipped", "Partially clipped")}</option>
          </select>
        </FormField>

        <FormField label={t("birdPickers.hatchDate", "Hatch date")}>
          <OptionalDate value={f.birth_date} max={today} addLabel={t("birdPickers.addHatchDate", "Add hatch date")} inputClassName={INPUT} onChange={(v) => set("birth_date", v)} />
        </FormField>
        <KyaField id="identity-microchip" label={t("birdIdentity.microchip", "Microchip")} value={f.microchip} maxLength={60} onChange={(e) => set("microchip", e.target.value)} />
        <KyaField id="identity-band" label={t("birdIdentity.legBand", "Leg band")} value={f.band_number} maxLength={60} onChange={(e) => set("band_number", e.target.value)} />
        <KyaField id="identity-origin" label={t("birdIdentity.origin", "Origin")} value={f.origin} maxLength={200} placeholder={t("birdIdentity.originPlaceholder", "e.g. captive-bred, wild-hatched / rescued")} onChange={(e) => set("origin", e.target.value)} />
        <FormField label={t("birdIdentity.cameHome", "Came home")}>
          <OptionalDate value={f.acquired_on} max={today} addLabel={t("birdPickers.addDate", "Add date")} inputClassName={INPUT} onChange={(v) => set("acquired_on", v)} />
        </FormField>

        <div className="rounded-[16px] p-3" style={{ background: K.mist }}>
          <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
            <input type="checkbox" checked={f.is_foster} onChange={(e) => setF((p) => ({ ...p, is_foster: e.target.checked }))} className="mt-0.5 size-5 shrink-0" style={{ accentColor: K.forest }} />
            <span className="min-w-0">
              <span className="block text-[15px] font-[700]" style={{ color: K.forest }}>{t("newBird.isFoster", "This is a foster")}</span>
              <span className="mt-0.5 block text-[13px] leading-[1.45]" style={{ color: K.quiet }}>{t("birdIdentity.fosterBody", "You're caring for them while they find a permanent home.")}</span>
            </span>
          </label>
          {f.is_foster && (
            <div className="mt-3 border-t pt-3" style={{ borderColor: K.line }}>
              <FormField label={t("newBird.cameToYou", "Came to you")}><OptionalDate value={f.intake_date} max={today} addLabel={t("birdPickers.addDate", "Add date")} inputClassName={INPUT} onChange={(v) => set("intake_date", v)} /></FormField>
            </div>
          )}
        </div>

        <p className="m-0 px-1 text-[13px] leading-[1.45]" style={{ color: K.quiet }}>{t("birdIdentity.allOptional", "All fields are optional — partial records are fine.")}</p>
      </KyaCard>

      <div className="flex flex-col gap-2.5">
        <KyaPrimaryButton onClick={save} disabled={saving}>
          {saving ? t("birdIdentity.saving", "Saving…") : t("birdIdentity.save", "Save")}
        </KyaPrimaryButton>
        <KyaSecondaryButton className="w-full" onClick={onClose} disabled={saving}>{t("birdIdentity.cancel", "Cancel")}</KyaSecondaryButton>
      </div>
    </>
  );
}

// Matches KyaField's pill input, for the selects and date pickers.
const INPUT = "min-h-[48px] w-full rounded-full border-[1.5px] border-[#d5dfd5] bg-white px-4 text-[16px] text-[#1a3d2e] outline-none focus:border-[#2d6a4f]";
const INPUT_STYLE = { color: K.forest } as const;

function FormField({ id, label, children }: { id?: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {id
        ? <label htmlFor={id} className="text-[13.5px] font-[700]" style={{ color: K.forest }}>{label}</label>
        : <span className="text-[13.5px] font-[700]" style={{ color: K.forest }}>{label}</span>}
      {children}
    </div>
  );
}

function fmtDate(iso: string): string {
  return formatLocalDate(new Date(`${iso}T12:00:00`), { year: "numeric", month: "short", day: "numeric" });
}

function approxAge(t: TFunction, iso: string): string {
  const days = Math.floor((Date.now() - +new Date(`${iso}T12:00:00`)) / 86_400_000);
  if (days < 0) return "—";
  // Full years come from the shared age helper, so this matches every other age.
  const years = ageFromBirthDate(iso);
  if (years && years !== "<1 year") return birdAgeLabel(t, { birth_date: iso })!;
  const months = Math.floor(days / 30);
  if (months >= 1) return months === 1 ? t("birdIdentity.monthsOne", "{{n}} month", { n: months }) : t("birdIdentity.monthsOther", "{{n}} months", { n: months });
  return days === 1 ? t("birdIdentity.daysOne", "{{n}} day", { n: days }) : t("birdIdentity.daysOther", "{{n}} days", { n: days });
}
