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
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => { setPicking(false); onChange(""); }}
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

  // We never render an EMPTY native <input type="date">: on iOS an empty date
  // input renders as today, so clearing looked like it "reset to today." When
  // there's no date we show an "Add birth date" button instead; the native
  // input only appears once a date exists or the user is actively picking.
  const [picking, setPicking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (picking) {
      // Open the native picker straight away if the browser supports it.
      try { (inputRef.current as any)?.showPicker?.(); } catch { /* fall back to tap */ }
    }
  }, [picking]);

  const showInput = hasBirth || picking;

  return (
    <div className={layout === "stacked" ? "space-y-3" : "grid grid-cols-2 gap-3"}>
      <BirdField label="Age" hint={hasBirth ? "From birthdate" : undefined}>
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
      <BirdField label="Birth date" hint="Optional — sets age automatically">
        {showInput ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              autoFocus={picking && !hasBirth}
              className="input"
              type="date"
              max={max}
              value={birthDate ?? ""}
              onChange={(e) => {
                const bd = e.target.value || null;
                onChange({ age: ageFromBirthDate(bd) ?? age, birthDate: bd });
              }}
            />
            <button
              type="button"
              onClick={() => { setPicking(false); onChange({ age, birthDate: null }); }}
              className="shrink-0 rounded-lg border border-sage-200 bg-white px-2.5 py-2 text-xs font-medium text-sage-700"
            >
              Clear
            </button>
          </div>
        ) : (
          // Unambiguous empty state — no native date control to render "today."
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="input flex items-center justify-between text-left text-sage-500"
          >
            Add birth date
          </button>
        )}
      </BirdField>
    </div>
  );
}
