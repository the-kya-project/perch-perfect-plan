import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { getHouseholdAccount } from "@/lib/household.functions";
import { ShareNewBirdStep, type ShareCandidate } from "@/components/ShareNewBirdStep";
import { SetupFrame } from "@/components/setup/SetupFrame";
import { SetupPrimaryButton } from "@/components/setup/controls";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { toast } from "sonner";
import { PhotoCropper } from "@/components/PhotoCropper";
import { SpeciesPicker, AgePicker, BirdField, OptionalDate } from "@/components/BirdPickers";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { persistBirdPhoto } from "@/lib/birdPhoto";
import { track } from "@/lib/analytics";
import { z } from "zod";
import { friendlyError } from "@/lib/errorMessage";
import { BIRD_FEATURES } from "@/lib/onboardingPlan";
import { localDateISO } from "@/lib/localDay";
import { encodeSetupStep } from "@/lib/setupProgress";

export const Route = createFileRoute("/_authenticated/birds/new")({
  head: () => ({ meta: [{ title: i18next.t("newBird.metaTitle", "Add a bird — Kya & Co.") }] }),
  // `?foster=true` arrives from Home's "Take in a bird" CTA → toggle starts ON.
  // `?next=weight` (or scan, plan, journal, access, vet-summary) arrives from an
  // onboarding email's "Add your bird" button: once the bird is saved, go to
  // that feature instead of the care-plan walkthrough. Anything else is ignored
  // rather than failing the page.
  validateSearch: z.object({
    foster: z.coerce.boolean().optional(),
    next: z.enum(BIRD_FEATURES).optional().catch(undefined),
  }),
  component: NewBird,
});

