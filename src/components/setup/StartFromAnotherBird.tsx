// "Start from another bird?" — offered at the top of Food and Day during setup
// when the owner has another bird whose answers can be copied. One tap copies;
// the card then confirms what was copied and what's left to fill in.
// What gets copied is decided in src/lib/copyFromBird.ts.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { FOOD_COLUMNS, hasFoodToCopy, isOwnTask } from "@/lib/copyFromBird";
import { track } from "@/lib/analytics";
import { SectionCard, SetupSecondaryButton, Helper } from "./controls";

export type CopyKind = "food" | "day";
export type CopySource = { birdId: string; name: string; plan: Record<string, any> };

/** The owner's other living birds that have something to copy for `kind`.
 *  Empty when the current user doesn't own `birdId` (a household member). */
export function useCopySources(birdId: string, kind: CopyKind, enabled: boolean) {
  return useQuery({
    queryKey: ["copy-sources", birdId, kind],
    enabled,
    queryFn: async (): Promise<CopySource[]> => {
      const { data: u } = await getLocalUser();
      const uid = u.user?.id;
      if (!uid) return [];
      const { data: birds } = await supabase
        .from("birds")
        .select("id, name, created_at")
        .eq("owner_id", uid)
        .is("passed_at", null)
        .order("created_at");
      const list = (birds ?? []) as { id: string; name: string }[];
      if (!list.some((b) => b.id === birdId)) return [];
      const others = list.filter((b) => b.id !== birdId);
      if (!others.length) return [];

      const cols = kind === "food" ? `id, bird_id, ${FOOD_COLUMNS.join(", ")}` : "id, bird_id";
      const { data: plans } = await supabase.from("care_plans").select(cols).in("bird_id", others.map((b) => b.id));
      const byBird = new Map(((plans ?? []) as any[]).map((p) => [p.bird_id as string, p]));

      let withTasks = new Set<string>();
      if (kind === "day") {
        const planIds = [...byBird.values()].map((p) => p.id);
        if (!planIds.length) return [];
        const { data: tasks } = await supabase.from("routine_tasks").select("care_plan_id, title, derived").in("care_plan_id", planIds);
        withTasks = new Set(((tasks ?? []) as any[]).filter(isOwnTask).map((t) => t.care_plan_id as string));
      }

      return others.flatMap((b) => {
        const plan = byBird.get(b.id);
        if (!plan) return [];
        const ok = kind === "food" ? hasFoodToCopy(plan) : withTasks.has(plan.id);
        return ok ? [{ birdId: b.id, name: b.name, plan }] : [];
      });
    },
  });
}

export function StartFromAnotherBird({
  kind,
  birdName,
  sources,
  onCopy,
}: {
  kind: CopyKind;
  birdName: string;
  sources: CopySource[];
  /** Applies the copy. Throwing keeps the card open with an error line. */
  onCopy: (source: CopySource) => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(source: CopySource) {
    setBusy(true);
    setFailed(false);
    try {
      await onCopy(source);
      setCopied(source.name);
      track("setup_copy_from_bird", { kind, sources: sources.length });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (copied) {
    return (
      <SectionCard
        emphasis
        title={t("copyFromBird.copiedTitle", "Copied from {{source}}", { source: copied })}
        helper={kind === "food"
          ? t("copyFromBird.copiedFood", "Add how much {{name}} eats for each item below, then change anything that's different.", { name: birdName })
          : t("copyFromBird.copiedDay", "Change anything that's different for {{name}}.", { name: birdName })}
      />
    );
  }

  const one = sources.length === 1 ? sources[0].name : null;
  const helper = kind === "food"
    ? (one
      ? t("copyFromBird.foodHelperOne", "Copy {{source}}'s food, then add how much {{name}} eats.", { source: one, name: birdName })
      : t("copyFromBird.foodHelperMany", "Copy another bird's food, then add how much {{name}} eats.", { name: birdName }))
    : (one
      ? t("copyFromBird.dayHelperOne", "Copy {{source}}'s daily tasks, then adjust them for {{name}}.", { source: one, name: birdName })
      : t("copyFromBird.dayHelperMany", "Copy another bird's daily tasks, then adjust them for {{name}}.", { name: birdName }));

  return (
    <SectionCard title={t("copyFromBird.title", "Start from another bird?")} helper={helper}>
      <div className="flex flex-col gap-2.5">
        {sources.map((s) => (
          <SetupSecondaryButton key={s.birdId} onClick={() => copy(s)} disabled={busy}>
            {t("copyFromBird.copyFrom", "Copy from {{source}}", { source: s.name })}
          </SetupSecondaryButton>
        ))}
      </div>
      {failed && <Helper>{t("copyFromBird.failed", "That didn't copy. Check your connection and try again.")}</Helper>}
    </SectionCard>
  );
}
