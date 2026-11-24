/**
 * Weight baseline shadow log — hourly cron (job `weight-baseline-shadow-hourly`, at :47).
 *
 * For every weigh-in logged since the last run, for every bird, records what
 * the weight baseline would have said (with and without the owner's ideal
 * range) in public.weight_baseline_shadow, which nobody in the app can read
 * (backlog D1.2). Nothing is shown or sent to anyone. The rules are in
 * src/lib/weightBaselineShadow.ts.
 *
 * Auth: `Authorization: Bearer <cron_hook_token>`, the Vault secret pg_cron sends
 * (src/lib/cronAuth.ts). Answers 500 when a bird's history couldn't be read
 * (its weigh-ins wait for the next run).
 */
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { createFileRoute } from "@tanstack/react-router";
import { withCronTelemetry } from "@/lib/cronTelemetry";
import { cronAuthFailure } from "@/lib/cronAuth";
import {
  runWeightBaselineShadow,
  type HistoryEntry,
  type PendingEntry,
} from "@/lib/weightBaselineShadow";

export const Route = createFileRoute("/api/public/hooks/weight-baseline-shadow")({
  server: {
    handlers: {
      POST: withCronTelemetry(
        "weight-baseline-shadow",
        withErrorTelemetry("/api/public/hooks/weight-baseline-shadow", async ({ request }) => {
          const denied = await cronAuthFailure(request, "weight-baseline-shadow");
          if (denied) return denied;

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // The new tables and function postdate the generated types.
          const sb = supabaseAdmin as any;
          const result = await runWeightBaselineShadow({
            pending: async (limit) => {
              const { data, error } = await sb.rpc("weight_baseline_shadow_pending", {
                p_limit: limit,
              });
              if (error) throw new Error(`weight_baseline_shadow_pending: ${error.message}`);
              return ((data ?? []) as PendingEntry[]).map((e) => ({
                ...e,
                grams: Number(e.grams),
              }));
            },
            history: async (birdId, since, until) => {
              const { data, error } = await sb
                .from("weight_entries")
                .select("id, grams, measured_at, meal_relation")
                .eq("bird_id", birdId)
                .gte("measured_at", since)
                .lte("measured_at", until)
                .order("measured_at", { ascending: true })
                .limit(2000);
              if (error) {
                console.error(`[weight-baseline-shadow] history: ${error.message}`);
                throw new Error("history failed");
              }
              return ((data ?? []) as HistoryEntry[]).map((e) => ({
                ...e,
                grams: Number(e.grams),
              }));
            },
            ideals: async (birdIds) => {
              const { data, error } = await sb
                .from("bird_ideal_weights")
                .select("bird_id, low_grams, high_grams")
                .in("bird_id", birdIds);
              if (error) throw new Error(`bird_ideal_weights: ${error.message}`);
              return new Map(
                ((data ?? []) as { bird_id: string; low_grams: number; high_grams: number }[]).map(
                  (r) => [r.bird_id, { low: Number(r.low_grams), high: Number(r.high_grams) }],
                ),
              );
            },
            save: async (rows) => {
              const { data, error } = await sb
                .from("weight_baseline_shadow")
                .upsert(rows, { onConflict: "weight_entry_id", ignoreDuplicates: true })
                .select("weight_entry_id");
              if (error) throw new Error(`weight_baseline_shadow: ${error.message}`);
              return (data ?? []).length;
            },
          });
          const ok = result.failedBirds === 0;
          return Response.json({ ok, ...result }, { status: ok ? 200 : 500 });
        }),
      ),
    },
  },
});
