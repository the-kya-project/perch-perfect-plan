// A read view on the iPhone Duo's two panes (lib/duo.ts): the sections as big
// cards in two columns on the left, the open one in a pop-out card on the right
// with large previous / next buttons. Used by the care plan overview and read
// view, the vet summary, the sitter's care sheet and reference pages, and the
// privacy policy and terms. Nothing here renders on any other screen size.
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DUO, DuoTwoPane, PopOutCard, Tile, TileGrid, type TileTone } from "@/components/duo/DuoBlocks";
import { SERIF } from "@/components/kya";

export type ReaderSection = {
  key: string;
  title: string;
  icon?: ReactNode;
  /** One pill: "Ready" (fine) / "To finish" (attention). */
  status?: { text: string; tone: TileTone };
  /** Up to two lines on the card. */
  preview?: ReactNode;
  /** The full section, in the right half. */
  body: ReactNode;
};

/** 56px round button for previous / next. */
function RoundButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-14 place-items-center rounded-full border-2 active:scale-95 disabled:opacity-35"
      style={{ borderColor: DUO.forest, color: DUO.forest, background: "#fff" }}
    >
      {children}
    </button>
  );
}

export function DuoSectionReader({ title, eyebrow, line, top, sections, selected, onSelect, eyebrowRight, action, secondary, footer, leftExtra }: {
  /** The left pane's heading. */
  title: ReactNode;
  eyebrow?: ReactNode;
  line?: ReactNode;
  /** Above the heading (e.g. RailBack, or a bird photo). */
  top?: ReactNode;
  sections: ReaderSection[];
  selected: string;
  onSelect: (key: string) => void;
  /** The right card's eyebrow (defaults to the left title). */
  eyebrowRight?: ReactNode;
  /** At most one gold main button, at the bottom of the right card. */
  action?: ReactNode;
  /** An outline secondary button beside the main one. */
  secondary?: ReactNode;
  /** A text link under the buttons. */
  footer?: ReactNode;
  /** Under the grid (a note, a text link). */
  leftExtra?: ReactNode;
}) {
  const { t } = useTranslation();
  const index = Math.max(0, sections.findIndex((s) => s.key === selected));
  const open = sections[index];
  const go = (d: number) => {
    const next = sections[index + d];
    if (next) onSelect(next.key);
  };

  const left = (
    <>
      {top}
      {eyebrow && <p className="m-0 text-[13px] font-[700] uppercase tracking-[0.08em]" style={{ color: DUO.quiet }}>{eyebrow}</p>}
      <h1 className="m-0 text-[30px] font-[600] leading-tight" style={{ fontFamily: SERIF }}>{title}</h1>
      {line && <p className="m-0 mt-1.5 text-[16px] leading-[1.45]" style={{ color: DUO.quiet }}>{line}</p>}
      <div className="mt-6">
        <TileGrid>
          {sections.map((s) => (
            <Tile key={s.key} icon={s.icon} title={s.title} preview={s.preview} status={s.status?.text} tone={s.status?.tone} selected={s.key === open?.key} onSelect={() => onSelect(s.key)} />
          ))}
        </TileGrid>
      </div>
      {leftExtra && <div className="mt-5">{leftExtra}</div>}
    </>
  );

  const right = open ? (
    <PopOutCard
      eyebrow={eyebrowRight ?? title}
      title={open.title}
      corner={sections.length > 1 && (
        <>
          <RoundButton label={t("duoReader.previous", "Previous section")} onClick={() => go(-1)} disabled={index === 0}><ChevronLeft className="size-6" /></RoundButton>
          <RoundButton label={t("duoReader.next", "Next section")} onClick={() => go(1)} disabled={index === sections.length - 1}><ChevronRight className="size-6" /></RoundButton>
        </>
      )}
      action={(action || secondary) && <div className="flex flex-col gap-3">{action}{secondary}</div>}
      footer={footer}
    >
      {open.body}
    </PopOutCard>
  ) : null;

  return <DuoTwoPane left={left} right={right} />;
}