function NewBird() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { foster: fosterParam, next } = Route.useSearch();
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
  // Set once the bird is saved and there are people to share it with — freezes
  // the id AND the member list so a later refetch can't change the sheet.
  const [share, setShare] = useState<{ birdId: string; members: ShareCandidate[] } | null>(null);

  // Fetched on MOUNT, not after the bird is created — `scope` is derived from
  // the bird count at query time, so post-creation data would rate everyone
  // "scoped" (n of n+1 birds) and pre-check nobody. Shares /household's cache
  // key. Deliberately NOT awaited anywhere: if it hasn't landed by the time the
  // owner taps Add bird we skip the sheet and go straight to the care plan —
  // access can be granted later from Household, but a stalled network must
  // never hold the walkthrough hostage.
  const householdAccount = useServerFn(getHouseholdAccount);
  const { data: account } = useQuery({
    queryKey: ["household-account"],
    queryFn: () => householdAccount(),
  });
  const shareCandidates: ShareCandidate[] = ((account?.members ?? []) as ShareCandidate[]);
  const todayStr = localDateISO();
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
        toast.error(t("newBird.photoTooLarge", "That photo's a bit too large even after resizing. Try a different photo."));
        return;
      }
      setPhoto(dataUrl);
    } catch {
      toast.error(t("newBird.photoProcessError", "Couldn't process that photo. Try a different one."));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function createBird(targetStep: number): Promise<string | null> {
    if (!name.trim()) { toast.error(t("newBird.needName", "Give your bird a name.")); return null; }
    if (!species.trim()) { toast.error(t("newBird.needSpecies", "Choose a species.")); return null; }
    setSaving(true);
    const { data: u } = await getLocalUser();
    if (!u.user) { setSaving(false); return null; }
    // Upload the picked photo to Storage and store the path (not the inline
    // base64), so list queries stay small. Legacy/empty values pass through.
    // A photo that won't upload must not cost someone the whole form they just
    // filled in, so say what happened and add the bird without it — they can
    // set a photo from the bird's page whenever.
    let photoRef: string | null = null;
    try {
      photoRef = await persistBirdPhoto(u.user.id, photo);
    } catch (e) {
      console.error("[new bird] photo upload failed", e);
      toast.error(t("newBird.photoUploadFailed", "We couldn't upload that photo, so we added your bird without it. You can add one from the bird's page."));
    }
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
      setup_step: encodeSetupStep(targetStep),
    } as any).select().single();
    if (error || !bird) {
      toast.error(friendlyError(error, t("newBird.createFailed", "Could not create bird.")));
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
      toast.error(t("newBird.carePlanSetupFailed", "Couldn't set up the care plan: {{reason}}", { reason: friendlyError(planErr, t("newBird.pleaseTryAgain", "please try again.")) }));
      setSaving(false);
      return null;
    }
    const { error: ecErr } = await supabase
      .from("emergency_contacts")
      .upsert({ bird_id: bird.id }, { onConflict: "bird_id" });
    if (ecErr) {
      toast.error(t("newBird.emergencySetupFailed", "Couldn't set up emergency info: {{reason}}", { reason: friendlyError(ecErr, t("newBird.pleaseTryAgain", "please try again.")) }));
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

  // Continue saves the bird (Details is the first step of setup), then goes
  // straight into the care-plan wizard at Food — the obvious next step instead
  // of leaving the owner to find the CTA.
  // Skippable: the wizard's "Save & exit" drops onto the bird's record, which
  // keeps a "Set up <name>'s care plan" invite until setup is complete.
  //
  // Duplicate-proof: the created id is remembered, so if the tap saved the bird
  // but the navigation didn't land (e.g. a stale build's setup chunk 404ing
  // right after a deploy), a retry NEVER inserts again — it reuses the id and
  // just retries the navigation, hard-navigating as a last resort (a full page
  // load always lands on the fresh build).
  // The navigation half of onAddBird, reused by the share step's two exits.
  // `saving` deliberately stays true throughout (see createBird).
  async function goToSetup(id: string) {
    // Arrived from an email about one feature: land on it. The bird's page still
    // offers the care-plan walkthrough until setup is complete.
    const target = next ? `/birds/${id}/${next}` : `/birds/${id}/setup?step=1`;
    try {
      if (next) await navigate({ href: target });
      else await navigate({ to: "/birds/$birdId/setup", params: { birdId: id }, search: { step: 1 } });
    } catch (e) {
      console.error("[add-bird] navigation failed — hard-navigating", e);
      window.location.assign(target);
    }
  }

  async function onAddBird() {
    if (saving) return;
    let id = createdIdRef.current;
    if (!id) {
      id = await createBird(1);
      if (!id) return;
      createdIdRef.current = id;
      toast.success(t("newBird.added", "{{name}} added.", { name }));
      track("bird_added", { species, is_foster: isFoster, has_photo: !!photo });
      // Offer to share the new bird with people already in the household. Only
      // on the FIRST pass: a retry (navigation failed earlier) has already been
      // asked, so it goes straight to setup rather than re-prompting.
      //
      // `saving` stays true while the sheet is open, so the duplicate guard is
      // unchanged — a second tap hits `if (saving) return`, and even if it
      // didn't, createdIdRef.current is set so createBird is never called again.
      if (shareCandidates.length) { setShare({ birdId: id, members: shareCandidates }); return; }
    }
    await goToSetup(id);
  }

  // Cancel — nothing is created until Add bird, so just leave. Confirm first only
  // if they've started entering details, so a stray tap doesn't discard work.
  // If the bird WAS created (a prior tap saved it but navigation failed), leaving
  // is safe — never warn about discarding a bird that's already saved.
  const hasInput = !!(name.trim() || species.trim() || age || birthDate || sex || photo || flight !== "unknown");
  function onCancel() {
    if (createdIdRef.current) { navigate({ to: "/dashboard" }); return; }
    if (!hasInput || window.confirm(t("newBird.discardConfirm", "Discard this bird? You haven't saved it yet."))) {
      navigate({ to: "/dashboard" });
    }
  }

  const canAdd = !!name.trim() && !!species.trim();

  // Details · 2 of 2: the bird is already saved by this point. Not now and
  // Continue go on to Food; Back leaves for the bird's page (nothing to undo).
  if (share) {
    return (
      <ShareNewBirdStep
        birdName={name}
        birdId={share.birdId}
        members={share.members}
        onContinue={() => goToSetup(share.birdId)}
        onBack={() => navigate({ to: "/birds/$birdId", params: { birdId: share.birdId } })}
      />
    );
  }

  return (
    <SetupFrame
      birdName={name}
      current="details"
      // "Who else helps?" follows when there's a household to share with.
      page={shareCandidates.length ? [1, 2] : undefined}
      title={fosterParam ? t("newBird.headlineFoster", "Take in a bird.") : t("newBird.headline", "Add a bird.")}
      intro={t("newBird.body", "Start with the basics. The full care plan comes next.")}
      onBack={onCancel}
      footer={
        <SetupPrimaryButton disabled={saving || !canAdd} onClick={onAddBird}>
          {saving ? t("newBird.adding", "Adding…") : t("newBird.continue", "Continue")}
        </SetupPrimaryButton>
      }
    >
      <section className="rounded-[18px] bg-[#f1f5f0] p-4 space-y-3">
        <div className="flex items-start gap-3">
          {photo ? (
            <PhotoCropper src={photo} position={photoPos} onChange={setPhotoPos} size={120} />
          ) : (
            <div className="flex size-[120px] items-center justify-center rounded-xl bg-sage-100 text-[10px] uppercase tracking-wider text-sage-600">{t("birdSetup.noPhoto", "No photo")}</div>
          )}
          <div className="flex-1 space-y-2 pt-1">
            <label className={`inline-block rounded-lg bg-sage-100 px-3 py-1.5 text-xs font-semibold text-sage-700 ${photoBusy ? "cursor-default opacity-60" : "cursor-pointer"}`}>
              {photoBusy ? t("birdSetup.processing", "Processing…") : photo ? t("birdSetup.changePhoto", "Change photo") : t("birdSetup.addPhoto", "Add photo")}
              <input type="file" accept="image/*,.heic,.heif" disabled={photoBusy} className="hidden" onChange={onPhoto} />
            </label>
            {photo && (
              <button type="button" onClick={() => { setPhoto(null); setPhotoPos("50% 50%"); }} className="ml-2 text-xs font-semibold text-warn-red underline">{t("newBird.remove", "Remove")}</button>
            )}
          </div>
        </div>
        <BirdField label={t("birdSetup.name", "Name")}><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></BirdField>
        <SpeciesPicker value={species} onChange={setSpecies} />
        <AgePicker
          age={age}
          birthDate={birthDate}
          onChange={(next) => { setAge(next.age); setBirthDate(next.birthDate ?? ""); }}
        />
        <div className="grid grid-cols-2 gap-3">
          <BirdField label={t("birdSetup.sex", "Sex")}>
            <select className="input" value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="">{t("birdSetup.unknown", "Unknown")}</option><option value="Male">{t("birdSetup.male", "Male")}</option><option value="Female">{t("birdSetup.female", "Female")}</option>
            </select>
          </BirdField>
          <BirdField label={t("birdSetup.flight", "Flight")}>
            <select className="input" value={flight} onChange={(e) => setFlight(e.target.value)}>
              <option value="unknown">{t("birdSetup.unknown", "Unknown")}</option>
              <option value="fully_flighted">{t("birdSetup.fullyFlighted", "Fully flighted")}</option>
              <option value="clipped">{t("birdSetup.clipped", "Clipped")}</option>
              <option value="partially_clipped">{t("birdSetup.partiallyClipped", "Partially clipped")}</option>
            </select>
          </BirdField>
        </div>
      </section>

      {/* Foster status — a meta-question about your relationship with the bird,
          not basic info, so it sits last after all the actual bird details. */}
      <section className="rounded-[18px] bg-[#f1f5f0] p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={isFoster} onChange={(e) => setIsFoster(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#1a3d2e]" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[#1a3d2e]">{t("newBird.isFoster", "This is a foster")}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[#5f5e5a]">
              {t("newBird.isFosterBody", "You're caring for them while they find a permanent home. You'll be able to hand off their record to the adopter.")}
            </span>
          </span>
        </label>
        {isFoster && (
          <div className="mt-3 space-y-3 border-t border-[#ece6d6] pt-3">
            <BirdField label={t("newBird.cameToYou", "Came to you")}>
              <OptionalDate value={intakeDate} max={todayStr} addLabel={t("birdPickers.addDate", "Add date")} onChange={(v) => setIntakeDate(v)} />
            </BirdField>
            <div className="rounded-xl bg-[#efe9da] p-3">
              <p className="text-sm leading-relaxed text-[#5f5e5a]">
                {t("newBird.fosterReassure", "It's okay if you don't know much yet — add what you know now, fill the rest in as you learn.")}
              </p>
            </div>
          </div>
        )}
      </section>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}`}</style>
    </SetupFrame>
  );
}
