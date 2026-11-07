// The Community (Flock) navigation and filters: which tab a URL is, and what
// each screen's chips and sub-tabs are. Pure, so scripts/flock-shell.test.ts
// can pin it. Flock code only: shared care code must never import this file
// (CLAUDE.md, Flock safety rules); it imports only the gate in lib/flock.ts.

export type FlockTab = "today" | "journeys" | "chapter" | "library";
/** The five Community tabs, left to right. "care" (My birds) is last, in the
 *  slot the Community button holds on the care tab bar. */
export type FlockDest = FlockTab | "care";

export const FLOCK_DESTS: { key: FlockDest; to: string }[] = [
  { key: "today", to: "/flock" },
  { key: "journeys", to: "/flock/journeys" },
  { key: "chapter", to: "/flock/chapter" },
  { key: "library", to: "/flock/library" },
  { key: "care", to: "/dashboard" },
];

/** The tab a /flock path belongs to: the chapter's member list lights
 *  Chapter; You, other members' profiles and birds light none. Unknown
 *  children read as Today. */
export function destForPath(pathname: string): FlockTab | null {
  if (pathname.startsWith("/flock/journeys")) return "journeys";
  if (pathname.startsWith("/flock/chapter") || pathname.startsWith("/flock/events") || pathname === "/flock/members" || pathname === "/flock/members/") return "chapter";
  if (pathname.startsWith("/flock/library")) return "library";
  if (pathname.startsWith("/flock/you") || pathname.startsWith("/flock/members/") || pathname.startsWith("/flock/birds/")) return null;
  return "today";
}

/** Full screens with no tab bar and no column tabs: welcome and setup, and the
 *  start-a-journey flow (pick, set up, known skills), which ends in its own
 *  footer button. */
export function isFlockOnboardingPath(pathname: string): boolean {
  return pathname.startsWith("/flock/welcome") || pathname.startsWith("/flock/setup")
    || pathname.startsWith("/flock/journeys/start") || pathname.startsWith("/flock/journeys/setup")
    || pathname.startsWith("/flock/journeys/known")
    || /^\/flock\/journeys\/[^/]+\/(post|milestone|finished|story)(\/|$)/.test(pathname);
}

/** Full screens with no tab bar that still need a finished setup: writing or
 *  editing a post, a post with its comments, a comment thread, who reacted. */
export function isFlockFullScreenPath(pathname: string): boolean {
  return /^\/flock\/(post|comments|reactions)(\/|$)/.test(pathname);
}

/** Old placeholder URLs and where they go now, so nothing 404s. */
export const FLOCK_REDIRECTS = {
  "/flock/spaces": "/flock",
  "/flock/learn": "/flock/library",
} as const;

// ---- Spaces (the header's sheet) and Today's chips ----------------------
// Today is one feed for everything; a space narrows it. "everything" is the
// default and is never written to the URL.
export type FlockSpace = "start" | "learn" | "good";
export type TodayFilter = "everything" | FlockSpace;
/** The sheet's order. */
export const FLOCK_SPACES: FlockSpace[] = ["start", "learn", "good"];
/** Today's chips, left to right. */
export const TODAY_FILTERS: TodayFilter[] = ["everything", "learn", "good", "start"];

// ---- Journeys ------------------------------------------------------------
export type JourneysFilter = "for-you" | "following" | "tricks" | "basics";
export const JOURNEYS_FILTERS: JourneysFilter[] = ["for-you", "following", "tricks", "basics"];

// ---- Chapter -------------------------------------------------------------
export type ChapterTab = "posts" | "events" | "resources" | "members";
export const CHAPTER_TABS: ChapterTab[] = ["posts", "events", "resources", "members"];

// ---- Library -------------------------------------------------------------
export type LibraryType = "all" | "guides" | "recordings" | "podcast";
export const LIBRARY_TYPES: LibraryType[] = ["all", "guides", "recordings", "podcast"];
export type LibrarySubject = "foraging" | "diet" | "training" | "hormones" | "conservation";
export const LIBRARY_SUBJECTS: LibrarySubject[] = ["foraging", "diet", "training", "hormones", "conservation"];

/** One allowed value from a URL search param, else the default (bad or old
 *  links never break a screen). */
export function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Like pick, but "no subject" is a real state. */
export function pickOptional<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** A search box's text from the URL: trimmed to 100 characters, never a crash. */
export function pickQuery(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const q = value.slice(0, 100);
  return q.trim() ? q : undefined;
}

/** "Great Lakes · IL · IN · MI · OH"; just the name when there are no states. */
export function chapterLine(name: string, states: readonly string[] | null | undefined): string {
  return [name, ...(states ?? [])].join(" · ");
}
