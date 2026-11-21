// Building blocks for the iPhone Duo's two-pane screens (lib/duo.ts decides
// when they apply; nothing here renders on any other screen size).
//
// The rule on the Duo: the left half is where you choose or act, the right half
// shows what you picked or what you need for that step. Big touch targets, one
// main button per screen (gold, inside the right half), and nothing on the
// fold: each pane keeps its own padding on both sides of the screen's center.
//
//   DuoTwoPane   left and right panes split exactly at the center, each
//                scrolling on its own; `dark` makes the left one forest.
//   TileGrid     two columns of big tiles (Tile) for the left pane.
//   PopOutCard   the right pane's content as one large white card.
//   StepList     big rows for a dark left pane; the current row reaches the
//                fold so it reads as attached to the right pane.
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { SERIF } from "@/components/kya";

export const DUO = {
  bg: "#f0f4f0",
  forest: "#1a3d2e",
  line: "#e3e9e3",
  fineBg: "#cfe9b7",
  fineText: "#1a3d2e",
  attentionBg: "#fdf1d8",
  attentionText: "#8a6a1f",
  quiet: "#5f6b63",
  red: "#a32d2d",
} as const;

/** Two panes split at the screen's center (the fold). */
export function DuoTwoPane({ left, right, dark = false, leftLabel, rightLabel }: {
  left: ReactNode;
  right: ReactNode;
  /** Forest left pane with white text (StepList screens). */
  dark?: boolean;
  leftLabel?: string;
  rightLabel?: string;
}) {
  return (
    <div className="duo-split duo-blocks setup-frame" data-duo-two-pane="">
      <section aria-label={leftLabel} className={`duo-pane duo-block-pane${dark ? " duo-block-pane-dark" : ""}`} data-duo-pane="left">
        {left}
      </section>
      <section aria-label={rightLabel} className="duo-pane duo-block-pane duo-block-pane-right" data-duo-pane="right">
        {right}
      </section>
    </div>
  );
}

export type TileTone = "fine" | "attention" | "neutral";

