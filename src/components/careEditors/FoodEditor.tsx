import { useState } from "react";
import { Plus, X } from "lucide-react";

/**
 * Shared, controlled structured food editor.
 *
 * This is the single source of truth for the Food/Water inputs. It reads from
 * and writes to the structured `care_plans` columns (diet_types, diet_details,
 * treats_notes, never_feed, water_frequency, …) — the SAME columns the guided
 * setup wizard writes — so the tabbed bird editor and the wizard are two views
 * of one data model. It stores no server state: it's fully controlled via
 * `value` (the relevant plan columns) and `onChange` (a partial column patch).
 *
 * The legacy free-text summary blobs (food_instructions, water_instructions,
 * treats_allowed, foods_never_allowed, fresh_food_removal) are intentionally NOT
 * touched here — the sitter view assembles its display from these structured
 * fields instead.
 */

export type DietItem = { name: string; amount: string; unit: string; times?: string[]; freeFed?: boolean };

/** The structured food columns this editor owns. */
export type FoodValue = {
  diet_types: string[];
  diet_other: string | null;
  diet_details: Record<string, DietItem[]>;
  fresh_foods_other: string | null;
  treats_notes: string | null;
  treats_frequency: string | null;
  never_feed: string[];
  water_frequency: string | null;
  water_notes: string | null;
  food_storage: string | null;
  fresh_food_removal_minutes: number;
  food_bowl_wash_cadence: string;
  water_bowl_wash_cadence: string;
  food_hygiene_notes: string | null;
};

export const DIET_OPTIONS = [
  { value: "pelleted", label: "Pelleted diet" },
  { value: "seed", label: "Seed mix" },
  { value: "pellet_seed", label: "Pellet & seed blend" },
  { value: "chop", label: "Fresh chop / formulated" },
  { value: "other", label: "Other" },
];

export const UNITS = ["tablespoons", "cups", "grams", "scoops", "pieces"];

const FRESH_FOOD_OPTIONS = [
  "Pre-made chop", "Leafy greens", "Carrot", "Bell pepper", "Broccoli", "Sweet potato",
  "Squash", "Apple (no seeds)", "Berries", "Banana", "Cooked grains",
  "Cooked legumes", "Sprouts", "Quinoa",
];

const TREAT_FREQ = [
  { value: "daily", label: "Daily" },
  { value: "few_per_week", label: "A few times a week" },
  { value: "training_only", label: "Training only" },
  { value: "rarely", label: "Rarely" },
];

const WATER_FREQ = [
  { value: "once", label: "Changed once daily" },
  { value: "twice", label: "Changed twice daily" },
  { value: "more", label: "More than twice daily" },
];

const REMOVAL_OPTIONS = [
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
];

const FOOD_BOWL_WASH_OPTIONS = [
  { value: "after_each_fresh", label: "After every fresh-food serving" },
  { value: "once_daily", label: "Once a day" },
  { value: "every_few_days", label: "Every few days" },
];

const WATER_BOWL_WASH_OPTIONS = [
  { value: "once_daily", label: "Once a day" },
  { value: "twice_daily", label: "Twice a day" },
];

/** Read the editor's value out of a raw care_plans row (with safe defaults). */
export function foodValueFromPlan(p: any): FoodValue {
  return {
    diet_types: Array.isArray(p?.diet_types) ? p.diet_types : [],
    diet_other: p?.diet_other ?? null,
    diet_details: (p?.diet_details && typeof p.diet_details === "object" ? p.diet_details : {}) as Record<string, DietItem[]>,
    fresh_foods_other: p?.fresh_foods_other ?? null,
    treats_notes: p?.treats_notes ?? null,
    treats_frequency: p?.treats_frequency ?? null,
    never_feed: Array.isArray(p?.never_feed) ? p.never_feed : [],
    water_frequency: p?.water_frequency ?? null,
    water_notes: p?.water_notes ?? null,
    food_storage: p?.food_storage ?? null,
    fresh_food_removal_minutes: typeof p?.fresh_food_removal_minutes === "number" ? p.fresh_food_removal_minutes : 120,
    food_bowl_wash_cadence: p?.food_bowl_wash_cadence ?? "after_each_fresh",
    water_bowl_wash_cadence: p?.water_bowl_wash_cadence ?? "once_daily",
    food_hygiene_notes: p?.food_hygiene_notes ?? null,
  };
}

/**
 * Derive the legacy/denormalized columns the sitter view still reads as
 * fallbacks (feeding_times, fresh_foods, food_brand, amount_value, amount_unit)
 * from the structured value. Keeps both editors producing identical denormalized
 * data so switching screens never doubles or drops anything. Merge the result
 * into the save payload alongside the structured columns.
 */
