import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { podLine, podTitle } from "@/components/flock/PodParts";
import { useIsAdmin } from "@/lib/flockData";
import { useMyPods, type MyPodRow } from "@/lib/flockPods";

// Your buddy pods (backlog 1.11), from Flock settings: the journeys you're
// waiting on, then your pods (open ones first). Not in the mockup; laid out
// like the other settings lists.
export const Route = createFileRoute("/_authenticated/flock/pods/")({
  component: MyPods,
});

function MyPods() {
  const { t } = useTranslation();
  const { data: rows, isLoading } = useMyPods();
  const { data: isAdmin } = useIsAdmin();
  const right = isAdmin ? (
    <Link to="/admin/pods" data-testid="manage-pods" className="inline-flex min-h-[44px] items-center rounded-full px-4 text-[14px] font-[700]" style={{ background: K.lime, color: K.forest }}>
      {t("flock.pods.manage", "Manage pods")}
    </Link>
  ) : undefined;
  return (
    <FlockSubPage title={t("flock.pods.listTitle", "Buddy pods")} line={t("flock.pods.listLine", "Small groups on the same journey")} fallback="/flock/you" right={right}>
      {isLoading ? (
        <div className="grid min-h-[120px] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-7 animate-spin" style={{ color: K.moss }} /></div>
      ) : (rows ?? []).length === 0 ? (
        <FlockEmpty icon={<Users className="size-6" />} title={t("flock.pods.listEmptyTitle", "No pods yet")}>
          {t("flock.pods.listEmpty", "When you start a journey, tick \"Pair me with buddies working on this too\" to join a small group on the same journey.")}
        </FlockEmpty>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="my-pods">
          {(rows ?? []).map((r) => <li key={r.pod_id ?? `wait:${r.journey_id}`}><PodRow row={r} /></li>)}
        </ul>
      )}
    </FlockSubPage>
  );
}

function PodRow({ row }: { row: MyPodRow }) {
  const { t } = useTranslation();
  const cls = "flex min-h-[60px] items-center gap-3 rounded-[16px] bg-white px-3.5 py-2.5";
  if (row.status === "waiting" || !row.pod_id) {
    const body = (
      <>
        <Users className="size-5 shrink-0" style={{ color: K.moss }} aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-[700]">{t("flock.pods.title", "{{journey}} pod", { journey: row.template_name })}</span>
          <span className="truncate text-[12.5px]" style={{ color: K.quiet }}>{t("flock.pods.finding", "We're finding your buddies")}</span>
        </span>
      </>
    );
    return row.journey_id
      ? <Link to="/flock/journeys/$journeyId" params={{ journeyId: row.journey_id }} className={cls} style={{ color: K.forest }} data-pod-state="waiting">{body}</Link>
      : <div className={cls} style={{ color: K.forest }} data-pod-state="waiting">{body}</div>;
  }
  const pod = { kind: row.kind === "group" ? "group" as const : "journey" as const, template_name: row.template_name, member_count: row.member_count, region_name: row.region_name };
  const ended = row.status === "closed" || row.status === "dissolved";
  return (
    <Link to="/flock/pods/$podId" params={{ podId: row.pod_id }} className={cls} style={{ color: K.forest }} data-pod-state={row.status}>
      <Users className="size-5 shrink-0" style={{ color: K.moss }} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-[700]">{podTitle(t, pod)}</span>
        <span className="truncate text-[12.5px]" style={{ color: K.quiet }}>{podLine(t, pod)}</span>
      </span>
      {ended && <span className="rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: K.mist, color: K.forest }}>{t("flock.pods.closedTag", "Closed")}</span>}
    </Link>
  );
}
