import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { toast } from "sonner";
import { PhotoCropper } from "@/components/PhotoCropper";
import { SpeciesPicker, AgePicker, BirdField, OptionalDate } from "@/components/BirdPickers";
import { InkHero, PrimaryButton } from "@/components/system";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { persistBirdPhoto } from "@/lib/birdPhoto";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/birds/new")({
  head: () => ({ meta: [{ title: "Add a bird — Kya & Co." }] }),
  // `?foster=true` arrives from Home's "Take in a bird" CTA → toggle starts ON.
  validateSearch: z.object({ foster: z.coerce.boolean().optional() }),
  component: NewBird,
});

function NewBird() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { foster: fosterParam } = Route.useSearch();
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [age, setAge] = useState("");
  const [birthDate, setBirthDate] = useState<string>("");
  const [sex, setSex] = useState("");
  const [flight, setFlight] = useState("unknown");
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoPos, setPhotoPos] = useState<string>("50% 50%");
  const [saving, setSaving] = useState(false);
  // Set once the bird is created — a retry must never insert a second bird,
  // even if the post-save navigation failed (see onAddBird).
  const createdIdRef = useRef<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const todayStr = new Date().toISOString().slice(0, 10);
  const [isFoster, setIsFoster] = useState(!!fosterParam);
  const [intakeDate, setIntakeDate] = useState<string>(todayStr);

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
      is_foster: isFoster,
      intake_date: intakeDate || null,
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
    // NOTE: `saving` stays true on success — the button must remain disabled
    // through the navigation that follows, or a slow/failed navigation window
    // lets a second tap create a DUPLICATE bird.
    // Mark Home's bird list stale so it shows this bird the moment the owner
    // lands there (setup finish / Save & exit), with no manual refresh.
    qc.invalidateQueries({ queryKey: ["birds"] });
    return bird.id;
  }

  // Add the bird, then guide straight into the care-plan wizard (Food · Step 1
  // of 8) — the obvious next step instead of leaving the owner to find the CTA.
  // Skippable: the wizard's "Save & exit" drops onto the bird's record, which
  // keeps a "Set up <name>'s care plan" invite until setup is complete.
  //
  // Duplicate-proof: the created id is remembered, so if the tap saved the bird
  // but the navigation didn't land (e.g. a stale build's setup chunk 404ing
  // right after a deploy), a retry NEVER inserts again — it reuses the id and
  // just retries the navigation, hard-navigating as a last resort (a full page
  // load always lands on the fresh build).
  async function onAddBird() {
    if (saving) return;
    let id = createdIdRef.current;
    if (!id) {
      id = await createBird(1);
      if (!id) return;
      createdIdRef.current = id;
      toast.success(`${name} added.`);
    }
    try {
      await navigate({ to: "/birds/$birdId/setup", params: { birdId: id }, search: { step: 1 } });
    } catch (e) {
      console.error("[add-bird] navigation failed — hard-navigating to setup", e);
      window.location.assign(`/birds/${id}/setup?step=1`);
    }
  }

  // Cancel — nothing is created until Add bird, so just leave. Confirm first only
  // if they've started entering details, so a stray tap doesn't discard work.
  // If the bird WAS created (a prior tap saved it but navigation failed), leaving
  // is safe — never warn about discarding a bird that's already saved.
  const hasInput = !!(name.trim() || species.trim() || age || birthDate || sex || photo || flight !== "unknown");
  function onCancel() {
    if (createdIdRef.current) { navigate({ to: "/dashboard" }); return; }
    if (!hasInput || window.confirm("Discard this bird? You haven't saved it yet.")) {
      navigate({ to: "/dashboard" });
    }
  }

  const canAdd = !!name.trim() && !!species.trim();

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-28">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={onCancel}
          eyebrow="New bird"
          headline={fosterParam ? "Take in a bird." : "Add a bird."}
          body="Start with the basics. The full care plan comes next."
        />

        <main className="space-y-4 px-5 pt-5">
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

      {/* Foster status — a meta-question about your relationship with the bird,
          not basic info, so it sits last after all the actual bird details. */}
      <section className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={isFoster} onChange={(e) => setIsFoster(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#1a3d2e]" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[#1a3d2e]">This is a foster</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[#5f5e5a]">
              You're caring for them while they find a permanent home. You'll be able to hand off their record to the adopter.
            </span>
          </span>
        </label>
        {isFoster && (
          <div className="mt-3 space-y-3 border-t border-[#ece6d6] pt-3">
            <BirdField label="Came to you">
              <OptionalDate value={intakeDate} max={todayStr} addLabel="Add date" onChange={(v) => setIntakeDate(v)} />
            </BirdField>
            <div className="rounded-xl bg-[#efe9da] p-3">
              <p className="text-sm leading-relaxed text-[#5f5e5a]">
                It's okay if you don't know much yet — add what you know now, fill the rest in as you learn.
              </p>
            </div>
          </div>
        )}
      </section>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}`}</style>
        </main>
      </div>

      <footer className="fixed inset-x-0 bottom-0 border-t border-[var(--line)] bg-[var(--cream)]/95 px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
        <div className="mx-auto max-w-md">
          <PrimaryButton tone="lime" disabled={saving || !canAdd} onPress={onAddBird}>
            {saving ? "Adding…" : "Add bird"}
          </PrimaryButton>
        </div>
      </footer>
    </div>
  );
}
