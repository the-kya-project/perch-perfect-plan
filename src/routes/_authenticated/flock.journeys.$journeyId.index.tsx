import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaPrimaryButton } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import {
  resumeAfterVet, useBirdWeights, useInvalidateJourneys, useJourney, useJourneyBirds, useWeightCheck, type Journey, type WeightCheck,
} from "@/lib/journeyData";
import { nextMilestone, progressOf } from "@/lib/journeys";

// A journey: where it stands, Post an update, and its milestones. Diet
// conversion adds the weight trend and its safeguard. The full page (clips
// grid, Day one vs. now, the menu) comes with step 3's third PR.
export const Route = createFileRoute("/_authenticated/flock/journeys/$journeyId/")({
  component: JourneyPage,
});

function JourneyPage() {
  const { t } = useTranslation();
  const { journeyId } = Route.useParams();
  const { data: journey, isLoading } = useJourney(journeyId);
  const { data: birds } = useJourneyBirds();
  const bird = birds?.find((b) => b.id === journey?.bird_id);
  const diet = journey?.template?.slug === "diet-conversion";
  const { data: weight } = useWeightCheck(journeyId, !!diet && !!journey && journey.status !== "finished");
  if (!isLoading && !journey) {
    return (
      <FlockSubPage title={t("flock.journeys.page.missingTitle", "Journey not found")} fallback="/flock/journeys">
        <FlockEmpty icon={<Check className="size-6" />} title={t("flock.journeys.page.missingTitle", "Journey not found")}>
          {t("flock.journeys.page.missing", "This journey isn't available.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }
  const skill = journey?.template?.name ?? journey?.custom_name ?? "";
  const ms = journey?.milestones ?? [];
  const { done, total } = progressOf(ms);
  const next = nextMilestone(ms);
  const weightPaused = journey?.status === "paused" && journey.paused_reason === "weight_drop";
  return (
    <FlockSubPage title={journey ? `${bird?.name ?? ""} · ${skill}` : " "} fallback="/flock/journeys">
      <div data-testid="journey-page" className="flex flex-col gap-3">
        <p className="m-0 text-[15px] font-[700]" style={{ color: K.forest }} data-testid="journey-progress">
          {next
            ? t("flock.journeys.page.progress", "{{done}} of {{total}} · next: {{next}}", { done, total, next: next.title })
            : t("flock.journeys.page.progressDone", "{{done}} of {{total}}", { done, total })}
        </p>
        <div className="flex gap-1" aria-hidden="true">
          {ms.map((m) => <span key={m.id} className="h-2 flex-1 rounded-full" style={{ background: m.state === "todo" ? "#dfe7dd" : K.moss }} />)}
        </div>

        {journey && bird && diet && weight && (
          <WeightCard journey={journey} birdName={bird.name} weight={weight} paused={weightPaused} />
        )}
        {journey?.status === "paused" && !weightPaused && (
          <p className="m-0 rounded-[14px] px-3.5 py-2.5 text-[14px]" style={{ background: K.amberBg, color: K.amberText }} data-testid="paused-note">
            {t("flock.journeys.page.paused", "This journey is paused.")}
          </p>
        )}
        {journey?.status === "active" && (
          <Link to="/flock/journeys/$journeyId/post" params={{ journeyId }} search={{}} data-testid="post-update"
            className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700]"
            style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}>
            <Plus className="size-4" aria-hidden="true" />{t("flock.journeys.page.post", "Post an update")}
          </Link>
        )}

        <KyaCard className="p-0">
          <ol className="m-0 list-none p-0">
            {ms.map((m, i) => (
              <li key={m.id} className="flex min-h-[48px] items-center gap-3 px-4 py-2" style={{ borderBottom: i === ms.length - 1 ? undefined : `1px solid ${K.line}`, color: K.forest }}>
                <span className="grid size-6 shrink-0 place-items-center rounded-full" style={m.state === "todo" ? { border: "2px solid #c9d3c8" } : { background: K.moss }}>
                  {m.state !== "todo" && <Check className="size-3.5 text-white" strokeWidth={3} aria-hidden="true" />}
                </span>
                <span className={`flex-1 text-[14px] leading-[1.35] ${m === next ? "font-[700]" : ""}`}>{m.title}</span>
                {m.state === "already" && <span className="text-[12.5px]" style={{ color: K.quiet }}>{t("flock.journeys.setup.already", "Already")}</span>}
              </li>
            ))}
          </ol>
        </KyaCard>
      </div>
    </FlockSubPage>
  );
}

/** Diet conversion: the weight trend since the start, a heads-up at the amber
 *  threshold, and the pause (resume only after confirming the vet call). */
function WeightCard({ journey, birdName, weight, paused }: { journey: Journey; birdName: string; weight: WeightCheck; paused: boolean }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateJourneys();
  const { data: entries } = useBirdWeights(journey.bird_id, weight.window_from ?? journey.started_at);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pts = (entries ?? []).slice(-14);
  const max = Math.max(...pts.map((p) => p.grams), weight.start_grams ?? 0, 1);
  const min = Math.min(...pts.map((p) => p.grams), weight.start_grams ?? Infinity);
  const span = Math.max(1, max - min);
  const resume = async () => {
    setBusy(true);
    setError(null);
    try { await resumeAfterVet(journey.id); await invalidate(); }
    catch { setError(t("flock.journeys.weight.error", "We couldn't resume the journey. Check your connection and try again.")); }
    finally { setBusy(false); }
  };
  return (
    <section className="flex flex-col gap-2.5 rounded-[18px] bg-white p-4" data-testid="weight-card" data-level={weight.level}>
      <h2 className="m-0 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.weight.title", "Weight")}</h2>
      {weight.start_grams == null ? (
        <p className="m-0 text-[14px]" style={{ color: K.quiet }}>{t("flock.journeys.weight.noStart", "Weigh {{name}} every day this first week. The average becomes the starting weight.", { name: birdName })}</p>
      ) : (
        <p className="m-0 text-[14px]" style={{ color: K.ink }} data-testid="weight-line">
          {weight.current_grams == null
            ? t("flock.journeys.weight.startOnly", "Starting weight {{start}} g", { start: weight.start_grams })
            : t("flock.journeys.weight.line", "Starting weight {{start}} g · now {{now}} g", { start: weight.start_grams, now: weight.current_grams })}
        </p>
      )}
      {pts.length > 1 && (
        <div className="flex h-14 items-end gap-1" aria-hidden="true">
          {pts.map((p) => (
            <span key={p.measured_at} className="flex-1 rounded-t-[4px]" style={{ height: `${20 + ((p.grams - min) / span) * 80}%`, background: K.paleGreen }} />
          ))}
        </div>
      )}
      {weight.level === "notice" && !paused && (
        <p className="m-0 rounded-[12px] px-3 py-2.5 text-[14px] leading-[1.45]" style={{ background: K.amberBg, color: K.amberText }} data-testid="weight-notice">
          {t("flock.journeys.weight.notice", "{{name}}'s weight is down a little from the start. Keep weighing every day, and go slower if it keeps dropping.", { name: birdName })}
        </p>
      )}
      {paused && (
        <div className="flex flex-col gap-2.5 rounded-[12px] p-3" style={{ background: "#fbe9e7" }} data-testid="weight-paused">
          <p className="m-0 flex gap-2 text-[14.5px] font-[700] leading-[1.45]" style={{ color: K.red }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("flock.journeys.weight.paused", "{{name}}'s weight has dropped. Put the usual food back and call your avian vet before going further.", { name: birdName })}
          </p>
          <label className="flex items-start gap-2 text-[14px]" style={{ color: K.forest }}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 size-4" data-testid="vet-confirm" />
            {t("flock.journeys.weight.confirm", "I've put the usual food back and called our avian vet.")}
          </label>
          <KyaPrimaryButton onClick={() => void resume()} disabled={!confirmed || busy}>{t("flock.journeys.weight.resume", "Resume the journey")}</KyaPrimaryButton>
          {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }}>{error}</p>}
        </div>
      )}
    </section>
  );
}
