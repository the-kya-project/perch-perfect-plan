import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability } from "@/lib/useCapability";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { toast } from "sonner";
import { ArrowLeft, Scale, Check } from "lucide-react";
import { WeightTrendChart, type WeightPoint } from "@/components/WeightTrendChart";
import { computeWeightTrend } from "@/lib/weightTrend";
import { InkHero, IconTile, StatusPill, SectionHead, Card, RecordRow } from "@/components/system";
import { MemberContextBanner } from "@/components/MemberContextBanner";

export const Route = createFileRoute("/_authenticated/birds/$birdId/weight")({
  head: () => ({ meta: [{ title: "Weight — Kya & Co." }] }),
  // ?log=1 (from the bird record's weight "+") opens the log-weight entry
  // straight away — one tap to the field, no intermediate CTA.
  validateSearch: (search: Record<string, unknown>): { log?: boolean } => ({
    log: search.log === true || search.log === "true" || search.log === 1 ? true : undefined,
  }),
  component: WeightFacet,
});

type Entry = { id: string; grams: number; measured_at: string; source: string; meal_relation: string | null; logged_by: string | null };
type WindowDays = 30 | 90 | 365;

const WINDOWS: { days: WindowDays; label: string }[] = [
  { days: 30, label: "30d" },
  { days: 90, label: "90d" },
  { days: 365, label: "1y" },
];
const MIN_G = 1;
const MAX_G = 5000;
const pad = (x: number) => String(x).padStart(2, "0");
// "YYYY-MM-DDTHH:MM" in local time, for <input type="datetime-local"> + its max.
const nowLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const mealLabel = (m: string | null | undefined): string | null => (m === "before_meal" ? "before meal" : m === "after_meal" ? "after meal" : null);

// Window-aware steady/trend context line for the hero (no emergency framing —
// weight is never "red" on this screen).
function trendContext(trend: "steady" | "up" | "down", delta: number, win: WindowDays): string {
  const span = win === 30 ? "the last month" : win === 90 ? "the last 90 days" : "the last year";
  if (trend === "up") return `Up ${delta} g over ${span}.`;
  if (trend === "down") return `Down ${Math.abs(delta)} g over ${span}.`;
  return `Steady over ${span}.`;
}

