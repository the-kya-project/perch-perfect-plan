// Client-side human list of names in the UI language: "Willow",
// "Willow and Moxie", "Willow, Moxie, and Kiwi". Display only. Server functions
// return the raw name ARRAY and the screen joins it here, so the list follows
// the reader's language (emails use joinNamesLocalized in emailLocale.server.ts).
// English output is byte-identical to that server joiner.

import i18next, { type TFunction } from "i18next";

export function joinNamesDisplay(names: string[], empty: "bird" | "birds", tr?: TFunction): string {
  const t: TFunction = tr ?? i18next.t.bind(i18next);
  const n = names.filter(Boolean);
  if (n.length === 0) return empty === "bird" ? t("nameList.yourBird", "your bird") : t("nameList.yourBirds", "your birds");
  if (n.length === 1) return n[0];
  if (n.length === 2) return t("nameList.pair", "{{a}} and {{b}}", { a: n[0], b: n[1] });
  return t("nameList.many", "{{head}}, and {{last}}", { head: n.slice(0, -1).join(t("nameList.sep", ", ")), last: n[n.length - 1] });
}
