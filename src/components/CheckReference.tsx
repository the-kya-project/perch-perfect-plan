// Beside the full health check on iPhone Duo, unfolded and sideways: what's
// recent for this bird, to compare against while answering. Read-only.
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { checkKindOf } from "@/lib/checkKind";
import { daysAgo } from "@/lib/scanConcern";
import { K, KyaCard, KyaHeading } from "@/components/kya";

type WeightRow = { grams: number; measured_at: string; meal_relation: string | null };
type CheckRow = { id: string; created_at: string; triage_status: string; kind?: string | null };

function dayLabel(t: TFunction, iso: string, lang: string): string {
  const d = daysAgo(iso);
  if (d <= 0) return t("checkReference.today", "Today");
  if (d === 1) return t("checkReference.yesterday", "Yesterday");
  return new Date(iso).toLocaleDateString(lang, { month: "short", day: "numeric" });
}

function statusLabel(t: TFunction, status: string): string {
  return status === "red"
    ? t("checkReference.concern", "Concern flagged")
    : status === "yellow"
      ? t("checkReference.somethingToCheck", "Something to check")
      : t("checkReference.allNormal", "All normal");
}

export function CheckReference({ birdId, name }: { birdId: string; name: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data } = useQuery({
    queryKey: ["check-reference", birdId],
    queryFn: async () => {
      const [w, c] = await Promise.all([
        supabase.from("weight_entries").select("grams, measured_at, meal_relation").eq("bird_id", birdId).order("measured_at", { ascending: false }).limit(1),
        // "*": works before daily_logs.kind exists (lib/missingColumn.ts)
        supabase.from("daily_logs").select("*").eq("bird_id", birdId).order("created_at", { ascending: false }).limit(3),
      ]);
      if (w.error) throw w.error;
      if (c.error) throw c.error;
      return { weight: ((w.data ?? []) as unknown as WeightRow[])[0] ?? null, checks: (c.data ?? []) as unknown as CheckRow[] };
    },
  });
  const weight = data?.weight;
  const checks = data?.checks ?? [];

  return (
    <div className="flex flex-col gap-3.5 px-[26px] pb-6 pt-[calc(env(safe-area-inset-top)+24px)]" style={{ color: K.forest }}>
      <span className="text-[13px] font-[700] uppercase tracking-[0.06em]" style={{ color: "#5f6b66" }}>{t("checkReference.eyebrow", "For reference")}</span>
      <KyaHeading size={26} className="-mt-1.5">{t("checkReference.title", "What's recent for {{name}}", { name })}</KyaHeading>

      <KyaCard className="flex flex-col gap-1 px-[18px] py-4">
        <span className="text-[14px] font-[700]">{t("checkReference.lastWeight", "Last weight")}</span>
        {weight ? (
          <span className="text-[15px]" style={{ color: "#3d5248" }}>
            <b className="font-[700]" style={{ color: K.forest }}>{t("checkReference.grams", "{{n}} g", { n: weight.grams.toLocaleString() })}</b>
            {" · "}{dayLabel(t, weight.measured_at, lang)}
          </span>
        ) : (
          <span className="text-[15px]" style={{ color: K.quiet }}>{data ? t("checkReference.noWeight", "No weights yet") : "…"}</span>
        )}
      </KyaCard>

      <KyaCard className="flex flex-col px-[18px] py-4">
        <span className="pb-1 text-[14px] font-[700]">{t("checkReference.lastChecks", "Last checks")}</span>
        {checks.length === 0 ? (
          <span className="text-[15px]" style={{ color: K.quiet }}>{data ? t("checkReference.noChecks", "No checks yet") : "…"}</span>
        ) : checks.map((c, i) => (
          <div key={c.id} className="flex gap-3.5 py-2 text-[15px]" style={{ borderTop: i === 0 ? undefined : `1px solid ${K.line}` }}>
            <span className="w-[72px] shrink-0" style={{ color: "#5f6b66" }}>{dayLabel(t, c.created_at, lang)}</span>
            <span className="min-w-0 flex-1">
              {checkKindOf(c as any) === "full" ? t("checkReference.fullCheck", "Full health check") : t("checkReference.dailyCheck", "Daily check")}
              {" · "}{statusLabel(t, c.triage_status)}
            </span>
          </div>
        ))}
      </KyaCard>

      <KyaCard className="flex flex-col gap-1 px-[18px] py-4">
        <span className="text-[15px] font-[700]">{t("checkReference.offTitle", "Something look off?")}</span>
        <span className="text-[14px] leading-[1.4]" style={{ color: "#5f6b66" }}>{t("checkReference.offBody", "Choose \"Not sure\" or \"Concerning\" and add a photo at the end of the check.")}</span>
      </KyaCard>
    </div>
  );
}
