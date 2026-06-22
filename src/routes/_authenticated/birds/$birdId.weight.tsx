import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { toast } from "sonner";
import { ArrowLeft, Scale, Plus, Minus, Check } from "lucide-react";
import { WeightTrendChart, type WeightPoint } from "@/components/WeightTrendChart";
import { DatedTimeline, type TimelineItem } from "@/components/DatedTimeline";

export const Route = createFileRoute("/_authenticated/birds/$birdId/weight")({
  head: () => ({ meta: [{ title: "Weight — Parrot Care Co-Pilot" }] }),
  component: WeightFacet,
});

type Entry = { id: string; grams: number; measured_at: string; source: string };
type WindowDays = 30 | 90 | 365;

const WINDOWS: { days: WindowDays; label: string }[] = [
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
];
const MIN_G = 1;
const MAX_G = 5000;
const todayStr = () => new Date().toISOString().slice(0, 10);

function WeightFacet() {
  const { birdId } = Route.useParams();
  const qc = useQueryClient();
  const [win, setWin] = useState<WindowDays>(90);
  const [logOpen, setLogOpen] = useState(false);

  const { data: bird } = useQuery({
    queryKey: ["bird-name", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("name").eq("id", birdId).maybeSingle();
      return data as { name: string } | null;
    },
  });
  const name = bird?.name ?? "this bird";

  const { data: entries } = useQuery({
    queryKey: ["weight-entries", birdId],
    // A freshly-logged weight (or a sitter weigh-in) must show without a manual
    // reload — refetch when the screen regains focus.
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_entries")
        .select("id, grams, measured_at, source")
        .eq("bird_id", birdId)
        .order("measured_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const all = entries ?? [];
  const current = all[0];
  const cutoff = Date.now() - win * 86_400_000;
  const inWindow = all.filter((e) => +new Date(e.measured_at) >= cutoff);

  // Trend over the selected window: current vs the earliest point in-window.
  const baseline = inWindow.length > 1 ? inWindow[inWindow.length - 1] : undefined;
  const delta = current && baseline ? current.grams - baseline.grams : 0;
  const pct = baseline ? delta / baseline.grams : 0;
  const trend: "steady" | "up" | "down" = !baseline || Math.abs(pct) <= 0.025 ? "steady" : delta < 0 ? "down" : "up";

  const chartPoints: WeightPoint[] = inWindow.map((e) => ({ at: e.measured_at, grams: e.grams, sitter: e.source === "sitter" }));

  const timeline: TimelineItem[] = all.map((e, i) => {
    const prev = all[i + 1]; // chronological previous (array is newest-first)
    const d = prev ? e.grams - prev.grams : null;
    const sitter = e.source === "sitter";
    return {
      id: e.id,
      at: e.measured_at,
      title: `${e.grams} g`,
      subtitle: d == null ? "First weight" : `${d > 0 ? "+" : ""}${d} g from previous`,
      icon: <Scale className="size-3" />,
      badge: sitter ? (
        <span className="rounded-full bg-[#f6e7c4] px-1.5 py-0.5 text-[10px] font-medium text-[#854F0B] ring-1 ring-[#BA7517]/40">Sitter</span>
      ) : undefined,
    };
  });

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/birds/$birdId" params={{ birdId }} aria-label="Back to bird record" className="-ml-1 rounded p-1 text-[#1a3d2e]">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-base font-medium text-[#1a3d2e]">Weight</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {all.length === 0 ? (
          <section className="rounded-[16px] bg-[#efe9da] p-8 text-center">
            <Scale className="mx-auto size-7 text-[#2d6a4f]" />
            <p className="mt-3 text-sm text-[#1a3d2e]">No weights yet. Pop {name} on a scale and log the first one — it takes seconds.</p>
            <button
              type="button"
              onClick={() => setLogOpen(true)}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-[14px] bg-[#cdeab0] px-5 text-sm font-medium text-[#1a3d2e]"
            >
              <Plus className="size-4" /> Log first weight
            </button>
          </section>
        ) : (
          <>
            {/* Current + trend */}
            <section className="rounded-[16px] bg-[#efe9da] p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-4xl font-medium leading-none text-[#1a3d2e]">
                    {current.grams}<span className="ml-1 text-lg font-normal text-[#5f5e5a]">g</span>
                  </p>
                  <p className="mt-2 text-xs text-[#8a897f]">Last weighed {new Date(current.measured_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                </div>
                <TrendPill trend={trend} delta={delta} />
              </div>
              <p className="mt-3 border-t border-[#e3dcc9] pt-3 text-xs leading-relaxed text-[#5f5e5a]">
                A steady weight is one of the earliest signs all is well — small daily wobbles are normal.
              </p>
            </section>

            {/* Chart + window toggle */}
            <section className="rounded-[16px] bg-[#efe9da] p-4">
              <div className="mb-3 flex justify-end">
                <div className="inline-flex rounded-xl border border-[#c8bfa6] p-0.5">
                  {WINDOWS.map((w) => (
                    <button
                      key={w.days}
                      type="button"
                      onClick={() => setWin(w.days)}
                      className={`min-h-[36px] rounded-[10px] px-3 text-xs font-medium ${win === w.days ? "bg-[#1a3d2e] text-white" : "text-[#1a3d2e]"}`}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
              <WeightTrendChart points={chartPoints} />
              <p className="mt-2 flex items-center gap-3 text-[10px] text-[#8a897f]">
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-[#1a3d2e]" /> You</span>
                <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-white ring-2 ring-[#BA7517]" /> Sitter</span>
              </p>
            </section>
          </>
        )}

        {/* Log weight */}
        {logOpen ? (
          <LogPanel
            birdId={birdId}
            lastGrams={current?.grams}
            onClose={() => setLogOpen(false)}
            onSaved={() => {
              setLogOpen(false);
              qc.invalidateQueries({ queryKey: ["weight-entries", birdId] });
              qc.invalidateQueries({ queryKey: ["bird-weights", birdId] }); // record-home glance + recent feed
            }}
          />
        ) : all.length > 0 ? (
          <button
            type="button"
            onClick={() => setLogOpen(true)}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#cdeab0] text-sm font-medium text-[#1a3d2e] active:scale-[0.99]"
          >
            <Plus className="size-4" /> Log weight
          </button>
        ) : null}

        {/* History */}
        {all.length > 0 && (
          <section>
            <h3 className="mb-2 px-1 text-sm font-medium text-[#1a3d2e]">History</h3>
            <DatedTimeline items={timeline} />
          </section>
        )}
      </main>
    </div>
  );
}

function TrendPill({ trend, delta }: { trend: "steady" | "up" | "down"; delta: number }) {
  if (trend === "down") {
    return (
      <span className="rounded-full bg-[#f6e7c4] px-3 py-1 text-xs font-medium text-[#854F0B]">
        Down {Math.abs(delta)} g — watch
      </span>
    );
  }
  if (trend === "up") {
    return <span className="rounded-full bg-[#e8e1d0] px-3 py-1 text-xs font-medium text-[#5f5e5a]">Up {delta} g</span>;
  }
  return <span className="rounded-full bg-[#d6e8dc] px-3 py-1 text-xs font-medium text-[#1a3d2e]">Steady</span>;
}

function LogPanel({ birdId, lastGrams, onClose, onSaved }: { birdId: string; lastGrams?: number; onClose: () => void; onSaved: () => void }) {
  const [grams, setGrams] = useState<string>(lastGrams ? String(lastGrams) : "");
  const [date, setDate] = useState<string>(todayStr());
  const [saving, setSaving] = useState(false);

  const n = Number(grams);
  const valid = grams !== "" && Number.isFinite(n) && n >= MIN_G && n <= MAX_G;
  const step = (by: number) => setGrams((g) => String(Math.max(MIN_G, Math.min(MAX_G, (Number(g) || lastGrams || 0) + by))));

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const { data: u } = await getLocalUser();
      // Store at noon to avoid a timezone date-shift; "today" is the default.
      const measured_at = new Date(`${date}T12:00:00`).toISOString();
      const { error } = await supabase.from("weight_entries").insert({
        bird_id: birdId,
        grams: n,
        measured_at,
        source: "owner",
        logged_by: u.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Weight logged.");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save the weight.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[16px] border border-[#cdeab0] bg-white p-4">
      <p className="text-sm font-medium text-[#1a3d2e]">Log weight</p>
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-[#5f5e5a]">Weight (grams)</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => step(-1)} aria-label="Decrease" className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] text-[#1a3d2e]">
            <Minus className="size-4" />
          </button>
          <input
            className="h-11 w-full rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] px-3 text-center text-lg font-medium text-[#1a3d2e] outline-none focus:border-[#2d6a4f]"
            inputMode="decimal"
            value={grams}
            placeholder={lastGrams ? String(lastGrams) : "e.g. 410"}
            onChange={(e) => setGrams(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          <button type="button" onClick={() => step(1)} aria-label="Increase" className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] text-[#1a3d2e]">
            <Plus className="size-4" />
          </button>
        </div>
        {grams !== "" && !valid && <p className="mt-1 text-[11px] text-[#854F0B]">Enter a weight between {MIN_G} and {MAX_G} grams.</p>}
      </div>
      <div className="mt-3">
        <label className="mb-1 block text-xs font-medium text-[#5f5e5a]">Date</label>
        <input
          type="date"
          className="h-11 w-full rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] px-3 text-sm text-[#1a3d2e] outline-none focus:border-[#2d6a4f]"
          value={date}
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!valid || saving}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-[#cdeab0] text-sm font-medium text-[#1a3d2e] disabled:opacity-50"
        >
          <Check className="size-4" /> {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onClose} disabled={saving} className="min-h-[44px] rounded-[14px] border border-[#c8bfa6] px-4 text-sm font-medium text-[#5f5e5a]">
          Cancel
        </button>
      </div>
    </section>
  );
}
