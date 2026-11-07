// Community posts, comments and reactions (step 4). Every read and write goes
// through a database function that checks who may see or change what
// (20261108100000_flock_posts.sql); photos are signed on the server for
// viewers who may see them (flockPostMedia.functions.ts). Flock code only.
//
// The tables and functions postdate the generated types, hence `sb`.
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { AvatarError, reencodeJpeg } from "@/lib/flockAvatar";
import { deleteFlockComment, deleteFlockPost, getFlockPostPhotos, type PostPhotoMap } from "@/lib/flockPostMedia.functions";
import type { ReactionKind } from "@/lib/journeyData";
import type { FeedSpace, PostSpace, PostStatus } from "@/lib/flockPosts";

const sb = supabase as any;
const STALE = 30_000;
const PAGE = 15;

function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export type Counts = { great_job: number; been_there: number; rooting_for_you: number; love_this: number; mine: ReactionKind[] };

export type FlockPost = Counts & {
  post_id: string; author_id: string; author_name: string | null; author_region: string | null; author_photo_path: string | null;
  author_is_founder: boolean; space: PostSpace; region_slug: string | null; region_name: string | null;
  title: string | null; body: string; photo_count: number; bird_id: string | null; bird_name: string | null; bird_has_photo: boolean;
  status: PostStatus; review_note: string | null; created_at: string; edited_at: string | null; is_mine: boolean; comment_count: number;
};

export type CommentSubject = "post" | "journey_update" | "journey_milestone";
export type FlockComment = Counts & {
  comment_id: string; parent_id: string | null; author_id: string; author_name: string | null; author_region: string | null;
  author_photo_path: string | null; reply_to_name: string | null; body: string; has_photo: boolean;
  created_at: string; edited_at: string | null; is_mine: boolean;
};
export type Reactor = { user_id: string; display_name: string; region_name: string | null; photo_path: string | null; kind: ReactionKind; created_at: string };

export const postKeys = {
  all: ["flock", "posts"] as const,
  feed: (space: FeedSpace) => ["flock", "posts", "feed", space] as const,
  post: (id: string) => ["flock", "posts", "post", id] as const,
  comments: (type: string, id: string) => ["flock", "posts", "comments", type, id] as const,
  counts: (type: string, ids: string) => ["flock", "posts", "comment-counts", type, ids] as const,
  reactors: (type: string, id: string) => ["flock", "posts", "reactors", type, id] as const,
  photos: (key: string) => ["flock", "posts", "photos", key] as const,
  vetSigns: ["flock", "posts", "vet-signs"] as const,
};

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const tidy = <T extends { mine?: unknown }>(r: T): T => ({ ...r, mine: asArray<ReactionKind>(r.mine) });

/** Today (Everything or a space) and the Chapter tab: newest first, a page at a time. */
export function useFlockFeed(space: FeedSpace) {
  return useInfiniteQuery({
    queryKey: postKeys.feed(space),
    staleTime: STALE,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FlockPost[]> =>
      asArray<FlockPost>(must(await sb.rpc("flock_feed", { p_space: space, p_before: pageParam, p_limit: PAGE }))).map(tidy),
    getNextPageParam: (last) => (last.length < PAGE ? undefined : last[last.length - 1].created_at),
  });
}

export function useFlockPost(id: string) {
  return useQuery({
    queryKey: postKeys.post(id),
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<FlockPost | null> => {
      const row = asArray<FlockPost>(must(await sb.rpc("flock_post", { p_post_id: id })))[0];
      return row ? tidy(row) : null;
    },
  });
}

export function useComments(type: CommentSubject, id: string) {
  return useQuery({
    queryKey: postKeys.comments(type, id),
    enabled: !!id,
    staleTime: 15_000,
    queryFn: async (): Promise<FlockComment[]> =>
      asArray<FlockComment>(must(await sb.rpc("flock_comments_for", { p_subject_type: type, p_subject_id: id }))).map(tidy),
  });
}

/** Comment counts for Today's milestone cards and the story viewer. */
export function useCommentCounts(type: CommentSubject, ids: string[]) {
  const list = [...new Set(ids.filter(Boolean))].sort();
  return useQuery({
    queryKey: postKeys.counts(type, list.join("|")),
    enabled: list.length > 0,
    staleTime: STALE,
    queryFn: async (): Promise<Record<string, number>> => {
      const rows = asArray<{ subject_id: string; comment_count: number }>(must(await sb.rpc("flock_comment_counts", { p_subject_type: type, p_ids: list })));
      return Object.fromEntries(rows.map((r) => [r.subject_id, r.comment_count]));
    },
  });
}

