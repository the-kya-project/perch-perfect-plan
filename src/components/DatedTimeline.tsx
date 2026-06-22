import type { ReactNode } from "react";

// Reusable newest-first dated timeline. The weight facet and the journal facet
// both render their history through this so the dated-list UI lives in one
// place. Pass already-built items; the component sorts newest-first, draws the
// left rail + dots, and shows an empty state when there are none.

export type TimelineItem = {
  id: string;
  at: string;            // ISO timestamp/date — used for sort + the date label
  title: ReactNode;      // main line (e.g. "412 g" or a journal title)
  subtitle?: ReactNode;  // secondary line (e.g. "+3 g from previous")
  badge?: ReactNode;     // small marker (e.g. the sitter chip)
  icon?: ReactNode;      // dot contents; defaults to a plain dot
};

function fmt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

export function DatedTimeline({ items, empty }: { items: TimelineItem[]; empty?: ReactNode }) {
  if (items.length === 0) {
    return <>{empty ?? <p className="rounded-[14px] bg-[#efe9da] p-6 text-center text-sm text-[#5f5e5a]">Nothing logged yet.</p>}</>;
  }
  const sorted = [...items].sort((a, b) => +new Date(b.at) - +new Date(a.at));
  return (
    <ol className="relative ml-1 space-y-3 border-l border-[#e3dcc9] pl-4">
      {sorted.map((it) => (
        <li key={it.id} className="relative">
          <span className="absolute -left-[1.30rem] top-1 grid size-5 place-items-center rounded-full bg-[#efe9da] text-[#2d6a4f] ring-2 ring-[#f4f1e8]">
            {it.icon ?? <span className="size-1.5 rounded-full bg-[#2d6a4f]" />}
          </span>
          <div className="flex items-start justify-between gap-3 rounded-[14px] bg-white p-3 ring-1 ring-[#e3dcc9]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[#1a3d2e]">{it.title}</span>
                {it.badge}
              </div>
              {it.subtitle && <div className="mt-0.5 text-xs text-[#8a897f]">{it.subtitle}</div>}
            </div>
            <span className="shrink-0 text-xs text-[#8a897f]">{fmt(it.at)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
