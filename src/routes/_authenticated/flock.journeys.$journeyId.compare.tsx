import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { K, KyaHeading, KyaSheet } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { useJourneyClips, useJourneyView, useJourneyViewMilestones, useJourneyViewUpdates, type ViewUpdate } from "@/lib/journeyData";
import { journeyDays } from "@/lib/journeys";

// Day one vs. now (Batch 4, screen 2): two clips side by side, Play both, Slow
// motion, Pick clips, and a short factual summary. Where the browser plays
// HLS itself (Safari, the iPhone app) the clips are <video> elements, so
// "Play both" starts them together and "Slow motion" halves the speed;
// elsewhere they're the Stream player and "Play both" starts both players
// (no slow motion there). "Share this comparison" comes later.
export const Route = createFileRoute("/_authenticated/flock/journeys/$journeyId/compare")({
  validateSearch: (s: Record<string, unknown>): { a?: string; b?: string } => ({
    a: typeof s.a === "string" ? s.a : undefined,
    b: typeof s.b === "string" ? s.b : undefined,
  }),
  component: Compare,
});

function Compare() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { journeyId } = Route.useParams();
  const { a, b } = Route.useSearch();
  const { data: card } = useJourneyView(journeyId);
  const { data: updates } = useJourneyViewUpdates(journeyId);
  const { data: milestones } = useJourneyViewMilestones(journeyId);
  const { data: clips } = useJourneyClips(journeyId, !!card);
  const withClips = [...(updates ?? [])].filter((u) => u.has_clip).reverse(); // oldest first
  const left = withClips.find((u) => u.update_id === a) ?? withClips.find((u) => u.is_day_one) ?? withClips[0];
  const right = withClips.find((u) => u.update_id === b) ?? withClips[withClips.length - 1];
  const [hls, setHls] = useState(false);
  const [slow, setSlow] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [picking, setPicking] = useState<"a" | "b" | null>(null);
  const va = useRef<HTMLVideoElement>(null);
  const vb = useRef<HTMLVideoElement>(null);
  useEffect(() => { setHls(typeof document !== "undefined" && document.createElement("video").canPlayType("application/vnd.apple.mpegurl") !== ""); }, []);
  useEffect(() => { for (const v of [va.current, vb.current]) if (v) v.playbackRate = slow ? 0.5 : 1; }, [slow, left, right]);

  const day = (u: ViewUpdate) => new Date(u.created_at).toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  const labelOf = (u: ViewUpdate, side: "a" | "b") => side === "a" && u.is_day_one
    ? t("flock.journeys.compare.dayOne", "{{date}} · day one", { date: day(u) })
    : t("flock.journeys.compare.on", "{{date}}", { date: day(u) });
  const reached = (milestones ?? []).filter((m) => m.state === "reached").length;
  const days = card ? journeyDays(card.started_at, card.finished_at) : 0;
  const sessions = (updates ?? []).length;

  const playBoth = () => {
    if (hls) { for (const v of [va.current, vb.current]) if (v) { v.currentTime = 0; v.playbackRate = slow ? 0.5 : 1; void v.play().catch(() => {}); } }
    else setPlayKey((k) => k + 1);
  };
  const pane = (u: ViewUpdate | undefined, side: "a" | "b") => {
    const c = u ? clips?.[u.update_id] : undefined;
    return (
      <div className="relative aspect-[9/16] flex-1 overflow-hidden rounded-[14px]" style={{ background: "linear-gradient(180deg,#3b5d4c,#1d3328)" }} data-testid={`compare-${side}`} data-update={u?.update_id}>
        {c && (hls ? (
          <video ref={side === "a" ? va : vb} src={c.hls} poster={c.thumbnail} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
        ) : (
          <iframe key={`${u!.update_id}-${playKey}`} src={`${c.player}?muted=true&preload=true${playKey ? "&autoplay=true" : ""}`} title={labelOf(u!, side)}
            className="absolute inset-0 size-full border-0" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" />
        ))}
        {u && <span className="absolute bottom-2 left-2 text-[11.5px] font-[700] text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,.5)" }}>{labelOf(u, side)}</span>}
      </div>
    );
  };
  const chip = (label: string, onClick: () => void, on = false, testId?: string) => (
    <button type="button" onClick={onClick} aria-pressed={on} data-testid={testId}
      className="min-h-[40px] rounded-full px-3.5 text-[13.5px] font-[700]"
      style={on ? { background: K.forest, color: "#fff" } : { background: "#fff", color: K.forest, border: "1px solid #c9d3c8" }}>{label}</button>
  );

  return (
    <FlockSubPage title={t("flock.journeys.compare.title", "Day one vs. now")} line={card ? `${card.bird_name} · ${card.skill}` : " "} fallback={`/flock/journeys/${journeyId}`}>
      <div className="flex flex-col gap-3" data-testid="compare">
        <div className="flex gap-2">{pane(left, "a")}{pane(right, "b")}</div>
        <div className="flex flex-wrap justify-center gap-2">
          {chip(t("flock.journeys.compare.playBoth", "Play both"), playBoth, false, "play-both")}
          {hls && chip(t("flock.journeys.compare.slow", "Slow motion"), () => setSlow((s) => !s), slow, "slow")}
          {chip(t("flock.journeys.compare.pick", "Pick clips"), () => setPicking("a"), false, "pick")}
        </div>
        <p className="m-0 rounded-[16px] bg-white p-3.5 text-[14.5px] leading-[1.45]" style={{ color: K.ink }} data-testid="compare-summary">
          {t("flock.journeys.compare.summary", "{{days}} days, {{sessions}} sessions, {{milestones}} milestones.", { days, sessions, milestones: reached })}
        </p>
      </div>
      {picking && (
        <KyaSheet onClose={() => setPicking(null)} closeLabel={t("flock.region.close", "Close")}
          title={<KyaHeading size={23}>{picking === "a" ? t("flock.journeys.compare.pickLeft", "Pick the first clip") : t("flock.journeys.compare.pickRight", "Pick the second clip")}</KyaHeading>}>
          <div className="grid grid-cols-3 gap-1.5" data-testid="pick-sheet">
            {withClips.map((u) => (
              <button key={u.update_id} type="button" data-pick={u.update_id}
                onClick={() => {
                  const next = picking === "a" ? { a: u.update_id, b: right?.update_id } : { a: left?.update_id, b: u.update_id };
                  void navigate({ to: "/flock/journeys/$journeyId/compare", params: { journeyId }, search: next, replace: true });
                  setPicking(picking === "a" ? "b" : null);
                }}
                className="relative aspect-[3/4] overflow-hidden rounded-[10px]" style={{ background: "linear-gradient(180deg,#3b5d4c,#1d3328)" }}>
                {clips?.[u.update_id]?.thumbnail && <img src={clips[u.update_id].thumbnail} alt="" className="absolute inset-0 size-full object-cover" />}
                <span className="absolute bottom-1 left-1.5 text-[11px] font-[700] text-white">{day(u)}</span>
              </button>
            ))}
          </div>
        </KyaSheet>
      )}
    </FlockSubPage>
  );
}
