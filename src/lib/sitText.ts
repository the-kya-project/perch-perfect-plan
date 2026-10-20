// Shared sit wording: date ranges and the sit's display name.
import type { TFunction } from "i18next";
import { monthDay } from "@/lib/dates";

/** "Nov 20 to 22", or "Nov 30 to Dec 2" across months; one day: "Jul 2". */
export function rangeTo(t: TFunction, start: string, end: string): string {
  if (start === end) return monthDay(start);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  return t("sitCards.rangeTo", "{{start}} to {{end}}", { start: monthDay(start), end: sameMonth ? String(Number(end.slice(8, 10))) : monthDay(end) });
}

/** The sit's name, or "[Sitter]'s sit" when it has none. */
export function sitTitle(t: TFunction, sit: { title?: string | null }, caregiverName: string): string {
  const own = sit.title?.trim();
  if (own) return own;
  return /s$/i.test(caregiverName.trim())
    ? t("sitCards.namedSitS", "{{name}}' sit", { name: caregiverName })
    : t("sitCards.namedSit", "{{name}}'s sit", { name: caregiverName });
}

