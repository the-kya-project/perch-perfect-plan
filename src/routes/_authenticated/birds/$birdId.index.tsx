import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useBirdRole } from "@/lib/useBirdRole";
import { AgePicker } from "@/components/BirdPickers";
import { PhotoCropper } from "@/components/PhotoCropper";
import { useServerFn } from "@tanstack/react-start";
import { getPendingHandoff, cancelHandoff, makePermanent } from "@/lib/handoff.functions";
import { toast } from "sonner";
import {
  ArrowLeft, Feather, Scale, BookOpen, IdCard, CalendarHeart, ClipboardList,
  ChevronRight, Plus, FileText, TrendingUp, TrendingDown, Minus, Activity, Pencil,
  Check, X, Users, ArrowRightLeft, Heart, Loader2,
} from "lucide-react";

// Bird-record home — the new landing when you tap a bird. A glanceable hub for
// the living record; the care plan is one facet among several. Facet screens
// (weight, journal, identity, moments, vet summary) are stubs for now.

export const Route = createFileRoute("/_authenticated/birds/$birdId/")({
  head: () => ({ meta: [{ title: "Bird record — Parrot Care Co-Pilot" }] }),
  component: BirdRecordHome,
});

type Trend = "steady" | "up" | "down";

// Shared bird-record query — used by the route header and the body. Same
// queryKey/select, so calling it in both places is deduped by React Query.
export function useBirdRecord(birdId: string) {
  return useQuery({
    queryKey: ["bird-record", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, owner_id, name, species, age, sex, flight_status, birth_date, photo_url, photo_position, setup_complete, is_foster, became_permanent_on, intake_date")
        .eq("id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

function BirdRecordHome() {
  const { birdId } = Route.useParams();
  const { data: bird } = useBirdRecord(birdId);
  const name = bird?.name ?? "This bird";
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
        <BirdRecordBody birdId={birdId} />
      </main>
    </div>
  );
}

// The bird-record body without page chrome — reused as solo Home (with the
// global header + Today panel + Household row wrapped around it on /dashboard).
export function BirdRecordBody({ birdId }: { birdId: string }) {
  const qc = useQueryClient();
  const role = useBirdRole(birdId);
  const isOwner = role === "owner";
  const isHousehold = role === "household";

  const { data: bird } = useBirdRecord(birdId);

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
        .select("id, log_date, triage_status, created_at, source")
        .eq("bird_id", birdId)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; log_date: string; triage_status: string; created_at: string }>;
    },
  });

  // Strip avatar is rendered at 64px (size-16); request 256px so it stays sharp
  // on retina/3x devices when scaled down from the bird's main photo source.
  const photoOf = useBirdPhotos([bird?.photo_url], 256);
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
    ...(weights ?? []).map((w) => ({ kind: "weight" as const, at: w.measured_at, id: `w-${w.id}`, grams: w.grams, source: w.source as string | null })),
    ...(checkins ?? []).map((c: any) => ({ kind: "checkin" as const, at: c.created_at, id: `c-${c.id}`, status: c.triage_status, source: (c.source as string | null) ?? "sitter" })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 12);

  const name = bird?.name ?? "This bird";
  const initial = (bird?.name?.slice(0, 1) ?? "?").toUpperCase();

  // Reframe-in-place: dragging the strip photo saves its crop position. Upload
  // of a new photo lives on the Identity facet, not here.
  async function savePhotoPosition(pos: string) {
    if (!bird) return;
    const { error } = await supabase.from("birds").update({ photo_position: pos } as any).eq("id", birdId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["bird-record", birdId] });
    qc.invalidateQueries({ queryKey: ["bird-identity", birdId] });
    qc.invalidateQueries({ queryKey: ["bird", birdId] });
    qc.invalidateQueries({ queryKey: ["birds"] });
  }

  return (
    <>
        {/* Identity strip — photo + name + species/age. When a photo is set the
            circle is filled by the photo (centered by default) and is draggable
            to reframe which part shows; the crop position auto-saves. Adding or
            replacing the photo itself lives on the Identity facet. */}
        <section className="flex items-center gap-4">
          {photo && isOwner ? (
            <PhotoCropper
              src={photo.url}
              position={bird?.photo_position}
              shape="circle"
              size={64}
              showHint={false}
              onChange={() => {}}
              onCommit={savePhotoPosition}
            />
          ) : photo ? (
            // Household members view the photo but can't reframe it (owner-only).
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e3dcc9] ring-1 ring-[#d8cfb8]">
              <img src={photo.url} alt={name} style={{ objectPosition: bird?.photo_position ?? "50% 50%" }} className="size-full object-cover" />
            </div>
          ) : (
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e3dcc9] ring-1 ring-[#d8cfb8]">
              <span className="text-2xl font-medium text-[#2d6a4f]">{initial}</span>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-xl font-medium text-[#1a3d2e]">{name}</h2>
              {bird?.is_foster && (
                <span className="shrink-0 rounded-full bg-[#cfe3dc] px-2 py-0.5 text-[10px] font-medium text-[#1a5e3f]">Foster</span>
              )}
            </div>
            <p className="mt-0.5 truncate text-sm text-[#5f5e5a]">
              {[bird?.species || "Parrot", bird?.age].filter(Boolean).join(" · ")}
            </p>
            {isHousehold && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#cfe3dc] px-2 py-0.5 text-[10px] font-medium text-[#1a5e3f]">
                Household · view &amp; log
              </span>
            )}
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

        {/* Handoff — prominent for fosters (this is the point of fostering). */}
        {isOwner && bird?.is_foster && <HandoffSection birdId={birdId} name={name} isFoster prominent />}

        {/* Basic info — Species / Age / Sex / Flight. Editable only by the
            owner; household members see it read-only. */}
        {bird && <BasicInfoCard birdId={birdId} bird={bird} editable={isOwner} />}

        {/* "Create care plan" CTA for brand-new birds (owner only) — launches the
            wizard at Food (step 1). Collapses into the Care plan facet row once
            setup_complete. Household members can't create/edit the care plan. */}
        {bird && !bird.setup_complete && isOwner && (
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
            <FacetRow to="/birds/$birdId/identity" birdId={birdId} icon={<IdCard className="size-5" />} label="Identity" sub="Chip, band, hatch date, origin, photo" />
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
                      {fmtDate(r.at)}
                      {r.source === "sitter" && <span className="ml-1.5 rounded-full bg-[#d6e8dc] px-1.5 py-0.5 text-[10px] font-medium text-[#1a3d2e]">Sitter</span>}
                      {r.source === "household" && <span className="ml-1.5 rounded-full bg-[#cfe3dc] px-1.5 py-0.5 text-[10px] font-medium text-[#1a5e3f] ring-1 ring-[#1a5e3f]/25">Household</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Access hub — owner only. Household members manage nothing here. */}
        {isOwner && (
          <Link
            to="/birds/$birdId/access"
            params={{ birdId }}
            className="flex min-h-[44px] items-center justify-center gap-2 text-sm font-medium text-[#5f5e5a] active:scale-[0.99]"
          >
            <Users className="size-4" /> Who can see {name}'s record
          </Link>
        )}

        {/* Handoff — quiet for non-foster birds (life happens, but don't tempt
            accidental use). */}
        {isOwner && bird && !bird.is_foster && <HandoffSection birdId={birdId} name={name} isFoster={false} prominent={false} />}
    </>
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

// Handoff + foster-fail actions. Shows a pending-handoff banner with cancel,
// otherwise a "Hand off" entry (prominent for fosters) and, for fosters, the
// quiet "Welcome to the flock" action.
function HandoffSection({ birdId, name, isFoster, prominent }: { birdId: string; name: string; isFoster: boolean; prominent: boolean }) {
  const qc = useQueryClient();
  const getPending = useServerFn(getPendingHandoff);
  const cancel = useServerFn(cancelHandoff);
  const permanent = useServerFn(makePermanent);
  const navigate = useNavigate();

  const { data: pending } = useQuery({
    queryKey: ["pending-handoff", birdId],
    queryFn: () => getPending({ data: { birdId } }),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => cancel({ data: { handoffId: id } }),
    onSuccess: () => { toast.success("Handoff canceled."); qc.invalidateQueries({ queryKey: ["pending-handoff", birdId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't cancel."),
  });
  const permanentM = useMutation({
    mutationFn: () => permanent({ data: { birdId } }),
    onSuccess: () => {
      toast.success(`${name} joined the flock! 🎉`);
      ["bird-record", "moments", "birds", "bird-role"].forEach((k) => qc.invalidateQueries({ queryKey: k === "birds" ? ["birds"] : [k, birdId] }));
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't update."),
  });

  if (pending?.pending) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] border border-dashed bg-[#f6e7c4]/30 p-3" style={{ borderColor: "#d8b25a" }}>
        <Loader2 className="size-4 shrink-0 text-[#854F0B]" />
        <p className="min-w-0 flex-1 text-xs text-[#854F0B]">
          Handoff pending — to <span className="font-medium">{pending.pending.email}</span>
        </p>
        <button type="button" disabled={cancelM.isPending} onClick={() => cancelM.mutate(pending.pending!.id)} className="shrink-0 text-xs font-medium text-[#854F0B] underline disabled:opacity-50">
          Cancel
        </button>
      </div>
    );
  }

  const handoffBtn = (
    <button
      type="button"
      onClick={() => navigate({ to: "/birds/$birdId/handoff", params: { birdId } })}
      className={prominent
        ? "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] border border-[#c8bfa6] bg-white text-sm font-medium text-[#1a3d2e] active:scale-[0.99]"
        : "flex min-h-[44px] w-full items-center justify-center gap-2 text-sm font-medium text-[#5f5e5a] active:scale-[0.99]"}
    >
      <ArrowRightLeft className="size-4" /> Hand off {name}
    </button>
  );

  if (!isFoster) return handoffBtn;

  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        disabled={permanentM.isPending}
        onClick={() => { if (window.confirm(`Make ${name} a permanent member of your flock? You can change your mind later.`)) permanentM.mutate(); }}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] border border-[#c8bfa6] bg-white text-sm font-medium text-[#1a3d2e] active:scale-[0.99] disabled:opacity-50"
      >
        <Heart className="size-4" /> Welcome to the flock
      </button>
      <button
        type="button"
        onClick={() => navigate({ to: "/birds/$birdId/handoff", params: { birdId } })}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-[14px] border border-[#c8bfa6] bg-white text-sm font-medium text-[#1a3d2e] active:scale-[0.99]"
      >
        <ArrowRightLeft className="size-4" /> Hand off
      </button>
    </div>
  );
}

const SEX_LABEL: Record<string, string> = { male: "Male", female: "Female", unknown: "Unknown" };
const FLIGHT_LABEL: Record<string, string> = {
  unknown: "Unknown",
  fully_flighted: "Fully flighted",
  clipped: "Clipped",
  partially_clipped: "Partially clipped",
};

// Basic info card — the bird's species, age, hatch date, sex, and flight,
// editable inline. The fields write to the same birds.* columns the Identity
// facet reads, so any edit here auto-fills the Identity tab and vice versa
// (no fork). Age and Hatch date are coupled via the shared AgePicker — picking
// a hatch date auto-derives age; clearing it re-enables the Age dropdown.
function BasicInfoCard({ birdId, bird, editable = true }: { birdId: string; bird: { species?: string | null; age?: string | null; sex?: string | null; flight_status?: string | null; birth_date?: string | null }; editable?: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    species: bird.species ?? "",
    age: bird.age ?? "",
    sex: bird.sex ?? "",
    flight_status: bird.flight_status ?? "unknown",
    birth_date: bird.birth_date ?? "",
  });

  function openEdit() {
    // Re-seed from latest props so the form shows current values, not stale state
    // from a previous edit cycle.
    setF({
      species: bird.species ?? "",
      age: bird.age ?? "",
      sex: bird.sex ?? "",
      flight_status: bird.flight_status ?? "unknown",
      birth_date: bird.birth_date ?? "",
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const clean = (v: string) => (v.trim() ? v.trim() : null);
    const { error } = await supabase.from("birds").update({
      species: clean(f.species),
      age: clean(f.age),
      sex: clean(f.sex),
      flight_status: f.flight_status || "unknown",
      birth_date: f.birth_date || null,
    } as any).eq("id", birdId);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    // Refresh every surface that displays these fields so changes appear
    // immediately on the Identity tab, the dashboard cards, and elsewhere.
    qc.invalidateQueries({ queryKey: ["bird-record", birdId] });
    qc.invalidateQueries({ queryKey: ["bird-identity", birdId] });
    qc.invalidateQueries({ queryKey: ["bird", birdId] });
    qc.invalidateQueries({ queryKey: ["birds"] });
    toast.success("Saved.");
    setEditing(false);
  }

  const speciesView = bird.species?.trim() || "Not set";
  const ageView = bird.age?.trim() || "Not set";
  const sexView = bird.sex && SEX_LABEL[bird.sex] ? SEX_LABEL[bird.sex] : (bird.sex || "Not set");
  const flightView = FLIGHT_LABEL[bird.flight_status ?? "unknown"] ?? "Unknown";
  const hatchView = bird.birth_date
    ? new Date(bird.birth_date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Not set";

  return (
    <section className="overflow-hidden rounded-[16px] bg-white ring-1 ring-[#e3dcc9]">
      <div className="flex items-center justify-between gap-3 border-b border-[#ece6d6] px-4 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[#5f5e5a]">Basic info</h3>
        {editing ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-[#5f5e5a]">
              <X className="size-3.5" /> Cancel
            </button>
            <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-[#1a3d2e] px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
              <Check className="size-3.5" /> {saving ? "Saving…" : "Save"}
            </button>
          </div>
        ) : editable ? (
          <button type="button" onClick={openEdit} className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-[#1a3d2e]">
            <Pencil className="size-3.5" /> Edit
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-3 p-4">
          <BasicField label="Species">
            <input className="input" value={f.species} maxLength={80} onChange={(e) => setF((p) => ({ ...p, species: e.target.value }))} />
          </BasicField>
          {/* Age + Hatch date are coupled — AgePicker disables Age when a
              hatch date is set and derives age from it. Stacked so each gets
              its own line (the wizard uses the default grid layout). */}
          <AgePicker
            layout="stacked"
            age={f.age}
            birthDate={f.birth_date}
            onChange={(next) => setF((p) => ({ ...p, age: next.age, birth_date: next.birthDate ?? "" }))}
          />
          <BasicField label="Sex">
            <select className="input" value={f.sex} onChange={(e) => setF((p) => ({ ...p, sex: e.target.value }))}>
              <option value="">Not set</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="unknown">Unknown</option>
            </select>
          </BasicField>
          <BasicField label="Flight">
            <select className="input" value={f.flight_status} onChange={(e) => setF((p) => ({ ...p, flight_status: e.target.value }))}>
              <option value="unknown">Unknown</option>
              <option value="fully_flighted">Fully flighted</option>
              <option value="clipped">Clipped</option>
              <option value="partially_clipped">Partially clipped</option>
            </select>
          </BasicField>
        </div>
      ) : (
        <dl>
          <BasicRow label="Species" value={speciesView} />
          <BasicRow label="Age" value={ageView} />
          <BasicRow label="Hatch date" value={hatchView} />
          <BasicRow label="Sex" value={sexView} />
          <BasicRow label="Flight" value={flightView} last />
        </dl>
      )}
    </section>
  );
}

function BasicRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-4 py-3 ${last ? "" : "border-b border-[#ece6d6]"}`}>
      <dt className="text-sm text-[#5f5e5a]">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium text-[#1a3d2e]">{value}</dd>
    </div>
  );
}

function BasicField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5f5e5a]">{label}</span>
      {children}
    </label>
  );
}
