import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { CommentThread, ThreadHeader } from "@/components/flock/CommentThread";
import { PostMenus, usePostMedia } from "@/components/flock/PostFeed";
import { PostCard } from "@/components/flock/PostParts";
import { useFlockPost, type FlockPost } from "@/lib/flockPostData";

// A post with its comments. ?focus=1 (from "Comment") opens with the box focused.
export const Route = createFileRoute("/_authenticated/flock/post/$postId/")({
  validateSearch: (s: Record<string, unknown>): { focus?: 1 } => (s.focus === 1 || s.focus === "1" ? { focus: 1 } : {}),
  component: PostPage,
});

function PostPage() {
  const { t } = useTranslation();
  const { postId } = Route.useParams();
  const { focus } = Route.useSearch();
  const router = useRouter();
  const navigate = useNavigate();
  const { data: post, isLoading } = useFlockPost(postId);
  const media = usePostMedia(post ? [post] : []);
  const [menuFor, setMenuFor] = useState<FlockPost | null>(null);
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void navigate({ to: "/flock" });
  };
  const header = <ThreadHeader title={t("flock.posts.commentsTitle", "Comments")} onBack={back} />;
  if (isLoading) return header;
  if (!post) {
    return (
      <>
        {header}
        <p className="m-0 p-6 text-[15px]" style={{ color: K.quiet }} data-testid="post-missing">{t("flock.posts.notFound", "This post isn't available.")}</p>
      </>
    );
  }
  return (
    <>
      <CommentThread type="post" id={post.post_id} ownerName={post.is_mine ? null : post.author_name} focus={!!focus} canComment={post.status === "live"}
        top={(
          <>
            {header}
            <div className="mx-auto w-full max-w-xl px-2 pt-2">
              <PostCard post={post} full avatar={media.avatar(post)} photos={media.photos(post)} birdPhoto={media.bird(post)} onMenu={() => setMenuFor(post)} />
            </div>
          </>
        )} />
      <PostMenus menuFor={menuFor} setMenuFor={setMenuFor} onDeleted={() => void navigate({ to: "/flock", replace: true })} />
    </>
  );
}
