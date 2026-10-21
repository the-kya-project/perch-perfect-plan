import { createFileRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { speciesLabel } from "@/lib/speciesLabel";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { purgeBirdMedia } from "@/lib/birdMedia.functions";
import { resolveHouseholdNames } from "@/lib/home.functions";
import { birdMediaPurgeFailedText } from "@/lib/i18n/serverErrors";
import { activeOwnerBirdsMin } from "@/lib/activeBirds";
import { Trash2, ChevronDown, AlertTriangle, Eye } from "lucide-react";
import { EmergencyInfo } from "@/components/EmergencyInfo";
import { useBirdOwnerEmergency } from "@/lib/useOwnerEmergency";
import { K, KyaBody, KyaCard, KyaHeading, KyaTag, KyaLabel, KyaSecondaryButton, KyaPrimaryButton } from "@/components/kya";
import { HeaderPill, TaskHeader, TaskFooter, TASK_FOOTER_SPACE } from "@/components/headers";
import { isTaskPath } from "@/components/OwnerTabBar";
import { SETUP_STEPS } from "@/components/SetupShell";
// The editor renders the guided-setup step components directly so the two UIs
// are identical (same fields, pickers, autosave, clip recording).
import { BasicsStep, DayInLifeStep, PersonalityStep, OwnerTipsClipsStep, FoodWaterStep, EnvironmentStep, HealthBaselineStep, HideStepInstruction } from "./$birdId.setup";
import { SitCard } from "@/components/SitCard";
import { toast } from "sonner";
import { Disclaimer } from "@/components/Disclaimer";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { resolveScanPhotoUrls } from "@/lib/scanPhoto";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability, useMyPermissions } from "@/lib/useCapability";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { friendlyError } from "@/lib/errorMessage";
import { formatLocalDateTime } from "@/lib/dates";


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
function tabLabel(t: TFunction, tab: Tab): string {
  switch (tab) {
    case "basics": return t("planEditor.tabBasics", "Basics");
    case "food": return t("planEditor.tabFood", "Food");
    case "routine": return t("planEditor.tabRoutine", "Routine");
    case "behavior": return t("planEditor.tabBehavior", "Behavior");
    case "home": return t("planEditor.tabReminders", "Reminders");
    case "health": return t("planEditor.tabHealth", "Health");
    case "clips": return t("planEditor.tabClips", "Clips");
    case "emergency": return t("planEditor.tabEmergency", "Emergency");
    case "sits": return t("planEditor.tabSits", "Sits");
    case "logs": return t("planEditor.tabLogs", "Logs");
  }
}
// Visible section tabs in the SAME order as the guided setup flow — derived
// from SETUP_STEPS so the strip and the wizard can never drift.
const ORDERED_TABS: Tab[] = (() => {
  const keyToTab = new Map(Object.entries(TAB_TO_STEP_KEY).map(([tab, key]) => [key, tab as Tab]));
  const section = SETUP_STEPS
    .map((s) => keyToTab.get(s.key))
    .filter((tb): tb is Tab => !!tb && VISIBLE_TABS.includes(tb));
  return section;
})();

const birdSearch = z.object({
  tab: z.enum(TAB_IDS).optional(),
  scan: z.string().uuid().optional(), // deep-link from a notification to a scan
});

export const Route = createFileRoute("/_authenticated/birds/$birdId/plan/editor")({
  head: () => ({ meta: [{ title: i18next.t("planEditor.metaTitle", "Care plan — Kya & Co.") }] }),
  validateSearch: birdSearch,
  component: BirdEditor,
});

