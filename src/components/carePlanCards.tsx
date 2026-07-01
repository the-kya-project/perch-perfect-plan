import { ClipPlayer } from "@/components/ClipPlayer";
import { IconTile } from "@/components/system";
import { FEED_PERIODS, formatAt, type FeedTime } from "@/lib/feedTimes";
import { AlertTriangle, AlertOctagon } from "lucide-react";

// Shared presentational primitives for the care-plan card hierarchy. THE single
// source of the card design (icon + teal eyebrow header, feeding figures, timing
// pills, key-value rows, iconed callouts, muted field labels). Both renderers —
// the authenticated CarePlanView (owner / household read view) and the sitter
// CareSheetView (token care-sheet) — build their sections from these, so the two
// surfaces can't drift apart visually again. Purely presentational: no data
// fetching, no auth/capability/token coupling.

export function has(v: any): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

// Join distinct, non-empty parts with newlines — drops blanks and case-
// insensitive duplicates so a field never prints the same value twice.
export function joinUnique(parts: (string | null | undefined | false)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = (p ?? "").toString().trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out.join("\n");
}

// A food's feeding period as a compact pill label. Built from FEED_PERIODS (not
// feedTimeLabel, which joins with an em dash) so labels stay em-dash-free.
export function mealPillLabel(ft: FeedTime): string {
  const def = FEED_PERIODS.find((p) => p.value === ft.period);
  const base = def?.meal ?? "Feeding";
  const at = formatAt(ft.at);
  return at ? `${base} · ${at}` : base;
}

// Muted micro-label for leaf fields (tier 2). Teal eyebrows (tier 1) mark
// structure — section headers and routine dayparts — so the two never blur.
export const FIELD_LABEL = "text-[10.5px] font-medium uppercase tracking-[0.09em] text-[var(--mute)]";

// Section card shell: moss/teal (or red-danger) icon + teal eyebrow + title.
// `id`/`coach`/`setRef` are optional — CarePlanView uses them for scroll-spy and
// deep-link anchors; the sitter care-sheet omits them.
export function SectionCard({
  id, coach, setRef, icon, eyebrow, title, tone = "ink", children,
}: {
  id?: string;
  coach?: string;
  setRef?: (el: HTMLElement | null) => void;
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  tone?: "ink" | "red";
  children: React.ReactNode;
}) {
  const danger = tone === "red";
  return (
    <section
      id={id}
      data-coach={coach}
      ref={setRef}
      className="scroll-mt-2 overflow-hidden rounded-[18px] bg-white p-4 ring-1 ring-[var(--line2)]"
      style={{ boxShadow: "0 1px 0 rgba(40,50,40,.02), 0 6px 14px -8px rgba(40,50,40,.08)" }}
    >
      <div className="flex items-center gap-3">
        <IconTile size={38} tone={danger ? "red" : "pale"} icon={icon} />
        <div className="min-w-0">
          <p className={`t-eyebrow ${danger ? "text-[var(--red-deep)]" : "text-[var(--teal-on-cream)]"}`}>{eyebrow}</p>
          <h2 className="t-section leading-tight">{title}</h2>
        </div>
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!has(children as any)) return null;
  return (
    <div>
      <p className={FIELD_LABEL}>{label}</p>
      <div className="mt-1 text-sm text-[var(--ink)] whitespace-pre-line">{children}</div>
    </div>
  );
}

