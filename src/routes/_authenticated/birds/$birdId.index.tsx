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
import { InkHero, PhotoHero, IconTile, LimeStat, StatusPill, SectionHead, RecordRow, Card, PrimaryButton } from "@/components/system";
import { toast } from "sonner";
import {
  Feather, Scale, BookOpen, IdCard, CalendarHeart, ClipboardList,
  Plus, FileText, Activity, Pencil,
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
  return (
    <div className="min-h-screen bg-[var(--cream)] pb-24">
      <div className="mx-auto max-w-md">
        <BirdRecordHero birdId={birdId} />
        <main className="space-y-4 px-5 pt-5">
          <BirdRecordBody birdId={birdId} />
        </main>
      </div>
    </div>
  );
}

// PhotoHero + InkHero combo — the bird-record route's anchor. (Solo Home embeds
// only BirdRecordBody, under its own greeting hero, so this isn't doubled.)
function BirdRecordHero({ birdId }: { birdId: string }) {
  const navigate = useNavigate();
  const { data: bird } = useBirdRecord(birdId);
  const photoOf = useBirdPhotos([bird?.photo_url], 800);
  const photo = photoOf(bird?.photo_url);
  const name = bird?.name ?? "This bird";
  const meta = [bird?.species || "Parrot", bird?.age].filter(Boolean).join(" · ");
  const since = bird?.is_foster && bird?.intake_date ? `With you since ${fmtMonthYear(bird.intake_date)}` : null;
  return (
    <>
      <PhotoHero src={photo?.url ?? undefined} height={232} alt={name} onBack={() => navigate({ to: "/dashboard" })} />
      <InkHero
        eyebrow={bird?.is_foster ? "In your care" : undefined}
        headline={name}
        body={[meta, since].filter(Boolean).join(" · ")}
        cta={{ label: "View identity", tone: "arrow", onPress: () => navigate({ to: "/birds/$birdId/identity", params: { birdId } }) }}
      />
    </>
  );
}

// The bird-record body without page chrome — reused as solo Home (with the
// global header + Today panel + Household row wrapped around it on /dashboard).
export function BirdRecordBody({ birdId }: { birdId: string }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const role = useBirdRole(birdId);
  const isOwner = role === "owner";

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
      {/* Latest weight */}
      <LimeStat
        eyebrow="Latest weight"
        value={current ? <>{current.grams}<span className="text-[16px] font-[400] text-[var(--moss)]"> g</span></> : "—"}
        meta={current
          ? <><StatusPill tone={trend === "down" ? "attention" : "good"}>{trendLabel(trend)}</StatusPill><span className="t-meta">last weighed {fmtDate(current.measured_at)}</span></>
          : <span className="text-[13px] text-[var(--ink2)]">No weight yet — log the first</span>}
        action={
          <button type="button" aria-label="Log weight" onClick={() => navigate({ to: "/birds/$birdId/weight", params: { birdId } })} className="grid size-11 place-items-center rounded-full bg-[var(--ink)] text-[var(--lime)] active:scale-95">
            <Plus className="size-5" />
          </button>
        }
      />

      {/* Create care plan (fresh birds, owner only) — the screen's lime primary */}
      {bird && !bird.setup_complete && isOwner && (
        <PrimaryButton tone="lime" icon={<ClipboardList className="size-4" />} onPress={() => navigate({ to: "/birds/$birdId/setup", params: { birdId }, search: { step: 1 } })}>
          Create care plan
        </PrimaryButton>
      )}

      {/* Handoff — prominent for fosters (this is the point of fostering). */}
      {isOwner && bird?.is_foster && <HandoffSection birdId={birdId} name={name} isFoster prominent />}

      {/* Basic info — Species / Age / Sex / Flight (owner-editable). */}
      {bird && <BasicInfoCard birdId={birdId} bird={bird} editable={isOwner} />}

      {/* Record list */}
      <section>
        <SectionHead title={`${name}'s record`} />
        <Card>
          {bird?.setup_complete && (
            <RecordRow leading={<IconTile size={38} icon={<ClipboardList className="size-5" />} />} title="Care plan" subtitle="Food, routine, behavior, home, health" onClick={() => navigate({ to: "/birds/$birdId/plan", params: { birdId } })} />
          )}
          <RecordRow leading={<IconTile size={38} icon={<Scale className="size-5" />} />} title="Weight" subtitle={weightCount > 0 ? `${weightCount} ${weightCount === 1 ? "entry" : "entries"} · ${trendLabel(trend).toLowerCase()}` : "Not started"} onClick={() => navigate({ to: "/birds/$birdId/weight", params: { birdId } })} />
          <RecordRow leading={<IconTile size={38} icon={<BookOpen className="size-5" />} />} title="Journal" subtitle="Molt, meds, vet visits" onClick={() => navigate({ to: "/birds/$birdId/journal", params: { birdId } })} />
          <RecordRow leading={<IconTile size={38} icon={<IdCard className="size-5" />} />} title="Identity" subtitle="Chip, band, hatch date, origin, photo" onClick={() => navigate({ to: "/birds/$birdId/identity", params: { birdId } })} />
          <RecordRow leading={<IconTile size={38} icon={<CalendarHeart className="size-5" />} />} title="Moments" subtitle="Mark the days worth remembering" onClick={() => navigate({ to: "/birds/$birdId/moments", params: { birdId } })} />
          <RecordRow leading={<IconTile size={38} icon={<FileText className="size-5" />} />} title="Vet summary" subtitle="One clean sheet for the vet" onClick={() => navigate({ to: "/birds/$birdId/vet-summary", params: { birdId } })} />
          <RecordRow leading={<IconTile size={38} icon={<Activity className="size-5" />} />} title="Run a health scan" subtitle="The same daily check a sitter runs" onClick={() => navigate({ to: "/birds/$birdId/scan", params: { birdId } })} last />
        </Card>
      </section>

      {/* Recent */}
      <section>
        <SectionHead title="Recent" />
        {recent.length === 0 ? (
          <div className="rounded-[16px] bg-[var(--cream2)] p-6 text-center text-[14px] text-[var(--mute)]">
            Nothing logged yet. Weights and sitter check-ins will show up here.
          </div>
        ) : (
          <Card>
            {recent.map((r, i) => (
              <RecordRow
                key={r.id}
                leading={<IconTile size={34} tone="pale" icon={r.kind === "weight" ? <Scale className="size-4" /> : <Feather className="size-4" />} />}
                title={r.kind === "weight" ? `Weight logged — ${r.grams} g` : `Daily check-in — ${checkinLabel(r.status)}`}
                subtitle={fmtDate(r.at)}
                trailing={r.source === "household" ? <StatusPill tone="household">Household</StatusPill> : r.source === "sitter" ? <StatusPill tone="off">Sitter</StatusPill> : undefined}
                chevron={false}
                last={i === recent.length - 1}
              />
            ))}
          </Card>
        )}
      </section>

      {/* Sharing — owner only */}
      {isOwner && (
        <Card>
          <RecordRow leading={<IconTile size={38} tone="pale" icon={<Users className="size-5" />} />} title={`Who can see ${name}'s record`} subtitle="Household & sitters" onClick={() => navigate({ to: "/birds/$birdId/access", params: { birdId } })} last />
        </Card>
      )}

      {/* Handoff — quiet for non-foster birds. */}
      {isOwner && bird && !bird.is_foster && <HandoffSection birdId={birdId} name={name} isFoster={false} prominent={false} />}
    </>
  );
}

