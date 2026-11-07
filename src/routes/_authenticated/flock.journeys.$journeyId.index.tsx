import { useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Check, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaPrimaryButton, KyaSecondaryButton } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { ClipTile, JourneyMenuSheet, shortDay } from "@/components/flock/JourneyBrowse";
import { FinisherTipsCard } from "@/components/flock/JourneyParts";
import { DietDisclaimer, HowToMakeItWork, VetReminderCard, WeighTodayCard } from "@/components/flock/JourneyDiet";
import { deleteJourney } from "@/lib/journeyMedia.functions";
import {
  followJourney, resumeAfterVet, setVetCheck, useFinisherTips, setJourneyStatus, setJourneyVisibility, useBirdWeights, useInvalidateJourneys, useJourney,
  useJourneyAccess, useJourneyClips, useJourneyTemplates, useJourneyView, useJourneyViewUpdates, useWeightCheck, type Journey, type WeightCheck,
} from "@/lib/journeyData";
import { journeyDay, rollingAverage, showVetReminder } from "@/lib/journeys";

// A journey (JourneyEverywhere, screen 6): "[Bird] · [skill]", "Day N · X
// following", the segmented progress bar, "N of M · next: …", Post an update
// and Day one vs. now, then every clip in a 3-column grid tagged Milestone,
// Question or Day one. Your own journeys get the menu (pause, happy where we
// are, who sees it, delete) and, for Diet conversion, the weight safeguard;
// other members' community journeys get Follow (members only). Everything
// comes through journey_view*, which never shows a "Just me" journey outside
// the bird's household.
export const Route = createFileRoute("/_authenticated/flock/journeys/$journeyId/")({
  component: JourneyPage,
});

function JourneyPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateJourneys();
  const { journeyId } = Route.useParams();
  const { data: card, isLoading } = useJourneyView(journeyId);
  const { data: updates } = useJourneyViewUpdates(journeyId);
  const { data: access } = useJourneyAccess();
  const { data: clips } = useJourneyClips(journeyId, !!card);
  const mine = !!card?.is_mine;
  const { data: own } = useJourney(mine ? journeyId : "");
  const diet = card?.template_slug === "diet-conversion";
  const { data: weight } = useWeightCheck(journeyId, mine && diet && card?.status !== "finished");
  // Tips from members who finished this template, on your own active journeys.
  const { data: finisherTips } = useFinisherTips(card?.template_slug, mine && card?.status === "active");
  const { data: templates } = useJourneyTemplates();
  const dietTips = diet && mine ? (templates?.find((x) => x.slug === "diet-conversion")?.tips ?? []) : [];
  const [vetBusy, setVetBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoading && !card) {
    return (
      <FlockSubPage title={t("flock.journeys.page.missingTitle", "Journey not found")} fallback="/flock/journeys">
        <FlockEmpty icon={<Check className="size-6" />} title={t("flock.journeys.page.missingTitle", "Journey not found")}>
          {t("flock.journeys.page.missing", "This journey isn't available.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }

  const withClips = (updates ?? []).filter((u) => u.has_clip);
  const canCompare = withClips.length >= 2;
  const weightPaused = own?.status === "paused" && own.paused_reason === "weight_drop";
  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); await invalidate(); }
    catch { setError(t("flock.journeys.page.error", "We couldn't save that. Check your connection and try again.")); }
  };
  const right = card && (mine ? (
    <button type="button" onClick={() => setMenu(true)} aria-label={t("flock.journeys.page.menu", "Journey options")} data-testid="journey-menu-button"
      className="grid size-11 place-items-center rounded-full" style={{ background: K.forestDeep, color: "#fff" }}>
      <MoreHorizontal className="size-5" aria-hidden="true" />
    </button>
  ) : access?.can_share ? (
    <button type="button" data-testid="follow" aria-pressed={card.following}
      onClick={() => void act(() => followJourney(journeyId, !card.following))}
      className="min-h-[40px] rounded-full px-4 text-[14px] font-[700]"
      style={card.following ? { background: "transparent", border: "1.5px solid #9bcab8", color: "#fff" } : { background: K.sunflower, color: K.forest }}>
      {card.following ? t("flock.journeys.page.following", "Following") : t("flock.journeys.page.follow", "Follow")}
    </button>
  ) : null);

  return (
    <FlockSubPage
      title={card ? `${card.bird_name} · ${card.skill}` : " "}
      line={card ? t("flock.journeys.page.line", "Day {{day}} · {{count}} following", { day: journeyDay(card.started_at, card.finished_at ? new Date(card.finished_at) : undefined), count: card.followers }) : " "}
      fallback="/flock/journeys"
      right={right}
    >
      <div data-testid="journey-page" className="flex flex-col gap-3">
        {card && (
          <>
            <div className="flex gap-1" aria-hidden="true" data-testid="progress-bar">
              {Array.from({ length: card.total }, (_, i) => <span key={i} className="h-2 flex-1 rounded-full" style={{ background: i < card.done ? K.moss : "#dfe7dd" }} />)}
            </div>
            <p className="m-0 text-[15px]" style={{ color: K.forest }} data-testid="journey-progress">
              <b>{t("flock.journeys.page.of", "{{done}} of {{total}}", { done: card.done, total: card.total })}</b>
              {card.next_title ? t("flock.journeys.page.next", " · next: {{next}}", { next: card.next_title }) : ""}
            </p>
          </>
        )}

        {mine && own && diet && weight && <WeightCard journey={own} birdName={card!.bird_name} weight={weight} paused={weightPaused} />}
        {mine && card?.status === "paused" && !weightPaused && (
          <p className="m-0 rounded-[14px] px-3.5 py-2.5 text-[14px]" style={{ background: K.amberBg, color: K.amberText }} data-testid="paused-note">
            {t("flock.journeys.page.paused", "This journey is paused.")}
          </p>
        )}

        {mine && own && diet && showVetReminder(own) && (
          <VetReminderCard busy={vetBusy}
            onTalked={() => { setVetBusy(true); void act(() => setVetCheck(journeyId, "talked")).finally(() => setVetBusy(false)); }}
            onLater={() => { setVetBusy(true); void act(() => setVetCheck(journeyId, "remind_later")).finally(() => setVetBusy(false)); }} />
        )}
        {mine && diet && card?.status !== "finished" && <HowToMakeItWork tips={dietTips} />}

        {mine && card?.status === "active" && <FinisherTipsCard skill={card.skill} tips={finisherTips} />}

        {(mine && card?.status === "active") || canCompare ? (
          <div className="flex gap-2.5">
            {mine && card?.status === "active" && (
              <Link to="/flock/journeys/$journeyId/post" params={{ journeyId }} search={{}} data-testid="post-update"
                className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-full border-2 px-4 text-[15px] font-[700]"
                style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}>
                {t("flock.journeys.page.post", "Post an update")}
              </Link>
            )}
            {canCompare && (
              <KyaSecondaryButton className="flex-1" onClick={() => void navigate({ to: "/flock/journeys/$journeyId/compare", params: { journeyId }, search: {} })}>
                {t("flock.journeys.page.compare", "Day one vs. now")}
              </KyaSecondaryButton>
            )}
          </div>
        ) : null}
        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}

        {withClips.length === 0 ? (
          <p className="m-0 text-[14.5px]" style={{ color: K.quiet }} data-testid="no-clips">{t("flock.journeys.page.noClips", "No clips yet. Each update adds one here.")}</p>
        ) : (
          <div className="-mx-4 grid grid-cols-3 gap-[2px]" data-testid="clip-grid">
            {withClips.map((u) => (
              <ClipTile key={u.update_id} testId={u.update_id} thumbnail={clips?.[u.update_id]?.thumbnail}
                date={shortDay(t, u.created_at, i18n.language)}
                tag={u.is_milestone ? "milestone" : u.is_question ? "question" : u.is_day_one ? "day_one" : null}
                onOpen={() => void navigate({ to: "/flock/journeys/$journeyId/story", params: { journeyId }, search: { u: u.update_id } })} />
            ))}
          </div>
        )}
        {diet && card && <DietDisclaimer birdName={card.bird_name} className="pt-2" />}
      </div>
      {menu && card && (
        <JourneyMenuSheet status={card.status} visibility={card.visibility} canShare={!!access?.can_share} clipCount={withClips.length}
          onClose={() => setMenu(false)}
          onPause={() => { setMenu(false); void act(() => setJourneyStatus(journeyId, "paused")); }}
          onResume={() => { setMenu(false); void act(() => setJourneyStatus(journeyId, "active")); }}
          onHappy={() => { setMenu(false); void act(() => setJourneyStatus(journeyId, "happy_where_we_are")); }}
          onVisibility={(v) => { setMenu(false); void act(() => setJourneyVisibility(journeyId, v)); }}
          onDelete={async () => {
            setMenu(false);
            try { await deleteJourney({ data: { journeyId } }); await invalidate(); void navigate({ to: "/flock/journeys", replace: true }); }
            catch { setError(t("flock.journeys.page.deleteError", "We couldn't delete this journey. Try again in a moment.")); }
          }} />
      )}
    </FlockSubPage>
  );
}

/** Diet conversion: weigh-ins since the start with the 3-weigh-in average as
 *  a line, readings left out (and why), the heads-up, the re-weigh after a
 *  sudden drop, a nudge after missed days, and the pause (resume only after
 *  confirming the vet call). The database decides all of it
 *  (journey_weight_check); this only draws. */
