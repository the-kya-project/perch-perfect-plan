// Which care-plan sections are done for a bird — the care plan page's rows and
// the bird page's "Ready" / "[n] to finish" tag read the same answer.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { getBirdEmergencyReadiness } from "@/lib/household.functions";
import { computeSetupCompleteness, type SetupCheck } from "@/lib/setupCompleteness";
import { mergeHome, homeDifferences } from "@/lib/homeDefaults";
import { emergencyDifferent } from "@/lib/emergency";
import { useBirdRole } from "@/lib/useBirdRole";

export type CarePlanRowKey = "details" | "food" | "health" | "personality" | "clips" | "day" | "environment" | "emergency";
export const CARE_PLAN_ROWS: CarePlanRowKey[] = ["details", "food", "health", "personality", "clips", "day"];
export const CARE_PLAN_HOME_ROWS: CarePlanRowKey[] = ["environment", "emergency"];

export function useCarePlanStatus(birdId: string) {
  const role = useBirdRole(birdId);
  const isOwner = role === "owner";

  const { data: bird } = useQuery({
    queryKey: ["bird", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, name, species, photo_url, photo_position, normal_weight, setup_step, setup_complete, updated_at")
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

  const isDone = (k: CarePlanRowKey) => (k === "details" ? !!bird?.name : !!checksByKey.get(k)?.done);
  const todo = [...CARE_PLAN_ROWS, ...CARE_PLAN_HOME_ROWS].filter((k) => !isDone(k));
  /** False until the data the answer depends on has loaded. */
  const loaded = !!bird && plan !== undefined && contacts !== undefined;
  return { bird, plan, isOwner, isDone, todo, loaded, homeIsDifferent, emergencyIsDifferent };
}
