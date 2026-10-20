import { useEffect, useState } from "react";
import { ChopIngredientPicker } from "./ChopIngredientPicker";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Clock, Plus, X } from "lucide-react";
import { FEED_PERIODS, formatAt, normalizeFeedTimes, type FeedPeriod, type FeedTime } from "@/lib/feedTimes";
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
import { BottomSheet as ItemSheet } from "@/components/setup/BottomSheet";
import { S, SERIF, SetupPrimaryButton, SetupTextButton, Field, TextField, TextBox, Dropdown, CheckChips, Switch } from "@/components/setup/controls";

/**
 * Shared per-food-type item editor, used by the walkthrough's Food step and the
 * plan editor's Food tab (both via FoodWaterStep), so the two can't drift.
 *
 * Each selected type is its own lime card of item rows (name, one-line summary,
 * Ready / Needs details). Every item, chop included, is edited in one shared
 * bottom sheet. `validationActive` turns on the missing-field flags; bumping
 * `expandSignal` opens the first incomplete item's sheet.
 *
 * "Fresh chop / formulated" is special (ChopSection): pre-made items (brand
 * required), a single auto-named "Homemade chop" item with its ingredients,
 * or both. Which parts show follows the items the bird has.
 */

// Old-style field look, still used by the chop ingredient search.
const FIELD =
  "w-full rounded-xl border bg-[#fbfaf2] px-3 py-2.5 text-sm text-[#1a3d2e] outline-none focus:border-[#2d6a4f] focus:ring-2 focus:ring-[#2d6a4f]/15";
const BORDER_OK = "border-[#c8bfa6]";
const NEEDS_BORDER = "#e0b96a";

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

/** Which item is open in the sheet. */
type SheetRef = { type: string; idx: number };

/** Per-type wording: add links, the first-item row and a new item's title. */
function typeWords(t: TFunction, type: string) {
  switch (type) {
    case "pelleted": return {
      another: t("foodEditor.addAnotherPellet", "Add another pellet"),
      first: t("foodEditor.addFirstPellet", "Add your first pellet"),
      fresh: t("foodEditor.newPellet", "New pellet"),
    };
    case "seed": return {
      another: t("foodEditor.addAnotherSeedMix", "Add another seed mix"),
      first: t("foodEditor.addFirstSeedMix", "Add your first seed mix"),
      fresh: t("foodEditor.newSeedMix", "New seed mix"),
    };
    case "pellet_seed": return {
      another: t("foodEditor.addAnotherBlend", "Add another blend"),
      first: t("foodEditor.addFirstBlend", "Add your first blend"),
      fresh: t("foodEditor.newBlend", "New blend"),
    };
    case "chop": return {
      another: t("foodEditor.addAnotherPremadeChop", "Add another pre-made chop"),
      first: t("foodEditor.addPremadeChop", "Add a pre-made chop"),
      fresh: t("foodEditor.newPremadeChop", "New pre-made chop"),
    };
    default: return {
      another: t("foodEditor.addAnotherFood", "Add another food"),
      first: t("foodEditor.addFirstFood", "Add your first food"),
      fresh: t("foodEditor.newFood", "New food"),
    };
  }
}

function whenLabels(t: TFunction, it: FoodItem): string {
  return normalizeFeedTimes(it.times)
    .map((ft) => FEED_PERIODS.find((p) => p.value === ft.period)?.label)
    .filter((l): l is string => !!l)
    .map((l) => foodLabel(t, l))
    .join(", ");
}

function summaryLine(t: TFunction, it: FoodItem): string {
  if (it.freeFed) return t("foodEditor.summaryAllDay", "Available all day");
  return [formatAmountUnitDisplay(it.amount, it.unit, t), whenLabels(t, it)].filter(Boolean).join(" · ");
}

/** What an incomplete item still needs, as one short line. */
function missingLine(t: TFunction, it: FoodItem): string {
  const m = foodItemMissing(it);
  const brand = m.brand;
  const qty = m.qty || m.unit;
  const when = m.when;
  if (brand && qty && when) return t("foodEditor.missingAll", "Add the brand, how much, and when");
  if (brand && qty) return t("foodEditor.missingBrandQty", "Add the brand and how much");
  if (brand && when) return t("foodEditor.missingBrandWhen", "Add the brand and when");
  if (qty && when) return t("foodEditor.missingQtyWhen", "Add how much and when");
  if (brand) return t("foodEditor.missingBrand", "Add the brand");
  if (qty) return t("foodEditor.missingQty", "Add how much");
  return t("foodEditor.missingWhen", "Add when it's served");
}

