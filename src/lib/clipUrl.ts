// Resolve a clip reference to a playable URL on the OWNER side (authenticated).
// Cloudflare Stream refs get a signed iframe URL via a server function; legacy
// Supabase paths get a signed Storage URL. Returns null if unresolvable.

import { supabase } from "@/integrations/supabase/client";
import { isCfClip, cfUid } from "./clipRef";
import { getOwnerClipUrl } from "./clips.functions";

export async function resolveOwnerClipUrl(ref: string | null | undefined, birdId?: string): Promise<string | null> {
  if (!ref) return null;
  if (isCfClip(ref)) {
    try {
      const { url } = await getOwnerClipUrl({ data: { uid: cfUid(ref), birdId } });
      return url ?? null;
    } catch {
      return null;
    }
  }
  const { data } = await supabase.storage.from("bird-photos").createSignedUrl(ref, 3600);
  return data?.signedUrl ?? null;
}
