import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
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

export function SitChecklist({ sitId, birds }: { sitId: string; birds: Bird[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["sit-checklist", sitId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sit_checklist_items")
        .select("item_key, checked")
        .eq("sit_id", sitId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const checkedSet = new Set(
    rows.filter((r: any) => r.checked).map((r: any) => r.item_key),
  );
  const doneCount = CHECKLIST_ITEMS.filter((i) => checkedSet.has(i.key)).length;
  const total = CHECKLIST_ITEMS.length;

  async function toggle(itemKey: string, nextChecked: boolean) {
    // Optimistic update so the tap feels instant.
    qc.setQueryData(["sit-checklist", sitId], (prev: any[] = []) => {
      const others = prev.filter((r) => r.item_key !== itemKey);
      return [...others, { item_key: itemKey, checked: nextChecked }];
    });
    const { error } = await supabase
      .from("sit_checklist_items")
      .upsert(
        { sit_id: sitId, item_key: itemKey, checked: nextChecked, checked_at: new Date().toISOString() },
        { onConflict: "sit_id,item_key" },
      );
    if (error) {
      toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["sit-checklist", sitId] });
    }
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
          {doneCount}/{total}
        </span>
      </button>

      {open && (
        <ul className="space-y-1 px-2 pb-3">
          {isLoading && (
            <li className="px-2 py-1 text-xs text-sage-600">Loading…</li>
          )}
          {!isLoading &&
            CHECKLIST_ITEMS.map((item) => {
              const isChecked = checkedSet.has(item.key);
              const isEmergency = item.key === "emergency_contacts";
              return (
                <li key={item.key}>
                  <div
                    className={`flex items-start gap-2 rounded-lg px-2 py-2 ${
                      isChecked ? "bg-warn-green/5" : "bg-white"
                    } ring-1 ring-sage-100`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(item.key, !isChecked)}
                      aria-pressed={isChecked}
                      aria-label={
                        isChecked
                          ? `Uncheck: ${item.label}`
                          : `Check off: ${item.label}`
                      }
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
                          isChecked
                            ? "text-sage-600 line-through"
                            : "text-sage-800"
                        }`}
                      >
                        {item.label}
                      </p>
                      {isEmergency && birds.length > 0 && (
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
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
