import { useState } from "react";
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

export function AgePicker({ age, birthDate, onChange }: { age: string; birthDate: string; onChange: (next: { age: string; birthDate: string | null }) => void }) {
  const computed = ageFromBirthDate(birthDate);
  const hasBirth = !!birthDate;
  return (
    <div className="grid grid-cols-2 gap-3">
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
        <input
          className="input"
          type="date"
          max={new Date().toISOString().slice(0, 10)}
          value={birthDate ?? ""}
          onChange={(e) => {
            const bd = e.target.value || null;
            onChange({ age: ageFromBirthDate(bd) ?? age, birthDate: bd });
          }}
        />
      </BirdField>
    </div>
  );
}
