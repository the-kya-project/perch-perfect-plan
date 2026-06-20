import { useQuery } from "@tanstack/react-query";
import { signBirdPhotos } from "@/lib/birdPhoto";

/**
 * Resolve a set of bird `photo_url` values (Storage paths and/or legacy data:
 * URLs) to displayable URLs in a single batched, cached round-trip. Returns a
 * lookup of `photo_url -> displayUrl`. Signed URLs last an hour; the query is
 * cached for ~50 min so we re-sign well before expiry without per-render hits.
 */
export function useBirdPhotos(values: Array<string | null | undefined>) {
  const keys = Array.from(new Set(values.filter(Boolean) as string[])).sort();
  const { data } = useQuery({
    queryKey: ["bird-photo-urls", keys],
    queryFn: async () => Object.fromEntries(await signBirdPhotos(keys)),
    enabled: keys.length > 0,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
  });
  return (value: string | null | undefined): string | null => {
    if (!value) return null;
    return (data?.[value] as string | undefined) ?? null;
  };
}
