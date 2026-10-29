// "We saved your unfinished check from 2:14 pm", with Continue / Discard. Shown
// on a form that reopened with a local draft (lib/drafts.ts). The draft is
// already back in the fields; Continue just hides this line, Discard empties
// the form and removes the draft. Nothing is ever submitted from here.
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";

function when(savedAt: number, lang: string, t: ReturnType<typeof useTranslation>["t"]): string {
  const d = new Date(savedAt);
  const time = d.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return time;
  return t("draft.yesterdayAt", "yesterday at {{time}}", { time });
}

export function DraftRestoredNote({ savedAt, what, onContinue, onDiscard, className = "" }: {
  savedAt: number;
  /** "check" or "weight": picks the line's wording. */
  what: "check" | "weight";
  onContinue: () => void;
  onDiscard: () => void;
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const at = when(savedAt, i18n.language, t);
  const line = what === "check"
    ? t("draft.restoredCheck", "We saved your unfinished check from {{when}}.", { when: at })
    : t("draft.restoredWeight", "We saved your unfinished weight from {{when}}.", { when: at });
  return (
    <section
      role="status"
      className={`flex flex-col gap-3 rounded-[18px] p-4 ${className}`}
      style={{ background: K.mist, color: K.forest, border: `1.5px solid ${K.line}` }}
    >
      <p className="m-0 text-[15px] font-[700] leading-[1.4]">{line}</p>
      <p className="m-0 -mt-1.5 text-[13.5px] leading-[1.45]" style={{ color: K.quiet }}>
        {what === "check"
          ? t("draft.restoredHintCheck", "It isn't in the health log yet.")
          : t("draft.restoredHintWeight", "It isn't in the weight history yet.")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onContinue}
          className="min-h-[44px] rounded-full border-2 text-[14.5px] font-[700] active:scale-[0.98]"
          style={{ background: K.forest, borderColor: K.forest, color: "#fff" }}
        >
          {t("draft.continue", "Continue")}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="min-h-[44px] rounded-full border-2 bg-white text-[14.5px] font-[700] active:scale-[0.98]"
          style={{ borderColor: K.forest, color: K.forest }}
        >
          {t("draft.discard", "Discard")}
        </button>
      </div>
    </section>
  );
}