function WeightCard({ journey, birdName, weight, paused }: { journey: Journey; birdName: string; weight: WeightCheck; paused: boolean }) {
  const { t, i18n } = useTranslation();
  const invalidate = useInvalidateJourneys();
  const { data: entries } = useBirdWeights(journey.bird_id, weight.window_from ?? journey.started_at);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const excludedAt = new Map((weight.excluded ?? []).map((x) => [new Date(x.measured_at).getTime(), x.reason]));
  const pts = (entries ?? []).slice(-14).map((p) => ({ ...p, counted: !excludedAt.has(new Date(p.measured_at).getTime()) }));
  const avg = rollingAverage(pts, 3);
  const all = [...pts.map((p) => p.grams), ...(weight.start_grams != null ? [weight.start_grams] : [])];
  const max = Math.max(...all, 1);
  const min = Math.min(...all);
  const span = Math.max(1, max - min);
  const y = (g: number) => 100 - (20 + ((g - min) / span) * 80);
  const line = avg.map((a, i) => (a == null ? null : `${((i + 0.5) / pts.length) * 100},${y(a)}`)).filter(Boolean).join(" ");
  const day = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
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
          {weight.avg_grams == null
            ? t("flock.journeys.weight.startOnly", "Starting weight {{start}} g", { start: weight.start_grams })
            : t("flock.journeys.weight.lineAvg", "Starting weight {{start}} g · 3-day average {{avg}} g", { start: weight.start_grams, avg: weight.avg_grams })}
        </p>
      )}
      {pts.length > 1 && (
        <div className="relative h-14" aria-hidden="true" data-testid="weight-chart">
          <div className="absolute inset-0 flex items-end gap-1">
            {pts.map((p) => (
              <span key={p.measured_at} className="flex-1 rounded-t-[4px]" data-counted={p.counted}
                style={{ height: `${20 + ((p.grams - min) / span) * 80}%`, background: p.counted ? K.paleGreen : "#eceeea", outline: p.counted ? undefined : "1px dashed #c9d3c8" }} />
            ))}
          </div>
          {line && (
            <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" data-testid="weight-avg-line">
              <polyline points={line} fill="none" stroke={K.moss} strokeWidth={2.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          )}
        </div>
      )}
      {pts.length > 1 && (
        <p className="m-0 flex items-center gap-1.5 text-[12.5px]" style={{ color: K.quiet }}>
          <span className="inline-block h-[3px] w-4 rounded-full" style={{ background: K.moss }} aria-hidden="true" />
          {t("flock.journeys.weight.avgKey", "3-day average")}
        </p>
      )}
      {(weight.excluded ?? []).filter((x) => x.reason === "other_time").slice(-3).map((x) => (
        <p key={x.measured_at} className="m-0 text-[12.5px]" style={{ color: K.quiet }} data-testid="weight-not-counted">
          {t("flock.journeys.weight.notCountedAt", "{{day}} · {{grams}} g · Not counted: weighed at a different time than usual.", { day: day(x.measured_at), grams: x.grams })}
        </p>
      ))}
      {weight.missed && !paused && <WeighTodayCard birdId={journey.bird_id} birdName={birdName} />}
      {weight.recheck && !paused && (
        <div className="flex flex-col gap-2.5 rounded-[12px] px-3 py-2.5" style={{ background: K.amberBg }} data-testid="weight-recheck">
          <p className="m-0 text-[14px] leading-[1.45]" style={{ color: K.amberText }}>
            {t("flock.journeys.weight.recheck", "That's a big change from last time. Weigh {{name}} again to double-check?", { name: birdName })}
          </p>
          <Link to="/birds/$birdId/weight" params={{ birdId: journey.bird_id }} search={{ log: true }}
            className="inline-flex min-h-[44px] items-center justify-center self-start rounded-full border-2 bg-white px-4 text-[14.5px] font-[700]"
            style={{ borderColor: K.forest, color: K.forest }}>
            {t("flock.journeys.weight.weighAgain", "Weigh {{name}} again", { name: birdName })}
          </Link>
        </div>
      )}
      {weight.level === "notice" && !paused && (
        <p className="m-0 rounded-[12px] px-3 py-2.5 text-[14px] leading-[1.45]" style={{ background: K.amberBg, color: K.amberText }} data-testid="weight-notice">
          {t("flock.journeys.weight.notice", "{{name}}'s weight is down a little from the start. Keep weighing every day, and go slower if it keeps dropping.", { name: birdName })}
        </p>
      )}
      {paused && (
        <div className="flex flex-col gap-2.5 rounded-[12px] p-3" style={{ background: "#fbe9e7" }} data-testid="weight-paused" data-kind={weight.pause_kind ?? "drop"}>
          <p className="m-0 flex gap-2 text-[14.5px] font-[700] leading-[1.45]" style={{ color: K.red }}>
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {weight.pause_kind === "sudden"
              ? t("flock.journeys.weight.pausedSudden", "{{name}}'s weight dropped quickly. Put the usual food back and call your avian vet today.", { name: birdName })
              : t("flock.journeys.weight.paused", "{{name}}'s weight has dropped. Put the usual food back and call your avian vet before going further.", { name: birdName })}
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