function trendLabel(trend: Trend): string {
  return trend === "up" ? "Up" : trend === "down" ? "Down" : "Steady";
}

function checkinLabel(status: string): string {
  return status === "red" ? "concern flagged" : status === "yellow" ? "something to check" : "all clear";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtMonthYear(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
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

  const outlineBtn = "flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-white text-[15px] font-[500] text-[var(--ink)] ring-1 ring-[var(--line)] active:scale-[0.99] disabled:opacity-50";

  if (pending?.pending) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] p-3" style={{ background: "var(--amber-fill)", border: "1px solid var(--amber-line)" }}>
        <Loader2 className="size-4 shrink-0 text-[var(--amber-ink)]" />
        <p className="min-w-0 flex-1 text-[12.5px] text-[var(--amber-ink)]">
          Handoff pending — to <span className="font-[500]">{pending.pending.email}</span>
        </p>
        <button type="button" disabled={cancelM.isPending} onClick={() => cancelM.mutate(pending.pending!.id)} className="shrink-0 text-[12.5px] font-[500] text-[var(--amber-ink)] underline disabled:opacity-50">
          Cancel
        </button>
      </div>
    );
  }

  const handoffBtn = (
    <button
      type="button"
      onClick={() => navigate({ to: "/birds/$birdId/handoff", params: { birdId } })}
      className={prominent ? `w-full ${outlineBtn}` : "flex min-h-[44px] w-full items-center justify-center gap-2 text-[14px] font-[500] text-[var(--mute)] active:scale-[0.99]"}
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
        className={outlineBtn}
      >
        <Heart className="size-4" /> Welcome to the flock
      </button>
      <button type="button" onClick={() => navigate({ to: "/birds/$birdId/handoff", params: { birdId } })} className={outlineBtn}>
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
        <h3 className="t-eyebrow text-[var(--mute2)]">Basic info</h3>
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
      <span className="t-eyebrow mb-1 block text-[var(--mute2)]">{label}</span>
      {children}
    </label>
  );
}
