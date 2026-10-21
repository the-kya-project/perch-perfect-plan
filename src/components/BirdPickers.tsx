import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { PARROT_SPECIES, PARROT_SPECIES_GROUPS, AGE_OPTIONS, ageFromBirthDate } from "@/lib/parrot-data";
import { localDateISO } from "@/lib/localDay";
import { speciesLabel, speciesGroupLabel } from "@/lib/speciesLabel";

/** Display label for a stored English age value ("<1 year", "3 years"). The
 *  stored value stays English (species work the same way: see speciesLabel). */
export function ageLabel(t: TFunction, age: string): string {
  if (age === "<1 year") return t("birdPickers.ageUnderOne", "<1 year");
  const m = /^(\d+) years?$/.exec(age);
  if (!m) return age;
  const n = Number(m[1]);
  return n === 1 ? t("birdPickers.ageYearsOne", "{{n}} year", { n }) : t("birdPickers.ageYearsOther", "{{n}} years", { n });
}

/** The shared field: 13.5px bold sentence-case label (plus a forest
 *  "Required" tag when required), an optional muted hint, then the control. */
export function BirdField({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex flex-wrap items-center gap-2 text-[13.5px] font-[700] text-[#1a3d2e]">
        {label}
        {required && <span className="rounded-full bg-[#1a3d2e] px-2 py-[1px] text-[11.5px] font-[700] text-white">{t("birdPickers.required", "Required")}</span>}
      </span>
      {hint && <span className="text-[13px] leading-[1.4] text-[#5f5e5a]">{hint}</span>}
      {children}
    </label>
  );
}

export function SpeciesPicker({ value, onChange, required }: { value: string; onChange: (v: string) => void; required?: boolean }) {
  const known = PARROT_SPECIES.includes(value);
  const isOther = value !== "" && !known;
  const { t } = useTranslation();
  const [mode, setMode] = useState<"known" | "other">(isOther ? "other" : "known");
  return (
    <BirdField label={t("birdPickers.species", "Species")} required={required}>
      <select
        className="kya-input"
        value={mode === "other" ? "__other__" : value}
        onChange={(e) => {
          if (e.target.value === "__other__") { setMode("other"); onChange(""); }
          else { setMode("known"); onChange(e.target.value); }
        }}
      >
        <option value="">{t("birdPickers.selectSpecies", "Select species…")}</option>
        {PARROT_SPECIES_GROUPS.map((g) => (
          <optgroup key={g.label} label={speciesGroupLabel(t, g.label)}>
            {g.options.map((s) => <option key={s} value={s}>{speciesLabel(t, s)}</option>)}
          </optgroup>
        ))}
        <option value="__other__">{t("birdPickers.otherEllipsis", "Other…")}</option>
      </select>
      {mode === "other" && (
        <input
          className="kya-input mt-2"
          placeholder={t("birdPickers.enterSpecies", "Enter species")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </BirdField>
  );
}

// An optional date field that NEVER renders an empty native date input (iOS
// renders those as today, so "clearing" looked like it reset to today). When
// empty it shows an "add" button; the native input only appears once a date
// exists or the user taps to pick. Clearing returns to the empty button.
export function OptionalDate({
  value,
  onChange,
  max,
  addLabel: addLabelProp,
  inputClassName = "kya-input",
}: {
  value: string;
  onChange: (v: string) => void;
  max?: string;
  addLabel?: string;
  inputClassName?: string;
}) {
  const { t } = useTranslation();
  const addLabel = addLabelProp ?? t("birdPickers.addDate", "Add date");
  const [picking, setPicking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // iOS renders an empty <input type=date> as TODAY; tapping Clear blurs the
  // input and iOS commits that displayed today as a change — which would undo
  // the clear (the "Clear reverts to today" bug). Set on Clear's pointerdown
  // (before the blur) so we can swallow exactly that spurious today-commit.
  const ignoreTodayRef = useRef(false);
  useEffect(() => {
    if (picking) { try { (inputRef.current as any)?.showPicker?.(); } catch { /* fall back to tap */ } }
  }, [picking]);
  const show = !!value || picking;
  if (show) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          autoFocus={picking && !value}
          className={inputClassName}
          type="date"
          max={max}
          value={value}
          onChange={(e) => {
            // Swallow the FIRST onChange after a Clear unconditionally. On Clear
            // the input unmounts (show=false), so the only onChange that can fire
            // is iOS's spurious blur-commit of the displayed "today" — and we must
            // drop it whatever its value. (The old `=== max` check missed it when
            // the device's LOCAL today differed from the UTC-computed max, e.g.
            // evenings in the Americas — the "Clear reverts to today" regression.)
            if (ignoreTodayRef.current) {
              ignoreTodayRef.current = false;
              return;
            }
            onChange(e.target.value);
          }}
        />
        <button
          type="button"
          onPointerDown={() => { ignoreTodayRef.current = true; }}
          onClick={() => { setPicking(false); onChange(""); requestAnimationFrame(() => { ignoreTodayRef.current = false; }); }}
          // 44px tap target, rounded-full, DM Sans 15px/700 like a secondary button.
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border-[1.5px] border-[#d5dfd5] bg-white px-4 text-[15px] font-[700] text-[#1a3d2e]"
          style={{ fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif' }}
        >
          {t("birdPickers.clear", "Clear")}
        </button>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setPicking(true)} className={`${inputClassName} flex items-center text-left text-[#8a958e]`}>
      {addLabel}
    </button>
  );
}

export function AgePicker({ age, birthDate, onChange, layout = "grid" }: { age: string; birthDate: string; onChange: (next: { age: string; birthDate: string | null }) => void; layout?: "grid" | "stacked" }) {
  const { t } = useTranslation();
  const computed = ageFromBirthDate(birthDate);
  const hasBirth = !!birthDate;
  const max = localDateISO();

  return (
    <div className={layout === "stacked" ? "space-y-3" : "grid grid-cols-2 gap-3"}>
      <BirdField label={t("birdPickers.age", "Age")} hint={hasBirth ? t("birdPickers.fromHatchDate", "From hatch date") : undefined}>
        <select
          className="kya-input"
          disabled={hasBirth}
          value={hasBirth ? (computed ?? "") : age}
          onChange={(e) => onChange({ age: e.target.value, birthDate: null })}
        >
          <option value="">{t("birdPickers.unknown", "Unknown")}</option>
          {AGE_OPTIONS.map((a) => <option key={a} value={a}>{ageLabel(t, a)}</option>)}
        </select>
      </BirdField>
      <BirdField label={t("birdPickers.hatchDate", "Hatch date")} hint={t("birdPickers.hatchDateHint", "Optional — sets age automatically")}>
        {/* Hatch date uses the shared OptionalDate so clear-to-empty (+ the iOS
            Clear guard) lives in ONE place. Clearing also drops the age that was
            auto-derived from it, so no stale derived age is left behind. */}
        <OptionalDate
          value={birthDate ?? ""}
          max={max}
          addLabel={t("birdPickers.addHatchDate", "Add hatch date")}
          onChange={(v) => onChange({ age: v ? (ageFromBirthDate(v) ?? age) : "", birthDate: v || null })}
        />
      </BirdField>
    </div>
  );
}
