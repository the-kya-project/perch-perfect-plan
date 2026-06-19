import { FEED_PERIODS, type FeedPeriod, type FeedTime } from "@/lib/feedTimes";

/**
 * Structured feed-time control. Replaces the old free-text time field so a feed
 * time always maps cleanly to a routine section.
 *
 * - Pick one or more periods (Morning / Midday / Evening) — each produces a
 *   feeding task in that section.
 * - Each selected period has an OPTIONAL specific time (display only).
 * - "Available all day / free-fed" places the food once with an all-day note.
 *
 * Controlled: `value` holds the item's structured times + freeFed; `onChange`
 * emits a partial patch.
 */
export function FeedTimePicker({
  value,
  onChange,
}: {
  value: { times: FeedTime[]; freeFed: boolean; note?: string | null };
  onChange: (patch: { times?: FeedTime[]; freeFed?: boolean; note?: string | null }) => void;
}) {
  const { times, freeFed, note } = value;
  const selected = new Map<FeedPeriod, FeedTime>(times.map((t) => [t.period, t]));

  function togglePeriod(p: FeedPeriod) {
    if (selected.has(p)) {
      onChange({ times: times.filter((t) => t.period !== p) });
    } else {
      // Keep periods in canonical order (morning → midday → evening).
      const next = [...times, { period: p, at: null }];
      next.sort((a, b) => FEED_PERIODS.findIndex((x) => x.value === a.period) - FEED_PERIODS.findIndex((x) => x.value === b.period));
      onChange({ times: next });
    }
  }

  function setAt(p: FeedPeriod, at: string) {
    onChange({ times: times.map((t) => (t.period === p ? { ...t, at: at || null } : t)) });
  }

  return (
    <div className="rounded-md bg-white p-2 ring-1 ring-sage-100">
      <label className="flex items-center gap-2 text-xs font-semibold text-sage-700">
        <input
          type="checkbox"
          className="size-4 accent-sage-600"
          checked={freeFed}
          onChange={(e) => onChange({ freeFed: e.target.checked, ...(e.target.checked ? { times: [] } : {}) })}
        />
        Available all day / free-fed
      </label>

      {!freeFed && (
        <div className="mt-2">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-sage-600">When is it fed?</p>
          <div className="flex flex-wrap gap-1.5">
            {FEED_PERIODS.map((p) => {
              const on = selected.has(p.value);
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePeriod(p.value)}
                  className={
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
                    (on ? "border-sage-600 bg-sage-600 text-white" : "border-sage-200 bg-white text-sage-700 hover:bg-sage-50")
                  }
                >
                  {on ? "✓ " : "+ "}{p.label}
                </button>
              );
            })}
          </div>

          {times.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {FEED_PERIODS.filter((p) => selected.has(p.value)).map((p) => {
                const at = selected.get(p.value)?.at ?? "";
                return (
                  <div key={p.value} className="flex items-center gap-2 text-xs text-sage-700">
                    <span className="w-16 shrink-0 font-medium">{p.label}</span>
                    <input
                      type="time"
                      className="input flex-1 text-sm"
                      value={at}
                      onChange={(e) => setAt(p.value, e.target.value)}
                    />
                    {at ? (
                      <button
                        type="button"
                        onClick={() => setAt(p.value, "")}
                        className="shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold text-warn-red hover:bg-warn-red/10"
                        aria-label={`Clear ${p.label} time`}
                      >
                        Clear
                      </button>
                    ) : (
                      <span className="shrink-0 text-[11px] text-sage-400">optional time</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {times.length === 0 && <p className="mt-1 text-[11px] text-sage-400">Pick at least one period.</p>}
        </div>
      )}

      {/* Optional per-food note, e.g. "sprinkle a little Harrisons on it". */}
      <div className="mt-2">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-sage-600">Note (optional)</label>
        <textarea
          className="input area text-sm"
          placeholder="e.g. sprinkle a little Harrisons on it"
          maxLength={300}
          value={note ?? ""}
          onChange={(e) => onChange({ note: e.target.value || null })}
        />
      </div>
    </div>
  );
}
