import { useQuery } from "@tanstack/react-query";
import { signBirdPhotos, type SignedPhoto } from "@/lib/birdPhoto";

/**
 * Resolve a set of bird `photo_url` values (Storage paths and/or legacy data:
 * URLs) to displayable URLs in a single batched, cached round-trip. Pass the
 * display `width` to get a Supabase image-transform URL sized for the slot
 * (much smaller); each result also carries the full-size `original` for an
 * onError fallback. Returns a lookup `photo_url -> { url, original }`. Signed
 * URLs last an hour; cached ~50 min so we re-sign well before expiry.
 */
export function useBirdPhotos(values: Array<string | null | undefined>, width?: number) {
  const keys = Array.from(new Set(values.filter(Boolean) as string[])).sort();
  const { data } = useQuery({
    queryKey: ["bird-photo-urls", keys, width ?? 0],
    queryFn: async () => Object.fromEntries(await signBirdPhotos(keys, width ? { width } : undefined)),
    enabled: keys.length > 0,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
  });
  return (value: string | null | undefined): SignedPhoto | null => {
    if (!value) return null;
    return (data?.[value] as SignedPhoto | undefined) ?? null;
  };
}
