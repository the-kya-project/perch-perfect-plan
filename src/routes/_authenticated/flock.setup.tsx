import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { K, KyaHeading, KyaLink } from "@/components/kya";
import { BirdChips, FlockSection, RegionSheet } from "@/components/flock/FlockPeople";
import { chapterLine } from "@/lib/flockNav";
import { defaultDisplayName, isAutomaticDisplayName } from "@/lib/flockProfile";
import {
  saveFlockProfile, useCareName, useInvalidateFlock, useMyProfile, useMySetup, useOwnBirdPhotoUrls, useOwnBirds,
  useRegions, useShownChoices,
} from "@/lib/flockData";

// The one-minute setup: your chapter and which birds members meet, on one
// screen. "Go to the community" saves both, marks setup done, and opens Today.
export const Route = createFileRoute("/_authenticated/flock/setup")({
  component: FlockSetup,
});

function FlockSetup() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateFlock();
  const { data: setup } = useMySetup();
  const { data: me } = useMyProfile();
  const { data: care } = useCareName();
  const { data: regions } = useRegions();
  const { data: birds } = useOwnBirds();
  const { data: choices } = useShownChoices();
  const { data: photos } = useOwnBirdPhotoUrls(birds, 120);

  const [region, setRegion] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [shown, setShown] = useState<Map<string, boolean>>(new Map());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill once: claim / waitlist / time zone suggestion, else Other.
  useEffect(() => {
    if (region === null && setup) setRegion(setup.suggested_region ?? "other");
  }, [setup, region]);
  // Every bird starts selected, unless already chosen before.
  useEffect(() => {
    if (!birds) return;
    setShown((prev) => {
      const next = new Map(prev);
      for (const b of birds) if (!next.has(b.id)) next.set(b.id, choices?.get(b.id) ?? true);
      return next;
    });
  }, [birds, choices]);

  const r = regions?.find((x) => x.slug === region);
  const save = async () => {
    if (!region) return;
    setSaving(true);
    setError(null);
    try {
      const name = isAutomaticDisplayName(me?.display_name, care?.full_name)
        ? defaultDisplayName(care?.first_name, care?.full_name)
        : (me?.display_name as string);
      await saveFlockProfile({ display_name: name, region_slug: region, completeSetup: true, shown });
      await invalidate();
      void navigate({ to: "/flock", replace: true });
    } catch {
      setError(t("flock.setup.error", "We couldn't save that. Check your connection and try again."));
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh]" style={{ background: K.mist }}>
      <header className="text-white" style={{ background: K.forest }}>
        <div className="mx-auto max-w-md px-5 pb-[46px] pt-[calc(env(safe-area-inset-top)+18px)]">
          {/* Welcome is step 1, this is step 2; "follow a few journeys" will be step 3. */}
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.18)" }}
            role="progressbar" aria-label={t("flock.setup.progressAria", "Setup progress")} aria-valuemin={0} aria-valuemax={3} aria-valuenow={2}>
            <div className="h-full rounded-full" style={{ width: "66%", background: K.sunflower }} />
          </div>
          <KyaHeading as="h1" size={30} className="mt-6 text-white">{t("flock.setup.title", "A minute to set up")}</KyaHeading>
          <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>
            {t("flock.setup.line", "Two quick choices, and you can change both any time.")}
          </p>
        </div>
      </header>
      <main className="relative mx-auto -mt-[26px] flex max-w-md flex-col gap-4 rounded-t-[26px] px-4 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-5" style={{ background: K.mist }}>
        <FlockSection title={t("flock.setup.chapter", "Your chapter")} hint={t("flock.setup.chapterHint", "Members see your region, never your address.")}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[16px] font-[700]" data-testid="setup-region" style={{ color: K.forest }}>
              {r ? chapterLine(r.name, r.states) : " "}
            </span>
            <KyaLink onClick={() => setPicking(true)}>{t("flock.setup.change", "Change")}</KyaLink>
          </div>
        </FlockSection>

        <FlockSection title={t("flock.setup.birds", "Which birds should members meet?")} hint={t("flock.setup.birdsHint", "Only their name, species, and photo. Care records stay private.")}>
          <BirdChips
            birds={birds ?? []}
            photos={photos}
            selected={shown}
            onToggle={(id) => setShown((m) => new Map(m).set(id, !(m.get(id) ?? true)))}
          />
        </FlockSection>

        {/* STEP 3 (journeys): the "Follow a few journeys" card goes here, between
            the birds and the button, once journeys exist. Not built yet. */}

        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !region}
          className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700] active:scale-[0.99] disabled:opacity-50"
          style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
        >
          {saving ? t("flock.setup.saving", "Saving…") : t("flock.setup.cta", "Go to the community")}
        </button>
      </main>
      {picking && regions && (
        <RegionSheet regions={regions} value={region} onClose={() => setPicking(false)} onPick={(s) => { setRegion(s); setPicking(false); }} />
      )}
    </div>
  );
}
