import { useEffect, useState } from "react";
import { ChopIngredientPicker } from "./ChopIngredientPicker";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Check, ChevronDown, Plus, AlertTriangle, AlertCircle } from "lucide-react";
import { FEED_PERIODS, normalizeFeedTimes, type FeedPeriod, type FeedTime } from "@/lib/feedTimes";
import { formatAmountUnitDisplay } from "@/lib/labels";
import {
  FOOD_UNITS,
  HOMEMADE_CHOP_NAME,
  blankFoodItem,
  isFoodItemComplete,
  foodItemMissing,
  type FoodItem,
} from "@/lib/foodItems";
import { foodLabel } from "./foodLabels";

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
 * "Fresh chop / formulated" is special (ChopSection): pre-made items (brand
 * required), a single auto-named "Homemade chop" item with its ingredients,
 * or both. Which parts show follows the items the bird has.
 */

const FIELD =
  "w-full rounded-xl border bg-[#fbfaf2] px-3 py-2.5 text-sm text-[#1a3d2e] outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/15";
const BORDER_OK = "border-[#c8bfa6]";
const BORDER_AMBER = "border-[#BA7517]";

export type ChopConfig = {
  /** Removes the homemade item and its ingredients (the caller confirms first). */
  onRemoveHomemade: () => void;
  ingredients: string[];
  onToggleIngredient: (label: string) => void;
  /** The bird's never-feed list: searching one of these warns instead of adding. */
  neverFeed: string[];
  other: string;
  onOtherChange: (v: string) => void;
};

function whenLabels(t: TFunction, it: FoodItem): string {
  return normalizeFeedTimes(it.times)
    .map((ft) => FEED_PERIODS.find((p) => p.value === ft.period)?.label)
    .filter((l): l is string => !!l)
    .map((l) => foodLabel(t, l))
    .join(", ");
}

function summaryLine(t: TFunction, it: FoodItem): string {
  if (it.freeFed) return t("foodEditor.availableAllDaySentence", "Available all day.");
  return [formatAmountUnitDisplay(it.amount, it.unit, t), whenLabels(t, it)].filter(Boolean).join(" · ");
}