export function deriveFoodLegacyFields(v: FoodValue): {
  feeding_times: string[];
  fresh_foods: string[];
  food_brand: string | null;
  amount_value: number | null;
  amount_unit: string | null;
} {
  const allItems: DietItem[] = v.diet_types.flatMap((t) => v.diet_details[t] ?? []);
  const feeding_times = Array.from(
    new Set(allItems.flatMap((it) => (Array.isArray(it.times) ? it.times : [])).map((t) => t.trim()).filter(Boolean)),
  );
  const fresh_foods = (v.diet_details["chop"] ?? []).map((i) => i.name.trim()).filter(Boolean);
  const first = allItems.find((it) => it.name.trim() || it.amount.trim());
  const amountNum = first && first.amount.trim() ? Number(first.amount) : null;
  return {
    feeding_times,
    fresh_foods,
    food_brand: first?.name?.trim() || null,
    amount_value: amountNum != null && Number.isFinite(amountNum) ? amountNum : null,
    amount_unit: first?.unit || null,
  };
}

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-sage-50/60 p-3 ring-1 ring-sage-100">
      <p className="text-xs font-bold uppercase tracking-wider text-sage-700">{title}</p>
      {hint && <p className="mt-1 text-[11px] text-sage-600">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
        (on ? "border-sage-600 bg-sage-600 text-white" : "border-sage-200 bg-white text-sage-700 hover:bg-sage-50")
      }
    >
      {on ? "✓ " : "+ "}{children}
    </button>
  );
}

