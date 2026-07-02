import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { activeOwnerBirdsMin } from "@/lib/activeBirds";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { ArrowLeft, Trash2, ChevronDown, AlertTriangle, Eye } from "lucide-react";
import { EmergencyInfo } from "@/components/EmergencyInfo";
import { SETUP_STEPS } from "@/components/SetupShell";
// The editor renders the guided-setup step components directly so the two UIs
// are identical (same fields, pickers, autosave, clip recording).
import { BasicsStep, DayInLifeStep, PersonalityStep, OwnerTipsClipsStep, FoodWaterStep, EnvironmentStep, HealthBaselineStep, HideStepInstruction } from "./$birdId.setup";
import { SitCard } from "@/components/SitCard";
import { toast } from "sonner";
import { Disclaimer } from "@/components/Disclaimer";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability, useMyPermissions } from "@/lib/useCapability";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";


// The care-plan editor is reached via the new overview front door (/plan).
// Basics moved to the bird main page; sits/logs are not care-plan content and
// are not in the visible tab strip. The route still ACCEPTS those tab values in
// the search param so existing notification deep-links keep working.
const TAB_IDS = ["basics", "routine", "food", "behavior", "home", "health", "clips", "emergency", "sits", "logs"] as const;
type Tab = (typeof TAB_IDS)[number];
// Visible care-plan section tabs. "clips" is here so owners/editors can add or
// replace watch clips ANY time (not only in the setup wizard) — it renders the
// same OwnerTipsClipsStep + Cloudflare upload, gated by edit_care_plans like the
// other care sections. basics/sits/logs stay accessible only via `?tab=…`
// back-compat (DeleteBirdCard under basics; notifications deep-link to logs;
// sit-management under sits), not shown in the strip.
const VISIBLE_TABS: Tab[] = ["food", "routine", "behavior", "home", "health", "clips", "emergency"];

// Map each editor tab to its matching guided-setup SECTION (by SETUP_STEPS key),
// then derive the step NUMBER from the SETUP_STEPS order. Deriving by identity
// (not hardcoded numbers) keeps deep-links correct if the steps are reordered.
// sits/logs have no setup step.
const TAB_TO_STEP_KEY: Partial<Record<Tab, string>> = {
  routine: "day",
  food: "food",
  behavior: "personality",
  home: "environment",
  health: "health",
  clips: "clips",
  emergency: "emergency",
};
const TAB_LABELS: Record<Tab, string> = {
  basics: "Basics", food: "Food", routine: "Routine", behavior: "Behavior",
  home: "Home", health: "Health", clips: "Clips", emergency: "Emergency",
  sits: "Sits", logs: "Logs",
};
// Visible section tabs in the SAME order as the guided setup flow — derived
// from SETUP_STEPS so the strip and the wizard can never drift.
const ORDERED_TABS: Tab[] = (() => {
  const keyToTab = new Map(Object.entries(TAB_TO_STEP_KEY).map(([tab, key]) => [key, tab as Tab]));
  const section = SETUP_STEPS
    .map((s) => keyToTab.get(s.key))
    .filter((t): t is Tab => !!t && VISIBLE_TABS.includes(t));
  return section;
})();

const birdSearch = z.object({
  tab: z.enum(TAB_IDS).optional(),
  scan: z.string().uuid().optional(), // deep-link from a notification to a scan
});

export const Route = createFileRoute("/_authenticated/birds/$birdId/plan/editor")({
  head: () => ({ meta: [{ title: "Care plan — Kya & Co." }] }),
  validateSearch: birdSearch,
  component: BirdEditor,
});

