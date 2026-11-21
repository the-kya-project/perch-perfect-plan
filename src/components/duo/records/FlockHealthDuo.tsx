// Flock health on the iPhone Duo (two panes, lib/duo.ts). Left: every bird as
// a photo tile (latest weight, a check pill) and "Weigh & check your flock",
// the screen's one gold button. Right: the picked bird (30-day weight trend,
// recent checks, Full health check / Something's off as outline buttons), or a
// whole page passed in `page` (Health history, one check) inside the card.
//
// Shared by /scans (?bird=), /scans/history and /birds/$birdId/scans/$scanId,
// so picking a tile always swaps the right half instead of leaving the screen.
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Activity, Stethoscope } from "lucide-react";
import { fetchBirdList } from "@/lib/birdListSelect";
import { useMyPermissions, useCapability } from "@/lib/useCapability";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useHealthHistory, thingsToWatch, type CheckEntry, type HistoryEntry } from "@/lib/healthHistory";
import { noticedItems } from "@/lib/dailyCheckLabels";
import { useDailyCheckBirds } from "@/lib/checkBirds";
import { useLoadState } from "@/lib/useTooLong";
import { BIRD_PHOTO_FOCUS } from "@/lib/birdPhotoFocus";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { RailBack } from "@/components/DuoRail";
import { KyaInCard, KyaLink, KyaSecondaryButton } from "@/components/kya";
import { EntryRow, type EntryContext } from "@/components/HealthEntries";
import { LoadError, ListSkeleton } from "@/components/LoadError";
import { DUO, DuoMainButton, DuoTwoPane, PopOutCard, Tile, TileGrid, type TileTone } from "@/components/duo/DuoBlocks";
import { CardInset, EmptyRecordCard } from "@/components/duo/records/RecordList";
import { DuoWeightTrend } from "@/components/duo/records/DuoWeightTrend";

type Bird = { id: string; name: string; photo_url: string | null; photo_position: string | null; weight_entries?: { grams: number; measured_at: string }[] };

/** The tile's pill: all normal (green), not checked (amber), or what was flagged. */
function checkPill(t: TFunction, latest: CheckEntry | undefined): { text: string; tone: TileTone } {
  if (!latest) return { text: t("healthTab.notChecked", "Not checked yet"), tone: "attention" };
  const watch = thingsToWatch(latest);
  if (watch === 0) return { text: t("healthDuo.checkedAllNormal", "Checked · all normal"), tone: "fine" };
  if (latest.resolvedAt) return { text: t("healthDuo.checkedResolved", "Checked · resolved"), tone: "fine" };
  const what = noticedItems(t, latest.reasonCodes);
  return { text: what || t("healthTab.thingsToWatch", "{{count}} things to watch", { count: watch }), tone: "attention" };
}

