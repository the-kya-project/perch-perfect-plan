import { useEffect, useId, useMemo, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Check, Scissors, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading, KyaLink, KyaPrimaryButton, KyaSheet } from "@/components/kya";
import { ClipRecorder } from "@/components/ClipRecorder";
import { ClipPlayer } from "@/components/ClipPlayer";
import { ClipState } from "@/components/flock/JourneyClipView";
import { useOwnerClipPreview } from "@/lib/useOwnerClipPreview";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { ChoiceChips, FlowFooter } from "@/components/flock/JourneyParts";
import { DietDisclaimer } from "@/components/flock/JourneyDiet";
import { getClipStatus } from "@/lib/clips.functions";
import { createJourneyClipUpload, trimJourneyClip } from "@/lib/journeyClips.functions";
import {
  postJourneyUpdate, reachMilestone, setJourneyVisibility, useClipAllowance, useInvalidateJourneys, useJourney,
  useJourneyAccess, useJourneyBirds, useJourneyTips, type JourneyMilestone,
} from "@/lib/journeyData";
import { ENGAGEMENTS, nextMilestone, possessive, visibilityChoices, wantsTip, type Engagement, type JourneyVisibility } from "@/lib/journeys";

// Post an update (JourneyFlow screens 3–5): straight to the camera with what
// you're working on, then the post (clip, trim, how into it the bird was, a
// caption or question, where it's posting), then one yes/no question about the
// next milestone, or a tip after a harder day. The uploaded clip rides in the
// URL (?clip=), so a reload keeps it; the database refuses a clip that isn't
// this bird's.
export const Route = createFileRoute("/_authenticated/flock/journeys/$journeyId/post")({
  validateSearch: (s: Record<string, unknown>): { clip?: string } => ({
    clip: typeof s.clip === "string" && /^cfstream:[A-Za-z0-9]{8,64}$/.test(s.clip) ? s.clip : undefined,
  }),
  component: PostUpdate,
});

function engagementLabel(t: TFunction, e: Engagement): string {
  switch (e) {
    case "all_in": return t("flock.journeys.post.allIn", "All in");
    case "distracted": return t("flock.journeys.post.distracted", "Distracted");
    case "not_today": return t("flock.journeys.post.notToday", "Not today");
  }
}

/** "Did Juno stay on your hand for a few seconds?" (custom journeys: the milestone in quotes). */
function milestoneQuestion(t: TFunction, bird: string, m: Pick<JourneyMilestone, "title" | "words">): string {
  return m.words?.ask
    ? t("flock.journeys.post.question", "Did {{name}} {{ask}}?", { name: bird, ask: m.words.ask })
    : t("flock.journeys.post.questionCustom", "Did {{name}} get this one? “{{title}}”", { name: bird, title: m.title });
}

function PostUpdate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { journeyId } = Route.useParams();
  const { clip } = Route.useSearch();
  const { data: journey } = useJourney(journeyId);
  const { data: birds } = useJourneyBirds();
  const { data: access } = useJourneyAccess();
  const bird = birds?.find((b) => b.id === journey?.bird_id);
  const skill = journey?.template?.name ?? journey?.custom_name ?? "";
  const next = journey ? nextMilestone(journey.milestones) : null;
  const toJourney = () => void navigate({ to: "/flock/journeys/$journeyId", params: { journeyId }, replace: true });

  if (journey && journey.status !== "active") {
    return (
      <FlockSubPage title={t("flock.journeys.post.title", "Post an update")} fallback={`/flock/journeys/${journeyId}`}>
        <p className="m-0 text-[15px]" style={{ color: K.ink }} data-testid="post-not-active">
          {t("flock.journeys.post.notActive", "This journey is paused or finished, so there's nothing to post to right now.")}
        </p>
      </FlockSubPage>
    );
  }

  return clip
    ? <Compose journeyId={journeyId} clip={clip} birdName={bird?.name ?? ""} diet={journey?.template?.slug === "diet-conversion"} next={next} visibility={journey?.visibility ?? "private"}
        canShare={!!access?.can_share} onBack={() => void navigate({ to: "/flock/journeys/$journeyId/post", params: { journeyId }, search: {}, replace: true })}
        onClip={(ref) => void navigate({ to: "/flock/journeys/$journeyId/post", params: { journeyId }, search: { clip: ref }, replace: true })} />
    : <Camera journeyId={journeyId} birdId={journey?.bird_id ?? null} birdName={bird?.name ?? ""} skill={skill} next={next}
        onClose={toJourney}
        onUploaded={(ref) => void navigate({ to: "/flock/journeys/$journeyId/post", params: { journeyId }, search: { clip: ref }, replace: true })} />;
}

