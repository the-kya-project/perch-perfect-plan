import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, CalendarHeart, Cake, Star, Sparkles, Plus, Share2, Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/birds/$birdId/moments")({
  head: () => ({ meta: [{ title: "Moments — Parrot Care Co-Pilot" }] }),
  component: MomentsFacet,
});

type DbMoment = { id: string; kind: string; title: string | null; on_date: string | null; recurs: boolean; auto_generated: boolean };
type MomentView = {
  id: string;
  kind: "gotcha_day" | "birthday" | "years_together" | "custom";
  title: string;
  nextDate: Date | null; // next occurrence (recurring) or the date (one-off); null if undated
  recurs: boolean;
  auto: boolean;
  baseISO: string | null;
};

const todayMid = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12); };

function nextOccurrence(baseISO: string): { date: Date; yearsAt: number } {
  const base = new Date(`${baseISO}T12:00:00`);
  const t = todayMid();
  let cand = new Date(t.getFullYear(), base.getMonth(), base.getDate(), 12);
  if (cand < t) cand = new Date(t.getFullYear() + 1, base.getMonth(), base.getDate(), 12);
  return { date: cand, yearsAt: cand.getFullYear() - base.getFullYear() };
}

function daysUntil(d: Date): number {
  return Math.round((+d - +todayMid()) / 86_400_000);
}

function whenLabel(d: Date): string {
  const n = daysUntil(d);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n <= 7) return "this week";
  if (d.getMonth() === todayMid().getMonth() && d.getFullYear() === todayMid().getFullYear()) return "this month";
  if (n <= 31) return `in ${n} days`;
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

const monthDay = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fullDate = (d: Date) => d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

