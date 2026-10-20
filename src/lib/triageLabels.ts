import type { TFunction } from "i18next";

// triage.ts composes its result message in English; display it localized.
export function triageMessageLabel(t: TFunction, en: string): string {
  switch (en) {
    case "This may be urgent. Call the owner and the avian vet now. Keep the bird warm, quiet, and minimize handling.":
      return t("ownerScan.msgRed", "This may be urgent. Call the owner and the avian vet now. Keep the bird warm, quiet, and minimize handling.");
    case "Two or more concerning signs together — this combination is worth a call. Message the owner now and call the avian vet if it continues or worsens.":
      return t("ownerScan.msgYellowMulti", "Two or more concerning signs together — this combination is worth a call. Message the owner now and call the avian vet if it continues or worsens.");
    case "Something may be off. Message the owner, take photos if helpful, and keep monitoring. Call the avian vet if this continues or appears with other signs.":
      return t("ownerScan.msgYellowOne", "Something may be off. Message the owner, take photos if helpful, and keep monitoring. Call the avian vet if this continues or appears with other signs.");
    case "Nothing concerning logged. Keep following the care plan and watching for any changes.":
      return t("ownerScan.msgGreen", "Nothing concerning logged. Keep following the care plan and watching for any changes.");
    default:
      return en;
  }
}
