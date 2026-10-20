import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { getBirdEmergencyReadiness } from "@/lib/household.functions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { computeSetupCompleteness, type SetupCheck } from "@/lib/setupCompleteness";
import { mergeHome, homeDifferences } from "@/lib/homeDefaults";
import { emergencyDifferent } from "@/lib/emergency";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability } from "@/lib/useCapability";
import { track } from "@/lib/analytics";
import { InkHero, IconTile, StatusPill, CtaLink, Card, RecordRow } from "@/components/system";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import {
  ArrowLeft, Eye, Check, AlertTriangle, Wand2, Video,
  Utensils, CalendarClock, Smile, Home as HomeIcon, Stethoscope, Siren,
} from "lucide-react";

// Care-plan overview — the front door an owner sees when they tap "Care plan"
// on the bird main page. Lists the six care-plan sections with completion
// status; tapping a section opens it in the existing tabbed editor.
// "Walk through it again" launches the guided wizard with answers prefilled.
// Per design: page #f4f1e8, white section list card, sentence case, AA contrast.
//
// This is the INDEX of the /plan route. The sibling /plan/editor renders into
// the plan layout's <Outlet/> (src/routes/_authenticated/birds/$birdId.plan.tsx)
// — an index/layout split so the editor is a real child route, not nested under
// this page (which has no Outlet, so the editor never rendered before).
export const Route = createFileRoute("/_authenticated/birds/$birdId/plan/")({
  head: () => ({ meta: [{ title: i18next.t("planEditor.metaTitle", "Care plan — Kya & Co.") }] }),
  component: CarePlanOverview,
});

type SectionKey = "food" | "day" | "personality" | "environment" | "health" | "emergency";

// Maps an overview row to the read-only care-plan's anchor id so a member who
// can't edit deep-links straight to that section (?section=) instead of the top.
const READ_SECTION: Record<SectionKey, "food" | "behavior" | "home" | "health" | "routine" | "emergency"> = {
  food: "food", personality: "behavior", environment: "home", health: "health", day: "routine", emergency: "emergency",
};

const sectionList = (t: TFunction): { key: SectionKey; tab: "food" | "routine" | "behavior" | "home" | "health" | "emergency"; label: string; icon: React.ReactNode; needsInfoHint: string; readyHint: string }[] => [
  { key: "food",        tab: "food",      label: t("planEditor.tabFood", "Food"),           icon: <Utensils className="size-5" />,     needsInfoHint: t("planOverview.hintFood", "Diet and food instructions"), readyHint: t("planOverview.hintFood", "Diet and food instructions") },
  { key: "health",      tab: "health",    label: t("planEditor.tabHealth", "Health"),       icon: <Stethoscope className="size-5" />,  needsInfoHint: t("planOverview.hintHealth", "Baseline and what's normal"), readyHint: t("planOverview.hintHealth", "Baseline and what's normal") },
  { key: "personality", tab: "behavior",  label: t("planEditor.tabBehavior", "Behavior"),   icon: <Smile className="size-5" />,        needsInfoHint: t("planOverview.hintBehaviorCageTime", "Handling, likes, cage, and out-of-cage time"),  readyHint: t("planOverview.hintBehaviorCageTime", "Handling, likes, cage, and out-of-cage time") },
  { key: "day",         tab: "routine",   label: t("planEditor.tabRoutine", "Routine"),     icon: <CalendarClock className="size-5" />,needsInfoHint: t("planOverview.hintRoutine", "Daily schedule and tasks"),   readyHint: t("planOverview.hintRoutine", "Daily schedule and tasks") },
  { key: "environment", tab: "home",      label: t("planOverview.rowReminders", "Reminders for your sitter"),           icon: <HomeIcon className="size-5" />,     needsInfoHint: t("planOverview.hintHomeAreas", "Hazards, off-limits areas, pets, and cleaning"), readyHint: t("planOverview.hintHomeAreas", "Hazards, off-limits areas, pets, and cleaning") },
  { key: "emergency",   tab: "emergency", label: t("planOverview.rowEmergencyContacts", "Emergency contacts"), icon: <Siren className="size-5" />,        needsInfoHint: t("planOverview.hintEmergency", "Owner and vet contacts"),     readyHint: t("planOverview.hintEmergency", "Owner and vet contacts") },
];

