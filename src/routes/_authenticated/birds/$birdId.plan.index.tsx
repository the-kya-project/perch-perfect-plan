import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { computeSetupCompleteness, type SetupCheck } from "@/lib/setupCompleteness";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability } from "@/lib/useCapability";
import { InkHero, IconTile, StatusPill, CtaLink, Card, RecordRow } from "@/components/system";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import {
  ArrowLeft, Eye, Check, AlertTriangle, Wand2,
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
  head: () => ({ meta: [{ title: "Care plan — Kya & Co." }] }),
  component: CarePlanOverview,
});

type SectionKey = "food" | "day" | "personality" | "environment" | "health" | "emergency";

// Maps an overview row to the read-only care-plan's anchor id so a member who
// can't edit deep-links straight to that section (?section=) instead of the top.
const READ_SECTION: Record<SectionKey, "food" | "behavior" | "home" | "health" | "routine" | "emergency"> = {
  food: "food", personality: "behavior", environment: "home", health: "health", day: "routine", emergency: "emergency",
};

const SECTIONS: { key: SectionKey; tab: "food" | "routine" | "behavior" | "home" | "health" | "emergency"; label: string; icon: React.ReactNode; needsInfoHint: string; readyHint: string }[] = [
  { key: "food",        tab: "food",      label: "Food",      icon: <Utensils className="size-5" />,     needsInfoHint: "Diet and food instructions", readyHint: "Diet and food instructions" },
  { key: "personality", tab: "behavior",  label: "Behavior",  icon: <Smile className="size-5" />,        needsInfoHint: "Handling, likes, triggers",  readyHint: "Handling, likes, triggers" },
  { key: "environment", tab: "home",      label: "Home",      icon: <HomeIcon className="size-5" />,     needsInfoHint: "Cage, out-of-cage, hazards", readyHint: "Cage, out-of-cage, hazards" },
  { key: "health",      tab: "health",    label: "Health",    icon: <Stethoscope className="size-5" />,  needsInfoHint: "Baseline and what's normal", readyHint: "Baseline and what's normal" },
  { key: "day",         tab: "routine",   label: "Routine",   icon: <CalendarClock className="size-5" />,needsInfoHint: "Daily schedule and tasks",   readyHint: "Daily schedule and tasks" },
  { key: "emergency",   tab: "emergency", label: "Emergency", icon: <Siren className="size-5" />,        needsInfoHint: "Owner and vet contacts",     readyHint: "Owner and vet contacts" },
];

function CarePlanOverview() {
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

  const completeness = computeSetupCompleteness({ bird, plan, tasksCount: tasks.length, contacts, defaults });
  const checksByKey = new Map<string, SetupCheck>(completeness.checks.map((c) => [c.key, c]));

  // The wizard reads its starting step from `?step=`; without a step it resumes
  // from the saved setup_step, which is how "Walk through it again" prefills
  // answers — the same data is loaded by each step's queries.
  const walkthroughStep = completeness.firstIncompleteStep ?? 1;

  const name = bird?.name ?? "this bird";

  // Emergency "Using your account defaults" copy: true when no per-bird value
  // has been entered and account defaults supply at least the required fields.
  const emergencyUsesDefaults = (() => {
    const ownerOverridden = (contacts?.owner_phone ?? "").toString().trim();
    const vetOverridden = (contacts?.avian_vet_phone ?? "").toString().trim();
    const hasDefaults = !!(defaults?.owner_phone || defaults?.avian_vet_phone);
    return !ownerOverridden && !vetOverridden && hasDefaults;
  })();

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={() => navigate({ to: "/birds/$birdId", params: { birdId } })}
          eyebrow="Care plan"
          headline="Everything a caregiver needs."
          body="What you've taught yourself about how they're cared for."
          cta={
            isOwner
              ? {
                  label: "View as your sitter",
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
            {SECTIONS.map((s, i) => {
              const check = checksByKey.get(s.key);
              const done = !!check?.done;
              const isEmergency = s.key === "emergency";
              // For Emergency, "done" considers account defaults via the check
              // (eff() in setupCompleteness). The subtitle reflects WHY it's
              // ready: per-bird contacts vs. account defaults.
              const subtitle = isEmergency && done && emergencyUsesDefaults
                ? "Using your account defaults"
                : done
                  ? s.readyHint
                  : s.needsInfoHint;
              // edit_care_plans opens the section editor; everyone else opens the
              // read-only care-plan view (RLS-enforced).
              const onRow = canEdit
                ? () => navigate({ to: "/birds/$birdId/plan/editor", params: { birdId }, search: { tab: s.tab } })
                : () => navigate({ to: "/birds/$birdId/care-plan", params: { birdId }, search: { section: READ_SECTION[s.key] } });
              return (
                <RecordRow
                  key={s.key}
                  leading={<IconTile size={38} tone={isEmergency ? "red" : "ink-lime"} icon={s.icon} />}
                  title={s.label}
                  subtitle={subtitle}
                  trailing={
                    done ? (
                      <StatusPill tone="ready"><Check className="size-3" /> Ready</StatusPill>
                    ) : (
                      <StatusPill tone="attention"><AlertTriangle className="size-3" /> Needs info</StatusPill>
                    )
                  }
                  onClick={onRow}
                  last={i === SECTIONS.length - 1}
                />
              );
            })}
          </Card>

          {/* Quiet action — re-run the guided wizard (needs edit_care_plans) */}
          {canEdit && (
            <CtaLink
              label="Walk through it again"
              icon={<Wand2 className="size-3.5" />}
              onPress={() => navigate({ to: "/birds/$birdId/setup", params: { birdId }, search: { step: walkthroughStep } })}
            />
          )}

          <p className="t-body px-1 text-[var(--mute)]">
            {isOwner
              ? `This is what a caregiver sees. Sitters get a per-trip link from the Sits tab; household members can view it any time.`
              : `Only ${name}'s owner can edit the care plan. You can view it and log weights, journal entries, and health checks.`}
          </p>
        </main>
      </div>
    </div>
  );
}
