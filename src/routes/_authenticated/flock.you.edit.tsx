import { useEffect, useId, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Camera } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaLink } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { BirdChips, FlockAvatar, FlockSection, RegionSheet } from "@/components/flock/FlockPeople";
import { chapterLine } from "@/lib/flockNav";
import { AvatarError, removeAvatar, reencodeAvatar, uploadAvatar } from "@/lib/flockAvatar";
import {
  saveFlockProfile, useAvatarUrls, useInvalidateFlock, useMyId, useMyProfile, useOwnBirdPhotoUrls, useOwnBirds,
  useRegions, useShownChoices,
} from "@/lib/flockData";

// Edit profile: display name, bio, photo, region (= chapter) and shown birds.
// Changing region moves you to that chapter as soon as it's saved.
export const Route = createFileRoute("/_authenticated/flock/you/edit")({
  component: FlockEditProfile,
});

const BIO_MAX = 280;

function FlockEditProfile() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateFlock();
  const nameId = useId();
  const bioId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: userId } = useMyId();
  const { data: me } = useMyProfile();
  const { data: regions } = useRegions();
  const { data: birds } = useOwnBirds();
  const { data: choices } = useShownChoices();
  const { data: birdPhotos } = useOwnBirdPhotoUrls(birds, 120);
  const { data: avatarUrls } = useAvatarUrls([me?.photo_path]);

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [region, setRegion] = useState<string | null>(null);
  const [shown, setShown] = useState<Map<string, boolean>>(new Map());
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!me || loaded.current) return;
    loaded.current = true;
    setName(me.display_name);
    setBio(me.bio ?? "");
    setRegion(me.region_slug);
  }, [me]);
  useEffect(() => {
    if (!birds) return;
    setShown((prev) => {
      const next = new Map(prev);
      for (const b of birds) if (!next.has(b.id)) next.set(b.id, choices?.get(b.id) ?? true);
      return next;
    });
  }, [birds, choices]);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.preview); }, [photo]);
  // From Privacy's "choose which birds": land on the birds section.
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#birds") document.getElementById("birds")?.scrollIntoView();
  }, [birds]);

  const r = regions?.find((x) => x.slug === region);
  const currentPhoto = removePhoto ? null : photo?.preview ?? (me?.photo_path ? avatarUrls?.get(me.photo_path) : null);
  const nameOk = name.trim().length >= 1 && name.trim().length <= 50;

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const blob = await reencodeAvatar(file);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
      setRemovePhoto(false);
    } catch (e) {
      setError(e instanceof AvatarError ? e.message : t("flock.edit.photoError", "We couldn't read that photo. Try a JPEG or PNG."));
    }
  };

  const save = async () => {
    if (!nameOk || !region || !userId) return;
    setSaving(true);
    setError(null);
    try {
      let photoPath: string | null | undefined = undefined;
      if (photo) photoPath = await uploadAvatar(userId, photo.blob);
      else if (removePhoto) photoPath = null;
      await saveFlockProfile({ display_name: name, bio, region_slug: region, photo_path: photoPath, shown });
      if (photoPath !== undefined && me?.photo_path && me.photo_path !== photoPath) void removeAvatar(me.photo_path);
      await invalidate();
      void navigate({ to: "/flock/you" });
    } catch (e) {
      setError(e instanceof AvatarError ? e.message : t("flock.edit.error", "We couldn't save your profile. Check your connection and try again."));
      setSaving(false);
    }
  };

  return (
    <FlockSubPage title={t("flock.edit.title", "Edit profile")} fallback="/flock/you">
      <FlockSection title={t("flock.edit.photo", "Photo")}>
        <div className="flex items-center gap-4">
          <FlockAvatar name={name || "?"} url={currentPhoto} size={72} />
          <div className="flex flex-col items-start">
            <input ref={fileRef} type="file" accept="image/*" className="sr-only" aria-label={t("flock.edit.photoPick", "Choose a photo")}
              onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ""; }} />
            <KyaLink onClick={() => fileRef.current?.click()}>
              <span className="inline-flex items-center gap-1.5"><Camera className="size-4" aria-hidden="true" />{t("flock.edit.photoPick", "Choose a photo")}</span>
            </KyaLink>
            {currentPhoto && (
              <KyaLink onClick={() => { setPhoto(null); setRemovePhoto(true); }} color={K.quiet}>{t("flock.edit.photoRemove", "Remove photo")}</KyaLink>
            )}
          </div>
        </div>
        <p className="m-0 mt-2 text-[14px] leading-[1.45]" style={{ color: K.quiet }}>
          {t("flock.edit.photoHint", "We remove location and camera details from photos before saving them.")}
        </p>
      </FlockSection>

      <FlockSection title={t("flock.edit.name", "Display name")} hint={t("flock.edit.nameHint", "How members see you. First name and last initial works well.")}>
        <label htmlFor={nameId} className="sr-only">{t("flock.edit.name", "Display name")}</label>
        <input id={nameId} value={name} maxLength={50} onChange={(e) => setName(e.target.value)} data-testid="edit-name"
          className="h-12 w-full rounded-full border-2 bg-white px-[18px] text-[16px] outline-none focus:border-[#1a3d2e]" style={{ borderColor: K.line, color: K.forest }} />
      </FlockSection>

      <FlockSection title={t("flock.edit.bio", "About you")} hint={t("flock.edit.bioCount", "{{n}} of {{max}} characters", { n: bio.length, max: BIO_MAX })}>
        <label htmlFor={bioId} className="sr-only">{t("flock.edit.bio", "About you")}</label>
        <textarea id={bioId} value={bio} maxLength={BIO_MAX} rows={3} onChange={(e) => setBio(e.target.value)}
          placeholder={t("flock.edit.bioPlaceholder", "A line or two: your birds, what you're working on, what you'd love to learn.")}
          className="w-full resize-none rounded-[18px] border-2 bg-white px-[18px] py-3 text-[16px] leading-[1.5] outline-none focus:border-[#1a3d2e]" style={{ borderColor: K.line, color: K.forest }} />
      </FlockSection>

      <FlockSection title={t("flock.setup.chapter", "Your chapter")} hint={t("flock.setup.chapterHint", "Members see your region, never your address.")}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[16px] font-[700]" data-testid="edit-region" style={{ color: K.forest }}>{r ? chapterLine(r.name, r.states) : " "}</span>
          <KyaLink onClick={() => setPicking(true)}>{t("flock.setup.change", "Change")}</KyaLink>
        </div>
      </FlockSection>

      <div id="birds">
        <FlockSection title={t("flock.setup.birds", "Which birds should members meet?")} hint={t("flock.setup.birdsHint", "Only their name, species, and photo. Care records stay private.")}>
          <BirdChips birds={birds ?? []} photos={birdPhotos} selected={shown}
            onToggle={(id) => setShown((m) => new Map(m).set(id, !(m.get(id) ?? true)))} />
        </FlockSection>
      </div>

      {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
      <button type="button" onClick={() => void save()} disabled={saving || !nameOk || !region}
        className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700] active:scale-[0.99] disabled:opacity-50"
        style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}>
        {saving ? t("flock.setup.saving", "Saving…") : t("flock.edit.save", "Save profile")}
      </button>
      {picking && regions && (
        <RegionSheet regions={regions} value={region} onClose={() => setPicking(false)} onPick={(s) => { setRegion(s); setPicking(false); }} />
      )}
    </FlockSubPage>
  );
}
