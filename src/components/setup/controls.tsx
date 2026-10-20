// Setup design system: the buttons, section cards, tags and input controls the
// new-bird setup screens share. One rule per kind of question:
//   pick any            → CheckChips
//   pick one of 2–3     → Segmented
//   pick one of 4+ / long labels → Dropdown
//   one on/off          → Switch
//   short typed answer  → TextField
//   notes               → TextBox
//   a list they edit    → EditableList
// Colors are the setup palette (S); red and amber stay reserved for warnings
// and health flags.
import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Plus, X } from "lucide-react";

export const S = {
  forest: "#1a3d2e",
  forestDeep: "#12291f",
  lime: "#cdeab0",
  sunflower: "#f2b33d",
  moss: "#2d6a4f",
  mist: "#d6e8dc",
  pillLine: "#2f5a47",
  card: "#f1f5f0",
  line: "#c9d6c9",
  footerLine: "#d5dfd5",
  helper: "#3d4f45",
  quiet: "#5f5e5a",
  amberBg: "#f6e7c4",
  amberText: "#854f0b",
} as const;

export const SERIF = "'Newsreader', Georgia, serif";

// ---------- Buttons ----------

const BTN = "inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700] disabled:opacity-45";

export function SetupPrimaryButton({ children, onClick, disabled, type = "button", full = true, arrow = true }: {
  children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit"; full?: boolean; arrow?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${BTN} ${full ? "w-full" : ""}`} style={{ background: S.sunflower, color: S.forest, borderColor: S.forest }}>
      {children}{arrow && <span aria-hidden="true">→</span>}
    </button>
  );
}

export function SetupSecondaryButton({ children, onClick, disabled, full = true }: { children: ReactNode; onClick?: () => void; disabled?: boolean; full?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${BTN} bg-white ${full ? "w-full" : ""}`} style={{ color: S.forest, borderColor: S.forest }}>
      {children}
    </button>
  );
}

export function SetupTextButton({ children, onClick, disabled, icon }: { children: ReactNode; onClick?: () => void; disabled?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex min-h-[44px] items-center gap-1.5 border-0 bg-transparent px-1 text-[15px] font-[700] disabled:opacity-45" style={{ color: S.moss }}>
      {icon}{children}
    </button>
  );
}

// ---------- Section cards ----------

export function SectionCard({ title, helper, tag, emphasis, children }: {
  title?: ReactNode; helper?: ReactNode; tag?: ReactNode; emphasis?: boolean; children?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-[14px] rounded-[18px] px-4 py-5" style={{ background: emphasis ? S.lime : S.card, color: S.forest }}>
      {(title || tag) && (
        <div className="flex flex-wrap items-center gap-2">
          {title && <SectionHeading>{title}</SectionHeading>}
          {tag}
        </div>
      )}
      {helper && <Helper onLime={emphasis}>{helper}</Helper>}
      {children}
    </section>
  );
}

/** A white card led by a round icon tile (the "Your home" screens, on a light green body). */
export function TileCard({ icon, tile = "lime", title, helper, children }: {
  icon: ReactNode; tile?: "lime" | "teal" | "amber"; title: ReactNode; helper?: ReactNode; children?: ReactNode;
}) {
  const tileStyle = tile === "teal" ? { background: "#9bcab8", color: S.forest } : tile === "amber" ? { background: S.amberBg, color: S.amberText } : { background: S.lime, color: S.forest };
  return (
    <section className="flex flex-col gap-[14px] rounded-[20px] bg-white p-4" style={{ color: S.forest }}>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full" style={tileStyle} aria-hidden="true">{icon}</span>
        <SectionHeading>{title}</SectionHeading>
      </div>
      {helper && <Helper>{helper}</Helper>}
      {children}
    </section>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return <h2 className="m-0 text-[21px] font-[700] leading-[1.2]" style={{ fontFamily: SERIF }}>{children}</h2>;
}

export function Helper({ children, onLime }: { children: ReactNode; onLime?: boolean }) {
  return <p className="m-0 text-[15px] leading-[1.5]" style={{ color: onLime ? S.forest : S.helper }}>{children}</p>;
}

// ---------- Tags ----------

type TagKind = "required" | "ready" | "needs";

export function Tag({ kind, onLime, children }: { kind: TagKind; onLime?: boolean; children?: ReactNode }) {
  const { t } = useTranslation();
  const style =
    kind === "required" || (kind === "ready" && onLime) ? { background: S.forest, color: "#fff" }
    : kind === "ready" ? { background: S.lime, color: S.forest }
    : { background: S.amberBg, color: S.amberText };
  const label = children ?? (kind === "required" ? t("setupUi.required", "Required") : kind === "ready" ? t("setupUi.ready", "Ready") : t("setupUi.needsDetails", "Needs details"));
  return <span className="inline-flex items-center rounded-full px-[10px] py-[5px] text-[12px] font-[700] leading-none" style={style}>{label}</span>;
}

/** Quiet "Optional" after a field label. */
export function OptionalMark() {
  const { t } = useTranslation();
  return <span className="ml-1.5 text-[13px] font-[500]" style={{ color: S.quiet }}>{t("setupUi.optional", "Optional")}</span>;
}

// ---------- Labels ----------

/** Label above a control: 15px bold, 6px gap. Pass `htmlFor` for a single input. */
export function Field({ label, optional, htmlFor, children }: { label: ReactNode; optional?: boolean; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[15px] font-[700]" style={{ color: S.forest }}>
        {label}{optional && <OptionalMark />}
      </label>
      {children}
    </div>
  );
}

// ---------- Check chips (pick any) ----------

export function CheckChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 px-4 text-[15px] ${on ? "font-[700]" : "font-[500]"}`}
      style={on ? { background: S.forest, borderColor: S.forest, color: "#fff" } : { background: "#fff", borderColor: S.line, color: S.forest }}
    >
      {on && <Check className="size-4 shrink-0" strokeWidth={3} aria-hidden="true" />}
      {children}
    </button>
  );
}

