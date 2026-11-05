// The last 30 days of one bird's weight, for Flock health's right pane on the
// iPhone Duo: the weight page's wide chart (components/WeightChart.tsx).
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { WeightChart } from "@/components/WeightChart";
import { DUO } from "@/components/duo/DuoBlocks";

type Point = { id: string; grams: number; measured_at: string };

const DAYS = 30;

/** "Last 30 days" with the chart, or a quiet line when nothing was logged. */
export function DuoWeightTrend({ birdId }: { birdId: string }) {
  const { t, i18n } = useTranslation();
  // Rounded to the hour so the key (and the fetch) stay put while the pane is open.
  const since = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 - DAYS * 86_400_000).toISOString();
  const { data, isLoading } = useQuery({
    queryKey: ["duo-weight-30", birdId, since],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("weight_entries")
        .select("id, grams, measured_at")
        .eq("bird_id", birdId)
        .gte("measured_at", since)
        .order("measured_at", { ascending: true });
      if (error) throw error;
      return (rows ?? []) as Point[];
    },
  });
  const end = Date.now();
  const start = end - DAYS * 86_400_000;
  const points = data ?? [];
  return (
    <section className="rounded-[22px] p-4" style={{ background: DUO.bg }}>
      <p className="m-0 text-[13px] font-[700] uppercase tracking-[0.06em]" style={{ color: DUO.quiet }}>{t("healthDuo.last30", "Last 30 days")}</p>
      {isLoading ? (
        <div className="mt-3 h-[150px] animate-pulse rounded-[16px] bg-white/70" aria-hidden="true" />
      ) : points.length === 0 ? (
        <p className="m-0 py-8 text-center text-[15px]" style={{ color: DUO.quiet }}>{t("birdWeight.noneInRange", "No weights in the last {{range}}.", { range: t("birdWeight.win30Days", "30 days") })}</p>
      ) : (
        <div className="mt-2"><WeightChart wide points={points} start={start} end={end} isMine={() => true} lang={i18n.language} /></div>
      )}
    </section>
  );
}