export function FlockHealthDuo({ selectedBirdId, page, onBack, onPick }: {
  selectedBirdId?: string;
  /** Picking a tile; default: that bird's summary (/scans?bird=). History
   *  passes its bird filter instead, so the tiles filter the list. */
  onPick?: (birdId: string) => void;
  /** A whole page for the right pane (Health history, one check), in place of the bird. */
  page?: { eyebrow?: string; title: string; node: ReactNode };
  /** Back in the side column (history and check pages; the tab itself has none). */
  onBack?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myId = useMyPermissions().data?.myId;
  const birdsQ = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await fetchBirdList();
      if (error) throw error;
      return data ?? [];
    },
  });
  const birdsLoad = useLoadState([birdsQ]);
  const birds = ((birdsQ.data ?? []) as unknown as Bird[]).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const histQ = useHealthHistory(birds.map((b) => b.id), myId);
  const entries: HistoryEntry[] = histQ.data?.entries ?? [];
  const { birds: checkBirds } = useDailyCheckBirds();
  const resolvePhoto = useBirdPhotos(birds.map((b) => b.photo_url), 800);

  const selected = birds.find((b) => b.id === selectedBirdId) ?? (page ? undefined : birds[0]);
  const pick = onPick ?? ((id: string) => void navigate({ to: "/scans", search: { bird: id }, replace: true }));
  const startCheck = () =>
    checkBirds.length === 1 ? navigate({ to: "/check", search: { bird: checkBirds[0].id } }) : navigate({ to: "/check" });

  const left = (
    <>
      {onBack && <RailBack onBack={onBack} />}
      <h1 className="m-0 text-[30px] font-[600] leading-tight" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>{t("healthTab.title", "Flock health")}</h1>
      <p className="m-0 mt-1.5 text-[16px] leading-[1.45]" style={{ color: DUO.quiet }}>{t("healthTab.body", "Daily checks, weights, and anything you noticed, for all your birds.")}</p>
      <div className="mt-6">
        {birdsLoad.failed ? (
          <LoadError onRetry={birdsLoad.retry} />
        ) : birdsLoad.loading ? (
          <ListSkeleton />
        ) : birds.length === 0 ? (
          <p className="m-0 text-[16px]" style={{ color: DUO.quiet }}>{t("healthTab.noBirds", "Add a bird to start daily checks.")}</p>
        ) : (
          <TileGrid label={t("healthTab.yourBirds", "Your birds")}>
            {birds.map((b) => {
              const latest = entries.find((e): e is CheckEntry => e.kind === "check" && e.birdId === b.id);
              const pill = histQ.data ? checkPill(t, latest) : null;
              const w = (b.weight_entries ?? [])[0];
              const photo = resolvePhoto(b.photo_url);
              return (
                <Tile
                  key={b.id}
                  title={b.name}
                  preview={w ? t("healthHistory.grams", "{{n}} g", { n: Number(w.grams).toLocaleString() }) : t("healthDuo.noWeight", "No weight yet")}
                  status={pill?.text}
                  tone={pill?.tone}
                  selected={selected?.id === b.id}
                  onSelect={() => pick(b.id)}
                  media={
                    <span className="relative block h-32 w-full overflow-hidden rounded-[16px]" style={{ background: DUO.bg }} aria-hidden="true">
                      {photo
                        ? <BirdPhotoCrop url={photo.url} original={photo.original} position={b.photo_position || BIRD_PHOTO_FOCUS} alt="" />
                        : <span className="grid size-full place-items-center text-[32px] font-[700]" style={{ color: DUO.forest }}>{String(b.name).slice(0, 1).toUpperCase()}</span>}
                    </span>
                  }
                />
              );
            })}
          </TileGrid>
        )}
      </div>
      {checkBirds.length > 0 && (
        <div className="mt-6">
          <DuoMainButton onClick={() => void startCheck()}>{t("healthTab.weighAndCheck", "Weigh & check your flock")}</DuoMainButton>
        </div>
      )}
      {birds.length > 0 && (
        <div className="mt-2 flex justify-center">
          <KyaLink onClick={() => navigate({ to: "/scans/history", replace: !!page })}>{t("healthTab.seeHistory", "See full health history")}</KyaLink>
        </div>
      )}
      <p className="m-0 mt-auto pt-6 text-[13px] leading-[1.45]" style={{ color: DUO.quiet }}>
        {t("disclaimer.noteLabel", "Note:")} {t("disclaimer.compactBody", "Not a substitute for veterinary care. Call a vet for any medical concern.")}
      </p>
    </>
  );

  const right = page ? (
    <PopOutCard eyebrow={page.eyebrow ?? t("healthTab.title", "Flock health")} title={page.title}>
      <CardInset>
        <KyaInCard.Provider value={true}>{page.node}</KyaInCard.Provider>
      </CardInset>
    </PopOutCard>
  ) : selected ? (
    <BirdHealthCard
      key={selected.id}
      bird={selected}
      photo={resolvePhoto(selected.photo_url)}
      entries={entries.filter((e): e is CheckEntry => e.kind === "check" && e.birdId === selected.id).slice(0, 5)}
      historyLoaded={!!histQ.data}
      ctx={{ birdName: (id) => birds.find((b) => b.id === id)?.name ?? t("healthTab.yourBird", "Your bird"), sits: histQ.data?.sits ?? [], names: histQ.data?.names ?? {}, myId }}
    />
  ) : (
    <EmptyRecordCard
      icon={<Activity />}
      title={birdsLoad.loading ? t("healthTab.loading", "Loading…") : t("healthDuo.emptyTitle", "No birds yet")}
      body={birdsLoad.loading ? undefined : t("healthTab.noBirds", "Add a bird to start daily checks.")}
    />
  );

  return <DuoTwoPane left={left} right={right} leftLabel={t("healthTab.title", "Flock health")} rightLabel={page?.title ?? selected?.name} />;
}

