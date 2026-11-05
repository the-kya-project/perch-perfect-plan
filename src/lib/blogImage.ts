// Blog post images and labels, shared by the Explore tab (routes/_authenticated/explore.tsx)
// and the iPhone Duo's Explore (components/duo/explore).

/** "HUSBANDRY" / "husbandry" → "Husbandry". */
export function sentenceCase(s: string): string {
  const v = s.trim().toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}

// The feed links the full-size original image, which is far bigger than a
// card needs. Route it through the weserv image proxy to serve a card-sized
// WebP; the <img> onError falls back to the original if the proxy is ever
// unavailable, so blog images always load.
export function sizedImage(url: string, width = 820): string {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${width}&q=72&output=webp&we`;
}

/** sizedImage for public https images only: the proxy can't reach anything else. */
export function sizedPublicImage(url: string, width = 820): string {
  return /^https:\/\//.test(url) ? sizedImage(url, width) : url;
}
