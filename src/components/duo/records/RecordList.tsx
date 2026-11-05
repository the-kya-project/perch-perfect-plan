// List-left / open-item-right pieces for the iPhone Duo's record screens
// (Journal, Moments, Updates, Past birds; lib/duo.ts decides when they apply).
// The left pane carries the title, a small gold "+ Add" pill, filter chips and
// the entries as cards; the right pane shows the one picked (or the add form).
//
// One gold element per screen: the Add pill is gold while the right pane shows
// an entry; while the add or edit form is open there (its Save is gold), the
// pill turns forest (`addActive`).
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { SERIF } from "@/components/kya";
import { DUO, StatusPill, type TileTone } from "@/components/duo/DuoBlocks";

/** The left pane's title row: serif title, optional line, small "+ Add" pill. */
export function RecordListHeader({ title, line, addLabel, onAdd, addActive = false, aside }: {
  title: ReactNode;
  line?: ReactNode;
  addLabel?: string;
  onAdd?: () => void;
  /** The add form is open in the right pane: the pill shows as picked (forest), not gold. */
  addActive?: boolean;
  /** A text link beside the title in place of the pill (e.g. "Mark all read"). */
  aside?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <h1 className="m-0 min-w-0 flex-1 text-[30px] font-[600] leading-tight [text-wrap:balance]" style={{ fontFamily: SERIF, color: DUO.forest }}>{title}</h1>
        {onAdd && addLabel && (
          <button
            type="button"
            onClick={onAdd}
            aria-pressed={addActive}
            className="mt-1 inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-[15px] font-[700] active:scale-[0.98]"
            style={addActive
              ? { background: DUO.forest, borderColor: DUO.forest, color: "#fff" }
              : { background: "#f2b33d", borderColor: DUO.forest, color: DUO.forest }}
          >
            <Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />{addLabel}
          </button>
        )}
        {aside}
      </div>
      {line && <p className="m-0 mt-1.5 text-[16px] leading-[1.45]" style={{ color: DUO.quiet }}>{line}</p>}
    </div>
  );
}

/** Filter chips: 40px pills inside 44px tap targets; the chosen one is forest. */
export function FilterChips<V extends string>({ options, value, onChange, label }: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-x-2" role="group" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" aria-pressed={on} onClick={() => onChange(o.value)} className="inline-flex min-h-[44px] items-center active:scale-[0.98]">
            <span
              className="inline-flex h-10 items-center rounded-full px-4 text-[15px] font-[700]"
              style={on
                ? { background: DUO.forest, color: "#fff", border: `1.5px solid ${DUO.forest}` }
                : { background: "#fff", color: DUO.forest, border: `1.5px solid ${DUO.line}` }}
            >
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One entry as a big card: title with the date on the right, a tag pill and
 *  a one-line preview. Selected = forest. */
export function RecordCard({ title, date, tag, tagTone = "neutral", preview, media, selected, onSelect, unread = false }: {
  title: ReactNode;
  date?: ReactNode;
  tag?: ReactNode;
  tagTone?: TileTone;
  preview?: ReactNode;
  /** A photo or icon square on the left. */
  media?: ReactNode;
  selected: boolean;
  onSelect: () => void;
  /** A sunflower dot (Updates). */
  unread?: boolean;
}) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex min-h-[76px] w-full items-start gap-3 rounded-[22px] border p-4 text-left active:scale-[0.99]"
        style={selected
          ? { background: DUO.forest, borderColor: DUO.forest, color: "#fff", boxShadow: "0 10px 24px rgba(26,61,46,0.22)" }
          : { background: "#fff", borderColor: DUO.line, color: DUO.forest }}
      >
        {media}
        <span className="min-w-0 flex-1">
          <span className="flex items-start gap-3">
            <span className="min-w-0 flex-1 text-[17px] font-[700] leading-tight">{title}</span>
            {date && <span className="shrink-0 pt-0.5 text-[14px]" style={{ color: selected ? "rgba(255,255,255,0.78)" : DUO.quiet }}>{date}</span>}
            {unread && <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: "#f2b33d" }} aria-hidden="true" />}
          </span>
          {tag && <span className="mt-2 block"><StatusPill tone={tagTone} inverted={selected}>{tag}</StatusPill></span>}
          {preview && <span className="mt-1.5 block truncate text-[15px] leading-snug" style={{ color: selected ? "rgba(255,255,255,0.78)" : DUO.quiet }}>{preview}</span>}
        </span>
      </button>
    </li>
  );
}

/** The cards' list, with an optional small group label above each run. */
export function RecordCards({ children, label }: { children: ReactNode; label?: string }) {
  return <ul aria-label={label} className="m-0 flex list-none flex-col gap-2.5 p-0">{children}</ul>;
}

export function RecordGroupLabel({ children }: { children: ReactNode }) {
  return <p className="m-0 mt-2 px-1 text-[13px] font-[700] uppercase tracking-[0.06em]" style={{ color: DUO.quiet }}>{children}</p>;
}

/** A friendly card for an empty right pane. */
export function EmptyRecordCard({ icon, title, body, children }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; children?: ReactNode }) {
  return (
    <article className="duo-popout flex min-h-full flex-col items-center justify-center rounded-[28px] bg-white p-8 text-center" style={{ boxShadow: "0 18px 40px rgba(26,61,46,0.12), 0 2px 6px rgba(26,61,46,0.06)", color: DUO.forest }}>
      {icon && <span aria-hidden="true" className="grid size-16 place-items-center rounded-[20px] [&>svg]:size-7" style={{ background: DUO.bg, color: DUO.forest }}>{icon}</span>}
      <h2 className="m-0 mt-4 text-[24px] font-[600] leading-[1.2] [text-wrap:balance]" style={{ fontFamily: SERIF }}>{title}</h2>
      {body && <p className="m-0 mt-2 max-w-[36ch] text-[16px] leading-[1.5]" style={{ color: DUO.quiet }}>{body}</p>}
      {children && <div className="mt-5 w-full max-w-[320px]">{children}</div>}
    </article>
  );
}

/** Photos two across (one photo fills the width). */
export function PhotoGrid({ photos }: { photos: { key: string; node: ReactNode }[] }) {
  if (photos.length === 0) return null;
  return (
    <div className={`grid gap-3 ${photos.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
      {photos.map((p) => <div key={p.key} className="min-w-0">{p.node}</div>)}
    </div>
  );
}

/** Mist panel inside a pop-out card, for whole pages whose own cards are white. */
export function CardInset({ children }: { children: ReactNode }) {
  return <div className="-mx-2 flex flex-col gap-4 rounded-[22px] p-3" style={{ background: DUO.bg }}>{children}</div>;
}
