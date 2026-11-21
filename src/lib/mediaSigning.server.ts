// Signing bird media for people who reach it through the service role: sitters
// (token links), household views, and handoff previews.
//
// The media reference comes from a row the caller (or someone they share a
// household with) can write: birds.photo_url and the care-plan clip columns.
// So the reference alone proves nothing. A person could put another owner's
// photo path or Cloudflare clip id on their own bird, open their own sitter
// preview, and get it signed (QA pass, Oct 2026). Both signers therefore check
// that the media belongs to the owner whose bird is being shown:
//   - photos and legacy clips live in the bird-photos bucket under
//     "<owner_id>/…", the folder every upload uses (birdPhoto.ts);
//   - Cloudflare clips are bound to a bird in clip_assets, which only the
//     server writes (clips.functions.ts); the bird must belong to this owner.
// Anything else signs to null, the same as a missing file.

import { isCfClip, cfUid } from "./clipRef";

const BUCKET = "bird-photos";
const TTL_SECONDS = 3600;

function inOwnerFolder(path: string, ownerId: string): boolean {
  return path.split("/")[0] === ownerId && !path.includes("..");
}

/** Sign a bird's photo_url for display. Legacy inline data: and absolute
 *  http(s) values pass through unchanged. */
export async function signOwnerPhoto(sb: any, value: string | null | undefined, ownerId: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("data:") || value.startsWith("http")) return value;
  if (!ownerId || !inOwnerFolder(value, ownerId)) return null;
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(value, TTL_SECONDS);
  return data?.signedUrl ?? null;
}

/** Resolve a care-plan clip reference to a playable URL: a signed Cloudflare
 *  Stream iframe for "cfstream:<uid>", or a signed Storage URL for legacy clips. */
export async function resolveOwnerClipUrl(sb: any, ref: string | null | undefined, ownerId: string | null | undefined): Promise<string | null> {
  if (!ref || !ownerId) return null;
  if (isCfClip(ref)) {
    const { data: asset } = await sb.from("clip_assets").select("bird_id").eq("uid", cfUid(ref)).maybeSingle();
    if (!asset?.bird_id) return null;
    const { data: bird } = await sb.from("birds").select("owner_id").eq("id", asset.bird_id).maybeSingle();
    if (bird?.owner_id !== ownerId) return null;
    try {
      const { signedIframeUrl } = await import("@/lib/cloudflareStream.server");
      return await signedIframeUrl(cfUid(ref));
    } catch {
      return null;
    }
  }
  if (!inOwnerFolder(ref, ownerId)) return null;
  const { data } = await sb.storage.from(BUCKET).createSignedUrl(ref, TTL_SECONDS);
  return data?.signedUrl ?? null;
}
