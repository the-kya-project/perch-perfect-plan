import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { InSetupFrame, SetupIntroSlot } from "@/components/setup/SetupFrame";
import { StartFromAnotherBird, useCopySources } from "@/components/setup/StartFromAnotherBird";
import { foodCopy, dayCopy, isOwnTask } from "@/lib/copyFromBird";
import { S, SERIF, SetupPrimaryButton, SetupTextButton, SectionCard, TileCard, Field, TextField, TextBox, Dropdown, Segmented, EditableList, Helper, CheckChips } from "@/components/setup/controls";
import { BottomSheet } from "@/components/setup/BottomSheet";
import { useTranslation } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SetupShell, SETUP_STEPS, TOTAL_STEPS, setupStepTitle, setupStepNumber } from "@/components/SetupShell";
import { encodeSetupStep, basicsDone } from "@/lib/setupProgress";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { mergeHome, homeDifferences, seedShared, sameGroup, followSharedPatch, clearOwnPatch, birdHasOwn, HOME_GROUPS, HOME_GROUP_COLUMNS, parseCleaning, formatCleaning, CLEANING_NEVER_DEFAULTS, type HomeRow } from "@/lib/homeDefaults";
import { EmergencyContactsScreen, type EmergencySetupState } from "@/components/setup/EmergencyContactsScreen";
import { Plus, X, Check, Lightbulb, GripVertical, Sparkles, AlertTriangle, Pill, ChevronDown, Play, Video, Sunrise, Sun, Sunset, Moon, Clock, Soup, DoorClosed, SprayCan } from "lucide-react";
import { PhotoCropper } from "@/components/PhotoCropper";
import { AgePicker, BirdField, SpeciesPicker } from "@/components/BirdPickers";
import { ClipRecorder, UploadProgress } from "@/components/ClipRecorder";
import { PosterClipPlayer, clipLength } from "@/components/ClipPlayer";
import { useOwnerClipPreview } from "@/lib/useOwnerClipPreview";
import { commitClipRef } from "@/lib/clipReplace";
import { FEED_PREFIX, HYG_REMOVE_PREFIX, HYG_WASH_FOOD_PREFIX, HYG_WASH_WATER_PREFIX, WATER_CHANGE_PREFIX, MED_TASK_PREFIX, isDerivedTask, derivedSource, feedTimeToDaypart } from "@/lib/routineTasks";
import { FoodItemsEditor } from "@/components/careEditors/FoodItemsEditor";
import { blankFoodItem, isFoodItemComplete, foodItemHasContent, HOMEMADE_CHOP_NAME, type FoodItem } from "@/lib/foodItems";
import { normalizeFeedTimes, feedTimeLabel, type FeedTime } from "@/lib/feedTimes";
import { syncFeedingTasks } from "@/lib/feedingSync";
import { medDescriptor, washFoodDescriptor, washWaterDescriptor, removeFreshDescriptor, changeWaterDescriptor, type DerivedTask } from "@/lib/derivedTasks";
import { formatAmountUnit } from "@/lib/labels";
import { track } from "@/lib/analytics";
import { ensureSitterPreviewToken } from "@/lib/sitterPreview";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { persistBirdPhoto, signBirdPhoto } from "@/lib/birdPhoto";
import { friendlyError } from "@/lib/errorMessage";

const setupSearch = z.object({
  step: z.coerce.number().int().min(1).max(TOTAL_STEPS).optional(),
});


/**
 * Lets the current step signal unsaved edits up to the wizard so the
 * back-to-profile arrow can warn before discarding them. Defaults to a no-op
 * so steps work outside the wizard too.
 */
const SetupDirtyContext = createContext<(dirty: boolean) => void>(() => {});
/** Lets the Reminders screen change the header line under "Your home". */
const SetupHomeSublineContext = createContext<(line: string | null) => void>(() => {});
/** Lets a step put a short line above the footer (e.g. "Your clip is still uploading."). */
const SetupFooterNoteContext = createContext<(note: string | null) => void>(() => {});

/**
 * Hides the per-step instruction banner. The bird editor renders these same step
 * components but wraps them with this set to true, so the green "here's what this
 * step is for" guidance shows only in the guided setup, not on the editor tabs.
 */
export const HideStepInstruction = createContext(false);

/**
 * Debounced autosave that ALSO supports an imperative flush from the parent
 * wizard. When the user clicks Next/Back, the wizard calls the registered
 * flush function so pending edits are persisted before the step unmounts.
 * While a save is pending the step is reported "dirty" via SetupDirtyContext.
 */
// The "here's what this step is for" line. In the setup shell it renders as the
// header's intro line; elsewhere it's a dark-green banner so it never blends
// into the form. Hidden on the editor tabs (via HideStepInstruction).
function StepInstruction({ children }: { children: React.ReactNode }) {
  const introSlot = useContext(SetupIntroSlot);
  if (useContext(HideStepInstruction)) return null;
  if (introSlot) return createPortal(<p>{children}</p>, introSlot);
  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-[#1a3d2e] p-3.5">
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#cdeab0]" />
      <p className="text-[13px] leading-relaxed text-white">{children}</p>
    </div>
  );
}

function useDebouncedAutosave(
  save: () => Promise<void>,
  deps: React.DependencyList,
  enabled: boolean,
  registerFlush?: (fn: (() => Promise<void>) | null) => void,
  delay = 500,
) {
  const saveRef = useRef(save);
  saveRef.current = save;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while there are debounced edits not yet persisted. Lets us flush on
  // unmount (e.g. the owner taps the bottom nav to leave mid-step) so their
  // input is never dropped, while avoiding a redundant save when a deliberate
  // flush (Next/Back/Save & exit) already persisted.
  const pendingRef = useRef(false);
  const setDirty = useContext(SetupDirtyContext);
  const setDirtyRef = useRef(setDirty);
  setDirtyRef.current = setDirty;
  // The first run is hydration (seeding the form), not a user edit.
  const hydratedOnce = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (hydratedOnce.current) { setDirtyRef.current(true); pendingRef.current = true; }
    else hydratedOnce.current = true;
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      try {
        await saveRef.current();
        pendingRef.current = false;
        setDirtyRef.current(false);
      } catch (e: any) {
        // Never fail silently — the owner must know their input didn't save.
        toast.error(i18next.t("birdSetup.couldNotSaveChanges", "Couldn't save your changes: {{reason}}", { reason: friendlyError(e, i18next.t("birdSetup.pleaseTryAgainLower", "please try again.")) }));
      }
    }, delay);
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    if (!registerFlush) return;
    const flush = async () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      try {
        await saveRef.current();
        pendingRef.current = false;
        setDirtyRef.current(false);
      } catch (e: any) {
        toast.error(i18next.t("birdSetup.couldNotSaveChanges", "Couldn't save your changes: {{reason}}", { reason: friendlyError(e, i18next.t("birdSetup.pleaseTryAgainLower", "please try again.")) }));
        throw e; // surface to flushPending so navigation can be blocked
      }
    };
    registerFlush(flush);
    return () => registerFlush(null);
  }, [registerFlush]);

  // Persist pending edits when this step unmounts by any path that didn't
  // already flush — notably leaving setup via the bottom nav. Fire-and-forget:
  // client-side navigation keeps the request alive. No-op (so no double save)
  // when a deliberate flush already cleared pendingRef.
  useEffect(() => {
    return () => {
      if (pendingRef.current) {
        pendingRef.current = false;
        void saveRef.current().catch(() => {});
      }
    };
  }, []);
}

export const Route = createFileRoute("/_authenticated/birds/$birdId/setup")({
  head: () => ({ meta: [{ title: i18next.t("birdSetup.pageTitle", "Set up bird — Kya & Co.") }] }),
  validateSearch: setupSearch,
  component: BirdSetup,
});