export function FoodItemsEditor({
  types,
  details,
  onChangeType,
  validationActive = false,
  expandSignal = 0,
  chop,
  otherDescription,
}: {
  /** Selected types, in the order their cards show. */
  types: { value: string; label: string }[];
  details: Record<string, FoodItem[]>;
  onChangeType: (type: string, items: FoodItem[]) => void;
  validationActive?: boolean;
  expandSignal?: number;
  chop?: ChopConfig;
  /** "Describe the other diet", shown at the top of the Other card. */
  otherDescription?: { value: string; onChange: (v: string) => void };
}) {
  const { t } = useTranslation();
  const [sheet, setSheet] = useState<SheetRef | null>(null);

  // Next pressed with incomplete items: open the first one's sheet.
  useEffect(() => {
    if (!expandSignal) return;
    for (const { value: type } of types) {
      const idx = (details[type] ?? []).findIndex((it) => !isFoodItemComplete(it));
      if (idx >= 0) { setSheet({ type, idx }); return; }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandSignal]);

  const addItem = (type: string, item: FoodItem = blankFoodItem()) => {
    const items = details[type] ?? [];
    onChangeType(type, [...items, item]);
    setSheet({ type, idx: items.length });
  };

  const sheetItems = sheet ? details[sheet.type] ?? [] : [];
  const sheetItem = sheet ? sheetItems[sheet.idx] : undefined;
  const sheetTypeLabel = sheet
    ? sheet.type === "other"
      ? otherDescription?.value.trim() || types.find((x) => x.value === "other")?.label || ""
      : types.find((x) => x.value === sheet.type)?.label ?? ""
    : "";
  // Chop pre-made items can always be removed (the pre-made part can be empty);
  // other types keep at least one item.
  const canRemove = !!sheetItem && !sheetItem.homemade && (sheet!.type === "chop" || sheetItems.length > 1);

  return (
    <>
      {types.map(({ value: type, label }) => {
        const items = details[type] ?? [];

        if (type === "chop" && chop) {
          return (
            <ChopSection
              key={type}
              items={items}
              onChange={(next) => onChangeType(type, next)}
              chop={chop}
              onOpen={(idx) => setSheet({ type, idx })}
              onAddPremade={() => addItem(type, { ...blankFoodItem(), homemade: false })}
            />
          );
        }

        const words = typeWords(t, type);
        return (
          <section key={type} className="flex flex-col gap-3 rounded-[18px] px-4 py-5" style={{ background: S.lime, color: S.forest }}>
            <h2 className="m-0 text-[20px] font-[700] leading-[1.2]" style={{ fontFamily: SERIF }}>{label}</h2>
            {type === "other" && otherDescription && (
              <TextField
                value={otherDescription.value}
                onChange={otherDescription.onChange}
                maxLength={200}
                ariaLabel={t("birdSetup.describeTheOtherDiet", "Describe the other diet")}
                placeholder={t("birdSetup.describeTheOtherDiet", "Describe the other diet")}
              />
            )}
            {items.length === 0 ? (
              <AddRow title={words.first} detail={t("foodEditor.brandHowMuchWhen", "Brand, how much, and when")} onClick={() => addItem(type)} />
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {items.map((it, idx) => (
                    <ItemRow key={idx} item={it} name={it.name.trim() || label} onOpen={() => setSheet({ type, idx })} />
                  ))}
                </div>
                <div>
                  <SetupTextButton onClick={() => addItem(type)} icon={<Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />}>
                    {words.another}
                  </SetupTextButton>
                </div>
              </>
            )}
          </section>
        );
      })}

      {sheet && sheetItem && (
        <ItemSheet onClose={() => setSheet(null)}>
          <ItemSheetBody
            item={sheetItem}
            typeLabel={sheetItem.homemade ? t("birdSetup.opt.freshChopFormulated", "Fresh chop / formulated") : sheetTypeLabel}
            freshTitle={sheetItem.homemade ? t("foodEditor.homemadeChopItem", "Homemade chop") : typeWords(t, sheet.type).fresh}
            validationActive={validationActive}
            onChange={(patch) => onChangeType(sheet.type, sheetItems.map((it, i) => (i === sheet.idx ? { ...it, ...patch } : it)))}
            onDone={() => setSheet(null)}
            onRemove={canRemove ? () => { onChangeType(sheet.type, sheetItems.filter((_, i) => i !== sheet.idx)); setSheet(null); } : undefined}
          />
        </ItemSheet>
      )}
    </>
  );
}

function ReadyTag({ complete }: { complete: boolean }) {
  const { t } = useTranslation();
  // On lime cards, Ready is forest with white text.
  return complete ? (
    <span className="inline-flex shrink-0 items-center rounded-full px-[10px] py-[5px] text-[12px] font-[700] leading-none text-white" style={{ background: S.forest }}>
      {t("setupUi.ready", "Ready")}
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center rounded-full px-[10px] py-[5px] text-[12px] font-[700] leading-none" style={{ background: S.amberBg, color: S.amberText }}>
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
      className={`flex min-h-[62px] w-full items-center gap-3 px-4 py-3 text-left ${flat ? "" : "rounded-[16px] border-2 bg-white"}`}
      style={{ color: S.forest, borderColor: flat ? undefined : complete ? "#fff" : NEEDS_BORDER }}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15.5px] font-[700]">{name}</span>
        <span className="mt-0.5 block truncate text-[14px]" style={{ color: complete ? S.helper : S.amberText }}>
          {complete ? summaryLine(t, item) : missingLine(t, item)}
        </span>
      </span>
      <ReadyTag complete={complete} />
    </button>
  );
}