/** Screen 3: the camera, with what you're working on. */
function Camera({ journeyId, birdId, birdName, skill, next, onClose, onUploaded }: {
  journeyId: string; birdId: string | null; birdName: string; skill: string; next: JourneyMilestone | null;
  onClose: () => void; onUploaded: (ref: string) => void;
}) {
  const { t } = useTranslation();
  const { data: allowance } = useClipAllowance(birdId, journeyId);
  const limits = useMemo(() => !allowance || !birdId ? undefined : {
    maxSeconds: allowance.max_seconds,
    maxBytes: allowance.max_upload_bytes,
    createUpload: ({ uploadLength }: { uploadLength: number }) => createJourneyClipUpload({ data: { uploadLength, birdId, journeyId } }),
  }, [allowance, birdId, journeyId]);
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#0f1f18", color: "#fff" }} data-testid="post-camera">
      <div className="flex items-center gap-2 px-3 pb-2 pt-[max(14px,env(safe-area-inset-top))]">
        <button type="button" aria-label={t("flock.journeys.post.close", "Close")} onClick={onClose}
          className="grid size-11 place-items-center rounded-full" style={{ background: "rgba(0,0,0,.35)" }}>
          <X className="size-5" aria-hidden="true" />
        </button>
        <span className="flex-1 text-center text-[14px] font-[700]">{birdName && skill ? `${birdName} · ${skill}` : " "}</span>
        <span className="size-11" />
      </div>
      {next && (
        <div className="mx-4 rounded-[14px] px-3.5 py-2.5 text-[13.5px] leading-[1.4]" style={{ background: "rgba(205,234,176,0.12)" }} data-testid="working-on">
          <b style={{ color: K.lime }}>{t("flock.journeys.post.workingOn", "Working on:")}</b> {next.title}
        </div>
      )}
      <div className="flex flex-1 flex-col justify-center px-4 py-4">
        {allowance && !allowance.can_add ? (
          <ClipLimitCard used={allowance.clips_used} onBack={onClose} />
        ) : birdId && limits ? (
          <div className="rounded-[22px] bg-white p-4" style={{ color: K.forest }}>
            <ClipRecorder birdId={birdId} limits={limits} onUploaded={onUploaded} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** At a journey's clip limit (free 10, app premium 20): Flock members have none. */
function ClipLimitCard({ used, onBack }: { used: number; onBack: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 rounded-[22px] bg-white p-5" style={{ color: K.forest }} data-testid="clip-limit">
      <KyaHeading size={21}>{t("flock.journeys.limit.title", "This journey has {{count}} clips", { count: used })}</KyaHeading>
      <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
        {t("flock.journeys.limit.line", "That's as many as this plan keeps on one journey. Flock members can add as many clips as they like, up to 20 minutes each.")}
      </p>
      <Link to="/flock/you/membership" className="text-[15px] font-[700]" style={{ color: K.moss }}>
        {t("flock.journeys.premium.compare", "Compare with Flock membership")}
      </Link>
      <KyaPrimaryButton onClick={onBack}>{t("flock.journeys.post.backToJourney", "Back to the journey")}</KyaPrimaryButton>
    </div>
  );
}

/** Screen 4: the post. Then screen 5 as a sheet. */
function Compose({ journeyId, clip, birdName, diet, next, visibility, canShare, onBack, onClip }: {
  journeyId: string; clip: string; birdName: string; diet: boolean; next: JourneyMilestone | null; visibility: JourneyVisibility; canShare: boolean;
  onBack: () => void; onClip: (ref: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateJourneys();
  const captionId = useId();
  const { data: tips } = useJourneyTips();
  const [engagement, setEngagement] = useState<Engagement | null>(null);
  const [caption, setCaption] = useState("");
  const [where, setWhere] = useState<JourneyVisibility>(visibility);
  const [changing, setChanging] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<Engagement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setWhere(visibility); }, [visibility]);

  const post = async () => {
    if (!engagement || busy) return;
    setBusy(true);
    setError(null);
    try {
      await postJourneyUpdate(journeyId, clip, engagement, caption);
      await invalidate();
      setPosted(engagement);
    } catch (e) {
      const msg = (e as { message?: string })?.message ?? "";
      setError(/clip limit/.test(msg)
        ? t("flock.journeys.limit.reached", "This journey has reached its clip limit.")
        : t("flock.journeys.post.error", "We couldn't post that. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  const answer = async (yes: boolean) => {
    if (!yes || !next) { void navigate({ to: "/flock/journeys/$journeyId", params: { journeyId }, replace: true }); return; }
    setBusy(true);
    try {
      const r = await reachMilestone(journeyId, next.position);
      await invalidate();
      if (r.finished) void navigate({ to: "/flock/journeys/$journeyId/finished", params: { journeyId }, replace: true });
      else void navigate({ to: "/flock/journeys/$journeyId/milestone/$position", params: { journeyId, position: String(next.position) }, replace: true });
    } catch {
      setError(t("flock.journeys.post.error", "We couldn't post that. Check your connection and try again."));
      setBusy(false);
    }
  };

  // The clip is the "cfstream:<uid>" reference: wait until Cloudflare has it
  // ready, then show it through a signed link (never the raw reference).
  const preview = useOwnerClipPreview(clip);

  // A steady tip per post: the same day shows the same tip.
  const tip = tips && tips.length ? tips[(clip.length + new Date().getDate()) % tips.length] : null;

  return (
    <FlockSubPage title={t("flock.journeys.post.title", "Post an update")} fallback={`/flock/journeys/${journeyId}`}>
      <div className="flex flex-col gap-3.5" data-testid="post-compose">
        <div className="relative overflow-hidden rounded-[16px]" style={{ background: "#1d3328" }}>
          {preview.status === "ready" && preview.url
            ? <ClipPlayer src={preview.url} label={t("flock.journeys.post.preview", "Your clip")} className="aspect-[9/16] max-h-[45vh] w-full" />
            : <div className="relative aspect-[9/16] max-h-[45vh] w-full"><ClipState phase={preview.status === "none" ? "failed" : "processing"} onRetry={() => window.location.reload()} /></div>}
          <button type="button" onClick={() => setTrimming(true)} data-testid="trim"
            className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-[700] text-white"
            style={{ background: "rgba(0,0,0,.5)" }}>
            <Scissors className="size-3.5" aria-hidden="true" />{t("flock.journeys.post.trim", "Trim")}
          </button>
        </div>
        <KyaLink onClick={onBack} className="self-start">{t("flock.journeys.post.retake", "Record a different clip")}</KyaLink>

        <span className="text-[15px] font-[700]" style={{ color: K.forest }}>{t("flock.journeys.post.howInto", "How into it was {{name}}?", { name: birdName })}</span>
        <ChoiceChips grid label={t("flock.journeys.post.howInto", "How into it was {{name}}?", { name: birdName })} testId="engagement"
          value={engagement} onChange={setEngagement} options={ENGAGEMENTS.map((e) => ({ value: e, label: engagementLabel(t, e) }))} />

        <label htmlFor={captionId} className="flex flex-col gap-1.5 text-[15px] font-[700]" style={{ color: K.forest }}>
          <span>{t("flock.journeys.post.say", "Say something")} <span className="text-[13px] font-[400]" style={{ color: K.quiet }}>{t("flock.journeys.post.sayHint", "or ask a question (optional)")}</span></span>
        </label>
        <textarea id={captionId} value={caption} maxLength={1000} rows={3} data-testid="caption" onChange={(e) => setCaption(e.target.value)}
          className="-mt-2 w-full resize-none rounded-[12px] border bg-white px-3 py-2.5 text-[15px] leading-[1.45] outline-none focus:border-[#1a3d2e]"
          style={{ borderColor: "#c9d3c8", color: K.forest }} />

        <div className="flex items-center gap-2.5 text-[13.5px]" style={{ color: K.ink }} data-testid="posting-to">
          <span className="flex-1">
            {where === "community"
              ? <>{t("flock.journeys.post.toLead", "Posting to")} <b>{t("flock.journeys.post.toCommunity", "your followers and the community")}</b></>
              : <>{t("flock.journeys.post.toLead", "Posting to")} <b>{t("flock.journeys.post.toJustMe", "just you")}</b></>}
          </span>
          {canShare && <KyaLink onClick={() => setChanging(true)}>{t("flock.setup.change", "Change")}</KyaLink>}
        </div>
        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
        {diet && birdName && <DietDisclaimer birdName={birdName} />}
      </div>
      <FlowFooter>
        <KyaPrimaryButton onClick={() => void post()} disabled={!engagement || busy}>
          {busy && !posted ? t("flock.journeys.post.posting", "Posting…") : t("flock.journeys.post.post", "Post")}
        </KyaPrimaryButton>
      </FlowFooter>

      {changing && (
        <KyaSheet onClose={() => setChanging(false)} closeLabel={t("flock.region.close", "Close")} title={<KyaHeading size={23}>{t("flock.journeys.setup.who", "Who sees it?")}</KyaHeading>}>
          <ChoiceChips label={t("flock.journeys.setup.who", "Who sees it?")} testId="change-visibility" value={where}
            onChange={async (v) => {
              try { await setJourneyVisibility(journeyId, v); setWhere(v); setChanging(false); await invalidate(); }
              catch { setError(t("flock.journeys.post.error", "We couldn't post that. Check your connection and try again.")); setChanging(false); }
            }}
            options={visibilityChoices({ can_share: canShare }).map((v) => ({ value: v, label: v === "community" ? t("flock.journeys.setup.community", "The community") : t("flock.journeys.setup.justMe", "Just me") }))} />
        </KyaSheet>
      )}

      {trimming && <TrimSheet clip={clip} onClose={() => setTrimming(false)} onTrimmed={(ref) => { setTrimming(false); onClip(ref); }} />}

      {posted && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" style={{ background: "rgba(26,61,46,0.55)" }} data-testid="after-post">
          <div className="mx-3 mb-3 flex flex-col gap-3 rounded-[22px] bg-white p-[18px]" style={{ color: K.forest }}>
            <div className="flex items-center gap-2.5">
              <span className="grid size-7 place-items-center rounded-full" style={{ background: K.moss }}><Check className="size-4 text-white" strokeWidth={3} aria-hidden="true" /></span>
              <span className="text-[15px] font-[700]">{t("flock.journeys.post.posted", "Posted to {{name}} journey", { name: possessive(birdName) })}</span>
            </div>
            {!wantsTip(posted) && next ? (
              <>
                <KyaHeading size={21}>{milestoneQuestion(t, birdName, next)}</KyaHeading>
                <div className="flex gap-2.5">
                  <div className="flex-1"><KyaPrimaryButton onClick={() => void answer(true)} disabled={busy}>{t("flock.journeys.post.yes", "Yes!")}</KyaPrimaryButton></div>
                  <button type="button" onClick={() => void answer(false)} disabled={busy}
                    className="min-h-[52px] flex-1 rounded-full border bg-white text-[15px] font-[700]" style={{ borderColor: "#c9d3c8", color: K.forest }}>
                    {t("flock.journeys.post.notYet", "Not yet")}
                  </button>
                </div>
              </>
            ) : (
              <KyaPrimaryButton onClick={() => void answer(false)}>{t("flock.journeys.post.backToJourney", "Back to the journey")}</KyaPrimaryButton>
            )}
          </div>
          {wantsTip(posted) && tip && (
            <div className="mx-3 mb-[max(28px,env(safe-area-inset-bottom))] flex flex-col gap-1.5 rounded-[22px] px-[18px] py-4" style={{ background: "#fbf3df" }} data-testid="tip">
              <span className="text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.amberText }}>{t("flock.journeys.post.tipEyebrow", "A tip for next time")}</span>
              <span className="text-[14.5px] leading-[1.45]" style={{ color: K.forest }}>{tip}</span>
            </div>
          )}
        </div>
      )}
    </FlockSubPage>
  );
}

/** Trim: pick a start and end, and get a trimmed copy to post instead. */
function TrimSheet({ clip, onClose, onTrimmed }: { clip: string; onClose: () => void; onTrimmed: (ref: string) => void }) {
  const { t } = useTranslation();
  const uid = clip.slice("cfstream:".length);
  const [duration, setDuration] = useState<number | null>(null);
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getClipStatus({ data: { uid } })
      .then((s) => { if (!live) return; const d = Math.floor(s.duration ?? 0); setDuration(d > 0 ? d : null); setRange([0, d]); })
      .catch(() => { if (live) setError(t("flock.journeys.trim.notReady", "The clip is still processing. Try trimming again in a moment.")); });
    return () => { live = false; };
  }, [uid, t]);
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await trimJourneyClip({ data: { uid, start: range[0], end: range[1] } });
      onTrimmed(r.ref);
    } catch {
      setError(t("flock.journeys.trim.error", "We couldn't trim that clip. Post it as it is, or try again."));
      setBusy(false);
    }
  };
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<KyaHeading size={23}>{t("flock.journeys.trim.title", "Trim the clip")}</KyaHeading>}>
      <div className="flex flex-col gap-3" data-testid="trim-sheet">
        {duration ? (
          <>
            <label className="flex flex-col gap-1 text-[14px] font-[700]" style={{ color: K.forest }}>
              {t("flock.journeys.trim.start", "Start at {{time}}", { time: fmt(range[0]) })}
              <input type="range" min={0} max={duration} value={range[0]} onChange={(e) => setRange(([, b]) => [Math.min(Number(e.target.value), b - 1), b])} />
            </label>
            <label className="flex flex-col gap-1 text-[14px] font-[700]" style={{ color: K.forest }}>
              {t("flock.journeys.trim.end", "End at {{time}}", { time: fmt(range[1]) })}
              <input type="range" min={0} max={duration} value={range[1]} onChange={(e) => setRange(([a]) => [a, Math.max(Number(e.target.value), a + 1)])} />
            </label>
            <KyaPrimaryButton onClick={() => void save()} disabled={busy || (range[0] === 0 && range[1] === duration)}>
              {busy ? t("flock.journeys.trim.saving", "Trimming…") : t("flock.journeys.trim.save", "Use this part")}
            </KyaPrimaryButton>
          </>
        ) : !error ? (
          <p className="m-0 text-[15px]" style={{ color: K.quiet }}>{t("flock.journeys.trim.loading", "Getting the clip ready…")}</p>
        ) : null}
        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
      </div>
    </KyaSheet>
  );
}
