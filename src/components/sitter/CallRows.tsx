// Call rows shared by the sitter's Emergency screen and "Something's wrong".
//   VetCallRow   — red #a32d2d, 72px, small light label, bold 17px name, the
//                  phone under it, and a 48px white round call button with a
//                  red phone icon. Red stays reserved for these emergency calls.
//   PersonCallRow — the same shape in white with a forest-outlined call button
//                  (the owner, a backup contact, poison control).
// The whole row is the tel: link. Phone numbers never truncate; long names and
// numbers wrap instead.
import { Phone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";

/** Pretty-print a US number; anything else is returned trimmed as typed. */
function formatPhone(raw?: string | null): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return raw.trim();
}

function telHref(raw?: string | null): string {
  if (!raw) return "";
  const digits = raw.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : `tel:${raw.trim()}`;
}

type RowProps = {
  /** Small label above the name ("Avian vet", "After-hours emergency vet"). */
  label: string;
  name?: string | null;
  phone?: string | null;
  /** Where the row sits: "forest" (Emergency) or "mist" (Something's wrong).
   *  Only changes how a missing number is shown. */
  surface?: "forest" | "mist";
};

function Missing({ label, surface }: { label: string; surface: "forest" | "mist" }) {
  const { t } = useTranslation();
  const onForest = surface === "forest";
  return (
    <div
      className="flex min-h-[56px] items-center rounded-[18px] px-4 py-3 text-[14px] leading-[1.4]"
      style={onForest ? { background: K.forestDeep, color: "rgba(255,255,255,0.65)" } : { background: "#fff", color: K.quiet, border: "1px solid #d5dfd5" }}
    >
      {label}: {t("sitter.emergency.notProvided", "not provided by owner.")}
    </div>
  );
}

function Row({ label, name, phone, tone, surface = "forest" }: RowProps & { tone: "red" | "white" }) {
  const { t } = useTranslation();
  if (!phone) return <Missing label={label} surface={surface} />;
  const display = formatPhone(phone);
  const red = tone === "red";
  const title = name?.trim() || display;
  const callLabel = t("sitter.calls.callAria", "Call {{who}}, {{phone}}", { who: name?.trim() || label, phone: display });
  return (
    <a
      href={telHref(phone)}
      aria-label={callLabel}
      className="flex min-h-[72px] items-center gap-3 rounded-[18px] px-4 py-3 active:scale-[0.99]"
      style={red
        ? { background: K.red, color: "#fff" }
        : { background: "#fff", color: K.forest, border: surface === "mist" ? "1px solid #d5dfd5" : undefined }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] leading-[1.3]" style={{ color: red ? "rgba(255,255,255,0.8)" : K.quiet }}>{label}</span>
        <span className="mt-0.5 block break-words text-[17px] font-[700] leading-[1.25]">{title}</span>
        {title !== display && (
          <span className="mt-0.5 block whitespace-normal break-words text-[14px] leading-[1.3]" style={{ color: red ? "rgba(255,255,255,0.9)" : K.ink }}>{display}</span>
        )}
      </span>
      <span
        className="grid size-12 shrink-0 place-items-center rounded-full bg-white"
        style={red ? { color: K.red } : { color: K.forest, border: `2px solid ${K.forest}` }}
        aria-hidden="true"
      >
        <Phone className="size-5" />
      </span>
    </a>
  );
}

export function VetCallRow(props: RowProps) {
  return <Row {...props} tone="red" />;
}

export function PersonCallRow(props: RowProps) {
  return <Row {...props} tone="white" />;
}
