// "Got it" on Home's Today card (backlog D2.1): one row per account in
// public.today_card_dismissals (20261123160000_today_card_dismissals.sql), so
// it holds across devices. The rule is isTodayCardDismissed in todayCard.ts.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/errorMessage";
import type { TodayCardDismissal } from "@/lib/todayCard";

const queryKey = (userId: string | null | undefined) => ["today-card-dismissal", userId];

/** Asks only while the switch is on, so nothing new runs for anyone else. */
export function useTodayCardDismissal(userId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKey(userId),
    enabled: enabled && !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TodayCardDismissal | null> => {
      // Not in the generated types yet.
      const { data, error } = await (supabase.from as any)("today_card_dismissals")
        .select("card_id, through_date")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;
      return data ? { cardId: data.card_id, through: data.through_date } : null;
    },
  });
}

export function useDismissTodayCard(userId: string | null | undefined) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async (d: TodayCardDismissal) => {
      const { error } = await (supabase.from as any)("today_card_dismissals").upsert({
        user_id: userId,
        card_id: d.cardId,
        through_date: d.through,
        dismissed_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: queryKey(userId) });
      const previous = qc.getQueryData<TodayCardDismissal | null>(queryKey(userId));
      qc.setQueryData(queryKey(userId), d);
      return { previous };
    },
    onError: (err, _d, ctx) => {
      qc.setQueryData(queryKey(userId), ctx?.previous ?? null);
      toast.error(friendlyError(err, t("dashboard.todayCardDismissFailed", "Couldn't hide this card. Try again.")));
    },
  });
}
