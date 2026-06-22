import { useEffect, useState } from "react";
import { Check, ChevronDown, Plus, AlertTriangle } from "lucide-react";
import { FEED_PERIODS, normalizeFeedTimes, type FeedPeriod, type FeedTime } from "@/lib/feedTimes";
import { formatAmountUnit } from "@/lib/labels";
import {
  FOOD_UNITS,
  blankFoodItem,
  isFoodItemComplete,
  foodItemMissing,
  type FoodItem,
} from "@/lib/foodItems";

/**
 * Shared per-food-type item editor. Rendered identically by the guided wizard's
 * Food step and the tabbed editor's Food tab (both via FoodWaterStep) — one
 * source of truth so the two surfaces can't drift.
 *
 * Each selected food type gets a card with one or more item cards. An item card
 * is a clear white editable surface that's auto-expanded in a "needs details"
 * state, shows a live status pill (amber "Needs details" → green "Ready"), and
 * collapses to a one-line summary once complete. The wizard passes
 * `validationActive` (amber field highlights) and bumps `expandSignal` to force
 * every incomplete item open when Next is blocked. The tabbed editor passes
 * neither — same component, no gate.
 */

// Field styling per the design system (light fill, warm border, green focus).
const FIELD =
  "w-full rounded-xl border bg-[#fbfaf2] px-3 py-2.5 text-sm text-[#1a3d2e] outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/15";
const BORDER_OK = "border-[#c8bfa6]";
const BORDER_AMBER = "border-[#BA7517]";

function whenLabels(it: FoodItem): string {
  return normalizeFeedTimes(it.times)
    .map((t) => FEED_PERIODS.find((p) => p.value === t.period)?.label)
    .filter(Boolean)
    .join(", ");
}

function summaryLine(it: FoodItem): string {
  if (it.freeFed) return "Available all day.";
  return [formatAmountUnit(it.amount, it.unit), whenLabels(it)].filter(Boolean).join(" · ");
}

function toggleWhen(it: FoodItem, period: FeedPeriod): FeedTime[] {
  const times = normalizeFeedTimes(it.times);
  const has = times.some((t) => t.period === period);
  const next = has ? times.filter((t) => t.period !== period) : [...times, { period, at: null }];
  next.sort(
    (a, b) =>
      FEED_PERIODS.findIndex((x) => x.value === a.period) - FEED_PERIODS.findIndex((x) => x.value === b.period),
  );
  return next;
}

