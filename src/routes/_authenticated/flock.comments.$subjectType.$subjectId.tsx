import { createFileRoute, Navigate, useNavigate, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { CommentThread, ThreadHeader } from "@/components/flock/CommentThread";
import type { CommentSubject } from "@/lib/flockPostData";
import { useJourneyAccess, useJourneyView } from "@/lib/journeyData";

// Comments on a journey update (the story viewer) or a reached milestone
// (Today's cards). ?j= names the journey for the header; ?m= the milestone;
// ?focus=1 opens with the box focused. Posts have their own page.
type Search = { j?: string; m?: number; focus?: 1 };
const UUID = /^[0-9a-f-]{36}$/i;

export const Route = createFileRoute("/_authenticated/flock/comments/$subjectType/$subjectId")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(typeof s.j === "string" && UUID.test(s.j) ? { j: s.j } : {}),
    ...(Number.isInteger(Number(s.m)) && Number(s.m) > 0 ? { m: Number(s.m) } : {}),
    ...(s.focus === 1 || s.focus === "1" ? { focus: 1 as const } : {}),
  }),
  component: JourneyComments,
});

function JourneyComments() {
  const { t } = useTranslation();
  const { subjectType, subjectId } = Route.useParams();
  const { j, m, focus } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const type: CommentSubject = subjectType === "journey_update" ? "journey_update" : subjectType === "post" ? "post" : "journey_milestone";
  const { data: card } = useJourneyView(j ?? "");
  const { data: access } = useJourneyAccess();
  if (type === "post") return <Navigate to="/flock/post/$postId" params={{ postId: subjectId }} search={focus ? { focus } : {}} replace />;
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void navigate({ to: "/flock" });
  };
  const line = card
    ? [`${card.bird_name} · ${card.skill}`, m ? t("flock.journeys.story.milestone", "Milestone {{n}} of {{total}}", { n: m, total: card.total }) : null, card.owner_name]
      .filter(Boolean).join(" · ")
    : null;
  return (
    <CommentThread type={type} id={subjectId} ownerName={card && !card.is_mine ? card.owner_name : null} focus={!!focus} canComment={!!access?.can_share}
      top={<ThreadHeader title={t("flock.posts.commentsTitle", "Comments")} onBack={back}>{line && <span data-testid="thread-line">{line}</span>}</ThreadHeader>} />
  );
}
