import { useEffect, useRef, useState } from "react";
import { PARROT_SPECIES, PARROT_SPECIES_GROUPS, AGE_OPTIONS, ageFromBirthDate } from "@/lib/parrot-data";

export function BirdField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-sage-600">{label}</span>
      {hint && <span className="mb-1 block text-[11px] text-sage-600">{hint}</span>}
      {children}
    </label>
  );
}

export function SpeciesPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const known = PARROT_SPECIES.includes(value);
  const isOther = value !== "" && !known;
  const [mode, setMode] = useState<"known" | "other">(isOther ? "other" : "known");
  return (
    <BirdField label="Species">
      <select
        className="input"
        value={mode === "other" ? "__other__" : value}
        onChange={(e) => {
          if (e.target.value === "__other__") { setMode("other"); onChange(""); }
          else { setMode("known"); onChange(e.target.value); }
        }}
      >
        <option value="">Select species…</option>
        {PARROT_SPECIES_GROUPS.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((s) => <option key={s} value={s}>{s}</option>)}
          </optgroup>
        ))}
        <option value="__other__">Other…</option>
      </select>
      {mode === "other" && (
        <input
          className="input mt-2"
          placeholder="Enter species"
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
  addLabel = "Add date",
  inputClassName = "input",
}: {
  value: string;
  onChange: (v: string) => void;
  max?: string;
  addLabel?: string;
  inputClassName?: string;
}) {
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
          className="shrink-0 rounded-lg border border-[#c8bfa6] bg-white px-2.5 py-2 text-xs font-medium text-[#5f5e5a]"
        >
          Clear
        </button>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setPicking(true)} className={`${inputClassName} flex items-center text-left text-[#9a978c]`}>
      {addLabel}
    </button>
  );
}

export function AgePicker({ age, birthDate, onChange, layout = "grid" }: { age: string; birthDate: string; onChange: (next: { age: string; birthDate: string | null }) => void; layout?: "grid" | "stacked" }) {
  const computed = ageFromBirthDate(birthDate);
  const hasBirth = !!birthDate;
  const max = new Date().toISOString().slice(0, 10);

  return (
    <div className={layout === "stacked" ? "space-y-3" : "grid grid-cols-2 gap-3"}>
      <BirdField label="Age" hint={hasBirth ? "From hatch date" : undefined}>
        <select
          className="input disabled:opacity-60"
          disabled={hasBirth}
          value={hasBirth ? (computed ?? "") : age}
          onChange={(e) => onChange({ age: e.target.value, birthDate: null })}
        >
          <option value="">Unknown</option>
          {AGE_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </BirdField>
      <BirdField label="Hatch date" hint="Optional — sets age automatically">
        {/* Hatch date uses the shared OptionalDate so clear-to-empty (+ the iOS
            Clear guard) lives in ONE place. Clearing also drops the age that was
            auto-derived from it, so no stale derived age is left behind. */}
        <OptionalDate
          value={birthDate ?? ""}
          max={max}
          addLabel="Add hatch date"
          onChange={(v) => onChange({ age: v ? (ageFromBirthDate(v) ?? age) : "", birthDate: v || null })}
        />
      </BirdField>
    </div>
  );
}