function BirdSetup() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const { step: stepParam } = Route.useSearch();
  const navigate = useNavigate();

  const { data: bird, isLoading } = useQuery({
    queryKey: ["bird-setup", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("*")
        .eq("id", birdId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const [step, setStep] = useState<number>(1);
  const [blockNext, setBlockNext] = useState(false);
  const [footerNote, setFooterNote] = useState<string | null>(null);
  const [homeSubline, setHomeSubline] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { setBlockNext(false); setDirty(false); setFooterNote(null); }, [step]);
  const [saving, setSaving] = useState(false);
  // The stop point after Health: "The basics are set". Shown once per bird, the
  // first time it gets past Health (a finished bird walking through again, or a
  // bird that already passed it, goes straight on to Behavior).
  const [atStopPoint, setAtStopPoint] = useState(false);
  // Food is one step on two pages: 1 = what the bird eats, 2 = water, treats
  // and hygiene. Same step number (and saved progress) for both.
  const [foodPage, setFoodPage] = useState<1 | 2>(1);
  // "Your home" screens (shared reminders, emergency contacts) are entered once
  // for every bird: the walkthrough skips the ones the owner already filled in.
  // Read once when the wizard opens, so filling one in now doesn't make Back
  // jump over it. The "All steps" list still opens them.
  const skipRef = useRef<Set<string> | null>(null);
  const { data: homeDone } = useQuery({
    queryKey: ["setup-your-home-done", birdId],
    enabled: !!bird,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const userId = u.user?.id;
      if (!userId || bird?.owner_id !== userId) return { reminders: false, emergency: false };
      const [{ data: home }, { data: ec }] = await Promise.all([
        supabase.from("owner_home_defaults").select("owner_id").eq("owner_id", userId).maybeSingle(),
        supabase.from("owner_emergency_defaults").select("owner_phone, avian_vet_phone").eq("owner_id", userId).maybeSingle(),
      ]);
      const filled = (v: unknown) => !!(v ?? "").toString().trim();
      return { reminders: !!home, emergency: filled((ec as any)?.owner_phone) && filled((ec as any)?.avian_vet_phone) };
    },
  });
  if (homeDone && !skipRef.current) {
    skipRef.current = new Set([...(homeDone.reminders ? ["environment"] : []), ...(homeDone.emergency ? ["emergency"] : [])]);
  }
  const skipped = (n: number) => skipRef.current?.has(SETUP_STEPS[n - 1]?.key) ?? false;
  const stepAfter = (n: number) => { let x = n + 1; while (x < TOTAL_STEPS && skipped(x)) x++; return x; };
  const stepBefore = (n: number) => { let x = n - 1; while (x > 1 && skipped(x)) x--; return x; };
  const stopPointSeenRef = useRef(false);
  const qc = useQueryClient();

  // Self-heal: guarantee a care_plan exists for this bird so no setup step can
  // silently no-op and lose the owner's input. The original creation in new.tsx
  // can fail; this also repairs any bird that ended up without a plan.
  const planEnsuredRef = useRef(false);
  useEffect(() => {
    if (!bird || planEnsuredRef.current) return;
    planEnsuredRef.current = true;
    (async () => {
      const { data, error } = await supabase
        .from("care_plans").select("id").eq("bird_id", birdId).maybeSingle();
      if (error || data) return; // already exists, or transient — steps will retry
      const { error: upErr } = await supabase
        .from("care_plans").upsert({ bird_id: birdId }, { onConflict: "bird_id" });
      if (upErr) { toast.error(i18next.t("birdSetup.couldNotLoadPlan", "Couldn't load this bird's care plan: {{reason}}", { reason: friendlyError(upErr, i18next.t("birdSetup.pleaseTryAgainLower", "please try again.")) })); return; }
      qc.invalidateQueries(); // plan now exists — refetch the per-step queries
    })();
  }, [bird, birdId, qc]);

  useEffect(() => {
    track("guided_editor_opened", { entry_step: stepParam ?? 1 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Imperative flush registered by the current step's autosave hook.
  // Called before any navigation so pending edits persist immediately.
  const flushRef = useRef<(() => Promise<void>) | null>(null);
  const registerFlush = useCallback((fn: (() => Promise<void>) | null) => {
    flushRef.current = fn;
  }, []);
  // A step can register a forward-navigation gate (currently the Food step). It
  // returns false to BLOCK Next and surface its own validation UI.
  const validateRef = useRef<(() => boolean) | null>(null);
  const registerValidate = useCallback((fn: (() => boolean) | null) => {
    validateRef.current = fn;
  }, []);
  // Returns false if the current step's pending save failed, so callers can stay
  // put rather than navigate away and lose the owner's input. The error toast is
  // raised by the autosave hook.
  async function flushPending(): Promise<boolean> {
    try { await flushRef.current?.(); return true; }
    catch { return false; }
  }

  // Honor an explicit ?step= link, but only when it actually changes — not on
  // every refetch of `bird`. Re-applying a stale stepParam was bouncing users
  // back to the linked step (e.g. from the Review step back to step 4) whenever
  // the bird query refetched.
  useEffect(() => {
    if (stepParam != null) setStep(Math.min(TOTAL_STEPS, Math.max(1, stepParam)));
  }, [stepParam]);

  // A bare wizard entry (no explicit ?step) ALWAYS opens at Food (step 1). The
  // wizard must never skip Food. Resume is driven only by an explicit ?step
  // ("Walk through it again" passes the saved step; "Create care plan" passes 1)
  // — so a stale setup_step (older birds carry 2 from the pre-standalone
  // Add-a-bird flow) can no longer strand a new owner on Behavior.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!bird || initializedRef.current) return;
    initializedRef.current = true;
    if (stepParam != null) return;
    setStep(1);
  }, [bird, stepParam]);

  async function persistStep(nextStep: number, complete = false) {
    setSaving(true);
    // Completion is STICKY: only ever set setup_complete to true (on finishing
    // the wizard), never write false. Every navigation (Next/Back/Save & exit/
    // step-jump) calls persistStep without the flag, so writing the default
    // false here UN-completed finished birds the moment their owner re-entered
    // "Walk through it again" — which resurrected the "Set up care plan" CTA on
    // birds with complete plans (the intermittent, some-birds-only report).
    const patch: Record<string, unknown> = { setup_step: encodeSetupStep(nextStep) };
    if (complete) patch.setup_complete = true;
    const { error } = await supabase
      .from("birds")
      .update(patch as any)
      .eq("id", birdId);
    setSaving(false);
    if (error) { toast.error(friendlyError(error)); return false; }
    // setup_complete/setup_step live on the birds row that the bird-record home
    // (the "Create care plan" CTA gate) and the flock list read from cache. Patch
    // the cache synchronously so the bird home reads the new value the instant we
    // navigate there (no CTA flash), then invalidate to confirm against the DB
    // and refresh the flock list.
    qc.setQueryData(["bird-record", birdId], (old: any) =>
      old ? { ...old, ...patch } : old);
    qc.invalidateQueries({ queryKey: ["bird-record", birdId] });
    qc.invalidateQueries({ queryKey: ["birds"] });
    return true;
  }

  async function onNext() {
    // Forward-navigation gate (Food step): block + show validation if incomplete.
    if (validateRef.current && !validateRef.current()) return;
    // Food page 1 → page 2, within the same step.
    if (SETUP_STEPS[step - 1]?.key === "food" && foodPage === 1) {
      if (!(await flushPending())) return;
      setFoodPage(2);
      window.scrollTo(0, 0);
      return;
    }
    if (!(await flushPending())) return;
    const completedSection = SETUP_STEPS[step - 1]?.key;
    if (step >= TOTAL_STEPS) {
      const ok = await persistStep(TOTAL_STEPS, true);
      if (ok) {
        track("care_plan_section_completed", { section: completedSection, step });
        track("care_plan_progress", { percent_complete: 100, sections_complete: TOTAL_STEPS, total: TOTAL_STEPS });
        toast.success(i18next.t("birdSetup.setupComplete", "{{name}} setup complete.", { name: bird?.name ?? i18next.t("birdSetup.birdFallback", "Bird") }));
        navigate({ to: "/birds/$birdId", params: { birdId } });
      }
      return;
    }
    const next = stepAfter(step);
    const showStop = completedSection === "health" && !stopPointSeenRef.current && !basicsDone(bird?.setup_step, bird?.setup_complete);
    const ok = await persistStep(next);
    if (ok) {
      track("care_plan_section_completed", { section: completedSection, step });
      track("care_plan_progress", {
        percent_complete: Math.round(((next - 1) / TOTAL_STEPS) * 100),
        sections_complete: next - 1,
        total: TOTAL_STEPS,
      });
      setStep(next);
      if (showStop) {
        stopPointSeenRef.current = true;
        setAtStopPoint(true);
        track("setup_stop_point_viewed", {});
      }
    }
  }

  function keepGoing() {
    track("setup_stop_point_choice", { choice: "keep_going" });
    setAtStopPoint(false);
  }

  function setUpLater() {
    track("setup_stop_point_choice", { choice: "later" });
    // Progress already points at Behavior, so the bird's page offers to pick up
    // the pet-sitter details from there.
    navigate({ to: "/birds/$birdId/plan", params: { birdId } });
  }

  async function onBack() {
    if (atStopPoint) { setAtStopPoint(false); setStep(setupStepNumber("health")); return; }
    if (SETUP_STEPS[step - 1]?.key === "food" && foodPage === 2) {
      if (!(await flushPending())) return;
      setFoodPage(1);
      window.scrollTo(0, 0);
      return;
    }
    if (step <= 1) return;
    if (!(await flushPending())) return;
    const prev = stepBefore(step);
    const ok = await persistStep(prev);
    // Coming back into Food lands on its last page.
    if (ok) { setFoodPage(prev === setupStepNumber("food") ? 2 : 1); setStep(prev); }
  }

  async function onSaveAndExit() {
    if (!(await flushPending())) return;
    const ok = await persistStep(step);
    if (ok) {
      toast.success(t("birdSetup.progressSaved", "Progress saved."));
      navigate({ to: "/dashboard" });
    }
  }

  async function jumpToStep(target: number) {
    const clamped = Math.min(TOTAL_STEPS, Math.max(1, target));
    setAtStopPoint(false);
    setFoodPage(1);
    if (clamped === step) return;
    if (!(await flushPending())) return;
    const ok = await persistStep(clamped);
    if (ok) setStep(clamped);
  }

  // Header back arrow: return to the bird's profile, discarding any unsaved
  // edits on the current step (the SetupShell confirms first when dirty).
  function exitToProfile() {
    navigate({ to: "/birds/$birdId", params: { birdId } });
  }

  async function finishAndGo(opts: { to: "dashboard-newsit" | "home" }) {
    if (!(await flushPending())) return;
    const ok = await persistStep(TOTAL_STEPS, true);
    if (!ok) return;
    if (opts.to === "dashboard-newsit") {
      // The new-sit form lives on the Sits tab (the dashboard stopped hosting it
      // in the Home v3 redesign). Route there with ?newSit so it opens with this
      // bird preselected; on save SitForm keeps the owner on /sits.
      navigate({
        to: "/sits",
        search: { newSit: true, preselectBirdId: birdId },
      });
    } else {
      // After finishing setup, land on Home so the owner sees their bird and the
      // getting-started checklist — not back at the start of the wizard.
      navigate({ to: "/dashboard" });
    }
  }

  if (isLoading || !bird) {
    return (
      <SetupShell step={step} title={t("birdSetup.loading", "Loading…")}>
        <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />
      </SetupShell>
    );
  }

  const meta = SETUP_STEPS[step - 1];
  const isLast = step === TOTAL_STEPS;
  const onFoodPage2 = meta.key === "food" && foodPage === 2;

  if (atStopPoint) {
    return (
      <SetupShell
        step={setupStepNumber("health")}
        title={t("birdSetup.stop.title", "The basics are set for {{name}}.", { name: bird.name })}
        subtitle={t("birdSetup.stop.body", "Do you want to add more details for a pet sitter? We'll cover behavior and training, tips and tricks for {{name}}'s care, and more.", { name: bird.name })}
        birdName={bird.name}
        birdSpecies={bird.species}
        onExit={exitToProfile}
        onBack={onBack}
        onNavigateStep={jumpToStep}
        footer={
          <div className="flex items-center gap-3">
            <SetupTextButton onClick={setUpLater}>{t("birdSetup.stop.later", "Set up later")}</SetupTextButton>
            <div className="min-w-0 flex-1">
              <SetupPrimaryButton onClick={keepGoing}>{t("birdSetup.stop.keepGoing", "Keep going")}</SetupPrimaryButton>
            </div>
          </div>
        }
      >
        {/* What's done, and what "Keep going" covers. */}
        <StopPointList
          heading={t("birdSetup.stop.doneHeading", "Done")}
          done
          items={[t("setupFrame.pillDetails", "Details"), t("planEditor.tabFood", "Food"), t("planEditor.tabHealth", "Health")]}
        />
        <StopPointList
          heading={t("birdSetup.stop.nextHeading", "Next, for a pet sitter")}
          items={[
            t("birdSetup.stop.nextBehavior", "Behavior and training"),
            t("birdSetup.stop.nextTips", "Tips and tricks"),
            t("birdSetup.stop.nextDay", "{{name}}'s day", { name: bird.name }),
          ]}
        />
      </SetupShell>
    );
  }

  return (
    <SetupShell
      step={step}
      title={onFoodPage2
        ? t("birdSetup.food2.title", "Water, treats and hygiene")
        : meta.key === "health"
          ? t("birdSetup.health.title", "Keeping {{name}} healthy", { name: bird.name })
          : meta.key === "personality"
            ? t("birdSetup.behavior.title", "How {{name}} likes to be treated", { name: bird.name })
            : meta.key === "clips"
              ? t("birdSetup.tips.title", "Show your sitter how")
              : meta.key === "day"
                ? t("birdSetup.day.title", "{{name}}'s day", { name: bird.name })
                : setupStepTitle(t, meta.key)}
      subtitle={onFoodPage2 ? t("birdSetup.food2.intro", "Everything here is optional, and the defaults are a good place to start.") : undefined}
      page={meta.key === "food" ? [foodPage, 2] : undefined}
      birdName={bird.name}
      birdSpecies={bird.species}
      saving={saving}
      isDirty={dirty}
      onExit={exitToProfile}
      onNavigateStep={jumpToStep}
      onBack={onBack}
      onNext={onNext}
      onSaveAndExit={onSaveAndExit}
      nextLabel={isLast ? t("birdSetup.finishSetup", "Finish setup") : onFoodPage2 ? t("birdSetup.food2.next", "Next: Health") : meta.key === "emergency" ? t("emergencySetup.saveContacts", "Save contacts") : t("birdSetup.next", "Next")}
      backDisabled={step <= 1 && !(meta.key === "food" && foodPage === 2)}
      nextDisabled={blockNext}
      footerNote={footerNote}
      tinted={(meta.key === "day" || meta.key === "environment" || meta.key === "emergency") && !atStopPoint}
      homeSubline={homeSubline ?? undefined}
      onSkip={meta.key === "environment" || meta.key === "emergency" ? onNext : undefined}
      footerNoteWarn={meta.key === "emergency"}
      hideFooter={step === TOTAL_STEPS}
    >
      <SetupDirtyContext.Provider value={setDirty}>
        <SetupFooterNoteContext.Provider value={setFooterNote}>
        <SetupHomeSublineContext.Provider value={setHomeSubline}>
        <StepBody
          step={step}
          birdId={birdId}
          birdName={bird.name}
          onBlockNext={setBlockNext}
          onJumpToStep={jumpToStep}
          onFinish={finishAndGo}
          registerFlush={registerFlush}
          registerValidate={registerValidate}
          foodPage={foodPage}
        />
        </SetupHomeSublineContext.Provider>
        </SetupFooterNoteContext.Provider>
      </SetupDirtyContext.Provider>
    </SetupShell>
  );
}

/** One list on the stop point: checked rows for what's done, open rows for what's next. */
function StopPointList({ heading, items, done }: { heading: string; items: string[]; done?: boolean }) {
  return (
    <section className="rounded-[18px] bg-[#f1f5f0] px-4 py-4 text-[#1a3d2e]">
      <h2 className="m-0 text-[13px] font-[700] text-[#5f5e5a]">{heading}</h2>
      <ul className="m-0 mt-1 list-none p-0">
        {items.map((item) => (
          <li key={item} className="flex min-h-[44px] items-center gap-3 text-[16px] font-[500]">
            {done ? (
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#1a3d2e] text-[#cdeab0]" aria-hidden="true">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
            ) : (
              <span className="size-6 shrink-0 rounded-full border-2 border-[#c9d6c9] bg-white" aria-hidden="true" />
            )}
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StepBody({
  step,
  birdId,
  birdName,
  onBlockNext,
  onJumpToStep,
  onFinish,
  registerFlush,
  registerValidate,
  foodPage,
}: {
  step: number;
  birdId: string;
  birdName: string;
  onBlockNext: (block: boolean) => void;
  onJumpToStep: (target: number) => void;
  onFinish: (opts: { to: "dashboard-newsit" | "home" }) => void;
  registerFlush: (fn: (() => Promise<void>) | null) => void;
  registerValidate: (fn: (() => boolean) | null) => void;
  foodPage: 1 | 2;
}) {
  // Steps are looked up by key, so the order lives only in SETUP_STEPS.
  switch (SETUP_STEPS[step - 1]?.key) {
    case "food": return <FoodWaterStep birdId={birdId} birdName={birdName} onBlockNext={onBlockNext} registerFlush={registerFlush} registerValidate={registerValidate} page={foodPage} />;
    case "health": return <HealthBaselineStep birdId={birdId} birdName={birdName} onBlockNext={onBlockNext} registerFlush={registerFlush} />;
    case "personality": return <PersonalityStep birdId={birdId} birdName={birdName} registerFlush={registerFlush} />;
    case "clips": return <OwnerTipsClipsStep birdId={birdId} birdName={birdName} onBlockNext={onBlockNext} />;
    case "day": return <DayInLifeStep birdId={birdId} birdName={birdName} />;
    case "environment": return <EnvironmentStep birdId={birdId} birdName={birdName} registerFlush={registerFlush} />;
    case "emergency": return <EmergencyStep birdId={birdId} birdName={birdName} onBlockNext={onBlockNext} registerFlush={registerFlush} />;
    case "review": return <ReviewStep birdId={birdId} birdName={birdName} onJumpToStep={onJumpToStep} onFinish={onFinish} />;
    default: return null;
  }
}

const TIME_BLOCKS: { key: string; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "midday", label: "Midday" },
  { key: "evening", label: "Evening" },
  { key: "bedtime", label: "Bedtime" },
  { key: "custom", label: "Custom" },
];

// Display labels for the option lists in this file. The English constants stay
// as they are: the save path writes these labels into stored care-plan text and
// routine task titles, which stay English until stored text is localized (Phase
// 2, step 3). This only changes what's shown on screen.
function displayLabel(t: TFunction, en: string): string {
  switch (en) {
    case "Uncover cage": return t("birdSetup.opt.uncoverCage", "Uncover cage");
    case "Lights on": return t("birdSetup.opt.lightsOn", "Lights on");
    case "Lights out": return t("birdSetup.opt.lightsOut", "Lights out");
    case "Open curtains": return t("birdSetup.opt.openCurtains", "Open curtains");
    case "Out-of-cage time": return t("birdSetup.opt.outOfCageTime", "Out-of-cage time");
    case "Training or play": return t("birdSetup.opt.trainingOrPlay", "Training or play");
    case "Misting or bath": return t("birdSetup.opt.mistingOrBath", "Misting or bath");
    case "Close curtains": return t("birdSetup.opt.closeCurtains", "Close curtains");
    case "Cover for night": return t("birdSetup.opt.coverForNight", "Cover for night");
    case "Pelleted diet": return t("birdSetup.opt.pelletedDiet", "Pelleted diet");
    case "Seed mix": return t("birdSetup.opt.seedMix", "Seed mix");
    case "Pellet & seed blend": return t("birdSetup.opt.pelletSeedBlend", "Pellet & seed blend");
    case "Fresh chop / formulated": return t("birdSetup.opt.freshChopFormulated", "Fresh chop / formulated");
    case "Other": return t("birdSetup.opt.other", "Other");
    case "Daily": return t("birdSetup.opt.daily", "Daily");
    case "A few times a week": return t("birdSetup.opt.aFewTimesAWeek", "A few times a week");
    case "Training only": return t("birdSetup.opt.trainingOnly", "Training only");
    case "Rarely": return t("birdSetup.opt.rarely", "Rarely");
    case "Changed once daily": return t("birdSetup.opt.changedOnceDaily", "Changed once daily");
    case "Changed twice daily": return t("birdSetup.opt.changedTwiceDaily", "Changed twice daily");
    case "More than twice daily": return t("birdSetup.opt.moreThanTwiceDaily", "More than twice daily");
    case "1 hour": return t("birdSetup.opt.1Hour", "1 hour");
    case "2 hours": return t("birdSetup.opt.2Hours", "2 hours");
    case "3 hours": return t("birdSetup.opt.3Hours", "3 hours");
    case "After every fresh-food serving": return t("birdSetup.opt.afterEveryFreshFoodServing", "After every fresh-food serving");
    case "Once a day": return t("birdSetup.opt.onceADay", "Once a day");
    case "Every few days": return t("birdSetup.opt.everyFewDays", "Every few days");
    case "Twice a day": return t("birdSetup.opt.twiceADay", "Twice a day");
    case "Yes": return t("birdSetup.opt.yes", "Yes");
    case "Sometimes": return t("birdSetup.opt.sometimes", "Sometimes");
    case "No — cage-only is fine": return t("birdSetup.opt.noCageOnlyIsFine", "No — cage-only is fine");
    case "Supervised only": return t("birdSetup.opt.supervisedOnly", "Supervised only");
    case "Specific room only": return t("birdSetup.opt.specificRoomOnly", "Specific room only");
    case "Keep in cage": return t("birdSetup.opt.keepInCage", "Keep in cage");
    case "Other pets": return t("birdSetup.opt.otherPets", "Other pets");
    case "Ceiling fans": return t("birdSetup.opt.ceilingFans", "Ceiling fans");
    case "Open windows": return t("birdSetup.opt.openWindows", "Open windows");
    case "Young children": return t("birdSetup.opt.youngChildren", "Young children");
    case "Houseplants": return t("birdSetup.opt.houseplants", "Houseplants");
    case "Kitchen & nonstick cookware": return t("birdSetup.opt.kitchenNonstickCookware", "Kitchen & nonstick cookware");
    case "Candles or diffusers": return t("birdSetup.opt.candlesOrDiffusers", "Candles or diffusers");
    case "Morning": return t("birdSetup.opt.morning", "Morning");
    case "Midday": return t("birdSetup.opt.midday", "Midday");
    case "Evening": return t("birdSetup.opt.evening", "Evening");
    case "Bedtime": return t("birdSetup.opt.bedtime", "Bedtime");
    case "Custom": return t("birdSetup.opt.custom", "Custom");
    case "Normal appetite": return t("birdSetup.opt.normalAppetite", "Normal appetite");
    case "e.g. Eats most of the chop by midday; pellets all day.": return t("birdSetup.opt.eGEatsMostOf", "e.g. Eats most of the chop by midday; pellets all day.");
    case "Normal droppings": return t("birdSetup.opt.normalDroppings", "Normal droppings");
    case "e.g. Formed, dark with white urates; greener after veggies.": return t("birdSetup.opt.eGFormedDarkWith", "e.g. Formed, dark with white urates; greener after veggies.");
    case "Normal noise level": return t("birdSetup.opt.normalNoiseLevel", "Normal noise level");
    case "e.g. Loud at sunrise/sunset; quiet midday.": return t("birdSetup.opt.eGLoudAtSunrise", "e.g. Loud at sunrise/sunset; quiet midday.");
    case "Normal activity": return t("birdSetup.opt.normalActivity", "Normal activity");
    case "e.g. Active and climbing in the morning; naps mid-afternoon.": return t("birdSetup.opt.eGActiveAndClimbing", "e.g. Active and climbing in the morning; naps mid-afternoon.");
    case "Sleep / nap habits": return t("birdSetup.opt.sleepNapHabits", "Sleep / nap habits");
    case "e.g. Covered by 8pm, sleeps ~12 hrs; short afternoon nap.": return t("birdSetup.opt.eGCoveredBy8pm", "e.g. Covered by 8pm, sleeps ~12 hrs; short afternoon nap.");
    case "Behavior with strangers": return t("birdSetup.opt.behaviorWithStrangers", "Behavior with strangers");
    case "e.g. Shy at first; warms up after an hour.": return t("birdSetup.opt.eGShyAtFirst", "e.g. Shy at first; warms up after an hour.");
    case "When to call the owner": return t("birdSetup.opt.whenToCallTheOwner", "When to call the owner");
    case "e.g. Any change in droppings, eating less, or seems off.": return t("birdSetup.opt.eGAnyChangeIn", "e.g. Any change in droppings, eating less, or seems off.");
    case "When to call the vet": return t("birdSetup.opt.whenToCallTheVet", "When to call the vet");
    case "e.g. Trouble breathing, bleeding, fall, or fluffed all day.": return t("birdSetup.opt.eGTroubleBreathingBleeding", "e.g. Trouble breathing, bleeding, fall, or fluffed all day.");
    case "How they step up": return t("birdSetup.opt.howTheyStepUp", "How they step up");
    case "Hand position, cue word, what works.": return t("birdSetup.opt.handPositionCueWordWhat", "Hand position, cue word, what works.");
    case "How to refill food & water safely": return t("birdSetup.opt.howToRefillFoodWater", "How to refill food & water safely");
    case "Show the bowls, fill amount, and any cage-door routine.": return t("birdSetup.opt.showTheBowlsFillAmount", "Show the bowls, fill amount, and any cage-door routine.");
    case "Where everything is": return t("birdSetup.opt.whereEverythingIs", "Where everything is");
    case "Walkthrough: food, treats, towels, carrier, first aid.": return t("birdSetup.opt.walkthroughFoodTreatsTowelsCarrier", "Walkthrough: food, treats, towels, carrier, first aid.");
    case "Settling them for the night": return t("birdSetup.opt.settlingThemForTheNight", "Settling them for the night");
    case "Lights, sounds, bedtime routine.": return t("birdSetup.opt.lightsSoundsBedtime", "Lights, sounds, bedtime routine.");
    case "Food prep": return t("birdSetup.opt.foodPrep", "Food prep");
    case "Making chop, portioning a pre-made mix, or prepping freeze-dried.": return t("birdSetup.opt.makingChopPortioningAPre", "Making chop, portioning a pre-made mix, or prepping freeze-dried.");
    case "Toys & foraging": return t("birdSetup.opt.toysForaging", "Toys & foraging");
    case "Setting up foraging toys, rotating enrichment, or hiding treats.": return t("birdSetup.opt.settingUpForagingToysRotating", "Setting up foraging toys, rotating enrichment, or hiding treats.");
    case "Targeting & interaction": return t("birdSetup.opt.targetingInteraction", "Targeting & interaction");
    case "Targeting, tricks, and how you like to hang out together.": return t("birdSetup.opt.targetingTricksAndHowYou", "Targeting, tricks, and how you like to hang out together.");
    case "Anything else?": return t("birdSetup.opt.anythingElse", "Anything else?");
    case "Showering, nail care, bedtime, or anything that's easier shown than told.": return t("birdSetup.opt.showeringNailCareBedtimeOr", "Showering, nail care, bedtime, or anything that's easier shown than told.");
    default: return en;
  }
}

/** Which step an auto-derived routine item comes from, for its "from …" tag. */
function sourceLabel(t: TFunction, title: string): string {
  return derivedSource(title) === "Health" ? t("birdSetup.sourceHealth", "Health") : t("birdSetup.sourceFood", "Food");
}

// Pure-rhythm chips only — items with NO structured source elsewhere. Feedings,
// water, cleaning, and medication are auto-derived from the Food / Health tabs
// (see syncFeedingTasks / syncHygieneTasks / syncMedicationTask) and must not be
// re-entered here, or they drift out of sync.
// Quick-add suggestions for the owner's own tasks. "Uncover cage" and "Cover
// for night" left the list; tasks owners already added keep their names.
const COMMON_TASKS = [
  "Lights on",
  "Open curtains",
  "Out-of-cage time",
  "Training or play",
  "Misting or bath",
  "Close curtains",
  "Lights out",
];

export function BasicsStep({ birdId, onBlockNext, registerFlush }: { birdId: string; onBlockNext: (block: boolean) => void; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: bird, isLoading } = useQuery({
    queryKey: ["bird-basics", birdId],
    // Drop the cache when the step unmounts so navigating Back refetches the
    // just-saved values, rather than re-hydrating the form from a stale (still
    // "fresh" under the 60s global staleTime) pre-edit snapshot.
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select("*").eq("id", birdId).single();
      if (error) throw error;
      return data as any;
    },
  });
  const [form, setForm] = useState<any>(null);
  const [hydrated, setHydrated] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  // `form.photo_url` holds a DISPLAYABLE value (signed URL or freshly-picked
  // data: URL); `photoRef` holds what to PERSIST (Storage path, legacy data URL,
  // or null). Keeping them separate avoids writing a transient signed URL to the
  // DB and avoids re-uploading an unchanged photo on every autosave.
  const [photoRef, setPhotoRef] = useState<string | null>(null);

  useEffect(() => {
    if (!bird || hydrated) return;
    setHydrated(true);
    setPhotoRef(bird.photo_url ?? null);
    // Show the inputs immediately; the photo's signed URL fills in async so a
    // slow or failed Storage sign never blocks (or hides) the rest of the form.
    setForm({ ...bird, photo_url: null });
    signBirdPhoto(bird.photo_url).then((url) => setForm((f: any) => ({ ...(f ?? bird), photo_url: url })));
  }, [bird, hydrated]);

  useEffect(() => {
    onBlockNext(!form?.name?.trim() || !form?.species?.trim());
  }, [form?.name, form?.species, onBlockNext]);

  useDebouncedAutosave(
    async () => {
      if (!form) return;
      // Persist the Storage path, not the displayable signed/data URL. Upload a
      // freshly-picked photo (data: URL) on first save, then reuse its path.
      let ref = photoRef;
      if (typeof ref === "string" && ref.startsWith("data:")) {
        ref = await persistBirdPhoto(form.owner_id, ref);
        setPhotoRef(ref);
      }
      // Write ONLY the columns Basics owns. Never spread the whole row — that
      // would re-write the Identity-only columns (microchip, band_number,
      // sex_method, origin, acquired_on, lineage_notes) with Basics's possibly
      // stale copy and clobber edits made in the Identity facet.
      await supabase.from("birds").update({
        name: form.name ?? null,
        species: form.species ?? null,
        age: form.age ?? null,
        birth_date: form.birth_date || null,
        sex: form.sex || null,
        flight_status: form.flight_status ?? null,
        photo_url: ref,
        photo_position: form.photo_position ?? null,
      }).eq("id", birdId);
      // Refresh every view of the shared bird record so an edit here shows up in
      // Identity, the bird-record home, and the vet summary immediately.
      ["bird", "bird-setup", "bird-identity", "bird-record", "vet-bird"].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k, birdId] }));
      qc.invalidateQueries({ queryKey: ["birds"] });
    },
    [form, photoRef, birdId, qc],
    !!form && hydrated,
    registerFlush,
  );

  if (isLoading || !form) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) {
        toast.error(t("birdSetup.thatPhotoSABit", "That photo's a bit too large even after resizing. Try a different photo."));
        return;
      }
      setForm({ ...form, photo_url: dataUrl });
      setPhotoRef(dataUrl);
    } catch {
      toast.error(t("birdSetup.couldnTProcessThatPhoto", "Couldn't process that photo. Try a different one."));
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <StepInstruction>{t("birdSetup.startWithTheEssentialsWho", "Start with the essentials — who your bird is, and a photo so your sitter recognizes them right away.")}</StepInstruction>
      <section className="rounded-2xl bg-[#efe9da] p-4 space-y-3">
        <div className="flex items-start gap-3">
          {form.photo_url ? (
            <PhotoCropper src={form.photo_url} position={form.photo_position} onChange={(pos) => setForm({ ...form, photo_position: pos })} size={120} />
          ) : (
            <div className="flex size-[120px] items-center justify-center rounded-xl bg-sage-100 text-[10px] uppercase tracking-wider text-sage-600">{t("birdSetup.noPhoto", "No photo")}</div>
          )}
          <div className="flex-1 space-y-2 pt-1">
            <label className={`inline-block rounded-lg bg-sage-100 px-3 py-1.5 text-xs font-semibold text-sage-700 ${photoBusy ? "cursor-default opacity-60" : "cursor-pointer"}`}>
              {photoBusy ? t("birdSetup.processing", "Processing…") : form.photo_url ? t("birdSetup.changePhoto", "Change photo") : t("birdSetup.addPhoto", "Add photo")}
              <input type="file" accept="image/*,.heic,.heif" disabled={photoBusy} className="hidden" onChange={onPhoto} />
            </label>
            {form.photo_url && (
              <button type="button" onClick={() => { setForm({ ...form, photo_url: null, photo_position: null }); setPhotoRef(null); }} className="ml-2 text-xs font-semibold text-warn-red underline">{t("birdSetup.remove", "Remove")}</button>
            )}
          </div>
        </div>
        <BirdField label={t("birdSetup.name", "Name")}><input className="input" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></BirdField>
        <SpeciesPicker value={form.species ?? ""} onChange={(v) => setForm({ ...form, species: v })} />
        <AgePicker age={form.age ?? ""} birthDate={form.birth_date ?? ""} onChange={(next) => setForm({ ...form, age: next.age, birth_date: next.birthDate })} />
        <div className="grid grid-cols-2 gap-3">
          <BirdField label={t("birdSetup.sex", "Sex")}>
            <select className="input" value={form.sex ?? ""} onChange={(e) => setForm({ ...form, sex: e.target.value || null })}>
              <option value="">{t("birdSetup.unknown", "Unknown")}</option><option value="Male">{t("birdSetup.male", "Male")}</option><option value="Female">{t("birdSetup.female", "Female")}</option>
            </select>
          </BirdField>
          <BirdField label={t("birdSetup.flight", "Flight")}>
            <select className="input" value={form.flight_status ?? "unknown"} onChange={(e) => setForm({ ...form, flight_status: e.target.value })}>
              <option value="unknown">{t("birdSetup.unknown", "Unknown")}</option>
              <option value="fully_flighted">{t("birdSetup.fullyFlighted", "Fully flighted")}</option>
              <option value="clipped">{t("birdSetup.clipped", "Clipped")}</option>
              <option value="partially_clipped">{t("birdSetup.partiallyClipped", "Partially clipped")}</option>
            </select>
          </BirdField>
        </div>
      </section>
      {(!form.name?.trim() || !form.species?.trim()) && (
        <p className="rounded-xl bg-warn-amber/10 px-3 py-2 text-xs font-medium text-warn-amber">
          {t("birdSetup.addANameAndSpecies", "Add a name and species to continue.")}
        </p>
      )}
      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}`}</style>
    </div>
  );
}

export function DayInLifeStep({ birdId, birdName }: { birdId: string; birdName: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: plan } = useQuery({
    queryKey: ["plan", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("care_plans").select("id").eq("bird_id", birdId).maybeSingle();
      return data;
    },
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", plan?.id],
    enabled: !!plan?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("routine_tasks")
        .select("*")
        .eq("care_plan_id", plan!.id)
        .order("category")
        .order("sort_order");
      return data ?? [];
    },
  });

  const grouped = useMemo(() => {
    const g: Record<string, any[]> = {};
    for (const t of tasks) (g[t.category] ??= []).push(t);
    return g;
  }, [tasks]);

  function refresh() {
    if (plan?.id) qc.invalidateQueries({ queryKey: ["tasks", plan.id] });
  }

  // "Start from another bird?" — walkthrough only, while this bird has none of its own tasks.
  const inFrame = useContext(InSetupFrame);
  const offerCopy = inFrame && !isLoading && !!plan && !tasks.some(isOwnTask);
  const { data: copySources = [] } = useCopySources(birdId, "day", offerCopy);
  const [showCopy, setShowCopy] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  useEffect(() => { if (offerCopy && copySources.length) setShowCopy(true); }, [offerCopy, copySources.length]);

  async function copyDay(sourcePlanId: string) {
    const { data: rows, error } = await supabase.from("routine_tasks").select("*").eq("care_plan_id", sourcePlanId);
    if (error) throw error;
    const inserts = dayCopy(rows ?? [], plan!.id);
    if (inserts.length) {
      const { error: insertError } = await supabase.from("routine_tasks").insert(inserts as any);
      if (insertError) throw insertError;
    }
    setCopyDone(true);
    refresh();
  }

  if (isLoading || !plan) {
    return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;
  }

  return (
    <div className="flex flex-col gap-[14px]">
      <StepInstruction>{t("birdSetup.instr.day", "What does a normal day look like for {{name}}? Add the details that keep care smooth from morning to night.", { name: birdName })}</StepInstruction>

      {showCopy && (!tasks.some(isOwnTask) || copyDone) && (
        <StartFromAnotherBird kind="day" birdName={birdName} sources={copySources} onCopy={(source) => copyDay(source.plan.id)} />
      )}

      {TIME_BLOCKS.map((block) => (
        <TimeBlockSection
          key={block.key}
          block={block}
          planId={plan.id}
          tasks={grouped[block.key] ?? []}
          onChange={refresh}
        />
      ))}
    </div>
  );
}

function blockIcon(key: string) {
  const cls = "size-[22px]";
  switch (key) {
    case "morning": return <Sunrise className={cls} aria-hidden="true" />;
    case "midday": return <Sun className={cls} aria-hidden="true" />;
    case "evening": return <Sunset className={cls} aria-hidden="true" />;
    case "bedtime": return <Moon className={cls} aria-hidden="true" />;
    default: return <Clock className={cls} aria-hidden="true" />;
  }
}

/** A Food clock time on an automatic task ("7:30 AM"), if it has one. */
function taskClock(task: any): string | null {
  const v = (task.time_of_day ?? "").trim();
  return /\d/.test(v) ? v : null;
}

function TimeBlockSection({
  block,
  planId,
  tasks,
  onChange,
}: {
  block: { key: string; label: string };
  planId: string;
  tasks: any[];
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState("");
  const [addingCustom, setAddingCustom] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Automatic tasks (feeding/water/hygiene/medication) are read-only here — they
  // come from the Food and Health steps. Only the owner's own tasks are editable.
  const derivedTasks = tasks.filter((item) => isDerivedTask(item.title));
  const manualTasks = tasks.filter((item) => !isDerivedTask(item.title));
  const present = new Set(manualTasks.map((item) => item.title.trim().toLowerCase()));
  // A suggestion disappears once this block already has it.
  const availableChips = COMMON_TASKS.filter((item) => !present.has(item.trim().toLowerCase()));
  const bedtime = block.key === "bedtime";

  async function add(title: string) {
    if (busy) return;
    setBusy(true);
    await supabase.from("routine_tasks").insert({
      care_plan_id: planId,
      title,
      category: block.key,
      sort_order: tasks.length,
    } as any);
    setBusy(false);
    onChange();
  }
  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    await supabase.from("routine_tasks").delete().eq("id", id);
    setBusy(false);
    onChange();
  }
  async function addCustom() {
    const title = custom.trim();
    if (!title) return;
    await add(title);
    setCustom("");
    setAddingCustom(false);
  }
  async function saveNote(id: string, value: string) {
    await supabase.from("routine_tasks").update({ instructions: value.trim() || null } as any).eq("id", id);
    onChange();
  }

  const label = "m-0 text-[12.5px] font-[700] text-[#5f5e5a]";
  const chip = "inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 border-dashed border-[#9bb5a6] bg-white px-3.5 text-[14.5px] font-[700] text-[#1a3d2e] disabled:opacity-50";

  return (
    <section className="flex flex-col gap-3 rounded-[20px] border-b bg-white p-4" style={{ borderColor: S.footerLine, color: S.forest }}>
      <div className="flex items-center gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-full"
          style={bedtime ? { background: S.forest, color: S.lime } : { background: S.lime, color: S.forest }}
        >
          {blockIcon(block.key)}
        </span>
        <h2 className="m-0 text-[23px] font-[700] leading-[1.15]" style={{ fontFamily: SERIF }}>{displayLabel(t, block.label)}</h2>
      </div>

      {derivedTasks.length > 0 && (
        <div>
          <p className={label}>{t("birdSetup.day.fromFoodAndHealth", "From Food and Health")}</p>
          <ul className="m-0 mt-1 list-none p-0">
            {derivedTasks.map((item, i) => {
              const clock = taskClock(item);
              return (
                <li key={item.id} className={`flex min-h-[42px] items-center gap-2.5 py-2 text-[15px] ${i > 0 ? "border-t border-[#e3ebe2]" : ""}`}>
                  <span className="shrink-0" style={{ color: S.moss }}>
                    {derivedSource(item.title) === "Health" ? <Pill className="size-4" aria-hidden="true" /> : <Soup className="size-4" aria-hidden="true" />}
                  </span>
                  <span className="min-w-0">
                    {item.title}
                    {clock && <span style={{ color: S.quiet }}> · {clock}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {manualTasks.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className={label}>{t("birdSetup.day.yourTasks", "Your tasks")}</p>
          {manualTasks.map((item) => (
            <div key={item.id} className="rounded-[14px] px-3.5" style={{ background: S.lime }}>
              <div className="flex min-h-[52px] items-center gap-2">
                <button type="button" onClick={() => setEditingId(editingId === item.id ? null : item.id)} className="min-w-0 flex-1 py-2.5 text-left">
                  <span className="block text-[15px] font-[700]">{displayLabel(t, item.title)}</span>
                  {item.instructions && editingId !== item.id && <span className="mt-0.5 block whitespace-pre-line text-[14px]">{item.instructions}</span>}
                </button>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label={t("birdSetup.removeTask", "Remove {{title}}", { title: item.title })}
                  className="grid size-11 shrink-0 place-items-center rounded-full"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
              {editingId === item.id && (
                <textarea
                  autoFocus
                  aria-label={t("birdSetup.addANoteOptional", "Add a note (optional)")}
                  placeholder={t("birdSetup.addANoteOptional", "Add a note (optional)")}
                  defaultValue={item.instructions ?? ""}
                  maxLength={500}
                  className="mb-3 min-h-[72px] w-full rounded-[12px] border-2 bg-white px-3.5 py-2.5 text-[15px] leading-[1.5] outline-none"
                  style={{ borderColor: S.forest, color: S.forest }}
                  onBlur={(e) => {
                    if ((e.target.value ?? "").trim() !== (item.instructions ?? "")) saveNote(item.id, e.target.value);
                    setEditingId(null);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {availableChips.map((item) => (
          <button key={item} type="button" onClick={() => add(item)} disabled={busy} className={chip}>
            <Plus className="size-4" strokeWidth={2.6} aria-hidden="true" /> {displayLabel(t, item)}
          </button>
        ))}
        {!addingCustom && (
          <button type="button" onClick={() => setAddingCustom(true)} className={chip}>
            {t("birdSetup.day.yourOwn", "+ Your own")}
          </button>
        )}
      </div>

      {addingCustom && (
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              value={custom}
              onChange={setCustom}
              maxLength={120}
              ariaLabel={t("birdSetup.addYourOwn", "Add your own…")}
              placeholder={t("birdSetup.addYourOwn", "Add your own…")}
            />
          </div>
          <SetupTextButton onClick={addCustom} disabled={!custom.trim() || busy}>{t("birdSetup.addButton", "Add")}</SetupTextButton>
        </div>
      )}
    </section>
  );
}

// ---------- Food & water ----------

const DIET_OPTIONS = [
  { value: "pelleted", label: "Pelleted diet" },
  { value: "seed", label: "Seed mix" },
  { value: "pellet_seed", label: "Pellet & seed blend" },
  { value: "chop", label: "Fresh chop / formulated" },
  { value: "other", label: "Other" },
];


const FRESH_FOOD_OPTIONS = [
  "Pre-made chop", "Leafy greens", "Carrot", "Bell pepper", "Broccoli", "Sweet potato",
  "Squash", "Apple (no seeds)", "Berries", "Banana", "Cooked grains",
  "Cooked legumes", "Sprouts", "Quinoa",
];

const TREAT_FREQ = [
  { value: "daily", label: "Daily" },
  { value: "few_per_week", label: "A few times a week" },
  { value: "training_only", label: "Training only" },
  { value: "rarely", label: "Rarely" },
];

const WATER_FREQ = [
  { value: "once", label: "Changed once daily" },
  { value: "twice", label: "Changed twice daily" },
  { value: "more", label: "More than twice daily" },
];

// Pre-filled starting list for a new plan. It's the owner's own free text once
// saved, so it starts in the owner's language.
function neverDefaults(t: TFunction): string[] {
  return [
    t("birdSetup.never.chocolate", "Chocolate"),
    t("birdSetup.never.avocado", "Avocado"),
    t("birdSetup.never.caffeine", "Caffeine"),
    t("birdSetup.never.alcohol", "Alcohol"),
    t("birdSetup.never.onionGarlic", "Onion & garlic"),
    t("birdSetup.never.salt", "Salt"),
    t("birdSetup.never.fruitPits", "Fruit pits & apple seeds"),
  ];
}

const REMOVAL_OPTIONS = [
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
];

const FOOD_BOWL_WASH_OPTIONS = [
  { value: "after_each_fresh", label: "After every fresh-food serving" },
  { value: "once_daily", label: "Once a day" },
  { value: "every_few_days", label: "Every few days" },
];

const WATER_BOWL_WASH_OPTIONS = [
  { value: "once_daily", label: "Once a day" },
  { value: "twice_daily", label: "Twice a day" },
];

// Prefixes used by the sync functions to find/replace their auto-generated rows
// (and by the builder to mark derived items read-only) live in @/lib/routineTasks.

// A user-checked sitter task counts as "fresh food served" when the title
// looks like a fresh-food / chop meal task. The auto-generated removal task
// itself is excluded — checking the removal task should NOT start a new timer.
export const FRESH_FOOD_TASK_PATTERN = /\b(fresh|chop|veg|veggies|salad|sprout)\b/i;

type DietItem = FoodItem;

export function FoodWaterStep({
  birdId,
  birdName,
  onBlockNext,
  registerFlush,
  registerValidate,
  page,
}: {
  birdId: string;
  birdName: string;
  /** The walkthrough shows Food on two pages: 1 = what the bird eats, 2 =
   *  water, treats and hygiene. Omitted (the plan editor): both, one page. */
  page?: 1 | 2;
  onBlockNext: (block: boolean) => void;
  registerFlush?: (fn: (() => Promise<void>) | null) => void;
  // Wizard-only: register a gate run on "Next". Returns true to proceed; on false
  // the step shows its validation banner/flags. The tabbed editor omits this.
  registerValidate?: (fn: (() => boolean) | null) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-food", birdId],
    gcTime: 0, // drop cache on unmount so Back refetches saved values (see BasicsStep)
    queryFn: async () => {
      const { data, error } = await supabase
        .from("care_plans")
        .select("*")
        .eq("bird_id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // form state — initialized once from plan
  const [diet, setDiet] = useState<string[]>([]);
  const [dietOther, setDietOther] = useState("");
  const [dietDetails, setDietDetails] = useState<Record<string, DietItem[]>>({});
  const [brand, setBrand] = useState("");
  const [amountValue, setAmountValue] = useState("");
  const [amountUnit, setAmountUnit] = useState("");
  const [freshOther, setFreshOther] = useState("");
  // Homemade-chop ingredient checklist (stored in the existing fresh_foods column).
  const [chopIngredients, setChopIngredients] = useState<string[]>([]);
  const [treatsNotes, setTreatsNotes] = useState("");
  const [treatsFreq, setTreatsFreq] = useState("");
  const [never, setNever] = useState<string[]>([]);
  const [newNever, setNewNever] = useState("");
  const [addingNever, setAddingNever] = useState(false);
  const [waterFreq, setWaterFreq] = useState("");
  const [waterNotes, setWaterNotes] = useState("");
  const [storage, setStorage] = useState("");
  const [removalMinutes, setRemovalMinutes] = useState<number>(120);
  const [foodBowlWash, setFoodBowlWash] = useState<string>("after_each_fresh");
  const [waterBowlWash, setWaterBowlWash] = useState<string>("once_daily");
  const [hygieneNotes, setHygieneNotes] = useState<string>("");
  // Per-row in-flight "add a time" input, keyed by `${type}:${index}`.
  const [hydrated, setHydrated] = useState(false);

  // Fill the form from a care_plans row: the bird's own plan on load, or the
  // bird's plan overlaid with another bird's food ("Start from another bird?").
  function hydrate(plan: any) {
    const dietTypes = (plan.diet_types ?? []) as string[];
    setDiet(dietTypes);
    setDietOther(plan.diet_other ?? "");
    const seedBrand = plan.food_brand ?? "";
    const seedAmt = plan.amount_value != null ? String(plan.amount_value) : "";
    const seedUnit = plan.amount_unit ?? "";
    setBrand(seedBrand);
    setAmountValue(seedAmt);
    setAmountUnit(seedUnit);
    const dd = { ...((plan.diet_details ?? {}) as Record<string, DietItem[]>) };
    const hasAny = Object.values(dd).some((arr) => Array.isArray(arr) && arr.length);
    if (!hasAny && dietTypes.length && (seedBrand || seedAmt || seedUnit)) {
      dd[dietTypes[0]] = [{ name: seedBrand, amount: seedAmt, unit: seedUnit, times: [] }];
    }
    // Chop: pre-made (branded items), homemade (ingredient checklist + one
    // auto-named item), or both. Reading legacy data: items already tagged with `homemade`
    // are used as-is; older chop data (veggie items / a populated fresh_foods
    // list) is inferred as homemade and collapsed into one "Homemade chop" item.
    const legacyFresh = (plan.fresh_foods ?? []) as string[];
    if (dietTypes.includes("chop")) {
      const existing = (dd["chop"] ?? []) as DietItem[];
      const alreadyTagged = existing.length > 0 && existing[0].homemade !== undefined;
      if (alreadyTagged) {
        if (existing.some((i) => i.homemade)) setChopIngredients(legacyFresh);
      } else if (existing.length > 0 || legacyFresh.length > 0) {
        const looksHomemade =
          legacyFresh.length > 0 ||
          existing.some((i) => FRESH_FOOD_OPTIONS.some((f) => f.toLowerCase() === i.name.trim().toLowerCase()));
        if (looksHomemade) {
          const names = Array.from(new Set([...legacyFresh, ...existing.map((i) => i.name.trim()).filter(Boolean)]));
          setChopIngredients(names);
          const first = existing[0];
          dd["chop"] = [{ ...blankFoodItem(), name: HOMEMADE_CHOP_NAME, homemade: true, amount: first?.amount ?? "", unit: first?.unit ?? "", times: first?.times ?? [], freeFed: first?.freeFed ?? false, note: first?.note ?? null }];
        } else {
          dd["chop"] = existing.map((i) => ({ ...i, homemade: false }));
        }
      }
      // else chop selected but empty → leave with no items so the owner chooses a mode.
    }
    setDietDetails(dd);
    setFreshOther(plan.fresh_foods_other ?? "");
    setTreatsNotes(plan.treats_notes ?? "");
    setTreatsFreq(plan.treats_frequency ?? "");
    const nv = (plan.never_feed ?? []) as string[];
    setNever(nv.length ? nv : neverDefaults(t));
    setWaterFreq(plan.water_frequency ?? "");
    setWaterNotes(plan.water_notes ?? "");
    setStorage(plan.food_storage ?? "");
    setRemovalMinutes(plan.fresh_food_removal_minutes ?? 120);
    setFoodBowlWash(plan.food_bowl_wash_cadence ?? "after_each_fresh");
    setWaterBowlWash(plan.water_bowl_wash_cadence ?? "once_daily");
    setHygieneNotes(plan.food_hygiene_notes ?? "");
    setHydrated(true);
  }
  useEffect(() => {
    if (plan && !hydrated) hydrate(plan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, hydrated]);

  // "Start from another bird?" — walkthrough only, while this bird's food is empty.
  const inFrame = useContext(InSetupFrame);
  const offerCopy = inFrame && page !== 2 && hydrated && diet.length === 0;
  const { data: copySources = [] } = useCopySources(birdId, "food", offerCopy);
  const [showCopy, setShowCopy] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  useEffect(() => { if (offerCopy && copySources.length) setShowCopy(true); }, [offerCopy, copySources.length]);

  // ---- Completeness + wizard validation gate ----
  const [validationActive, setValidationActive] = useState(false);
  const [expandSignal, setExpandSignal] = useState(0);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  const typeLabel = useCallback(
    (item: string) => (item === "other" ? (dietOther.trim() || t("birdSetup.opt.other", "Other")) : displayLabel(t, DIET_OPTIONS.find((o) => o.value === item)?.label ?? item)),
    [dietOther, t],
  );

  // Which kinds of chop the owner feeds, read from its items: a homemade-tagged
  // item means homemade, any other item means pre-made; both can be on. No
  // items yet → nothing chosen (the owner must pick).
  const chopItemsState = dietDetails["chop"] ?? [];
  const chopKinds = {
    homemade: chopItemsState.some((i) => i.homemade),
    premade: chopItemsState.some((i) => !i.homemade),
  };

  // Incomplete items across all selected types (recomputed live). For chop, not
  // having chosen a mode yet also counts as incomplete.
  const incomplete = useMemo(() => {
    const labels: string[] = [];
    let count = 0;
    for (const t of diet) {
      const items = dietDetails[t] ?? [];
      if (items.length === 0) { count += 1; labels.push(typeLabel(t)); continue; }
      const bad = items.filter((it) => !isFoodItemComplete(it));
      if (bad.length) { count += bad.length; labels.push(typeLabel(t)); }
    }
    return { labels, count };
  }, [diet, dietDetails, typeLabel]);

  // The tabbed editor navigates tabs freely — never disable Next here. The wizard
  // gates forward navigation through registerValidate (a Next-click check) so it
  // can show the banner + field flags instead of a silently-disabled button.
  useEffect(() => { onBlockNext(false); }, [onBlockNext]);

  // Once everything is complete, drop the active validation styling.
  useEffect(() => {
    if (validationActive && incomplete.count === 0) setValidationActive(false);
  }, [validationActive, incomplete.count]);

  // Register the wizard's Next gate (no-op in the tabbed editor, which doesn't
  // pass registerValidate). Re-registered each render so it sees latest state.
  useEffect(() => {
    if (!registerValidate) return;
    registerValidate(() => {
      if (incomplete.count === 0) return true;
      setValidationActive(true);
      setExpandSignal((n) => n + 1);
      requestAnimationFrame(() => bannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return false;
    });
    return () => registerValidate(null);
  });

  // Persist (debounced) whenever form changes after hydration.
  useDebouncedAutosave(
    async () => {
      if (!plan) return;
      const dietLabels = diet.map((d) => DIET_OPTIONS.find((o) => o.value === d)?.label).filter(Boolean) as string[];
      if (diet.includes("other") && dietOther.trim()) dietLabels.push(dietOther.trim());

      const perTypeLines: string[] = [];
      const allFeedingTimes = new Set<string>();
      for (const t of diet) {
        const label = DIET_OPTIONS.find((o) => o.value === t)?.label ?? t;
        const items = (dietDetails[t] ?? []).filter((it) => it.name.trim() || it.amount.trim());
        if (!items.length) continue;
        const parts = items.map((it) => {
          const amt = formatAmountUnit(it.amount, it.unit);
          let when = "";
          if (it.freeFed) {
            when = "available all day";
          } else {
            const labels = normalizeFeedTimes(it.times).map((ft) => feedTimeLabel(ft, "period"));
            labels.forEach((l) => allFeedingTimes.add(l));
            when = labels.length ? `@ ${labels.join(", ")}` : "";
          }
          return [it.name.trim(), amt, when].filter(Boolean).join(" — ");
        }).filter(Boolean);
        if (parts.length) perTypeLines.push(`${label}: ${parts.join("; ")}`);
      }

      // Back-compat: derive legacy single brand/amount from the first filled item.
      const firstItem = diet.flatMap((item) => dietDetails[item] ?? []).find((it) => it.name.trim() || it.amount.trim());
      const legacyBrand = (firstItem?.name?.trim() || brand) ?? "";
      const legacyAmtVal = (firstItem?.amount?.trim() || amountValue) ?? "";
      const legacyAmtUnit = firstItem?.unit || amountUnit;
      const amountStr = formatAmountUnit(legacyAmtVal, legacyAmtUnit);

      const removalLabel = REMOVAL_OPTIONS.find((o) => o.value === removalMinutes)?.label ?? `${removalMinutes} min`;
      const foodWashLabel = FOOD_BOWL_WASH_OPTIONS.find((o) => o.value === foodBowlWash)?.label ?? foodBowlWash;
      const waterWashLabel = WATER_BOWL_WASH_OPTIONS.find((o) => o.value === waterBowlWash)?.label ?? waterBowlWash;

      // Fresh foods list — the homemade-chop ingredient checklist. Pre-made and
      // non-chop diets contribute no ingredient list.
      const freshList = chopKinds.homemade ? chopIngredients.map((s) => s.trim()).filter(Boolean) : [];

      const feedingTimesArr = Array.from(allFeedingTimes);

      const foodSummaryParts = [
        dietLabels.length ? `Diet: ${dietLabels.join(", ")}` : "",
        ...perTypeLines,
        perTypeLines.length === 0 && legacyBrand.trim() ? `Brand: ${legacyBrand.trim()}` : "",
        perTypeLines.length === 0 && amountStr ? `Amount per serving: ${amountStr}` : "",
        diet.includes("chop") && freshOther.trim() ? `Other fresh foods: ${freshOther.trim()}` : "",
        storage.trim() ? `Stored: ${storage.trim()}` : "",
        `Freshness & hygiene:\n  • Remove fresh/wet food after ${removalLabel}\n  • Wash food bowls: ${foodWashLabel}\n  • Wash water bowl/bottle: ${waterWashLabel}${hygieneNotes.trim() ? `\n  • Notes: ${hygieneNotes.trim()}` : ""}`,
      ].filter(Boolean);
      const treatLabel = TREAT_FREQ.find((f) => f.value === treatsFreq)?.label;
      const treatsSummary = [treatsNotes.trim(), treatLabel ? `Frequency: ${treatLabel}` : ""].filter(Boolean).join(" — ");
      const waterLabel = WATER_FREQ.find((f) => f.value === waterFreq)?.label;
      const waterSummary = [
        waterLabel ?? "",
        waterNotes.trim(),
        `Wash bowl/bottle ${waterWashLabel.toLowerCase()}`,
      ].filter(Boolean).join(" — ");

      // Persist only currently-selected diet types' details.
      const detailsToSave: Record<string, DietItem[]> = {};
      for (const t of diet) if ((dietDetails[t] ?? []).length) detailsToSave[t] = dietDetails[t];

      // Mirror to the legacy text field too so the sitter view stays consistent.
      const freshRemovalSummary = `Remove fresh / wet food after ${removalLabel}. Fresh food spoils fast and can grow bacteria.`;

      await supabase
        .from("care_plans")
        .update({
          diet_types: diet,
          diet_other: dietOther || null,
          diet_details: detailsToSave,
          food_brand: legacyBrand || null,
          amount_value: legacyAmtVal ? Number(legacyAmtVal) : null,
          amount_unit: legacyAmtUnit || null,
          feeding_times: feedingTimesArr,
          fresh_foods: freshList,
          fresh_foods_other: chopKinds.homemade ? (freshOther || null) : null,
          treats_notes: treatsNotes || null,
          treats_frequency: treatsFreq || null,
          never_feed: never,
          water_frequency: waterFreq || null,
          water_notes: waterNotes || null,
          food_storage: storage || null,
          fresh_food_removal_minutes: removalMinutes,
          food_bowl_wash_cadence: foodBowlWash,
          water_bowl_wash_cadence: waterBowlWash,
          food_hygiene_notes: hygieneNotes || null,
          // Free-text food summary blobs (food_instructions, treats_allowed,
          // foods_never_allowed, water_instructions, fresh_food_removal) are no
          // longer written — the sitter view assembles food display from the
          // structured columns above. See FoodEditor / care-sheet.tsx.
        } as any)
        .eq("id", plan.id);

      // Sync auto-generated routine tasks: feeding (per-item × times) and hygiene.
      const allItems: DietItem[] = diet.flatMap((item) => (dietDetails[item] ?? []));
      await syncFeedingTasks(plan.id, allItems);

      const hasFresh = diet.includes("chop") || freshList.length > 0 || freshOther.trim().length > 0;
      const waterChangeLabel =
        waterFreq === "once" ? "once daily"
        : waterFreq === "twice" ? "twice daily"
        : waterFreq === "more" ? "more than twice daily"
        : null;
      await syncHygieneTasks(plan.id, {
        removalLabel,
        foodWashLabel,
        waterWashLabel,
        waterChangeLabel,
        hasFresh,
        removalMinutes,
        foodBowlWash,
        waterBowlWash,
        waterFreq,
      });

      qc.invalidateQueries({ queryKey: ["plan", birdId] });
      qc.invalidateQueries({ queryKey: ["tasks", plan.id] });
    },
    [diet, dietOther, dietDetails, brand, amountValue, amountUnit, freshOther, chopIngredients, treatsNotes, treatsFreq, never, waterFreq, waterNotes, storage, removalMinutes, foodBowlWash, waterBowlWash, hygieneNotes],
    !!plan && hydrated,
    registerFlush,
  );

  if (isLoading || !plan) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  const setItemsForType = (type: string, items: DietItem[]) =>
    setDietDetails((prev) => ({ ...prev, [type]: items }));

  // Selecting a type creates its card with one auto-expanded "needs details"
  // item (chop waits for the pre-made/homemade choice instead). Deselecting a
  // type that has filled-in content confirms before discarding.
  function toggleDietType(value: string) {
    if (diet.includes(value)) {
      const items = dietDetails[value] ?? [];
      const hasContent = items.some(foodItemHasContent) || (value === "chop" && chopIngredients.length > 0);
      if (hasContent && !window.confirm(t("birdSetup.removeDietTypeConfirm", "Remove {{type}} and the items you've added to it?", { type: typeLabel(value) }))) return;
      setDiet(diet.filter((d) => d !== value));
      setDietDetails((prev) => { const next = { ...prev }; delete next[value]; return next; });
      if (value === "chop") setChopIngredients([]);
    } else {
      // A new type starts empty: its card shows "Add your first …".
      setDiet([...diet, value]);
    }
  }

  // Chop: remove the homemade item and its ingredients (asks first when there's
  // anything to lose). Pre-made items are added and removed in the editor.
  function removeHomemadeChop() {
    const homemade = chopItemsState.filter((i) => i.homemade);
    const hasContent = homemade.some(foodItemHasContent) || chopIngredients.length > 0 || freshOther.trim() !== "";
    if (hasContent && !window.confirm(t("birdSetup.removeHomemadeConfirm", "Remove homemade chop? This clears its amount, timing and ingredients."))) return;
    setItemsForType("chop", chopItemsState.filter((i) => !i.homemade));
    setChopIngredients([]);
    setFreshOther("");
  }

  function toggleChopIngredient(label: string) {
    setChopIngredients((prev) =>
      prev.some((x) => x.toLowerCase() === label.toLowerCase())
        ? prev.filter((x) => x.toLowerCase() !== label.toLowerCase())
        : [...prev, label],
    );
  }

  return (
    <div className="flex flex-col gap-[14px]">
      {page !== 2 && (
        <>
      <StepInstruction>{t("birdSetup.instr.food", "What does {{name}} eat, and how much? Clear answers mean anyone caring for {{name}} knows exactly what to serve, and when.", { name: birdName })}</StepInstruction>

      {showCopy && (diet.length === 0 || copyDone) && (
        <StartFromAnotherBird
          kind="food"
          birdName={birdName}
          sources={copySources}
          onCopy={(source) => { hydrate({ ...plan, ...foodCopy(source.plan) }); setCopyDone(true); }}
        />
      )}

      {/* Primary diet */}
      <Card title={t("birdSetup.primaryDiet", "Primary diet")} hint={t("birdSetup.chooseAllThatApply", "Choose all that apply.")}>
        <div className="flex flex-wrap gap-2">
          {DIET_OPTIONS.map((o) => (
            <Chip key={o.value} on={diet.includes(o.value)} onClick={() => toggleDietType(o.value)}>
              {displayLabel(t, o.label)}
            </Chip>
          ))}
        </div>
      </Card>

      {/* One card per selected food type, in chip order — shared FoodItemsEditor */}
      {diet.length > 0 && (
        <>
          <p className="m-0 text-[15px] leading-[1.5] text-[#3d4f45]">
            {t("birdSetup.forEachFoodAdd", "For each food, add the brand, how much, and when it's served.")}
          </p>
          <FoodItemsEditor
            types={DIET_OPTIONS.filter((o) => diet.includes(o.value)).map((o) => ({ value: o.value, label: displayLabel(t, o.label) }))}
            details={dietDetails}
            onChangeType={setItemsForType}
            validationActive={validationActive}
            expandSignal={expandSignal}
            otherDescription={{ value: dietOther, onChange: setDietOther }}
            chop={{
              onRemoveHomemade: removeHomemadeChop,
              ingredients: chopIngredients,
              onToggleIngredient: toggleChopIngredient,
              neverFeed: never,
              other: freshOther,
              onOtherChange: setFreshOther,
            }}
          />
          {validationActive && incomplete.count > 0 && (
            <div
              ref={bannerRef}
              className="flex scroll-mt-24 items-start gap-2 rounded-2xl border p-4"
              style={{ borderColor: "#BA7517", backgroundColor: "#f6e7c4" }}
            >
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-[#854F0B]" />
              <p className="text-sm text-[#854F0B]">
                {incomplete.count > 1
                  ? t("birdSetup.itemsNeedDetails", "{{n}} items need details. Add the brand, amount, and timing for: {{list}}.", { n: incomplete.count, list: incomplete.labels.join(", ") })
                  : t("birdSetup.itemNeedsDetails", "{{n}} item needs details. Add the brand, amount, and timing for: {{list}}.", { n: incomplete.count, list: incomplete.labels.join(", ") })}
              </p>
            </div>
          )}
        </>
      )}

        </>
      )}

      {page !== 1 && (
        <>
          {/* Water, treats and hygiene (Food · 2 of 2 in the walkthrough). */}
          <SectionCard emphasis title={t("birdSetup.neverFeed", "Never feed")} helper={t("birdSetup.commonToxicFoodsArePrefilled", "Common toxic foods are prefilled. Add anything specific to your bird.")}>
            <EditableList items={never} onRemove={(i) => setNever(never.filter((_, j) => j !== i))} />
            {addingNever ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  aria-label={t("birdSetup.addAnotherFoodToNever", "Add another food to never feed")}
                  className="h-12 min-w-0 flex-1 rounded-full border-2 border-[#c9d6c9] bg-white px-[18px] text-[16px] text-[#1a3d2e] outline-none focus:border-[#1a3d2e]"
                  value={newNever}
                  maxLength={80}
                  onChange={(e) => setNewNever(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addNever(); }
                    if (e.key === "Escape") { setNewNever(""); setAddingNever(false); }
                  }}
                />
                <SetupTextButton onClick={addNever} disabled={!newNever.trim()}>{t("birdSetup.addButton", "Add")}</SetupTextButton>
              </div>
            ) : (
              <div>
                <SetupTextButton onClick={() => setAddingNever(true)} icon={<Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />}>
                  {t("birdSetup.addAnotherFoodToNever", "Add another food to never feed")}
                </SetupTextButton>
              </div>
            )}
          </SectionCard>

          <SectionCard title={t("birdSetup.treats", "Treats")}>
            <Field label={t("birdSetup.whatTreatsAreOk", "What treats are OK?")} htmlFor="food-treats">
              <TextField id="food-treats" value={treatsNotes} onChange={setTreatsNotes} placeholder={t("birdSetup.treatsPlaceholder", "e.g. millet spray, almond slivers")} />
            </Field>
            <Field label={t("birdSetup.howOften", "How often?")} htmlFor="food-treats-freq">
              <Dropdown
                id="food-treats-freq"
                value={treatsFreq}
                onChange={setTreatsFreq}
                placeholder={t("birdSetup.pickAFrequency", "Pick a frequency…")}
                options={TREAT_FREQ.map((o) => ({ value: o.value, label: displayLabel(t, o.label) }))}
              />
            </Field>
          </SectionCard>

          <SectionCard title={t("birdSetup.water", "Water")}>
            <Field label={t("birdSetup.howOftenWaterChanged", "How often is it changed?")} htmlFor="food-water-freq">
              <Dropdown
                id="food-water-freq"
                value={waterFreq}
                onChange={setWaterFreq}
                placeholder={t("birdSetup.pickAFrequency", "Pick a frequency…")}
                options={WATER_FREQ.map((o) => ({ value: o.value, label: displayLabel(t, o.label) }))}
              />
            </Field>
            <Field label={t("birdSetup.notesLabel", "Notes")} optional htmlFor="food-water-notes">
              <TextBox id="food-water-notes" value={waterNotes} onChange={setWaterNotes} placeholder={t("birdSetup.waterNotesPlaceholder", "Filter, bottle vs bowl, etc.")} />
            </Field>
          </SectionCard>

          <SectionCard title={t("birdSetup.freshnessHygiene", "Freshness & hygiene")} helper={t("birdSetup.generalDefaultsAdjustToFit", "General defaults — adjust to fit your bird and routine.")}>
            <Field label={t("birdSetup.removeFreshOrWetFood", "Remove fresh or wet food after")}>
              <Segmented
                label={t("birdSetup.removeFreshOrWetFood", "Remove fresh or wet food after")}
                value={String(removalMinutes)}
                onChange={(v) => setRemovalMinutes(Number(v))}
                options={REMOVAL_OPTIONS.map((o) => ({ value: String(o.value), label: displayLabel(t, o.label) }))}
              />
              <Helper>{t("birdSetup.freshFoodSpoilsFastAnd", "Fresh food spoils fast and can grow bacteria. This tells your sitter when to take it out.")}</Helper>
            </Field>
            <Field label={t("birdSetup.washFoodBowls", "Wash food bowls")} htmlFor="food-bowl-wash">
              <Dropdown
                id="food-bowl-wash"
                value={foodBowlWash}
                onChange={setFoodBowlWash}
                options={FOOD_BOWL_WASH_OPTIONS.map((o) => ({ value: o.value, label: displayLabel(t, o.label) }))}
              />
            </Field>
            <Field label={t("birdSetup.washWaterBowlOrBottle", "Wash water bowl or bottle")}>
              <Segmented
                label={t("birdSetup.washWaterBowlOrBottle", "Wash water bowl or bottle")}
                value={waterBowlWash}
                onChange={setWaterBowlWash}
                options={WATER_BOWL_WASH_OPTIONS.map((o) => ({ value: o.value, label: displayLabel(t, o.label) }))}
              />
              <Helper>{t("birdSetup.thisIsWashingTheBowl", "This is washing the bowl itself — separate from how often you change the water.")}</Helper>
            </Field>
            <Field label={t("birdSetup.otherFoodHygieneNotes", "Other food hygiene notes")} optional htmlFor="food-hygiene-notes">
              <TextBox id="food-hygiene-notes" value={hygieneNotes} onChange={setHygieneNotes} placeholder={t("birdSetup.hygieneNotesPlaceholder", "Anything else the sitter should know about food/water hygiene.")} />
            </Field>
          </SectionCard>

          <SectionCard title={t("birdSetup.whereFoodIsStored", "Where food is stored")}>
            <TextField value={storage} onChange={setStorage} ariaLabel={t("birdSetup.whereFoodIsStored", "Where food is stored")} placeholder={t("birdSetup.eGPantryTopShelf", "e.g. Pantry, top shelf; fridge bin")} />
          </SectionCard>
        </>
      )}

      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}.area{min-height:60px;line-height:1.4}`}</style>
    </div>
  );

  function addNever() {
    const v = newNever.trim();
    if (v && !never.includes(v)) setNever([...never, v]);
    setNewNever("");
    setAddingNever(false);
  }
}

