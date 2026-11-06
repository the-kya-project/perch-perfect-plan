import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { speciesLabel } from "@/lib/speciesLabel";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPastBirds } from "@/lib/handoff.functions";
import { Feather, Loader2 } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaIconTile, KyaTag, KyaSecondaryButton } from "@/components/kya";
import { PageHeader } from "@/components/headers";
import { LoadError } from "@/components/LoadError";
import { useLoadState } from "@/lib/useTooLong";
import { formatLocalDate } from "@/lib/dates";
import { parseCalendarDate } from "@/lib/localDay";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { BIRD_PHOTO_FOCUS } from "@/lib/birdPhotoFocus";
import { useState } from "react";
import { useDuoMode } from "@/lib/duo";
import { RailBack } from "@/components/DuoRail";
import { DuoMainButton, DuoTwoPane, PopOutCard } from "@/components/duo/DuoBlocks";
import { EmptyRecordCard, RecordCard, RecordCards, RecordListHeader } from "@/components/duo/records/RecordList";

// Past birds archive — read-only, sender-side memory of birds handed off.
// Snapshots only (not linked to live records). Newest departures first.
export const Route = createFileRoute("/_authenticated/past-birds")({
  head: () => ({ meta: [{ title: i18next.t("pastBirds.metaTitleRehome", "Birds you've helped rehome — Kya & Co.") }] }),
  component: PastBirdsRoute,
});

/** iPhone Duo sideways: past birds on the left, the picked keepsake on the
 *  right. Everywhere else, unchanged. */
function PastBirdsRoute() {
  if (useDuoMode() === "sideways") return <PastBirdsDuo />;
  return <PastBirds />;
}

function PastBirdsDuo() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/account" }));
  const getBirds = useServerFn(getPastBirds);
  const pastQ = useQuery({ queryKey: ["past-birds"], queryFn: () => getBirds() });
  const load = useLoadState([pastQ]);
  const birds = (pastQ.data?.birds ?? []) as any[];
  const [pickId, setPickId] = useState<string | null>(null);
  const current = birds.find((b) => b.id === pickId) ?? birds[0] ?? null;
  const title = t("pastBirds.title", "Birds you've helped rehome");

  const left = (
    <>
      <RailBack onBack={goBack} />
      <RecordListHeader title={title} />
      <div className="mt-5 flex flex-col gap-3">
        {load.failed ? (
          <LoadError onRetry={load.retry} />
        ) : load.loading ? (
          <div className="flex items-center gap-2 py-6 text-[15px]" style={{ color: K.quiet }}>
            <Loader2 className="size-4 animate-spin" /> {t("pastBirds.loading", "Loading…")}
          </div>
        ) : birds.length === 0 ? (
          <p className="m-0 text-[16px] leading-[1.5]" style={{ color: K.ink }}>{t("pastBirds.empty", "No past birds yet. When you hand off a bird, a memory of them will live here.")}</p>
        ) : (
          <>
            <RecordCards label={title}>
              {birds.map((b) => (
                <RecordCard
                  key={b.id}
                  media={b.photo_thumb
                    ? <img src={b.photo_thumb} alt="" className="size-12 shrink-0 rounded-full object-cover" style={{ objectPosition: b.photo_position || BIRD_PHOTO_FOCUS }} />
                    : <KyaIconTile tone="mist" size={48}><Feather className="size-5" /></KyaIconTile>}
                  title={b.bird_name}
                  date={fmt(b.departed_on)}
                  tag={b.was_foster ? t("pastBirds.foster", "Foster") : undefined}
                  tagTone="fine"
                  preview={b.species ? speciesLabel(t, b.species) : undefined}
                  selected={current?.id === b.id}
                  onSelect={() => setPickId(b.id)}
                />
              ))}
            </RecordCards>
            <p className="m-0 px-1 pt-1 text-[14px] leading-[1.5]" style={{ color: K.quiet }}>
              {t("pastBirds.footer", "Their full records went with them. These are your keepsakes: who they were and where they went.")}
            </p>
          </>
        )}
      </div>
    </>
  );

  const right = current ? (
    <PopOutCard eyebrow={current.was_foster ? t("pastBirds.foster", "Foster") : undefined} title={current.bird_name}>
      {current.photo_thumb && (
        <span className="relative mb-4 block h-[260px] w-full overflow-hidden rounded-[20px]" style={{ background: K.mist }}>
          <img src={current.photo_thumb} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: current.photo_position || BIRD_PHOTO_FOCUS }} />
        </span>
      )}
      {current.species && <p className="m-0 text-[16px] font-[700]">{speciesLabel(t, current.species)}</p>}
      <div className="mt-2 flex flex-col gap-1 text-[16px] leading-[1.5]" style={{ color: K.quiet }}>
        <p className="m-0">{withYouLabel(current.intake_date, current.departed_on)}</p>
        <p className="m-0">{whereLabel(current)}</p>
      </div>
    </PopOutCard>
  ) : (
    <EmptyRecordCard
      icon={<Feather />}
      title={load.loading ? t("pastBirds.loading", "Loading…") : t("pastBirdsDuo.emptyTitle", "No past birds yet")}
      body={load.loading ? undefined : t("pastBirds.empty", "No past birds yet. When you hand off a bird, a memory of them will live here.")}
    >
      {!load.loading && <DuoMainButton onClick={() => navigate({ to: "/dashboard" })}>{t("pastBirds.backToFlock", "Back to your flock")}</DuoMainButton>}
    </EmptyRecordCard>
  );

  return <DuoTwoPane left={left} right={right} leftLabel={title} rightLabel={current?.bird_name} />;
}

