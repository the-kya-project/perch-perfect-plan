import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import {
  ArrowLeft, Feather, Scale, BookOpen, IdCard, CalendarHeart, ClipboardList,
  ChevronRight, Plus, FileText, TrendingUp, TrendingDown, Minus, Activity,
} from "lucide-react";

// Bird-record home — the new landing when you tap a bird. A glanceable hub for
// the living record; the care plan is one facet among several. Facet screens
// (weight, journal, identity, moments, vet summary) are stubs for now.

export const Route = createFileRoute("/_authenticated/birds/$birdId/")({
  head: () => ({ meta: [{ title: "Bird record — Parrot Care Co-Pilot" }] }),
  component: BirdRecordHome,
});

type Trend = "steady" | "up" | "down";

function BirdRecordHome() {
  const { birdId } = Route.useParams();

  const { data: bird } = useQuery({
    queryKey: ["bird-record", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, name, species, age, photo_url, photo_position, setup_complete")
        .eq("id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: weights } = useQuery({
    queryKey: ["bird-weights", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_entries")
        .select("id, grams, measured_at, source")
        .eq("bird_id", birdId)
        .order("measured_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; grams: number; measured_at: string; source: string }>;
    },
  });

  const { data: checkins } = useQuery({
    queryKey: ["bird-checkins", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_logs")
        .select("id, log_date, triage_status, created_at")
        .eq("bird_id", birdId)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; log_date: string; triage_status: string; created_at: string }>;
    },
  });

  const photoOf = useBirdPhotos([bird?.photo_url], 96);
  const photo = photoOf(bird?.photo_url);

  const weightCount = weights?.length ?? 0;
  const current = weights?.[0];
  const trend: Trend = (() => {
    if (!weights || weights.length < 2) return "steady";
    const diff = weights[0].grams - weights[1].grams;
    if (Math.abs(diff) < 1) return "steady";
    return diff > 0 ? "up" : "down";
  })();

  // Merge weight entries + sitter check-ins into one newest-first feed.
  const recent = [
    ...(weights ?? []).map((w) => ({ kind: "weight" as const, at: w.measured_at, id: `w-${w.id}`, grams: w.grams, sitter: w.source === "sitter" })),
    ...(checkins ?? []).map((c) => ({ kind: "checkin" as const, at: c.created_at, id: `c-${c.id}`, status: c.triage_status, sitter: true })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 12);

  const name = bird?.name ?? "This bird";
  const initial = (bird?.name?.slice(0, 1) ?? "?").toUpperCase();

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/dashboard" aria-label="Back to home" className="-ml-1 rounded p-1 text-[#1a3d2e]">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-base font-medium text-[#1a3d2e]">{name}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {/* Identity strip */}
        <section className="flex items-center gap-4">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e3dcc9] ring-1 ring-[#d8cfb8]">
            {photo ? (
              <img
                src={photo.url}
                alt={name}
                onError={(e) => { if (photo.original && e.currentTarget.src !== photo.original) e.currentTarget.src = photo.original; }}
                style={{ objectPosition: bird?.photo_position ?? "50% 20%" }}
                className="size-full object-cover"
              />
            ) : (
              <span className="text-2xl font-medium text-[#2d6a4f]">{initial}</span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-medium text-[#1a3d2e]">{name}</h2>
            <p className="mt-0.5 truncate text-sm text-[#5f5e5a]">
              {[bird?.species || "Parrot", bird?.age].filter(Boolean).join(" · ")}
            </p>
          </div>
        </section>

        {/* Glance tile: Weight (Next reminder hidden until reminders ship) */}
        <section className="grid grid-cols-2 gap-3">
          <Link to="/birds/$birdId/weight" params={{ birdId }} className="rounded-[16px] bg-[#efe9da] p-4 active:scale-[0.99]">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[#5f5e5a]">
              <Scale className="size-3.5" /> Weight
            </div>
            {current ? (
              <>
                <p className="mt-1.5 text-2xl font-medium leading-none text-[#1a3d2e]">
                  {current.grams}<span className="ml-1 text-sm font-normal text-[#5f5e5a]">g</span>
                </p>
                <TrendPill trend={trend} />
              </>
            ) : (
              <p className="mt-2 text-sm text-[#5f5e5a]">Log the first weight</p>
            )}
          </Link>
        </section>

        {/* Quick actions */}
        <section className="grid grid-cols-2 gap-3">
          <Link
            to="/birds/$birdId/weight"
            params={{ birdId }}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-[#cdeab0] py-3 text-sm font-medium text-[#1a3d2e] active:scale-[0.99]"
          >
            <Plus className="size-4" /> Log weight
          </Link>
          <Link
            to="/birds/$birdId/vet-summary"
            params={{ birdId }}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white active:scale-[0.99]"
          >
            <FileText className="size-4" /> Vet summary
          </Link>
        </section>

        {/* Run a health scan — the same scan a sitter runs */}
        <Link
          to="/birds/$birdId/scan"
          params={{ birdId }}
          className="flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] border border-[#c8bfa6] bg-white text-sm font-medium text-[#1a3d2e] active:scale-[0.99]"
        >
          <Activity className="size-4" /> Run a health scan
        </Link>

        {/* "Create care plan" CTA for brand-new birds: launches the wizard at
            Food (step 1). Once the wizard finishes (setup_complete=true), this
            collapses into the Care plan facet row that opens the overview. */}
        {bird && !bird.setup_complete && (
          <Link
            to="/birds/$birdId/setup"
            params={{ birdId }}
            search={{ step: 1 }}
            className="flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white active:scale-[0.99]"
          >
            <ClipboardList className="size-4" /> Create care plan
          </Link>
        )}

        {/* Record facets */}
        <section>
          <h3 className="mb-2 px-1 text-sm font-medium text-[#1a3d2e]">{name}'s record</h3>
          <div className="overflow-hidden rounded-[16px] bg-white ring-1 ring-[#e3dcc9]">
            {bird?.setup_complete && (
              <FacetRow to="/birds/$birdId/plan" birdId={birdId} icon={<ClipboardList className="size-5" />} label="Care plan" sub="Food, routine, behavior, home, health" />
            )}
            <FacetRow to="/birds/$birdId/weight" birdId={birdId} icon={<Scale className="size-5" />} label="Weight" sub={weightCount > 0 ? `${weightCount} ${weightCount === 1 ? "entry" : "entries"} · ${trend}` : "Not started"} />
            <FacetRow to="/birds/$birdId/journal" birdId={birdId} icon={<BookOpen className="size-5" />} label="Journal" sub="Molt, meds, vet visits" />
            <FacetRow to="/birds/$birdId/identity" birdId={birdId} icon={<IdCard className="size-5" />} label="Identity" sub="Chip, band, origin" />
            <FacetRow to="/birds/$birdId/moments" birdId={birdId} icon={<CalendarHeart className="size-5" />} label="Moments" sub="Mark the days worth remembering" last />
          </div>
        </section>

        {/* Recent feed */}
        <section>
          <h3 className="mb-2 px-1 text-sm font-medium text-[#1a3d2e]">Recent</h3>
          {recent.length === 0 ? (
            <div className="rounded-[16px] bg-[#efe9da] p-6 text-center text-sm text-[#5f5e5a]">
              Nothing logged yet. Weights and sitter check-ins will show up here.
            </div>
          ) : (
            <ul className="space-y-2">
              {recent.map((r) => (
                <li key={r.id} className="flex items-center gap-3 rounded-[14px] bg-white p-3 ring-1 ring-[#e3dcc9]">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#efe9da] text-[#1a3d2e]">
                    {r.kind === "weight" ? <Scale className="size-4" /> : <Feather className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[#1a3d2e]">
                      {r.kind === "weight" ? `Weight logged — ${r.grams} g` : `Daily check-in — ${checkinLabel(r.status)}`}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8a897f]">
                      {fmtDate(r.at)}{r.sitter && <span className="ml-1.5 rounded-full bg-[#d6e8dc] px-1.5 py-0.5 text-[10px] font-medium text-[#1a3d2e]">Sitter</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function TrendPill({ trend }: { trend: Trend }) {
  const map = {
    steady: { label: "Steady", icon: <Minus className="size-3" />, cls: "bg-[#d6e8dc] text-[#1a3d2e]" },
    up: { label: "Up", icon: <TrendingUp className="size-3" />, cls: "bg-[#e8e1d0] text-[#5f5e5a]" },
    down: { label: "Down", icon: <TrendingDown className="size-3" />, cls: "bg-[#e8e1d0] text-[#5f5e5a]" },
  }[trend];
  return (
    <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${map.cls}`}>
      {map.icon} {map.label}
    </span>
  );
}

type FacetTo =
  | "/birds/$birdId/plan"
  | "/birds/$birdId/weight"
  | "/birds/$birdId/journal"
  | "/birds/$birdId/identity"
  | "/birds/$birdId/moments";

function FacetRow({ to, birdId, icon, label, sub, last }: { to: FacetTo; birdId: string; icon: React.ReactNode; label: string; sub: string; last?: boolean }) {
  return (
    <Link
      to={to}
      params={{ birdId }}
      className={`flex min-h-[56px] items-center gap-3 px-4 py-3 active:bg-[#f4f1e8] ${last ? "" : "border-b border-[#ece6d6]"}`}
    >
      <span className="shrink-0 text-[#2d6a4f]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[#1a3d2e]">{label}</span>
        <span className="block truncate text-xs text-[#8a897f]">{sub}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-[#bcb6a3]" />
    </Link>
  );
}

function checkinLabel(status: string): string {
  return status === "red" ? "concern flagged" : status === "yellow" ? "something to check" : "all clear";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