function toggleWhen(it: FoodItem, period: FeedPeriod): FeedTime[] {
  const times = normalizeFeedTimes(it.times);
  const has = times.some((ft) => ft.period === period);
  const next = has ? times.filter((ft) => ft.period !== period) : [...times, { period, at: null }];
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
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const k = (type: string, idx: number) => `${type}:${idx}`;
  const isOpen = (type: string, idx: number, it: FoodItem) => expanded[k(type, idx)] ?? !isFoodItemComplete(it);
  const setOpen = (type: string, idx: number, open: boolean) =>
    setExpanded((p) => ({ ...p, [k(type, idx)]: open }));

  useEffect(() => {
    if (!expandSignal) return;
    setExpanded((prev) => {
      const next = { ...prev };
      for (const ty of types) {
        (details[ty.value] ?? []).forEach((it, idx) => {
          if (!isFoodItemComplete(it)) next[k(ty.value, idx)] = true;
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
          return (
            <ChopSection
              key={type}
              items={items}
              onChange={(next) => onChangeType(type, next)}
              chop={chop}
              validationActive={validationActive}
            />
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
  const { t } = useTranslation();
  const complete = isFoodItemComplete(item);
  const miss = foodItemMissing(item);
  const amber = (on: boolean) => (validationActive && on ? BORDER_AMBER : BORDER_OK);

  return (
    <div className="overflow-hidden rounded-xl bg-white" style={{ borderWidth: "0.5px", borderColor: "#c8bfa6" }}>
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-2 px-3 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[#1a3d2e]">{item.name.trim() || label}</span>
          <span className={`mt-0.5 block truncate text-xs ${complete ? "text-[#5f5e5a]" : "text-[#854F0B]"}`}>
            {complete ? summaryLine(t, item) : t("foodEditor.tapToAddDetails", "Tap to add the details your sitter needs.")}
          </span>
        </span>
        <StatusPill complete={complete} />
        <ChevronDown className={`size-4 shrink-0 text-[#8a897f] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-[#ece6d6] px-3 pb-3 pt-3">
          {!hideBrand && (
            <Field label={t("foodEditor.brandOrName", "Brand or name")} required>
              <input
                className={`${FIELD} ${amber(miss.brand)}`}
                placeholder={t("foodEditor.brandPlaceholder", "e.g. Harrison's High Potency")}
                value={item.name}
                maxLength={120}
                onChange={(e) => onChange({ name: e.target.value })}
              />
              {validationActive && miss.brand && <Helper>{t("foodEditor.helperBrand", "Add the brand or food name.")}</Helper>}
            </Field>
          )}

          {!item.freeFed && (
            <>
              <Field label={t("foodEditor.howMuch", "How much?")} required>
                <div className="grid grid-cols-[1fr,1.3fr] gap-2">
                  <input
                    className={`${FIELD} ${amber(miss.qty)}`}
                    inputMode="decimal"
                    placeholder={t("foodEditor.amount", "Amount")}
                    value={item.amount}
                    onChange={(e) => onChange({ amount: e.target.value.replace(/[^0-9.]/g, "") })}
                  />
                  <select
                    className={`${FIELD} ${amber(miss.unit)} appearance-none`}
                    value={item.unit}
                    onChange={(e) => onChange({ unit: e.target.value })}
                  >
                    <option value="">{t("foodEditor.unitPlaceholder", "Unit…")}</option>
                    {item.unit && !FOOD_UNITS.includes(item.unit as any) && <option value={item.unit}>{item.unit}</option>}
                    {FOOD_UNITS.map((u) => <option key={u} value={u}>{foodLabel(t, u)}</option>)}
                  </select>
                </div>
                {validationActive && (miss.qty || miss.unit) && <Helper>{t("foodEditor.helperAmountUnit", "Add the amount and pick a unit.")}</Helper>}
              </Field>

              <Field label={t("foodEditor.when", "When?")} required>
                <div className="flex flex-wrap gap-1.5">
                  {FEED_PERIODS.map((p) => {
                    const on = normalizeFeedTimes(item.times).some((ft) => ft.period === p.value);
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
                        {on ? "✓ " : ""}{foodLabel(t, p.label)}
                      </button>
                    );
                  })}
                </div>
                {validationActive && miss.when && <Helper>{t("foodEditor.helperWhen", "Pick at least one feeding time.")}</Helper>}
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
            {t("foodEditor.availableAllDayFreeFed", "Available all day / free-fed")}
          </label>
          {item.freeFed && (
            <p className="rounded-xl bg-[#d6e8dc] px-3 py-2 text-xs text-[#1a3d2e]">
              {t("foodEditor.freeFedNote", "Left in the cage — no set amount or times needed.")}
            </p>
          )}

          <Field label={t("foodEditor.anythingElse", "Anything else?")}>
            <textarea
              className={`${FIELD} ${BORDER_OK} min-h-[64px] leading-relaxed`}
              placeholder={t("foodEditor.notePlaceholder", "Optional — any prep or serving details")}
              maxLength={300}
              value={item.note ?? ""}
              onChange={(e) => onChange({ note: e.target.value || null })}
            />
          </Field>

          {onRemove && (
            <button type="button" onClick={onRemove} className="text-xs font-medium text-[#854F0B] underline">
              {t("foodEditor.removeThisItem", "Remove this item")}
            </button>
          )}

          {/* Explicit collapse — feed cards never auto-collapse from edits. */}
          <button
            type="button"
            onClick={onLooksGood}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[11px] bg-[var(--ink)] px-3 py-2.5 text-[14px] font-[500] text-white active:scale-[0.99]"
          >
            <Check className="size-4" /> {t("foodEditor.looksGood", "Looks good")}
          </button>
        </div>
      )}
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#2d6a4f] bg-transparent text-sm font-medium text-[#2d6a4f]"
    >
      <Plus className="size-4" /> {t("foodEditor.addAnotherItem", "Add another {{type}} item", { type: label.toLowerCase() })}
    </button>
  );
}

function StatusPill({ complete }: { complete: boolean }) {
  const { t } = useTranslation();
  return complete ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#d6e8dc] px-2.5 py-1 text-[11px] font-medium text-[#1a3d2e]">
      <Check className="size-3" /> {t("foodEditor.pillReady", "Ready")}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f6e7c4] px-2.5 py-1 text-[11px] font-medium text-[#854F0B]">
      <AlertTriangle className="size-3" /> {t("foodEditor.pillNeedsDetails", "Needs details")}
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

// ---------- Fresh chop ----------

const C = { forest: "#1a3d2e", lime: "#cdeab0", helper: "#3d4f45", quiet: "#5f5e5a" };

function ChopTag({ complete }: { complete: boolean }) {
  const { t } = useTranslation();
  // On the lime chop card, Ready is forest with white text.
  return complete ? (
    <span className="inline-flex shrink-0 items-center rounded-full px-[10px] py-[5px] text-[12px] font-[700] leading-none text-white" style={{ background: C.forest }}>
      {t("setupUi.ready", "Ready")}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full bg-[#f6e7c4] px-[10px] py-[5px] text-[12px] font-[700] leading-none text-[#854f0b]">
      {t("setupUi.needsDetails", "Needs details")}
    </span>
  );
}

/** One food item as a row: name over its summary, with its status. Opens the sheet. */
function ItemRow({ item, name, onOpen, flat }: { item: FoodItem; name: string; onOpen: () => void; flat?: boolean }) {
  const { t } = useTranslation();
  const complete = isFoodItemComplete(item);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left ${flat ? "" : "rounded-[16px] bg-white"}`}
      style={{ color: C.forest }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-[700]">{name}</span>
        <span className="mt-0.5 block truncate text-[14px]" style={{ color: complete ? C.helper : "#854f0b" }}>
          {complete ? summaryLine(t, item) : t("foodEditor.tapToAddDetails", "Tap to add the details your sitter needs.")}
        </span>
      </span>
      <ChopTag complete={complete} />
    </button>
  );
}

/** Dashed "add" row used before a part has anything in it. */
function AddRow({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[60px] w-full items-center gap-3 rounded-[16px] border-2 border-dashed bg-white/50 px-4 py-3 text-left"
      style={{ borderColor: "rgba(26,61,46,0.4)", color: C.forest }}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: C.forest, color: C.lime }}>
        <Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[15.5px] font-[700]">{title}</span>
        <span className="block text-[13.5px]" style={{ color: C.helper }}>{detail}</span>
      </span>
    </button>
  );
}

/**
 * Fresh chop: a pre-made part (any number of branded items) and a homemade part
 * (one "Homemade chop" item plus its ingredients). Which parts are filled in
 * follows the bird's items — there's no separate pre-made/homemade choice.
 */
function ChopSection({ items, onChange, chop, validationActive }: {
  items: FoodItem[];
  onChange: (items: FoodItem[]) => void;
  chop: ChopConfig;
  validationActive: boolean;
}) {
  const { t } = useTranslation();
  const [sheetIdx, setSheetIdx] = useState<number | null>(null);
  const homemadeIdx = items.findIndex((it) => it.homemade);
  const premadeIdx = items.map((it, i) => (it.homemade ? -1 : i)).filter((i) => i >= 0);
  const needsDetails = items.length === 0 || items.some((it) => !isFoodItemComplete(it));

  const setItem = (idx: number, patch: Partial<FoodItem>) => onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const addPremade = () => {
    onChange([...items, { ...blankFoodItem(), homemade: false }]);
    setSheetIdx(items.length);
  };
  const addHomemade = () => {
    // The homemade item leads the list; pre-made items follow.
    onChange([{ ...blankFoodItem(), name: HOMEMADE_CHOP_NAME, homemade: true }, ...items]);
    setSheetIdx(null);
  };
  const sheetItem = sheetIdx != null ? items[sheetIdx] : undefined;

  return (
    <section className="flex flex-col gap-[14px] rounded-[18px] px-4 py-5" style={{ background: C.lime, color: C.forest }}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="m-0 text-[21px] font-[700] leading-[1.2]" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>
            {t("birdSetup.opt.freshChopFormulated", "Fresh chop / formulated")}
          </h3>
          {needsDetails && <ChopTag complete={false} />}
        </div>
        <p className="m-0 mt-1.5 text-[15px] leading-[1.5]">{t("foodEditor.chopHelper", "Add a pre-made chop, your own homemade mix, or both.")}</p>
      </div>

      {/* Pre-made */}
      {premadeIdx.length === 0 ? (
        <AddRow
          title={t("foodEditor.addPremadeChop", "Add a pre-made chop")}
          detail={t("foodEditor.addPremadeChopDetail", "A brand you buy, like Harrison's")}
          onClick={addPremade}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[14px] font-[700]">{t("foodEditor.preMade", "Pre-made")}</p>
          {premadeIdx.map((idx) => (
            <ItemRow
              key={idx}
              item={items[idx]}
              name={items[idx].name.trim() || t("foodEditor.preMadeChopItem", "Pre-made chop")}
              onOpen={() => setSheetIdx(idx)}
            />
          ))}
          <div>
            <button type="button" onClick={addPremade} className="inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-[700] text-[#2d6a4f]">
              <Plus className="size-4" strokeWidth={2.6} aria-hidden="true" /> {t("foodEditor.addAnotherPremadeChop", "Add another pre-made chop")}
            </button>
          </div>
          <hr className="m-0 border-0 border-t" style={{ borderColor: "rgba(26,61,46,0.15)" }} />
        </div>
      )}

      {/* Homemade */}
      {homemadeIdx < 0 ? (
        <AddRow
          title={t("foodEditor.addHomemadeChop", "Add your homemade chop")}
          detail={t("foodEditor.addHomemadeChopDetail", "What goes in it, how much, and when")}
          onClick={addHomemade}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[14px] font-[700]">{t("foodEditor.homemade", "Homemade")}</p>
          <div className="overflow-hidden rounded-[16px] bg-white">
            <ItemRow flat item={items[homemadeIdx]} name={t("foodEditor.homemadeChopItem", "Homemade chop")} onOpen={() => setSheetIdx(homemadeIdx)} />
            <hr className="m-0 border-0 border-t border-[#e3eae2]" />
            <div className="px-4 pb-3 pt-3.5">
              <ChopIngredientPicker
                ingredients={chop.ingredients}
                onToggle={chop.onToggleIngredient}
                other={chop.other}
                onOtherChange={chop.onOtherChange}
                neverFeed={chop.neverFeed}
                fieldClass={`${FIELD} ${BORDER_OK}`}
              />
              <button type="button" onClick={chop.onRemoveHomemade} className="mt-2 inline-flex min-h-[44px] items-center text-[15px] font-[700] text-[#2d6a4f]">
                {t("foodEditor.removeHomemadeChop", "Remove homemade chop")}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheetItem && sheetIdx != null && (
        <ItemSheet onClose={() => setSheetIdx(null)}>
          <ItemCard
            item={sheetItem}
            label={sheetItem.homemade ? t("foodEditor.homemadeChopItem", "Homemade chop") : t("foodEditor.preMadeChopItem", "Pre-made chop")}
            hideBrand={!!sheetItem.homemade}
            validationActive={validationActive}
            open
            onToggle={() => setSheetIdx(null)}
            onLooksGood={() => setSheetIdx(null)}
            onChange={(patch) => setItem(sheetIdx, patch)}
            setWhen={(period) => setItem(sheetIdx, { times: toggleWhen(sheetItem, period) })}
            onRemove={sheetItem.homemade ? undefined : () => { onChange(items.filter((_, i) => i !== sheetIdx)); setSheetIdx(null); }}
          />
        </ItemSheet>
      )}
    </section>
  );
}

/** Bottom sheet for editing one food item. */
function ItemSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button type="button" aria-label={t("foodEditor.closeSheet", "Close")} onClick={onClose} className="absolute inset-0 bg-[#1a3d2e]/40" />
      <div role="dialog" aria-modal="true" className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[26px] bg-white px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[#d5dfd5]" />
        {children}
      </div>
    </div>
  );
}
