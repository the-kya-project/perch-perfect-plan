import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { BadgeTile } from "@/components/flock/BadgeParts";
import { formatFlockDay } from "@/lib/flockDates";
import {
  FLOCK_BADGES, earnedCount, howToEarn, levelLabel, markBadgesSeen, nextLevel, useInvalidateBadges, useMyBadges, type FlockBadge,
} from "@/lib/flockBadges";

// Badges (1.13a): the Flock set, earned in color and the rest in gray. Tapping
// one shows how to earn it. Opening the screen counts as seeing any new
// badge, so Today stops celebrating it. Care badges join this screen with
// 1.13b. Reached from Flock settings and the celebrations.
export const Route = createFileRoute("/_authenticated/flock/you/badges")({
  component: FlockBadges,
});

function FlockBadges() {
  const { t } = useTranslation();
  const { data: badges, isLoading } = useMyBadges();
  const invalidate = useInvalidateBadges();
  const list = badges ?? [];
  const [picked, setPicked] = useState<FlockBadge | null>(null);
  const anyUnseen = list.some((b) => b.unseen);
  useEffect(() => {
    if (anyUnseen) void markBadgesSeen().then(invalidate, () => undefined);
  }, [anyUnseen]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = list.find((b) => b.badge === picked) ?? list.find((b) => b.level === 0) ?? list[0];
  const next = selected ? nextLevel(selected.badge, selected.level) : null;
  return (
    <FlockSubPage title={t("flock.badges.title", "Badges")}
      line={badges ? t("flock.badges.count", "{{earned}} of {{total}} earned", { earned: earnedCount(list), total: FLOCK_BADGES.length }) : undefined}
      fallback="/flock/you">
      {isLoading ? (
        <div className="grid min-h-[30vh] place-items-center" role="status" aria-label={t("flock.badges.loading", "Loading your badges")}>
          <Loader2 className="size-8 animate-spin" style={{ color: K.moss }} />
        </div>
      ) : (
        <>
          <span className="text-[11.5px] font-[700] uppercase tracking-[.06em]" style={{ color: K.moss }}>{t("flock.badges.flockSet", "Flock badges")}</span>
          <div className="flex flex-wrap gap-x-1 gap-y-1.5" data-testid="badges-grid">
            {list.map((b) => (
              <BadgeTile key={b.badge} badge={b.badge} level={b.level} selected={selected?.badge === b.badge} onSelect={() => setPicked(b.badge)} />
            ))}
          </div>
          {selected && (
            <KyaCard className="flex flex-col gap-2 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5" data-testid="badge-how">
                {selected.level > 0
                  ? <Check className="size-[18px] shrink-0" style={{ color: K.moss }} aria-hidden="true" />
                  : <Lock className="size-[18px] shrink-0" style={{ color: "#4f6b60" }} aria-hidden="true" />}
                <span className="text-[13px] leading-[1.45]" style={{ color: "#4f6b60" }}>{howToEarn(t, selected.badge)}</span>
              </div>
              {selected.level > 0 && selected.earned_at && (
                <span className="text-[13px] leading-[1.45]" style={{ color: K.forest }} data-testid="badge-earned-on">
                  {levelLabel(t, selected.badge, selected.level)
                    ? t("flock.badges.earnedOnLevel", "{{level}} reached {{date}}.", { level: levelLabel(t, selected.badge, selected.level), date: formatFlockDay(selected.earned_at) })
                    : t("flock.badges.earnedOn", "Earned {{date}}.", { date: formatFlockDay(selected.earned_at) })}
                  {next != null && <> {t("flock.badges.nextLevel", "Next level at {{n}} journeys.", { n: next })}</>}
                </span>
              )}
            </KyaCard>
          )}
          <p className="m-0 px-2 text-[13px] leading-[1.45]" style={{ color: K.quiet }}>
            {t("flock.badges.footer", "Badges show on your Flock profile. A badge from \"Just me\" journeys stays here, for you. You can hide your badges on Edit profile.")}
          </p>
        </>
      )}
    </FlockSubPage>
  );
}
