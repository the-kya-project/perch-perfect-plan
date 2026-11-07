import { Link } from "@tanstack/react-router";
import { Scale, Stethoscope } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaPrimaryButton, KyaSecondaryButton } from "@/components/kya";
import { AAV_FIND_A_VET_URL } from "@/lib/flockPosts";
import type { VetCheck } from "@/lib/journeys";

// Diet conversion's vet guidance: the card before setup, the disclaimer at the
// bottom of every Diet conversion journey page, the "isn't made for" message
// for lories and lorikeets, "How to make it work", and the milestone-2
// reminder for "I'll call" journeys. Copy is Brittany's, word for word.

/** One catalog string, used on the vet card and at the bottom of journey pages. */
export function DietDisclaimer({ birdName, className = "" }: { birdName: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={`m-0 text-[12.5px] leading-[1.5] ${className}`} style={{ color: K.quiet }} data-testid="diet-disclaimer">
      {t("flock.journeys.diet.disclaimer", "Kya & Co. helps you keep track of {{name}}'s weight and progress during the switch, but it isn't a substitute for your avian vet. The tips and alerts here are general guidance, not medical advice, so please lean on your vet for decisions about {{name}}'s health and diet.", { name: birdName })}
    </p>
  );
}

export function FindAvianVetLink() {
  const { t } = useTranslation();
  return (
    <a href={AAV_FIND_A_VET_URL} target="_blank" rel="noopener noreferrer" data-testid="diet-find-vet"
      className="self-start text-[14.5px] font-[700] underline underline-offset-2" style={{ color: K.moss }}>
      {t("flock.journeys.diet.findVet", "Find an avian vet")}
    </a>
  );
}

/** After picking Diet conversion, before setup. Both answers continue. */
export function DietVetCard({ birdName, young, onChoose }: { birdName: string; young: boolean; onChoose: (c: VetCheck) => void }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3 rounded-[18px] bg-white p-4" style={{ color: K.forest }} data-testid="diet-vet-card">
      <div className="grid size-11 place-items-center rounded-full" style={{ background: K.amberBg, color: K.amberText }} aria-hidden="true">
        <Stethoscope className="size-5" />
      </div>
      <h2 className="m-0 text-[19px] font-[700] leading-[1.25]">{t("flock.journeys.diet.vetTitle", "Bring your avian vet in on this one")}</h2>
      <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
        {t("flock.journeys.diet.vetBody", "Changing your bird's diet is one of the best things you can do for them. It's also something to take slowly, with their health as the top priority the whole way. Before you start, check in with your avian vet to make sure your bird is healthy enough for a diet change. They can make sure the new diet gives your bird the nutrition it needs, tell you how much to feed, and help you spot trouble early. Some species also have specific dietary needs, which is another great reason to talk with your vet first.")}
      </p>
      {young && (
        <p className="m-0 rounded-[12px] px-3 py-2.5 text-[14.5px] leading-[1.45]" style={{ background: K.amberBg, color: K.amberText }} data-testid="diet-young">
          {t("flock.journeys.diet.young", "Young birds still learning to eat on their own need food available all day, so please talk with your vet before changing anything.")}
        </p>
      )}
      <div className="flex flex-col gap-2.5 pt-1">
        <KyaPrimaryButton onClick={() => onChoose("talked")}>{t("flock.journeys.diet.talked", "I've talked with our avian vet")}</KyaPrimaryButton>
        <KyaSecondaryButton onClick={() => onChoose("will_call")}>{t("flock.journeys.diet.willCall", "I'll call before we go further")}</KyaSecondaryButton>
      </div>
      <DietDisclaimer birdName={birdName} />
      <FindAvianVetLink />
    </section>
  );
}

/** Lories and lorikeets: Diet conversion can't start. */
export function DietNotForBird({ birdName }: { birdName: string }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-3 rounded-[18px] bg-white p-4" data-testid="diet-not-for-bird">
      <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.forest }}>
        {t("flock.journeys.diet.nectar", "This journey isn't made for {{name}}. Lories and lorikeets eat a nectar-based diet, so their food needs are different. Your avian vet is the best guide for any changes.", { name: birdName })}
      </p>
      <FindAvianVetLink />
    </section>
  );
}

/** The template's "How to make it work" tips (Diet conversion has them). */
export function HowToMakeItWork({ tips }: { tips: string[] }) {
  const { t } = useTranslation();
  if (tips.length === 0) return null;
  return (
    <details className="rounded-[16px] bg-white p-3.5" data-testid="how-to">
      <summary className="cursor-pointer text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.diet.howTo", "How to make it work")}</summary>
      <ul className="m-0 mt-2 flex list-disc flex-col gap-1.5 pl-5">
        {tips.map((x) => <li key={x} className="text-[14px] leading-[1.45]" style={{ color: K.ink }}>{x}</li>)}
      </ul>
    </details>
  );
}

/** "I'll call" journeys, from milestone 2 until they say they've talked. */
export function VetReminderCard({ onTalked, onLater, busy }: { onTalked: () => void; onLater: () => void; busy: boolean }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-2.5 rounded-[16px] p-3.5" style={{ background: K.amberBg }} data-testid="vet-reminder">
      <p className="m-0 flex gap-2 text-[14.5px] leading-[1.45]" style={{ color: K.amberText }}>
        <Stethoscope className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t("flock.journeys.diet.reminder", "Have you had a chance to check in with your avian vet? It's worth doing before the new food becomes a bigger share.")}
      </p>
      <div className="flex gap-2">
        <KyaSecondaryButton className="flex-1" onClick={onTalked} disabled={busy}>{t("flock.journeys.diet.reminderYes", "Yes, we've talked")}</KyaSecondaryButton>
        <KyaSecondaryButton className="flex-1" onClick={onLater} disabled={busy}>{t("flock.journeys.diet.reminderLater", "Remind me later")}</KyaSecondaryButton>
      </div>
    </section>
  );
}

/** No weigh-in for a couple of days: on the journey page and in Today. */
export function WeighTodayCard({ birdId, birdName }: { birdId: string; birdName: string }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-2.5 rounded-[16px] p-3.5" style={{ background: K.amberBg }} data-testid="weigh-today">
      <p className="m-0 flex gap-2 text-[14.5px] leading-[1.45]" style={{ color: K.amberText }}>
        <Scale className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t("flock.journeys.weight.missed", "Weigh {{name}} today so we can keep an eye on things during the switch.", { name: birdName })}
      </p>
      <Link to="/birds/$birdId/weight" params={{ birdId }} search={{ log: true }}
        className="inline-flex min-h-[44px] items-center justify-center self-start rounded-full border-2 bg-white px-4 text-[14.5px] font-[700]"
        style={{ borderColor: K.forest, color: K.forest }}>
        {t("flock.journeys.weight.logWeight", "Log a weight")}
      </Link>
    </section>
  );
}
