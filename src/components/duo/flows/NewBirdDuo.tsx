// Add a bird on the iPhone Duo (two panes): the form on the left, a live
// preview of the bird's card on the right with the one main button (Continue)
// at its bottom. new.tsx keeps all the state, the draft and the save; this only
// lays it out. Every other screen size keeps SetupFrame.
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RailClose } from "@/components/DuoRail";
import { InSetupFrame } from "@/components/setup/SetupFrame";
import { DUO, DuoMainButton, DuoTwoPane, PopOutCard, StatusPill } from "@/components/duo/DuoBlocks";
import { FlowBirdPhoto, FlowFacts, FlowHeading } from "@/components/duo/flows/FlowParts";
import { speciesLabel } from "@/lib/speciesLabel";
import { birdAgeLabel } from "@/lib/birdAge";
import { formatLocalDate } from "@/lib/dates";
import { parseCalendarDate } from "@/lib/localDay";

export type NewBirdPreview = {
  name: string;
  species: string;
  age: string;
  birthDate: string;
  sex: string;
  flight: string;
  /** Data URL of the picked photo, or null. */
  photo: string | null;
  photoPos: string;
  isFoster: boolean;
  intakeDate: string;
};

export function NewBirdDuo({ stepLabel, title, intro, form, preview, continueLabel, canContinue, onContinue, onClose }: {
  stepLabel: string;
  title: string;
  intro: string;
  /** The same form the phone layout shows. */
  form: ReactNode;
  preview: NewBirdPreview;
  continueLabel: string;
  canContinue: boolean;
  onContinue: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const p = preview;
  const name = p.name.trim();
  const sexText = p.sex === "Male" ? t("birdSetup.male", "Male") : p.sex === "Female" ? t("birdSetup.female", "Female") : null;
  const flightText: Record<string, string> = {
    fully_flighted: t("birdSetup.fullyFlighted", "Fully flighted"),
    clipped: t("birdSetup.clipped", "Clipped"),
    partially_clipped: t("birdSetup.partiallyClipped", "Partially clipped"),
  };
  const intake = p.isFoster && p.intakeDate ? parseCalendarDate(p.intakeDate) : null;

  const left = (
    <>
      <RailClose onClose={onClose} />
      <FlowHeading eyebrow={stepLabel} title={title} line={intro} />
      {/* The form pieces match the setup look, as inside SetupFrame. */}
      <InSetupFrame.Provider value={true}>
        <div className="mt-6 flex flex-col gap-[14px]">{form}</div>
      </InSetupFrame.Provider>
    </>
  );

  const right = (
    <PopOutCard
      eyebrow={t("newBirdDuo.previewEyebrow", "Preview")}
      title={name || t("newBirdDuo.previewNoName", "Your bird")}
      action={<DuoMainButton disabled={!canContinue} onClick={onContinue}>{continueLabel}<span aria-hidden="true">→</span></DuoMainButton>}
      footer={<p className="m-0 text-[14px] leading-[1.45]" style={{ color: DUO.quiet }}>{t("newBirdDuo.next", "Next: the care plan.")}</p>}
    >
      <FlowBirdPhoto url={p.photo} position={p.photoPos} name={name || "?"} height={240} />
      <div className="mt-4 flex flex-wrap gap-2">
        {p.species
          ? <StatusPill tone="fine">{speciesLabel(t, p.species)}</StatusPill>
          : <StatusPill tone="attention">{t("newBirdDuo.chooseSpecies", "Choose a species")}</StatusPill>}
        {p.isFoster && <StatusPill tone="neutral">{t("newBirdDuo.foster", "Foster")}</StatusPill>}
      </div>
      <div className="mt-5">
        <FlowFacts rows={[
          [t("newBirdDuo.age", "Age"), birdAgeLabel(t, { age: p.age, birth_date: p.birthDate || null })],
          [t("birdSetup.sex", "Sex"), sexText],
          [t("birdSetup.flight", "Flight"), flightText[p.flight] ?? null],
          [t("newBird.cameToYou", "Came to you"), intake ? formatLocalDate(intake, { year: "numeric", month: "short", day: "numeric" }) : null],
        ]} />
      </div>
    </PopOutCard>
  );

  return <DuoTwoPane leftLabel={title} rightLabel={t("newBirdDuo.previewEyebrow", "Preview")} left={left} right={right} />;
}
