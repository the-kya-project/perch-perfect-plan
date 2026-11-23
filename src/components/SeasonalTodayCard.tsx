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
import {
  CalendarDays,
  Car,
  Clock,
  Flame,
  Home,
  PartyPopper,
  Snowflake,
  Sparkles,
  Sun,
  Utensils,
  Wind,
} from "lucide-react";
import { K, KyaCard, KyaIconTile } from "@/components/kya";
import { useCareFeature } from "@/lib/careFeatures";
import { localDateISO } from "@/lib/localDay";
import { todayCardFor } from "@/lib/todayCard";
import type { SeasonalTopic } from "@/lib/seasonalCalendar";

const TOPIC_ICON: Record<SeasonalTopic, typeof Sun> = {
  heat: Sun,
  cold: Snowflake,
  fireworks: Sparkles,
  candles: Flame,
  "holiday-food": Utensils,
  travel: Car,
  fumes: Wind,
  windows: Home,
  decorations: PartyPopper,
  noise: Sparkles,
  routine: Clock,
};

function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** `homeTimeZone` is the account's stored zone (profiles.time_zone), if any. */
export function SeasonalTodayCard({ homeTimeZone }: { homeTimeZone?: string | null }) {
  const { t } = useTranslation();
  const enabled = useCareFeature("today_cards");
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

  if (enabled !== true || !day) return null;
  const today = todayCardFor(day.date, homeTimeZone || day.deviceZone);
  if (!today) return null;
  const Icon = TOPIC_ICON[today.card.topics[0]] ?? CalendarDays;

  return (
    <KyaCard className="flex gap-3 px-4 py-4" style={{ color: K.forest }}>
      <div data-testid="seasonal-today-card" data-card={today.card.id} className="contents">
        <KyaIconTile tone="mist">
          <Icon className="size-[18px]" />
        </KyaIconTile>
        <div className="min-w-0">
          <h3 className="m-0 text-[16px] font-[700] leading-[1.3]">
            {t(today.titleKey, { ns: "seasonal" })}
          </h3>
          <p className="m-0 mt-1 text-[14px] leading-[1.45]" style={{ color: K.ink }}>
            {t(today.bodyKey, { ns: "seasonal" })}
          </p>
        </div>
      </div>
    </KyaCard>
  );
}