/** Dashed "add" row used before a type or part has anything in it. */
function AddRow({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[62px] w-full items-center gap-3 rounded-[16px] border-2 border-dashed bg-white/50 px-4 py-3 text-left"
      style={{ borderColor: "rgba(26,61,46,0.4)", color: S.forest }}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: S.forest, color: S.lime }}>
        <Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-[15.5px] font-[700]">{title}</span>
        <span className="block text-[13.5px]" style={{ color: S.helper }}>{detail}</span>
      </span>
    </button>
  );
}

/**
 * Fresh chop: a pre-made part (any number of branded items) and a homemade part
 * (one "Homemade chop" item plus its ingredients). Which parts are filled in
 * follows the bird's items — there's no separate pre-made/homemade choice.
 */
function ChopSection({ items, onChange, chop, onOpen, onAddPremade }: {
  items: FoodItem[];
  onChange: (items: FoodItem[]) => void;
  chop: ChopConfig;
  onOpen: (idx: number) => void;
  onAddPremade: () => void;
}) {
  const { t } = useTranslation();
  const homemadeIdx = items.findIndex((it) => it.homemade);
  const premadeIdx = items.map((it, i) => (it.homemade ? -1 : i)).filter((i) => i >= 0);
  const needsDetails = items.length === 0 || items.some((it) => !isFoodItemComplete(it));

  const addHomemade = () => {
    // The homemade item leads the list; pre-made items follow.
    onChange([{ ...blankFoodItem(), name: HOMEMADE_CHOP_NAME, homemade: true }, ...items]);
  };

  return (
    <section className="flex flex-col gap-[14px] rounded-[18px] px-4 py-5" style={{ background: S.lime, color: S.forest }}>
      <div>
        <div className="flex items-start justify-between gap-2">
          <h2 className="m-0 text-[20px] font-[700] leading-[1.2]" style={{ fontFamily: SERIF }}>
            {t("birdSetup.opt.freshChopFormulated", "Fresh chop / formulated")}
          </h2>
          {needsDetails && <ReadyTag complete={false} />}
        </div>
        <p className="m-0 mt-1.5 text-[15px] leading-[1.5]">{t("foodEditor.chopHelper", "Add a pre-made chop, your own homemade mix, or both.")}</p>
      </div>

      {/* Pre-made */}
      {premadeIdx.length === 0 ? (
        <AddRow
          title={t("foodEditor.addPremadeChop", "Add a pre-made chop")}
          detail={t("foodEditor.addPremadeChopDetail", "A brand you buy, like Harrison's")}
          onClick={onAddPremade}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-[14px] font-[700]">{t("foodEditor.preMade", "Pre-made")}</p>
          {premadeIdx.map((idx) => (
            <ItemRow
              key={idx}
              item={items[idx]}
              name={items[idx].name.trim() || t("foodEditor.preMadeChopItem", "Pre-made chop")}
              onOpen={() => onOpen(idx)}
            />
          ))}
          <div>
            <SetupTextButton onClick={onAddPremade} icon={<Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />}>
              {t("foodEditor.addAnotherPremadeChop", "Add another pre-made chop")}
            </SetupTextButton>
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
          <div
            className="overflow-hidden rounded-[16px] border-2 bg-white"
            style={{ borderColor: isFoodItemComplete(items[homemadeIdx]) ? "#fff" : NEEDS_BORDER }}
          >
            <ItemRow flat item={items[homemadeIdx]} name={t("foodEditor.homemadeChopItem", "Homemade chop")} onOpen={() => onOpen(homemadeIdx)} />
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
    </section>
  );
}

/** A missing-field line under a control, shown once Next has been pressed. */
function Missing({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[14px]" style={{ color: S.amberText }}>{children}</p>;
}

/** The sheet's fields for one item: brand, how much, when, all day, note. */
function ItemSheetBody({ item, typeLabel, freshTitle, validationActive, onChange, onDone, onRemove }: {
  item: FoodItem;
  typeLabel: string;
  /** Title until a brand is typed ("New pellet"), or the homemade item's name. */
  freshTitle: string;
  validationActive: boolean;
  onChange: (patch: Partial<FoodItem>) => void;
  onDone: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const complete = isFoodItemComplete(item);
  const miss = foodItemMissing(item);
  const times = normalizeFeedTimes(item.times);
  const [editingAt, setEditingAt] = useState<FeedPeriod | null>(null);
  const title = item.homemade ? freshTitle : item.name.trim() || freshTitle;
  const unitOptions = [
    ...(item.unit && !FOOD_UNITS.includes(item.unit as any) ? [{ value: item.unit, label: item.unit }] : []),
    ...FOOD_UNITS.map((u) => ({ value: u, label: foodLabel(t, u) })),
  ];

  function setPeriods(next: FeedPeriod[]) {
    const kept = new Map(times.map((ft) => [ft.period, ft]));
    const out: FeedTime[] = FEED_PERIODS
      .filter((p) => next.includes(p.value))
      .map((p) => kept.get(p.value) ?? { period: p.value, at: null });
    onChange({ times: out });
  }
  function setAt(period: FeedPeriod, at: string) {
    onChange({ times: times.map((ft) => (ft.period === period ? { ...ft, at: at || null } : ft)) });
  }

  return (
    <div className="flex flex-col gap-5" style={{ color: S.forest }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[13px]" style={{ color: S.quiet }}>{typeLabel}</p>
          <h2 className="m-0 mt-0.5 break-words text-[26px] font-[700] leading-[1.15]" style={{ fontFamily: SERIF }}>{title}</h2>
          <div className="mt-2"><ReadyTag complete={complete} /></div>
        </div>
        <button
          type="button"
          onClick={onDone}
          aria-label={t("foodEditor.closeSheet", "Close")}
          className="grid size-11 shrink-0 place-items-center rounded-full"
          style={{ background: S.card, color: S.forest }}
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {!item.homemade && (
        <Field label={t("foodEditor.brandOrName", "Brand or name")} htmlFor="food-item-brand">
          <TextField
            id="food-item-brand"
            value={item.name}
            maxLength={120}
            invalid={validationActive && miss.brand}
            onChange={(v) => onChange({ name: v })}
            placeholder={t("foodEditor.brandPlaceholder", "e.g. Harrison's High Potency")}
          />
          {validationActive && miss.brand && <Missing>{t("foodEditor.helperBrand", "Add the brand or food name.")}</Missing>}
        </Field>
      )}

      {!item.freeFed && (
        <>
          <Field label={t("foodEditor.howMuch", "How much?")} htmlFor="food-item-amount">
            <div className="flex gap-2">
              <div className="w-[110px] shrink-0">
                <TextField
                  id="food-item-amount"
                  inputMode="decimal"
                  value={item.amount}
                  invalid={validationActive && miss.qty}
                  onChange={(v) => onChange({ amount: v.replace(/[^0-9.]/g, "") })}
                  placeholder={t("foodEditor.amount", "Amount")}
                />
              </div>
              <div className="min-w-0 flex-1">
                <Dropdown
                  ariaLabel={t("foodEditor.unit", "Unit")}
                  value={item.unit}
                  invalid={validationActive && miss.unit}
                  onChange={(v) => onChange({ unit: v })}
                  options={unitOptions}
                  placeholder={t("foodEditor.unit", "Unit")}
                />
              </div>
            </div>
            {validationActive && (miss.qty || miss.unit) && <Missing>{t("foodEditor.helperHowMuch", "Add how much.")}</Missing>}
          </Field>

          <Field label={t("foodEditor.when", "When?")}>
            <CheckChips
              label={t("foodEditor.when", "When?")}
              options={FEED_PERIODS.map((p) => ({ value: p.value, label: foodLabel(t, p.label) }))}
              value={times.map((ft) => ft.period)}
              onChange={setPeriods}
            />
            {validationActive && miss.when && <Missing>{t("foodEditor.helperWhen", "Pick at least one feeding time.")}</Missing>}
            {times.length > 0 && (
              <div className="mt-1 flex flex-col gap-2">
                {times.map((ft) => {
                  const period = FEED_PERIODS.find((p) => p.value === ft.period)!;
                  const shown = formatAt(ft.at);
                  return (
                    <div key={ft.period} className="flex min-h-[52px] items-center justify-between gap-2 rounded-[14px] px-4" style={{ background: S.card }}>
                      <span className="text-[15px] font-[700]">{foodLabel(t, period.label)}</span>
                      {editingAt === ft.period ? (
                        <span className="flex items-center gap-1">
                          <input
                            type="time"
                            autoFocus
                            aria-label={t("foodEditor.timeFor", "Time for {{period}}", { period: foodLabel(t, period.label) })}
                            value={ft.at ?? ""}
                            onChange={(e) => setAt(ft.period, e.target.value)}
                            onBlur={() => setEditingAt(null)}
                            className="h-10 w-[128px] rounded-full border-2 bg-white px-3 text-[15px] outline-none focus:border-[#1a3d2e]"
                            style={{ borderColor: S.line, color: S.forest }}
                          />
                          {ft.at && (
                            <SetupTextButton onClick={() => { setAt(ft.period, ""); setEditingAt(null); }}>
                              {t("foodEditor.clear", "Clear")}
                            </SetupTextButton>
                          )}
                        </span>
                      ) : (
                        <SetupTextButton onClick={() => setEditingAt(ft.period)} icon={shown ? undefined : <Clock className="size-4" aria-hidden="true" />}>
                          {shown ?? t("foodEditor.addATime", "Add a time")}
                        </SetupTextButton>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Field>
        </>
      )}

      <div className="flex flex-col gap-2 border-y py-4" style={{ borderColor: S.footerLine }}>
        <Switch
          checked={!!item.freeFed}
          onChange={(on) => onChange({ freeFed: on, ...(on ? { times: [] } : {}) })}
        >
          <span className="block">{t("foodEditor.availableAllDayFreeFed", "Available all day / free-fed")}</span>
          <span className="mt-0.5 block text-[14px] font-[400]" style={{ color: S.helper }}>
            {t("foodEditor.freeFedNote", "Left in the cage — no set amount or times needed.")}
          </span>
        </Switch>
        {item.freeFed && (
          <p className="m-0 text-[14px]" style={{ color: S.helper }}>
            {t("foodEditor.freeFedHiddenNote", "How much and When are hidden while this is on. Your sitter will see “Available all day.”")}
          </p>
        )}
      </div>

      <Field label={t("foodEditor.anythingElse", "Anything else?")} optional htmlFor="food-item-note">
        <TextBox
          id="food-item-note"
          value={item.note ?? ""}
          onChange={(v) => onChange({ note: v ? v.slice(0, 300) : null })}
          placeholder={t("foodEditor.notePlaceholderPrep", "Any prep or serving details")}
        />
      </Field>

      <div className="flex flex-col items-center gap-1">
        <SetupPrimaryButton onClick={onDone} arrow={false}>{t("foodEditor.done", "Done")}</SetupPrimaryButton>
        {onRemove && <SetupTextButton onClick={onRemove}>{t("foodEditor.removeThisItem", "Remove this item")}</SetupTextButton>}
      </div>
    </div>
  );
}
