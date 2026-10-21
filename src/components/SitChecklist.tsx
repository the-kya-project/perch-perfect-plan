import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { K } from "@/components/kya";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errorMessage";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

type Bird = { id: string; name: string };

type StandardItem = { key: string; label: string };

export const CHECKLIST_ITEMS: StandardItem[] = [
  { key: "first_aid", label: "First-aid kit stocked, and its location noted" },
  { key: "carrier", label: "Carrier clean and accessible" },
  { key: "food_portioned", label: "Enough food portioned for the full sit, plus extra" },
  { key: "enrichment", label: "Foraging toys and enrichment set up" },
  { key: "cage_clean", label: "Cage cleaned" },
  { key: "sitter_access", label: "Sitter has access (key, code, or entry plan)" },
  { key: "hazards", label: "Hazards handled (rooms closed, pets secured, windows checked)" },
  { key: "care_plans", label: "Care plans up to date" },
  { key: "emergency_contacts", label: "Emergency contacts confirmed current" },
  { key: "invite_tested", label: "Sitter link tested" },
];

// Items about the external sitter's link/access — not shown for household sits.
const SITTER_LINK_ITEMS = new Set(["sitter_access", "invite_tested"]);

// Labels above stay the English source (only item_key is stored); translate at display.
function itemLabel(t: TFunction, key: string, en: string): string {
  switch (key) {
    case "first_aid": return t("sitChecklist.item.firstAid", "First-aid kit stocked, and its location noted");
    case "carrier": return t("sitChecklist.item.carrier", "Carrier clean and accessible");
    case "food_portioned": return t("sitChecklist.item.foodPortioned", "Enough food portioned for the full sit, plus extra");
    case "enrichment": return t("sitChecklist.item.enrichment", "Foraging toys and enrichment set up");
    case "cage_clean": return t("sitChecklist.item.cageClean", "Cage cleaned");
    case "sitter_access": return t("sitChecklist.item.sitterAccess", "Sitter has access (key, code, or entry plan)");
    case "hazards": return t("sitChecklist.item.hazards", "Hazards handled (rooms closed, pets secured, windows checked)");
    case "care_plans": return t("sitChecklist.item.carePlans", "Care plans up to date");
    case "emergency_contacts": return t("sitChecklist.item.emergencyContacts", "Emergency contacts confirmed current");
    case "invite_tested": return t("sitChecklist.item.sitterLinkTested", "Sitter link tested");
    default: return en;
  }
}

type Row = {
  id?: string;
  item_key: string;
  checked: boolean;
  is_custom?: boolean;
  custom_label?: string | null;
};