function MomentsFacet() {
  const { birdId } = Route.useParams();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);

  const { data: bird } = useQuery({
    queryKey: ["bird-moments-id", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("name, birth_date, acquired_on").eq("id", birdId).maybeSingle();
      return data as { name: string; birth_date: string | null; acquired_on: string | null } | null;
    },
  });

  const { data: custom } = useQuery({
    queryKey: ["moments", birdId],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from("moments")
        .select("id, kind, title, on_date, recurs, auto_generated")
        .eq("bird_id", birdId).eq("auto_generated", false)
        .order("on_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DbMoment[];
    },
  });

  const name = bird?.name ?? "this bird";

  // Auto moments derived from identity dates (not persisted — they can't drift
  // when identity changes; flagged "auto" in the UI).
  const auto: MomentView[] = [];
  if (bird?.acquired_on) {
    const { date, yearsAt } = nextOccurrence(bird.acquired_on);
    auto.push({ id: "auto-together", kind: "years_together", title: yearsAt > 0 ? `${yearsAt} year${yearsAt === 1 ? "" : "s"} together` : "Came home", nextDate: date, recurs: true, auto: true, baseISO: bird.acquired_on });
  }
  if (bird?.birth_date) {
    const { date, yearsAt } = nextOccurrence(bird.birth_date);
    auto.push({ id: "auto-hatch", kind: "birthday", title: yearsAt > 0 ? `Hatch-day — turning ${yearsAt}` : "Hatch-day", nextDate: date, recurs: true, auto: true, baseISO: bird.birth_date });
  }

  const customViews: MomentView[] = (custom ?? []).map((m) => {
    const base = m.on_date;
    const nextDate = base ? (m.recurs ? nextOccurrence(base).date : new Date(`${base}T12:00:00`)) : null;
    return { id: m.id, kind: "custom", title: m.title || "Moment", nextDate, recurs: m.recurs, auto: false, baseISO: base };
  });

  const allMoments = [...auto, ...customViews];
  // Featured = soonest upcoming (today or later).
  const upcoming = allMoments
    .filter((m) => m.nextDate && daysUntil(m.nextDate) >= 0)
    .sort((a, b) => +a.nextDate! - +b.nextDate!);
  const featured = upcoming[0];

  const listSorted = [...allMoments].sort((a, b) => {
    if (!a.nextDate) return 1;
    if (!b.nextDate) return -1;
    return +a.nextDate - +b.nextDate;
  });

  async function shareMoment(m: MomentView) {
    // STUB: the community/Circle posting backend isn't wired yet. We produce a
    // shareable text card and hand it to the OS share sheet (or clipboard),
    // rather than failing. Wire the real community destination later.
    const text = `${name}: ${m.title}${m.nextDate ? ` — ${whenLabel(m.nextDate)}` : ""} 🦜 #TheKyaProject`;
    try {
      if (navigator.share) { await navigator.share({ title: `${name} — ${m.title}`, text }); return; }
      await navigator.clipboard.writeText(text);
      toast.success("Share card copied — community posting is coming soon.");
    } catch { /* cancelled */ }
  }

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/birds/$birdId" params={{ birdId }} aria-label="Back to bird record" className="-ml-1 rounded p-1 text-[#1a3d2e]">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="flex-1 text-base font-medium text-[#1a3d2e]">Moments</h1>
          <button type="button" onClick={() => setAdding(true)} className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-[#e8f0ec] px-3.5 text-sm font-medium text-[#1a3d2e]">
            <Plus className="size-4" /> Add
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {/* Featured — the one lime accent */}
        {featured && (
          <section className="rounded-[16px] bg-[#cdeab0] p-5 text-[#1a3d2e]">
            <p className="flex items-center gap-1.5 text-xs font-medium opacity-80">
              <Sparkles className="size-3.5" /> Coming up
            </p>
            <p className="mt-1 text-xl font-medium">{featured.title} — {whenLabel(featured.nextDate!)}</p>
            <p className="mt-1 text-sm opacity-80">{featured.nextDate && fullDate(featured.nextDate)} · a milestone worth marking.</p>
            <button type="button" onClick={() => shareMoment(featured)} className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-4 text-sm font-medium text-white">
              <Share2 className="size-4" /> Share to community
            </button>
          </section>
        )}

        {allMoments.length === 0 ? (
          <section className="rounded-[16px] bg-[#efe9da] p-8 text-center">
            <CalendarHeart className="mx-auto size-7 text-[#2d6a4f]" />
            <p className="mt-3 text-sm text-[#1a3d2e]">No moments yet. Add {name}'s hatch date and the day they came home in Identity, or add your own milestone here.</p>
            <button type="button" onClick={() => setAdding(true)} className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-5 text-sm font-medium text-white">
              <Plus className="size-4" /> Add a moment
            </button>
          </section>
        ) : (
          <section>
            <h3 className="mb-2 px-1 text-sm font-medium text-[#1a3d2e]">All moments</h3>
            <div className="overflow-hidden rounded-[16px] bg-white ring-1 ring-[#e3dcc9]">
              {listSorted.map((m, i) => (
                <div key={m.id} className={`flex items-center gap-3 px-4 py-3 ${i < listSorted.length - 1 ? "border-b border-[#ece6d6]" : ""}`}>
                  <span className="shrink-0 text-[#2d6a4f]"><MomentIcon kind={m.kind} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#1a3d2e]">{m.title}</p>
                    <p className="truncate text-xs text-[#8a897f]">
                      {m.nextDate ? (m.recurs ? `Every year · ${monthDay(m.nextDate)}` : fullDate(m.nextDate)) : "No date"}
                    </p>
                  </div>
                  {m.auto ? (
                    <span className="shrink-0 rounded-full bg-[#e8e1d0] px-2 py-0.5 text-[10px] font-medium text-[#5f5e5a]">Auto</span>
                  ) : (
                    <button type="button" onClick={() => shareMoment(m)} aria-label="Share" className="grid size-9 shrink-0 place-items-center rounded-full text-[#2d6a4f] active:bg-[#f4f1e8]">
                      <Share2 className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        <p className="px-1 text-xs leading-relaxed text-[#8a897f]">
          Moments come from {name}'s record, and you can add your own. Sharing posts to the Kya Project community.
        </p>
      </main>

      {adding && (
        <AddMoment
          birdId={birdId}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["moments", birdId] }); }}
        />
      )}
    </div>
  );
}

function MomentIcon({ kind }: { kind: MomentView["kind"] }) {
  if (kind === "birthday") return <Cake className="size-5" />;
  if (kind === "custom") return <Star className="size-5" />;
  return <CalendarHeart className="size-5" />;
}

function AddMoment({ birdId, onClose, onSaved }: { birdId: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [recurs, setRecurs] = useState(true);
  const [saving, setSaving] = useState(false);
  const valid = title.trim().length > 0 && !!date;

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("moments").insert({
        bird_id: birdId, kind: "custom", title: title.trim(), on_date: date, recurs, auto_generated: false,
      });
      if (error) throw error;
      toast.success("Moment added.");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save the moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={saving ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-[#f4f1e8] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#1a3d2e]">Add a moment</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-[#5f5e5a]"><X className="size-5" /></button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. First flight" className="h-11 w-full rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] px-3 text-sm text-[#1a3d2e]" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] px-3 text-sm text-[#1a3d2e]" />
        </label>
        <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-2.5 text-sm font-medium text-[#1a3d2e]">
          <input type="checkbox" className="size-5 accent-[#1a3d2e]" checked={recurs} onChange={(e) => setRecurs(e.target.checked)} />
          Repeats every year
        </label>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={save} disabled={!valid || saving} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-[#1a3d2e] text-sm font-medium text-white disabled:opacity-50">
            <Check className="size-4" /> {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="min-h-[44px] rounded-[14px] border border-[#c8bfa6] px-4 text-sm font-medium text-[#5f5e5a]">Cancel</button>
        </div>
      </div>
    </div>
  );
}
