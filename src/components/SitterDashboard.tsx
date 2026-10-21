import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { getSitterDashboard } from "@/lib/sitter.functions";
import { localDateISO } from "@/lib/localDay";
import { speciesLabel } from "@/lib/speciesLabel";
import { K, KyaBody, KyaHeading, KyaTag } from "@/components/kya";
import { SitterTabHeader } from "@/components/sitter/SitterChrome";
import {
  AroundHouseCard, BirdAvatar, VetNote, WalkthroughPill,
  greeting, sitLine, sitterFirstName,
} from "@/components/sitter/sitterShared";
import { useSitterContext } from "@/routes/sitter/$token/route";

// Sitter Home tab (sits with 2+ birds): the greeting and sit line, then one
// white card per bird with today's task progress and daily-check status, then
// "Around the house". Tapping a bird opens Today on that bird. Same underlying
// data as each bird's Today, so statuses always agree.

/** Today's per-bird status, shared by Home and Today's bird chips. */
export function useSitterDashboard(token: string) {
  const fn = useServerFn(getSitterDashboard);
  return useQuery({
    queryKey: ["sitter-dashboard", token],
    queryFn: () => fn({ data: { token, today: localDateISO() } }),
  });
}

export function SitterDashboard({ token }: { token: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: ctx } = useSitterContext(token);
  const { data, isLoading } = useSitterDashboard(token);
  const birds = (data?.birds ?? []) as any[];
  const checksDone = birds.filter((b) => b.scanDone).length;

  return (
    <>
      <SitterTabHeader token={token} title={greeting(t, sitterFirstName(ctx))} line={sitLine(ctx, t, i18n.language)}>
        <WalkthroughPill />
      </SitterTabHeader>

      <KyaBody>
        <section data-coach="home-overview" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 px-1">
            <KyaHeading size={21}>{t("sitterDashboard.birdsInYourCare", "Birds in your care")}</KyaHeading>
            {!isLoading && birds.length > 0 && (
              <span className="shrink-0 text-[13px]" style={{ color: K.quiet }}>
                {t("sitterDashboard.checksDone", "{{done}} of {{total}} checks done", { done: checksDone, total: birds.length })}
              </span>
            )}
          </div>
          {isLoading ? (
            <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-busy="true">
              {(ctx.birds ?? []).map((b: any) => (
                <li key={b.id} className="h-[104px] animate-pulse rounded-[20px] bg-white" />
              ))}
            </ul>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {birds.map((b, i) => (
                <li key={b.id}>
                  <HomeBirdCard
                    bird={b}
                    coach={i === 0 ? "bird-card" : undefined}
                    onClick={() => navigate({ to: "/sitter/$token", params: { token }, search: { birdId: b.id } })}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <AroundHouseCard ctx={ctx} token={token} />

        <VetNote />
      </KyaBody>
    </>
  );
}

/** One bird on Home: 64px photo, name + species, progress bar, task count and
 *  the daily-check tag. */
function HomeBirdCard({ bird, onClick, coach }: { bird: any; onClick: () => void; coach?: string }) {
  const { t } = useTranslation();
  const total = bird.tasksTotal ?? 0;
  const done = bird.tasksDone ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      data-coach={coach}
      className="flex w-full items-center gap-3 rounded-[20px] bg-white p-3.5 text-left active:bg-black/[0.03]"
      style={{ color: K.forest }}
    >
      <BirdAvatar bird={bird} size={64} radius={16} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="truncate text-[16px] font-[700]">{bird.name}</span>
          {bird.species && <span className="truncate text-[13px]" style={{ color: K.quiet }}>{speciesLabel(t, bird.species)}</span>}
        </span>
        <span className="mt-2 block h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#e3ebe2" }} aria-hidden="true">
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: K.forest }} />
        </span>
        <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px]" style={{ color: K.quiet }}>
            {total === 0
              ? t("birdCareCard.noRoutineTasks", "No routine tasks")
              : t("sitterDashboard.tasksDone", "{{done}} of {{total}} tasks", { done, total })}
          </span>
          {bird.scanDone
            ? <KyaTag tone="lime">{t("sitterDashboard.checked", "Checked ✓")}</KyaTag>
            : <KyaTag tone="amber">{t("sitterDashboard.checkToDo", "Daily check to do")}</KyaTag>}
        </span>
      </span>
      <ChevronRight className="size-[18px] shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
    </button>
  );
}
