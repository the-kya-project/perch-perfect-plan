import type { ReactNode } from "react";
import { K, KyaHeading } from "@/components/kya";

export type ChipOption<T extends string> = { value: T; label: string };

/**
 * A row of filter chips: real buttons with aria-pressed, in a labelled group,
 * scrolling sideways on a phone. The same look as the journal's filters
 * (forest when on, white with a line when off), 44px tall touch targets.
 * `allowNone` lets a second tap on the chosen chip clear it.
 */
export function FlockChips<T extends string>({ label, options, value, onChange, allowNone = false, testId }: {
  label: string;
  options: ChipOption<T>[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  allowNone?: boolean;
  testId?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      data-testid={testId}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            data-chip={o.value}
            onClick={() => onChange(on && allowNone ? undefined : o.value)}
            className="inline-flex min-h-[44px] shrink-0 items-center active:scale-[0.98]"
          >
            <span
              className="inline-flex h-10 items-center whitespace-nowrap rounded-full px-4 text-[15px] font-[700]"
              style={on
                ? { background: K.forest, color: "#fff", border: `1.5px solid ${K.forest}` }
                : { background: "#fff", color: K.forest, border: `1.5px solid ${K.line}` }}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Sub-tabs (Chapter's Posts / Events / Resources): one segmented control, a
 * real tablist so screen readers announce "tab, 1 of 3, selected".
 */
export function FlockSubTabs<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-full bg-white p-1" style={{ border: `1.5px solid ${K.line}` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            data-subtab={o.value}
            onClick={() => onChange(o.value)}
            className="min-h-[44px] flex-1 rounded-full px-3 text-[15px] font-[700] active:scale-[0.98]"
            style={on ? { background: K.forest, color: "#fff" } : { color: K.forest }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A designed empty state: a soft icon, a short heading, one or two kind
 *  sentences. Announced politely when it changes (a new filter). */
export function FlockEmpty({ icon, title, children }: { icon: ReactNode; title: ReactNode; children: ReactNode }) {
  return (
    <section
      aria-live="polite"
      data-testid="flock-empty"
      className="flex flex-col items-center rounded-[22px] bg-white px-6 py-9 text-center"
      style={{ border: `1px solid ${K.line}` }}
    >
      <span className="grid size-14 place-items-center rounded-full" style={{ background: K.lime, color: K.forest }} aria-hidden="true">
        {icon}
      </span>
      <KyaHeading as="h2" size={22} className="mt-4">{title}</KyaHeading>
      <p className="m-0 mt-2 max-w-[34ch] text-[15px] leading-[1.55]" style={{ color: K.ink }}>{children}</p>
    </section>
  );
}
