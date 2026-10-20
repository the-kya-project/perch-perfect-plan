// One rule for every line that names birds: up to three names are written out
// ("Buzz", "Buzz and Max", "Buzz, Max and Kiwi"); more than three become a
// count ("4 birds").
import type { TFunction } from "i18next";

export const MAX_NAMED_BIRDS = 3;

/** True when `names` would be shown as a count rather than written out. */
export function namesAsCount(names: string[]): boolean {
  return names.length > MAX_NAMED_BIRDS;
}

/** "Buzz", "Buzz and Max", "Buzz, Max and Kiwi", or "4 birds". */
export function birdNames(t: TFunction, names: string[]): string {
  if (namesAsCount(names)) return t("birdNames.count", "{{count}} birds", { count: names.length });
  if (names.length <= 1) return names[0] ?? "";
  return t("birdNames.and", "{{first}} and {{last}}", { first: names.slice(0, -1).join(", "), last: names[names.length - 1] });
}
