import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { LoadMore, PostList } from "@/components/flock/PostFeed";
import {
  LeavePodSheet, PodFinishedCard, PodMembersCard, PodWeeklyCard, podLine, podRefusalLine, podTitle,
} from "@/components/flock/PodParts";
import {
  leavePod, podFinishedSeen, podOpen, podRefusal, showWeeklyCard, useInvalidatePods, usePod, usePodFeed, usePodMembers,
} from "@/lib/flockPods";

// A buddy pod (backlog 1.11; SpecPods.dc.html, screen 3): the members with
// their birds and where each is on the journey, the weekly "How did … go?"
// card, the pod's own feed (posts only the pod sees), and a quiet Leave pod.
// Once your journey ends (learned it or happy where you are): "You
// finished!". The pod closes once everyone has finished or left, and stays
// readable. The database decides who's in it and what shows
// (flock_pod, flock_pod_members, flock_pod_feed).
export const Route = createFileRoute("/_authenticated/flock/pods/$podId/")({
  component: PodPage,
});

function PodPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidatePods();
  const { podId } = Route.useParams();
  const { data: pod, isLoading } = usePod(podId);
  const { data: members } = usePodMembers(podId, !!pod);
  const feed = usePodFeed(podId, !!pod);
  const posts = feed.data?.pages.flat() ?? [];
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <FlockSubPage title=" " fallback="/flock/pods">
        <div className="grid min-h-[120px] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-7 animate-spin" style={{ color: K.moss }} /></div>
      </FlockSubPage>
    );
  }
  if (!pod) {
    return (
      <FlockSubPage title={t("flock.pods.missingTitle", "Pod not found")} fallback="/flock/pods">
        <FlockEmpty icon={<Users className="size-6" />} title={t("flock.pods.missingTitle", "Pod not found")}>
          {t("flock.pods.missing", "This pod isn't available.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }

  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try { await fn(); await invalidate(); after?.(); }
    catch (e) { setError(podRefusalLine(t, podRefusal(e))); }
    finally { setBusy(false); }
  };
  const leave = () => void act(() => leavePod(podId), () => { setLeaving(false); void navigate({ to: "/flock/pods", replace: true }); });
  const checkIn = () => void navigate({ to: "/flock/pods/$podId/post", params: { podId } });
  const open = podOpen(pod.status);

  return (
    <FlockSubPage title={podTitle(t, pod)} line={podLine(t, pod)} fallback="/flock/pods">
      <div className="flex flex-col gap-3" data-testid="pod-page" data-status={pod.status}>
        {!open && (
          <p className="m-0 rounded-[14px] px-3.5 py-2.5 text-[14px] leading-[1.45]" style={{ background: K.amberBg, color: K.amberText }} data-testid="pod-ended">
            {pod.status === "dissolved"
              ? t("flock.pods.endedQuiet", "This pod has closed because it got quiet. You can still read what everyone shared.")
              : t("flock.pods.ended", "This pod has closed. You can still read what everyone shared.")}
          </p>
        )}
        {pod.my_finished && open && (
          <PodFinishedCard busy={busy} onStay={() => void act(() => podFinishedSeen(podId))} onLeave={() => setLeaving(true)} />
        )}
        {members && members.length > 0 && <PodMembersCard members={members} />}
        {showWeeklyCard(pod) && <PodWeeklyCard pod={pod} onCheckIn={checkIn} />}
        {error && <p role="alert" className="m-0 text-[14.5px]" style={{ color: K.red }}>{error}</p>}

        {posts.length === 0 && !feed.isLoading ? (
          <p className="m-0 text-[14.5px] leading-[1.45]" style={{ color: K.quiet }} data-testid="pod-feed-empty">
            {open
              ? t("flock.pods.feedEmpty", "Nothing here yet. Check in to tell your buddies how it's going.")
              : t("flock.pods.feedEmptyEnded", "Nobody posted in this pod.")}
          </p>
        ) : (
          <div className="flex flex-col gap-3" data-testid="pod-feed">
            <PostList posts={posts} />
            <LoadMore hasMore={!!feed.hasNextPage} loading={feed.isFetchingNextPage} onMore={() => void feed.fetchNextPage()} />
          </div>
        )}
        {open && !showWeeklyCard(pod) && (
          <button type="button" onClick={checkIn} data-testid="pod-post"
            className="min-h-[48px] rounded-full border-2 px-4 text-[15px] font-[700]" style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}>
            {t("flock.pods.post", "Post to the pod")}
          </button>
        )}
        {open && (
          <button type="button" onClick={() => setLeaving(true)} data-testid="pod-leave"
            className="min-h-[44px] self-center text-[13px] font-[700]" style={{ color: "#4f6b60" }}>
            {t("flock.pods.leave", "Leave pod")}
          </button>
        )}
      </div>
      {leaving && <LeavePodSheet busy={busy} error={error} onLeave={leave} onClose={() => { setLeaving(false); setError(null); }} />}
    </FlockSubPage>
  );
}