function BirdEditor() {
  const { birdId } = Route.useParams();
  const { tab: tabParam, scan: scanParam } = Route.useSearch();
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Editor access is capability-based: edit_care_plans (the five care sections)
  // and/or manage_emergency (the Emergency tab). Members with neither are routed
  // to the read-only overview. (Wait for perms to load before redirecting so we
  // don't bounce the owner/editor mid-load.)
  const role = useBirdRole(birdId);
  const canEdit = useCapability("edit_care_plans", { birdId });
  const canEmergency = useCapability("manage_emergency", { birdId });
  const { data: perms } = useMyPermissions();
  useEffect(() => {
    if (role === "owner") return;
    if (role == null || !perms) return; // still loading
    if (!canEdit && !canEmergency) navigate({ to: "/birds/$birdId/plan", params: { birdId }, replace: true });
  }, [role, perms, canEdit, canEmergency, birdId, navigate]);
  const [tab, setTab] = useState<Tab>(tabParam ?? (scanParam ? "logs" : "food"));
  useEffect(() => { if (tabParam) setTab(tabParam); else if (scanParam) setTab("logs"); }, [tabParam, scanParam]);

  // Edge fades so the tab strip reads as scrollable.
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [tabAtStart, setTabAtStart] = useState(true);
  const [tabAtEnd, setTabAtEnd] = useState(false);
  function updateTabFades() {
    const el = tabStripRef.current;
    if (!el) return;
    setTabAtStart(el.scrollLeft <= 1);
    setTabAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }

  const { data: bird } = useQuery({
    queryKey: ["bird", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select("*").eq("id", birdId).single();
      if (error) throw error; return data;
    },
  });

  // Re-measure after the strip mounts (it only renders once the bird loads) and
  // on resize, so the right fade reliably shows when the tabs overflow.
  useEffect(() => {
    const raf = requestAnimationFrame(updateTabFades);
    window.addEventListener("resize", updateTabFades);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", updateTabFades); };
     
  }, [bird]);
  const { data: plan } = useQuery({
    queryKey: ["plan", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      return data;
    },
  });
  const { data: contacts } = useQuery({
    queryKey: ["contacts", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      return data;
    },
  });
  const { data: defaults } = useQuery({
    queryKey: ["owner-defaults"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("owner_emergency_defaults")
        .select("*")
        .eq("owner_id", u.user.id)
        .maybeSingle();
      return data;
    },
  });
  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", plan?.id],
    enabled: !!plan?.id,
    queryFn: async () => {
      const { data } = await supabase.from("routine_tasks").select("*").eq("care_plan_id", plan!.id).order("category").order("sort_order");
      return data ?? [];
    },
  });
  const { data: sits = [] } = useQuery({
    queryKey: ["sits", birdId],
    queryFn: async () => {
      const { data } = await supabase
        .from("sit_birds")
        .select("sit:sits(*)")
        .eq("bird_id", birdId);
      const rows = (data ?? []).map((r: any) => r.sit).filter(Boolean);
      rows.sort((a: any, b: any) => (a.start_date < b.start_date ? 1 : -1));
      return rows;
    },
  });

  const resolvePhoto = useBirdPhotos([bird?.photo_url], 96);

  if (!bird) return <div className="p-6 text-sm text-sage-600">Loading...</div>;

  const headerPhoto = resolvePhoto(bird.photo_url);

  // Only show tabs the user can actually edit: the Emergency tab needs
  // manage_emergency; the other five need edit_care_plans. (Owner has both.)
  const tabs = ORDERED_TABS
    .filter((id) => (id === "emergency" ? canEmergency : canEdit))
    .map((id) => ({ id, label: TAB_LABELS[id] }));

  const onPlanSaved = () => {
    qc.invalidateQueries({ queryKey: ["plan", birdId] });
    qc.invalidateQueries({ queryKey: ["bird", birdId] });
    // Reflect basics/setup changes (name, species, photo, progress) on Home.
    qc.invalidateQueries({ queryKey: ["birds"] });
  };

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-nav">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto max-w-md px-5 pt-safe pb-3">
          <div className="flex items-center gap-3">
            <Link to="/birds/$birdId/plan" params={{ birdId }} className="rounded p-1 text-sage-600" aria-label="Back to care plan overview"><ArrowLeft className="size-5" /></Link>
            {headerPhoto && (
              <div className="relative size-9 shrink-0 overflow-hidden rounded-full ring-1 ring-sage-200">
                <BirdPhotoCrop url={headerPhoto.url} original={headerPhoto.original} position={bird.photo_position ?? "50% 20%"} alt={bird.name} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold truncate">{bird.name}</h1>
              <p className="text-[10px] uppercase tracking-wider text-sage-600">{bird.species ?? "Parrot"}</p>
            </div>
            <Link
              to="/birds/$birdId/view-as-sitter"
              params={{ birdId }}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e8f0ec] px-2.5 py-1.5 text-xs font-semibold text-[#1a3d2e]"
            >
              <Eye className="size-3.5" /> View as sitter
            </Link>
          </div>
          <div className="relative mt-3">
            <div ref={tabStripRef} onScroll={updateTabFades} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${tab === t.id ? "bg-[#1a3d2e] text-white" : "bg-[#efe9da] text-[#5f5e5a]"}`}
                >
                  {t.label}
                </button>
              ))}
              <span aria-hidden className="shrink-0 pl-1" />
            </div>
            {!tabAtStart && <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#f4f1e8] to-transparent" />}
            {!tabAtEnd && <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#f4f1e8] to-transparent" />}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5 pb-28">
        {/* Every section tab renders the guided-setup step component directly, so
            the editor and the setup wizard are the exact same UI — except the
            green per-step instruction banner, hidden here via HideStepInstruction
            (it shows only in the guided setup). */}
        <HideStepInstruction.Provider value={true}>
          {/* Delete bird moved to the bird main page's "More" group (grouped with
              Hand off). The editor's basics tab is just the basics fields now. */}
          {tab === "basics" && <BasicsStep birdId={birdId} onBlockNext={() => {}} />}
          {tab === "food" && <FoodWaterStep birdId={birdId} birdName={bird.name ?? "this bird"} onBlockNext={() => {}} />}
          {tab === "home" && <EnvironmentStep birdId={birdId} birdName={bird.name ?? "this bird"} />}
          {tab === "health" && <HealthBaselineStep birdId={birdId} birdName={bird.name ?? "this bird"} onBlockNext={() => {}} />}
          {tab === "routine" && <DayInLifeStep birdId={birdId} birdName={bird.name ?? "this bird"} />}
          {tab === "behavior" && <PersonalityStep birdId={birdId} birdName={bird.name ?? "this bird"} />}
          {tab === "clips" && <OwnerTipsClipsStep birdId={birdId} birdName={bird.name ?? "this bird"} onBlockNext={() => {}} />}
          {tab === "emergency" && contacts && <EmergencyInfo birdId={birdId} birdName={bird.name ?? "this bird"} contacts={contacts} defaults={defaults ?? null} onSaved={() => qc.invalidateQueries({ queryKey: ["contacts", birdId] })} />}
          {tab === "sits" && <SitsPanel birdId={birdId} sits={sits} onChange={() => qc.invalidateQueries({ queryKey: ["sits", birdId] })} />}
          {tab === "logs" && <LogsPanel birdId={birdId} initialScan={scanParam} />}
        </HideStepInstruction.Provider>
      </main>

      {/* Explicit Done control. Each section autosaves as you edit (that's why
          there's no per-field Save), but owners/editors expect a clear "I'm
          finished" button — the affordance dropped in the overview-front-door
          refactor (#163), which left onPlanSaved orphaned. Sits above the owner
          nav; autosave has already persisted, so Done just refreshes derived
          views (via onPlanSaved) and returns to the overview. Everyone who
          reaches the editor is an editor (others are redirected), so it's shown
          for editors only. */}
      <div className="fixed inset-x-0 bottom-[var(--nav-spacer)] z-20 border-t border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto max-w-md px-5 py-3">
          <button
            type="button"
            onClick={() => { onPlanSaved(); navigate({ to: "/birds/$birdId/plan", params: { birdId } }); }}
            className="min-h-[48px] w-full rounded-[14px] bg-[var(--lime)] text-[15px] font-[500] text-[var(--ink)] active:scale-[0.99]"
          >
            Done
          </button>
        </div>
      </div>

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:80px;line-height:1.4}`}</style>
    </div>
  );
}