export function FoodEditor({ value, onChange }: { value: FoodValue; onChange: (patch: Partial<FoodValue>) => void }) {
  const [timeDraft, setTimeDraft] = useState<Record<string, string>>({});
  const [newNever, setNewNever] = useState("");

  const diet = value.diet_types;
  const dietDetails = value.diet_details;
  const never = value.never_feed;

  function toggleDiet(v: string) {
    onChange({ diet_types: diet.includes(v) ? diet.filter((x) => x !== v) : [...diet, v] });
  }
  function setItems(t: string, next: DietItem[]) {
    onChange({ diet_details: { ...dietDetails, [t]: next } });
  }
  function toggleFreshFood(label: string) {
    const items = dietDetails["chop"] ?? [];
    const lower = label.trim().toLowerCase();
    const exists = items.some((i) => i.name.trim().toLowerCase() === lower);
    const next = exists
      ? items.filter((i) => i.name.trim().toLowerCase() !== lower)
      : [...items, { name: label, amount: "", unit: "", times: [] }];
    setItems("chop", next);
  }
  function addNever() {
    const v = newNever.trim();
    if (!v || never.includes(v)) { setNewNever(""); return; }
    onChange({ never_feed: [...never, v] });
    setNewNever("");
  }

  return (
    <div className="space-y-3">
      {/* Primary diet */}
      <Group title="Primary diet" hint="Choose all that apply.">
        <div className="flex flex-wrap gap-2">
          {DIET_OPTIONS.map((o) => (
            <Chip key={o.value} on={diet.includes(o.value)} onClick={() => toggleDiet(o.value)}>
              {o.label}
            </Chip>
          ))}
        </div>
        {diet.includes("other") && (
          <input
            className="input mt-3"
            placeholder="Describe the other diet"
            value={value.diet_other ?? ""}
            maxLength={200}
            onChange={(e) => onChange({ diet_other: e.target.value || null })}
          />
        )}
      </Group>

      {/* Per-diet-type items, amounts & feed times */}
      {diet.length > 0 && (
        <Group
          title={diet.length === 1 ? "Items, amounts & feed time(s)" : "Items & amounts per food type"}
          hint="For each item, add the amount and when it's served. Use “Available all day” for food left in the cage."
        >
          <div className="space-y-4">
            {diet.map((t) => {
              const label = DIET_OPTIONS.find((o) => o.value === t)?.label ?? t;
              const items = dietDetails[t] ?? [];
              const update = (next: DietItem[]) => setItems(t, next);
              const isChop = t === "chop";
              const selectedFreshNames = new Set(items.map((i) => i.name.trim().toLowerCase()));
              return (
                <div key={t} className="rounded-xl bg-white p-3 ring-1 ring-sage-100">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-sage-800">{label}</p>
                    <button
                      type="button"
                      onClick={() => update([...items, { name: "", amount: "", unit: "", times: [] }])}
                      className="inline-flex items-center gap-1 rounded-lg bg-sage-100 px-2.5 py-1 text-xs font-semibold text-sage-700 hover:bg-sage-200"
                    >
                      <Plus className="size-3.5" /> Add item
                    </button>
                  </div>

                  {isChop && (
                    <div className="mb-3 rounded-lg bg-sage-50/60 p-2 ring-1 ring-sage-100">
                      <p className="mb-1.5 text-xs font-semibold text-sage-600">Fresh foods offered — tap to add as items</p>
                      <div className="flex flex-wrap gap-1.5">
                        {FRESH_FOOD_OPTIONS.map((f) => (
                          <Chip key={f} on={selectedFreshNames.has(f.trim().toLowerCase())} onClick={() => toggleFreshFood(f)}>
                            {f}
                          </Chip>
                        ))}
                      </div>
                      <input
                        className="input mt-2 text-sm"
                        placeholder="Other fresh foods (free text)"
                        value={value.fresh_foods_other ?? ""}
                        maxLength={300}
                        onChange={(e) => onChange({ fresh_foods_other: e.target.value || null })}
                      />
                    </div>
                  )}

                  {items.length === 0 && (
                    <p className="text-xs text-sage-500">
                      {isChop
                        ? "Pick fresh foods above or tap “Add item” to list your own."
                        : "No items yet. Tap “Add item” to list a brand or food."}
                    </p>
                  )}
                  <div className="space-y-2">
                    {items.map((it, idx) => {
                      const rowInvalid = ((it.amount?.trim() === "") !== (it.unit === ""));
                      const rowKey = `${t}:${idx}`;
                      const draft = timeDraft[rowKey] ?? "";
                      const setDraft = (v: string) => setTimeDraft({ ...timeDraft, [rowKey]: v });
                      const addRowTime = () => {
                        const v = draft.trim();
                        if (!v) return;
                        const cur = it.times ?? [];
                        if (cur.includes(v)) { setDraft(""); return; }
                        const next = items.slice();
                        next[idx] = { ...it, times: [...cur, v], freeFed: false };
                        update(next);
                        setDraft("");
                      };
                      return (
                        <div key={idx} className="rounded-lg bg-sage-50/60 p-2 ring-1 ring-sage-100">
                          <div className="grid grid-cols-[1fr,auto] gap-2">
                            <input
                              className="input"
                              placeholder={isChop ? "e.g. Morning chop mix" : "Brand or item name"}
                              value={it.name}
                              maxLength={120}
                              onChange={(e) => {
                                const next = items.slice();
                                next[idx] = { ...it, name: e.target.value };
                                update(next);
                              }}
                            />
                            <button
                              type="button"
                              aria-label="Remove item"
                              onClick={() => update(items.filter((_, i) => i !== idx))}
                              className="rounded-lg p-2 text-sage-500 hover:bg-sage-100"
                            >
                              <X className="size-4" />
                            </button>
                          </div>
                          <div className="mt-2 grid grid-cols-[1fr,1.4fr] gap-2">
                            <input
                              className="input"
                              inputMode="decimal"
                              placeholder="Amount (e.g. 2)"
                              value={it.amount}
                              onChange={(e) => {
                                const next = items.slice();
                                next[idx] = { ...it, amount: e.target.value.replace(/[^0-9.]/g, "") };
                                update(next);
                              }}
                            />
                            <select
                              className="input"
                              value={it.unit}
                              onChange={(e) => {
                                const next = items.slice();
                                next[idx] = { ...it, unit: e.target.value };
                                update(next);
                              }}
                            >
                              <option value="">Pick a unit…</option>
                              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          {rowInvalid && (
                            <p className="mt-1.5 text-xs font-semibold text-warn-red">Add both an amount and a unit, or clear both.</p>
                          )}

                          {/* Per-item feed time(s) */}
                          <div className="mt-2 rounded-md bg-white p-2 ring-1 ring-sage-100">
                            <label className="flex items-center gap-2 text-xs font-semibold text-sage-700">
                              <input
                                type="checkbox"
                                className="size-4 accent-sage-600"
                                checked={!!it.freeFed}
                                onChange={(e) => {
                                  const next = items.slice();
                                  next[idx] = {
                                    ...it,
                                    freeFed: e.target.checked,
                                    times: e.target.checked ? [] : (it.times ?? []),
                                  };
                                  update(next);
                                }}
                              />
                              Available all day / free-fed
                            </label>
                            {!it.freeFed && (
                              <div className="mt-2">
                                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-sage-600">Feed time(s)</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {(it.times ?? []).map((tm) => (
                                    <span key={tm} className="inline-flex items-center gap-1 rounded-full bg-sage-100 px-2.5 py-1 text-xs font-semibold text-sage-700">
                                      {tm}
                                      <button
                                        type="button"
                                        aria-label={`Remove ${tm}`}
                                        onClick={() => {
                                          const next = items.slice();
                                          next[idx] = { ...it, times: (it.times ?? []).filter((x) => x !== tm) };
                                          update(next);
                                        }}
                                        className="rounded-full p-0.5 text-sage-600 hover:bg-sage-200"
                                      >
                                        <X className="size-3" />
                                      </button>
                                    </span>
                                  ))}
                                  {(it.times ?? []).length === 0 && <span className="text-[11px] text-sage-400">No times yet.</span>}
                                </div>
                                <div className="mt-2 flex gap-2">
                                  <input
                                    className="input flex-1 text-sm"
                                    placeholder="e.g. 8:00 AM, Morning, Bedtime"
                                    value={draft}
                                    maxLength={40}
                                    onChange={(e) => setDraft(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRowTime(); } }}
                                  />
                                  <button
                                    type="button"
                                    onClick={addRowTime}
                                    disabled={!draft.trim()}
                                    className="rounded-xl bg-sage-100 px-3 text-sm font-semibold text-sage-700 disabled:opacity-50"
                                  >
                                    <Plus className="size-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Group>
      )}

      <Group title="Treats">
        <input
          className="input"
          placeholder="What treats are OK? (e.g. millet spray, almond slivers)"
          value={value.treats_notes ?? ""}
          maxLength={300}
          onChange={(e) => onChange({ treats_notes: e.target.value || null })}
        />
        <select className="input mt-2" value={value.treats_frequency ?? ""} onChange={(e) => onChange({ treats_frequency: e.target.value || null })}>
          <option value="">Pick a frequency…</option>
          {TREAT_FREQ.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Group>

      <Group title="Never feed" hint="Add anything specific to your bird.">
        <div className="flex flex-wrap gap-2">
          {never.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full bg-warn-red/10 px-3 py-1.5 text-xs font-semibold text-warn-red">
              {n}
              <button
                type="button"
                aria-label={`Remove ${n}`}
                onClick={() => onChange({ never_feed: never.filter((x) => x !== n) })}
                className="rounded-full p-0.5 hover:bg-warn-red/20"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {never.length === 0 && <span className="text-[11px] text-sage-400">Nothing added yet.</span>}
        </div>
        <div className="mt-3 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Add another food to never feed"
            value={newNever}
            maxLength={80}
            onChange={(e) => setNewNever(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNever(); } }}
          />
          <button type="button" onClick={addNever} disabled={!newNever.trim()} className="rounded-xl bg-sage-100 px-3 text-sm font-semibold text-sage-700 disabled:opacity-50">
            <Plus className="size-4" />
          </button>
        </div>
      </Group>

      <Group title="Water">
        <select className="input" value={value.water_frequency ?? ""} onChange={(e) => onChange({ water_frequency: e.target.value || null })}>
          <option value="">Pick a frequency…</option>
          {WATER_FREQ.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <textarea
          className="input area mt-2"
          placeholder="Notes (filter, bottle vs bowl, etc.)"
          value={value.water_notes ?? ""}
          maxLength={400}
          onChange={(e) => onChange({ water_notes: e.target.value || null })}
        />
      </Group>

      <Group title="Where food is stored">
        <input
          className="input"
          placeholder="e.g. Pantry, top shelf; fridge bin"
          value={value.food_storage ?? ""}
          maxLength={200}
          onChange={(e) => onChange({ food_storage: e.target.value || null })}
        />
      </Group>

      <Group title="Freshness & hygiene" hint="General defaults — adjust to fit your bird and routine.">
        <label className="text-xs font-semibold text-sage-700">Remove fresh or wet food after</label>
        <select
          className="input mt-1"
          value={String(value.fresh_food_removal_minutes ?? 120)}
          onChange={(e) => onChange({ fresh_food_removal_minutes: Number(e.target.value) })}
        >
          {REMOVAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-sage-600">Fresh food spoils fast and can grow bacteria. This tells your sitter when to take it out.</p>

        <label className="mt-3 block text-xs font-semibold text-sage-700">Wash food bowls</label>
        <select className="input mt-1" value={value.food_bowl_wash_cadence ?? "after_each_fresh"} onChange={(e) => onChange({ food_bowl_wash_cadence: e.target.value })}>
          {FOOD_BOWL_WASH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <label className="mt-3 block text-xs font-semibold text-sage-700">Wash water bowl or bottle</label>
        <select className="input mt-1" value={value.water_bowl_wash_cadence ?? "once_daily"} onChange={(e) => onChange({ water_bowl_wash_cadence: e.target.value })}>
          {WATER_BOWL_WASH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-sage-600">This is washing the bowl itself — separate from how often you change the water.</p>

        <label className="mt-3 block text-xs font-semibold text-sage-700">Other food hygiene notes</label>
        <textarea
          className="input area mt-1"
          placeholder="Optional — anything else the sitter should know about food/water hygiene."
          value={value.food_hygiene_notes ?? ""}
          maxLength={500}
          onChange={(e) => onChange({ food_hygiene_notes: e.target.value || null })}
        />
      </Group>
    </div>
  );
}
