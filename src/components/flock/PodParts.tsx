import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, PartyPopper, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading, KyaPrimaryButton, KyaSecondaryButton, KyaSheet } from "@/components/kya";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { useAvatarUrls } from "@/lib/flockData";
import {
  podRefusal, podStillNeeded, podUnwait, podWait, useInvalidatePods,
  type JourneyPodState, type Pod, type PodMember, type PodRefusal, type PodStage,
} from "@/lib/flockPods";

// Buddy pods (backlog 1.11; mockup SpecPods.dc.html): the opt-in on the
// journey setup screen (screen 1), the waiting card on your journey (screen
// 2), and the pod page's members with their stage, the weekly check-in and
// "You finished!" (screen 3; the last isn't in the mockup and is built from
// the same cards). No "Keep going together?" and no buddy groups: a pod just
// closes when everyone has finished or left (Brittany, Nov 24, 2026).

const AVATAR_TINTS = [K.sunflower, K.teal, "#c7a7d9", "#d9a07b", K.lime, "#f6c9c4"];

export function podRefusalLine(t: TFunction, r: PodRefusal): string {
  switch (r) {
    case "limit": return t("flock.pods.errLimit", "You're in two buddy pods already, the most at once. Leave one to join another.");
    case "closed": return t("flock.pods.errClosed", "This pod has ended, so it can't take new posts.");
    case "full": return t("flock.pods.errFull", "That pod is full.");
    case "blocked": return t("flock.pods.errBlocked", "Someone in that pod has a block with this member.");
    case "other": return t("flock.pods.error", "We couldn't save that. Check your connection and try again.");
  }
}

/** "Pod · 4 members · Great Lakes" style line under a pod's title. */
export function podLine(t: TFunction, pod: Pick<Pod, "member_count" | "region_name">): string {
  return [t("flock.pods.members", "{{count}} members", { count: pod.member_count }), pod.region_name].filter(Boolean).join(" · ");
}

/** "Target training pod". */
export function podTitle(t: TFunction, pod: Pick<Pod, "template_name">): string {
  return t("flock.pods.title", "{{journey}} pod", { journey: pod.template_name });
}

/** Screen 1: "Pair me with buddies working on this too". */
export function PodOptIn({ on, onChange, disabled, justMe }: { on: boolean; onChange: (v: boolean) => void; disabled: boolean; justMe: boolean }) {
  const { t } = useTranslation();
  return (
    <button type="button" role="checkbox" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} data-testid="pod-opt-in"
      className="flex w-full items-start gap-2.5 rounded-[18px] bg-white px-4 py-3.5 text-left disabled:opacity-60"
      style={{ border: on ? `2px solid ${K.forest}` : "2px solid transparent", color: K.forest }}>
      <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-[7px]"
        style={on ? { background: K.forest } : { border: "2px solid #c9d3c8" }}>
        {on && <Check className="size-4 text-white" strokeWidth={2.5} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[14.5px] font-[700] leading-[1.25]">{t("flock.pods.optIn", "Pair me with buddies working on this too")}</span>
        <span className="text-[12.5px] leading-[1.45]" style={{ color: "#4f6b60" }}>
          {disabled
            ? t("flock.pods.optInLimit", "You're in two buddy pods already, the most at once.")
            : t("flock.pods.optInLine", "A small group of 3 to 6 members on the same skill, from your chapter when possible. You can leave anytime.")}
        </span>
        {on && justMe && (
          <span className="text-[12.5px] leading-[1.45]" style={{ color: "#4f6b60" }} data-testid="pod-just-me">
            {t("flock.pods.optInJustMe", "Your buddies see your name and that you're on this skill, but not where you are on it.")}
          </span>
        )}
      </span>
    </button>
  );
}

