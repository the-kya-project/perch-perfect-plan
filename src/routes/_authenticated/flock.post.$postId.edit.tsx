import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { PostComposer } from "@/components/flock/PostCompose";
import { useFlockPost } from "@/lib/flockPostData";

// Edit your own post: its title and text.
export const Route = createFileRoute("/_authenticated/flock/post/$postId/edit")({
  component: EditPost,
});

function EditPost() {
  const { t } = useTranslation();
  const { postId } = Route.useParams();
  const navigate = useNavigate();
  const { data: post, isLoading } = useFlockPost(postId);
  if (isLoading) return null;
  if (!post || !post.is_mine) {
    return <p className="m-0 p-6 text-[15px]" style={{ color: K.quiet }}>{t("flock.posts.notFound", "This post isn't available.")}</p>;
  }
  return <PostComposer editing={post} onDone={() => void navigate({ to: "/flock/post/$postId", params: { postId }, replace: true })} />;
}