export type ReactSubject = CommentSubject | "comment";
export function useReactors(type: ReactSubject, id: string) {
  return useQuery({
    queryKey: postKeys.reactors(type, id),
    enabled: !!id,
    staleTime: STALE,
    queryFn: async (): Promise<Reactor[]> => asArray<Reactor>(must(await sb.rpc("flock_reactors", { p_subject_type: type, p_subject_id: id }))),
  });
}

export function useVetSigns() {
  return useQuery({
    queryKey: postKeys.vetSigns,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<string[]> => asArray<string>(must(await sb.rpc("flock_vet_signs"))),
  });
}

/** Signed photos for posts and comments the caller may see. */
export function usePostPhotos(opts: { postIds?: string[]; commentIds?: string[]; width?: number }) {
  const postIds = [...new Set(opts.postIds ?? [])].sort();
  const commentIds = [...new Set(opts.commentIds ?? [])].sort();
  const key = `${opts.width ?? 0}:${postIds.join("|")}:${commentIds.join("|")}`;
  return useQuery({
    queryKey: postKeys.photos(key),
    enabled: postIds.length + commentIds.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<PostPhotoMap> => getFlockPostPhotos({ data: { postIds, commentIds, width: opts.width } }),
  });
}

// ---- Writes -----------------------------------------------------------------------------

/** A photo for a post or comment: redrawn as a new JPEG in the browser (so no
 *  EXIF or GPS leaves the phone), at most 1600px and 3 MB, then uploaded to
 *  the caller's own folder. Returns its path. */
export async function uploadPostPhoto(file: File): Promise<string> {
  const { data } = await getLocalUser();
  if (!data.user) throw new AvatarError("You're signed out.");
  const blob = await reencodeJpeg(file, 1600, 3 * 1024 * 1024);
  const path = `${data.user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("flock-posts").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new AvatarError("We couldn't save that photo. Try again.");
  return path;
}

/** Photos uploaded for a post that was never sent. Best effort. */
export async function discardPostPhotos(paths: string[]): Promise<void> {
  if (paths.length) await supabase.storage.from("flock-posts").remove(paths).catch(() => undefined);
}

export async function createPost(input: {
  space: PostSpace; title: string; body: string; photoPaths: string[]; birdId: string | null; vetNudged: boolean;
}): Promise<{ post_id: string; status: PostStatus }> {
  const rows = asArray<{ post_id: string; status: PostStatus }>(must(await sb.rpc("flock_post_create", {
    p_space: input.space, p_title: input.title.trim() || null, p_body: input.body, p_photo_paths: input.photoPaths,
    p_bird_id: input.birdId, p_vet_nudged: input.vetNudged,
  })));
  return rows[0];
}

export async function editPost(id: string, title: string, body: string): Promise<PostStatus> {
  return must(await sb.rpc("flock_post_edit", { p_post_id: id, p_title: title.trim() || null, p_body: body })) as PostStatus;
}

export async function deletePost(id: string): Promise<void> {
  await deleteFlockPost({ data: { postId: id } });
}

export async function createComment(input: {
  type: CommentSubject; id: string; replyTo: string | null; body: string; photoPath: string | null; vetNudged: boolean;
}): Promise<string> {
  return must(await sb.rpc("flock_comment_create", {
    p_subject_type: input.type, p_subject_id: input.id, p_reply_to: input.replyTo, p_body: input.body,
    p_photo_path: input.photoPath, p_vet_nudged: input.vetNudged,
  })) as string;
}

export async function editComment(id: string, body: string): Promise<void> {
  must(await sb.rpc("flock_comment_edit", { p_comment_id: id, p_body: body }));
}

export async function deleteComment(id: string): Promise<void> {
  await deleteFlockComment({ data: { commentId: id } });
}

/** A reaction on a post, comment, journey update or milestone. */
export async function react(type: ReactSubject, id: string, kind: ReactionKind, on: boolean): Promise<void> {
  must(await sb.rpc("flock_react", { p_subject_type: type, p_subject_id: id, p_kind: kind, p_on: on }));
}

/** After a change: posts, comments and counts reload (and journey cards, whose
 *  comment counts show in Today). */
export function useInvalidatePosts() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: postKeys.all }),
      qc.invalidateQueries({ queryKey: ["flock", "journeys"] }),
    ]);
  };
}
