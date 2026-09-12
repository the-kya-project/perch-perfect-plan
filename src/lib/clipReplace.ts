// Commit a clip reference to a care plan — a new clip, or null to remove one —
// then retire the clip it replaced.
//
// The ONLY path any clip replace OR remove handler uses — the baseline clip and
// all 8 care-plan slots — so the save-then-delete ordering lives in one place
// and can't drift between them.

import { supabase } from "@/integrations/supabase/client";
import { isCfClip, cfUid, type CLIP_COLUMNS } from "./clipRef";
import { retireReplacedClip } from "./clips.functions";

export type ClipColumn = (typeof CLIP_COLUMNS)[number];

/**
 * Save `newRef` into `column` (null clears it — a remove), THEN retire `oldRef`.
 *
 * Remove and replace are the same operation here. A remove commits null; the
 * retire still fires because oldRef is set and differs; and the server's
 * "still referenced" guard reads correctly against null — a cleared column
 * never matches cfstream:<uid>, so a clear that landed permits the delete and
 * one that didn't leaves the ref in place and is refused.
 *
 * Order is the whole point. Save first: if it fails, this throws and nothing
 * has been deleted, so the old clip is exactly as it was. Delete second: if
 * THAT fails, the only cost is an orphaned asset the registry sweep reclaims
 * when the bird or account is deleted. The reverse order — delete then save —
 * can leave a care plan pointing at a video that no longer exists, which is
 * unrecoverable.
 *
 * The retire is deliberately NOT awaited. The owner gets nothing from waiting:
 * success is invisible and failure is silent by design. Measured, awaiting it
 * would roughly double-to-triple the post-upload wait (a Vercel server-function
 * round trip plus a Cloudflare call) for no user-visible benefit. The server
 * function awaits Cloudflare internally, so the work isn't frozen when the
 * handler returns.
 *
 * Throws only when the save didn't land. Callers show their own fixed message
 * (worded for replace vs remove), never this error's text.
 */
export async function commitClipRef(opts: {
  planId: string;
  column: ClipColumn;
  newRef: string | null;
  oldRef: string | null | undefined;
}): Promise<void> {
  const { planId, column, newRef, oldRef } = opts;

  // 1. Save, and PROVE it landed. { error } alone is not enough: an UPDATE that
  //    RLS blocks comes back HTTP 204 with no error and zero rows touched
  //    (verified). Checking only { error } would tell the owner "saved" or
  //    "removed" while the column never changed. Returning the updated row and
  //    requiring exactly one is the real signal. (The server guard would still
  //    refuse the delete in that case — the old ref is still there — but the UI
  //    must not claim a change that didn't happen.)
  const { data, error } = await supabase
    .from("care_plans")
    .update({ [column]: newRef } as never)
    .eq("id", planId)
    .select("id");
  if (error || data?.length !== 1) {
    console.error(
      `[commitClipRef] ${newRef === null ? "clear" : "save"} failed for ${column}:`,
      error?.message ?? `${data?.length ?? 0} rows updated`,
    );
    throw new Error("The clip change didn't save.");
  }

  // 2. Retire what it replaced — best-effort, never awaited, never surfaced.
  if (oldRef && oldRef !== newRef) retireSuperseded(oldRef);
}

function retireSuperseded(oldRef: string): void {
  if (isCfClip(oldRef)) {
    // Server-side: authorizes via clip_assets and refuses while the uid is
    // still referenced, so this can never delete a clip that's in use.
    void retireReplacedClip({ data: { uid: cfUid(oldRef) } }).catch((e) => {
      console.error("[commitClipRef] retire request failed", e);
    });
    return;
  }
  // Legacy pre-Cloudflare clip: a Supabase Storage object in bird-photos. Now
  // removed AFTER the save too; the handlers used to delete it first.
  void supabase.storage
    .from("bird-photos")
    .remove([oldRef])
    .catch((e) => console.error("[commitClipRef] legacy clip remove failed", e));
}
