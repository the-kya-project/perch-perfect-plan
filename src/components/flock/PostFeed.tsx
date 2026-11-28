import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { PenLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { useCardBirdPhotos } from "@/components/flock/JourneyBrowse";
import { ConfirmSheet, PostCard } from "@/components/flock/PostParts";
import { ContentOptionsSheet, FlagSheet } from "@/components/flock/FlagSheets";
import { BlockSheet } from "@/components/flock/BlockSheet";
import { useAvatarUrls, useMyProfile, type FlockPhotoSrc } from "@/lib/flockData";
import { deletePost, useInvalidatePosts, usePostPhotos, type FlockPost } from "@/lib/flockPostData";
import type { PostSpace } from "@/lib/flockPosts";

/** Avatars, photos and attached birds for a list of posts. */
export function usePostMedia(posts: FlockPost[]) {
  const { data: avatars } = useAvatarUrls(posts.map((p) => p.author_photo_path));
  const { data: photos } = usePostPhotos({ postIds: posts.filter((p) => p.photo_count > 0).map((p) => p.post_id), width: 900 });
  const birds = useCardBirdPhotos(posts.filter((p) => p.bird_id).map((p) => ({ bird_id: p.bird_id!, bird_has_photo: p.bird_has_photo })), 120);
  return {
    avatar: (p: FlockPost): FlockPhotoSrc => (p.author_photo_path ? avatars?.get(p.author_photo_path) : null),
    photos: (p: FlockPost) => photos?.[`post:${p.post_id}`],
    bird: (p: FlockPost): FlockPhotoSrc => (p.bird_id ? birds[p.bird_id] : null),
  };
}

/** A post's ··· (or press-and-hold) sheet: Edit / Delete on your own; Flag
 *  and Block on others' (mockups 04–06). After a block, `onDeleted` runs too
 *  (the post is gone for you, so a post page leaves). `fromFeed`: the
 *  thank-you's button says "Back to the Feed". */
export function PostMenus({ menuFor, setMenuFor, onDeleted, fromFeed }: {
  menuFor: FlockPost | null; setMenuFor: (p: FlockPost | null) => void; onDeleted?: () => void; fromFeed?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidatePosts();
  const [confirmFor, setConfirmFor] = useState<FlockPost | null>(null);
  const [flagFor, setFlagFor] = useState<FlockPost | null>(null);
  const [blockFor, setBlockFor] = useState<FlockPost | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const p = menuFor;
  return (
    <>
      {p && (p.is_mine || p.status === "live") && (
        <ContentOptionsSheet type="post" mine={p.is_mine} authorName={p.author_name} onClose={() => setMenuFor(null)}
          onEdit={() => { setMenuFor(null); void navigate({ to: "/flock/post/$postId/edit", params: { postId: p.post_id } }); }}
          onDelete={() => { setMenuFor(null); setConfirmFor(p); }}
          onFlag={() => { setMenuFor(null); setFlagFor(p); }}
          onBlock={p.author_id ? () => { setMenuFor(null); setBlockFor(p); } : undefined} />
      )}
      {flagFor && (
        <FlagSheet type="post" id={flagFor.post_id} authorName={flagFor.author_name} onClose={() => setFlagFor(null)}
          doneLabel={fromFeed ? t("flock.flag.backToFeed", "Back to the Feed") : undefined} />
      )}
      {blockFor && <BlockSheet userId={blockFor.author_id} name={blockFor.author_name} onBlocked={() => onDeleted?.()} onClose={() => setBlockFor(null)} />}
      {confirmFor && (
        <ConfirmSheet busy={busy} onClose={() => { setConfirmFor(null); setError(null); }}
          title={t("flock.posts.deleteTitle", "Delete this post?")}
          line={error ?? t("flock.posts.deleteLine", "Its photos, comments and reactions go with it. This can't be undone.")}
          confirm={t("flock.posts.deleteConfirm", "Delete post")}
          onConfirm={async () => {
            setBusy(true);
            try { await deletePost(confirmFor.post_id); await invalidate(); setConfirmFor(null); onDeleted?.(); }
            catch { setError(t("flock.posts.deleteError", "We couldn't delete that. Try again.")); }
            finally { setBusy(false); }
          }} />
      )}
    </>
  );
}

/** "Share something with the Flock" at the top of Today and a chapter's Posts. */
export function ComposePrompt({ space, label }: { space?: PostSpace; label?: string }) {
  const { t } = useTranslation();
  const { data: me } = useMyProfile();
  const { data: avatars } = useAvatarUrls([me?.photo_path]);
  const name = me?.display_name ?? "";
  return (
    <Link to="/flock/post/new" search={space ? { space } : {}} data-testid="compose-prompt"
      className="flex min-h-[56px] items-center gap-3 rounded-[18px] bg-white px-3 py-2.5" style={{ color: K.quiet }}>
      <FlockAvatar name={name || "?"} url={me?.photo_path ? avatars?.get(me.photo_path) : null} size={36} />
      <span className="flex-1 text-[15px]">{label ?? t("flock.posts.prompt", "Share something with the Flock")}</span>
      <PenLine className="size-5" style={{ color: K.forest }} aria-hidden="true" />
    </Link>
  );
}

/** Loads the next page when the bottom of the list scrolls into view. */
export function LoadMore({ hasMore, loading, onMore }: { hasMore: boolean; loading: boolean; onMore: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting) && !loading) onMore(); }, { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, onMore]);
  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex justify-center py-4" data-testid="load-more">
      <button type="button" onClick={onMore} disabled={loading} className="min-h-[44px] rounded-full px-5 text-[14px] font-[700]" style={{ color: K.forest, background: "#fff" }}>
        {loading ? t("flock.posts.loading", "Loading…") : t("flock.posts.showMore", "Show more")}
      </button>
    </div>
  );
}

/** A list of posts with their menus. */
export function PostList({ posts }: { posts: FlockPost[] }) {
  const media = usePostMedia(posts);
  const [menuFor, setMenuFor] = useState<FlockPost | null>(null);
  return (
    <>
      {posts.map((p) => (
        <PostCard key={p.post_id} post={p} avatar={media.avatar(p)} photos={media.photos(p)} birdPhoto={media.bird(p)} onMenu={() => setMenuFor(p)} />
      ))}
      <PostMenus menuFor={menuFor} setMenuFor={setMenuFor} fromFeed />
    </>
  );
}
