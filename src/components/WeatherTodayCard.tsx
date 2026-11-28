// Home's heat or cold card (backlog D2.2). It takes the seasonal card's spot
// on a weather day (SeasonalTodayCard decides), with the same "Got it", which
// hides it until the next day. Plain care steps, never health advice.
import { useTranslation } from "react-i18next";
import { Snowflake, Sun } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { K, KyaLink, SERIF } from "@/components/kya";
import { formatTemp, type WeatherCard } from "@/lib/weatherCards";

const TONES = {
  heat: { body: "#fff4e5", band: "#ffe2bd", title: "#7a3e00", text: "#5c3a12", action: "#9a4d00", icon: "#c25e00", small: "#8a6a45" },
  cold: { body: "#eaf2fb", band: "#d3e4f6", title: "#1d3d63", text: "#2f4a66", action: "#245a92", icon: "#3a74b5", small: "#5f7690" },
} as const;

export function WeatherTodayCard({
  card,
  birdNames,
  onGotIt,
}: {
  card: WeatherCard;
  birdNames: readonly string[];
  onGotIt: () => void;
}) {
  const { t } = useTranslation();
  const tone = TONES[card.kind];
  const Icon = card.kind === "heat" ? Sun : Snowflake;
  const temp = formatTemp(card);
  const one = birdNames.length === 1 ? birdNames[0] : null;

  return (
    <section
      data-testid="weather-today-card"
      data-card={card.kind}
      className="w-full overflow-hidden rounded-[20px]"
      style={{ background: tone.body }}
    >
      <div className="flex items-center gap-3 px-4 pb-1 pt-[14px]">
        <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: tone.band }}>
          <Icon className="size-5" style={{ color: tone.icon }} aria-hidden />
        </span>
        <h3 className="m-0 text-[21px] font-[700] leading-[1.2]" style={{ fontFamily: SERIF, color: tone.title }}>
          {card.kind === "heat"
            ? t("dashboard.weatherHeatTitle", "Hot day ahead: {{temp}}", { temp })
            : t("dashboard.weatherColdTitle", "Cold night ahead: {{temp}}", { temp })}
        </h3>
      </div>
      <div className="px-4 pb-1">
        <p className="m-0 mt-[6px] text-[14px] leading-[1.45]" style={{ color: tone.text }}>
          {card.kind === "cold"
            ? t("dashboard.weatherColdBody", "Move the cage away from drafty windows and outside doors tonight. A cover over part of the cage helps hold in warmth, and space heaters stay well away from it.")
            : one
              ? t("dashboard.weatherHeatBodyOne", "Keep {{bird}}'s cage out of direct sun and away from windows, and check the water more often today. A cool shower or misting helps on a hot afternoon.", { bird: one })
              : t("dashboard.weatherHeatBodyMany", "Keep your birds' cages out of direct sun and away from windows, and check the water more often today. A cool shower or misting helps on a hot afternoon.")}
        </p>
        <div className="mt-1 flex min-h-[44px] items-center justify-between gap-3">
          <KyaLink color={tone.action} onClick={onGotIt}>
            {t("dashboard.todayCardGotIt", "Got it")}
          </KyaLink>
          <span className="text-right text-[12px]" style={{ color: tone.small }}>
            {t("dashboard.weatherForecastFor", "Forecast for {{postcode}}. Change it in Account.", { postcode: card.postcode })}
          </span>
        </div>
      </div>
    </section>
  );
}

/** Shown on Home, while the switch is on, when no ZIP or postcode is saved.
 *  "Got it" hides it for good (Brittany, Nov 28, 2026). */
export function WeatherPostcodePrompt({ onGotIt }: { onGotIt: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div
      data-testid="weather-postcode-prompt"
      className="flex min-h-[44px] w-full items-center gap-3 rounded-[16px] px-4 py-2.5 text-[14px] leading-[1.4]"
      style={{ background: "#f1f5f0", color: K.forest }}
    >
      <button
        type="button"
        onClick={() => navigate({ to: "/account" })}
        className="flex min-h-[44px] flex-1 items-center gap-3 text-left"
      >
        <Sun className="size-5 shrink-0" style={{ color: K.quiet }} aria-hidden />
        <span>{t("dashboard.weatherAddPostcode", "Want a heads-up on very hot or cold days? Add your home ZIP or postcode in Account.")}</span>
      </button>
      <KyaLink color={K.forest} onClick={onGotIt} className="shrink-0">
        {t("dashboard.todayCardGotIt", "Got it")}
      </KyaLink>
    </div>
  );
}
