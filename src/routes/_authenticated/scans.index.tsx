import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { fetchBirdList } from "@/lib/birdListSelect";
import { markNotifsSeen } from "@/lib/notificationsFeed";
import { useMyPermissions } from "@/lib/useCapability";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useHealthHistory, thingsToWatch, type CheckEntry, type HistorySit } from "@/lib/healthHistory";
import { daysSince } from "@/lib/homeData";
import { monthDay } from "@/lib/dates";
import { localDateISO } from "@/lib/localDay";
import { rangeTo, sitTitle } from "@/lib/sitText";
import { K, KyaPage, KyaHeader, KyaBody, KyaCard, KyaHeading, KyaPrimaryButton, KyaSecondaryButton, KyaTag } from "@/components/kya";
import { BrandLockup } from "@/components/BrandLogo";
import { OwnerHeaderIcons } from "@/components/OwnerHeader";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { CaregiverAvatar } from "@/components/SitListCards";
import { EntryDays, sitCaregiverName, type EntryContext } from "@/components/HealthEntries";
import { ChevronRight } from "lucide-react";

// The Health tab: a flock summary. Each bird's latest daily check and weight,
// the current (or last) sit, and the five latest entries, with the full list
// one tap away on Health history. Old ?sitId links forward to that page.
export const Route = createFileRoute("/_authenticated/scans/")({
  head: () => ({ meta: [{ title: i18next.t("healthTab.metaTitle", "Flock health — Kya & Co.") }] }),
  validateSearch: (s: Record<string, unknown>) => z.object({ sitId: z.string().uuid().optional() }).parse(s),
  beforeLoad: ({ search }) => {
    if (search.sitId) throw redirect({ to: "/scans/history", search: { sitId: search.sitId } });
  },
  component: HealthTab,
});

const OVERDUE_DAYS = 7;

function HealthTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const myId = useMyPermissions().data?.myId;
  const { data: birdsRaw, isLoading: birdsLoading } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await fetchBirdList();
      if (error) throw error;
      return data ?? [];
    },
  });
  const birds = ((birdsRaw ?? []) as any[]).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const { data: hist, isLoading: histLoading } = useHealthHistory(birds.map((b) => b.id), myId);
  const resolvePhoto = useBirdPhotos(birds.map((b) => b.photo_url), 96);

  // The header bell opens this tab: clear its badge.
  useEffect(() => { markNotifsSeen(); }, []);

  const entries = hist?.entries ?? [];
  const sits = useMemo(() => hist?.sits ?? [], [hist]);
  const names = hist?.names ?? {};
  const ctx: EntryContext = {
    birdName: (id) => birds.find((b) => b.id === id)?.name ?? t("healthTab.yourBird", "Your bird"),
    sits, names, myId,
  };

  // The sit to show: the one running now, else the most recent past one.
  const today = localDateISO();
  const shownSit = useMemo<HistorySit | null>(() => {
    const live = sits.filter((s) => s.start_date <= today && today <= s.end_date);
    if (live.length) return live[0];
    const past = sits.filter((s) => s.end_date < today).sort((a, b) => (a.end_date < b.end_date ? 1 : -1));
    return past[0] ?? null;
  }, [sits, today]);

  const startCheck = () =>
    birds.length === 1 ? navigate({ to: "/check", search: { bird: birds[0].id } }) : navigate({ to: "/check" });

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <KyaHeader>
          <div className="mt-1.5 flex items-center gap-2">
            <BrandLockup orientation="horizontal" variant="ink" size={118} />
            <div className="flex-1" />
            <OwnerHeaderIcons large />
          </div>
          <KyaHeading as="h1" size={31} className="mt-9 text-white">{t("healthTab.title", "Flock health")}</KyaHeading>
          <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>
            {t("healthTab.body", "Daily checks, weights, and anything you noticed, for all your birds.")}
          </p>
        </KyaHeader>

        <KyaBody className="gap-5">
          {birds.length > 0 && <KyaPrimaryButton onClick={startCheck}>{t("healthTab.weighAndCheck", "Weigh & check your flock")}</KyaPrimaryButton>}

          {/* Your birds */}
          <section className="flex flex-col gap-3">
            <KyaHeading>{t("healthTab.yourBirds", "Your birds")}</KyaHeading>
            {birdsLoading ? (
              <p className="m-0 px-1 text-[14px]" style={{ color: K.quiet }}>{t("healthTab.loading", "Loading…")}</p>
            ) : birds.length === 0 ? (
              <KyaCard className="p-5"><p className="m-0 text-[14px]" style={{ color: K.quiet }}>{t("healthTab.noBirds", "Add a bird to start daily checks.")}</p></KyaCard>
            ) : (
              <KyaCard>
                {birds.map((b, i) => {
                  const latest = entries.find((e): e is CheckEntry => e.kind === "check" && e.birdId === b.id);
                  const w = (b.weight_entries ?? [])[0] as { grams: number; measured_at: string } | undefined;
                  const watch = latest && !latest.resolvedAt ? thingsToWatch(latest) : 0;
                  const checkedToday = latest && latest.at && localDateISO(new Date(latest.at)) === today;
                  const status = !latest
                    ? (histLoading ? "" : t("healthTab.notChecked", "Not checked yet"))
                    : checkedToday
                      ? (thingsToWatch(latest) === 0 ? t("healthTab.checkedTodayNormal", "Checked today · All normal") : t("healthTab.checkedToday", "Checked today"))
                      : t("healthTab.checkedOn", "Checked {{date}}", { date: monthDay(localDateISO(new Date(latest.at))) });
                  const notWeighed = w ? daysSince(w.measured_at) : null;
                  const photo = resolvePhoto(b.photo_url);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => navigate({ to: "/birds/$birdId/weight", params: { birdId: b.id } })}
                      className="flex min-h-[68px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-black/[0.03]"
                      style={{ borderBottom: i === birds.length - 1 ? undefined : `1px solid ${K.line}`, color: K.forest }}
                    >
                      <span className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-[14px] text-[18px] font-[700] text-white" style={{ background: K.moss }} aria-hidden="true">
                        {photo ? <BirdPhotoCrop url={photo.url} original={photo.original} position={b.photo_position ?? "50% 20%"} alt="" /> : String(b.name).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-[700]">{b.name}</span>
                        {status && <span className="mt-0.5 block truncate text-[13px]" style={{ color: K.quiet }}>{status}</span>}
                        {notWeighed != null && notWeighed > OVERDUE_DAYS && (
                          <span className="mt-0.5 block truncate text-[13px] font-[700]" style={{ color: K.red }}>
                            {t("healthTab.notWeighedDays", "Not weighed in {{count}} days", { count: notWeighed })}
                          </span>
                        )}
                        {watch > 0 && <span className="mt-1 block"><KyaTag tone="amber">{t("healthTab.thingsToWatch", "{{count}} things to watch", { count: watch })}</KyaTag></span>}
                      </span>
                      {w && <span className="shrink-0 text-[15px] font-[700]">{t("healthHistory.grams", "{{n}} g", { n: Number(w.grams).toLocaleString() })}</span>}
                      <ChevronRight className="size-[18px] shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
                    </button>
                  );
                })}
              </KyaCard>
            )}
          </section>

          {/* During sits — only once there's a sit to show (live or past). */}
          {shownSit && (() => {
            const name = sitCaregiverName(t, shownSit, names);
            const inSit = entries.filter((e) => e.sitId === shownSit.id);
            const checks = inSit.filter((e): e is CheckEntry => e.kind === "check");
            const weights = inSit.length - checks.length;
            const flagged = checks.reduce((n, c) => n + thingsToWatch(c), 0);
            return (
              <section className="flex flex-col gap-3">
                <KyaHeading>{t("healthTab.duringSits", "During sits")}</KyaHeading>
                <KyaCard>
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/scans/history", search: { sitId: shownSit.id } })}
                    className="flex min-h-[68px] w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03]"
                    style={{ color: K.forest }}
                  >
                    <CaregiverAvatar name={name} household={!!shownSit.caregiver_user_id} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-[700]">{sitTitle(t, {}, name)} · {rangeTo(t, shownSit.start_date, shownSit.end_date)}</span>
                      <span className="mt-0.5 block truncate text-[13px]" style={{ color: K.quiet }}>
                        {t("healthTab.nChecks", "{{count}} daily checks", { count: checks.length })} · {t("healthTab.nWeights", "{{count}} weights", { count: weights })}
                      </span>
                      {flagged > 0 && <span className="mt-1 block"><KyaTag tone="amber">{t("healthTab.thingsFlagged", "{{count}} things {{name}} flagged", { count: flagged, name })}</KyaTag></span>}
                    </span>
                    <ChevronRight className="size-[18px] shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
                  </button>
                </KyaCard>
              </section>
            );
          })()}

          {/* Recent */}
          {birds.length > 0 && (
            <section className="flex flex-col gap-3">
              <KyaHeading>{t("healthTab.recent", "Recent")}</KyaHeading>
              {histLoading ? (
                <p className="m-0 px-1 text-[14px]" style={{ color: K.quiet }}>{t("healthTab.loading", "Loading…")}</p>
              ) : entries.length === 0 ? (
                <p className="m-0 px-1 text-[14px]" style={{ color: K.quiet }}>{t("healthTab.nothingYet", "Nothing here yet.")}</p>
              ) : (
                <EntryDays entries={entries.slice(0, 5)} ctx={ctx} />
              )}
              <KyaSecondaryButton className="w-full" onClick={() => navigate({ to: "/scans/history" })}>
                {t("healthTab.seeHistory", "See full health history")}
              </KyaSecondaryButton>
            </section>
          )}

          <p className="m-0 px-1 text-[12.5px] leading-[1.45]" style={{ color: K.quiet }}>
            {t("disclaimer.noteLabel", "Note:")} {t("disclaimer.compactBody", "Not a substitute for veterinary care. Call a vet for any medical concern.")}
          </p>
        </KyaBody>
      </div>
    </KyaPage>
  );
}