/** One bird's health at a glance, in the right pane. */
function BirdHealthCard({ bird, photo, entries, historyLoaded, ctx }: {
  bird: Bird;
  photo: { url: string; original?: string } | null | undefined;
  entries: CheckEntry[];
  historyLoaded: boolean;
  ctx: EntryContext;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const canHealth = useCapability("record_health", { birdId: bird.id });
  // "Something's off" exists for the caregiver covering an active sit
  // (/birds/$birdId/concern); owners have no such flow, so it isn't offered.
  const caregiverSit = useActiveSitIdForBird(bird.id);
  const w = (bird.weight_entries ?? [])[0];

  return (
    <PopOutCard
      eyebrow={t("healthTab.title", "Flock health")}
      title={bird.name}
      corner={
        <span className="relative block size-16 overflow-hidden rounded-full" style={{ background: DUO.forest }} aria-hidden="true">
          {photo
            ? <BirdPhotoCrop url={photo.url} original={photo.original} position={bird.photo_position || BIRD_PHOTO_FOCUS} alt="" eager />
            : <span className="grid size-full place-items-center text-[22px] font-[700] text-white">{bird.name.slice(0, 1).toUpperCase()}</span>}
        </span>
      }
      action={(canHealth || caregiverSit) ? (
        <div className="flex gap-3">
          {canHealth && (
            <KyaSecondaryButton className="flex-1" icon={<Stethoscope className="size-4" />} onClick={() => navigate({ to: "/birds/$birdId/scan", params: { birdId: bird.id } })}>
              {t("healthDuo.fullCheck", "Full health check")}
            </KyaSecondaryButton>
          )}
          {caregiverSit && (
            <KyaSecondaryButton className="flex-1" onClick={() => navigate({ to: "/birds/$birdId/concern", params: { birdId: bird.id } })}>
              {t("healthDuo.somethingOff", "Something's off")}
            </KyaSecondaryButton>
          )}
        </div>
      ) : undefined}
    >
      <p className="m-0 -mt-2 text-[16px]" style={{ color: DUO.quiet }}>
        {w
          ? t("healthDuo.latestWeight", "Latest weight {{grams}}", { grams: t("healthHistory.grams", "{{n}} g", { n: Number(w.grams).toLocaleString() }) })
          : t("healthDuo.noWeight", "No weight yet")}
      </p>
      <div className="mt-4">
        <DuoWeightTrend birdId={bird.id} />
      </div>

      <h3 className="m-0 mt-6 text-[13px] font-[700] uppercase tracking-[0.06em]" style={{ color: DUO.quiet }}>{t("healthDuo.recentChecks", "Recent checks")}</h3>
      {!historyLoaded ? (
        <p className="m-0 mt-2 text-[15px]" style={{ color: DUO.quiet }}>{t("healthTab.loading", "Loading…")}</p>
      ) : entries.length === 0 ? (
        <p className="m-0 mt-2 text-[15px]" style={{ color: DUO.quiet }}>{t("healthDuo.noChecks", "No checks yet.")}</p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-[20px] border" style={{ borderColor: DUO.line }}>
          {entries.map((e, i) => <EntryRow key={e.id} e={e} ctx={ctx} last={i === entries.length - 1} />)}
        </div>
      )}
      <div className="mt-1">
        <KyaLink onClick={() => navigate({ to: "/scans/history", search: { bird: bird.id } })}>{t("healthDuo.historyFor", "All of {{name}}'s history", { name: bird.name })}</KyaLink>
      </div>
    </PopOutCard>
  );
}
