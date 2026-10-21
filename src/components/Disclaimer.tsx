import { Info } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Disclaimer() {
  const { t } = useTranslation();
  return (
    <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[#5f5e5a]">
      <Info className="mt-px size-3 shrink-0" aria-hidden />
      <span>
        <span className="font-medium">{t("disclaimer.noteLabel", "Note:")}</span> {t("disclaimer.compactBody", "Not a substitute for veterinary care. Call a vet for any medical concern.")}
      </span>
    </p>
  );
}