/** Screen 2, and its neighbours: the pod card at the top of your own journey. */
export function JourneyPodCard({ journeyId, state }: { journeyId: string; state: JourneyPodState }) {
  const { t } = useTranslation();
  const invalidate = useInvalidatePods();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); await invalidate(); }
    catch (e) { setError(podRefusalLine(t, podRefusal(e))); }
    finally { setBusy(false); }
  };
  if (state.state === "waiting") {
    const needed = podStillNeeded(state.waiting);
    return (
      <section className="flex flex-col gap-2 rounded-[18px] px-4 py-3.5" style={{ background: K.lime, color: K.forest }} data-testid="pod-waiting">
        <div className="flex items-center gap-2.5">
          <Users className="size-[22px] shrink-0" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[15.5px] font-[700] leading-[1.25]">{t("flock.pods.finding", "We're finding your buddies")}</span>
            <span className="text-[13px] leading-[1.45]" style={{ color: "#4f6b60" }}>
              {needed > 0
                ? t("flock.pods.findingLine", "Your pod starts when 3 members are ready. {{count}} so far.", { count: Math.max(1, state.waiting) })
                : t("flock.pods.findingSoon", "Your pod starts as soon as we can match you.")}
            </span>
          </div>
        </div>
        <button type="button" disabled={busy} onClick={() => void act(() => podUnwait(journeyId))} data-testid="pod-leave-waitlist"
          className="self-start text-[13px] font-[700] disabled:opacity-60" style={{ color: K.moss }}>
          {t("flock.pods.leaveWaitlist", "Leave the waitlist")}
        </button>
        {error && <p role="alert" className="m-0 text-[13.5px]" style={{ color: K.red }}>{error}</p>}
      </section>
    );
  }
  if (state.state === "pod" && state.pod_id) {
    return (
      <Link to="/flock/pods/$podId" params={{ podId: state.pod_id }} data-testid="pod-link"
        className="flex min-h-[56px] items-center gap-2.5 rounded-[18px] px-4 py-3" style={{ background: K.lime, color: K.forest }}>
        <Users className="size-[22px] shrink-0" aria-hidden="true" />
        <span className="flex-1 text-[15px] font-[700]">{t("flock.pods.yourPod", "Your buddy pod")}</span>
        <span className="text-[13px] font-[700]" style={{ color: K.moss }}>{t("flock.pods.open", "Open")}</span>
      </Link>
    );
  }
  if (state.state === "offer") {
    return (
      <section className="flex flex-col gap-2.5 rounded-[18px] bg-white px-4 py-3.5" style={{ color: K.forest }} data-testid="pod-offer">
        <span className="text-[15px] font-[700] leading-[1.25]">{t("flock.pods.offerTitle", "Your buddy pod has closed")}</span>
        <span className="text-[13.5px] leading-[1.45]" style={{ color: "#4f6b60" }}>{t("flock.pods.offerLine", "It got quiet, so we closed it. Want to be paired with new buddies on this journey?")}</span>
        <KyaPrimaryButton disabled={busy || !state.can_wait} onClick={() => void act(() => podWait(journeyId))}>{t("flock.pods.offerCta", "Find new buddies")}</KyaPrimaryButton>
        {!state.can_wait && <span className="text-[12.5px]" style={{ color: K.quiet }}>{t("flock.pods.optInLimit", "You're in two buddy pods already, the most at once.")}</span>}
        {state.pod_id && (
          <Link to="/flock/pods/$podId" params={{ podId: state.pod_id }} data-testid="pod-read-old"
            className="self-center text-[13px] font-[700]" style={{ color: K.moss }}>
            {t("flock.pods.readOldPod", "Read the old pod")}
          </Link>
        )}
        {error && <p role="alert" className="m-0 text-[13.5px]" style={{ color: K.red }}>{error}</p>}
      </section>
    );
  }
  return null;
}

/** One pill per stage (light gray-green, forest, pale sunflower). */
const STAGE_PILL: Record<PodStage, { background: string; color: string }> = {
  working: { background: K.paleGreen, color: K.forest },
  learned: { background: K.forest, color: "#ffffff" },
  happy: { background: K.amberBg, color: K.forest },
};

export function podStageLabel(t: TFunction, stage: PodStage): string {
  switch (stage) {
    case "working": return t("flock.pods.stageWorking", "Working on it");
    case "learned": return t("flock.pods.stageLearned", "Learned it");
    case "happy": return t("flock.pods.stageHappy", "Happy where we are");
  }
}

/** Screen 3: each member with their bird and where they are on the journey
 *  (when it may show). */
