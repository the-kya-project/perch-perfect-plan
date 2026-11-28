// The owner's home ZIP or postcode (backlog D2.2) and Home's weather card,
// client side. The row is public.home_postcodes (own row only,
// 20261128190000_weather_cards.sql); the card comes from getWeatherCard
// (src/lib/weather.functions.ts). Everything here runs only while the
// `weather_cards` switch is on for the account.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getWeatherCard, type WeatherCardAnswer } from "@/lib/weather.functions";
import type { HomePostcode } from "@/lib/weatherCards";

export const HOME_POSTCODE_KEY = ["home-postcode"] as const;
const weatherKey = (userId: string | null | undefined, date: string | null) => ["weather-card", userId, date];

/** The saved ZIP or postcode, for Account. */
export function useHomePostcode(userId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: HOME_POSTCODE_KEY,
    enabled: enabled && !!userId,
    queryFn: async (): Promise<HomePostcode | null> => {
      // Not in the generated types yet.
      const { data, error } = await (supabase.from as any)("home_postcodes")
        .select("country, postcode")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? { country: data.country, postcode: data.postcode } : null;
    },
  });
}

export async function saveHomePostcode(userId: string, home: HomePostcode): Promise<void> {
  const { error } = await (supabase.from as any)("home_postcodes").upsert({
    user_id: userId,
    country: home.country,
    postcode: home.postcode,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

/** Removing it deletes the row (and with it the weather card's "Got it"). */
export async function removeHomePostcode(userId: string): Promise<void> {
  const { error } = await (supabase.from as any)("home_postcodes").delete().eq("user_id", userId);
  if (error) throw error;
}

/** Home's question: is today a heat or cold day here? Asked only while the
 *  switch is on (`enabled`), once the page has its local date. */
export function useWeatherCard(
  userId: string | null | undefined,
  date: string | null,
  timeZone: string | null,
  enabled: boolean,
) {
  const fetchCard = useServerFn(getWeatherCard);
  return useQuery({
    queryKey: weatherKey(userId, date),
    enabled: enabled && !!userId && !!date,
    staleTime: 30 * 60_000,
    retry: false,
    queryFn: () => fetchCard({ data: { date: date!, timeZone } }),
  });
}

/** "Got it" on the weather card: hidden for the rest of the day. */
export function useDismissWeatherCard(userId: string | null | undefined, date: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.from as any)("home_postcodes")
        .update({ weather_dismissed_on: date })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onMutate: async () => {
      const key = weatherKey(userId, date);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<WeatherCardAnswer>(key);
      if (previous) qc.setQueryData(key, { ...previous, dismissedOn: date });
      return { previous };
    },
    onError: (_err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(weatherKey(userId, date), ctx.previous);
    },
  });
}
