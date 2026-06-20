import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { toast } from "sonner";
import { PhotoCropper } from "@/components/PhotoCropper";
import { SpeciesPicker, AgePicker, BirdField } from "@/components/BirdPickers";
import { SetupShell } from "@/components/SetupShell";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { persistBirdPhoto } from "@/lib/birdPhoto";

export const Route = createFileRoute("/_authenticated/birds/new")({
  head: () => ({ meta: [{ title: "Add a bird — Parrot Care Co-Pilot" }] }),
  component: NewBird,
});

function NewBird() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [age, setAge] = useState("");
  const [birthDate, setBirthDate] = useState<string>("");
  const [sex, setSex] = useState("");
  const [flight, setFlight] = useState("unknown");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoPos, setPhotoPos] = useState<string>("50% 50%");
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) {
        toast.error("That photo's a bit too large even after resizing. Try a different photo.");
        return;
      }
      setPhoto(dataUrl);
    } catch {
      toast.error("Couldn't process that photo. Try a different one.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function createBird(targetStep: number): Promise<string | null> {
    if (!name.trim()) { toast.error("Give your bird a name."); return null; }
    if (!species.trim()) { toast.error("Choose a species."); return null; }
    setSaving(true);
    const { data: u } = await getLocalUser();
    if (!u.user) { setSaving(false); return null; }
    // Upload the picked photo to Storage and store the path (not the inline
    // base64), so list queries stay small. Legacy/empty values pass through.
    const photoRef = await persistBirdPhoto(u.user.id, photo);
    const { data: bird, error } = await supabase.from("birds").insert({
      owner_id: u.user.id,
      name,
      species: species || null,
      age: age || null,
      birth_date: birthDate || null,
      sex: sex || null,
      flight_status: flight,
      photo_url: photoRef,
      photo_position: photoRef ? photoPos : null,
      setup_complete: false,
      setup_step: targetStep,
    } as any).select().single();
    if (error || !bird) {
      toast.error(error?.message ?? "Could not create bird.");
      setSaving(false);
      return null;
    }
    // Create the related rows the guided setup writes into. Use upsert
    // (idempotent on bird_id) AND check the error: if the care_plan isn't
    // created, every wizard step silently no-ops and the owner loses all their
    // input. Don't proceed on failure — surface it instead of dropping them into
    // a broken setup.
    const { error: planErr } = await supabase
      .from("care_plans")
      .upsert({ bird_id: bird.id }, { onConflict: "bird_id" });
    if (planErr) {
      toast.error(`Couldn't set up the care plan: ${planErr.message}`);
      setSaving(false);
      return null;
    }
    const { error: ecErr } = await supabase
      .from("emergency_contacts")
      .upsert({ bird_id: bird.id }, { onConflict: "bird_id" });
    if (ecErr) {
      toast.error(`Couldn't set up emergency info: ${ecErr.message}`);
      setSaving(false);
      return null;
    }
    setSaving(false);
    // Mark Home's bird list stale so it shows this bird the moment the owner
    // lands there (setup finish / Save & exit), with no manual refresh.
    qc.invalidateQueries({ queryKey: ["birds"] });
    return bird.id;
  }

  async function onNext() {
    const id = await createBird(2);
    if (id) navigate({ to: "/birds/$birdId/setup", params: { birdId: id } });
  }

  async function onSaveAndExit() {
    const id = await createBird(1);
    if (id) {
      toast.success(`${name} saved. Finish setup any time.`);
      navigate({ to: "/dashboard" });
    }
  }

  // Cancel adding — nothing is created until Save & exit / Next, so just leave.
  // Confirm first only if they've started entering details, so a stray tap
  // doesn't discard their work.
  const hasInput = !!(name.trim() || species.trim() || age || birthDate || sex || photo || flight !== "unknown");
  function onCancel() {
    navigate({ to: "/dashboard" });
  }

  return (
    <SetupShell
      step={1}
      title="The basics"
      subtitle="Start with your bird's name and the details a sitter needs at a glance."
      backDisabled
      saving={saving}
      onNext={onNext}
      onSaveAndExit={onSaveAndExit}
      onExit={onCancel}
      exitLabel="Cancel"
      isDirty={hasInput}
      exitConfirmTitle="Discard this bird?"
      exitConfirmBody="You haven't saved this bird yet — leaving will discard what you've entered."
      exitConfirmCta="Discard"
      nextDisabled={!name.trim() || !species.trim()}
    >
      <section className="rounded-2xl bg-white p-4 space-y-3 ring-1 ring-sage-100">
        <div className="flex items-start gap-3">
          {photo ? (
            <PhotoCropper src={photo} position={photoPos} onChange={setPhotoPos} size={120} />
          ) : (
            <div className="flex size-[120px] items-center justify-center rounded-xl bg-sage-100 text-[10px] uppercase tracking-wider text-sage-600">No photo</div>
          )}
          <div className="flex-1 space-y-2 pt-1">
            <label className={`inline-block rounded-lg bg-sage-100 px-3 py-1.5 text-xs font-semibold text-sage-700 ${photoBusy ? "cursor-default opacity-60" : "cursor-pointer"}`}>
              {photoBusy ? "Processing…" : photo ? "Change photo" : "Add photo"}
              <input type="file" accept="image/*,.heic,.heif" disabled={photoBusy} className="hidden" onChange={onPhoto} />
            </label>
            {photo && (
              <button type="button" onClick={() => { setPhoto(null); setPhotoPos("50% 50%"); }} className="ml-2 text-xs font-semibold text-warn-red underline">Remove</button>
            )}
          </div>
        </div>
        <BirdField label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></BirdField>
        <SpeciesPicker value={species} onChange={setSpecies} />
        <AgePicker
          age={age}
          birthDate={birthDate}
          onChange={(next) => { setAge(next.age); setBirthDate(next.birthDate ?? ""); }}
        />
        <div className="grid grid-cols-2 gap-3">
          <BirdField label="Sex">
            <select className="input" value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">Unknown</option><option>Male</option><option>Female</option>
            </select>
          </BirdField>
          <BirdField label="Flight">
            <select className="input" value={flight} onChange={(e) => setFlight(e.target.value)}>
              <option value="unknown">Unknown</option>
              <option value="fully_flighted">Fully flighted</option>
              <option value="clipped">Clipped</option>
              <option value="partially_clipped">Partially clipped</option>
            </select>
          </BirdField>
        </div>
      </section>


      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}`}</style>
    </SetupShell>
  );
}
