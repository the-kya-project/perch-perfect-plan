// Commit a new clip reference to a care plan, then retire the one it replaced.
//
// The ONLY path either replace handler uses — the baseline clip and all 8
// care-plan slots — so the save-then-delete ordering lives in one place and
// can't drift between them.

import { supabase } from "@/integrations/supabase/client";
import { isCfClip, cfUid, type CLIP_COLUMNS } from "./clipRef";
import { retireReplacedClip } from "./clips.functions";

export type ClipColumn = (typeof CLIP_COLUMNS)[number];

/**
 * Save `newRef` into `column`, THEN retire `oldRef`.
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
 * Throws only for a failed SAVE, with a fixed message safe to show.
 */
export async function commitClipRef(opts: {
  planId: string;
  column: ClipColumn;
  newRef: string;
  oldRef: string | null | undefined;
}): Promise<void> {
  const { planId, column, newRef, oldRef } = opts;

  // 1. Save. supabase-js returns { error } rather than throwing, so check it —
  //    an unchecked failure here would have toasted "saved" and then deleted
  //    the old clip out from under a care plan still pointing at it.
  const { error } = await supabase
    .from("care_plans")
    .update({ [column]: newRef } as never)
    .eq("id", planId);
  if (error) {
    console.error(`[commitClipRef] save failed for ${column}:`, error.message);
    throw new Error("Couldn't save the clip. Please try again.");
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
