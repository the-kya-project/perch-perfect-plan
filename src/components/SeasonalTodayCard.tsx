// Home's seasonal and holiday Today card (backlog D2.1): the day's card from
// the seasonal calendar (src/lib/seasonalCalendar.ts), in the reader's
// language, behind the `today_cards` care switch (src/lib/careFeatures.ts).
//
// Renders nothing until the page has loaded: the date and the device's time
// zone are read in an effect, so the server render and the first browser
// render match (the iPhone hydration check). Never calls the Flock's Today's
// idea.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Leaf, Star } from "lucide-react";
import { KyaLink, SERIF } from "@/components/kya";
import { useCareFeature } from "@/lib/careFeatures";
import { localDateISO } from "@/lib/localDay";
import { seasonalImageFor, seasonalLabelFor, seasonalToneFor } from "@/lib/seasonalCardStyle";
import { formatTodayCardEnd, isTodayCardDismissed, todayCardFor } from "@/lib/todayCard";
import { useDismissTodayCard, useTodayCardDismissal } from "@/lib/todayCardDismissal";

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** `homeTimeZone` is the account's stored zone (profiles.time_zone), if any. */
export function SeasonalTodayCard({
  userId,
  homeTimeZone,
}: {
  userId?: string | null;
  homeTimeZone?: string | null;
}) {
  const { t, i18n } = useTranslation();
  const enabled = useCareFeature("today_cards");
  const dismissal = useTodayCardDismissal(userId, enabled === true);
  const dismiss = useDismissTodayCard(userId);
  const [day, setDay] = useState<{ date: string; deviceZone: string | null } | null>(null);

  // Read after mount, and again when the app comes back to the front, so a
  // page left open overnight moves on to the new day.
  useEffect(() => {
    const read = () => {
      const date = localDateISO();
      setDay((prev) => (prev?.date === date ? prev : { date, deviceZone: deviceTimeZone() }));
    };
    read();
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (enabled !== true || !day || !userId || dismissal.isPending) return null;
  const today = todayCardFor(day.date, homeTimeZone || day.deviceZone);
  if (!today || isTodayCardDismissed(today, day.date, dismissal.data)) return null;

  const tone = seasonalToneFor(today.card.id);
  const label = seasonalLabelFor(today.card);
  const LabelIcon = label === "seasonalTip" ? Leaf : Star;

  return (
    <section
      data-testid="seasonal-today-card"
      data-card={today.card.id}
      className="w-full overflow-hidden rounded-[20px]"
      style={{ background: tone.body }}
    >
      <div
        className="flex h-[120px] items-center justify-center px-4"
        style={{ background: tone.band }}
      >
        <img
          src={seasonalImageFor(today.card.id)}
          alt=""
          decoding="async"
          className="h-full max-h-[100px] w-full object-contain"
        />
      </div>
      <div className="px-4 pb-1 pt-[14px]">
        <span
          className="inline-flex items-center gap-1 rounded-full px-[10px] py-1 text-[12px] font-[700] leading-none"
          style={{ background: tone.pillBg, color: tone.pillText }}
        >
          <LabelIcon className="size-3" aria-hidden />
          {label === "seasonalTip"
            ? t("dashboard.todayCardSeasonalTip", "Seasonal tip")
            : t("dashboard.todayCardHolidayHelper", "Holiday helper")}
        </span>
        <h3
          className="m-0 mt-2 text-[21px] font-[700] leading-[1.2]"
          style={{ fontFamily: SERIF, color: tone.title }}
        >
          {t(today.titleKey, { ns: "seasonal" })}
        </h3>
        <p className="m-0 mt-[6px] text-[14px] leading-[1.45]" style={{ color: tone.text }}>
          {t(today.bodyKey, { ns: "seasonal" })}
        </p>
        <div className="mt-1 flex min-h-[44px] items-center justify-between gap-3">
          <KyaLink
            color={tone.action}
            onClick={() => dismiss.mutate({ cardId: today.card.id, through: today.endsOn })}
          >
            {t("dashboard.todayCardGotIt", "Got it")}
          </KyaLink>
          <span className="text-right text-[12px]" style={{ color: tone.endDate }}>
            {t("dashboard.todayCardThrough", "Through {{date}}", {
              date: formatTodayCardEnd(today.endsOn, i18n.language),
            })}
          </span>
        </div>
      </div>
    </section>
  );
}
