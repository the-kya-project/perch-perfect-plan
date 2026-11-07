// Photos on Community posts and comments (private 'flock-posts' bucket).
//
// Nobody reads the bucket directly except the uploader. To show photos:
//   1. ask the database, as the caller, for the paths of the posts and comments
//      they may see (flock_media_refs: Flock members only, live posts, their own
//      chapter, nothing pending unless it's theirs);
//   2. sign those paths with the service role for one hour, resized to `width`
//      (Supabase image transforms), with the full-size original as a fallback.
// Deleting a post or comment goes through here too: the database deletes it as
// the caller (author only) and hands back its photo paths, which the service
// role removes, including other members' photos in replies under it.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PostPhoto = { url: string; original: string };
/** Keyed "post:<id>" or "comment:<id>"; a post's photos in order. */
export type PostPhotoMap = Record<string, PostPhoto[]>;

const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/;

export const getFlockPostPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postIds?: string[]; commentIds?: string[]; width?: number }) =>
    z.object({
      postIds: z.array(z.string().uuid()).max(100).optional(),
      commentIds: z.array(z.string().uuid()).max(200).optional(),
      width: z.number().int().min(64).max(1600).optional(),
    }).parse(d))
  .handler(async ({ data, context }): Promise<PostPhotoMap> => {
    if (!data.postIds?.length && !data.commentIds?.length) return {};
    const { data: refs, error } = await (context.supabase as any)
      .rpc("flock_media_refs", { p_post_ids: data.postIds ?? null, p_comment_ids: data.commentIds ?? null });
    if (error) throw new Error("Couldn't load these photos.");
    const rows = ((refs ?? []) as { subject_type: string; subject_id: string; idx: number; path: string }[])
      .filter((r) => PATH.test(r.path));
    if (rows.length === 0) return {};
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bucket = (supabaseAdmin as any).storage.from("flock-posts");
    const out: PostPhotoMap = {};
    await Promise.all(rows.map(async (r) => {
      const { data: full } = await bucket.createSignedUrl(r.path, 3600);
      if (!full?.signedUrl) return;
      let url = full.signedUrl as string;
      if (data.width) {
        const { data: sized } = await bucket.createSignedUrl(r.path, 3600, { transform: { width: data.width, quality: 75 } });
        if (sized?.signedUrl) url = sized.signedUrl;
      }
      const key = `${r.subject_type}:${r.subject_id}`;
      (out[key] ??= [])[r.idx] = { url, original: full.signedUrl };
    }));
    for (const k of Object.keys(out)) out[k] = out[k].filter(Boolean);
    return out;
  });

async function removePaths(paths: string[], label: string): Promise<void> {
  const list = paths.filter((p) => PATH.test(p));
  if (!list.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // The post or comment is already gone; a file that fails to delete is logged.
  const { error } = await (supabaseAdmin as any).storage.from("flock-posts").remove(list);
  if (error) console.error(`[${label}] photos: ${error.message ?? error}`);
}

export const deleteFlockPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { postId: string }) => z.object({ postId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ deleted: true }> => {
    const { data: rows, error } = await (context.supabase as any).rpc("flock_post_delete", { p_post_id: data.postId });
    if (error) throw new Error("Couldn't delete this post.");
    await removePaths(((rows ?? []) as { path: string }[]).map((r) => r.path), "deleteFlockPost");
    return { deleted: true };
  });

export const deleteFlockComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { commentId: string }) => z.object({ commentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ deleted: true }> => {
    const { data: rows, error } = await (context.supabase as any).rpc("flock_comment_delete", { p_comment_id: data.commentId });
    if (error) throw new Error("Couldn't delete this comment.");
    await removePaths(((rows ?? []) as { path: string }[]).map((r) => r.path), "deleteFlockComment");
    return { deleted: true };
  });

/** Today's idea's photo and everyone's "We tried it" photos, for members, only
 *  for today's idea (flock_idea_media_refs checks), signed for one hour. */
export type IdeaPhoto = PostPhoto & { kind: "idea" | "try"; id: string; bird_name: string | null; outcome: string | null };
export const getFlockIdeaPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ideaId: string; width?: number }) =>
    z.object({ ideaId: z.string().uuid(), width: z.number().int().min(64).max(1600).optional() }).parse(d))
  .handler(async ({ data, context }): Promise<IdeaPhoto[]> => {
    const { data: refs, error } = await (context.supabase as any).rpc("flock_idea_media_refs", { p_idea_id: data.ideaId });
    if (error) throw new Error("Couldn't load these photos.");
    const rows = ((refs ?? []) as { kind: "idea" | "try"; ref_id: string; path: string; bird_name: string | null; outcome: string | null }[])
      .filter((r) => PATH.test(r.path));
    if (rows.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bucket = (supabaseAdmin as any).storage.from("flock-posts");
    const out = await Promise.all(rows.map(async (r): Promise<IdeaPhoto | null> => {
      const { data: full } = await bucket.createSignedUrl(r.path, 3600);
      if (!full?.signedUrl) return null;
      let url = full.signedUrl as string;
      if (data.width) {
        const { data: sized } = await bucket.createSignedUrl(r.path, 3600, { transform: { width: data.width, quality: 75 } });
        if (sized?.signedUrl) url = sized.signedUrl;
      }
      return { url, original: full.signedUrl, kind: r.kind, id: r.ref_id, bird_name: r.bird_name, outcome: r.outcome };
    }));
    return out.filter((x): x is IdeaPhoto => !!x);
  });