export function CheckChips<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: ReactNode }[]; value: T[]; onChange: (next: T[]) => void; label?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <CheckChip key={o.value} on={on} onClick={() => onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])}>
            {o.label}
          </CheckChip>
        );
      })}
    </div>
  );
}

// ---------- Check row (pick any, when each choice needs two lines) ----------

/** A check chip with room for a name and a detail line, plus a leading badge. */
export function CheckRow({ on, onClick, leading, title, detail, disabled }: {
  on: boolean; onClick: () => void; leading?: ReactNode; title: ReactNode; detail?: ReactNode; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[72px] w-full items-center gap-3 rounded-[18px] border-2 px-3.5 py-3 text-left disabled:opacity-45"
      style={{ background: on ? S.lime : "#fff", borderColor: on ? S.forest : S.line, color: S.forest }}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-[700]">{title}</span>
        {detail && <span className="mt-0.5 block text-[14px] leading-[1.35]" style={{ color: S.helper }}>{detail}</span>}
      </span>
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-[8px] border-2"
        style={on ? { background: S.forest, borderColor: S.forest, color: S.lime } : { background: "#fff", borderColor: S.line }}
      >
        {on && <Check className="size-4" strokeWidth={3} />}
      </span>
    </button>
  );
}

// ---------- Segmented choice (pick one of 2–3 short options) ----------

