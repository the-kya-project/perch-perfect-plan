import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronRight, ExternalLink, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Bird = { id: string; name: string };

type StandardItem = { key: string; label: string };

export const CHECKLIST_ITEMS: StandardItem[] = [
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

type Row = {
  id?: string;
  item_key: string;
  checked: boolean;
  is_custom?: boolean;
  custom_label?: string | null;
};

export function SitChecklist({
  sit,
  birds,
  onSitChanged,
}: {
  sit: { id: string; start_date: string; end_date: string; sitter_name?: string | null; marked_ready_at?: string | null };
  birds: Bird[];
  onSitChanged?: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [confirmReady, setConfirmReady] = useState<null | { missing: { key: string; label: string }[] }>(null);

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

  const checkedSet = new Set(rows.filter((r) => r.checked).map((r) => r.item_key));
  const customRows = rows.filter((r) => r.is_custom);

  // Master list (standard items + the owner's custom additions) for progress
  // and the mark-ready check. Every item is treated the same.
  const allEntries: { key: string; label: string }[] = [
    ...CHECKLIST_ITEMS.map((i) => ({ key: i.key, label: i.label })),
    ...customRows.map((r) => ({
      key: r.item_key,
      label: r.custom_label ?? "Custom item",
    })),
  ];
  const totalCount = allEntries.length;
  const doneCount = allEntries.filter((e) => checkedSet.has(e.key)).length;
  const pct = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
  const itemsLeft = totalCount - doneCount;

  // Reminder banner — within 3 days of start, before the sit begins.
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(sit.start_date + "T00:00:00");
  const msPerDay = 86_400_000;
  const daysToStart = Math.round((start.getTime() - today.getTime()) / msPerDay);
  const showReminder = daysToStart >= 0 && daysToStart <= 3 && itemsLeft > 0;

  async function toggle(itemKey: string, nextChecked: boolean) {
    qc.setQueryData(["sit-checklist", sit.id], (prev: Row[] = []) => {
      const others = prev.filter((r) => r.item_key !== itemKey);
      const existing = prev.find((r) => r.item_key === itemKey);
      return [
        ...others,
        { ...(existing ?? { item_key: itemKey }), checked: nextChecked } as Row,
      ];
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

  async function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    const key = `custom:${crypto.randomUUID()}`;
    const { error } = await supabase.from("sit_checklist_items").insert({
      sit_id: sit.id,
      item_key: key,
      checked: false,
      is_custom: true,
      custom_label: label,
    });
    if (error) { toast.error(error.message); return; }
    setNewLabel("");
    setAdding(false);
    qc.invalidateQueries({ queryKey: ["sit-checklist", sit.id] });
  }

  async function removeCustom(rowId: string) {
    const { error } = await supabase.from("sit_checklist_items").delete().eq("id", rowId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["sit-checklist", sit.id] });
  }

  async function markReady(force = false) {
    const missing = allEntries
      .filter((e) => !checkedSet.has(e.key))
      .map((e) => ({ key: e.key, label: e.label }));
    if (!force && missing.length > 0) {
      setConfirmReady({ missing });
      return;
    }
    setConfirmReady(null);
    const { error } = await supabase
      .from("sits")
      .update({ marked_ready_at: new Date().toISOString() } as any)
      .eq("id", sit.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Marked ready. Just for your view — the sitter isn't notified yet.");
    onSitChanged?.();
  }

  async function unmarkReady() {
    const { error } = await supabase
      .from("sits")
      .update({ marked_ready_at: null } as any)
      .eq("id", sit.id);
    if (error) { toast.error(error.message); return; }
    onSitChanged?.();
  }

  function renderItem(
    itemKey: string,
    label: string,
    extra?: React.ReactNode,
    onRemove?: () => void,
  ) {
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
          <div className="flex items-start gap-1.5">
            <p
              className={`flex-1 text-xs leading-snug ${
                isChecked ? "text-sage-600 line-through" : "text-sage-800"
              }`}
            >
              {label}
            </p>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                className="shrink-0 rounded p-0.5 text-sage-400 hover:text-warn-red"
                aria-label={`Remove: ${label}`}
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
          {extra}
        </div>
      </div>
    );
  }

  const sitterLabel = sit.sitter_name && sit.sitter_name !== "__preview__" ? sit.sitter_name : "Your sitter";

  return (
    <div className="mt-3 rounded-xl border border-sage-100 bg-sage-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="size-4 text-sage-600" /> : <ChevronRight className="size-4 text-sage-600" />}
          <span className="text-xs font-bold uppercase tracking-wider text-sage-700">
            Pre-leaving checklist
          </span>
          {sit.marked_ready_at && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-warn-green/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warn-green">
              <CheckCircle2 className="size-2.5" /> Ready
            </span>
          )}
        </div>
        <span className="text-[11px] font-semibold text-sage-600">{doneCount}/{totalCount}</span>
      </button>

      {/* Always-visible progress bar */}
      <div className="mx-3 mb-1 h-1 overflow-hidden rounded-full bg-sage-100">
        <div
          className="h-full rounded-full bg-sage-600 transition-all"
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>

      {showReminder && (
        <div className="mx-3 mb-2 rounded-lg bg-warn-amber/10 px-3 py-2 ring-1 ring-warn-amber/30">
          <p className="text-[11px] font-semibold text-warn-amber">
            {sitterLabel} arrives in {daysToStart === 0 ? "today" : `${daysToStart} day${daysToStart === 1 ? "" : "s"}`} — {itemsLeft} prep item{itemsLeft === 1 ? "" : "s"} left
          </p>
        </div>
      )}

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
                          to="/birds/$birdId/plan"
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

          {customRows.length > 0 && (
            <div className="space-y-1">
              <div className="px-1 pt-1 text-[10px] font-bold uppercase tracking-wider text-sage-600">
                Your additions
              </div>
              <ul className="space-y-1">
                {customRows.map((r) => (
                  <li key={r.item_key}>
                    {renderItem(
                      r.item_key,
                      r.custom_label ?? "Custom item",
                      null,
                      r.id ? () => removeCustom(r.id!) : undefined,
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Add custom item */}
          {adding ? (
            <div className="space-y-2 rounded-lg bg-white p-2 ring-1 ring-sage-200">
              <input
                autoFocus
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="e.g. Top up humidifier"
                className="w-full rounded-md border border-sage-200 px-2 py-1.5 text-xs focus:border-sage-600 focus:outline-none"
                onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={addCustom}
                  disabled={!newLabel.trim()}
                  className="ml-auto rounded-md bg-sage-600 px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewLabel(""); }}
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-sage-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-sage-300 bg-white px-3 py-2 text-[11px] font-semibold text-sage-700 hover:bg-sage-50"
            >
              <Plus className="size-3" /> Add a custom item
            </button>
          )}

          {/* Mark ready */}
          <div className="pt-1">
            {sit.marked_ready_at ? (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-warn-green/10 px-3 py-2 ring-1 ring-warn-green/30">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-warn-green">
                  <CheckCircle2 className="size-3.5" />
                  Marked ready · only visible to you for now
                </div>
                <button
                  type="button"
                  onClick={unmarkReady}
                  className="text-[10px] font-semibold text-sage-600 underline"
                >
                  Undo
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => markReady(false)}
                className="w-full rounded-lg bg-sage-900 px-3 py-2 text-xs font-semibold text-white"
              >
                Mark ready
              </button>
            )}
          </div>
        </div>
      )}

      {/* Confirmation dialog for unchecked items */}
      {confirmReady && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setConfirmReady(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold">Mark ready anyway?</h3>
            <p className="mt-1 text-xs text-sage-600">
              A few items aren't checked off yet. Nothing is blocked — this is just for you.
            </p>
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto rounded-lg bg-sage-50 p-2">
              {confirmReady.missing.map((m) => (
                <li key={m.key} className="text-[11px] text-sage-800">• {m.label}</li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmReady(null)}
                className="flex-1 rounded-lg border border-sage-200 bg-white py-2 text-xs font-semibold text-sage-700"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => markReady(true)}
                className="flex-1 rounded-lg bg-sage-900 py-2 text-xs font-semibold text-white"
              >
                Mark ready anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
