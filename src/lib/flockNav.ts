// The Community (Flock) navigation and filters: which tab a URL is, and what
// each screen's chips and sub-tabs are. Pure, so scripts/flock-shell.test.ts
// can pin it. Flock code only: shared care code must never import this file
// (CLAUDE.md, Flock safety rules); it imports only the gate in lib/flock.ts.

import type { TFunction } from "i18next";
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
    || /^\/flock\/journeys\/[^/]+\/(post|milestone|finished|story|card)(\/|$)/.test(pathname);
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
// The type chips are the library's four resource types (library_resources.
// resource_type); the subject chips are its topics, the same list the
// database allows (20261118120000_flock_library.sql). Keep them in step.
export type LibraryType = "all" | "guides" | "checklists" | "videos" | "links";
export const LIBRARY_TYPES: LibraryType[] = ["all", "guides", "checklists", "videos", "links"];
export type LibraryResourceType = "guide" | "checklist" | "video" | "link";
export const LIBRARY_RESOURCE_TYPES: LibraryResourceType[] = ["guide", "checklist", "video", "link"];
/** A type chip's resource type; "all" is none. */
export function resourceTypeFor(type: LibraryType): LibraryResourceType | null {
  return type === "all" ? null : (type.slice(0, -1) as LibraryResourceType);
}
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

/** The chapters' English names, as the regions table stores them. */
export const CHAPTER_NAMES = [
  "California", "Florida", "Great Lakes", "Mid-Atlantic", "Northeast",
  "Pacific Northwest", "Southeast", "Southwest", "Texas", "Other region",
] as const;

/** A chapter's name in the reader's language. The regions table stores the
 *  English name (and RPCs return it as region_name / chapter_name), so this
 *  looks it up by that name; a name it doesn't know (a renamed or new region)
 *  is shown as stored. Each key is written out so i18n:extract finds it. */
export function chapterName(t: TFunction, name: string | null | undefined): string {
  switch (name) {
    case "California": return t("flock.chapters.california", "California");
    case "Florida": return t("flock.chapters.florida", "Florida");
    case "Great Lakes": return t("flock.chapters.greatLakes", "Great Lakes");
    case "Mid-Atlantic": return t("flock.chapters.midAtlantic", "Mid-Atlantic");
    case "Northeast": return t("flock.chapters.northeast", "Northeast");
    case "Pacific Northwest": return t("flock.chapters.pacificNorthwest", "Pacific Northwest");
    case "Southeast": return t("flock.chapters.southeast", "Southeast");
    case "Southwest": return t("flock.chapters.southwest", "Southwest");
    case "Texas": return t("flock.chapters.texas", "Texas");
    case "Other region": return t("flock.chapters.other", "Other region");
    default: return name ?? "";
  }
}

/** "Great Lakes · IL · IN · MI · OH"; just the name when there are no states.
 *  With `t`, the name is in the reader's language (state codes stay as they are). */
export function chapterLine(name: string, states: readonly string[] | null | undefined, t?: TFunction): string {
  return [t ? chapterName(t, name) : name, ...(states ?? [])].join(" · ");
}
