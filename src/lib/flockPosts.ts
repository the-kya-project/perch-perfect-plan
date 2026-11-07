// Posts, comments and the vet nudge (Community, step 4): the pure rules, so
// scripts/flock-posts.test.ts can pin them. Flock code only: shared care code
// never imports this file.

export type PostSpace = "learn" | "good" | "chapter" | "start";
/** The "Post to" chips, left to right (Batch 3, screen 1). */
export const POST_SPACES: PostSpace[] = ["learn", "good", "chapter", "start"];
export type PostStatus = "live" | "pending" | "changes_requested" | "declined" | "removed";
export type FeedSpace = "everything" | "learn" | "good" | "start" | "chapter";

export const MAX_PHOTOS = 4;
export const MAX_TITLE = 120;
export const MAX_BODY = 5000;
export const MAX_COMMENT = 2000;

/** The Association of Avian Veterinarians' public Find-A-Vet search. */
export const AAV_FIND_A_VET_URL = "https://www.aav.org/page/FindAVet2";

/** A post or comment's text, ready for matching: lowercase, curly quotes and
 *  dashes made plain, runs of space collapsed. */
export function normalizeForSigns(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The warning-sign phrases (flock_vet_signs) found in `text`, as whole words
 *  or phrases, ignoring case: "bleeding" matches "Is BLEEDING" but "blood"
 *  doesn't match "bloodhound", "a burn" doesn't match "a burning question", and
 *  a hyphenated word is one word ("alcohol" doesn't match "alcohol-free").
 *  Never blocks anything: a match only shows a card. */
export function findVetSigns(text: string, phrases: readonly string[]): string[] {
  const hay = normalizeForSigns(text);
  if (!hay) return [];
  const found: string[] = [];
  for (const raw of phrases) {
    const p = normalizeForSigns(raw);
    if (!p) continue;
    const re = new RegExp(`(^|[^a-z0-9'-])${escapeRegExp(p)}(?=$|[^a-z0-9'-])`);
    if (re.test(hay)) found.push(raw);
  }
  return found;
}

export type VetTier = "today" | "urgent";
export type VetSign = { phrase: string; tier: VetTier };

/** Which vet card a post or comment brings up: "urgent" ("This could be an
 *  emergency") when any urgent phrase matches, even alongside today ones;
 *  "today" (the red card) for today phrases only; null for none. */
export function vetNudgeTier(text: string, signs: readonly VetSign[]): VetTier | null {
  if (findVetSigns(text, signs.filter((s) => s.tier === "urgent").map((s) => s.phrase)).length > 0) return "urgent";
  if (findVetSigns(text, signs.filter((s) => s.tier !== "urgent").map((s) => s.phrase)).length > 0) return "today";
  return null;
}

/** Which hourly limit a save ran into, from the database's 'rate_limited'
 *  error (DETAIL names the kind); null for any other error. */
export type RateKind = "posts" | "comments" | "photos";
export function rateLimitKind(error: unknown): RateKind | null {
  const e = error as { message?: string; details?: string; detail?: string } | null;
  if (!e || e.message !== "rate_limited") return null;
  const d = e.details ?? e.detail;
  return d === "posts" || d === "comments" || d === "photos" ? d : "posts";
}

/** Comments as threads: top-level comments oldest first, each with its replies
 *  (oldest first). A reply whose top comment isn't in the list is dropped. */
export type CommentRow = { comment_id: string; parent_id: string | null; created_at: string };
export function threadComments<T extends CommentRow>(rows: readonly T[]): { comment: T; replies: T[] }[] {
  const byTime = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.comment_id.localeCompare(b.comment_id));
  const threads = new Map<string, { comment: T; replies: T[] }>();
  for (const r of byTime) if (!r.parent_id) threads.set(r.comment_id, { comment: r, replies: [] });
  for (const r of byTime) if (r.parent_id) threads.get(r.parent_id)?.replies.push(r);
  return [...threads.values()];
}

/** Today mixes posts and followed-journey milestone cards, newest first.
 *  While older posts are still to load, cards older than the oldest loaded
 *  post wait, so scrolling never shows a card out of order. */
export type FeedItem<P, C> = { kind: "post"; at: string; item: P } | { kind: "milestone"; at: string; item: C };
export function mergeFeed<P extends { created_at: string }, C extends { reached_at: string }>(
  posts: readonly P[], cards: readonly C[], morePosts: boolean,
): FeedItem<P, C>[] {
  const oldest = posts.length ? posts[posts.length - 1].created_at : null;
  const shownCards = morePosts && oldest ? cards.filter((c) => c.reached_at >= oldest) : cards;
  const all: FeedItem<P, C>[] = [
    ...posts.map((p) => ({ kind: "post" as const, at: p.created_at, item: p })),
    ...shownCards.map((c) => ({ kind: "milestone" as const, at: c.reached_at, item: c })),
  ];
  return all.sort((a, b) => b.at.localeCompare(a.at));
}

/** "@Alex " at the start of a reply: the first name of the person answered. */
export function replyPrefix(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  return first ? `@${first} ` : "";
}

/** The feed's space for a Today chip. */
export function feedSpaceFor(filter: "everything" | "learn" | "good" | "start" | undefined): FeedSpace {
  return filter ?? "everything";
}
