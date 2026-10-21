// The Kya & Co. look outside setup: Home, the bird page and the weight page.
// Same system as the new-bird setup and the daily health check — a forest
// header, a mist body with rounded top corners, white cards, Newsreader
// headings, DM Sans text, sunflower main buttons and moss text links.
import { useEffect, type CSSProperties, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, X } from "lucide-react";

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

/** White secondary button with a 2px forest border, 48px tall. */
export function KyaSecondaryButton({ children, onClick, disabled, icon, className = "" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; icon?: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border-2 bg-white px-4 text-[15px] font-[700] active:scale-[0.99] disabled:opacity-45 ${className}`}
      style={{ borderColor: K.forest, color: K.forest }}
    >
      {icon}{children}
    </button>
  );
}

/** One row in a white list card: leading, title + one-line detail, trailing,
 *  chevron. About 60px tall; rows are divided by thin lines. */
export function KyaRow({ leading, title, detail, trailing, onClick, chevron = true, last, wrap }: {
  leading?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  last?: boolean;
  /** Let the title and detail wrap instead of truncating. */
  wrap?: boolean;
}) {
  const inner = (
    <>
      {leading && <span className="shrink-0">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-[700] ${wrap ? "" : "truncate"}`}>{title}</span>
        {detail && <span className={`mt-0.5 block text-[13px] ${wrap ? "" : "truncate"}`} style={{ color: K.quiet }}>{detail}</span>}
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

/** Forest tile with a light icon, the bird page's row icon style. */
export function KyaIconTile({ children, size = 40, tone = "forest" }: { children: ReactNode; size?: number; tone?: "forest" | "amber" | "mist" | "lime" }) {
  const c = tone === "amber" ? { background: K.amberBg, color: K.amberText }
    : tone === "mist" ? { background: K.mist, color: K.forest }
    : tone === "lime" ? { background: K.forest, color: K.lime }
    : { background: K.forest, color: K.lime };
  return <span className="grid shrink-0 place-items-center rounded-[12px]" style={{ width: size, height: size, ...c }} aria-hidden="true">{children}</span>;
}

/** 13px bold muted group label ("New", "Quick answers"). Sentence case. */
export function KyaGroupLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`m-0 px-1 text-[13px] font-[700] ${className}`} style={{ color: K.quiet }}>{children}</p>;
}

/** On/off switch, on = forest. At least 44px tall to tap. */
export function KyaSwitch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-[44px] shrink-0 items-center disabled:opacity-45"
    >
      <span className="relative inline-block h-[30px] w-[50px] rounded-full transition-colors" style={{ background: checked ? K.forest : "#cfd8cf" }}>
        <span className="absolute top-[3px] size-6 rounded-full bg-white shadow transition-[left]" style={{ left: checked ? 23 : 3 }} />
      </span>
    </button>
  );
}

/** 13.5px bold label above a 48px white pill field with a 1.5px border. */
export function KyaField({ label, tag, hint, id, ...input }: { label: ReactNode; tag?: ReactNode; hint?: ReactNode; id: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-[13.5px] font-[700]" style={{ color: K.forest }}>{label}{tag}</label>
      <input
        id={id}
        {...input}
        className={`min-h-[48px] w-full rounded-full border-[1.5px] bg-white px-4 text-[16px] outline-none focus:border-[#2d6a4f] ${input.className ?? ""}`}
        style={{ borderColor: "#d5dfd5", color: K.forest, ...(input.style ?? {}) }}
      />
      {hint && <p className="m-0 px-1 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>{hint}</p>}
    </div>
  );
}

/** Small tag after a field label. Amber flags something missing; forest
 *  marks a required field ("Required"). */
export function KyaRequiredTag({ children, tone = "amber" }: { children: ReactNode; tone?: "amber" | "forest" }) {
  const c = tone === "forest" ? { background: K.forest, color: "#fff" } : { background: K.amberBg, color: K.amberText };
  return <span className="rounded-full px-2 py-[1px] text-[11.5px] font-[700]" style={c}>{children}</span>;
}

/** Field label: 13.5px bold, sentence case, above the field. A required
 *  field gets a small forest "Required" tag after the label. */
export function KyaLabel({ children, htmlFor, required, requiredLabel = "Required", as: Tag = "label" }: {
  children: ReactNode; htmlFor?: string; required?: boolean; requiredLabel?: string; as?: "label" | "span";
}) {
  return (
    <Tag htmlFor={Tag === "label" ? htmlFor : undefined} className="flex flex-wrap items-center gap-2 text-[13.5px] font-[700]" style={{ color: K.forest }}>
      {children}
      {required && <KyaRequiredTag tone="forest">{requiredLabel}</KyaRequiredTag>}
    </Tag>
  );
}

/** Bottom sheet: white, 26px top corners, grab handle, 44px round Close top
 *  right, dark overlay. `footer` is pinned under the scrolling content. */
export function KyaSheet({ open = true, onClose, title, closeLabel, children, footer }: {
  open?: boolean;
  onClose: () => void;
  title?: ReactNode;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="setup-frame fixed inset-0 z-[70] flex items-end justify-center">
      <button type="button" aria-label={closeLabel} tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div role="dialog" aria-modal="true" className="relative flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-[26px] bg-white [max-height:90dvh]" style={{ color: K.forest }}>
        <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2.5 ${footer ? "pb-5" : "pb-[max(env(safe-area-inset-bottom),24px)]"}`}>
          <div className="mx-auto h-1 w-10 rounded-full bg-[#d5dfd5]" />
          <div className="mt-2 flex items-start gap-3">
            <div className="min-w-0 flex-1 pt-2">{title}</div>
            <button type="button" aria-label={closeLabel} onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full active:scale-95" style={{ background: K.mist, color: K.forest }}>
              <X className="size-5" />
            </button>
          </div>
          <div className="mt-3">{children}</div>
        </div>
        {footer && <div className="shrink-0 border-t bg-white px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-3" style={{ borderColor: K.line }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Forest header top row with a 44px back button and an optional right slot. */
export function KyaBackRow({ label, onBack, right }: { label: string; onBack: () => void; right?: ReactNode }) {
  return (
    <div className="mt-1.5 flex items-center justify-between gap-3">
      <KyaIconButton label={label} onClick={onBack}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg></KyaIconButton>
      {right}
    </div>
  );
}

/** Title + line in the forest header. */
export function KyaTitle({ title, line, size = 30 }: { title: ReactNode; line?: ReactNode; size?: number }) {
  return (
    <>
      <KyaHeading as="h1" size={size} className="mt-5 text-white">{title}</KyaHeading>
      {line && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
    </>
  );
}