export function FoodItemsEditor({
  types,
  details,
  onChangeType,
  validationActive = false,
  expandSignal = 0,
  freshFoodOptions,
  freshOther,
  onFreshOtherChange,
}: {
  types: { value: string; label: string }[];
  details: Record<string, FoodItem[]>;
  onChangeType: (type: string, items: FoodItem[]) => void;
  validationActive?: boolean;
  expandSignal?: number;
  freshFoodOptions?: string[];
  freshOther?: string;
  onFreshOtherChange?: (v: string) => void;
}) {
  // Explicit expand/collapse overrides; default = expanded while incomplete.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const key = (type: string, idx: number) => `${type}:${idx}`;
  const isOpen = (type: string, idx: number, it: FoodItem) =>
    expanded[key(type, idx)] ?? !isFoodItemComplete(it);

  // When the wizard blocks Next, force every incomplete item open.
  useEffect(() => {
    if (!expandSignal) return;
    setExpanded((prev) => {
      const next = { ...prev };
      for (const t of types) {
        (details[t.value] ?? []).forEach((it, idx) => {
          if (!isFoodItemComplete(it)) next[key(t.value, idx)] = true;
        });
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal]);

  return (
    <div className="space-y-4">
      {types.map(({ value: type, label }) => {
        const items = details[type] ?? [];
        const isChop = !!freshFoodOptions && type === "chop";
        const selectedFresh = new Set(items.map((i) => i.name.trim().toLowerCase()));

        const setItem = (idx: number, patch: Partial<FoodItem>) =>
          onChangeType(type, items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

        const addItem = () => {
          onChangeType(type, [...items, blankFoodItem()]);
          // Collapse existing items; the new one (last) defaults open (incomplete).
          setExpanded((prev) => {
            const next = { ...prev };
            items.forEach((_, i) => { next[key(type, i)] = false; });
            return next;
          });
        };

        const removeItem = (idx: number) => onChangeType(type, items.filter((_, i) => i !== idx));

        return (
          <div key={type} className="rounded-2xl bg-[#efe9da] p-4">
            <p className="text-sm font-medium text-[#1a3d2e]">{label}</p>

            {isChop && (
              <div className="mt-2 rounded-xl bg-white/70 p-3" style={{ borderWidth: "0.5px", borderColor: "#d8cfb8" }}>
                <p className="mb-1.5 text-xs font-medium text-[#5f5e5a]">Fresh foods offered — tap to add as items</p>
                <div className="flex flex-wrap gap-1.5">
                  {freshFoodOptions!.map((f) => {
                    const on = selectedFresh.has(f.trim().toLowerCase());
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() =>
                          on
                            ? onChangeType(type, items.filter((i) => i.name.trim().toLowerCase() !== f.trim().toLowerCase()))
                            : onChangeType(type, [...items, { ...blankFoodItem(), name: f }])
                        }
                        className={
                          "min-h-[40px] rounded-full px-3 text-xs font-medium transition " +
                          (on ? "bg-[#1a3d2e] text-white" : "border border-[#c8bfa6] bg-white text-[#1a3d2e]")
                        }
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
                <input
                  className={`mt-2 ${FIELD} ${BORDER_OK}`}
                  placeholder="Other fresh foods (free text)"
                  value={freshOther ?? ""}
                  maxLength={300}
                  onChange={(e) => onFreshOtherChange?.(e.target.value)}
                />
              </div>
            )}

            <div className="mt-3 space-y-2">
              {items.map((it, idx) => {
                const complete = isFoodItemComplete(it);
                const miss = foodItemMissing(it);
                const open = isOpen(type, idx, it);
                const amber = (on: boolean) => (validationActive && on ? BORDER_AMBER : BORDER_OK);
                return (
                  <div
                    key={idx}
                    className="overflow-hidden rounded-xl bg-white"
                    style={{ borderWidth: "0.5px", borderColor: "#c8bfa6" }}
                  >
                    {/* Header — tap to expand/collapse */}
                    <button
                      type="button"
                      onClick={() => setExpanded((p) => ({ ...p, [key(type, idx)]: !open }))}
                      className="flex w-full items-center gap-2 px-3 py-3 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[#1a3d2e]">
                          {it.name.trim() || label}
                        </span>
                        <span className={`mt-0.5 block truncate text-xs ${complete ? "text-[#5f5e5a]" : "text-[#854F0B]"}`}>
                          {complete ? summaryLine(it) : "Tap to add the details your sitter needs."}
                        </span>
                      </span>
                      <StatusPill complete={complete} />
                      <ChevronDown className={`size-4 shrink-0 text-[#8a897f] transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>

                    {open && (
                      <div className="space-y-3 border-t border-[#ece6d6] px-3 pb-3 pt-3">
                        {/* Brand / name — required */}
                        <Field label="Brand or name" required>
                          <input
                            className={`${FIELD} ${amber(miss.brand)}`}
                            placeholder="e.g. Harrison's High Potency"
                            value={it.name}
                            maxLength={120}
                            onChange={(e) => setItem(idx, { name: e.target.value })}
                          />
                          {validationActive && miss.brand && <Helper>Add the brand or food name.</Helper>}
                        </Field>

                        {!it.freeFed && (
                          <>
                            {/* How much — number + unit, required */}
                            <Field label="How much?" required>
                              <div className="grid grid-cols-[1fr,1.3fr] gap-2">
                                <input
                                  className={`${FIELD} ${amber(miss.qty)}`}
                                  inputMode="decimal"
                                  placeholder="Amount"
                                  value={it.amount}
                                  onChange={(e) => setItem(idx, { amount: e.target.value.replace(/[^0-9.]/g, "") })}
                                />
                                <select
                                  className={`${FIELD} ${amber(miss.unit)} appearance-none`}
                                  value={it.unit}
                                  onChange={(e) => setItem(idx, { unit: e.target.value })}
                                >
                                  <option value="">Unit…</option>
                                  {/* keep any legacy unit selectable */}
                                  {it.unit && !FOOD_UNITS.includes(it.unit as any) && (
                                    <option value={it.unit}>{it.unit}</option>
                                  )}
                                  {FOOD_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                                </select>
                              </div>
                              {validationActive && (miss.qty || miss.unit) && <Helper>Add the amount and pick a unit.</Helper>}
                            </Field>

                            {/* When — period chips, required */}
                            <Field label="When?" required>
                              <div className="flex flex-wrap gap-1.5">
                                {FEED_PERIODS.map((p) => {
                                  const on = normalizeFeedTimes(it.times).some((t) => t.period === p.value);
                                  return (
                                    <button
                                      key={p.value}
                                      type="button"
                                      onClick={() => setItem(idx, { times: toggleWhen(it, p.value) })}
                                      className={
                                        "min-h-[44px] rounded-full px-4 text-sm font-medium transition " +
                                        (on
                                          ? "bg-[#1a3d2e] text-white"
                                          : `border bg-white text-[#1a3d2e] ${validationActive && miss.when ? BORDER_AMBER : "border-[#c8bfa6]"}`)
                                      }
                                    >
                                      {on ? "✓ " : ""}{p.label}
                                    </button>
                                  );
                                })}
                              </div>
                              {validationActive && miss.when && <Helper>Pick at least one feeding time.</Helper>}
                            </Field>
                          </>
                        )}

                        {/* Free-fed */}
                        <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm font-medium text-[#1a3d2e]">
                          <input
                            type="checkbox"
                            className="size-5 accent-[#1a3d2e]"
                            checked={!!it.freeFed}
                            onChange={(e) => setItem(idx, { freeFed: e.target.checked, ...(e.target.checked ? { times: [] } : {}) })}
                          />
                          Available all day / free-fed
                        </label>
                        {it.freeFed && (
                          <p className="rounded-xl bg-[#d6e8dc] px-3 py-2 text-xs text-[#1a3d2e]">
                            Left in the cage — no set amount or times needed.
                          </p>
                        )}

                        {/* Optional note */}
                        <Field label="Anything else?">
                          <textarea
                            className={`${FIELD} ${BORDER_OK} min-h-[64px] leading-relaxed`}
                            placeholder="Optional — any prep or serving details"
                            maxLength={300}
                            value={it.note ?? ""}
                            onChange={(e) => setItem(idx, { note: e.target.value || null })}
                          />
                        </Field>

                        {items.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-xs font-medium text-[#854F0B] underline"
                          >
                            Remove this item
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#2d6a4f] bg-transparent text-sm font-medium text-[#2d6a4f]"
            >
              <Plus className="size-4" /> Add another {label.toLowerCase()} item
            </button>
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ complete }: { complete: boolean }) {
  return complete ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#d6e8dc] px-2.5 py-1 text-[11px] font-medium text-[#1a3d2e]">
      <Check className="size-3" /> Ready
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f6e7c4] px-2.5 py-1 text-[11px] font-medium text-[#854F0B]">
      <AlertTriangle className="size-3" /> Needs details
    </span>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">
        {label}{required && <span className="text-[#BA7517]"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Helper({ children }: { children: React.ReactNode }) {
  return <span className="mt-1 block text-[11px] text-[#854F0B]">{children}</span>;
}
