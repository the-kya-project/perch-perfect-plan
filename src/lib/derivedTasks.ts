// Structured descriptor for auto-derived routine tasks.
//
// Stored in routine_tasks.derived (nullable jsonb) ALONGSIDE the English
// title/instructions, which are NEVER modified. A locale-aware renderer
// (routineTaskRender.ts, added in a later commit) composes the display string
// from this descriptor; rows without one render their stored title/instructions
// verbatim. So the worst case for any row is that it looks exactly like today.
//
// Owner-supplied text (food/med names, per-item notes) is carried VERBATIM in
// `ownerText`/`note` and never translated — only the app scaffold and enum
// labels are localized. These builder functions are the single source of truth
// shared by the sync paths (write) and the backfill (re-derive).

export type DerivedTask =
  | { kind: "feed"; ownerText: string; params: { allDay: boolean; amount: string | null; unit: string | null; note: string | null } }
  | { kind: "med"; ownerText: string; params: { timeKey: string | null; note: string | null } }
  | { kind: "wash_food"; labelKeys: { wash: string } }
  | { kind: "wash_water"; labelKeys: { wash: string } }
  | { kind: "remove_fresh"; params: { removalMinutes: number } }
  | { kind: "change_water"; labelKeys: { freq: string } };

const clean = (v: string | null | undefined): string | null => {
  const s = (v ?? "").toString().trim();
  return s ? s : null;
};

export function feedDescriptor(item: {
  name: string;
  amount?: string | null;
  unit?: string | null;
  freeFed?: boolean;
  note?: string | null;
}): DerivedTask {
  return {
    kind: "feed",
    ownerText: (item.name ?? "").trim(),
    params: {
      allDay: !!item.freeFed,
      amount: clean(item.amount),
      unit: clean(item.unit),
      note: clean(item.note),
    },
  };
}

export function medDescriptor(name: string, timeKey: string | null, note: string | null): DerivedTask {
  return { kind: "med", ownerText: (name ?? "").trim(), params: { timeKey: timeKey ?? null, note: clean(note) } };
}

export const washFoodDescriptor = (wash: string): DerivedTask => ({ kind: "wash_food", labelKeys: { wash } });
export const washWaterDescriptor = (wash: string): DerivedTask => ({ kind: "wash_water", labelKeys: { wash } });
export const removeFreshDescriptor = (removalMinutes: number): DerivedTask => ({ kind: "remove_fresh", params: { removalMinutes } });
export const changeWaterDescriptor = (freq: string): DerivedTask => ({ kind: "change_water", labelKeys: { freq } });
