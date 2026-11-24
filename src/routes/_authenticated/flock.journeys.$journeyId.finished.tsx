import { useId, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading, KyaPrimaryButton, SERIF } from "@/components/kya";
import { saveFinisherTip, useInvalidateJourneys, useJourney, useJourneyAccess, useJourneyBirds } from "@/lib/journeyData";
import { DIET_SLUG, journeyDays, possessive, skillInSentence } from "@/lib/journeys";

// Finished (journeys redesign, screen 6): after "[Bird] learned it!",
// "[Bird] learned [skill]!", the skill is on the bird's list (journey_finish
// added it), and, for Flock members on one of the 14 skills, one tip for
// whoever starts it next. Diet conversion finishes as "[Bird] is on the new
// diet" and adds no known skill.
export const Route = createFileRoute("/_authenticated/flock/journeys/$journeyId/finished")({
  component: Finished,
});

function Finished() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateJourneys();
  const tipId = useId();
  const { journeyId } = Route.useParams();
  const { data: journey } = useJourney(journeyId);
  const { data: birds } = useJourneyBirds();
  const { data: access } = useJourneyAccess();
  const bird = birds?.find((b) => b.id === journey?.bird_id);
  const [tip, setTip] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!journey || !bird) return <div className="min-h-screen" style={{ background: K.mist }} />;

  const skill = journey.template?.name ?? journey.custom_name ?? "";
  const days = journeyDays(journey.started_at, journey.finished_at);
  const diet = journey.template?.slug === DIET_SLUG;
  // Finisher tips are a Flock feature, and only for the 14 skills.
  const askTip = !!journey.template && !!access?.can_share;

  const done = async () => {
    setBusy(true);
    setError(null);
    try {
      if (askTip && tip.trim()) await saveFinisherTip(journeyId, tip);
      await invalidate();
      void navigate({ to: "/flock/journeys/$journeyId", params: { journeyId }, replace: true });
    } catch {
      setError(t("flock.journeys.finished.error", "We couldn't save that. Check your connection and try again."));
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(48px,env(safe-area-inset-top))]" style={{ background: "#fff", color: K.forest }} data-testid="journey-finished">
      <div className="flex flex-1 flex-col items-center gap-3 text-center">
        <span className="grid size-[92px] place-items-center rounded-full" style={{ background: K.lime, border: `3px solid ${K.moss}` }} aria-hidden="true">
          <Star className="size-10" style={{ color: K.forest }} />
        </span>
        <span className="text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>
          {t("flock.journeys.finished.eyebrow", "Journey complete · {{count}} days", { count: days })}
        </span>
        <h1 className="m-0 text-[28px] font-[700] leading-[1.15]" style={{ fontFamily: SERIF }} data-testid="finished-title">
          {diet
            ? t("flock.journeys.finished.dietTitle", "{{name}} is on the new diet", { name: bird.name })
            : t("flock.journeys.finished.learnedTitle", "{{name}} learned {{skill}}!", { name: bird.name, skill: skillInSentence(skill) })}
        </h1>
        {!diet && (
          <p className="m-0 text-[15px] leading-[1.45]" style={{ color: K.ink }}>
            {t("flock.journeys.finished.line", "{{skill}} is now on {{name}} skill list.", { skill, name: possessive(bird.name) })}
          </p>
        )}
        {askTip && (
          <section className="mt-2 flex w-full flex-col gap-2 rounded-[18px] p-4 text-left" style={{ background: K.mist }}>
            <label htmlFor={tipId}><KyaHeading size={17}>{t("flock.journeys.finished.tipQ", "What would you tell someone just starting?")}</KyaHeading></label>
            <textarea id={tipId} value={tip} onChange={(e) => setTip(e.target.value)} maxLength={500} rows={3} data-testid="finisher-tip"
              className="w-full resize-none rounded-[12px] border bg-white px-3 py-2.5 text-[15px] leading-[1.45] outline-none focus:border-[#1a3d2e]"
              style={{ borderColor: "#c9d3c8", color: K.forest }} />
            <span className="text-[12.5px]" style={{ color: K.quiet }}>
              {t("flock.journeys.finished.tipHint", "Shown to members who start {{skill}} later.", { skill })}
            </span>
          </section>
        )}
        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
      </div>
      <div className="mt-6 flex flex-col gap-2.5">
        <KyaPrimaryButton onClick={() => void done()} disabled={busy}>
          {t("flock.journeys.finished.done", "Done")}
        </KyaPrimaryButton>
        <button type="button" onClick={() => void navigate({ to: "/flock/journeys/start", search: { bird: bird.id } })}
          className="min-h-[48px] text-[15px] font-[700]" style={{ color: K.moss }}>
          {t("flock.journeys.finished.another", "Start another journey with {{name}}", { name: bird.name })}
        </button>
      </div>
    </div>
  );
}
