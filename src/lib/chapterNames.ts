// Chapter names in the reader's language. The regions table stores each
// chapter's English name (and RPCs return it as region_name / chapter_name);
// chapterName() looks it up by that name. Kept apart from lib/flockNav.ts so
// the public /founding page can use it without importing Flock code.
import type { TFunction } from "i18next";

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