// Delete-bird control shown under the Basics tab (the only editor-only extra in
// the section tabs — the rest render the shared setup step components).
function DeleteBirdCard({ birdId, bird, plan }: { birdId: string; bird: any; plan: any }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function deleteBird() {
    if (deleteText.trim() !== (bird.name ?? "").trim()) {
      toast.error(`Type "${bird.name}" exactly to confirm.`);
      return;
    }
    setDeleting(true);
    await supabase.from("sit_birds").delete().eq("bird_id", birdId);
    await supabase.from("weight_logs").delete().eq("bird_id", birdId);
    await supabase.from("photo_logs").delete().eq("bird_id", birdId);
    await supabase.from("daily_logs").delete().eq("bird_id", birdId);
    await supabase.from("emergency_contacts").delete().eq("bird_id", birdId);
    if (plan?.id) {
      await supabase.from("routine_tasks").delete().eq("care_plan_id", plan.id);
      await supabase.from("care_plans").delete().eq("id", plan.id);
    }
    const { error } = await supabase.from("birds").delete().eq("id", birdId);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${bird.name} removed.`);
    qc.invalidateQueries({ queryKey: ["birds"] });
    navigate({ to: "/dashboard" });
  }

  return (
    <section className="rounded-2xl border-2 border-warn-red/30 bg-warn-red/5 p-4 space-y-3">
      <h2 className="text-sm font-bold text-warn-red">Danger zone</h2>
      <p className="text-xs text-sage-700">
        Permanently delete {bird.name} and all of their care plan, routine, emergency info, weight logs, daily scans, and photos. This cannot be undone.
      </p>
      {!confirmDelete ? (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-warn-red/40 bg-white px-3 py-2 text-xs font-semibold text-warn-red"
        >
          <Trash2 className="size-4" /> Delete {bird.name}
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold text-sage-700">
            Type <span className="font-bold">{bird.name}</span> to confirm
          </label>
          <input
            className="input"
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder={bird.name}
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={deleting || deleteText.trim() !== (bird.name ?? "").trim()}
              onClick={deleteBird}
              className="flex-1 rounded-xl bg-warn-red py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {deleting ? "Deleting..." : `Permanently delete ${bird.name}`}
            </button>
            <button
              type="button"
              onClick={() => { setConfirmDelete(false); setDeleteText(""); }}
              className="rounded-xl border border-sage-200 px-3 py-2.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function SitsPanel({ birdId, sits, onChange }: { birdId: string; sits: any[]; onChange: () => void }) {
  // All the owner's birds, so editing a sit here can add/remove any of them.
  const { data: allBirds = [] } = useQuery({
    queryKey: ["owner-birds-min-sit-editor"],
    queryFn: async () => {
      // Active birds only — a sit can't cover a passed bird.
      const { data } = await activeOwnerBirdsMin(supabase).order("created_at");
      return data ?? [];
    },
  });
  return (
    <>
      <div className="rounded-xl bg-sage-100/60 p-3 text-xs text-sage-700">
        Sits are created from the <Link to="/dashboard" className="font-semibold underline">owner dashboard</Link>, where you can include multiple birds in one sit.
      </div>
      {sits.length === 0 && <p className="text-sm text-sage-600">This bird isn't part of any sit yet.</p>}
      {sits.map((s) => <SitCard key={s.id} sit={s} allBirds={allBirds} onChange={onChange} />)}
    </>
  );
}

function LogsPanel({ birdId, initialScan }: { birdId: string; initialScan?: string }) {
  const [expandedScan, setExpandedScan] = useState<string | null>(initialScan ?? null);

  // Deep link from a notification: expand and scroll to that scan once rendered.
  useEffect(() => {
    if (!initialScan) return;
    setExpandedScan(initialScan);
    const t = setTimeout(() => {
      document.getElementById(`scan-${initialScan}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [initialScan]);

  const { data: daily = [] } = useQuery({
    queryKey: ["daily-logs", birdId],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_logs")
        .select("*, sit:sits(sitter_name, sitter_email)")
        .eq("bird_id", birdId)
        .order("created_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });
  const { data: photos = [] } = useQuery({
    queryKey: ["photo-logs", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("photo_logs").select("*").eq("bird_id", birdId).order("created_at", { ascending: false }).limit(20);
      return data ?? [];
    },
  });

  const triageColor = (s: string) =>
    s === "red" ? "bg-warn-red/10 text-warn-red"
    : s === "yellow" ? "bg-warn-amber/10 text-warn-amber"
    : "bg-warn-green/10 text-warn-green";
  const SCAN_COLS: { col: string; label: string }[] = [
    { col: "alertness_status", label: "Alert and responsive" },
    { col: "food_status", label: "Eating normally" },
    { col: "droppings_status", label: "Droppings look normal" },
    { col: "breathing_status", label: "Breathing normally" },
    { col: "posture_status", label: "Perched normally" },
    { col: "behavior_status", label: "Vocalizing as usual" },
    { col: "energy_status", label: "Not fluffed for long stretches" },
    { col: "vomiting_status", label: "Face clean, no vomiting" },
    { col: "injury_status", label: "No injury, fall, bite, or scratch" },
    { col: "exposure_status", label: "No exposure to fumes / unsafe items" },
  ];
  const sitterLabel = (d: any) => d.sit?.sitter_name || d.sit?.sitter_email || "Sitter";
  const severityRank = (s: string) => (s === "red" ? 0 : s === "yellow" ? 1 : 2);
  const sortedDaily = [...daily].sort((a: any, b: any) => {
    const r = severityRank(a.triage_status) - severityRank(b.triage_status);
    if (r !== 0) return r;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const answerStyle = (a: string | null) =>
    a === "concerning" ? "bg-warn-red/10 text-warn-red"
    : a === "not_sure" ? "bg-warn-amber/10 text-warn-amber"
    : a === "normal" ? "bg-warn-green/10 text-warn-green"
    : "bg-sage-100 text-sage-500";
  const answerLabel = (a: string | null) =>
    a === "concerning" ? "Concerning" : a === "not_sure" ? "Not sure" : a === "normal" ? "Normal" : "—";

  return (
    <>
      <Disclaimer compact />

      <section className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <h2 className="text-sm font-bold">Health checks from sitters</h2>
        {daily.length === 0 ? (
          <p className="mt-2 text-sm text-sage-600">No health checks logged yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sortedDaily.map((d: any) => {
              const isOpen = expandedScan === d.id;
              const needsAttention = d.triage_status === "red" || d.triage_status === "yellow";
              const notSureItems = SCAN_COLS.filter((f) => d[f.col] === "not_sure");
              const linkedPhotos = photos.filter((p: any) => p.daily_log_id === d.id);
              const wrap = d.triage_status === "red"
                ? "border-2 border-warn-red bg-warn-red/5"
                : d.triage_status === "yellow"
                ? "border-2 border-warn-amber bg-warn-amber/5"
                : "border border-sage-100 bg-sage-50";
              return (
                <li key={d.id} id={`scan-${d.id}`} className={`rounded-xl ${wrap}`}>
                  <button
                    type="button"
                    onClick={() => setExpandedScan(isOpen ? null : d.id)}
                    className="flex w-full items-center justify-between gap-2 p-3 text-left"
                    aria-expanded={isOpen}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {needsAttention && <AlertTriangle className={`size-4 shrink-0 ${d.triage_status === "red" ? "text-warn-red" : "text-warn-amber"}`} />}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${triageColor(d.triage_status)}`}>{d.triage_status}</span>
                          {needsAttention && (
                            <span className={`text-[11px] font-bold uppercase tracking-wide ${d.triage_status === "red" ? "text-warn-red" : "text-warn-amber"}`}>
                              Needs attention
                            </span>
                          )}
                          {notSureItems.length > 0 && (
                            <span className="rounded-full bg-warn-amber/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-warn-amber">
                              {notSureItems.length} need{notSureItems.length === 1 ? "s" : ""} your input
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-sage-600">
                          {new Date(d.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {sitterLabel(d)}
                        </p>
                      </div>
                    </div>
                    <ChevronDown className={`size-4 shrink-0 text-sage-500 transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-sage-100 px-3 py-3">
                      {notSureItems.length > 0 && (
                        <div className="rounded-xl border border-warn-amber/40 bg-warn-amber/10 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-warn-amber">Awaiting your response</p>
                          <p className="mt-1 text-[11px] text-sage-700">{sitterLabel(d)} wasn't sure about these and is looking for your input:</p>
                          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs font-medium text-sage-800">
                            {notSureItems.map((f) => <li key={f.col}>{f.label}</li>)}
                          </ul>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-sage-600">Per-question answers</p>
                        <ul className="mt-2 space-y-1.5">
                          {SCAN_COLS.map((f) => (
                            <li key={f.col} className="flex items-center justify-between gap-3 text-xs">
                              <span className="text-sage-800">{f.label}</span>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${answerStyle(d[f.col])}`}>
                                {answerLabel(d[f.col])}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {d.triage_reasons && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-sage-600">Flagged</p>
                          <p className="mt-1 whitespace-pre-line text-xs text-sage-800">{d.triage_reasons}</p>
                        </div>
                      )}
                      {d.notes && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-sage-600">Sitter notes</p>
                          <p className="mt-1 text-xs italic text-sage-700">"{d.notes}"</p>
                        </div>
                      )}
                      {linkedPhotos.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-sage-600">Photos</p>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {linkedPhotos.map((p: any) => (
                              <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-sage-100">
                                <img src={p.photo_url} alt="Sitter photo" className="size-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <h2 className="text-sm font-bold">Photos from sitters</h2>
        {photos.length === 0 ? (
          <p className="mt-2 text-sm text-sage-600">No photos logged yet.</p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((p: any) => (
              <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg bg-sage-100">
                <img src={p.photo_url} alt="Sitter photo" className="size-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
