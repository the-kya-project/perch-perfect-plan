import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronRight, ExternalLink, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Bird = { id: string; name: string };

export const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "first_aid", label: "First-aid kit stocked, and its location noted" },
  { key: "carrier", label: "Carrier clean and accessible" },
  { key: "food_portioned", label: "Enough food portioned for the full sit, plus extra" },
  { key: "enrichment", label: "Foraging toys and enrichment set up" },
  { key: "cage_clean", label: "Cage cleaned with fresh substrate" },
  { key: "sitter_access", label: "Sitter has access (key, code, or entry plan)" },
  { key: "temperature", label: "Temperature and heating plan set" },
  { key: "hazards", label: "Hazards handled (rooms closed, pets secured, windows checked)" },
  { key: "emergency_contacts", label: "Emergency contacts confirmed current" },
  { key: "invite_tested", label: "Sitter invite link tested" },
];

type AutoItem = { key: string; label: string; birdId: string; birdName: string };

function daysBetween(start: string, end: string): number {
  // Inclusive day count between two YYYY-MM-DD dates. Falls back to 1 on parse fail.
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
  const ms = e.getTime() - s.getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

function computeAutoItems(args: {
  birds: Bird[];
  bundles: Map<string, { medications?: string | null; flight_status?: string | null; diet_types?: string[] | null; fresh_foods?: string[] | null }>;
  days: number;
}): AutoItem[] {
  const out: AutoItem[] = [];
  const { birds, bundles, days } = args;
  for (const b of birds) {
    const data = bundles.get(b.id);
    if (!data) continue;
    const meds = (data.medications ?? "").trim();
    if (meds) {
      out.push({
        key: `auto:meds:${b.id}`,
        birdId: b.id,
        birdName: b.name,
        label: `Measure out ${days} day${days === 1 ? "" : "s"} of ${meds}.`,
      });
    }
    const hasFresh =
      (data.diet_types ?? []).includes("chop") ||
      (data.fresh_foods ?? []).length > 0;
    if (hasFresh) {
      out.push({
        key: `auto:fresh:${b.id}`,
        birdId: b.id,
        birdName: b.name,
        label: "Portion fresh food for the week.",
      });
    }
    if ((data.flight_status ?? "") === "fully_flighted") {
      out.push({
        key: `auto:flight:${b.id}`,
        birdId: b.id,
        birdName: b.name,
        label: "Confirm the windows-and-doors plan with your sitter.",
      });
    }
  }
  return out;
}

export function SitChecklist({
  sit,
  birds,
}: {
  sit: { id: string; start_date: string; end_date: string };
  birds: Bird[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sit-checklist", sit.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sit_checklist_items")
        .select("item_key, checked")
        .eq("sit_id", sit.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Pull live bird + care-plan data so auto items regenerate whenever the
  // underlying care plan changes (refetched on mount/focus by default).
  const birdIds = birds.map((b) => b.id);
  const { data: autoBundles } = useQuery({
    queryKey: ["sit-checklist-auto", sit.id, birdIds],
    enabled: birdIds.length > 0,
    queryFn: async () => {
      const [birdsRes, plansRes] = await Promise.all([
        supabase.from("birds").select("id, medications, flight_status").in("id", birdIds),
        supabase.from("care_plans").select("bird_id, diet_types, fresh_foods").in("bird_id", birdIds),
      ]);
      const byBird = new Map<string, any>();
      for (const b of (birdsRes.data ?? []) as any[]) byBird.set(b.id, { ...b });
      for (const p of (plansRes.data ?? []) as any[]) {
        const existing = byBird.get(p.bird_id) ?? {};
        byBird.set(p.bird_id, { ...existing, diet_types: p.diet_types, fresh_foods: p.fresh_foods });
      }
      return byBird;
    },
  });

  const days = daysBetween(sit.start_date, sit.end_date);
  const autoItems = autoBundles
    ? computeAutoItems({ birds, bundles: autoBundles, days })
    : [];

  const checkedSet = new Set(
    rows.filter((r: any) => r.checked).map((r: any) => r.item_key),
  );
  const totalCount = CHECKLIST_ITEMS.length + autoItems.length;
  const doneCount =
    CHECKLIST_ITEMS.filter((i) => checkedSet.has(i.key)).length +
    autoItems.filter((i) => checkedSet.has(i.key)).length;

  async function toggle(itemKey: string, nextChecked: boolean) {
    qc.setQueryData(["sit-checklist", sit.id], (prev: any[] = []) => {
      const others = prev.filter((r) => r.item_key !== itemKey);
      return [...others, { item_key: itemKey, checked: nextChecked }];
    });
    const { error } = await supabase
      .from("sit_checklist_items")
      .upsert(
        { sit_id: sit.id, item_key: itemKey, checked: nextChecked, checked_at: new Date().toISOString() },
        { onConflict: "sit_id,item_key" },
      );
    if (error) {
      toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["sit-checklist", sit.id] });
    }
  }

  // Group auto items by bird for the multi-bird case.
  const autoByBird = new Map<string, AutoItem[]>();
  for (const item of autoItems) {
    const arr = autoByBird.get(item.birdId) ?? [];
    arr.push(item);
    autoByBird.set(item.birdId, arr);
  }
  const isMultiBird = birds.length > 1;

  function renderItem(itemKey: string, label: string, extra?: React.ReactNode) {
    const isChecked = checkedSet.has(itemKey);
    return (
      <div
        className={`flex items-start gap-2 rounded-lg px-2 py-2 ring-1 ring-sage-100 ${
          isChecked ? "bg-warn-green/5" : "bg-white"
        }`}
      >
        <button
          type="button"
          onClick={() => toggle(itemKey, !isChecked)}
          aria-pressed={isChecked}
          aria-label={isChecked ? `Uncheck: ${label}` : `Check off: ${label}`}
          className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md ring-1 transition-colors ${
            isChecked
              ? "bg-sage-600 ring-sage-600 text-white"
              : "bg-white ring-sage-300 text-transparent"
          }`}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs leading-snug ${
              isChecked ? "text-sage-600 line-through" : "text-sage-800"
            }`}
          >
            {label}
          </p>
          {extra}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-sage-100 bg-sage-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="size-4 text-sage-600" />
          ) : (
            <ChevronRight className="size-4 text-sage-600" />
          )}
          <span className="text-xs font-bold uppercase tracking-wider text-sage-700">
            Pre-leaving checklist
          </span>
        </div>
        <span className="text-[11px] font-semibold text-sage-600">
          {doneCount}/{totalCount}
        </span>
      </button>

      {open && (
        <div className="space-y-2 px-2 pb-3">
          {isLoading && <p className="px-2 py-1 text-xs text-sage-600">Loading…</p>}

          <ul className="space-y-1">
            {CHECKLIST_ITEMS.map((item) => (
              <li key={item.key}>
                {renderItem(
                  item.key,
                  item.label,
                  item.key === "emergency_contacts" && birds.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {birds.map((b) => (
                        <Link
                          key={b.id}
                          to="/birds/$birdId"
                          params={{ birdId: b.id }}
                          search={{ tab: "emergency" }}
                          className="inline-flex items-center gap-1 rounded-md bg-sage-100 px-1.5 py-0.5 text-[10px] font-semibold text-sage-700 hover:bg-sage-200"
                        >
                          {b.name}
                          <ExternalLink className="size-2.5" />
                        </Link>
                      ))}
                    </div>
                  ) : null,
                )}
              </li>
            ))}
          </ul>

          {autoItems.length > 0 && !isMultiBird && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 px-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-sage-600">
                <Sparkles className="size-3" /> From the care plan
              </div>
              <ul className="space-y-1">
                {autoItems.map((item) => (
                  <li key={item.key}>{renderItem(item.key, item.label)}</li>
                ))}
              </ul>
            </div>
          )}

          {autoItems.length > 0 && isMultiBird && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 px-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-sage-600">
                <Sparkles className="size-3" /> From the care plan
              </div>
              {birds.map((b) => {
                const items = autoByBird.get(b.id) ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={b.id} className="rounded-lg bg-white/70 p-2 ring-1 ring-sage-100">
                    <p className="px-1 pb-1 text-[11px] font-bold text-sage-700">{b.name}</p>
                    <ul className="space-y-1">
                      {items.map((item) => (
                        <li key={item.key}>{renderItem(item.key, item.label)}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
