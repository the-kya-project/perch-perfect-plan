// One rule for every line that names birds: up to three names are written out
// ("Echo", "Echo and Buzz", "Echo, Buzz, and Max" — Oxford comma in English;
// the Dutch catalog drops it), and more than three become a count ("4 birds").
// Use this for every list of bird names; joinNamesDisplay (lib/i18n/joinNames)
// is for lists that aren't birds, like sign-in providers.
import type { TFunction } from "i18next";

export const MAX_NAMED_BIRDS = 3;

/** True when `names` would be shown as a count rather than written out. */
export function namesAsCount(names: string[]): boolean {
  return names.length > MAX_NAMED_BIRDS;
}

/** "Echo", "Echo and Buzz", "Echo, Buzz, and Max", or "4 birds". */
export function birdNames(t: TFunction, names: string[]): string {
  const n = names.filter(Boolean);
  if (namesAsCount(n)) return t("birdNames.count", "{{count}} birds", { count: n.length });
  if (n.length <= 1) return n[0] ?? "";
  if (n.length === 2) return t("birdNames.pair", "{{a}} and {{b}}", { a: n[0], b: n[1] });
  return t("birdNames.many", "{{head}}, and {{last}}", { head: n.slice(0, -1).join(", "), last: n[n.length - 1] });
}
