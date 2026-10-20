// The Kya & Co. look outside setup: Home, the bird page and the weight page.
// Same system as the new-bird setup and the daily health check — a forest
// header, a mist body with rounded top corners, white cards, Newsreader
// headings, DM Sans text, sunflower main buttons and moss text links.
import type { CSSProperties, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export const K = {
  forest: "#1a3d2e",
  forestDeep: "#12291f",
  mist: "#f1f5f0",
  lime: "#cdeab0",
  moss: "#2d6a4f",
  sunflower: "#f2b33d",
  teal: "#9bcab8",
  paleGreen: "#d6e8dc",
  quiet: "#5f5e5a",
  ink: "#3d4f45",
  line: "#e3ebe2",
  red: "#a32d2d",
  amberBg: "#f6e7c4",
  amberText: "#854f0b",
};
export const SERIF = "'Newsreader', Georgia, serif";

/** Page shell: DM Sans, mist background, room for the tab bar. */
export function KyaPage({ children }: { children: ReactNode }) {
  return (
    <div className="setup-frame min-h-screen pb-nav" style={{ background: K.mist, color: K.forest }}>
      {children}
    </div>
  );
}

/** Forest header band. Full-bleed, phone-width content, extra room at the
 *  bottom for the body's rounded top to tuck under. */
export function KyaHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <header className="mx-[calc(50%-50vw)] text-white" style={{ background: K.forest }}>
      <div className={`mx-auto max-w-md px-5 pb-[46px] pt-[calc(env(safe-area-inset-top)+14px)] ${className}`}>{children}</div>
    </header>
  );
}

/** The mist body that sits under the header with 26px rounded top corners. */
export function KyaBody({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <main className={`relative mx-auto -mt-[26px] flex max-w-md flex-col gap-4 rounded-t-[26px] px-4 pb-6 pt-5 ${className}`} style={{ background: K.mist }}>
      {children}
    </main>
  );
}

/** 44px round icon button in darker forest, for headers. */
export function KyaIconButton({ label, onClick, children, style }: { label: string; onClick?: () => void; children: ReactNode; style?: CSSProperties }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="relative grid size-11 shrink-0 place-items-center rounded-full text-white active:scale-95" style={{ background: K.forestDeep, ...style }}>
      {children}
    </button>
  );
}

export function KyaCard({ children, className = "", style, id }: { children: ReactNode; className?: string; style?: CSSProperties; id?: string }) {
  return <section id={id} className={`overflow-hidden rounded-[20px] bg-white ${className}`} style={style}>{children}</section>;
}

/** Newsreader 700 heading. */
export function KyaHeading({ children, size = 21, className = "", as: Tag = "h2" }: { children: ReactNode; size?: number; className?: string; as?: "h1" | "h2" | "h3" }) {
  return <Tag className={`m-0 font-[700] leading-[1.15] ${className}`} style={{ fontFamily: SERIF, fontSize: size }}>{children}</Tag>;
}

/** Moss text link (a button), at least 44px tall. */
export function KyaLink({ children, onClick, color = K.moss, className = "" }: { children: ReactNode; onClick?: () => void; color?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex min-h-[44px] items-center gap-1 text-[15px] font-[700] active:opacity-70 ${className}`} style={{ color }}>
      {children}
    </button>
  );
}

/** Sunflower main button with a 2px forest border, 52px tall. */
export function KyaPrimaryButton({ children, onClick, disabled, icon }: { children: ReactNode; onClick?: () => void; disabled?: boolean; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700] disabled:opacity-45"
      style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
    >
      {icon}{children}
    </button>
  );
}

/** One row in a white list card: leading, title + one-line detail, trailing,
 *  chevron. About 60px tall; rows are divided by thin lines. */
export function KyaRow({ leading, title, detail, trailing, onClick, chevron = true, last }: {
  leading?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  last?: boolean;
}) {
  const inner = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-[700]">{title}</span>
        {detail && <span className="mt-0.5 block truncate text-[13px]" style={{ color: K.quiet }}>{detail}</span>}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
      {chevron && onClick && <ChevronRight className="size-[18px] shrink-0" style={{ color: K.quiet }} aria-hidden="true" />}
    </>
  );
  const cls = "flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left";
  const style = { borderBottom: last ? undefined : `1px solid ${K.line}`, color: K.forest } as CSSProperties;
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} active:bg-black/[0.03]`} style={style}>{inner}</button>
    : <div className={cls} style={style}>{inner}</div>;
}

/** Small rounded tag (Ready, [n] to finish). */
export function KyaTag({ children, tone }: { children: ReactNode; tone: "lime" | "amber" }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-[700]" style={tone === "lime" ? { background: K.lime, color: K.forest } : { background: K.amberBg, color: K.amberText }}>
      {children}
    </span>
  );
}

/** Overlapping round initials (household members, who can see a bird). */
export function KyaAvatarStack({ initials, ring = "#fff" }: { initials: string[]; ring?: string }) {
  return (
    <span className="flex shrink-0 pl-2" aria-hidden="true">
      {initials.map((ch, i) => (
        <span key={i} className="-ml-2 grid size-9 place-items-center rounded-full text-[13px] font-[700] text-white" style={{ background: i === 0 ? K.forest : K.moss, boxShadow: `0 0 0 2px ${ring}` }}>
          {ch}
        </span>
      ))}
    </span>
  );
}