/** One status pill: green for fine, amber for "needs attention". */
export function StatusPill({ tone, children, inverted = false }: { tone: TileTone; children: ReactNode; inverted?: boolean }) {
  const style = inverted
    ? { background: "rgba(255,255,255,0.16)", color: "#fff" }
    : tone === "attention"
      ? { background: DUO.attentionBg, color: DUO.attentionText }
      : tone === "fine"
        ? { background: DUO.fineBg, color: DUO.fineText }
        : { background: "#eef2ee", color: DUO.quiet };
  return (
    <span className="inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-[13px] font-[700] leading-tight" style={style}>
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Two columns of tiles. */
export function TileGrid({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div role="list" aria-label={label} className="grid grid-cols-2 gap-3">
      {children}
    </div>
  );
}

/** A large tile: icon square, bold title, one status pill. Selected = forest. */
export function Tile({ icon, title, status, tone = "neutral", selected = false, onSelect, dashed = false, media, preview }: {
  icon?: ReactNode;
  title: ReactNode;
  /** Up to two lines under the title (a section's first lines, an entry's start). */
  preview?: ReactNode;
  status?: ReactNode;
  tone?: TileTone;
  selected?: boolean;
  onSelect: () => void;
  /** "Invite someone": a dashed outline instead of the white card. */
  dashed?: boolean;
  /** In place of the icon square (a person's initial, a bird photo). */
  media?: ReactNode;
}) {
  return (
    <div role="listitem" className="min-w-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="duo-tile flex min-h-[118px] w-full flex-col items-start gap-2.5 rounded-[24px] border p-4 text-left active:scale-[0.98]"
        style={selected
          ? { background: DUO.forest, borderColor: DUO.forest, color: "#fff", boxShadow: "0 10px 24px rgba(26,61,46,0.22)" }
          : dashed
            ? { background: "transparent", borderColor: "#a9b8ad", borderStyle: "dashed", borderWidth: 2, color: DUO.forest }
            : { background: "#fff", borderColor: DUO.line, color: DUO.forest }}
      >
        {media ?? (
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-[14px] [&>svg]:size-[22px]"
            style={selected ? { background: "rgba(255,255,255,0.14)", color: "#fff" } : { background: DUO.bg, color: DUO.forest }}
          >
            {icon}
          </span>
        )}
        <span className="block w-full text-[17px] font-[700] leading-tight">{title}</span>
        {preview && <span data-tile-preview="" className="line-clamp-2 w-full break-words text-[14px] leading-snug" style={{ color: selected ? "rgba(255,255,255,0.78)" : DUO.quiet }}>{preview}</span>}
        {status && <StatusPill tone={tone} inverted={selected}>{status}</StatusPill>}
      </button>
    </div>
  );
}

/** The right pane's content as one large card. `action` is the screen's one
 *  main button (gold); it sits at the bottom of the card. */
export function PopOutCard({ eyebrow, title, children, action, footer, corner }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  /** Under the main button: a text link (e.g. "Remove Sam from household"). */
  footer?: ReactNode;
  /** Top right, beside the eyebrow and title (e.g. previous / next buttons). */
  corner?: ReactNode;
}) {
  return (
    <article className="duo-popout flex min-h-full flex-col rounded-[28px] bg-white p-6" style={{ boxShadow: "0 18px 40px rgba(26,61,46,0.12), 0 2px 6px rgba(26,61,46,0.06)" }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="m-0 text-[13px] font-[700] uppercase tracking-[0.08em]" style={{ color: DUO.quiet }}>{eyebrow}</p>}
          <h2 className="m-0 mt-1.5 text-[28px] font-[600] leading-[1.15] [text-wrap:balance]" style={{ fontFamily: SERIF, color: DUO.forest }}>{title}</h2>
        </div>
        {corner && <div className="flex shrink-0 gap-2">{corner}</div>}
      </div>
      <div className="mt-5 flex-1">{children}</div>
      {(action || footer) && (
        <div className="mt-6 flex flex-col items-stretch gap-3">
          {action}
          {footer && <div className="text-center">{footer}</div>}
        </div>
      )}
    </article>
  );
}

export type Step = {
  key: string;
  title: ReactNode;
  status?: ReactNode;
  icon?: ReactNode;
  done?: boolean;
};

/** Big rows for the dark left pane. The current row is light and reaches the
 *  fold, so it visually joins the right pane. */
export function StepList({ steps, current, onSelect, label }: {
  steps: Step[];
  current: string;
  onSelect: (key: string) => void;
  label?: string;
}) {
  return (
    <ol aria-label={label} className="m-0 flex list-none flex-col gap-1.5 p-0">
      {steps.map((s) => {
        const on = s.key === current;
        return (
          <li key={s.key} className={on ? "duo-step-current" : undefined}>
            <button
              type="button"
              onClick={() => onSelect(s.key)}
              aria-current={on ? "step" : undefined}
              className="flex min-h-[64px] w-full items-center gap-3.5 rounded-[20px] px-4 py-3 text-left"
              style={on ? { background: DUO.bg, color: DUO.forest } : { color: "#fff" }}
            >
              <span
                aria-hidden="true"
                className="grid size-10 shrink-0 place-items-center rounded-full [&>svg]:size-5"
                style={s.done
                  ? { background: DUO.fineBg, color: DUO.forest }
                  : on ? { background: "#fff", color: DUO.forest } : { background: "rgba(255,255,255,0.12)", color: "#fff" }}
              >
                {s.done ? <Check strokeWidth={3} /> : s.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-[700] leading-tight">{s.title}</span>
                {s.status && <span className="mt-0.5 block text-[14px] leading-snug" style={{ color: on ? DUO.quiet : "rgba(255,255,255,0.72)" }}>{s.status}</span>}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** The one main button, gold with the 2px forest border. */
export function DuoMainButton({ children, onClick, disabled, type = "button" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[17px] font-[700] active:scale-[0.99] disabled:opacity-45"
      style={{ background: "#f2b33d", borderColor: DUO.forest, color: DUO.forest }}
    >
      {children}
    </button>
  );
}