// "Before you leave" — the owner's prep list for one sit, saved per sit in
// sit_checklist_items. Open until everything is done, then it folds to its
// title row ("All done"); tap the row to open it again.
export function SitChecklist({
  sit,
  birds,
}: {
  sit: { id: string; start_date: string; end_date: string; sitter_name?: string | null; caregiver_user_id?: string | null };
  birds: Bird[];
  onSitChanged?: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["sit-checklist", sit.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sit_checklist_items")
        .select("id, item_key, checked, is_custom, custom_label")
        .eq("sit_id", sit.id);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // A household sit has no sitter link, so the sitter-link items don't apply.
  // Completion is stored per item_key, so hiding them just leaves any old
  // ticks out of the count; nothing stored changes.
  const standardItems = sit.caregiver_user_id ? CHECKLIST_ITEMS.filter((i) => !SITTER_LINK_ITEMS.has(i.key)) : CHECKLIST_ITEMS;
  const checkedSet = new Set(rows.filter((r) => r.checked).map((r) => r.item_key));
  const customRows = rows.filter((r) => r.is_custom);
  const allEntries: { key: string; label: string }[] = [
    ...standardItems.map((i) => ({ key: i.key, label: itemLabel(t, i.key, i.label) })),
    ...customRows.map((r) => ({ key: r.item_key, label: r.custom_label ?? t("sitChecklist.customItem", "Custom item") })),
  ];
  const totalCount = allEntries.length;
  const doneCount = allEntries.filter((e) => checkedSet.has(e.key)).length;
  const allDone = !isLoading && totalCount > 0 && doneCount === totalCount;
  const open = openOverride ?? !allDone;
  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);

  async function toggle(itemKey: string, nextChecked: boolean) {
    qc.setQueryData(["sit-checklist", sit.id], (prev: Row[] = []) => {
      const others = prev.filter((r) => r.item_key !== itemKey);
      const existing = prev.find((r) => r.item_key === itemKey);
      return [...others, { ...(existing ?? { item_key: itemKey }), checked: nextChecked } as Row];
    });
    const { error } = await supabase
      .from("sit_checklist_items")
      .upsert(
        { sit_id: sit.id, item_key: itemKey, checked: nextChecked, checked_at: new Date().toISOString() },
        { onConflict: "sit_id,item_key" },
      );
    if (error) {
      toast.error(friendlyError(error));
      qc.invalidateQueries({ queryKey: ["sit-checklist", sit.id] });
    }
  }

  async function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    const key = `custom:${crypto.randomUUID()}`;
    const { error } = await supabase.from("sit_checklist_items").insert({
      sit_id: sit.id, item_key: key, checked: false, is_custom: true, custom_label: label,
    });
    if (error) { toast.error(friendlyError(error)); return; }
    setNewLabel("");
    setAdding(false);
    qc.invalidateQueries({ queryKey: ["sit-checklist", sit.id] });
  }

  async function removeCustom(rowId: string) {
    const { error } = await supabase.from("sit_checklist_items").delete().eq("id", rowId);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["sit-checklist", sit.id] });
  }

  const linkPill = "mt-1 inline-flex min-h-[44px] items-center rounded-full px-3.5 text-[13.5px] font-[700]";
  function birdLinks(key: string) {
    if (!birds.length || (key !== "care_plans" && key !== "emergency_contacts")) return null;
    return (
      <span className="flex flex-wrap gap-1.5">
        {birds.map((b) => key === "care_plans" ? (
          <Link key={b.id} to="/birds/$birdId/plan" params={{ birdId: b.id }} className={linkPill} style={{ background: "#fff", color: K.moss }}>
            {t("sitChecklist.openCarePlan", "Open {{name}}'s care plan →", { name: b.name })}
          </Link>
        ) : (
          <Link key={b.id} to="/birds/$birdId/emergency" params={{ birdId: b.id }} className={linkPill} style={{ background: "#fff", color: K.moss }}>
            {birds.length > 1 ? t("sitChecklist.checkBirdContacts", "Check {{name}}'s contacts →", { name: b.name }) : t("sitChecklist.checkContacts", "Check contacts →")}
          </Link>
        ))}
      </span>
    );
  }

  function item(key: string, label: string, onRemove?: () => void) {
    const done = checkedSet.has(key);
    return (
      <li key={key} className="flex items-start gap-3 py-1.5">
        <button
          type="button"
          onClick={() => toggle(key, !done)}
          aria-pressed={done}
          aria-label={done ? t("sitChecklist.uncheckAria", "Uncheck: {{label}}", { label }) : t("sitChecklist.checkOffAria", "Check off: {{label}}", { label })}
          className="flex min-h-[48px] min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full border-2" style={done ? { background: K.forest, borderColor: K.forest, color: "#fff" } : { background: "#fff", borderColor: "#b9c7ba" }} aria-hidden="true">
            {done && <Check className="size-4" strokeWidth={3} />}
          </span>
          <span className={`text-[15px] leading-[1.4] ${done ? "line-through" : ""}`} style={{ color: done ? K.quiet : K.forest }}>{label}</span>
        </button>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={t("sitChecklist.removeAria", "Remove: {{label}}", { label })} className="grid size-11 shrink-0 place-items-center rounded-full" style={{ color: K.quiet }}>
            <X className="size-4" />
          </button>
        )}
      </li>
    );
  }

  return (
    <div className="mt-3 rounded-[16px] p-3.5" style={{ background: K.mist, color: K.forest }}>
      <button type="button" onClick={() => setOpenOverride(!open)} aria-expanded={open} className="flex min-h-[44px] w-full items-center gap-2 text-left">
        <span className="flex-1 text-[15px] font-[700]">{t("sitChecklist.beforeYouLeave", "Before you leave")}</span>
        <span className="text-[13px] font-[700]" style={{ color: K.quiet }}>
          {allDone ? t("sitChecklist.allDone", "All done") : t("sitChecklist.doneOfTotal", "{{done}} of {{total}} done", { done: doneCount, total: totalCount })}
        </span>
        <ChevronDown className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: K.quiet }} aria-hidden="true" />
      </button>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "#d6dfd5" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: K.forest }} />
      </div>

      {open && (
        <div className="mt-2">
          {isLoading && <p className="m-0 py-2 text-[14px]" style={{ color: K.quiet }}>{t("sitChecklist.loading", "Loading…")}</p>}
          <ul className="m-0 list-none p-0">
            {standardItems.map((i) => (
              <div key={i.key}>
                {item(i.key, itemLabel(t, i.key, i.label))}
                {(i.key === "care_plans" || i.key === "emergency_contacts") && birds.length > 0 && (
                  <div className="-mt-1 mb-1 pl-10">{birdLinks(i.key)}</div>
                )}
              </div>
            ))}
            {customRows.map((r) => item(r.item_key, r.custom_label ?? t("sitChecklist.customItem", "Custom item"), r.id ? () => removeCustom(r.id!) : undefined))}
          </ul>

          {adding ? (
            <div className="mt-2 flex flex-col gap-2">
              <input
                autoFocus
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={t("sitChecklist.customPlaceholder", "e.g. Top up humidifier")}
                aria-label={t("sitChecklist.addYourOwnItem", "Add your own item")}
                className="h-12 w-full rounded-full border-2 bg-white px-[18px] text-[16px] outline-none focus:border-[#1a3d2e]"
                style={{ borderColor: "#d6dfd5", color: K.forest }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
              />
              <div className="flex gap-2">
                <button type="button" onClick={addCustom} disabled={!newLabel.trim()} className="min-h-[44px] flex-1 rounded-full border-2 text-[15px] font-[700] disabled:opacity-45" style={{ background: K.forest, borderColor: K.forest, color: "#fff" }}>
                  {t("sitChecklist.add", "Add")}
                </button>
                <button type="button" onClick={() => { setAdding(false); setNewLabel(""); }} className="min-h-[44px] rounded-full px-4 text-[15px] font-[700]" style={{ color: K.quiet }}>
                  {t("sitChecklist.cancel", "Cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-full border-2 border-dashed bg-white/60 text-[15px] font-[700]" style={{ borderColor: "#9fb3a3", color: K.forest }}>
              <Plus className="size-4" /> {t("sitChecklist.addYourOwnItem", "Add your own item")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
