import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { Check, Loader2, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { K, KyaBody, KyaCard, KyaPage } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { CareBadgeTile } from "@/components/CareBadgeParts";
import { useCareFeature } from "@/lib/careFeatures";
import { useCarePlanStatus } from "@/lib/useCarePlanStatus";
import { formatLocalDate } from "@/lib/dates";
import {
  CARE_BADGES, careEarnedCount, careHowToEarn, careLevelLabel, careNextLevel, markCareBadgesSeen, planReadyFor,
  useCareBadges, useInvalidateCareBadges, type CareBadge,
} from "@/lib/careBadges";

// A bird's Badges screen (1.13b): the care set, earned in color and the rest
// in gray. Tapping one shows how to earn it. Opening the screen counts as
// seeing any new badge, so the bird page stops celebrating it. Reached from
// the "Badges" row in the bird's record and the celebrations. While the
// `care_badges` switch is off it sends you back to the bird.
export const Route = createFileRoute("/_authenticated/birds/$birdId/badges")({
  head: () => ({ meta: [{ title: i18next.t("careBadges.metaTitle", "Badges — Kya & Co.") }] }),
  component: BirdBadges,
});

const earnedDay = (at: string) => formatLocalDate(new Date(at), { month: "long", day: "numeric", year: "numeric" });

function BirdBadges() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const toBird = useCallback(() => navigate({ to: "/birds/$birdId", params: { birdId } }), [navigate, birdId]);
  const goBack = useGoBack(toBird);
  const on = useCareFeature("care_badges");
  const planStatus = useCarePlanStatus(birdId);
  const { data: bird } = useQuery({
    queryKey: ["bird-name", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select("name").eq("id", birdId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const { data: badges, isLoading } = useCareBadges(birdId, planReadyFor(planStatus, planStatus.bird?.setup_complete));
  const invalidate = useInvalidateCareBadges();
  const [picked, setPicked] = useState<CareBadge | null>(null);
  const list = badges ?? [];
  const anyUnseen = list.some((b) => b.unseen);
  useEffect(() => {
    if (anyUnseen) void markCareBadgesSeen(birdId).then(invalidate, () => undefined);
  }, [anyUnseen, birdId]); // eslint-disable-line react-hooks/exhaustive-deps
  // Off (or turned off since): nothing to show here.
  useEffect(() => {
    if (on === false || badges === null) void toBird();
  }, [on, badges, toBird]);

  const name = bird?.name ?? t("careBadges.yourBird", "your bird");
  const selected = list.find((b) => b.badge === picked) ?? list.find((b) => b.level === 0) ?? list[0];
  const next = selected ? careNextLevel(selected.badge, selected.level) : null;
  const levelUnit = selected?.badge === "steady_scale"
    ? t("careBadges.nextWeeks", "Next level at {{n}} weeks.", { n: next })
    : t("careBadges.nextDays", "Next level at {{n}} days.", { n: next });

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <PageHeader onBack={goBack} title={t("careBadges.title", "Badges")}
          line={badges ? t("careBadges.count", "{{earned}} of {{total}} earned", { earned: careEarnedCount(list), total: CARE_BADGES.length }) : undefined} />
        <KyaBody className="gap-3">
          {!badges || isLoading ? (
            <div className="grid min-h-[30vh] place-items-center" role="status" aria-label={t("careBadges.loading", "Loading badges")}>
              <Loader2 className="size-8 animate-spin" style={{ color: K.moss }} />
            </div>
          ) : (
            <>
              <span className="px-1 text-[11.5px] font-[700] uppercase tracking-[.06em]" style={{ color: K.moss }}>
                {t("careBadges.careSet", "{{name}}'s care badges", { name })}
              </span>
              <div className="flex flex-wrap gap-x-1 gap-y-1.5" data-testid="care-badges-grid">
                {list.map((b) => (
                  <CareBadgeTile key={b.badge} badge={b.badge} level={b.level} selected={selected?.badge === b.badge} onSelect={() => setPicked(b.badge)} />
                ))}
              </div>
              {selected && (
                <KyaCard className="flex flex-col gap-2 px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5" data-testid="care-badge-how">
                    {selected.level > 0
                      ? <Check className="size-[18px] shrink-0" style={{ color: K.moss }} aria-hidden="true" />
                      : <Lock className="size-[18px] shrink-0" style={{ color: "#4f6b60" }} aria-hidden="true" />}
                    <span className="text-[13px] leading-[1.45]" style={{ color: "#4f6b60" }}>{careHowToEarn(t, selected.badge, name)}</span>
                  </div>
                  {selected.level > 0 && selected.earned_at && (
                    <span className="text-[13px] leading-[1.45]" style={{ color: K.forest }} data-testid="care-badge-earned-on">
                      {careLevelLabel(t, selected.badge, selected.level)
                        ? t("careBadges.earnedOnLevel", "{{level}} reached {{date}}.", { level: careLevelLabel(t, selected.badge, selected.level), date: earnedDay(selected.earned_at) })
                        : t("careBadges.earnedOn", "Earned {{date}}.", { date: earnedDay(selected.earned_at) })}
                      {next != null && <> {levelUnit}</>}
                    </span>
                  )}
                </KyaCard>
              )}
              <p className="m-0 px-2 text-[13px] leading-[1.45]" style={{ color: K.quiet }}>
                {t("careBadges.footer", "Badges reward the care you keep up, never a weight, a trend or a health result.")}
              </p>
            </>
          )}
        </KyaBody>
      </div>
    </KyaPage>
  );
}