function CarePlanOverview() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const role = useBirdRole(birdId);
  // Edit access is capability-based now: owner OR a member with edit_care_plans
  // can open the section editor; everyone else sees the read-only care plan.
  const canEdit = useCapability("edit_care_plans", { birdId });
  const isOwner = role === "owner";

  const { data: bird } = useQuery({
    queryKey: ["bird", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, name, species, normal_weight, setup_step, setup_complete, updated_at")
        .eq("id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: plan } = useQuery({
    queryKey: ["plan", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("care_plans").select("*").eq("bird_id", birdId).maybeSingle();
      return data ?? null;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", plan?.id],
    enabled: !!plan?.id,
    queryFn: async () => {
      const { data } = await supabase.from("routine_tasks").select("id").eq("care_plan_id", plan!.id);
      return data ?? [];
    },
  });

  const { data: contacts } = useQuery({
    queryKey: ["contacts", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      return data ?? null;
    },
  });

  const { data: defaults } = useQuery({
    queryKey: ["owner-defaults"],
    // Only meaningful for the owner: this reads the VIEWER's own account
    // defaults, which for a household member is their (usually empty) account,
    // not this bird's owner's. Members get readiness from the server fn below.
    enabled: isOwner,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const { data } = await supabase
        .from("owner_emergency_defaults")
        .select("*")
        .eq("owner_id", u.user.id)
        .maybeSingle();
      return data ?? null;
    },
  });

  // The owner's shared "Your home" reminders (owner only, like the defaults above).
  const { data: homeDefaults } = useQuery({
    queryKey: ["owner-home-defaults"],
    enabled: isOwner,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const { data } = await supabase.from("owner_home_defaults").select("*").eq("owner_id", u.user.id).maybeSingle();
      return data ?? null;
    },
  });

  const getEmergencyReadiness = useServerFn(getBirdEmergencyReadiness);
  const { data: memberEmergency } = useQuery({
    queryKey: ["member-emergency-ready", birdId],
    // role resolves async; only fetch once we know the viewer is NOT the owner
    enabled: role !== null && !isOwner,
    queryFn: async () => await getEmergencyReadiness({ data: { birdId } }),
  });

  const completeness = computeSetupCompleteness({ bird, plan: mergeHome(plan, homeDefaults), tasksCount: tasks.length, contacts, defaults });
  // Members judge emergency and home readiness against the owner's merged data
  // (same source the read view renders) rather than their own empty defaults.
  if (!isOwner) {
    for (const [key, ready] of [["emergency", memberEmergency?.ready], ["environment", memberEmergency?.homeReady]] as const) {
      const c = completeness.checks.find((x) => x.key === key);
      if (ready && c && !c.done) {
        c.done = true;
        completeness.doneCount += 1;
      }
    }
  }
  // "Your home" rows say whether this bird uses the shared answers.
  const homeIsDifferent = isOwner ? homeDifferences(plan, homeDefaults).length > 0 : !!memberEmergency?.homeDifferent;
  const emergencyIsDifferent = isOwner ? emergencyDifferent(contacts, defaults) : !!memberEmergency?.emergencyDifferent;
  const checksByKey = new Map<string, SetupCheck>(completeness.checks.map((c) => [c.key, c]));

  useEffect(() => {
    track("care_plan_viewed", {});
  }, []);

  const name = bird?.name ?? t("planEditor.thisBird", "this bird");


  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={() => navigate({ to: "/birds/$birdId", params: { birdId } })}
          eyebrow={t("planOverview.eyebrow", "Care plan")}
          headline={t("planOverview.headline", "Everything that makes {{name}}, {{name}}.", { name })}
          body={
            isOwner
              ? t("planOverview.bodyOwner", "All the little things you know by heart, written down.")
              : t("planOverview.bodyMember", "All the little things {{name}}'s owner knows by heart, so you can care for {{name}} just right.", { name })
          }
          cta={
            isOwner
              ? {
                  label: t("planOverview.viewAsYourSitter", "View as your sitter"),
                  tone: "lime",
                  icon: <Eye className="size-4" />,
                  onPress: () => navigate({ to: "/birds/$birdId/view-as-sitter", params: { birdId } }),
                }
              : undefined
          }
        />

        <main className="space-y-4 px-5 pt-5">
          <MemberContextBanner birdId={birdId} />
          <Card>
            {sectionList(t).map((s) => {
              const check = checksByKey.get(s.key);
              const done = !!check?.done;
              const isEmergency = s.key === "emergency";
              // Reminders and emergency contacts are shared by every bird; their
              // rows say whether this bird uses the shared answers or its own.
              const isShared = s.key === "environment" || isEmergency;
              const different = s.key === "environment" ? homeIsDifferent : emergencyIsDifferent;
              const subtitle = isShared
                ? different
                  ? t("planOverview.differentFor", "Different for {{name}}", { name })
                  : t("planOverview.shared", "Shared")
                : done
                  ? s.readyHint
                  : s.needsInfoHint;
              // edit_care_plans opens the section editor; everyone else opens the
              // read-only care-plan view (RLS-enforced).
              const onRow = canEdit
                ? () => {
                    track("care_plan_editor_opened", { tab: s.tab, section_ready: done });
                    navigate({ to: "/birds/$birdId/plan/editor", params: { birdId }, search: { tab: s.tab } });
                  }
                : () => navigate({ to: "/birds/$birdId/care-plan", params: { birdId }, search: { section: READ_SECTION[s.key] } });
              return (
                <RecordRow
                  key={s.key}
                  leading={<IconTile size={38} tone={isEmergency ? "red" : "ink-lime"} icon={s.icon} />}
                  title={s.label}
                  subtitle={subtitle}
                  trailing={
                    done ? (
                      <StatusPill tone="ready"><Check className="size-3" /> {t("planOverview.ready", "Ready")}</StatusPill>
                    ) : (
                      <StatusPill tone="attention"><AlertTriangle className="size-3" /> {t("planOverview.needsInfo", "Needs info")}</StatusPill>
                    )
                  }
                  onClick={onRow}
                  last={false}
                />
              );
            })}
            {/* Tips-from-the-owner clips (recorded in setup step 6 / the editor's
                Clips tab). Optional, so no "Needs info" — surfaced here so recorded
                clips are reachable from the overview like the six sections. */}
            {(() => {
              const clipCols = ["clip_food_water_path", "clip_step_up_path", "clip_locations_path", "clip_bedtime_path", "clip_food_prep_path", "clip_toys_foraging_path", "clip_targeting_path", "clip_anything_else_path"];
              const clipCount = clipCols.filter((c) => (plan as any)?.[c]).length + ((plan as any)?.baseline_clip_path ? 1 : 0);
              const hasClips = clipCount > 0;
              return (
                <RecordRow
                  key="clips"
                  leading={<IconTile size={38} tone="ink-lime" icon={<Video className="size-5" />} />}
                  title={t("planOverview.tipsFromOwner", "Tips from the owner")}
                  subtitle={hasClips ? (clipCount === 1 ? t("planOverview.clipCountOne", "{{n}} clip", { n: clipCount }) : t("planOverview.clipCountOther", "{{n}} clips", { n: clipCount })) : t("planOverview.clipsOptional", "Optional — short how-to videos for sitters")}
                  trailing={hasClips ? <StatusPill tone="ready"><Check className="size-3" /> {t("planOverview.added", "Added")}</StatusPill> : undefined}
                  onClick={
                    canEdit
                      ? () => navigate({ to: "/birds/$birdId/plan/editor", params: { birdId }, search: { tab: "clips" } })
                      : () => navigate({ to: "/birds/$birdId/care-plan", params: { birdId } })
                  }
                  last
                />
              );
            })()}
          </Card>

          {/* Quiet action — re-run the guided wizard (needs edit_care_plans) */}
          {canEdit && (
            <CtaLink
              label={t("planOverview.walkThroughAgain", "Walk through it again")}
              icon={<Wand2 className="size-3.5" />}
              // "Walk through it again" is a full re-review — always start at the
              // beginning (Food · step 1), not the first incomplete step (which
              // was step 6/Clips whenever the optional clips were empty).
              onPress={() => navigate({ to: "/birds/$birdId/setup", params: { birdId }, search: { step: 1 } })}
            />
          )}

          <p className="t-body px-1 text-[var(--mute)]">
            {isOwner
              ? t("planOverview.footerOwner", "This is what everyone helping with {{name}} sees. Sitters get a per-trip link from the Sits tab; household members can view it any time.", { name })
              : t("planOverview.footerMember", "Only {{name}}'s owner can make changes. You can view the plan and log weights, journal entries, and health checks.", { name })}
          </p>
        </main>
      </div>
    </div>
  );
}
