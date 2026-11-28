// Home's weather card (backlog D2.2): the server side. Asks, as the caller,
// whether `weather_cards` is on for them and what their home ZIP or postcode
// is (public.home_postcodes, their own row only), turns it into the middle of
// its area from the app's own files (postcodeCentroids.server.ts), and reads
// that area's forecast from public.weather_forecasts, fetching it from Apple
// WeatherKit first when today's isn't there yet: at most once a day per area,
// shared by everyone in it. WeatherKit gets only the area's coordinates; never
// the ZIP, the account, or the phone's location.
//
// Anything missing or failing answers `card: null`, and Home shows the
// seasonal card exactly as before. Previews have no WeatherKit key and refuse
// to call it anyway, so weather is unavailable there.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  areaKey,
  forecastDaysFromWeatherKit,
  forecastTimeZone,
  weatherCardFor,
  type ForecastDay,
  type HomePostcode,
  type WeatherCard,
} from "@/lib/weatherCards";

export type WeatherCardAnswer = {
  /** False when the switch is off for this account: show nothing new. */
  enabled: boolean;
  /** The saved ZIP or postcode, or null (Home shows the "add your ZIP" prompt). */
  home: HomePostcode | null;
  card: WeatherCard | null;
  /** The day the card was last hidden with "Got it". */
  dismissedOn: string | null;
};

const OFF: WeatherCardAnswer = { enabled: false, home: null, card: null, dismissedOn: null };

export const getWeatherCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { date: string; timeZone?: string | null }) =>
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      timeZone: z.string().max(64).nullish(),
    }).parse(d))
  .handler(async ({ data, context }): Promise<WeatherCardAnswer> => {
    const sb = context.supabase as any;
    const { data: on, error: switchError } = await sb.rpc("care_feature_enabled", { p_feature: "weather_cards" });
    if (switchError || on !== true) return OFF;

    const { data: row } = await sb
      .from("home_postcodes")
      .select("country, postcode, weather_dismissed_on")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) return { enabled: true, home: null, card: null, dismissedOn: null };
    const home: HomePostcode = { country: row.country, postcode: row.postcode };
    const answer: WeatherCardAnswer = { enabled: true, home, card: null, dismissedOn: row.weather_dismissed_on ?? null };

    try {
      const days = await areaForecast(home, data.timeZone ?? null);
      answer.card = weatherCardFor(days, data.date, home);
    } catch (e) {
      console.warn("[weather] forecast unavailable", { area: areaKey(home), reason: e instanceof Error ? e.message : String(e) });
    }
    return answer;
  });

/** The cached forecast for the area, fetched first if today's (UTC) isn't in. */
async function areaForecast(home: HomePostcode, accountZone: string | null): Promise<ForecastDay[] | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as any;
  const area = areaKey(home);
  const todayUtc = new Date().toISOString().slice(0, 10);

  const { data: cached } = await admin
    .from("weather_forecasts")
    .select("fetched_on, days")
    .eq("area", area)
    .maybeSingle();
  if (cached && cached.fetched_on === todayUtc) return cached.days as ForecastDay[];

  const { centroidFor } = await import("@/lib/postcodeCentroids.server");
  const place = await centroidFor(home);
  if (!place) return null;

  const timeZone = forecastTimeZone(home.country, accountZone);
  const { fetchDailyForecast, weatherKitConfigured } = await import("@/lib/weatherKit.server");
  if (!weatherKitConfigured()) return (cached?.days as ForecastDay[] | undefined) ?? null;

  let days: ForecastDay[];
  try {
    const json = await fetchDailyForecast(place.lat, place.lon, timeZone);
    const dateOf = (iso: string) =>
      new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
    days = forecastDaysFromWeatherKit(json, dateOf);
  } catch (e) {
    // Still counts as today's one call for the area, so a failing WeatherKit
    // isn't asked again on every Home visit; yesterday's days are kept.
    days = (cached?.days as ForecastDay[] | undefined) ?? [];
    console.warn("[weather] WeatherKit call failed", { area, reason: e instanceof Error ? e.message : String(e) });
  }

  const { error } = await admin.from("weather_forecasts").upsert({
    area,
    fetched_on: todayUtc,
    fetched_at: new Date().toISOString(),
    time_zone: timeZone,
    days,
  });
  if (error) console.warn("[weather] couldn't cache the forecast", { area, code: error.code });
  return days;
}
