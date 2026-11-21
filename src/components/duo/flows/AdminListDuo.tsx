// An admin list on the iPhone Duo (two panes): the summary and the records as
// tiles on the left, the selected record's details in a pop-out card on the
// right. Used by /admin/founding and /admin/gifts. Internal tool, so English
// only, like the pages themselves. No record has actions of its own today, so
// the card has no main button; Download CSV stays an outline button.
import { useState, type ReactNode } from "react";
import { Download, Loader2 } from "lucide-react";
import { K, KyaSecondaryButton } from "@/components/kya";
import { RailBack } from "@/components/DuoRail";
import { DUO, DuoTwoPane, PopOutCard, Tile, TileGrid, type TileTone } from "@/components/duo/DuoBlocks";
import { FlowFacts, FlowHeading } from "@/components/duo/flows/FlowParts";

export type AdminItem = {
  key: string;
  /** Short text in the tile's square (a spot number, a date). */
  badge: string;
  title: string;
  preview?: string;
  status?: string;
  tone?: TileTone;
  /** The card: eyebrow, title and label/value rows. */
  eyebrow?: string;
  detailTitle: string;
  rows: [string, ReactNode | null | undefined][];
};

export function AdminListDuo({ title, line, summary, items, loading, error, emptyText, onCsv, onBack }: {
  title: string;
  line: string;
  summary?: ReactNode;
  items: AdminItem[];
  loading: boolean;
  error: string | null;
  emptyText: string;
  onCsv: () => void;
  onBack: () => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const current = items.find((i) => i.key === picked) ?? items[0] ?? null;

  const left = (
    <>
      <RailBack onBack={onBack} />
      <FlowHeading title={title} line={line} />
      {error ? (
        <p role="alert" className="m-0 mt-6 rounded-[16px] border-[1.5px] bg-white px-4 py-3 text-[15px]" style={{ borderColor: K.red, color: K.red }}>{error}</p>
      ) : loading ? (
        <div className="grid place-items-center py-10" role="status" aria-label="Loading">
          <Loader2 className="size-7 animate-spin" style={{ color: K.moss }} />
        </div>
      ) : (
        <>
          {summary && <div className="mt-6 flex flex-col gap-3">{summary}</div>}
          <div className="mt-4">
            <KyaSecondaryButton className="w-full" onClick={onCsv} disabled={items.length === 0} icon={<Download className="size-4" />}>Download CSV</KyaSecondaryButton>
          </div>
          <div className="mt-6">
            {items.length === 0 ? (
              <p className="m-0 text-[15px]" style={{ color: DUO.quiet }}>{emptyText}</p>
            ) : (
              <TileGrid label={title}>
                {items.map((i) => (
                  <Tile
                    key={i.key}
                    media={<span aria-hidden="true" className="grid h-11 min-w-11 place-items-center rounded-[14px] px-2 text-[14px] font-[700]" style={current?.key === i.key ? { background: "rgba(255,255,255,0.14)", color: "#fff" } : { background: DUO.bg, color: DUO.forest }}>{i.badge}</span>}
                    title={i.title}
                    preview={i.preview}
                    status={i.status}
                    tone={i.tone ?? "neutral"}
                    selected={current?.key === i.key}
                    onSelect={() => setPicked(i.key)}
                  />
                ))}
              </TileGrid>
            )}
          </div>
        </>
      )}
    </>
  );

  const right = current ? (
    <PopOutCard eyebrow={current.eyebrow} title={current.detailTitle}>
      <FlowFacts rows={current.rows} />
    </PopOutCard>
  ) : (
    <PopOutCard title={title}>
      <p className="m-0 text-[16px]" style={{ color: DUO.quiet }}>{loading ? "Loading…" : emptyText}</p>
    </PopOutCard>
  );

  return <DuoTwoPane leftLabel={title} rightLabel={current?.detailTitle ?? title} left={left} right={right} />;
}

/** A compact totals card for the left pane. */
export function AdminTotals({ title, rows, emptyText }: { title: string; rows: [string, string][]; emptyText: string }) {
  return (
    <section className="rounded-[20px] border bg-white p-4" style={{ borderColor: DUO.line }}>
      <h2 className="m-0 text-[17px] font-[700]" style={{ color: DUO.forest }}>{title}</h2>
      {rows.length === 0 ? (
        <p className="m-0 mt-2 text-[15px]" style={{ color: DUO.quiet }}>{emptyText}</p>
      ) : (
        <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
          {rows.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-3 text-[15px]" style={{ color: K.ink }}>
              <span className="min-w-0 truncate">{k}</span><span className="whitespace-nowrap font-[700]">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