function Card({ title, hint, badge, children }: { title: string; hint?: string; badge?: React.ReactNode; children: React.ReactNode }) {
  // Inside the setup shell: the new section-card fill on the white body.
  const inFrame = useContext(InSetupFrame);
  return (
    <section className={`rounded-2xl p-4 ${inFrame ? "bg-[#f1f5f0]" : "bg-[#efe9da]"}`}>
      <h2 className="flex items-center gap-2 text-sm font-medium">
        {title}
        {badge}
      </h2>
      {hint && <p className="mt-1 text-xs text-sage-600">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
        (on
          ? "border-sage-600 bg-sage-600 text-white"
          : "border-sage-200 bg-white text-sage-700 hover:bg-sage-50")
      }
    >
      {on ? "✓ " : "+ "}{children}
    </button>
  );
}

function capitalize(s: string | null | undefined) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Personality & handling ----------

const STEP_UP_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "sometimes", label: "Sometimes" },
  { value: "no", label: "No — cage-only is fine" },
];

export function PersonalityStep({ birdId, birdName, registerFlush }: { birdId: string; birdName: string; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-personality", birdId],
    gcTime: 0, // drop cache on unmount so Back refetches saved values (see BasicsStep)
    queryFn: async () => {
      const { data, error } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [stepUp, setStepUp] = useState("");
  const [stepUpNotes, setStepUpNotes] = useState("");
  const [handlers, setHandlers] = useState("");
  const [likes, setLikes] = useState("");
  const [fears, setFears] = useState("");
  const [bite, setBite] = useState("");
  // The bird's own space (moved here from the Home step: it's per bird).
  const [cageLoc, setCageLoc] = useState("");
  const [oocMode, setOocMode] = useState("");
  const [oocNotes, setOocNotes] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!plan || hydrated) return;
    setStepUp(plan.step_up ?? "");
    setStepUpNotes(plan.step_up_notes ?? "");
    setHandlers(plan.handlers ?? "");
    setLikes(plan.likes ?? "");
    setFears(plan.fears_triggers ?? plan.known_triggers ?? "");
    setBite(plan.bite_risk ?? "");
    setCageLoc(plan.cage_location ?? "");
    setOocMode(plan.out_of_cage_mode ?? "");
    // Seed notes only from the structured notes field — never from the assembled
    // out_of_cage_rules summary, which would fold the summary back in on re-save
    // and produce "Supervised only — Supervised only".
    setOocNotes(plan.out_of_cage_notes ?? "");
    setHydrated(true);
  }, [plan, hydrated]);

  useDebouncedAutosave(
    async () => {
      if (!plan) return;
      await supabase
        .from("care_plans")
        .update({
          step_up: stepUp || null,
          step_up_notes: stepUpNotes || null,
          handlers: handlers || null,
          likes: likes || null,
          fears_triggers: fears || null,
          bite_risk: bite || null,
          known_triggers: fears || null,
          // handling_rules is no longer stored — the sitter view derives the
          // handling summary from the structured fields above.
          cage_location: cageLoc || null,
          out_of_cage_mode: oocMode || null,
          out_of_cage_notes: oocNotes || null,
        } as any)
        .eq("id", plan.id);
      qc.invalidateQueries({ queryKey: ["plan", birdId] });
    },
    [stepUp, stepUpNotes, handlers, likes, fears, bite, cageLoc, oocMode, oocNotes],
    !!plan && hydrated,
    registerFlush,
  );

  if (isLoading || !plan) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  const stepUpOptions = STEP_UP_OPTIONS.map((o) => ({ value: o.value, label: displayLabel(t, o.label) }));
  const oocOptions = OUT_OF_CAGE_OPTIONS.map((o) => ({ value: o.value, label: displayLabel(t, o.label) }));

  return (
    <div className="flex flex-col gap-[14px]">
      <StepInstruction>{t("birdSetup.instr.personalityOptional", "Give whoever's helping a feel for {{name}}'s personality and little habits. Everything here is optional.", { name: birdName })}</StepInstruction>

      <SectionCard emphasis title={t("birdSetup.behavior.handling", "Handling")}>
        <Field label={t("birdSetup.behavior.doesStepUp", "Does {{name}} step up?", { name: birdName })} htmlFor="behavior-step-up">
          <Dropdown id="behavior-step-up" value={stepUp} onChange={setStepUp} options={stepUpOptions} placeholder={t("birdSetup.pickOne", "Pick one…")} />
          <TextBox
            ariaLabel={t("birdSetup.behavior.stepUpNotes", "Step-up notes")}
            value={stepUpNotes}
            onChange={(v) => setStepUpNotes(v.slice(0, 400))}
            placeholder={t("birdSetup.notesOnlyFromCertainPerches", "Notes (only from certain perches? prefers a hand vs. perch?)")}
          />
        </Field>
        <Field label={t("birdSetup.whoCanHandleAndHow", "Who can handle, and how")} htmlFor="behavior-handlers">
          <TextBox
            id="behavior-handlers"
            value={handlers}
            onChange={(v) => setHandlers(v.slice(0, 500))}
            placeholder={t("birdSetup.eGOnlyMeAnd", "e.g. Only me and my partner. Sitter: don't try to handle — talk only.")}
          />
        </Field>
        <Field label={t("birdSetup.biteRiskWarningSigns", "Bite risk & warning signs")} htmlFor="behavior-bite">
          <TextBox
            id="behavior-bite"
            value={bite}
            onChange={(v) => setBite(v.slice(0, 500))}
            placeholder={t("birdSetup.behavior.bitePlaceholder", "e.g. Low risk, but pinned eyes and a fanned tail mean back off")}
          />
        </Field>
      </SectionCard>

      <SectionCard title={t("birdSetup.behavior.likesAndFears", "Likes and fears")}>
        <Field label={t("birdSetup.likes", "Likes")} htmlFor="behavior-likes">
          <TextField
            id="behavior-likes"
            value={likes}
            maxLength={300}
            onChange={setLikes}
            placeholder={t("birdSetup.behavior.likesPlaceholder", "e.g. Head scratches, millet, shoulder rides")}
          />
        </Field>
        <Field label={t("birdSetup.fearsTriggers", "Fears & triggers")} htmlFor="behavior-fears">
          <TextField
            id="behavior-fears"
            value={fears}
            maxLength={500}
            onChange={setFears}
            placeholder={t("birdSetup.behavior.fearsPlaceholder", "e.g. Panics at the vacuum, hates hats")}
          />
        </Field>
      </SectionCard>

      <SectionCard title={t("birdSetup.behavior.birdsSpace", "{{name}}'s space", { name: birdName })}>
        <Field label={t("birdSetup.cageLocationSetupNotes", "Cage location & setup notes")} htmlFor="behavior-cage">
          <TextBox
            id="behavior-cage"
            value={cageLoc}
            onChange={(v) => setCageLoc(v.slice(0, 500))}
            placeholder={t("birdSetup.behavior.cagePlaceholder", "e.g. Living room, away from the kitchen.")}
          />
        </Field>
        <Field label={t("birdSetup.outOfCageRules", "Out-of-cage rules")} htmlFor="behavior-ooc">
          <Dropdown id="behavior-ooc" value={oocMode} onChange={setOocMode} options={oocOptions} placeholder={t("birdSetup.pickOne", "Pick one…")} />
          <TextBox
            ariaLabel={t("birdSetup.behavior.oocNotes", "Out-of-cage notes")}
            value={oocNotes}
            onChange={(v) => setOocNotes(v.slice(0, 500))}
            placeholder={t("birdSetup.notesWhichRoomHowLong", "Notes (which room? how long? what to watch for?)")}
          />
        </Field>
      </SectionCard>
    </div>
  );
}

