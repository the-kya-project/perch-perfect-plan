// One place to answer "what's my relationship to this bird?" for presentational
// context (the flock grouping, the per-bird member banner, view-only tagging).
// Composes the EXISTING primitives — no parallel logic, no extra data loads
// beyond the owner-name resolve (which RLS forces server-side):
//   - useBirdRole  → owner | household | null
//   - useBirdOwner → the bird's owner_id (members may read birds.owner_id)
//   - useMyPermissions → my preset for that household
//   - resolveOwnerNames → the owner's display name (members can't read profiles)
//
// Capability ENFORCEMENT stays in RLS; capability GATING stays in useCapability.
// This hook is for legibility only.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useBirdRole } from "@/lib/useBirdRole";
import { useMyPermissions, useBirdOwner } from "@/lib/useCapability";
import { resolveOwnerNames } from "@/lib/home.functions";
import { PRESET_LABELS, presetForCapabilities, type Preset } from "@/lib/capabilities";

export type BirdContext = {
  isOwner: boolean;
  isMember: boolean; // household member (not owner) of this bird's household
  ownerId: string | null;
  ownerName: string | null; // resolved owner display name (member view only)
  preset: Preset | null;
  presetLabel: string | null; // e.g. "Caregiver"; null until resolved
};

export function useBirdContext(birdId: string | undefined): BirdContext {
  const role = useBirdRole(birdId);
  const { data: ownerId } = useBirdOwner(birdId);
  const { data: perms } = useMyPermissions();
  const isOwner = role === "owner";
  const isMember = role === "household";

  // Owner display name — only needed (and only permitted) when we're a member.
  const resolve = useServerFn(resolveOwnerNames);
  const { data: ownerNames } = useQuery({
    queryKey: ["owner-name", ownerId],
    enabled: isMember && !!ownerId,
    staleTime: 5 * 60_000,
    queryFn: () => resolve({ data: { ownerIds: [ownerId as string] } }),
  });

  let preset: Preset | null = null;
  if (isMember && ownerId && perms) {
    preset =
      perms.presetByOwner.get(ownerId) ??
      presetForCapabilities([...(perms.byOwner.get(ownerId) ?? [])]);
  }

  return {
    isOwner,
    isMember,
    ownerId: ownerId ?? null,
    ownerName: ownerId ? (ownerNames?.[ownerId] ?? null) : null,
    preset,
    presetLabel: preset ? PRESET_LABELS[preset] : null,
  };
}
