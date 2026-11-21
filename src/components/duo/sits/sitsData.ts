// Sit data shared by the phone Sits screens and their iPhone Duo two-pane
// versions (SitsDuo), so both read the same rows under the same cache keys.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { memberDisplayName } from "@/lib/memberDisplay";
import { useHouseholdCapability, useMyPermissions } from "@/lib/useCapability";
import { friendlyError } from "@/lib/errorMessage";
import { localDateISO } from "@/lib/localDay";

/** The Sits tab's ["sits-full"] rows: every sit with its sit_birds join. */
export async function fetchSitsFull() {
  const { data, error } = await supabase
    .from("sits")
    .select("*, sit_birds(bird_id)")
    .or("sitter_name.is.null,sitter_name.neq.__preview__")
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type SitActivity =
  | { kind: "scan"; id: string; at: string; status: string; reasons: string | null; bird_id: string }
  | { kind: "weight"; id: string; at: string; grams: number; bird_id: string }
  | { kind: "journal"; id: string; at: string; title: string; kindLabel: string | null; bird_id: string }
  | { kind: "photo"; id: string; at: string; bird_id: string }
  // label = stored English title (null if unknown); derived = its descriptor,
  // rendered in the UI language at display.
  | { kind: "task"; id: string; at: string; label: string | null; derived: unknown | null };

export type SitCounts = { scans: number; weights: number; journals: number; photos: number; tasks: number };

type ResolveNames = (args: { data: { userIds: string[] } }) => Promise<Record<string, any>>;

/** The ["sit-detail", sitId] query: the sit, its birds, who covered, and its
 *  activity feed (everything logged with this sit_id). Owner-only (RLS). */
export async function fetchSitDetail(sitId: string, resolveNames: ResolveNames) {
  const { data: sit } = await supabase
    .from("sits")
    .select("id, owner_id, title, start_date, end_date, sitter_name, sitter_email, caregiver_user_id, lead_user_id, notes, revoked")
    .eq("id", sitId).maybeSingle();
  if (!sit) return { sit: null as any, birds: [] as { id: string; name: string }[], caregiver: null as null | { name: string }, leadName: null as string | null, activity: [] as SitActivity[], counts: { scans: 0, weights: 0, journals: 0, photos: 0, tasks: 0 } as SitCounts };

  // Resolve caregiver + lead display names via the service role (the
  // authenticated client can't read other users' profiles — RLS self-only).
  const personIds = [sit.caregiver_user_id].filter(Boolean) as string[];
  const [birdsJoin, nameMap] = await Promise.all([
    supabase.from("sit_birds").select("bird_id, birds(id, name)").eq("sit_id", sitId),
    personIds.length ? resolveNames({ data: { userIds: personIds } }) : Promise.resolve({} as Record<string, any>),
  ]);
  const displayFor = (id: string) => memberDisplayName((nameMap as Record<string, any>)[id]);
  const birds = ((birdsJoin.data ?? []) as any[])
    .map((r) => r.birds)
    .filter(Boolean)
    .map((b: any) => ({ id: b.id as string, name: b.name as string }));

  // Activity feed (all by sit_id; task_completions already use it).
  const [scansRes, weightsRes, journalRes, photosRes, completionsRes] = await Promise.all([
    supabase.from("daily_logs").select("id, bird_id, created_at, triage_status, triage_reasons").eq("sit_id", sitId).order("created_at", { ascending: false }),
    supabase.from("weight_entries").select("id, bird_id, grams, measured_at").eq("sit_id", sitId).order("measured_at", { ascending: false }),
    supabase.from("journal_entries").select("id, bird_id, title, kind, created_at").eq("sit_id", sitId).order("created_at", { ascending: false }),
    supabase.from("photo_logs").select("id, bird_id, created_at").eq("sit_id", sitId).order("created_at", { ascending: false }),
    supabase.from("task_completions").select("id, routine_task_id, completed_at, routine_tasks(title, derived)").eq("sit_id", sitId).order("completed_at", { ascending: false }),
  ]);
  const counts: SitCounts = {
    scans: scansRes.data?.length ?? 0,
    weights: weightsRes.data?.length ?? 0,
    journals: journalRes.data?.length ?? 0,
    photos: photosRes.data?.length ?? 0,
    tasks: completionsRes.data?.length ?? 0,
  };

  const activity: SitActivity[] = [
    ...((scansRes.data ?? []) as any[]).map((r) => ({ kind: "scan" as const, id: r.id, at: r.created_at, status: r.triage_status ?? "green", reasons: r.triage_reasons ?? null, bird_id: r.bird_id })),
    ...((weightsRes.data ?? []) as any[]).map((r) => ({ kind: "weight" as const, id: r.id, at: r.measured_at, grams: r.grams, bird_id: r.bird_id })),
    ...((journalRes.data ?? []) as any[]).map((r) => ({ kind: "journal" as const, id: r.id, at: r.created_at, title: r.title ?? i18next.t("sitDetail.journalEntry", "Journal entry"), kindLabel: r.kind ?? null, bird_id: r.bird_id })),
    ...((photosRes.data ?? []) as any[]).map((r) => ({ kind: "photo" as const, id: r.id, at: r.created_at, bird_id: r.bird_id })),
    ...((completionsRes.data ?? []) as any[]).map((r) => ({ kind: "task" as const, id: r.id, at: r.completed_at, label: (r.routine_tasks?.title ?? null) as string | null, derived: r.routine_tasks?.derived ?? null })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  return {
    sit,
    birds,
    caregiver: sit.caregiver_user_id ? { name: displayFor(sit.caregiver_user_id) } : null,
    // "In charge" = the covering caregiver (caregiver_user_id), NOT lead_user_id
    // (which is set to the OWNER for an external sitter, so it wrongly labelled
    // the owner "in charge" of an externally-sat sit). Null for external sits;
    // the external sitter is already shown as the caregiver above.
    leadName: sit.caregiver_user_id ? displayFor(sit.caregiver_user_id) : null,
    activity,
    counts,
  };
}

/**
 * Delete a sit from its page — owner always; a household member only with
 * manage_sits (RLS "sits delete" mirrors this). Deleting the row cascades its
 * children via FK (sit_birds / task_completions / sit_checklist_items removed;
 * logged daily_logs / weight_entries / photo_logs keep their rows with sit_id
 * nulled).
 */
export function useSitDelete(sit: { id: string; owner_id?: string | null; start_date: string; end_date: string; revoked?: boolean | null } | null | undefined) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const canManageSits = useHouseholdCapability("manage_sits", sit?.owner_id ?? undefined);
  const { data: perms } = useMyPermissions();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Owner ALWAYS sees delete — detected explicitly here so a slow/empty
  // permissions fetch (or a missing owner_id) can never hide it. Members need
  // manage_sits. RLS ("sits delete") enforces the same rule server-side.
  const isOwner = !!sit && !!perms?.myId && perms.myId === sit.owner_id;
  const canDelete = !!sit && (isOwner || canManageSits);
  const today = localDateISO();
  // Active = a sitter is currently covering: live window (today between the
  // dates) and not revoked. Deleting one mid-sit pulls coverage out from under them.
  const isActiveSit = !!sit && !sit.revoked && sit.start_date <= today && sit.end_date >= today;

  async function deleteSit() {
    if (!sit) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("sits").delete().eq("id", sit.id);
      if (error) throw error;
      toast.success(t("sitDetail.deleted", "Sit deleted."));
      // Refresh every surface that lists sits: the Sits list (["sits-full"]), the
      // Past archive (["sits-archive"]), the dashboard's upcoming row (["all-sits"]),
      // and the caregiver home (["active-caregiver-sits"]).
      qc.invalidateQueries({ queryKey: ["sits-full"] });
      qc.invalidateQueries({ queryKey: ["sits-archive"] });
      qc.invalidateQueries({ queryKey: ["all-sits"] });
      qc.invalidateQueries({ queryKey: ["active-caregiver-sits"] });
      qc.invalidateQueries({ queryKey: ["dashboard-home"] }); // Home's upcoming-sit/today rows
      navigate({ to: "/sits" });
    } catch (e: any) {
      toast.error(friendlyError(e, t("sitDetail.couldNotDelete", "Couldn't delete the sit.")));
      setDeleting(false);
    }
  }

  return { canDelete, isActiveSit, confirmingDelete, setConfirmingDelete, deleting, deleteSit };
}
