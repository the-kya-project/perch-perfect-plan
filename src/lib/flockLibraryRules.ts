// The library's editing rules, pure so scripts/flock-shell.test.ts pins them.
// The database enforces the same publish rules (library_resources_published_complete).
import type { LibraryResourceType } from "@/lib/flockNav";

/** "Sun conure, caique" → ["Sun conure", "caique"]: comma- or line-separated,
 *  trimmed, blanks and repeats (any case) dropped, at most 12. */
export function speciesFromText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const s = raw.trim().replace(/\s+/g, " ").slice(0, 60);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
  }
  return out.slice(0, 12);
}

/** A web address, or null when the box is empty. "example.com" gains https://. */
export function normalizeUrl(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export type PublishProblem = "title" | "summary" | "topics" | "url";

/** What still stops a draft from being published (the database checks the
 *  same rules). Empty means it can go live. */
export function publishProblems(d: { title: string; summary: string; topics: readonly string[]; resource_type: LibraryResourceType; external_url: string | null }): PublishProblem[] {
  const out: PublishProblem[] = [];
  if (!d.title.trim()) out.push("title");
  if (!d.summary.trim()) out.push("summary");
  if (d.topics.length === 0) out.push("topics");
  if ((d.resource_type === "video" || d.resource_type === "link") && !d.external_url?.trim()) out.push("url");
  return out;
}