export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: ReactNode }[]; value: T | null; onChange: (next: T) => void; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-full bg-white p-1" style={{ boxShadow: `inset 0 0 0 2px ${S.line}` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`min-h-[44px] flex-1 rounded-full px-3 text-[15px] ${on ? "font-[700]" : "font-[500]"}`}
            style={on ? { background: S.forest, color: "#fff" } : { background: "transparent", color: S.forest }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Dropdown (pick one of 4+, or long labels) ----------

export function Dropdown({ id, value, onChange, options, placeholder, ariaLabel, invalid }: {
  id?: string; value: string; onChange: (next: string) => void; options: { value: string; label: string }[]; placeholder?: string; ariaLabel?: string;
  /** A required answer that's missing: amber border. */
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid || undefined}
        className="h-12 w-full appearance-none rounded-full border-2 bg-white pl-[18px] pr-11 text-[16px] outline-none focus:border-[#1a3d2e]"
        style={{ borderColor: invalid ? S.amberText : S.line, color: S.forest }}
      >
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2" style={{ color: S.forest }} aria-hidden="true" />
    </div>
  );
}

// ---------- Switch (one on/off) ----------

export function Switch({ checked, onChange, label, children }: { checked: boolean; onChange: (next: boolean) => void; label?: string; children?: ReactNode }) {
  const id = useId();
  const track = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={children ? undefined : label}
      aria-labelledby={children ? id : undefined}
      onClick={() => onChange(!checked)}
      className="relative h-8 w-[52px] shrink-0 rounded-full transition-colors"
      style={{ background: checked ? S.forest : S.line }}
    >
      <span
        className="absolute top-1 size-6 rounded-full transition-[left]"
        style={{ left: checked ? 24 : 4, background: checked ? S.lime : "#fff" }}
      />
    </button>
  );
  if (!children) return track;
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3">
      <span id={id} className="text-[15px] font-[700]" style={{ color: S.forest }}>{children}</span>
      {track}
    </div>
  );
}

// ---------- Text field and text box ----------

const FIELD = "w-full border-2 bg-white text-[16px] outline-none focus:border-[#1a3d2e]";

export function TextField({ id, value, onChange, placeholder, type = "text", inputMode, ariaLabel, invalid, maxLength, className }: {
  id?: string; value: string; onChange: (next: string) => void; placeholder?: string; type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; ariaLabel?: string;
  /** A required answer that's missing: amber border. */
  invalid?: boolean; maxLength?: number; className?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      inputMode={inputMode}
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(e.target.value)}
      className={`${FIELD} h-12 rounded-full px-[18px] ${className ?? ""}`}
      style={{ borderColor: invalid ? S.amberText : S.line, color: S.forest }}
    />
  );
}

export function TextBox({ id, value, onChange, placeholder, ariaLabel }: { id?: string; value: string; onChange: (next: string) => void; placeholder?: string; ariaLabel?: string }) {
  return (
    <textarea
      id={id}
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${FIELD} min-h-[88px] rounded-[18px] px-4 py-3 leading-[1.5]`}
      style={{ borderColor: S.line, color: S.forest }}
    />
  );
}

// ---------- Editable list ----------

export function EditableList({ items, onRemove, onAdd, addLabel, renderItem, tone = "plain" }: {
  items: string[]; onRemove: (index: number) => void; onAdd?: () => void; addLabel?: string; renderItem?: (item: string, index: number) => ReactNode;
  /** "warn": amber rows with bold amber text, for things to avoid. */
  tone?: "plain" | "warn";
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      {items.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item, i) => (
            <li key={`${item}-${i}`} className="flex min-h-12 items-center gap-2 rounded-[14px] pl-4" style={tone === "warn" ? { background: S.amberBg, color: S.amberText } : { background: "#fff", color: S.forest }}>
              <span className={`min-w-0 flex-1 py-2 text-[16px] ${tone === "warn" ? "font-[700]" : ""}`}>{renderItem ? renderItem(item, i) : item}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={t("setupUi.removeItem", "Remove {{item}}", { item })}
                className="grid size-11 shrink-0 place-items-center rounded-full"
                style={{ color: tone === "warn" ? S.amberText : S.forest }}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {onAdd && (
        <div>
          <SetupTextButton onClick={onAdd} icon={<Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />}>
            {addLabel ?? t("setupUi.add", "Add…")}
          </SetupTextButton>
        </div>
      )}
    </div>
  );
}
