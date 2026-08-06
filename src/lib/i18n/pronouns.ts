// Locale-aware pronouns for a bird whose sex may be unknown.
//
// English keeps the exact words the sitter surface used before i18n (her/him/them,
// her/his/their) so English output is unchanged. Dutch uses natural informal
// forms; unknown sex falls back to singular-they equivalents (ze/hun).
import { type Locale } from "./config";

function sexInitial(sex: string | null | undefined): "f" | "m" | "" {
  const s = (sex ?? "").trim().toLowerCase();
  if (s.startsWith("f")) return "f";
  if (s.startsWith("m")) return "m";
  return "";
}

/** Object pronoun: en her/him/them · nl haar/hem/ze */
export function objectPronoun(sex: string | null | undefined, locale: Locale = "en"): string {
  const i = sexInitial(sex);
  if (locale === "nl") return i === "f" ? "haar" : i === "m" ? "hem" : "ze";
  return i === "f" ? "her" : i === "m" ? "him" : "them";
}

/** Possessive pronoun: en her/his/their · nl haar/z'n/hun */
export function possessivePronoun(sex: string | null | undefined, locale: Locale = "en"): string {
  const i = sexInitial(sex);
  if (locale === "nl") return i === "f" ? "haar" : i === "m" ? "z'n" : "hun";
  return i === "f" ? "her" : i === "m" ? "his" : "their";
}
