// How each seasonal or holiday Today card looks (backlog D2.1): its tint, its
// label and its illustration. The one place these colors live. The cards and
// their dates are in src/lib/seasonalCalendar.ts.
//
// No imports beyond the calendar's types, so it's testable on its own
// (npm run test:today-card).

import type { SeasonalCard } from "./seasonalCalendar";

export type SeasonalTone = "teal" | "forest" | "blush" | "lime" | "sun" | "apricot";

export type SeasonalToneColors = {
  band: string;
  body: string;
  title: string;
  text: string;
  action: string;
  endDate: string;
  pillBg: string;
  pillText: string;
};

const FOREST = "#1a3d2e";

function lightTone(band: string, body: string): SeasonalToneColors {
  return {
    band,
    body,
    title: FOREST,
    text: "#3d4f45",
    action: "#2d6a4f",
    endDate: "#5f5e5a",
    pillBg: "#ffffff",
    pillText: FOREST,
  };
}

export const SEASONAL_TONES: Record<SeasonalTone, SeasonalToneColors> = {
  teal: lightTone("#c9e4dc", "#ebf5f1"),
  forest: {
    band: "#12291f",
    body: FOREST,
    title: "#ffffff",
    text: "#d6e8dc",
    action: "#cdeab0",
    endDate: "#9bcab8",
    pillBg: "#cdeab0",
    pillText: FOREST,
  },
  blush: lightTone("#f4d3c8", "#fcede7"),
  lime: lightTone("#cdeab0", "#eff7e6"),
  sun: lightTone("#f9dc8c", "#fdf3d4"),
  apricot: lightTone("#f6c896", "#fdecd9"),
};

export const SEASONAL_CARD_TONES: Readonly<Record<string, SeasonalTone>> = {
  winterDryAir: "teal",
  winterDrafts: "teal",
  summerTravel: "teal",
  holidayTravel: "teal",
  newYearFireworks: "forest",
  julyFourth: "forest",
  holidayMeals: "forest",
  valentines: "blush",
  clocksBack: "blush",
  sinterklaas: "blush",
  springCleaning: "lime",
  easter: "lime",
  springWindows: "lime",
  holidayDecorations: "lime",
  clocksForward: "sun",
  summerHeat: "sun",
  autumnHeating: "sun",
  thanksgiving: "sun",
  kingsDay: "apricot",
  autumnRoutine: "apricot",
  halloween: "apricot",
  holidayCandles: "apricot",
};

export function seasonalToneFor(cardId: string): SeasonalToneColors {
  return SEASONAL_TONES[SEASONAL_CARD_TONES[cardId] ?? "teal"];
}

/** The illustration, in public/today-cards/. */
export function seasonalImageFor(cardId: string): string {
  return `/today-cards/${cardId}.webp`;
}

export type SeasonalLabel = "seasonalTip" | "holidayHelper";

/** The clock changes are holidays in the calendar, so they win over a season
 *  card, but they read as seasonal tips. */
export function seasonalLabelFor(card: Pick<SeasonalCard, "id" | "kind">): SeasonalLabel {
  if (card.kind === "season" || card.id === "clocksForward" || card.id === "clocksBack") {
    return "seasonalTip";
  }
  return "holidayHelper";
}