// ---------- Environment & safety ----------

const OUT_OF_CAGE_OPTIONS = [
  { value: "supervised", label: "Supervised only" },
  { value: "specific_room", label: "Specific room only" },
  { value: "not_while_sitting", label: "Keep in cage" },
];

const HAZARD_OPTIONS = [
  "Other pets",
  "Ceiling fans",
  "Open windows",
  "Young children",
  "Houseplants",
  "Kitchen & nonstick cookware",
  "Candles or diffusers",
];

export function EnvironmentStep({ birdId, birdName, registerFlush }: { birdId: string; birdName: string; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  // "Reminders for your sitter": the owner's shared "Your home" answers
  // (owner_home_defaults), used by every bird that has none of its own. The
  // owner can make them different for this bird, which saves to the bird's
  // care plan instead. Household members editing a plan can't change the
  // owner's shared answers, so they always edit this bird's own.
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["plan-environment", birdId],
    gcTime: 0, // drop cache on unmount so Back refetches saved values (see BasicsStep)
    queryFn: async () => {
      const [{ data: plan, error }, { data: u }, { data: bird }] = await Promise.all([
        supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle(),
        getLocalUser(),
        supabase.from("birds").select("owner_id").eq("id", birdId).maybeSingle(),
      ]);
      if (error) throw error;
      const userId = u.user?.id ?? null;
      const isOwner = !!userId && (bird as any)?.owner_id === userId;
      if (!isOwner) return { plan: plan as any, isOwner, userId, home: null as HomeRow | null, otherPlans: [] as any[] };
      const [{ data: home }, { data: owned }] = await Promise.all([
        supabase.from("owner_home_defaults").select("*").eq("owner_id", userId).maybeSingle(),
        supabase.from("birds").select("id").eq("owner_id", userId),
      ]);
      const otherIds = ((owned ?? []) as { id: string }[]).map((b) => b.id).filter((id) => id !== birdId);
      const { data: otherPlans } = otherIds.length
        ? await supabase.from("care_plans").select("id, bird_id, hazards, hazards_other, off_limits, off_limits_rooms, other_pets, cleaning_instructions").in("bird_id", otherIds)
        : { data: [] as any[] };
      return { plan: plan as any, isOwner, userId, home: (home ?? null) as HomeRow | null, otherPlans: (otherPlans ?? []) as any[] };
    },
  });
  const plan = data?.plan;

  const [mode, setMode] = useState<"shared" | "bird">("shared");
  const [hazards, setHazards] = useState<string[]>([]);
  const [hazardsOther, setHazardsOther] = useState("");
  const [offLimits, setOffLimits] = useState("");
  const [otherPets, setOtherPets] = useState("");
  // Cleaning products, edited as two parts and saved as one field (see parseCleaning).
  const [cleanNever, setCleanNever] = useState<string[]>([]);
  const [cleanInstead, setCleanInstead] = useState("");
  const [addingClean, setAddingClean] = useState(false);
  const [newClean, setNewClean] = useState("");
  const setHomeSubline = useContext(SetupHomeSublineContext);
  const [hydrated, setHydrated] = useState(false);
  // The shared answers as last saved — what "different" is measured against.
  const sharedRef = useRef<HomeRow | null>(null);
  // Whether a shared row existed when this screen opened: the first save
  // brings the owner's other birds along (see followSharedPatch).
  const firstSaveRef = useRef(false);
  const birdClearedRef = useRef(false);

  function fill(row: any) {
    setHazards(Array.isArray(row?.hazards) ? row.hazards : []);
    setHazardsOther(row?.hazards_other ?? "");
    setOffLimits(row?.off_limits ?? row?.off_limits_rooms ?? "");
    setOtherPets(row?.other_pets ?? "");
    const parts = parseCleaning(row?.cleaning_instructions);
    // An empty field starts with the common products to keep away from birds.
    setCleanNever(!parts.never.length && !parts.instead ? [...CLEANING_NEVER_DEFAULTS] : parts.never);
    setCleanInstead(parts.instead);
  }

  useEffect(() => {
    if (!data?.plan || hydrated) return;
    const { plan: p, isOwner, home, otherPlans } = data;
    sharedRef.current = home;
    firstSaveRef.current = isOwner && !home;
    const m = !isOwner || (home && homeDifferences(p, home).length > 0) ? "bird" : "shared";
    setMode(m);
    // Bird mode shows the full picture: its own answers, shared ones elsewhere.
    fill(m === "bird" ? mergeHome(p, home) : home ?? seedShared(p, otherPlans));
    setHydrated(true);
  }, [data, hydrated]);

  useDebouncedAutosave(
    async () => {
      if (!data?.plan) return;
      const row: HomeRow = {
        hazards,
        hazards_other: hazardsOther || null,
        off_limits: offLimits || null,
        other_pets: otherPets || null,
        cleaning_instructions: formatCleaning(
          { never: cleanNever, instead: cleanInstead },
          { never: t("birdSetup.reminders.neverUseLabel", "Never use near the birds:"), instead: t("birdSetup.reminders.useInsteadLabel", "Use instead:") },
        ),
      };
      if (mode === "shared" && data.isOwner && data.userId) {
        const { error } = await supabase.from("owner_home_defaults").upsert({ owner_id: data.userId, ...row } as any, { onConflict: "owner_id" });
        if (error) throw error;
        sharedRef.current = row;
        // This bird follows the shared answers from now on.
        if (!birdClearedRef.current && HOME_GROUPS.some((g) => birdHasOwn(data.plan, g))) {
          const { error: clearErr } = await supabase.from("care_plans").update(clearOwnPatch() as any).eq("id", data.plan.id);
          if (clearErr) throw clearErr;
        }
        birdClearedRef.current = true;
        // First save: every other bird whose answers match (or are empty)
        // follows the shared answers; birds with different answers keep theirs.
        if (firstSaveRef.current) {
          firstSaveRef.current = false;
          for (const other of data.otherPlans) {
            const patch = followSharedPatch(other, row);
            if (patch) await supabase.from("care_plans").update(patch as any).eq("id", other.id);
          }
        }
        qc.invalidateQueries({ queryKey: ["owner-home-defaults"] });
      } else {
        // This bird's own answers. Groups that match the shared answers are
        // cleared so they keep following them; only real differences are kept.
        const shared = data.isOwner ? sharedRef.current : null;
        const patch: Record<string, unknown> = {};
        const own = { ...row, off_limits_rooms: row.off_limits };
        for (const g of HOME_GROUPS) {
          const follow = !!shared && sameGroup(own, shared, g);
          for (const col of HOME_GROUP_COLUMNS[g]) {
            patch[col] = follow ? (col === "hazards" ? [] : null) : (own as any)[col];
          }
        }
        await supabase.from("care_plans").update(patch as any).eq("id", data.plan.id);
      }
      qc.invalidateQueries({ queryKey: ["plan", birdId] });
    },
    [mode, hazards, hazardsOther, offLimits, otherPets, cleanNever, cleanInstead],
    !!plan && hydrated,
    registerFlush,
  );

  // The header line under "Your home": shared, or different for this bird.
  useEffect(() => {
    setHomeSubline(hydrated && mode === "bird" ? t("birdSetup.reminders.differentTitle", "Different for {{name}}", { name: birdName }) : null);
    return () => setHomeSubline(null);
  }, [hydrated, mode, birdName, setHomeSubline, t]);

  if (isLoading || !plan) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  function addClean() {
    const v = newClean.trim();
    if (v && !cleanNever.some((x) => x.toLowerCase() === v.toLowerCase())) setCleanNever([...cleanNever, v.replace(/,/g, " ")]);
    setNewClean("");
    setAddingClean(false);
  }

  function toggleHazard(v: string) {
    setHazards(hazards.includes(v) ? hazards.filter((x) => x !== v) : [...hazards, v]);
  }

  async function switchToShared() {
    if (!window.confirm(t("birdSetup.reminders.useSharedConfirm", "Use your shared reminders for {{name}}? The answers that are different for {{name}} will be removed.", { name: birdName }))) return;
    const { error } = await supabase.from("care_plans").update(clearOwnPatch() as any).eq("id", plan.id);
    if (error) { toast.error(friendlyError(error)); return; }
    birdClearedRef.current = true;
    fill(sharedRef.current ?? {});
    setMode("shared");
    qc.invalidateQueries({ queryKey: ["plan", birdId] });
  }

  const showPets = hazards.includes("Other pets") || !!otherPets.trim();

  return (
    <div className="flex flex-col gap-[14px]">
      <StepInstruction>{t("birdSetup.instr.remindersHome", "Things you know without thinking that a sitter might not. Include any hazard a bird could run into in your home.")}</StepInstruction>

      {data?.isOwner && (
        <div className="flex flex-col gap-1 rounded-[20px] bg-white p-4 text-[#1a3d2e]">
          {mode === "shared" ? (
            <>
              <p className="m-0 text-[15px] font-[700]">{t("birdSetup.reminders.sharedTitle", "Shared by all your birds")}</p>
              <p className="m-0 text-[14px] text-[#3d4f45]">{t("birdSetup.reminders.sharedBody", "Changes here apply to every bird that uses the shared reminders.")}</p>
              <div><SetupTextButton onClick={() => setMode("bird")}>{t("birdSetup.reminders.makeDifferent", "Make these different for {{name}}", { name: birdName })}</SetupTextButton></div>
            </>
          ) : (
            <>
              <p className="m-0 text-[15px] font-[700]">{t("birdSetup.reminders.differentTitle", "Different for {{name}}", { name: birdName })}</p>
              <p className="m-0 text-[14px] text-[#3d4f45]">{t("birdSetup.reminders.differentBody", "Changes here apply to {{name}} only.", { name: birdName })}</p>
              {sharedRef.current && (
                <div><SetupTextButton onClick={switchToShared}>{t("birdSetup.reminders.useShared", "Use the shared reminders instead")}</SetupTextButton></div>
              )}
            </>
          )}
        </div>
      )}

      <TileCard icon={<AlertTriangle className="size-5" />} title={t("birdSetup.homeSpecificHazards", "Home-specific hazards")} helper={t("birdSetup.tapAnyThatApplyThen", "Tap any that apply, then add your own.")}>
        <CheckChips
          label={t("birdSetup.homeSpecificHazards", "Home-specific hazards")}
          options={HAZARD_OPTIONS.map((h) => ({ value: h, label: displayLabel(t, h) }))}
          value={hazards}
          onChange={setHazards}
        />
        {showPets && (
          <div className="rounded-[16px] p-3.5" style={{ background: S.lime }}>
            <Field label={t("birdSetup.otherPetsSeparationRules", "Other pets & separation rules")} htmlFor="home-other-pets">
              <TextField
                id="home-other-pets"
                value={otherPets}
                maxLength={500}
                onChange={setOtherPets}
                placeholder={t("birdSetup.reminders.petsPlaceholder", "e.g. A cat — keep her out of the bird room")}
              />
            </Field>
          </div>
        )}
        <TextField
          value={hazardsOther}
          maxLength={300}
          onChange={setHazardsOther}
          ariaLabel={t("birdSetup.otherHazards", "Other hazards")}
          placeholder={t("birdSetup.otherHazards", "Other hazards")}
        />
      </TileCard>

      <TileCard tile="teal" icon={<DoorClosed className="size-5" />} title={t("birdSetup.anythingOffLimits", "Anything off-limits")}>
        <TextField
          value={offLimits}
          maxLength={400}
          onChange={setOffLimits}
          ariaLabel={t("birdSetup.anythingOffLimits", "Anything off-limits")}
          placeholder={t("birdSetup.reminders.offLimitsPlaceholder", "e.g. Kitchen and bathroom; bedroom door stays closed")}
        />
      </TileCard>

      <TileCard icon={<SprayCan className="size-5" />} title={t("birdSetup.cleaningProductsInstructions", "Cleaning products & instructions")}>
        <Field label={t("birdSetup.reminders.neverUse", "Never use near the birds")}>
          <EditableList tone="warn" items={cleanNever} onRemove={(i) => setCleanNever(cleanNever.filter((_, j) => j !== i))} />
          {addingClean ? (
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <TextField
                  value={newClean}
                  maxLength={80}
                  onChange={setNewClean}
                  ariaLabel={t("birdSetup.reminders.neverUse", "Never use near the birds")}
                />
              </div>
              <SetupTextButton onClick={addClean} disabled={!newClean.trim()}>{t("birdSetup.addButton", "Add")}</SetupTextButton>
            </div>
          ) : (
            <div>
              <SetupTextButton onClick={() => setAddingClean(true)} icon={<Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />}>
                {t("birdSetup.reminders.addAnother", "Add another")}
              </SetupTextButton>
            </div>
          )}
        </Field>
        <Field label={t("birdSetup.reminders.useInstead", "What to use instead, and where it is")} htmlFor="home-clean-instead">
          <TextField
            id="home-clean-instead"
            value={cleanInstead}
            maxLength={400}
            onChange={setCleanInstead}
            placeholder={t("birdSetup.reminders.useInsteadPlaceholder", "e.g. Vinegar spray, under the sink")}
          />
        </Field>
      </TileCard>
    </div>
  );
}