// Scannable label:value rows — muted label left, emphasized value right, hairline
// dividers between. Empty-value rows are dropped (no placeholder dashes).
export function KVList({ rows }: { rows: { label: string; value: React.ReactNode }[] }) {
  const shown = rows.filter((r) => has(r.value as any));
  if (!shown.length) return null;
  return (
    <div className="rounded-[12px] bg-[var(--cream)] px-3">
      {shown.map((r, i) => (
        <div key={r.label} className={`flex items-baseline justify-between gap-4 py-2 ${i > 0 ? "border-t border-[var(--line)]" : ""}`}>
          <span className="shrink-0 text-[13px] text-[var(--mute)]">{r.label}</span>
          <span className="min-w-0 text-right text-sm font-medium text-[var(--ink)] whitespace-pre-line">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// A single prominent figure with a muted caption (e.g. normal weight).
export function Metric({ value, caption }: { value: React.ReactNode; caption: string }) {
  return (
    <div className="rounded-[12px] bg-[var(--cream)] p-3">
      <p className="text-[26px] font-medium leading-none text-[var(--moss)]">{value}</p>
      <p className={`mt-1.5 ${FIELD_LABEL}`}>{caption}</p>
    </div>
  );
}

// Timing / attribute pill (moss on pale) — matches Chips.
export function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-[var(--pale)] px-2.5 py-0.5 text-xs font-medium text-[var(--moss)]">{children}</span>;
}

// One food: name left, amount as a moss figure right, feeding times as pills.
export function FeedingItem({
  typeLabel, name, amountStr, times, freeFed, note,
}: {
  typeLabel: string;
  name: string;
  amountStr: string;
  times: FeedTime[];
  freeFed: boolean;
  note: string;
}) {
  return (
    <div className="rounded-[12px] bg-[var(--cream)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--ink)]">{name || typeLabel}</p>
          {name && <p className="mt-0.5 text-[11px] text-[var(--mute)]">{typeLabel}</p>}
        </div>
        {amountStr && <p className="shrink-0 text-[19px] font-medium leading-none text-[var(--moss)]">{amountStr}</p>}
      </div>
      {(times.length > 0 || freeFed) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {times.map((ft, i) => <Pill key={i}>{mealPillLabel(ft)}</Pill>)}
          {freeFed && <Pill>Free-fed</Pill>}
        </div>
      )}
      {note && <p className="mt-2 text-[13px] text-[var(--mute)] whitespace-pre-line">{note}</p>}
    </div>
  );
}

// Amber callout — soft hard-rules / warnings (no new foods, fears, when-to-call).
// Always leads with a warning icon so it reads as a warning at a glance.
export function Callout({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] bg-[var(--amber-fill)] p-3 text-[var(--amber-ink)]">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          {label && <p className="t-eyebrow">{label}</p>}
          <div className={`text-sm whitespace-pre-line ${label ? "mt-1" : ""}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// Red callout — true danger (toxic foods, hazards, bite risk). Leads with a
// danger icon and carries a distinct card identity (red fill + ring).
export function DangerCallout({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] bg-[var(--red-fill)] p-3 text-[var(--red-deep)] ring-1 ring-[var(--red-deep)]/15">
      <p className="t-eyebrow flex items-center gap-1.5">{icon ?? <AlertOctagon className="size-3.5" />}{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={key} className="list-disc space-y-1 pl-5 marker:text-[var(--mute)]">
        {bullets.map((b, i) => <li key={i} className="pl-0.5">{b}</li>)}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((raw, i) => {
    const m = raw.match(/^\s*•\s+(.*)$/);
    if (m) { bullets.push(m[1]); return; }
    flush(`ul-${i}`);
    if (raw.trim()) blocks.push(<p key={i}>{raw}</p>);
  });
  flush("ul-end");
  return <div className="space-y-1.5">{blocks}</div>;
}

export function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => <span key={s} className="rounded-full bg-[var(--pale)] px-2.5 py-0.5 text-xs font-medium text-[var(--moss)]">{s}</span>)}
    </div>
  );
}

export function DangerChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => <span key={s} className="rounded-full bg-[var(--red-deep)] px-2.5 py-1 text-xs font-medium text-white">{s}</span>)}
    </div>
  );
}

// Step-up outcome pill + the owner's exact qualifier verbatim.
export function StepUpField({ stepUp, notes }: { stepUp?: string | null; notes?: string | null }) {
  const raw = (stepUp ?? "").trim().toLowerCase();
  const qualifier = (notes ?? "").trim();
  const base = raw === "yes" ? "Yes" : raw === "no" ? "No" : raw === "sometimes" ? "Sometimes" : null;
  if (!base && !qualifier) return null;
  const label = base ? (qualifier ? `${base}, with caveats` : base) : null;
  const cautionary = !base || raw === "no" || !!qualifier;
  return (
    <div>
      <p className={FIELD_LABEL}>Step up</p>
      {label && (
        <span className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-medium ${cautionary ? "bg-[var(--amber-fill)] text-[var(--amber-ink)]" : "bg-[var(--pale)] text-[var(--moss)]"}`}>{label}</span>
      )}
      {qualifier && <p className="mt-1.5 text-sm text-[var(--ink)] whitespace-pre-line">{qualifier}</p>}
    </div>
  );
}

// Contextual "show me" clip placed inside its section.
export function ClipField({ clip }: { clip: { key: string; label: string; url: string } | null }) {
  if (!clip) return null;
  return (
    <div>
      <p className={FIELD_LABEL}>Show me</p>
      <div className="mt-1 overflow-hidden rounded-[12px] bg-[var(--cream)] ring-1 ring-[var(--line2)]">
        <ClipPlayer src={clip.url} label={clip.label} className="aspect-video" />
        <p className="px-2 py-1.5 text-[12px] font-medium leading-tight text-[var(--ink)]">{clip.label}</p>
      </div>
    </div>
  );
}
