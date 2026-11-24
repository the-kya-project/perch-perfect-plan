import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { PostComposer } from "@/components/flock/PostCompose";
import { weeklyQuestion } from "@/components/flock/PodParts";
import { usePod } from "@/lib/flockPods";

// Check in with your buddy pod: the usual post composer (photos, a bird, the
// vet nudge), posting only to this pod, with the week's question on top.
export const Route = createFileRoute("/_authenticated/flock/pods/$podId/post")({
  component: PodPost,
});

function PodPost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { podId } = Route.useParams();
  const { data: pod } = usePod(podId);
  return (
    <PostComposer pod={{ id: podId, prompt: pod ? weeklyQuestion(t, pod) : " " }}
      onDone={() => void navigate({ to: "/flock/pods/$podId", params: { podId }, replace: true })} />
  );
}