function BirdEditor() {
  const { t } = useTranslation();
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
  // A task page hides the bottom nav (isTaskPath); until this route is listed
  // there the nav still shows, so the Done footer sits just above it.
  const navHidden = useLocation({ select: (l) => isTaskPath(l.pathname) });
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
  // The bird OWNER's account emergency info (not the viewer's), with their name.
  const { defaults, ownerName } = useBirdOwnerEmergency(birdId);
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

  if (!bird) {
    return (
      <div className="setup-frame min-h-screen px-4 pt-[calc(env(safe-area-inset-top)+24px)]" style={{ background: K.mist, color: K.quiet }} role="status">
        <div className="mx-auto flex max-w-md flex-col gap-3">
          <p className="m-0 text-[15px]">{t("planEditor.loading", "Loading...")}</p>
          <div className="h-28 animate-pulse rounded-[20px]" style={{ background: K.line }} />
          <div className="h-48 animate-pulse rounded-[20px]" style={{ background: K.line }} />
        </div>
      </div>
    );
  }

  const headerPhoto = resolvePhoto(bird.photo_url);

  // Only show tabs the user can actually edit: the Emergency tab needs
  // manage_emergency; the other five need edit_care_plans. (Owner has both.)
  const tabs = ORDERED_TABS
    .filter((id) => (id === "emergency" ? canEmergency : canEdit))
    .map((id) => ({ id, label: tabLabel(t, id) }));
  const birdName = bird.name ?? t("planEditor.thisBird", "this bird");

  const onPlanSaved = () => {
    qc.invalidateQueries({ queryKey: ["plan", birdId] });
    qc.invalidateQueries({ queryKey: ["bird", birdId] });
    // Reflect basics/setup changes (name, species, photo, progress) on Home.
    qc.invalidateQueries({ queryKey: ["birds"] });
  };

  const goToOverview = () => navigate({ to: "/birds/$birdId/plan", params: { birdId } });
  const done = () => { onPlanSaved(); goToOverview(); };
  const doneButton = <KyaPrimaryButton onClick={done}>{t("planEditor.done", "Done")}</KyaPrimaryButton>;

  return (
    <div className={`setup-frame min-h-screen ${navHidden ? "" : "pb-nav"}`} style={{ background: K.mist, color: K.forest }}>
      <TaskHeader
        onClose={goToOverview}
        // Top right holds the one header action instead of a progress count.
        progress={{ label: <HeaderPill action={{ label: t("planEditor.viewAsSitter", "View as sitter"), icon: <Eye className="size-4" />, onClick: () => navigate({ to: "/birds/$birdId/view-as-sitter", params: { birdId } }) }} /> }}
        title={
          <span className="flex items-center gap-3">
            {headerPhoto && (
              <span className="relative block size-11 shrink-0 overflow-hidden rounded-full">
                <BirdPhotoCrop url={headerPhoto.url} original={headerPhoto.original} position={bird.photo_position ?? "50% 20%"} alt={bird.name} />
              </span>
            )}
            <span className="min-w-0 flex-1">{t("planEditor.editTitleNamed", "Edit {{name}}'s care plan", { name: bird.name })}</span>
          </span>
        }
      >
        <div className="relative mt-5">
          <div ref={tabStripRef} onScroll={updateTabFades} role="tablist" aria-label={t("planEditor.sectionsAria", "Care plan sections")} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tabs.map((tb) => {
              const on = tab === tb.id;
              return (
                <button
                  key={tb.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(tb.id)}
                  // 40px chips; the strip's own padding brings the tap row to 44px.
                  className="inline-flex h-10 shrink-0 items-center rounded-full border-[1.5px] px-4 text-[14.5px] font-[700]"
                  style={on
                    ? { background: K.lime, borderColor: K.lime, color: K.forest }
                    : { background: "transparent", borderColor: "rgba(255,255,255,0.32)", color: K.paleGreen }}
                >
                  {tb.label}
                </button>
              );
            })}
            <span aria-hidden className="shrink-0 pl-1" />
          </div>
          {!tabAtStart && <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#1a3d2e] to-transparent" />}
          {!tabAtEnd && <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[#1a3d2e] to-transparent" />}
        </div>
      </TaskHeader>

      <div className={TASK_FOOTER_SPACE}>
        <KyaBody>
          {/* Every section tab renders the guided-setup step component directly, so
              the editor and the setup wizard are the exact same UI — except the
              green per-step instruction banner, hidden here via HideStepInstruction
              (it shows only in the guided setup). */}
          <HideStepInstruction.Provider value={true}>
            {/* Delete bird moved to the bird main page's "More" group (grouped with
                Hand off). The editor's basics tab is just the basics fields now. */}
            {tab === "basics" && <BasicsStep birdId={birdId} onBlockNext={() => {}} />}
            {tab === "food" && <FoodWaterStep birdId={birdId} birdName={birdName} onBlockNext={() => {}} />}
            {tab === "home" && <EnvironmentStep birdId={birdId} birdName={birdName} />}
            {tab === "health" && <HealthBaselineStep birdId={birdId} birdName={birdName} onBlockNext={() => {}} />}
            {tab === "routine" && <DayInLifeStep birdId={birdId} birdName={birdName} />}
            {tab === "behavior" && <PersonalityStep birdId={birdId} birdName={birdName} />}
            {tab === "clips" && <OwnerTipsClipsStep birdId={birdId} birdName={birdName} onBlockNext={() => {}} />}
            {tab === "emergency" && contacts !== undefined && <EmergencyInfo birdId={birdId} birdName={birdName} contacts={contacts ?? null} defaults={defaults ?? null} ownerName={ownerName} isOwner={role === "owner"} onSaved={() => qc.invalidateQueries({ queryKey: ["contacts", birdId] })} />}
            {tab === "sits" && <SitsPanel birdId={birdId} sits={sits} onChange={() => qc.invalidateQueries({ queryKey: ["sits", birdId] })} />}
            {tab === "logs" && <LogsPanel birdId={birdId} initialScan={scanParam} />}
          </HideStepInstruction.Provider>
        </KyaBody>
      </div>

      {/* Explicit Done control. Each section autosaves as you edit (that's why
          there's no per-field Save), but owners/editors expect a clear "I'm
          finished" button — the affordance dropped in the overview-front-door
          refactor (#163), which left onPlanSaved orphaned. Autosave has already
          persisted, so Done just refreshes derived views (via onPlanSaved) and
          returns to the overview. Everyone who reaches the editor is an editor
          (others are redirected), so it's shown for editors only. While the
          bottom nav shows on this route, the same white footer sits above it. */}
      {navHidden ? (
        <TaskFooter>{doneButton}</TaskFooter>
      ) : (
        <div className="fixed inset-x-0 bottom-[var(--nav-spacer)] z-30 border-t bg-white py-3" style={{ borderColor: K.line }}>
          <div className="mx-auto max-w-md px-4">{doneButton}</div>
        </div>
      )}
    </div>
  );
}

// Delete-bird control shown under the Basics tab (the only editor-only extra in
// the section tabs — the rest render the shared setup step components).
function DeleteBirdCard({ birdId, bird, plan }: { birdId: string; bird: any; plan: any }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const purgeMedia = useServerFn(purgeBirdMedia);

  async function deleteBird() {
    if (deleteText.trim() !== (bird.name ?? "").trim()) {
      toast.error(t("planEditor.typeNameExactly", "Type \"{{name}}\" exactly to confirm.", { name: bird.name }));
      return;
    }
    setDeleting(true);
    // Media BEFORE rows: the rows are the only record of these files and clip
    // uids, so a failure must abort with the bird intact rather than orphan
    // them permanently. Same ordering as deleteAccount.
    try {
      await purgeMedia({ data: { birdId } });
    } catch (e: any) {
      setDeleting(false);
      // Never e.message: it could carry storage paths / clip uids. The server
      // logs those; the owner gets the one shared message.
      console.error("[deleteBird] media purge failed", e);
      toast.error(birdMediaPurgeFailedText());
      return;
    }
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
    if (error) { toast.error(friendlyError(error)); return; }
    toast.success(t("planEditor.birdRemoved", "{{name}} removed.", { name: bird.name }));
    qc.invalidateQueries({ queryKey: ["birds"] });
    navigate({ to: "/dashboard" });
  }

  return (
    <KyaCard className="flex flex-col gap-3 p-4" style={{ boxShadow: `inset 0 0 0 2px ${K.red}33` }}>
      <KyaHeading size={19} className="text-[#a32d2d]">{t("planEditor.dangerZone", "Danger zone")}</KyaHeading>
      <p className="m-0 text-[14px] leading-[1.5]" style={{ color: K.ink }}>
        {t("planEditor.deleteWarning", "Permanently delete {{name}} and all of their care plan, routine, emergency info, weight logs, daily scans, and photos. This cannot be undone.", { name: bird.name })}
      </p>
      {!confirmDelete ? (
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 self-start rounded-full border-2 bg-white px-4 text-[15px] font-[700]"
          style={{ borderColor: K.red, color: K.red }}
        >
          <Trash2 className="size-4" /> {t("planEditor.deleteNamed", "Delete {{name}}", { name: bird.name })}
        </button>
      ) : (
        <div className="flex flex-col gap-2.5">
          <KyaLabel htmlFor="delete-bird-confirm">
            <Trans i18nKey="planEditor.typeToConfirm" defaults="Type <1>{{name}}</1> to confirm" values={{ name: bird.name }} components={{ 1: <span className="font-bold" /> }} />
          </KyaLabel>
          <input
            id="delete-bird-confirm"
            className="kya-input"
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder={bird.name}
            autoFocus
          />
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={deleting || deleteText.trim() !== (bird.name ?? "").trim()}
              onClick={deleteBird}
              className="min-h-[48px] flex-1 rounded-full px-4 text-[15px] font-[700] text-white disabled:opacity-45"
              style={{ background: K.red }}
            >
              {deleting ? t("planEditor.deleting", "Deleting...") : t("planEditor.permanentlyDeleteNamed", "Permanently delete {{name}}", { name: bird.name })}
            </button>
            <KyaSecondaryButton onClick={() => { setConfirmDelete(false); setDeleteText(""); }}>
              {t("planEditor.cancel", "Cancel")}
            </KyaSecondaryButton>
          </div>
        </div>
      )}
    </KyaCard>
  );
}

function SitsPanel({ birdId, sits, onChange }: { birdId: string; sits: any[]; onChange: () => void }) {
  const { t } = useTranslation();
  // All the owner's birds, so editing a sit here can add/remove any of them.
  const { data: allBirds = [] } = useQuery({
    queryKey: ["owner-birds-min-sit-editor"],
    queryFn: async () => {
      // Active birds only — a sit can't cover a passed bird.
      const { data } = await activeOwnerBirdsMin(supabase).order("created_at");
      return data ?? [];
    },
  });
  // Each sit's birds (a sit can cover several), so the cards can list them,
  // link each one's sitter preview and checklist, and check emergency contacts
  // before a link is copied. RLS limits the embed to birds the user can see.
  const sitIds = sits.map((s) => s.id as string).sort();
  const { data: birdsBySit = {} } = useQuery({
    queryKey: ["sit-birds-for-sits", sitIds.join(",")],
    enabled: sitIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("sit_birds").select("sit_id, birds(id, name)").in("sit_id", sitIds);
      if (error) throw error;
      const out: Record<string, { id: string; name: string }[]> = {};
      for (const r of (data ?? []) as any[]) {
        if (!r.birds) continue;
        (out[r.sit_id] ??= []).push({ id: r.birds.id, name: r.birds.name });
      }
      return out;
    },
  });
  return (
    <>
      <KyaCard className="p-4">
        <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
          <Trans i18nKey="planEditor.sitsSetUpFromSits" defaults="To add a sit, <1>set up a sit</1> from the Sits tab. One sit can include several birds." components={{ 1: <Link to="/sits/new" search={{ bird: birdId }} className="font-[700] underline" style={{ color: K.moss }} /> }} />
        </p>
      </KyaCard>
      {sits.length === 0 && (
        <KyaCard className="p-4">
          <p className="m-0 text-[15px]" style={{ color: K.quiet }}>{t("planEditor.noSits", "This bird isn't part of any sit yet.")}</p>
        </KyaCard>
      )}
      {sits.map((s) => <SitCard key={s.id} sit={s} birds={birdsBySit[s.id] ?? []} allBirds={allBirds} onChange={onChange} />)}
    </>
  );
}

function LogsPanel({ birdId, initialScan }: { birdId: string; initialScan?: string }) {
  const { t } = useTranslation();
  const [expandedScan, setExpandedScan] = useState<string | null>(initialScan ?? null);
  const { data: myPerms } = useMyPermissions();
  const role = useBirdRole(birdId);

  // Deep link from a notification: expand and scroll to that scan once rendered.
  useEffect(() => {
    if (!initialScan) return;
    setExpandedScan(initialScan);
    const timer = setTimeout(() => {
      document.getElementById(`scan-${initialScan}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(timer);
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
      const rows = data ?? [];
      // photo_url is a legacy inline data: URL or a scan-photos Storage path —
      // resolve both to a displayable URL (data: passes through, paths signed).
      const scanUrls = await resolveScanPhotoUrls(supabase.storage, rows.map((r: any) => r.photo_url));
      return rows.map((r: any) => ({ ...r, photo_url: scanUrls.get(r.photo_url) ?? r.photo_url }));
    },
  });

  const triageLabel = (s: string) =>
    s === "red" ? t("planEditor.triageRed", "red")
    : s === "yellow" ? t("planEditor.triageYellow", "yellow")
    : s === "green" ? t("planEditor.triageGreen", "green")
    : s;
  // Sentence case for the stored lower-case triage words ("red" → "Red").
  const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
  const triageTag = (s: string) =>
    s === "red" ? <RedTag>{cap(triageLabel(s))}</RedTag>
    : <KyaTag tone={s === "yellow" ? "amber" : "lime"}>{cap(triageLabel(s))}</KyaTag>;
  const SCAN_COLS: { col: string; label: string }[] = [
    { col: "alertness_status", label: t("planEditor.scanAlertness", "Alert and responsive") },
    { col: "food_status", label: t("planEditor.scanFood", "Eating normally") },
    { col: "droppings_status", label: t("planEditor.scanDroppings", "Droppings look normal") },
    { col: "breathing_status", label: t("planEditor.scanBreathing", "Breathing normally") },
    { col: "posture_status", label: t("planEditor.scanPosture", "Perched normally") },
    { col: "behavior_status", label: t("planEditor.scanBehavior", "Vocalizing as usual") },
    { col: "energy_status", label: t("planEditor.scanEnergy", "Not fluffed for long stretches") },
    { col: "vomiting_status", label: t("planEditor.scanVomiting", "Face clean, no vomiting") },
    { col: "injury_status", label: t("planEditor.scanInjury", "No injury, fall, bite, or scratch") },
    { col: "exposure_status", label: t("planEditor.scanExposure", "No exposure to fumes / unsafe items") },
  ];
  // Who ran each check. daily_logs.source is owner | household | sitter;
  // run_by is the signed-in user who ran it (null for a sitter link, and on
  // owner checks from before run_by existed); sit_id ties sitter checks to the
  // sit, whose sitter_name we already join. Other people's names come from
  // resolveHouseholdNames: profiles RLS is self-only, so they can't be read here.
  const myId = myPerms?.myId ?? null;
  const runByIds = [...new Set(daily.map((d: any) => d.run_by as string | null).filter((id): id is string => !!id && id !== myId))].sort();
  const resolveNames = useServerFn(resolveHouseholdNames);
  const { data: runByNames = {} } = useQuery({
    queryKey: ["check-runner-names", runByIds.join(",")],
    enabled: runByIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => resolveNames({ data: { userIds: runByIds } }),
  });
  const isMine = (d: any) => (!!myId && d.run_by === myId) || (d.source === "owner" && !d.run_by && role === "owner");
  const loggerLabel = (d: any): string => {
    if (isMine(d)) return t("planEditor.loggedByYou", "You");
    if (d.source === "sitter") return d.sit?.sitter_name || d.sit?.sitter_email || t("planEditor.sitter", "Sitter");
    const who = d.run_by ? (runByNames as Record<string, { name: string | null; email: string | null }>)[d.run_by] : undefined;
    if (who?.name || who?.email) return (who.name || who.email) as string;
    if (d.source === "owner") return t("planEditor.loggedByOwner", "Owner");
    if (d.source === "household") return t("planEditor.loggedByHousehold", "Household member");
    return t("planEditor.loggedBySomeone", "Someone");
  };
  const severityRank = (s: string) => (s === "red" ? 0 : s === "yellow" ? 1 : 2);
  const sortedDaily = [...daily].sort((a: any, b: any) => {
    const r = severityRank(a.triage_status) - severityRank(b.triage_status);
    if (r !== 0) return r;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const answerStyle = (a: string | null) =>
    a === "concerning" ? { background: RED_FILL, color: K.red }
    : a === "not_sure" ? { background: K.amberBg, color: K.amberText }
    : a === "normal" ? { background: K.lime, color: K.forest }
    : { background: K.mist, color: K.quiet };
  const answerLabel = (a: string | null) =>
    a === "concerning" ? t("planEditor.answerConcerning", "Concerning") : a === "not_sure" ? t("planEditor.answerNotSure", "Not sure") : a === "normal" ? t("planEditor.answerNormal", "Normal") : "—";

  return (
    <>
      <Disclaimer compact />

      <KyaCard className="p-4">
        <KyaHeading size={19}>{t("planEditor.healthChecks", "Health checks")}</KyaHeading>
        {daily.length === 0 ? (
          <p className="m-0 mt-2 text-[15px]" style={{ color: K.quiet }}>{t("planEditor.noHealthChecks", "No health checks logged yet.")}</p>
        ) : (
          <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
            {sortedDaily.map((d: any) => {
              const isOpen = expandedScan === d.id;
              const needsAttention = d.triage_status === "red" || d.triage_status === "yellow";
              const notSureItems = SCAN_COLS.filter((f) => d[f.col] === "not_sure");
              const linkedPhotos = photos.filter((p: any) => p.daily_log_id === d.id);
              const wrap = d.triage_status === "red"
                ? { border: `2px solid ${K.red}`, background: RED_FILL }
                : d.triage_status === "yellow"
                ? { border: `2px solid ${K.amberText}`, background: "#fbf3e1" }
                : { border: `1.5px solid ${K.line}`, background: "#fff" };
              const attentionColor = d.triage_status === "red" ? K.red : K.amberText;
              return (
                <li key={d.id} id={`scan-${d.id}`} className="overflow-hidden rounded-[16px]" style={wrap}>
                  <button
                    type="button"
                    onClick={() => setExpandedScan(isOpen ? null : d.id)}
                    className="flex min-h-[60px] w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
                    aria-expanded={isOpen}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      {needsAttention && <AlertTriangle className="size-5 shrink-0" style={{ color: attentionColor }} aria-hidden="true" />}
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {triageTag(d.triage_status)}
                          {needsAttention && (
                            <span className="text-[13.5px] font-[700]" style={{ color: attentionColor }}>
                              {t("planEditor.needsAttention", "Needs attention")}
                            </span>
                          )}
                          {notSureItems.length > 0 && (
                            <KyaTag tone="amber">
                              {notSureItems.length === 1
                                ? t("planEditor.needsYourInputOne", "{{n}} needs your input", { n: notSureItems.length })
                                : t("planEditor.needsYourInputOther", "{{n}} need your input", { n: notSureItems.length })}
                            </KyaTag>
                          )}
                        </div>
                        <p className="m-0 mt-1 text-[13px]" style={{ color: K.quiet }}>
                          {formatLocalDateTime(new Date(d.created_at), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {loggerLabel(d)}
                        </p>
                      </div>
                    </div>
                    <ChevronDown className={`size-[18px] shrink-0 transition ${isOpen ? "rotate-180" : ""}`} style={{ color: K.quiet }} aria-hidden="true" />
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-3.5 border-t px-3.5 py-3.5" style={{ borderColor: K.line, background: "#fff" }}>
                      {notSureItems.length > 0 && (
                        <div className="rounded-[14px] p-3" style={{ background: K.amberBg }}>
                          <KyaTag tone="amber">{t("planEditor.awaitingResponse", "Awaiting your response")}</KyaTag>
                          <p className="m-0 mt-2 text-[14px] leading-[1.45]" style={{ color: K.amberText }}>
                            {isMine(d)
                              ? t("planEditor.youNotSure", "You weren't sure about these:")
                              : t("planEditor.sitterNotSure", "{{sitter}} wasn't sure about these and is looking for your input:", { sitter: loggerLabel(d) })}
                          </p>
                          <ul className="m-0 mt-1.5 list-disc space-y-0.5 pl-5 text-[14px] font-[700]" style={{ color: K.amberText }}>
                            {notSureItems.map((f) => <li key={f.col}>{f.label}</li>)}
                          </ul>
                        </div>
                      )}
                      <div>
                        <LogLabel>{t("planEditor.perQuestionAnswers", "Per-question answers")}</LogLabel>
                        <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                          {SCAN_COLS.map((f) => (
                            <li key={f.col} className="flex items-center justify-between gap-3 text-[14px]">
                              <span style={{ color: K.ink }}>{f.label}</span>
                              <span className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-[700]" style={answerStyle(d[f.col])}>
                                {answerLabel(d[f.col])}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      {d.triage_reasons && (
                        <div>
                          <LogLabel>{t("planEditor.flagged", "Flagged")}</LogLabel>
                          <p className="m-0 mt-1 whitespace-pre-line text-[14px] leading-[1.5]" style={{ color: K.ink }}>{d.triage_reasons}</p>
                        </div>
                      )}
                      {d.notes && (
                        <div>
                          <LogLabel>{d.source === "sitter" ? t("planEditor.sitterNotes", "Sitter notes") : t("planEditor.checkNotes", "Notes")}</LogLabel>
                          <p className="m-0 mt-1 text-[14px] italic leading-[1.5]" style={{ color: K.ink }}>"{d.notes}"</p>
                        </div>
                      )}
                      {linkedPhotos.length > 0 && (
                        <div>
                          <LogLabel>{t("planEditor.photos", "Photos")}</LogLabel>
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {linkedPhotos.map((p: any) => (
                              <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-[12px]" style={{ background: K.line }}>
                                <img src={p.photo_url} alt={t("planEditor.sitterPhotoAlt", "Sitter photo")} className="size-full object-cover" />
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
      </KyaCard>

      <KyaCard className="p-4">
        <KyaHeading size={19}>{t("planEditor.photosFromSitters", "Photos from sitters")}</KyaHeading>
        {photos.length === 0 ? (
          <p className="m-0 mt-2 text-[15px]" style={{ color: K.quiet }}>{t("planEditor.noPhotos", "No photos logged yet.")}</p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((p: any) => (
              <a key={p.id} href={p.photo_url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-[12px]" style={{ background: K.line }}>
                <img src={p.photo_url} alt={t("planEditor.sitterPhotoAlt", "Sitter photo")} className="size-full object-cover" />
              </a>
            ))}
          </div>
        )}
      </KyaCard>
    </>
  );
}

// The red counterpart of KyaTag, for a red health-check result.
const RED_FILL = "#fcebeb";
function RedTag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: RED_FILL, color: K.red, boxShadow: `inset 0 0 0 1px ${K.red}40` }}>{children}</span>;
}

/** 13px bold muted label over a block of a health check. Sentence case. */
function LogLabel({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[13px] font-[700]" style={{ color: K.quiet }}>{children}</p>;
}