function WeightFacet() {
  const { birdId } = Route.useParams();
  const { log } = Route.useSearch();
  const canLogCare = useCapability("log_daily_care", { birdId });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [win, setWin] = useState<WindowDays>(90);
  const [logOpen, setLogOpen] = useState(false);

  // ?log=1 deep-link → open the entry once we know the caller may log.
  useEffect(() => {
    if (log && canLogCare) setLogOpen(true);
  }, [log, canLogCare]);

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
        .select("*") // includes meal_relation (added by migration); typed via cast
        .eq("bird_id", birdId)
        .order("measured_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
  });

  const all = entries ?? [];
  // Shared trend computation (kept identical to the vet summary).
  const { current, trend, delta } = computeWeightTrend(all, win);
  const cutoff = Date.now() - win * 86_400_000;
  const inWindow = all.filter((e) => +new Date(e.measured_at) >= cutoff);

  const chartPoints: WeightPoint[] = inWindow.map((e) => ({ at: e.measured_at, grams: e.grams, sitter: e.source === "sitter" }));

  // Resolve names for household-logged entries (e.g. "Daniel · household").
  const householdIds = Array.from(new Set(all.filter((e) => e.source === "household" && e.logged_by).map((e) => e.logged_by as string)));
  const { data: householdNames } = useQuery({
    queryKey: ["member-names", birdId, householdIds.sort().join(",")],
    enabled: householdIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, display_name").in("id", householdIds);
      const m: Record<string, string> = {};
      for (const p of data ?? []) m[p.id] = (p.display_name ?? "").toString().trim();
      return m;
    },
  });

  const heroHeadline = current ? `${current.grams} g.` : "Weight.";
  const heroBody = current ? trendContext(trend, delta, win) : `No weights yet. Pop ${name} on a scale and log the first one.`;

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={() => navigate({ to: "/birds/$birdId", params: { birdId } })}
          eyebrow="Weight"
          headline={heroHeadline}
          body={heroBody}
          cta={canLogCare ? { label: "Log today's weight", tone: "lime", onPress: () => setLogOpen(true) } : undefined}
        />

        <main className="space-y-4 px-5 pt-5">
          <MemberContextBanner birdId={birdId} />
          {/* Log weight */}
          {logOpen && (
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
          )}

          {all.length > 0 && (
            <>
              {/* Trend + chart */}
              <Card className="p-4">
                <SectionHead title="Trend" />
                <div className="mb-3 flex justify-end">
                  <div className="inline-flex rounded-xl ring-1 ring-[var(--line)] p-0.5">
                    {WINDOWS.map((w) => (
                      <button
                        key={w.days}
                        type="button"
                        onClick={() => setWin(w.days)}
                        className={`min-h-[36px] rounded-[10px] px-3 text-xs font-[500] ${win === w.days ? "bg-[var(--ink)] text-white" : "text-[var(--ink)]"}`}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                </div>
                <WeightTrendChart points={chartPoints} />
                <p className="mt-2 flex items-center gap-3 t-meta">
                  <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-[var(--ink)]" /> You</span>
                  <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-white ring-2 ring-[var(--amber-line)]" /> Sitter</span>
                </p>
              </Card>

              {/* History */}
              <section>
                <SectionHead title="History" />
                <Card>
                  {all.map((e, i) => {
                    const prev = all[i + 1]; // chronological previous (array is newest-first)
                    const d = prev ? e.grams - prev.grams : null;
                    const deltaText = d == null ? "First weight" : `${d > 0 ? "+" : ""}${d} g from previous`;
                    const subtitle = [fmtDateTime(e.measured_at), deltaText, mealLabel(e.meal_relation)].filter(Boolean).join(" · ");
                    let marker: React.ReactNode;
                    if (e.source === "sitter") {
                      marker = <StatusPill tone="off">Sitter</StatusPill>;
                    } else if (e.source === "household") {
                      const nm = (e.logged_by && householdNames?.[e.logged_by]) || "";
                      marker = <StatusPill tone="household">{nm ? `${nm} · household` : "Household"}</StatusPill>;
                    }
                    return (
                      <RecordRow
                        key={e.id}
                        leading={<IconTile size={34} tone="pale" icon={<Scale className="size-4" />} />}
                        title={`${e.grams} g`}
                        subtitle={subtitle}
                        trailing={marker}
                        chevron={false}
                        last={i === all.length - 1}
                      />
                    );
                  })}
                </Card>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

type Meal = "before_meal" | "after_meal" | null;

function LogPanel({ birdId, lastGrams, onClose, onSaved }: { birdId: string; lastGrams?: number; onClose: () => void; onSaved: () => void }) {
  // sit_id attribution: when the household member is the assigned caregiver on
  // an active sit covering this bird, every weight they log during the window
  // is tagged with that sit_id, so the sit's activity view can derive its feed
  // from attribution. Null otherwise (no over-tagging).
  const activeSitId = useActiveSitIdForBird(birdId);
  const role = useBirdRole(birdId);
  const [grams, setGrams] = useState<string>(lastGrams ? String(lastGrams) : "");
  const [when, setWhen] = useState<string>(nowLocal()); // datetime-local: date + time
  const [meal, setMeal] = useState<Meal>(null);
  const [saving, setSaving] = useState(false);

  const n = Number(grams);
  const valid = grams !== "" && Number.isFinite(n) && n >= MIN_G && n <= MAX_G && !!when;

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const { data: u } = await getLocalUser();
      const measured_at = new Date(when).toISOString(); // local datetime → UTC
      // Only send meal_relation when chosen, so logging still works if the
      // additive migration hasn't been applied yet (then the column is absent).
      const payload: Record<string, unknown> = {
        bird_id: birdId, grams: n, measured_at, source: role === "household" ? "household" : "owner", logged_by: u.user?.id ?? null,
      };
      if (meal) payload.meal_relation = meal;
      if (activeSitId) payload.sit_id = activeSitId;
      const { error } = await supabase.from("weight_entries").insert(payload as any);
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
    <Card className="p-4">
      <p className="t-item">Log weight</p>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-[500] text-[var(--mute)]">Weight (grams)</label>
        <input
          className="h-11 w-full rounded-xl bg-white ring-1 ring-[var(--line)] px-3 text-lg font-[500] text-[var(--ink)] outline-none focus:ring-[var(--moss)]"
          inputMode="decimal"
          value={grams}
          placeholder={lastGrams ? String(lastGrams) : "e.g. 410"}
          onChange={(e) => setGrams(e.target.value.replace(/[^0-9.]/g, ""))}
        />
        {grams !== "" && !valid && grams && (Number(grams) < MIN_G || Number(grams) > MAX_G) && (
          <p className="mt-1 text-[11px] text-[var(--amber-ink)]">Enter a weight between {MIN_G} and {MAX_G} grams.</p>
        )}
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-[500] text-[var(--mute)]">When</label>
        <input
          type="datetime-local"
          className="h-11 w-full rounded-xl bg-white ring-1 ring-[var(--line)] px-3 text-sm text-[var(--ink)] outline-none focus:ring-[var(--moss)]"
          value={when}
          max={nowLocal()}
          onChange={(e) => setWhen(e.target.value)}
        />
      </div>

      <div className="mt-3">
        <label className="mb-1 block text-xs font-[500] text-[var(--mute)]">Relative to a meal (optional)</label>
        <div className="grid grid-cols-2 gap-2">
          {(["before_meal", "after_meal"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMeal((cur) => (cur === m ? null : m))}
              className={`min-h-[44px] rounded-xl text-sm font-[500] ${meal === m ? "bg-[var(--ink)] text-white ring-1 ring-[var(--moss)]" : "bg-white text-[var(--ink)] ring-1 ring-[var(--line)]"}`}
            >
              {m === "before_meal" ? "Before meal" : "After meal"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!valid || saving}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[12px] bg-[var(--lime)] text-sm font-[500] text-[var(--ink)] disabled:opacity-50"
        >
          <Check className="size-4" /> {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onClose} disabled={saving} className="min-h-[44px] rounded-[12px] px-4 text-sm font-[500] text-[var(--mute)] ring-1 ring-[var(--line)]">
          Cancel
        </button>
      </div>
    </Card>
  );
}