export function PodMembersCard({ members }: { members: PodMember[] }) {
  const { t } = useTranslation();
  const { data: avatars } = useAvatarUrls(members.map((m) => m.photo_path));
  return (
    <section className="flex flex-col gap-2.5 rounded-[18px] bg-white px-4 py-3.5" data-testid="pod-members">
      {members.map((m, i) => {
        const name = m.is_me ? t("flock.pods.you", "You") : (m.display_name ?? t("flock.pods.member", "Member"));
        return (
          <div key={m.user_id} className="flex items-center gap-2.5" data-member={m.user_id}>
            <span className="shrink-0 rounded-full" style={{ background: AVATAR_TINTS[i % AVATAR_TINTS.length] }}>
              <FlockAvatar name={m.display_name ?? "?"} url={m.photo_path ? avatars?.get(m.photo_path) : null} size={36} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-[700] leading-[1.25]" style={{ color: K.forest }}>
              {[name, m.bird_name].filter(Boolean).join(" · ")}
            </span>
            {m.stage == null ? (
              <span className="shrink-0 text-[12px]" style={{ color: K.quiet }} data-testid="stage-private">
                {t("flock.pods.stagePrivate", "Journey kept private")}
              </span>
            ) : (
              <span className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-[700]" style={STAGE_PILL[m.stage]}
                data-testid="pod-stage" data-stage={m.stage}>
                {podStageLabel(t, m.stage)}
              </span>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** "This week · How did … go?" (in-app only: no push or email). */
export function PodWeeklyCard({ pod, onCheckIn }: { pod: Pod; onCheckIn: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col items-start gap-2 rounded-[18px] px-4 py-3.5" style={{ background: K.lime, color: K.forest }} data-testid="pod-weekly">
      <span className="text-[11.5px] font-[700] uppercase tracking-[.06em]" style={{ color: K.moss }}>{t("flock.pods.thisWeek", "This week")}</span>
      <span className="text-[15px] font-[700] leading-[1.25]">{weeklyQuestion(t, pod)}</span>
      <button type="button" onClick={onCheckIn} data-testid="pod-check-in"
        className="min-h-[44px] rounded-full px-4 text-[14px] font-[700] text-white" style={{ background: K.forest }}>
        {t("flock.pods.checkIn", "Check in")}
      </button>
    </section>
  );
}

export function weeklyQuestion(t: TFunction, pod: Pick<Pod, "template_name">): string {
  return t("flock.pods.weekly", "How did {{journey}} go?", { journey: pod.template_name.toLowerCase() });
}

/** Not in the mockup: shown once your journey has ended (learned it or happy
 *  where you are), until you stay or leave. */
export function PodFinishedCard({ busy, onStay, onLeave }: { busy: boolean; onStay: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-col gap-2.5 rounded-[18px] bg-white px-4 py-3.5" style={{ color: K.forest, border: `2px solid ${K.sunflower}` }} data-testid="pod-finished">
      <div className="flex items-center gap-2.5">
        <PartyPopper className="size-[22px] shrink-0" style={{ color: K.amberText }} aria-hidden="true" />
        <span className="text-[16px] font-[700] leading-[1.25]">{t("flock.pods.finishedTitle", "You finished!")}</span>
      </div>
      <span className="text-[13.5px] leading-[1.45]" style={{ color: "#4f6b60" }}>
        {t("flock.pods.finishedLine", "Stay in the pod to cheer the others on, or leave whenever you like.")}
      </span>
      <div className="flex gap-2.5">
        <div className="flex-1"><KyaPrimaryButton disabled={busy} onClick={onStay}>{t("flock.pods.stay", "Stay and cheer")}</KyaPrimaryButton></div>
        <KyaSecondaryButton className="flex-1" disabled={busy} onClick={onLeave}>{t("flock.pods.leave", "Leave pod")}</KyaSecondaryButton>
      </div>
    </section>
  );
}

/** Leave pod: quiet, and the others see only one fewer member. */
export function LeavePodSheet({ busy, error, onLeave, onClose }: { busy: boolean; error: string | null; onLeave: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<KyaHeading size={23}>{t("flock.pods.leaveTitle", "Leave this pod?")}</KyaHeading>}>
      <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
        {error ?? t("flock.pods.leaveLine", "The others won't be told. They'll just see one fewer member. Your journey keeps going as it is.")}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button type="button" data-testid="pod-leave-confirm" disabled={busy} onClick={onLeave}
          className="min-h-[52px] rounded-full text-[16px] font-[700] text-white disabled:opacity-60" style={{ background: K.red }}>{t("flock.pods.leave", "Leave pod")}</button>
        <button type="button" onClick={onClose} className="min-h-[52px] rounded-full border text-[16px] font-[700]" style={{ borderColor: "#c9d3c8", color: K.forest }}>
          {t("flock.posts.cancel", "Cancel")}
        </button>
      </div>
    </KyaSheet>
  );
}
