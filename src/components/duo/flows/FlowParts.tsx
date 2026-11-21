// Small pieces shared by the iPhone Duo task flows (add a bird, hand off,
// export, mark as passed, something's wrong). Only rendered when
// useDuoMode() === "sideways"; every other screen keeps its own page.
import type { ReactNode } from "react";
import { SERIF } from "@/components/kya";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { DUO } from "@/components/duo/DuoBlocks";

/** The left pane's heading: eyebrow, serif title, one line under it. */
export function FlowHeading({ eyebrow, title, line, dark = false }: { eyebrow?: ReactNode; title: ReactNode; line?: ReactNode; dark?: boolean }) {
  return (
    <div>
      {eyebrow && (
        <p className="m-0 text-[13px] font-[700] uppercase tracking-[0.08em]" style={{ color: dark ? "#d6ebc4" : DUO.quiet }}>{eyebrow}</p>
      )}
      <h1 className="m-0 mt-1.5 text-[30px] font-[600] leading-[1.12] [text-wrap:balance]" style={{ fontFamily: SERIF, color: dark ? "#fff" : DUO.forest }}>{title}</h1>
      {line && (
        <p className="m-0 mt-2 text-[16px] leading-[1.5]" style={{ color: dark ? "rgba(255,255,255,0.78)" : DUO.quiet }}>{line}</p>
      )}
    </div>
  );
}

/** A bird photo tile (at least 128px tall on the Duo), or the name's initial. */
export function FlowBirdPhoto({ url, original, position, name, height = 200, rounded = 24 }: {
  url?: string | null;
  original?: string | null;
  position?: string | null;
  name: string;
  height?: number;
  rounded?: number;
}) {
  return (
    <span
      className="relative block w-full shrink-0 overflow-hidden"
      style={{ height: Math.max(128, height), borderRadius: rounded, background: DUO.forest }}
    >
      {url ? (
        <BirdPhotoCrop url={url} original={original} position={position} alt="" eager />
      ) : (
        <span aria-hidden="true" className="grid size-full place-items-center text-[44px] font-[700] text-white" style={{ fontFamily: SERIF }}>
          {(name.trim()[0] ?? "?").toUpperCase()}
        </span>
      )}
    </span>
  );
}

/** Label / value rows for a preview card. Rows with no value are left out. */
export function FlowFacts({ rows }: { rows: [string, ReactNode | null | undefined][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (!shown.length) return null;
  return (
    <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-3">
      {shown.map(([l, v]) => (
        <div key={l} className="min-w-0">
          <dt className="text-[13px] font-[700]" style={{ color: DUO.quiet }}>{l}</dt>
          <dd className="m-0 mt-0.5 break-words text-[16px] font-[600]" style={{ color: DUO.forest }}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The screen's one main button pinned to the bottom of the right half, for a
 *  right pane that scrolls (same place as TaskFooter's). Leaves room for it. */
export function FlowPinnedAction({ children }: { children: ReactNode }) {
  return (
    <>
      <div aria-hidden="true" className="h-[110px] shrink-0" />
      <div className="duo-task-footer" data-noprint>{children}</div>
    </>
  );
}
