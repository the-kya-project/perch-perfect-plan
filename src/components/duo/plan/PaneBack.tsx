// Back at the top of a Duo pane: in the side column when the screen has one
// (signed-in screens), else a round button at the top of the pane (the sitter
// link, the public legal pages, which have no column slot).
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { useDuoRail, RailBack } from "@/components/DuoRail";
import { DUO } from "@/components/duo/DuoBlocks";

/** Back (or nothing) at the top of a pane: in the side column when there is
 *  one, else a round button in the pane (the sitter link, the legal pages). */
export function PaneBack({ onBack, dark = false }: { onBack: () => void; dark?: boolean }) {
  const { t } = useTranslation();
  const rail = useDuoRail();
  if (rail) return <RailBack onBack={onBack} />;
  return (
    <button
      type="button"
      aria-label={t("headers.back", "Back")}
      onClick={onBack}
      className="mb-5 grid size-[52px] shrink-0 place-items-center rounded-full active:scale-95"
      style={dark ? { background: "rgba(255,255,255,0.14)", color: "#fff" } : { background: DUO.forest, color: "#fff" }}
    >
      <ArrowLeft className="size-[22px]" strokeWidth={2.2} aria-hidden="true" />
    </button>
  );
}