// ---------- Health baseline ----------

// Granular "what's normal" + when-to-call care-plan text fields. Shown under the
// summary so a sitter can spot specifics; all optional.
const HEALTH_DETAIL_FIELDS: [string, string, string][] = [
  ["normal_appetite", "Normal appetite", "e.g. Eats most of the chop by midday; pellets all day."],
  ["normal_droppings", "Normal droppings", "e.g. Formed, dark with white urates; greener after veggies."],
  ["normal_noise", "Normal noise level", "e.g. Loud at sunrise/sunset; quiet midday."],
  ["normal_activity", "Normal activity", "e.g. Active and climbing in the morning; naps mid-afternoon."],
  ["normal_sleep", "Sleep / nap habits", "e.g. Covered by 8pm, sleeps ~12 hrs; short afternoon nap."],
  ["normal_behavior_with_strangers", "Behavior with strangers", "e.g. Shy at first; warms up after an hour."],
];
const HEALTH_CALL_FIELDS: [string, string, string][] = [
  ["when_to_call_owner", "When to call the owner", "e.g. Any change in droppings, eating less, or seems off."],
  ["when_to_call_vet", "When to call the vet", "e.g. Trouble breathing, bleeding, fall, or fluffed all day."],
];

export function HealthBaselineStep({ birdId, birdName, onBlockNext, registerFlush }: { birdId: string; birdName: string; onBlockNext: (block: boolean) => void; registerFlush?: (fn: (() => Promise<void>) | null) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: bird } = useQuery({
    queryKey: ["bird-health", birdId],
    gcTime: 0, // drop cache on unmount so Back refetches saved values (see BasicsStep)
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, owner_id, normal_weight, normal_weight_min, normal_weight_max, notes, medical_conditions, medications")
        .eq("id", birdId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-health", birdId],
    gcTime: 0, // drop cache on unmount so Back refetches saved values (see BasicsStep)
    queryFn: async () => {
      const { data, error } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [weight, setWeight] = useState("");
  const [weightMin, setWeightMin] = useState("");
  const [weightMax, setWeightMax] = useState("");
  const [conditions, setConditions] = useState("");
  // Medications: a repeatable list of { name (incl. dose), times, notes }.
  // Timing is STRUCTURED (day-part chips) — never inferred from text — because
  // each selected day-part becomes its own sitter-checklist check-off and a
  // missed inference would mean a missed dose. Stored in
  // care_plans.medications_details (jsonb); the legacy text columns
  // (birds.medications, care_plans.medication_schedule) are kept in sync as
  // joined summaries so every read surface keeps working unchanged.
  const [medRows, setMedRows] = useState<MedRow[]>([]);
  // The medication open in the sheet, and which "more detail" row is being typed in.
  const [medSheet, setMedSheet] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingDetail, setEditingDetail] = useState<string | null>(null);
  const [clipUploading, setClipUploading] = useState(false);
  const setFooterNote = useContext(SetupFooterNoteContext);
  const [whatsNormal, setWhatsNormal] = useState("");
  const [notes, setNotes] = useState("");
  // Granular "what's normal" + when-to-call fields, keyed by care_plans column.
  const [detail, setDetail] = useState<Record<string, string>>({});
  const [clipPath, setClipPath] = useState<string | null>(null);
  const clipPreview = useOwnerClipPreview(clipPath);
  const [hydrated, setHydrated] = useState(false);
  // When a clip already exists, the recorder stays collapsed behind a "Replace"
  // button so the saved clip doesn't look like an unfinished upload prompt.
  const [replacingClip, setReplacingClip] = useState(false);
  // True while the recorder is framing/recording/compressing (before upload).
  const [clipBusy, setClipBusy] = useState(false);

  const [initialWeight, setInitialWeight] = useState<string>("");

  // Don't let the owner advance mid-upload (prevents re-trigger / partial saves).
  useEffect(() => { onBlockNext(clipBusy); }, [clipBusy, onBlockNext]);
  useEffect(() => {
    setFooterNote(clipUploading ? t("birdSetup.health.clipStillUploading", "Your clip is still uploading.") : null);
    return () => setFooterNote(null);
  }, [clipUploading, setFooterNote, t]);

  useEffect(() => {
    if (!plan || !bird || hydrated) return;
    const w = bird.normal_weight != null ? String(bird.normal_weight) : "";
    setWeight(w);
    setInitialWeight(w);
    setWeightMin(bird.normal_weight_min != null ? String(bird.normal_weight_min) : "");
    setWeightMax(bird.normal_weight_max != null ? String(bird.normal_weight_max) : "");
    setConditions(bird.medical_conditions ?? "");
    // Prefer the structured list; fall back to the legacy single-med fields
    // (lossless upgrade for birds saved before the list existed). Rows saved
    // before day-part chips existed carry free-text `schedule` — run it through
    // the old inference ONCE as a visible pre-selection the owner confirms,
    // and keep the text as the instructions note so nothing is lost.
    const structured = Array.isArray(plan.medications_details)
      ? (plan.medications_details as any[]).filter((m) => m && typeof m.name === "string")
      : [];
    if (structured.length) {
      setMedRows(structured.map((m) => hydrateMedRow(m)));
    } else if ((bird.medications ?? "").trim()) {
      setMedRows([hydrateMedRow({ name: bird.medications ?? "", schedule: plan.medication_schedule ?? "" })]);
    }
    setWhatsNormal(plan.whats_normal ?? "");
    setNotes(bird.notes ?? "");
    setDetail(Object.fromEntries(
      [...HEALTH_DETAIL_FIELDS, ...HEALTH_CALL_FIELDS].map(([k]) => [k, plan[k] ?? ""]),
    ));
    setClipPath(plan.baseline_clip_path ?? null);
    setHydrated(true);
  }, [plan, bird, hydrated]);

  // Debounced persist of text/numeric fields. Also feeds the weight log on change.
  useDebouncedAutosave(
    async () => {
      if (!plan || !bird) return;
      const newWeight = weight.trim() ? Number(weight) : null;
      const num = (v: string) => (v.trim() ? Number(v) : null);
      // Clean med rows (drop empties) + legacy joined summaries for the read
      // surfaces that still render the old text columns.
      const cleanMeds = medRows
        .map((m) => ({
          name: m.name.trim(),
          times: MED_TIMES.filter((item) => m.times.includes(item.key)).map((item) => item.key),
          notes: m.notes.trim(),
        }))
        .filter((m) => m.name);
      const medsSummary = cleanMeds.map((m) => m.name).join("; ") || null;
      const medLine = (m: { times: string[]; notes: string }) =>
        [m.times.map((item) => MED_TIMES.find((x) => x.key === item)?.label.toLowerCase()).join(" & "), m.notes]
          .filter(Boolean)
          .join(" — ");
      const schedSummary = cleanMeds.length === 0
        ? null
        : cleanMeds.length === 1
          ? medLine(cleanMeds[0]) || null
          : cleanMeds.map((m) => `${m.name}: ${medLine(m) || "no time set"}`).join(" · ");
      await supabase
        .from("birds")
        .update({
          normal_weight: newWeight,
          normal_weight_min: num(weightMin),
          normal_weight_max: num(weightMax),
          notes: notes || null,
          medical_conditions: conditions || null,
          medications: medsSummary,
        } as any)
        .eq("id", birdId);

      await supabase
        .from("care_plans")
        .update({
          medication_schedule: schedSummary,
          whats_normal: whatsNormal || null,
          baseline_clip_path: clipPath,
          ...Object.fromEntries(
            [...HEALTH_DETAIL_FIELDS, ...HEALTH_CALL_FIELDS].map(([k]) => [k, (detail[k] ?? "").trim() || null]),
          ),
        } as any)
        .eq("id", plan.id);

      // Structured list saved separately and best-effort: if the additive
      // medications_details migration isn't applied yet, this single update
      // fails without taking the rest of the health autosave down with it.
      await supabase
        .from("care_plans")
        .update({ medications_details: cleanMeds } as any)
        .eq("id", plan.id);

      // Feed a weight entry when the normal weight changes. weight_entries is
      // the single source of truth (was legacy weight_logs — the last stray
      // writer pointed there).
      if (newWeight != null && weight !== initialWeight) {
        await supabase
          .from("weight_entries")
          .insert({ bird_id: birdId, grams: newWeight, source: "owner", note: "Baseline weight" } as any);
        setInitialWeight(weight);
      }

      // Auto-create / sync one medication routine task per med.
      await syncMedicationTasks(plan.id, cleanMeds);

      qc.invalidateQueries({ queryKey: ["plan", birdId] });
      qc.invalidateQueries({ queryKey: ["tasks", plan.id] });
    },
    [weight, weightMin, weightMax, conditions, medRows, whatsNormal, notes, detail, clipPath],
    !!plan && !!bird && hydrated,
    registerFlush,
    600,
  );

  // The ClipRecorder uploads to Cloudflare Stream and hands back a
  // "cfstream:<uid>" reference.
  //
  // Saved HERE through commitClipRef rather than left to the 600ms autosave,
  // because replacing now retires the old clip's Cloudflare asset, and that must
  // happen only after the new ref is committed. commitClipRef saves, then
  // retires; the server additionally refuses to delete a uid the care plan still
  // references. (Autosave also writes baseline_clip_path from state — the same
  // value, so harmless.)
  async function uploadClip(ref: string) {
    if (plan?.id) {
      try {
        await commitClipRef({ planId: plan.id, column: "baseline_clip_path", newRef: ref, oldRef: clipPath });
      } catch {
        toast.error(t("birdSetup.couldnTSaveTheClip", "Couldn't save the clip. Please try again."));
        return;
      }
    }
    setClipPath(ref);
    setReplacingClip(false);
    toast.success(t("birdSetup.baselineClipSaved", "Baseline clip saved."));
  }

  // Remove = commit null, then retire the old clip. Same path and ordering as
  // replace: the column is cleared FIRST (proven by commitClipRef), and only then
  // is the old asset deleted. This used to delete a legacy object before
  // clearing the column, and never touched Cloudflare at all.
  async function removeClip() {
    if (plan?.id) {
      try {
        await commitClipRef({ planId: plan.id, column: "baseline_clip_path", newRef: null, oldRef: clipPath });
      } catch {
        toast.error(t("birdSetup.couldnTRemoveTheClip", "Couldn't remove the clip. Please try again."));
        return;
      }
    }
    setClipPath(null);
  }

  if (isLoading || !plan || !bird) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  const detailCount = HEALTH_DETAIL_FIELDS.filter(([k]) => (detail[k] ?? "").trim()).length;
  const setDetailField = (k: string, v: string) => setDetail((d) => ({ ...d, [k]: v.slice(0, 500) }));
  const medTimeLabel = (key: MedTime) => displayLabel(t, MED_TIMES.find((x) => x.key === key)!.label);
  const medSummary = (m: MedRow) => {
    const when = m.times.length
      ? MED_TIMES.filter((x) => m.times.includes(x.key)).map((x) => medTimeLabel(x.key)).join(", ")
      : t("birdSetup.health.anytimeNoTime", "Anytime · no time set");
    return m.times.length && m.notes.trim() ? `${when} · ${m.notes.trim()}` : when;
  };
  const openNewMed = () => { setMedRows((rows) => [...rows, { name: "", times: [], notes: "" }]); setMedSheet(medRows.length); };
  // Closing the sheet drops a medication that was opened but left blank.
  const closeMedSheet = () => {
    setMedRows((rows) => rows.filter((m, i) => i !== medSheet || m.name.trim() || m.times.length || m.notes.trim()));
    setMedSheet(null);
  };
  const updateMed = (i: number, patch: Partial<MedRow>) => setMedRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const sheetMed = medSheet != null ? medRows[medSheet] : undefined;
  const detailLabel = (k: string) => {
    switch (k) {
      case "normal_appetite": return t("birdSetup.health.appetite", "Appetite");
      case "normal_droppings": return t("birdSetup.health.droppings", "Droppings");
      case "normal_noise": return t("birdSetup.health.noiseLevel", "Noise level");
      case "normal_activity": return t("birdSetup.health.activity", "Activity");
      case "normal_sleep": return t("birdSetup.health.sleepAndNaps", "Sleep and naps");
      default: return t("birdSetup.health.withStrangers", "With strangers");
    }
  };
  const detailPlaceholder = (k: string, ph: string) =>
    k === "normal_sleep" ? t("birdSetup.health.sleepPlaceholder", "e.g. Lights out by 8pm, sleeps about 12 hours; short afternoon nap.") : displayLabel(t, ph);

  return (
    <div className="flex flex-col gap-[14px]">
      <StepInstruction>{t("birdSetup.instr.healthOptional", "Help anyone caring for {{name}} know what's normal, so they can spot what isn't. Everything here is optional.", { name: birdName })}</StepInstruction>

      <SectionCard
        title={t("birdSetup.health.weight", "Weight")}
        helper={t("birdSetup.health.weightHelper", "A healthy range helps you and your sitter notice a change early. Saving a new normal weight also adds it to {{name}}'s weight log.", { name: birdName })}
      >
        <Field label={t("birdSetup.health.normalWeight", "Normal weight")} htmlFor="health-weight">
          <GramsField id="health-weight" value={weight} onChange={setWeight} placeholder={t("birdSetup.health.weightPlaceholder", "e.g. 1,080")} />
        </Field>
        <Field label={t("birdSetup.health.healthyRange", "Healthy range")} htmlFor="health-weight-min">
          <div className="flex items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <GramsField id="health-weight-min" value={weightMin} onChange={setWeightMin} placeholder={t("birdSetup.health.low", "Low")} />
            </div>
            <span className="text-[15px]" style={{ color: S.helper }}>{t("birdSetup.health.to", "to")}</span>
            <div className="min-w-0 flex-1">
              <GramsField value={weightMax} onChange={setWeightMax} placeholder={t("birdSetup.health.high", "High")} ariaLabel={t("birdSetup.health.healthyRangeHigh", "Healthy range, high")} />
            </div>
          </div>
        </Field>
      </SectionCard>

      <SectionCard
        title={t("birdSetup.medications", "Medications")}
        helper={medRows.length > 0 ? t("birdSetup.health.medsHelper", "Each time you pick becomes a check-off on your sitter's daily list.") : undefined}
      >
        {medRows.length === 0 ? (
          <button
            type="button"
            onClick={openNewMed}
            className="flex min-h-[62px] w-full items-center gap-3 rounded-[16px] border-2 border-dashed bg-white px-4 py-3 text-left"
            style={{ borderColor: "#b9b19a", color: S.forest }}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full" style={{ background: S.forest, color: S.lime }}>
              <Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15.5px] font-[700]">{t("birdSetup.health.addAMedication", "Add a medication")}</span>
              <span className="block text-[13.5px]" style={{ color: S.helper }}>{t("birdSetup.health.nameDoseWhen", "Name, dose, and when it's given")}</span>
            </span>
          </button>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {medRows.map((m, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setMedSheet(i)}
                  className="flex min-h-[64px] w-full items-center gap-3 rounded-[16px] bg-white px-3.5 py-3 text-left"
                  style={{ color: S.forest }}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={{ background: S.lime }}>
                    <Pill className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-[700]">{m.name.trim() || t("birdSetup.health.newMedication", "New medication")}</span>
                    <span className="mt-0.5 block truncate text-[14px]" style={{ color: S.helper }}>{medSummary(m)}</span>
                  </span>
                </button>
              ))}
            </div>
            <div>
              <SetupTextButton onClick={openNewMed} icon={<Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />}>
                {t("birdSetup.addAnotherMedication", "Add another medication")}
              </SetupTextButton>
            </div>
          </>
        )}
      </SectionCard>

      <SectionCard emphasis title={t("birdSetup.whenToCall", "When to call")} helper={t("birdSetup.health.whenToCallHelper", "The first thing a sitter checks when something seems off.")}>
        <Field label={t("birdSetup.health.whenToCallYou", "When to call you")} htmlFor="health-call-owner">
          <TextBox
            id="health-call-owner"
            value={detail.when_to_call_owner ?? ""}
            onChange={(v) => setDetailField("when_to_call_owner", v)}
            placeholder={displayLabel(t, "e.g. Any change in droppings, eating less, or seems off.")}
          />
        </Field>
        <Field label={t("birdSetup.health.whenToCallTheVet", "When to call the vet")} htmlFor="health-call-vet">
          <TextBox
            id="health-call-vet"
            value={detail.when_to_call_vet ?? ""}
            onChange={(v) => setDetailField("when_to_call_vet", v)}
            placeholder={t("birdSetup.health.vetPlaceholder", "e.g. Trouble breathing, bleeding, a fall, or fluffed up all day.")}
          />
        </Field>
      </SectionCard>

      <SectionCard
        title={t("birdSetup.health.whatsNormalFor", "What's normal for {{name}}", { name: birdName })}
        helper={t("birdSetup.health.whatsNormalHelper", "In your own words: sounds, naps, droppings, anything you'd notice if it changed.")}
      >
        <textarea
          aria-label={t("birdSetup.health.whatsNormalFor", "What's normal for {{name}}", { name: birdName })}
          className="min-h-[96px] w-full rounded-[18px] border-2 bg-white px-4 py-3 text-[16px] leading-[1.5] outline-none focus:border-[#1a3d2e]"
          style={{ borderColor: S.line, color: S.forest }}
          placeholder={t("birdSetup.health.whatsNormalPlaceholder", "e.g. Loud whistles at sunrise and sunset. Naps mid-afternoon for about 30 minutes.")}
          value={whatsNormal}
          maxLength={800}
          onChange={(e) => setWhatsNormal(e.target.value)}
        />
        {!detailOpen ? (
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            aria-expanded={false}
            className="flex min-h-[62px] w-full items-center gap-3 rounded-[16px] bg-white px-4 py-3 text-left"
            style={{ color: S.forest }}
          >
            <span className="min-w-0 flex-1">
              {detailCount > 0 ? (
                <span className="block text-[15.5px] font-[700]">{t("birdSetup.health.moreDetailCount", "More detail · {{n}} of 6", { n: detailCount })}</span>
              ) : (
                <>
                  <span className="block text-[15.5px] font-[700]">{t("birdSetup.health.addMoreDetail", "Add more detail")}</span>
                  <span className="block text-[13.5px]" style={{ color: S.helper }}>{t("birdSetup.health.moreDetailList", "Appetite, droppings, noise, activity, sleep, and strangers")}</span>
                </>
              )}
            </span>
            <ChevronDown className="size-5 shrink-0" aria-hidden="true" />
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-[700]">{t("birdSetup.health.moreDetailCount", "More detail · {{n}} of 6", { n: detailCount })}</span>
              <SetupTextButton onClick={() => { setDetailOpen(false); setEditingDetail(null); }}>{t("birdSetup.health.showLess", "Show less")}</SetupTextButton>
            </div>
            <div className="overflow-hidden rounded-[16px] bg-white">
              {HEALTH_DETAIL_FIELDS.map(([k, , ph], i) => {
                const value = detail[k] ?? "";
                const divider = i > 0 ? "border-t border-[#e3eae2]" : "";
                return editingDetail === k ? (
                  <div key={k} className={`flex flex-col gap-1.5 px-4 py-3 ${divider}`}>
                    <label htmlFor={`health-detail-${k}`} className="text-[15px] font-[700]">{detailLabel(k)}</label>
                    <textarea
                      id={`health-detail-${k}`}
                      autoFocus
                      className="min-h-[72px] w-full rounded-[14px] border-2 bg-white px-3.5 py-2.5 text-[16px] leading-[1.5] outline-none"
                      style={{ borderColor: S.forest, color: S.forest }}
                      placeholder={detailPlaceholder(k, ph)}
                      value={value}
                      maxLength={500}
                      onChange={(e) => setDetailField(k, e.target.value)}
                      onBlur={() => setEditingDetail(null)}
                    />
                  </div>
                ) : (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setEditingDetail(k)}
                    className={`flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left ${divider}`}
                    style={{ color: S.forest }}
                  >
                    <span className="min-w-0">
                      <span className="block text-[15px] font-[700]">{detailLabel(k)}</span>
                      {value.trim() && <span className="mt-0.5 block text-[14.5px]" style={{ color: S.helper }}>{value}</span>}
                    </span>
                    {!value.trim() && <span className="shrink-0 text-[15px] font-[700]" style={{ color: S.moss }}>{t("birdSetup.health.addPlus", "+ Add")}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title={t("birdSetup.knownConditions", "Known conditions")}>
        <TextBox
          ariaLabel={t("birdSetup.knownConditions", "Known conditions")}
          value={conditions}
          onChange={(v) => setConditions(v.slice(0, 500))}
          placeholder={t("birdSetup.eGMildFeatherPlucking", "e.g. Mild feather plucking; old wing injury (no flight).")}
        />
      </SectionCard>

      <SectionCard
        title={t("birdSetup.health.clipTitle", "A short clip of {{name}}", { name: birdName })}
        helper={t("birdSetup.health.clipHelper", "Normal behavior or sounds, up to 60 seconds. Only your sitter can see it.")}
      >
        {clipPreview.status === "processing" && !replacingClip ? (
          <UploadProgress label={t("clipRecorder.gettingItReady", "Getting it ready…")} />
        ) : clipPreview.url && !replacingClip ? (
          <div className="flex flex-col gap-1">
            <PosterClipPlayer src={clipPreview.url} duration={clipPreview.duration} className="h-[180px] w-full rounded-[16px]" />
            <div className="flex gap-4">
              <SetupTextButton onClick={() => setReplacingClip(true)}>{t("birdSetup.replace", "Replace")}</SetupTextButton>
              <SetupTextButton onClick={removeClip}>{t("birdSetup.remove", "Remove")}</SetupTextButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <ClipRecorder birdId={birdId} onBusy={setClipBusy} onUploading={setClipUploading} onUploaded={uploadClip} />
            {clipPath && replacingClip && (
              <div>
                <SetupTextButton onClick={() => setReplacingClip(false)}>{t("birdSetup.keepCurrentClip", "Keep current clip")}</SetupTextButton>
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t("birdSetup.otherNotes", "Other notes")}>
        <TextBox
          ariaLabel={t("birdSetup.otherNotes", "Other notes")}
          value={notes}
          onChange={(v) => setNotes(v.slice(0, 800))}
          placeholder={t("birdSetup.anythingElseASitterShould", "Anything else a sitter should know.")}
        />
      </SectionCard>

      {sheetMed && medSheet != null && (
        <BottomSheet onClose={closeMedSheet}>
          <div className="flex flex-col gap-5" style={{ color: S.forest }}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13px]" style={{ color: S.quiet }}>{t("birdSetup.health.medication", "Medication")}</p>
                <h2 className="m-0 mt-0.5 break-words text-[26px] font-[700] leading-[1.15]" style={{ fontFamily: SERIF }}>
                  {sheetMed.name.trim() || t("birdSetup.health.newMedication", "New medication")}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeMedSheet}
                aria-label={t("foodEditor.closeSheet", "Close")}
                className="grid size-11 shrink-0 place-items-center rounded-full"
                style={{ background: S.card, color: S.forest }}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <Field label={t("birdSetup.health.nameAndDose", "Name and dose")} htmlFor="med-name">
              <TextField id="med-name" value={sheetMed.name} maxLength={300} onChange={(v) => updateMed(medSheet, { name: v })} placeholder={t("birdSetup.eGMetacam01ml", "e.g. Metacam 0.1ml")} />
            </Field>
            <Field label={t("birdSetup.health.whenIsItGiven", "When is it given?")}>
              <CheckChips
                label={t("birdSetup.health.whenIsItGiven", "When is it given?")}
                options={MED_TIMES.map((x) => ({ value: x.key, label: medTimeLabel(x.key) }))}
                value={sheetMed.times}
                onChange={(next) => updateMed(medSheet, { times: MED_TIMES.filter((x) => next.includes(x.key)).map((x) => x.key) })}
              />
              <p className="m-0 mt-1 rounded-[14px] px-4 py-3 text-[14.5px] leading-[1.45]" style={{ background: S.card, color: S.helper }}>
                {sheetMed.times.length === 0
                  ? t("birdSetup.health.noTimePicked", "No time picked, so your sitter will see this under Anytime. Each time you pick becomes its own check-off.")
                  : t("birdSetup.health.eachTimeCheckOff", "Each time you pick becomes its own check-off.")}
              </p>
            </Field>
            <Field label={t("birdSetup.health.instructions", "Instructions")} optional htmlFor="med-notes">
              <TextField id="med-notes" value={sheetMed.notes} maxLength={300} onChange={(v) => updateMed(medSheet, { notes: v })} placeholder={t("birdSetup.health.instructionsPlaceholder", "e.g. With food, in the left cheek")} />
            </Field>
            <div className="flex flex-col items-center gap-1">
              <SetupPrimaryButton onClick={closeMedSheet} arrow={false}>{t("foodEditor.done", "Done")}</SetupPrimaryButton>
              <SetupTextButton onClick={() => { setMedRows((rows) => rows.filter((_, j) => j !== medSheet)); setMedSheet(null); }}>
                {t("birdSetup.health.removeMedication", "Remove this medication")}
              </SetupTextButton>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

/** A number box with "g" inside its right edge. */
function GramsField({ id, value, onChange, placeholder, ariaLabel }: { id?: string; value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel?: string }) {
  return (
    <div className="relative">
      <TextField id={id} ariaLabel={ariaLabel} inputMode="decimal" value={value} onChange={(v) => onChange(v.replace(/[^0-9.]/g, ""))} placeholder={placeholder} className="pr-10" />
      <span aria-hidden="true" className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-[16px]" style={{ color: S.quiet }}>g</span>
    </div>
  );
}

const MED_TIMES = [
  { key: "morning", label: "Morning" },
  { key: "midday", label: "Midday" },
  { key: "evening", label: "Evening" },
  { key: "bedtime", label: "Bedtime" },
] as const;
type MedTime = (typeof MED_TIMES)[number]["key"];
type MedRow = { name: string; times: MedTime[]; notes: string };

// Normalize a stored medications_details row into the chip shape. Rows saved
// before chips existed carry free-text `schedule`: infer day-parts from it
// ONCE (visible pre-selection the owner confirms) and keep the text as notes.
function hydrateMedRow(m: any): MedRow {
  if (Array.isArray(m.times)) {
    const keys = MED_TIMES.map((item) => item.key as string);
    return {
      name: m.name ?? "",
      times: (m.times as string[]).filter((t): t is MedTime => keys.includes(t)),
      notes: m.notes ?? "",
    };
  }
  const legacy = (m.schedule ?? "").toString();
  const inferred = legacy ? feedTimeToDaypart(legacy) : null;
  const times: MedTime[] =
    inferred === "morning" || inferred === "midday" || inferred === "evening" ? [inferred] : [];
  return { name: m.name ?? "", times, notes: legacy };
}

// Keep one Medication routine task per DOSE (med × selected day-part) in sync.
// Reconciles by position: updates the first N existing tasks, inserts extras,
// deletes leftovers — so edits keep task ids instead of churning rows. A med
// with no day-part selected gets a single "custom" (Anytime) task so it never
// silently disappears from the sitter's list.
async function syncMedicationTasks(planId: string, meds: MedRow[]) {
  const { data: existing } = await supabase
    .from("routine_tasks")
    .select("id, title, instructions, sort_order")
    .eq("care_plan_id", planId)
    .ilike("title", `${MED_TASK_PREFIX}%`)
    .order("sort_order", { ascending: true });
  const current = (existing ?? []) as any[];

  const desired = meds.flatMap((m, i) => {
    const doses = m.times.length
      ? m.times.map((item) => ({
          title: `${MED_TASK_PREFIX}: ${m.name} — ${MED_TIMES.find((x) => x.key === item)?.label.toLowerCase()}`,
          category: item as string,
          derived: medDescriptor(m.name, item, m.notes),
        }))
      : [{ title: `${MED_TASK_PREFIX}: ${m.name}`, category: "custom", derived: medDescriptor(m.name, null, m.notes) }];
    return doses.map((d, j) => ({
      title: d.title,
      instructions: m.notes || null,
      category: d.category,
      sort_order: 999 + i * 10 + j,
      derived: d.derived,
    }));
  });

  const updates = desired.slice(0, current.length);
  const inserts = desired.slice(current.length);
  const removals = current.slice(desired.length);

  for (let i = 0; i < updates.length; i++) {
    await supabase.from("routine_tasks").update(updates[i] as any).eq("id", current[i].id);
  }
  if (inserts.length) {
    await supabase.from("routine_tasks").insert(inserts.map((item) => ({ ...item, care_plan_id: planId })) as any);
  }
  if (removals.length) {
    await supabase.from("routine_tasks").delete().in("id", removals.map((item) => item.id));
  }
}

// syncFeedingTasks now lives in @/lib/feedingSync (shared with the tabbed editor)
// and builds tasks from the structured per-food periods.

async function syncHygieneTasks(
  planId: string,
  args: {
    removalLabel: string; foodWashLabel: string; waterWashLabel: string; waterChangeLabel: string | null; hasFresh: boolean;
    // Enum KEYS (not labels) so the descriptor can be re-rendered per locale.
    removalMinutes: number; foodBowlWash: string; waterBowlWash: string; waterFreq: string | null;
  },
) {
  type Spec = { prefix: string; title: string; instructions: string; category: string; sort_order: number; skip: boolean; derived: DerivedTask };
  const specs: Spec[] = [
    {
      // Fresh drinking water — derived from the Food tab's water frequency.
      // Placed in the morning block (start-of-day water change).
      prefix: WATER_CHANGE_PREFIX,
      title: `${WATER_CHANGE_PREFIX} (${args.waterChangeLabel ?? ""})`.replace(" ()", ""),
      instructions: "Give fresh drinking water.",
      category: "morning",
      sort_order: 989,
      skip: !args.waterChangeLabel,
      derived: changeWaterDescriptor(args.waterFreq ?? ""),
    },
    {
      prefix: HYG_REMOVE_PREFIX,
      title: `${HYG_REMOVE_PREFIX} (within ${args.removalLabel} of serving)`,
      instructions: "Fresh / wet food spoils fast. Take it out within this window to prevent bacteria.",
      category: "midday",
      sort_order: 990,
      skip: !args.hasFresh,
      derived: removeFreshDescriptor(args.removalMinutes),
    },
    {
      prefix: HYG_WASH_FOOD_PREFIX,
      title: `${HYG_WASH_FOOD_PREFIX} (${args.foodWashLabel.toLowerCase()})`,
      instructions: "Use hot water and a bottle brush. Rinse thoroughly before refilling.",
      category: "evening",
      sort_order: 991,
      skip: false,
      derived: washFoodDescriptor(args.foodBowlWash),
    },
    {
      prefix: HYG_WASH_WATER_PREFIX,
      title: `${HYG_WASH_WATER_PREFIX} (${args.waterWashLabel.toLowerCase()})`,
      instructions: "Wash the bowl/bottle itself — separate from how often water is changed.",
      category: "morning",
      sort_order: 992,
      skip: false,
      derived: washWaterDescriptor(args.waterBowlWash),
    },
  ];

  for (const s of specs) {
    const { data: existing } = await supabase
      .from("routine_tasks")
      .select("id")
      .eq("care_plan_id", planId)
      .ilike("title", `${s.prefix}%`);
    const rows = (existing ?? []) as any[];
    if (s.skip) {
      if (rows.length) await supabase.from("routine_tasks").delete().in("id", rows.map((r) => r.id));
      continue;
    }
    if (rows.length === 0) {
      await supabase.from("routine_tasks").insert({
        care_plan_id: planId,
        title: s.title,
        instructions: s.instructions,
        category: s.category,
        sort_order: s.sort_order,
        derived: s.derived,
      } as any);
    } else {
      const [first, ...rest] = rows;
      await supabase.from("routine_tasks").update({ title: s.title, instructions: s.instructions, derived: s.derived } as any).eq("id", first.id);
      if (rest.length) await supabase.from("routine_tasks").delete().in("id", rest.map((r) => r.id));
    }
  }
}

// ---------- Tips from the owner ----------

type ClipSlot = {
  key: "step_up" | "food_water" | "locations" | "bedtime" | "food_prep" | "toys_foraging" | "targeting" | "anything_else";
  column:
    | "clip_step_up_path"
    | "clip_food_water_path"
    | "clip_locations_path"
    | "clip_bedtime_path"
    | "clip_food_prep_path"
    | "clip_toys_foraging_path"
    | "clip_targeting_path"
    | "clip_anything_else_path";
  label: string;
  hint: string;
  optional?: boolean;
};

const CLIP_SLOTS: ClipSlot[] = [
  { key: "step_up", column: "clip_step_up_path", label: "How they step up", hint: "Hand position, cue word, what works." },
  { key: "food_water", column: "clip_food_water_path", label: "How to refill food & water safely", hint: "Show the bowls, fill amount, and any cage-door routine." },
  { key: "locations", column: "clip_locations_path", label: "Where everything is", hint: "Walkthrough: food, treats, towels, carrier, first aid." },
  { key: "bedtime", column: "clip_bedtime_path", label: "Settling them for the night", hint: "Lights, sounds, bedtime routine." },
  { key: "food_prep", column: "clip_food_prep_path", label: "Food prep", hint: "Making chop, portioning a pre-made mix, or prepping freeze-dried." },
  { key: "toys_foraging", column: "clip_toys_foraging_path", label: "Toys & foraging", hint: "Setting up foraging toys, rotating enrichment, or hiding treats." },
  { key: "targeting", column: "clip_targeting_path", label: "Targeting & interaction", hint: "Targeting, tricks, and how you like to hang out together." },
  { key: "anything_else", column: "clip_anything_else_path", label: "Anything else?", hint: "Showering, nail care, bedtime, or anything that's easier shown than told.", optional: true },
];

export function OwnerTipsClipsStep({ birdId, birdName, onBlockNext }: { birdId: string; birdName: string; onBlockNext: (block: boolean) => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  // Next waits while any slot is recording or uploading; the footer says so
  // while one is uploading.
  const busyRef = useRef<Set<string>>(new Set());
  const uploadingRef = useRef<Set<string>>(new Set());
  const [anyBusy, setAnyBusy] = useState(false);
  const [anyUploading, setAnyUploading] = useState(false);
  const reportBusy = useCallback((key: string, busy: boolean) => {
    if (busy) busyRef.current.add(key);
    else busyRef.current.delete(key);
    setAnyBusy(busyRef.current.size > 0);
  }, []);
  const reportUploading = useCallback((key: string, uploading: boolean) => {
    if (uploading) uploadingRef.current.add(key);
    else uploadingRef.current.delete(key);
    setAnyUploading(uploadingRef.current.size > 0);
  }, []);
  useEffect(() => { onBlockNext(anyBusy || anyUploading); }, [anyBusy, anyUploading, onBlockNext]);
  const setFooterNote = useContext(SetupFooterNoteContext);
  useEffect(() => {
    setFooterNote(anyUploading ? t("birdSetup.tips.clipStillUploading", "A clip is still uploading.") : null);
    return () => setFooterNote(null);
  }, [anyUploading, setFooterNote, t]);

  const { data: plan, isLoading } = useQuery({
    queryKey: ["plan-clips", birdId],
    queryFn: async () => {
      const { data, error } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading || !plan) return <div className="h-32 animate-pulse rounded-2xl bg-sage-100" />;

  const added = CLIP_SLOTS.filter((slot) => !!plan[slot.column]).length;

  return (
    <div className="flex flex-col gap-2.5">
      <StepInstruction>{t("birdSetup.instr.tips", "Add short video clips, up to 60 seconds each. Record one now or upload from your phone.")}</StepInstruction>
      <p className="m-0 text-[13px] font-[700] text-[#5f5e5a]">{t("birdSetup.tips.countAdded", "{{n}} of 8 added", { n: added })}</p>
      {CLIP_SLOTS.map((slot) => (
        <ClipSlotRow
          key={slot.key}
          slot={slot}
          path={plan[slot.column] ?? null}
          birdId={birdId}
          planId={plan.id}
          onBusy={reportBusy}
          onUploading={reportUploading}
          onChange={() => qc.invalidateQueries({ queryKey: ["plan-clips", birdId] })}
        />
      ))}
    </div>
  );
}

/** Progress ring for a clip that's uploading, drawn inside the row's square. */
function ProgressRing({ pct }: { pct: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 44 44" className="size-11 -rotate-90" aria-hidden="true">
      <circle cx="22" cy="22" r={r} fill="none" stroke="#e3ebe2" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none" stroke="#1a3d2e" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, pct)) / 100)} />
    </svg>
  );
}

/**
 * One tip clip as a row: a square (camera, progress ring, or play), the slot's
 * title and hint, and + / Cancel / Edit. Adding opens a small sheet with the
 * recorder; once an upload starts the sheet steps out of sight (still mounted,
 * so the upload carries on) and the row shows the progress.
 */
function ClipSlotRow({
  slot, path, birdId, planId, onBusy, onUploading, onChange,
}: {
  slot: ClipSlot;
  path: string | null;
  birdId: string;
  planId: string;
  onBusy: (key: string, busy: boolean) => void;
  onUploading: (key: string, uploading: boolean) => void;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const preview = useOwnerClipPreview(path);
  const [sheet, setSheet] = useState<"add" | "edit" | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const title = displayLabel(t, slot.label);
  const uploading = progress != null || saving;

  useEffect(() => { onUploading(slot.key, uploading); }, [uploading, slot.key, onUploading]);
  useEffect(() => () => { onUploading(slot.key, false); onBusy(`${slot.key}:rec`, false); }, [slot.key, onUploading, onBusy]);

  // The recorder uploads to Cloudflare Stream and returns a "cfstream:<uid>" ref.
  async function upload(ref: string) {
    setSaving(true);
    try {
      // Save the new ref, then retire the one it replaced — see commitClipRef.
      await commitClipRef({ planId, column: slot.column, newRef: ref, oldRef: path });
      setReplacing(false);
      setSheet(null);
      toast.success(t("birdSetup.clipSlotSaved", "{{label}} saved.", { label: title }));
      onChange();
    } catch {
      toast.error(t("birdSetup.couldnTSaveTheClip", "Couldn't save the clip. Please try again."));
    } finally {
      setSaving(false);
      setProgress(null);
    }
  }

  async function remove() {
    setSaving(true);
    try {
      // Clear the column, then retire the old clip — see commitClipRef.
      await commitClipRef({ planId, column: slot.column, newRef: null, oldRef: path });
      setSheet(null);
      onChange();
    } catch {
      toast.error(t("birdSetup.couldnTRemoveTheClip", "Couldn't remove the clip. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  function cancelUpload() {
    cancelRef.current?.();
    setProgress(null);
    setSheet(null);
    setReplacing(false);
  }

  const hint = displayLabel(t, slot.hint);
  const length = clipLength(preview.duration);
  const hintLine = uploading
    ? t("birdSetup.tips.uploadingPct", "Uploading… {{n}}%", { n: progress ?? 100 })
    : path && preview.status === "processing"
      ? t("clipRecorder.gettingItReady", "Getting it ready…")
      : path && length ? `${length} · ${hint}` : hint;
  const showRecorder = sheet === "add" || (sheet === "edit" && replacing);

  return (
    <div className="flex items-center gap-3 rounded-[18px] p-3" style={{ background: S.card, color: S.forest }}>
      <button
        type="button"
        onClick={() => (path && !uploading ? setSheet("edit") : undefined)}
        tabIndex={path && !uploading ? 0 : -1}
        aria-hidden={!path || uploading}
        className="grid size-14 shrink-0 place-items-center rounded-[14px]"
        style={{ background: path && !uploading ? S.forest : "#fff", color: path && !uploading ? S.lime : S.moss }}
      >
        {uploading ? <ProgressRing pct={progress ?? 100} /> : path ? <Play className="ml-0.5 size-6 fill-current" aria-hidden="true" /> : <Video className="size-6" aria-hidden="true" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[15.5px] font-[700] leading-[1.3]">
          {title}
          {slot.optional && <span className="ml-1 font-[500]" style={{ color: S.quiet }}>{t("birdSetup.tips.optional", "(optional)")}</span>}
        </p>
        <p className="m-0 mt-0.5 text-[14px] leading-[1.4]" style={{ color: S.helper }}>{hintLine}</p>
      </div>
      {uploading ? (
        progress != null ? <SetupTextButton onClick={cancelUpload}>{t("birdSetup.tips.cancel", "Cancel")}</SetupTextButton> : null
      ) : path ? (
        <SetupTextButton onClick={() => setSheet("edit")}>{t("birdSetup.tips.edit", "Edit")}</SetupTextButton>
      ) : (
        <button
          type="button"
          onClick={() => setSheet("add")}
          aria-label={t("birdSetup.tips.addClipAria", "Add a {{slot}} clip", { slot: title })}
          className="grid size-11 shrink-0 place-items-center rounded-full border-2 bg-white"
          style={{ borderColor: S.forest, color: S.forest }}
        >
          <Plus className="size-5" strokeWidth={2.6} aria-hidden="true" />
        </button>
      )}

      {sheet && (
        <BottomSheet hidden={uploading} onClose={() => { setSheet(null); setReplacing(false); }}>
          <div className="flex flex-col gap-4" style={{ color: S.forest }}>
            <div className="flex items-start gap-3">
              <h2 className="m-0 min-w-0 flex-1 break-words text-[24px] font-[700] leading-[1.15]" style={{ fontFamily: SERIF }}>{title}</h2>
              <button
                type="button"
                onClick={() => { setSheet(null); setReplacing(false); }}
                aria-label={t("foodEditor.closeSheet", "Close")}
                className="grid size-11 shrink-0 place-items-center rounded-full"
                style={{ background: S.card, color: S.forest }}
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            {showRecorder ? (
              <>
                <ClipRecorder
                  birdId={birdId}
                  onBusy={(b) => onBusy(`${slot.key}:rec`, b)}
                  onProgress={setProgress}
                  cancelRef={cancelRef}
                  onUploaded={upload}
                />
                {replacing && (
                  <div>
                    <SetupTextButton onClick={() => setReplacing(false)}>{t("birdSetup.keepCurrentClip", "Keep current clip")}</SetupTextButton>
                  </div>
                )}
              </>
            ) : (
              <>
                {preview.status === "processing" || !preview.url ? (
                  <UploadProgress label={t("clipRecorder.gettingItReady", "Getting it ready…")} />
                ) : (
                  <PosterClipPlayer src={preview.url} duration={preview.duration} label={title} className="h-[180px] w-full rounded-[16px]" />
                )}
                <div className="flex gap-4">
                  <SetupTextButton onClick={() => setReplacing(true)}>{t("birdSetup.replace", "Replace")}</SetupTextButton>
                  <SetupTextButton onClick={remove} disabled={saving}>{t("birdSetup.remove", "Remove")}</SetupTextButton>
                </div>
              </>
            )}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ---------- Emergency ----------

// Same shared emergency UI as the bird editor's Emergency tab (read-only
// account info + per-bird "Edit for {bird}" override). Emergency info comes from
// the account-level defaults set before birds exist, so even first-time setup
// shows them read-only rather than asking the owner to re-enter from scratch.
function EmergencyStep({
  birdId,
  birdName,
  onBlockNext,
  registerFlush,
}: {
  birdId: string;
  birdName: string;
  onBlockNext: (block: boolean) => void;
  registerFlush?: (fn: (() => Promise<void>) | null) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const setFooterNote = useContext(SetupFooterNoteContext);
  const setHomeSubline = useContext(SetupHomeSublineContext);

  // Each row saves when its sheet closes, so there's no debounced flush.
  useEffect(() => { registerFlush?.(null); }, [registerFlush]);

  const onState = useCallback(({ missingOwnerPhone, missingVetPhone }: EmergencySetupState) => {
    // "Save contacts" waits for both required contacts; "Skip for now" doesn't.
    onBlockNext(missingOwnerPhone || missingVetPhone);
    const after = t("emergencySetup.neededForSit", "You'll need it before you can create a pet sit.");
    setFooterNote(
      missingOwnerPhone && missingVetPhone
        ? `${t("emergencySetup.missingBoth", "Add your phone number and your avian vet's phone to finish.")} ${t("emergencySetup.neededForSitBoth", "You'll need them before you can create a pet sit.")}`
        : missingOwnerPhone
          ? `${t("emergencySetup.missingOwner", "Add your phone number to finish.")} ${after}`
          : missingVetPhone
            ? `${t("emergencySetup.missingVet", "Add your avian vet's phone to finish.")} ${after}`
            : null,
    );
    qc.invalidateQueries({ queryKey: ["emergency-contacts", birdId] });
  }, [onBlockNext, setFooterNote, t, qc, birdId]);
  useEffect(() => () => setFooterNote(null), [setFooterNote]);

  return (
    <>
      <StepInstruction>{t("birdSetup.instr.emergencyContacts", "Your birds' emergency contacts. Saved once for every bird.")}</StepInstruction>
      <EmergencyContactsScreen birdId={birdId} birdName={birdName} onState={onState} onSubline={setHomeSubline} />
    </>
  );
}

// ---------- Review (real sitter preview) ----------

function ReviewStep({
  birdId,
  birdName,
  onJumpToStep,
  onFinish,
}: {
  birdId: string;
  birdName: string;
  onJumpToStep: (target: number) => void;
  onFinish: (opts: { to: "dashboard-newsit" | "home" }) => void;
}) {
  const { t } = useTranslation();
  // Pull the same shape used elsewhere so the warning list reflects real data.
  const { data: bird } = useQuery({
    queryKey: ["bird-review", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, owner_id, normal_weight")
        .eq("id", birdId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: plan } = useQuery({
    queryKey: ["plan-review", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      return data as any;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks-review", plan?.id],
    enabled: !!plan?.id,
    queryFn: async () => {
      const { data } = await supabase.from("routine_tasks").select("id").eq("care_plan_id", plan!.id);
      return data ?? [];
    },
  });

  const { data: contacts } = useQuery({
    queryKey: ["contacts-review", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      return data as any;
    },
  });

  const { data: defaults } = useQuery({
    queryKey: ["defaults-review", bird?.owner_id],
    enabled: !!bird?.owner_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("owner_emergency_defaults")
        .select("*")
        .eq("owner_id", bird!.owner_id)
        .maybeSingle();
      return data as any;
    },
  });
  // Shared "Your home" reminders, so a bird that uses them isn't listed as thin.
  const { data: homeDefaults } = useQuery({
    queryKey: ["home-defaults-review", bird?.owner_id],
    enabled: !!bird?.owner_id,
    queryFn: async () => {
      const { data } = await supabase.from("owner_home_defaults").select("*").eq("owner_id", bird!.owner_id).maybeSingle();
      return data ?? null;
    },
  });

  // Find-or-create a preview sit so we can render the REAL sitter view.
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<{ message?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!bird?.owner_id) return;
      try {
        const token = await ensureSitterPreviewToken(birdId, bird.owner_id);
        if (!cancelled) setPreviewToken(token);
      } catch (e: any) {
        if (!cancelled) setPreviewError({ message: e.message });
      }
    })();
    return () => { cancelled = true; };
  }, [bird?.owner_id, birdId]);

  // "Before you share" thin/empty checks. Each links to its step.
  const issues = useMemo(() => {
    // Map by section key, not hardcoded numbers, so these links stay correct
    // regardless of step order (Food/Routine were reordered).
    const stepOf = (key: string) => SETUP_STEPS.findIndex((s) => s.key === key) + 1;
    const list: { label: string; step: number }[] = [];
    if ((tasks?.length ?? 0) === 0) list.push({ label: t("birdSetup.issue.noRoutineTasksYet", "No routine tasks yet"), step: stepOf("day") });
    if (!plan?.diet_types?.length && !plan?.food_instructions) list.push({ label: t("birdSetup.issue.noFoodWaterDetails", "No food & water details"), step: stepOf("food") });
    if (!plan?.handlers && !plan?.likes && !plan?.fears_triggers && !plan?.cage_location && !plan?.out_of_cage_mode) list.push({ label: t("birdSetup.issue.noPersonalityHandlingNotes", "No personality & handling notes"), step: stepOf("personality") });
    if (!HOME_GROUPS.some((g) => birdHasOwn(mergeHome(plan, homeDefaults), g))) list.push({ label: t("birdSetup.issue.noReminders", "No reminders for your sitter"), step: stepOf("environment") });
    if (!bird?.normal_weight && !plan?.baseline_clip_path && !plan?.whats_normal) {
      list.push({ label: t("birdSetup.issue.noHealthBaselineWeightPhoto", "No health baseline (weight, photo, clip, or notes)"), step: stepOf("health") });
    }
    if (!plan?.clip_step_up_path && !plan?.clip_food_water_path && !plan?.clip_locations_path && !plan?.clip_bedtime_path) {
      list.push({ label: t("birdSetup.issue.noTipsFromTheOwner", "No tips-from-the-owner clips"), step: stepOf("clips") });
    }
    const eff = (k: string) => ((contacts?.[k] ?? "").toString().trim() || (defaults?.[k] ?? "").toString().trim());
    if (!eff("owner_phone") || !eff("avian_vet_phone")) {
      list.push({ label: t("birdSetup.issue.requiredEmergencyContactsMissing", "Required emergency contacts missing"), step: stepOf("emergency") });
    }
    return list;
  }, [tasks, plan, bird, contacts, defaults, homeDefaults, t]);

  const previewSrc = previewToken ? `/sitter/${previewToken}?birdId=${birdId}&preview=1` : null;

  return (
    <div className="space-y-4">
      <StepInstruction>{t("birdSetup.instr.review", "Here's exactly what everyone helping will see for {{name}}. Scroll inside the preview to explore the Today screen.", { name: birdName })}</StepInstruction>

      {issues.length > 0 && (
        <section className="rounded-2xl bg-warn-amber/10 p-4 ring-1 ring-warn-amber/30">
          <h2 className="text-sm font-bold text-warn-amber">{t("birdSetup.beforeYouShare", "Before you share")}</h2>
          <p className="mt-1 text-xs text-sage-700">{t("birdSetup.aFewThingsAreStill", "A few things are still thin or empty:")}</p>
          <ul className="mt-2 space-y-1">
            {issues.map((i) => (
              <li key={i.step}>
                <button
                  type="button"
                  onClick={() => onJumpToStep(i.step)}
                  className="text-left text-sm font-semibold text-sage-900 underline decoration-warn-amber underline-offset-2"
                >
                  {i.label} <span className="text-xs text-sage-600">{t("birdSetup.fixIt", "— fix it")}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl bg-sage-900 ring-1 ring-sage-200">
        <div className="flex items-center justify-between px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-white/80">
          <span>{t("birdSetup.sitterPreview", "Sitter preview")}</span>
          <span className="rounded bg-white/10 px-2 py-0.5">{t("birdSetup.live", "Live")}</span>
        </div>
        <div className="bg-sage-50">
          {previewError ? (
            <div className="p-6 text-sm text-warn-red">{previewError.message ?? t("birdSetup.couldNotBuildPreview", "Could not build preview")}</div>
          ) : previewSrc ? (
            <iframe
              src={previewSrc}
              title={t("birdSetup.sitterPreview", "Sitter preview")}
              className="h-[640px] w-full border-0 bg-sage-50"
            />
          ) : (
            <div className="h-[640px] animate-pulse bg-sage-100" />
          )}
        </div>
      </section>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onFinish({ to: "home" })}
          className="w-full rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white"
        >
          {t("birdSetup.looksGoodSave", "Looks good — save")}
        </button>
        <button
          type="button"
          onClick={() => onFinish({ to: "dashboard-newsit" })}
          className="w-full rounded-xl border border-sage-300 bg-white py-3 text-sm font-semibold text-sage-700"
        >
          {t("birdSetup.saveAndCreateSit", "Save & create a sit")}
        </button>
        <button
          type="button"
          onClick={() => onJumpToStep(8)}
          className="block w-full text-center text-xs font-semibold text-sage-700 underline"
        >
          {t("birdSetup.backToEmergency", "← Back to Emergency")}
        </button>
      </div>
    </div>
  );
}
