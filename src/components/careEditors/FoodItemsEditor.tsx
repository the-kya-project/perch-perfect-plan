import { useEffect, useState } from "react";
import { Check, ChevronDown, Plus, AlertTriangle, AlertCircle } from "lucide-react";
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
 * Each selected type gets a card with one or more clear white item cards that
 * auto-expand in a "needs details" state, show a live status pill, and collapse
 * to a one-line summary once complete. `validationActive` turns on amber field
 * highlights; bumping `expandSignal` force-opens every incomplete item.
 *
 * "Fresh chop / formulated" is special: the owner first picks Pre-made (brand
 * required) or Homemade (an ingredient checklist + a single auto-named
 * "Homemade chop" item with no brand required).
 */

const FIELD =
  "w-full rounded-xl border bg-[#fbfaf2] px-3 py-2.5 text-sm text-[#1a3d2e] outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/15";
const BORDER_OK = "border-[#c8bfa6]";
const BORDER_AMBER = "border-[#BA7517]";

export type ChopConfig = {
  mode: "premade" | "homemade" | null;
  onChooseMode: (mode: "premade" | "homemade") => void;
  ingredients: string[];
  onToggleIngredient: (label: string) => void;
  options: string[];
  other: string;
  onOtherChange: (v: string) => void;
};

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
  chop,
}: {
  types: { value: string; label: string }[];
  details: Record<string, FoodItem[]>;
  onChangeType: (type: string, items: FoodItem[]) => void;
  validationActive?: boolean;
  expandSignal?: number;
  chop?: ChopConfig;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const k = (type: string, idx: number) => `${type}:${idx}`;
  const isOpen = (type: string, idx: number, it: FoodItem) => expanded[k(type, idx)] ?? !isFoodItemComplete(it);
  const setOpen = (type: string, idx: number, open: boolean) =>
    setExpanded((p) => ({ ...p, [k(type, idx)]: open }));

  useEffect(() => {
    if (!expandSignal) return;
    setExpanded((prev) => {
      const next = { ...prev };
      for (const t of types) {
        (details[t.value] ?? []).forEach((it, idx) => {
          if (!isFoodItemComplete(it)) next[k(t.value, idx)] = true;
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
        // Editing an item PINS it open — feed cards never auto-collapse from
        // internal interactions (a timing tap that completes the item used to
        // flip the derived open state shut). Collapse happens only via the
        // explicit "Looks good" button (or tapping the header).
        const setItem = (idx: number, patch: Partial<FoodItem>) => {
          onChangeType(type, items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
          setOpen(type, idx, true);
        };
        const addItem = () => {
          onChangeType(type, [...items, blankFoodItem()]);
          setExpanded((prev) => { const n = { ...prev }; items.forEach((_, i) => { n[k(type, i)] = false; }); return n; });
        };
        const removeItem = (idx: number) => onChangeType(type, items.filter((_, i) => i !== idx));

        if (type === "chop" && chop) {
          const picked = chop.mode !== null;
          return (
            <div key={type} className="rounded-[16px] border border-[var(--line)] bg-[var(--cream2)] p-4">
              {/* Question header + status pill */}
              <div className="flex items-center justify-between gap-2">
                <p className="text-[16px] font-[500] text-[var(--ink)]">What kind of fresh chop?</p>
                {picked ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--lime)] px-2.5 py-1 text-[11px] font-[500] text-[var(--ink)]">
                    <Check className="size-3" /> Set
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--amber-fill)] px-2.5 py-1 text-[11px] font-[500] text-[var(--amber-ink)]">
                    <AlertCircle className="size-3" /> Pick one
                  </span>
                )}
              </div>
              <p className="mt-1 text-[12.5px] leading-[1.5] text-[var(--mute)]">So the caregiver knows what to prep.</p>

              {/* Two compact option cards */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["premade", "homemade"] as const).map((m) => {
                  const sel = chop.mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => chop.onChooseMode(m)}
                      className={
                        "relative grid min-h-[52px] place-items-center rounded-[13px] p-[14px] text-[14px] font-[500] text-[var(--ink)] transition " +
                        (sel ? "border-2 border-[var(--ink)] bg-[var(--lime)]" : "border border-[var(--line)] bg-white")
                      }
                    >
                      {m === "premade" ? "Pre-made" : "Homemade"}
                      {sel && (
                        <span className="absolute -right-1.5 -top-1.5 grid size-[18px] place-items-center rounded-full bg-[var(--ink)] text-[var(--lime)]">
                          <Check className="size-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Homemade follow-up: ingredient checklist + single auto-named item */}
              {chop.mode === "homemade" && (
                <>
                  <div className="mt-3 rounded-xl bg-white/70 p-3" style={{ borderWidth: "0.5px", borderColor: "#d8cfb8" }}>
                    <p className="mb-1.5 text-xs font-medium text-[#5f5e5a]">What's in it? Tap the ingredients.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {chop.options.map((f) => {
                        const on = chop.ingredients.some((x) => x.toLowerCase() === f.toLowerCase());
                        return (
                          <button
                            key={f}
                            type="button"
                            onClick={() => chop.onToggleIngredient(f)}
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
                      placeholder="Other ingredients (free text)"
                      value={chop.other}
                      maxLength={300}
                      onChange={(e) => chop.onOtherChange(e.target.value)}
                    />
                  </div>
                  {items.length > 0 && (
                    <div className="mt-3">
                      <ItemCard
                        item={items[0]}
                        label={label}
                        hideBrand
                        validationActive={validationActive}
                        open={isOpen(type, 0, items[0])}
                        onToggle={() => setOpen(type, 0, !isOpen(type, 0, items[0]))}
                        onLooksGood={() => setOpen(type, 0, false)}
                        onChange={(patch) => setItem(0, patch)}
                        setWhen={(period) => setItem(0, { times: toggleWhen(items[0], period) })}
                      />
                    </div>
                  )}
                </>
              )}

              {/* Pre-made follow-up: brand-required item cards */}
              {chop.mode === "premade" && (
                <>
                  <div className="mt-3 space-y-2">
                    {items.map((it, idx) => (
                      <ItemCard
                        key={idx}
                        item={it}
                        label={label}
                        validationActive={validationActive}
                        open={isOpen(type, idx, it)}
                        onToggle={() => setOpen(type, idx, !isOpen(type, idx, it))}
                        onLooksGood={() => setOpen(type, idx, false)}
                        onChange={(patch) => setItem(idx, patch)}
                        setWhen={(period) => setItem(idx, { times: toggleWhen(it, period) })}
                        onRemove={items.length > 1 ? () => removeItem(idx) : undefined}
                      />
                    ))}
                  </div>
                  <AddButton label={label} onClick={addItem} />
                </>
              )}
            </div>
          );
        }

        // Generic type (pelleted, seed, blend, other)
        return (
          <div key={type} className="rounded-2xl bg-[#efe9da] p-4">
            <p className="text-sm font-medium text-[#1a3d2e]">{label}</p>
            <div className="mt-3 space-y-2">
              {items.map((it, idx) => (
                <ItemCard
                  key={idx}
                  item={it}
                  label={label}
                  validationActive={validationActive}
                  open={isOpen(type, idx, it)}
                  onToggle={() => setOpen(type, idx, !isOpen(type, idx, it))}
                  onLooksGood={() => setOpen(type, idx, false)}
                  onChange={(patch) => setItem(idx, patch)}
                  setWhen={(period) => setItem(idx, { times: toggleWhen(it, period) })}
                  onRemove={items.length > 1 ? () => removeItem(idx) : undefined}
                />
              ))}
            </div>
            <AddButton label={label} onClick={addItem} />
          </div>
        );
      })}
    </div>
  );
}

function ItemCard({
  item,
  label,
  hideBrand,
  validationActive,
  open,
  onToggle,
  onLooksGood,
  onChange,
  setWhen,
  onRemove,
}: {
  item: FoodItem;
  label: string;
  hideBrand?: boolean;
  validationActive: boolean;
  open: boolean;
  onToggle: () => void;
  onLooksGood: () => void;
  onChange: (patch: Partial<FoodItem>) => void;
  setWhen: (period: FeedPeriod) => void;
  onRemove?: () => void;
}) {
  const complete = isFoodItemComplete(item);
  const miss = foodItemMissing(item);
  const amber = (on: boolean) => (validationActive && on ? BORDER_AMBER : BORDER_OK);

  return (
    <div className="overflow-hidden rounded-xl bg-white" style={{ borderWidth: "0.5px", borderColor: "#c8bfa6" }}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[#1a3d2e]">{item.name.trim() || label}</span>
          <span className={`mt-0.5 block truncate text-xs ${complete ? "text-[#5f5e5a]" : "text-[#854F0B]"}`}>
            {complete ? summaryLine(item) : "Tap to add the details your sitter needs."}
          </span>
        </span>
        <StatusPill complete={complete} />
        <ChevronDown className={`size-4 shrink-0 text-[#8a897f] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-[#ece6d6] px-3 pb-3 pt-3">
          {!hideBrand && (
            <Field label="Brand or name" required>
              <input
                className={`${FIELD} ${amber(miss.brand)}`}
                placeholder="e.g. Harrison's High Potency"
                value={item.name}
                maxLength={120}
                onChange={(e) => onChange({ name: e.target.value })}
              />
              {validationActive && miss.brand && <Helper>Add the brand or food name.</Helper>}
            </Field>
          )}

          {!item.freeFed && (
            <>
              <Field label="How much?" required>
                <div className="grid grid-cols-[1fr,1.3fr] gap-2">
                  <input
                    className={`${FIELD} ${amber(miss.qty)}`}
                    inputMode="decimal"
                    placeholder="Amount"
                    value={item.amount}
                    onChange={(e) => onChange({ amount: e.target.value.replace(/[^0-9.]/g, "") })}
                  />
                  <select
                    className={`${FIELD} ${amber(miss.unit)} appearance-none`}
                    value={item.unit}
                    onChange={(e) => onChange({ unit: e.target.value })}
                  >
                    <option value="">Unit…</option>
                    {item.unit && !FOOD_UNITS.includes(item.unit as any) && <option value={item.unit}>{item.unit}</option>}
                    {FOOD_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                {validationActive && (miss.qty || miss.unit) && <Helper>Add the amount and pick a unit.</Helper>}
              </Field>

              <Field label="When?" required>
                <div className="flex flex-wrap gap-1.5">
                  {FEED_PERIODS.map((p) => {
                    const on = normalizeFeedTimes(item.times).some((t) => t.period === p.value);
                    return (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setWhen(p.value)}
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

          <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm font-medium text-[#1a3d2e]">
            <input
              type="checkbox"
              className="size-5 accent-[#1a3d2e]"
              checked={!!item.freeFed}
              onChange={(e) => onChange({ freeFed: e.target.checked, ...(e.target.checked ? { times: [] } : {}) })}
            />
            Available all day / free-fed
          </label>
          {item.freeFed && (
            <p className="rounded-xl bg-[#d6e8dc] px-3 py-2 text-xs text-[#1a3d2e]">
              Left in the cage — no set amount or times needed.
            </p>
          )}

          <Field label="Anything else?">
            <textarea
              className={`${FIELD} ${BORDER_OK} min-h-[64px] leading-relaxed`}
              placeholder="Optional — any prep or serving details"
              maxLength={300}
              value={item.note ?? ""}
              onChange={(e) => onChange({ note: e.target.value || null })}
            />
          </Field>

          {onRemove && (
            <button type="button" onClick={onRemove} className="text-xs font-medium text-[#854F0B] underline">
              Remove this item
            </button>
          )}

          {/* Explicit collapse — feed cards never auto-collapse from edits. */}
          <button
            type="button"
            onClick={onLooksGood}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[11px] bg-[var(--ink)] px-3 py-2.5 text-[14px] font-[500] text-white active:scale-[0.99]"
          >
            <Check className="size-4" /> Looks good
          </button>
        </div>
      )}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#2d6a4f] bg-transparent text-sm font-medium text-[#2d6a4f]"
    >
      <Plus className="size-4" /> Add another {label.toLowerCase()} item
    </button>
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
