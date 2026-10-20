// "Start from another bird?" — a panel at the bottom of the setup header on Food
// and Day, when the owner has another bird whose answers can be copied. Pick a
// bird and copy; a bar then says what was copied, with Undo.
// What gets copied is decided in src/lib/copyFromBird.ts.
import { useContext, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { FOOD_COLUMNS, hasFoodToCopy, isOwnTask } from "@/lib/copyFromBird";
import { track } from "@/lib/analytics";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { S, SERIF, Dropdown, SetupPrimaryButton } from "./controls";
import { SetupHeaderPanelSlot } from "./SetupFrame";

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

/** What a copy did, so the bar can say so and undo it. */
export type CopyResult = { count: number; undo: () => Promise<void> | void };

/**
 * The panel at the bottom of the setup header: pick one of the owner's other
 * birds, copy, and after copying a bar with what was copied and Undo. "Start
 * fresh" hides it. Rendered into the header through SetupHeaderPanelSlot.
 */
export function StartFromAnotherBird({
  kind,
  birdName,
  sources,
  onCopy,
}: {
  kind: CopyKind;
  birdName: string;
  sources: CopySource[];
  /** Applies the copy. Throwing keeps the panel open with an error line. */
  onCopy: (source: CopySource) => Promise<CopyResult>;
}) {
  const { t } = useTranslation();
  const slot = useContext(SetupHeaderPanelSlot);
  const [picked, setPicked] = useState<string>(sources[0]?.birdId ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState<{ name: string; result: CopyResult } | null>(null);
  const source = sources.find((s) => s.birdId === picked) ?? sources[0];

  async function copy() {
    if (!source) return;
    setBusy(true);
    setFailed(false);
    try {
      const result = await onCopy(source);
      setCopied({ name: source.name, result });
      track("setup_copy_from_bird", { kind, sources: sources.length });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    if (!copied) return;
    setBusy(true);
    try {
      await copied.result.undo();
      setCopied(null);
      track("setup_copy_from_bird_undo", { kind });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (hidden || !slot || (!copied && !source)) return null;

  const panel = copied ? (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[18px] px-4 py-3.5 text-[15px] leading-[1.45]" style={{ background: S.forestDeep, color: S.mist }}>
      <span className="min-w-0 flex-1">
        {kind === "food"
          ? t("copyFromBird.copiedFoods", "Copied {{count}} foods from {{source}}. Add {{name}}'s amounts to finish.", { count: copied.result.count, source: copied.name, name: birdName })
          : t("copyFromBird.copiedTasks", "Copied {{count}} tasks from {{source}}.", { count: copied.result.count, source: copied.name })}
      </span>
      <button type="button" onClick={undo} disabled={busy} className="min-h-[44px] font-[700] text-white underline underline-offset-2 disabled:opacity-50">
        {t("copyFromBird.undo", "Undo")}
      </button>
    </div>
  ) : (
    <div className="flex flex-col gap-3.5 rounded-[18px] p-4" style={{ background: S.forestDeep }}>
      <div>
        <h2 className="m-0 text-[21px] font-[700] leading-[1.2] text-white" style={{ fontFamily: SERIF }}>{t("copyFromBird.title", "Start from another bird?")}</h2>
        <p className="m-0 mt-1.5 text-[15px] leading-[1.5]" style={{ color: S.mist }}>
          {kind === "food"
            ? t("copyFromBird.foodBody", "We'll copy their diet types and foods. Amounts stay blank, since every bird eats a little differently.")
            : t("copyFromBird.dayBody", "We'll copy the tasks you added. Feeding and medications still come from {{name}}'s own plan.", { name: birdName })}
        </p>
      </div>

      {sources.length > 1 && sources.length <= 3 && (
        <div role="group" aria-label={t("copyFromBird.pickBird", "Copy from")} className="flex flex-wrap gap-2">
          {sources.map((s) => {
            const on = s.birdId === source?.birdId;
            return (
              <button
                key={s.birdId}
                type="button"
                aria-pressed={on}
                onClick={() => setPicked(s.birdId)}
                className="inline-flex min-h-[48px] items-center gap-1.5 rounded-full border-2 px-4 text-[15px] font-[700]"
                style={on ? { background: S.forestDeep, borderColor: S.lime, color: S.lime } : { background: "transparent", borderColor: S.pillLine, color: "#fff" }}
              >
                {on && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
                {s.name}
              </button>
            );
          })}
        </div>
      )}
      {sources.length > 3 && (
        <Dropdown
          ariaLabel={t("copyFromBird.pickBird", "Copy from")}
          value={source?.birdId ?? ""}
          onChange={setPicked}
          options={sources.map((s) => ({ value: s.birdId, label: s.name }))}
        />
      )}

      <SetupPrimaryButton onClick={copy} disabled={busy || !source}>
        {kind === "food"
          ? t("copyFromBird.copyFoods", "Copy {{source}}'s foods", { source: source?.name })
          : t("copyFromBird.copyDay", "Copy {{source}}'s day", { source: source?.name })}
      </SetupPrimaryButton>
      {failed && <p className="m-0 text-[14px]" style={{ color: S.lime }}>{t("copyFromBird.failed", "That didn't copy. Check your connection and try again.")}</p>}
      <div className="text-center">
        <button type="button" onClick={() => setHidden(true)} className="min-h-[44px] text-[15px] font-[600] text-white underline underline-offset-2">
          {t("copyFromBird.startFresh", "Start fresh")}
        </button>
      </div>
    </div>
  );
  return createPortal(panel, slot);
}
