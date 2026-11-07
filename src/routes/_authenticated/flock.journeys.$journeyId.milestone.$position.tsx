import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { K, KyaPrimaryButton, SERIF } from "@/components/kya";
import { ForestMoment, ProgressRing } from "@/components/flock/JourneyCelebrate";
import { useOwnBirdPhotoUrls } from "@/lib/flockData";
import { shareMilestone, useInvalidateJourneys, useJourney, useJourneyAccess, useJourneyBirds } from "@/lib/journeyData";
import { journeyDay, progressOf } from "@/lib/journeys";

// Milestone celebration (Batch 4, screen 3): the bird's photo in the progress
// ring, "[Bird] [done line]!", how far along, and sharing (members only).
// "Make a share card" comes later.
export const Route = createFileRoute("/_authenticated/flock/journeys/$journeyId/milestone/$position")({
  component: Celebrate,
});

function Celebrate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateJourneys();
  const { journeyId, position } = Route.useParams();
  const { data: journey } = useJourney(journeyId);
  const { data: birds } = useJourneyBirds();
  const { data: access } = useJourneyAccess();
  const bird = birds?.find((b) => b.id === journey?.bird_id);
  const { data: photos } = useOwnBirdPhotoUrls(bird ? [bird] : undefined, 320);
  const m = journey?.milestones.find((x) => x.position === Number(position));
  const [shared, setShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!journey || !bird || !m) return <div className="min-h-screen" style={{ background: K.forest }} />;

  const skill = journey.template?.name ?? journey.custom_name ?? "";
  const { done, total } = progressOf(journey.milestones);
  const left = total - done;
  const name = bird.name;
  const line = m.words?.done_line
    ? t("flock.journeys.celebrate.line", "{{name}} {{done}}!", { name, done: m.words.done_line })
    : t("flock.journeys.celebrate.lineCustom", "{{name}} did it!", { name });
  const isShared = shared || !!m.shared_at;
  const done_ = () => void navigate({ to: "/flock/journeys/$journeyId", params: { journeyId }, replace: true });

  return (
    <ForestMoment actions={(
      <>
        {access?.can_share && (isShared ? (
          <p className="m-0 py-3 text-[15px] font-[700]" style={{ color: K.lime }} data-testid="shared">{t("flock.journeys.celebrate.shared", "Shared with the community")}</p>
        ) : (
          <KyaPrimaryButton onClick={async () => {
            try { await shareMilestone(journeyId, m.position); setShared(true); await invalidate(); }
            catch { setError(t("flock.journeys.celebrate.shareError", "We couldn't share that. Try again in a moment.")); }
          }}>{t("flock.journeys.celebrate.share", "Share with the community")}</KyaPrimaryButton>
        ))}
        <button type="button" onClick={done_} className="min-h-[48px] text-[15px] font-[700]" style={{ color: K.teal }}>{t("flock.journeys.celebrate.done", "Done")}</button>
      </>
    )}>
      <span className="text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.lime }} data-testid="celebrate-eyebrow">
        {t("flock.journeys.celebrate.eyebrow", "Milestone {{n}} of {{total}} · {{skill}}", { n: m.position, total, skill })}
      </span>
      <ProgressRing name={name} photo={photos[bird.id]} done={done} total={total} />
      <h1 className="m-0 text-[30px] font-[700] leading-[1.15]" style={{ fontFamily: SERIF }} data-testid="celebrate-line">{line}</h1>
      <p className="m-0 text-[15px]" style={{ color: K.paleGreen }}>
        {t("flock.journeys.celebrate.sub", "Day {{day}}. {{count}} to go.", { day: journeyDay(journey.started_at), count: left })}
      </p>
      {error && <p role="alert" className="m-0 text-[14px]" style={{ color: "#f6c9c9" }}>{error}</p>}
    </ForestMoment>
  );
}