function PastBirds() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/account" }));

  const getBirds = useServerFn(getPastBirds);
  const pastQ = useQuery({ queryKey: ["past-birds"], queryFn: () => getBirds() });
  const { data } = pastQ;
  const load = useLoadState([pastQ]);
  const birds = data?.birds ?? [];

  return (
    <KyaPage>
      <PageHeader title={t("pastBirds.title", "Birds you've helped rehome")} onBack={goBack} />

      <KyaBody>
        {load.failed ? (
          <LoadError onRetry={load.retry} />
        ) : load.loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[14px]" style={{ color: K.quiet }}>
            <Loader2 className="size-4 animate-spin" /> {t("pastBirds.loading", "Loading…")}
          </div>
        ) : birds.length === 0 ? (
          <KyaCard className="flex flex-col items-center p-8 text-center">
            <KyaIconTile tone="mist"><Feather className="size-5" /></KyaIconTile>
            <p className="m-0 mt-3 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("pastBirds.empty", "No past birds yet. When you hand off a bird, a memory of them will live here.")}</p>
            <div className="mt-4">
              <KyaSecondaryButton onClick={() => navigate({ to: "/dashboard" })}>{t("pastBirds.backToFlock", "Back to your flock")}</KyaSecondaryButton>
            </div>
          </KyaCard>
        ) : (
          <>
            <KyaCard>
              {birds.map((b: any, i: number) => (
                <PastBirdCard key={b.id} bird={b} last={i === birds.length - 1} />
              ))}
            </KyaCard>
            <p className="m-0 px-1 pt-1 text-center text-[13.5px] leading-[1.5]" style={{ color: K.quiet }}>
              {t("pastBirds.footer", "Their full records went with them. These are your keepsakes: who they were and where they went.")}
            </p>
          </>
        )}
      </KyaBody>
    </KyaPage>
  );
}

// Static keepsake card — everything shows on the card itself (no tap target, no
// detail view). Text wraps freely so the dates and destination are never clipped.
function PastBirdCard({ bird: b, last }: { bird: any; last: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-3.5" style={{ borderBottom: last ? undefined : `1px solid ${K.line}` }}>
      <div className="flex items-start gap-3">
        {b.photo_thumb ? (
          <img src={b.photo_thumb} alt="" className="size-10 shrink-0 rounded-full object-cover" style={{ objectPosition: b.photo_position ?? BIRD_PHOTO_FOCUS }} />
        ) : (
          <KyaIconTile tone="mist"><Feather className="size-5" /></KyaIconTile>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-[700]">{b.bird_name}</span>
            {b.was_foster && <KyaTag tone="lime">{t("pastBirds.foster", "Foster")}</KyaTag>}
          </div>
          {b.species && <p className="m-0 mt-0.5 text-[13px]" style={{ color: K.quiet }}>{speciesLabel(t, b.species)}</p>}
          <div className="mt-2 space-y-0.5 text-[13px] leading-[1.5]" style={{ color: K.quiet }}>
            <p className="m-0">{withYouLabel(b.intake_date, b.departed_on)}</p>
            <p className="m-0">{whereLabel(b)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Where they went — from the sender's own handoff record (they entered the
// recipient's name), so it's safe to show back to them.
function whereLabel(b: any): string {
  const date = fmt(b.departed_on);
  if (b.recipient_name) return i18next.t("pastBirds.foundHomeWith", "Found a home with {{name}} on {{date}}", { name: b.recipient_name, date });
  if (b.mode === "pdf") return i18next.t("pastBirds.leftAsPdf", "Left as a PDF handoff on {{date}}", { date });
  return i18next.t("pastBirds.foundNewHome", "Found a new home on {{date}}", { date });
}
function withYouLabel(intake: string | null, departed: string): string {
  return intake
    ? i18next.t("pastBirds.withYouFromTo", "With you from {{from}} to {{to}}", { from: fmt(intake), to: fmt(departed) })
    : i18next.t("pastBirds.withYouUntil", "With you until {{date}}", { date: fmt(departed) });
}
// intake_date / departed_on are date-only: read them as local calendar days.
function fmt(iso: string): string {
  const d = parseCalendarDate(iso);
  return d ? formatLocalDate(d, { year: "numeric", month: "short", day: "numeric" }) : "";
}
