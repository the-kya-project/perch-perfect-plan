import { FEED_PERIODS, formatAt, type FeedTime } from "@/lib/feedTimes";

// Small pure helpers for the care-plan renderers (CarePlanView, the sitter
// views). Purely presentational: no data fetching, no auth/capability/token
// coupling.

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
