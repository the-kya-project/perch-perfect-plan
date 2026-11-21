import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PostComposer } from "@/components/flock/PostCompose";
import { pickOptional } from "@/lib/flockNav";
import { POST_SPACES, type PostSpace } from "@/lib/flockPosts";

// Write a post (Batch 3, screen 1). ?space= preselects where it goes.
export const Route = createFileRoute("/_authenticated/flock/post/new")({
  validateSearch: (s: Record<string, unknown>): { space?: PostSpace } => ({ space: pickOptional(s.space, POST_SPACES) }),
  component: NewPost,
});

function NewPost() {
  const { space } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <PostComposer initialSpace={space} onDone={(r) => {
      // Back where it shows: the chapter's Posts, or Today filtered to its space.
      if (r.space === "chapter") void navigate({ to: "/flock/chapter", replace: true });
      else void navigate({ to: "/flock", search: { space: r.space }, replace: true });
    }} />
  );
}
