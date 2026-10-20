import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { useServerFn } from "@tanstack/react-start";
import { resolveHouseholdNames } from "@/lib/home.functions";
import { getSitReadiness, type SitGapSection } from "@/lib/household.functions";
import { BottomSheet } from "@/components/setup/BottomSheet";
import type { TFunction } from "i18next";
import { S, SERIF, Tag, SetupPrimaryButton, SetupSecondaryButton, SetupTextButton } from "@/components/setup/controls";
import {
  notifySitAssigned, notifySitUpdated, notifySitCancelled,
  notifySitterInvite, notifySitterInviteUpdated, notifySitterCancelled,
} from "@/lib/sits.functions";
import { memberDisplayName, memberInitials } from "@/lib/memberDisplay";
import { useHouseholdCapability, useMyPermissions } from "@/lib/useCapability";
import { Mail, Check, X, AlertTriangle } from "lucide-react";
import { K, KyaHeader, KyaHeading, KyaIconButton, KyaLink } from "@/components/kya";
import { copySitterLink } from "@/lib/sitLink";
import { friendlyError } from "@/lib/errorMessage";
import { localDateISO } from "@/lib/localDay";

// Create OR edit a sit. In edit mode (`editSit` set) it preserves the existing
// invite_token — the same sitter link keeps working; editing changes what it
// grants (dates → access window, and which birds are included), not the link.
// The full "Set up a sit" / "Edit sit" screen (routes /sits/new and
// /sits/edit/$sitId). `onClose` leaves without saving; `onSaved` refreshes the
// lists that show sits.
export function SitForm({
  birds,
  onSaved,
  preselectBirdId,
  editSit,
  onClose,
}: {
  birds: any[];
  onSaved: () => void;
  preselectBirdId?: string;
  editSit?: any;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const theirInfo = t("sitForm.theirInfo", "Their info");
  const editing = !!editSit;
  const navigate = useNavigate();

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (editing) return new Set<string>(((editSit.sit_birds ?? []) as any[]).map((sb) => sb.bird_id));
    return preselectBirdId
      ? new Set([preselectBirdId])
      : new Set<string>(birds.length === 1 ? [birds[0].id] : []);
  });
  // Authoritative current bird list for reconcile (SitCard in the bird editor
  // doesn't pass sit_birds, so we fetch it below).
  const currentBirdIds = useRef<string[]>(editing ? Array.from(selected) : []);

  const [title, setTitle] = useState(editing ? (editSit.title ?? "") : "");
  const [sitterName, setSitterName] = useState(editing ? (editSit.sitter_name ?? "") : "");
  const [sitterEmail, setSitterEmail] = useState(editing ? (editSit.sitter_email ?? "") : "");
  const [start, setStart] = useState(editing ? (editSit.start_date ?? "") : "");
  const [end, setEnd] = useState(editing ? (editSit.end_date ?? "") : "");
  const [notes, setNotes] = useState(editing ? (editSit.notes ?? "") : "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const rootRef = useRef<HTMLFormElement>(null);

  // Delete a sit — owner always; a household member only with manage_sits (RLS
  // "sits delete" mirrors this). FK cascade cleans children: sit_birds,
  // sit_checklist_items, task_completions are removed; daily_logs / weight_entries
  // / photo_logs keep their rows with sit_id nulled. The sitter link
  // (sits.invite_token) and lead_user_id are columns on the row, gone with it.
  // Owner ALWAYS sees delete — detected explicitly so a slow/empty permissions
  // fetch can't hide it; members need manage_sits. RLS enforces the same.
  const canManageSits = useHouseholdCapability("manage_sits", editing ? (editSit.owner_id as string | undefined) : undefined);
  const { data: perms } = useMyPermissions();
  const isOwner = editing && !!perms?.myId && perms.myId === editSit.owner_id;
  const canDelete = isOwner || canManageSits;
  const todayStr = localDateISO();
  const isActiveSit = editing && !editSit.revoked && (editSit.start_date ?? "") <= todayStr && (editSit.end_date ?? "") >= todayStr;
  async function deleteSit() {
    if (!editing) return;
    setDeleting(true);
    // Capture the household-caregiver details BEFORE the delete so we can notify
    // afterward (the row, and its sit_birds, are gone once deleted).
    const cancelInfo =
      editSit.caregiver_user_id
        ? {
            caregiverUserId: editSit.caregiver_user_id as string,
            birdIds: ((editSit.sit_birds ?? []) as any[]).map((sb) => sb.bird_id as string),
            startDate: (editSit.start_date ?? "") as string,
            endDate: (editSit.end_date ?? "") as string,
          }
        : null;
    // External sit: capture the sitter's email too, so we can tell them the sit
    // is off (their token is dead once the row is deleted).
    const sitterCancelInfo =
      !editSit.caregiver_user_id && (editSit.sitter_email ?? "").trim()
        ? {
            birdIds: ((editSit.sit_birds ?? []) as any[]).map((sb) => sb.bird_id as string),
            startDate: (editSit.start_date ?? "") as string,
            endDate: (editSit.end_date ?? "") as string,
            sitterEmail: (editSit.sitter_email as string).trim(),
            sitterName: (editSit.sitter_name as string | null) ?? null,
          }
        : null;
    const { error } = await supabase.from("sits").delete().eq("id", editSit.id);
    // A FAILED delete must never send a cancellation — bail before notifying.
    if (error) { toast.error(friendlyError(error)); setDeleting(false); return; }
    // Delete succeeded → notify the caregiver they're no longer covering. The
    // cancelled failure toast is the most prominent of the three: if it doesn't
    // send, the caregiver could still show up expecting to cover.
    if (cancelInfo && cancelInfo.birdIds.length) {
      try {
        const res = await notifyCancelled({ data: cancelInfo });
        if (!res?.emailed) {
          track("sit_caregiver_email_failed", { event: "cancelled", reason: res?.reason ?? "unknown" });
          toast.error(
            t("sitForm.sitDeletedEmailFailedNamed", "Sit deleted, but we couldn't email {{name}} the cancellation. Tell them directly so they don't show up to cover.", { name: res?.caregiverName ?? t("sitForm.yourHouseholdMember", "your household member") }),
            { duration: 10000 },
          );
        } else {
          toast.success(t("sitForm.sitDeleted", "Sit deleted."));
        }
      } catch {
        track("sit_caregiver_email_failed", { event: "cancelled", reason: "threw" });
        toast.error(
          t("sitForm.sitDeletedButWeCouldn", "Sit deleted, but we couldn't email your household member the cancellation. Tell them directly so they don't show up to cover."),
          { duration: 10000 },
        );
      }
    } else if (sitterCancelInfo && sitterCancelInfo.birdIds.length) {
      const label = sitterCancelInfo.sitterName?.trim() || sitterCancelInfo.sitterEmail || "the sitter";
      try {
        const res = await sendSitterCancel({ data: sitterCancelInfo });
        if (!res?.emailed) {
          track("sitter_invite_email_failed", { event: "cancelled", reason: res?.reason ?? "unknown" });
          toast.error(
            t("sitForm.deletedEmailFailed", "Sit deleted, but we couldn't email {{name}} the cancellation. Tell them directly so they don't show up.", { name: label }),
            { duration: 10000 },
          );
        } else {
          toast.success(t("sitForm.sitDeleted", "Sit deleted."));
        }
      } catch {
        track("sitter_invite_email_failed", { event: "cancelled", reason: "threw" });
        toast.error(
          t("sitForm.deletedEmailFailed", "Sit deleted, but we couldn't email {{name}} the cancellation. Tell them directly so they don't show up.", { name: label }),
          { duration: 10000 },
        );
      }
    } else {
      toast.success(t("sitForm.sitDeleted", "Sit deleted."));
    }
    onSaved();      // parent refreshes ["all-sits"]
    navigate({ to: "/sits" });
  }

  // Caregiver kind:
  //   "household" + householdUserId = no token, no email — assigns a household
  //                                    member who already has bird access.
  //   "external" + sitterName/Email = the existing per-trip token flow.
  // Defaults to whichever was set on the row when editing; null on a fresh form
  // (the owner picks during creation). PR 1 doesn't allow swapping the kind in
  // edit mode — surfaced as a small note in the UI; a follow-up will add it.
  type CaregiverKind = "household" | "external";
  const initialKind: CaregiverKind | null = editing
    ? (editSit.caregiver_user_id ? "household" : "external")
    : null;
  const [caregiverKind, setCaregiverKind] = useState<CaregiverKind | null>(initialKind);
  const [householdUserId, setHouseholdUserId] = useState<string | null>(editing ? (editSit.caregiver_user_id ?? null) : null);

  // The lead ("in charge") is DERIVED from who's covering at save time — no
  // separate picker: a household cover IS the lead; an external sitter leaves
  // the owner as the responsible point of contact. (See the insert/update.)

  // Household members eligible to cover this sit = anyone who has household
  // access to EVERY currently-selected bird. Re-runs when the selection
  // changes; the owner can only pick a member who covers all of it. Owner
  // reads bird_members via the existing owner RLS — no new permission.
  const birdIdsKey = useMemo(() => Array.from(selected).sort().join(","), [selected]);
  const resolveNames = useServerFn(resolveHouseholdNames);
  const sitReadiness = useServerFn(getSitReadiness);
  // Soft reminder before creating a sit: care-plan sections the birds are still
  // missing. Only the emergency phones for an outside sitter block a sit (the
  // check in submit); everything here can be skipped with "Create the sit anyway".
  // The reminder sheet: what each bird's plan is missing, and (outside sitters
  // only) the required emergency contacts still missing, which block the sit.
  const [gaps, setGaps] = useState<{ birdId: string; name: string; missing: SitGapSection[] }[] | null>(null);
  const [requiredMissing, setRequiredMissing] = useState<{ birdId: string; needs: ("owner_phone" | "avian_vet_phone")[] } | null>(null);
  const acceptGapsRef = useRef(false);
  // Household-caregiver sit notifications (owner -> caregiver email). Called
  // AFTER the client-side sits write succeeds; external sits never touch these.
  const notifyAssigned = useServerFn(notifySitAssigned);
  const notifyUpdated = useServerFn(notifySitUpdated);
  const notifyCancelled = useServerFn(notifySitCancelled);
  // External (token-link) sitter notifications — the invert of the caregiver
  // ones above; they fire only for external sits.
  const sendSitterInvite = useServerFn(notifySitterInvite);
  const sendSitterUpdate = useServerFn(notifySitterInviteUpdated);
  const sendSitterCancel = useServerFn(notifySitterCancelled);
  const { data: eligibleMembers = [] } = useQuery({
    queryKey: ["sit-eligible-household", birdIdsKey],
    enabled: !editing && selected.size > 0,
    queryFn: async () => {
      const ids = Array.from(selected);
      const { data: rows } = await supabase
        .from("bird_members").select("user_id, bird_id, created_at")
        .in("bird_id", ids).eq("role", "household");
      const byUser = new Map<string, Set<string>>();
      for (const r of (rows ?? []) as any[]) {
        const s = byUser.get(r.user_id) ?? new Set<string>();
        s.add(r.bird_id);
        byUser.set(r.user_id, s);
      }
      // Filter to members on EVERY selected bird.
      const userIds = [...byUser.entries()].filter(([, s]) => s.size === ids.length).map(([id]) => id);
      if (!userIds.length) return [];
      // Resolve real names + emails via the service role (the authenticated
      // client can't read other users' profiles).
      const names = await resolveNames({ data: { userIds } });
      return userIds
        .map((id) => ({ userId: id, name: names[id]?.name ?? null, email: names[id]?.email ?? null }))
        .sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b)));
    },
  });

  // Edit: load the sit's authoritative current birds (prefill + reconcile).
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("sit_birds").select("bird_id").eq("sit_id", editSit.id);
      if (cancelled) return;
      const ids = (data ?? []).map((r: any) => r.bird_id);
      currentBirdIds.current = ids;
      setSelected(new Set(ids));
    })();
    return () => { cancelled = true; };
  }, [editing, editSit?.id]);

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  function selectAll() {
    setSelected(new Set(birds.map((b) => b.id)));
  }

  // Who the reminder is about: the chosen household member or outside sitter.
  function caregiverLabel(): string {
    if (caregiverKind === "household") {
      const m = eligibleMembers.find((x) => x.userId === householdUserId);
      if (m) return memberDisplayName(m);
    }
    if (caregiverKind === "external" && sitterName.trim()) return sitterName.trim();
    return t("sitForm.gaps.yourSitter", "Your sitter");
  }

  // Leave for the editor tab where a missing section is filled in.
  function openGap(birdId: string, m: SitGapSection) {
    navigate({ to: "/birds/$birdId/plan/editor", params: { birdId }, search: { tab: GAP_TAB[m] } as any });
  }
  // The birds the sheet is about, e.g. "Mango" or "Mango and Kiwi".
  const gapBirdIds = () => new Set([...(gaps ?? []).map((g) => g.birdId), ...(requiredMissing ? [requiredMissing.birdId] : [])]);
  const gapBirdCount = () => gapBirdIds().size;
  function gapBirdNames(): string {
    const ids = gapBirdIds();
    const names = Array.from(selected).filter((id) => ids.has(id)).map((id) => (birds.find((b: any) => b.id === id)?.name ?? "") as string).filter(Boolean);
    if (names.length <= 1) return names[0] ?? "";
    return t("sitForm.gaps.namesAnd", "{{first}} and {{last}}", { first: names.slice(0, -1).join(", "), last: names[names.length - 1] });
  }

  // A different set of birds or caregiver means a fresh look at the gaps.
  useEffect(() => { setGaps(null); setRequiredMissing(null); acceptGapsRef.current = false; }, [birdIdsKey, caregiverKind, householdUserId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) { toast.error(t("sitForm.pickAtLeastOneBird", "Pick at least one bird.")); return; }
    if (!start || !end) { toast.error(t("sitForm.pickAStartAndEnd", "Pick a start and end date.")); return; }
    if (end < start) { toast.error(t("sitForm.endDateMustBeOn", "End date must be on or after start date.")); return; }
    // Validate the caregiver choice — required on create; preserved on edit.
    if (!editing) {
      if (!caregiverKind) { toast.error(t("sitForm.pickWhoSCoveringThis", "Pick who's covering this sit.")); return; }
      if (caregiverKind === "household" && !householdUserId) { toast.error(t("sitForm.pickAHouseholdMember", "Pick a household member.")); return; }
      if (caregiverKind === "external" && !sitterEmail.trim()) { toast.error(t("sitForm.addTheSitterSEmail", "Add the sitter's email.")); return; }
    }
    setSaving(true);
    try {
      const birdIds = Array.from(selected);
      const [{ data: contacts, error: ecErr }, { data: u }] = await Promise.all([
        supabase
          .from("emergency_contacts")
          .select("bird_id, owner_phone, avian_vet_phone")
          .in("bird_id", birdIds),
        getLocalUser(),
      ]);
      if (ecErr) { toast.error(friendlyError(ecErr)); setSaving(false); return; }
      if (!u.user) { toast.error(t("sitForm.youReSignedOut", "You're signed out.")); setSaving(false); return; }
      // Emergency-contact preflight is for the external-sitter share — the
      // sitter has no other access, so the contacts must be on file before we
      // mint a link. A household caregiver already has bird access and the
      // contacts via existing membership; skip the gate for that path.
      const kind: CaregiverKind = editing ? (initialKind as CaregiverKind) : (caregiverKind as CaregiverKind);
      // Lead ("in charge") is DERIVED from the cover: a household cover IS the
      // lead; an external sitter leaves the owner (you) as responsible contact.
      // Never null (household path is validated to have a member above).
      const leadUserId: string = kind === "household" ? (householdUserId as string) : u.user.id;
      // Required emergency contacts (outside sitters only): the sitter has no
      // other way to reach you or the vet. On create they show in the reminder
      // sheet and block the sit; on edit, a message as before.
      let required: { birdId: string; needs: ("owner_phone" | "avian_vet_phone")[] } | null = null;
      if (kind === "external") {
        const { data: defaults } = await supabase
          .from("owner_emergency_defaults")
          .select("owner_phone, avian_vet_phone")
          .eq("owner_id", u.user.id)
          .maybeSingle();
        const contactByBird = new Map((contacts ?? []).map((c: any) => [c.bird_id, c]));
        const eff = (c: any, k: string) =>
          (c?.[k]?.trim?.() || (defaults as any)?.[k]?.trim?.() || "");
        const missing = birdIds
          .map((id) => {
            const c = contactByBird.get(id);
            const needs: ("owner_phone" | "avian_vet_phone")[] = [];
            if (!eff(c, "owner_phone")) needs.push("owner_phone");
            if (!eff(c, "avian_vet_phone")) needs.push("avian_vet_phone");
            return needs.length ? { birdId: id, bird: birds.find((b: any) => b.id === id), needs } : null;
          })
          .filter(Boolean) as { birdId: string; bird: any; needs: ("owner_phone" | "avian_vet_phone")[] }[];
        if (missing.length) {
          if (editing) {
            const label = (k: string) => (k === "owner_phone" ? t("sitForm.needYourPhone", "your phone") : t("sitForm.needAvianVetPhone", "avian vet phone"));
            const details = missing.map((m) => `${m.bird?.name ?? t("sitForm.bird", "Bird")}: ${m.needs.map(label).join(" & ")}`).join("; ");
            toast.error(
              t("sitForm.missingContacts", "Add the required emergency contacts before sharing a sitter link — {{details}}. Set account defaults below, or open the bird's Emergency tab.", { details }),
              { duration: 8000 },
            );
            setSaving(false);
            return;
          }
          required = { birdId: missing[0].birdId, needs: Array.from(new Set(missing.flatMap((m) => m.needs))) };
        }
      }

      // Soft reminder (create only): list what the plan is still missing and
      // let the owner fill it in or go ahead. A failed check never blocks a
      // sit on its own; missing required contacts always do.
      if (!editing && (required || !acceptGapsRef.current)) {
        let withGaps: { birdId: string; name: string; missing: SitGapSection[] }[] = [];
        try {
          const { birds: ready } = await sitReadiness({ data: { birdIds } });
          withGaps = ready
            .map((r) => ({ ...r, missing: required ? r.missing.filter((m) => m !== "emergency") : r.missing }))
            .filter((r) => r.missing.length > 0)
            .map((r) => ({ ...r, name: (birds.find((b: any) => b.id === r.birdId)?.name ?? "") as string }));
        } catch (err) {
          console.error("[sit] readiness check failed — continuing", err);
        }
        if (required || withGaps.length) {
          setGaps(withGaps);
          setRequiredMissing(required);
          setSaving(false);
          track("sit_gaps_shown", { bird_count: withGaps.length, caregiver_kind: kind, required_missing: !!required });
          return;
        }
      }
      acceptGapsRef.current = false;

      // External sits keep a token window ending at end-of-day on the end
      // date. Household sits have no token — token_expires_at stays null.
      const expires = new Date(end + "T23:59:59Z").toISOString();

      if (editing) {
        // PR 1: caregiver KIND is locked on edit (UI disables the picker too).
        // The fields that update depend on which kind this row already is:
        //   external → bird-set, dates, sitter_name/email + the token window.
        //   household → bird-set, dates only (sitter_* + token stay null per
        //               the sits_one_caregiver_chk constraint).
        const update: any = {
          title: title || null,
          start_date: start,
          end_date: end,
          notes: notes || null,
          lead_user_id: leadUserId,
        };
        if (kind === "external") {
          update.sitter_name = sitterName || null;
          update.sitter_email = sitterEmail || null;
          update.token_expires_at = expires;
        }
        const { error } = await supabase.from("sits").update(update).eq("id", editSit.id);
        if (error) { toast.error(friendlyError(error)); setSaving(false); return; }

        // Reconcile which birds the token grants access to.
        const cur = new Set(currentBirdIds.current);
        const toAdd = birdIds.filter((id) => !cur.has(id));
        const toRemove = currentBirdIds.current.filter((id) => !selected.has(id));
        if (toAdd.length) {
          const { error: addErr } = await supabase
            .from("sit_birds")
            .insert(toAdd.map((bird_id) => ({ sit_id: editSit.id, bird_id })));
          if (addErr) { toast.error(friendlyError(addErr)); setSaving(false); return; }
        }
        if (toRemove.length) {
          const { error: remErr } = await supabase
            .from("sit_birds")
            .delete()
            .eq("sit_id", editSit.id)
            .in("bird_id", toRemove);
          if (remErr) { toast.error(friendlyError(remErr)); setSaving(false); return; }
        }
        track("sit_edited", { bird_count: birdIds.length });
        // Notify the household caregiver only when the dates or the bird-set
        // actually changed (title/notes-only edits are noise). Await before the
        // toast so a send failure is surfaced.
        const datesChanged = start !== (editSit.start_date ?? "") || end !== (editSit.end_date ?? "");
        const birdsChanged = toAdd.length > 0 || toRemove.length > 0;
        const sitterLabel = sitterName?.trim() || sitterEmail || "the sitter";
        let updateFailedName: string | null = null;
        let sitterUpdateFailed = false;
        if (kind === "household" && (datesChanged || birdsChanged)) {
          try {
            const res = await notifyUpdated({ data: { sitId: editSit.id, datesChanged, birdsChanged } });
            if (!res?.emailed) { updateFailedName = res?.caregiverName ?? "your household member"; track("sit_caregiver_email_failed", { event: "updated", reason: res?.reason ?? "unknown" }); }
          } catch { updateFailedName = "your household member"; track("sit_caregiver_email_failed", { event: "updated", reason: "threw" }); }
        } else if (kind === "external" && (datesChanged || birdsChanged)) {
          // Same link, new details — tell the token sitter what changed. A no-op
          // server-side if the token is revoked/expired (reason surfaced).
          try {
            const res = await sendSitterUpdate({ data: { sitId: editSit.id, datesChanged, birdsChanged } });
            if (!res?.emailed) { sitterUpdateFailed = true; track("sitter_invite_email_failed", { event: "updated", reason: res?.reason ?? "unknown" }); }
          } catch { sitterUpdateFailed = true; track("sitter_invite_email_failed", { event: "updated", reason: "threw" }); }
        }
        if (updateFailedName) {
          toast.error(t("sitForm.updatedHouseholdEmailFailed", "Sit updated, but we couldn't email {{name}} the change. Let them know directly.", { name: updateFailedName }), { duration: 8000 });
        } else if (sitterUpdateFailed) {
          toast.error(t("sitForm.updatedSitterEmailFailed", "Sit updated, but we couldn't email {{name}} the change. The link still works — send them the new details.", { name: sitterLabel }), { duration: 10000 });
        } else {
          toast.success(t("sitForm.sitUpdated", "Sit updated."));
        }
        onSaved();
        navigate({ to: "/sits" });
      } else {
        // Insert shape depends on caregiver kind. The check constraint
        // sits_one_caregiver_chk requires EITHER (invite_token + no caregiver)
        // OR (caregiver_user_id + no token), so the household path explicitly
        // nulls the token columns to override the table default.
        const insert: any = {
          owner_id: u.user.id,
          title: title || null,
          start_date: start, end_date: end,
          notes: notes || null,
          status: "upcoming",
          lead_user_id: leadUserId,
        };
        if (kind === "external") {
          insert.sitter_name = sitterName || null;
          insert.sitter_email = sitterEmail || null;
          insert.token_expires_at = expires;
        } else {
          insert.caregiver_user_id = householdUserId;
          insert.invite_token = null;
          insert.token_expires_at = null;
          insert.sitter_name = null;
          insert.sitter_email = null;
        }
        const { data: sit, error } = await supabase.from("sits").insert(insert).select().single();
        if (error || !sit) { toast.error(friendlyError(error, t("sitForm.couldNotCreate", "Could not create sit."))); setSaving(false); return; }
        const rows = birdIds.map((bird_id) => ({ sit_id: sit.id, bird_id }));
        const { error: linkErr } = await supabase.from("sit_birds").insert(rows);
        if (linkErr) { toast.error(friendlyError(linkErr)); setSaving(false); return; }
        const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1);
        track("sit_created", { bird_count: birdIds.length, days, has_email: !!sitterEmail, caregiver_kind: kind });
        // Notify the household caregiver they're covering (await before the
        // toast/nav so a send failure is surfaced to the owner).
        const sitterLabel = sitterName?.trim() || sitterEmail || "the sitter";
        let assignFailedName: string | null = null;
        let sitterInviteFailed = false;
        if (kind === "household") {
          try {
            const res = await notifyAssigned({ data: { sitId: sit.id } });
            if (!res?.emailed) { assignFailedName = res?.caregiverName ?? "your household member"; track("sit_caregiver_email_failed", { event: "assigned", reason: res?.reason ?? "unknown" }); }
          } catch { assignFailedName = "your household member"; track("sit_caregiver_email_failed", { event: "assigned", reason: "threw" }); }
        } else {
          // External sit: email the token invite (the link they need). Distinct
          // from the caregiver path so the owner can tell sent from not-sent and
          // fall back to copying the link.
          try {
            const res = await sendSitterInvite({ data: { sitId: sit.id } });
            if (!res?.emailed) { sitterInviteFailed = true; track("sitter_invite_email_failed", { event: "created", reason: res?.reason ?? "unknown" }); }
          } catch { sitterInviteFailed = true; track("sitter_invite_email_failed", { event: "created", reason: "threw" }); }
        }
        if (assignFailedName) {
          toast.error(t("sitForm.createdHouseholdEmailFailed", "Sit created, but we couldn't email {{name}}. Let them know directly.", { name: assignFailedName }), { duration: 8000 });
        } else if (sitterInviteFailed) {
          const sitBirds = birdIds.map((id) => ({ id, name: (birds.find((b: any) => b.id === id)?.name ?? "") as string }));
          toast.error(t("sitForm.createdCopyLink", "Sit created. We couldn't email {{name}}, so copy the link and send it yourself.", { name: sitterLabel }), {
            duration: 15000,
            action: { label: t("sitForm.copyLink", "Copy link"), onClick: () => { void copySitterLink(sit as any, sitBirds); } },
          });
        } else {
          toast.success(
            kind === "household" ? t("sitForm.createdHousehold", "Sit created — your household member is set.") : t("sitForm.createdInviteSent", "Sit created — invite sent to {{name}}.", { name: sitterLabel }),
          );
        }
        onSaved();
        // Back to the Sits tab with the new sit's card at the top.
        navigate({ to: "/sits", search: { created: sit.id } });
      }
    } finally {
      setSaving(false);
    }
  }

  // Who's covering, for the notes heading and the button.
  const coverName: string | null =
    caregiverKind === "household"
      ? (() => { const m = eligibleMembers.find((x) => x.userId === householdUserId); return m ? firstNameOf(memberDisplayName(m)) : null; })()
      : caregiverKind === "external" && sitterName.trim() ? sitterName.trim() : null;
  const yourSitter = t("sitForm.yourSitterLower", "your sitter");
  const submitLabel = saving
    ? (editing ? t("sitForm.saving", "Saving...") : t("sitForm.creating", "Creating..."))
    : editing
      ? t("sitForm.saveChanges", "Save changes")
      : caregiverKind === "external"
        ? t("sitForm.createAndEmail", "Create sit and email {{name}}", { name: coverName ?? yourSitter })
        : t("sitForm.createSit", "Create sit");

  return (
    <form ref={rootRef} onSubmit={submit} noValidate className="setup-frame min-h-screen pb-nav" style={{ background: K.mist, color: K.forest }}>
      <div className="mx-auto max-w-md">
        <KyaHeader>
          <div className="mt-1.5">
            <KyaIconButton label={t("sitForm.close", "Close")} onClick={onClose}>
              <X className="size-5" />
            </KyaIconButton>
          </div>
          <KyaHeading as="h1" size={30} className="mt-4 text-white">{editing ? t("sitForm.editSit", "Edit sit") : t("sitForm.setUpASit", "Set up a sit")}</KyaHeading>
          <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>
            {t("sitForm.screenIntro", "Your sitter gets the daily routine, a daily health check, and one-tap emergency contacts.")}
          </p>
        </KyaHeader>

        <main className="relative -mt-[26px] flex flex-col gap-7 rounded-t-[26px] bg-white px-5 pb-8 pt-6">
          {/* 1. Which birds? */}
          <section>
            <Question>{t("sitForm.whichBirds", "Which birds?")}</Question>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {birds.map((b: any) => {
                const on = selected.has(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(b.id)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 px-4 text-[15px] font-[700]"
                    style={on ? { background: K.forest, borderColor: K.forest, color: "#fff" } : { background: "#fff", borderColor: "#d6dfd5", color: K.forest }}
                  >
                    {on && <Check className="size-4" strokeWidth={3} aria-hidden="true" />}
                    {b.name}
                  </button>
                );
              })}
              {birds.length > 1 && <KyaLink onClick={selectAll} className="px-1">{t("sitForm.selectAll", "Select all")}</KyaLink>}
            </div>
          </section>

          {/* 2. When? */}
          <section>
            <Question>{t("sitForm.when", "When?")}</Question>
            {/* min-w-0 lets the cells shrink; the global date-input reset
                (styles.css) keeps the native iOS control from overflowing. */}
            <div className="mt-3 grid grid-cols-2 items-start gap-3">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-[13.5px] font-[700]">{t("sitForm.starts", "Starts")}</span>
                <input className={PILL_FIELD} style={PILL_STYLE} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-[13.5px] font-[700]">{t("sitForm.ends", "Ends")}</span>
                <input className={PILL_FIELD} style={PILL_STYLE} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
          </section>

          {/* 3. Who's covering? */}
          <section>
            <Question>{t("sitForm.whosCoveringQ", "Who's covering?")}</Question>
            <Hint>{t("sitForm.coveringHint", "Household members already have access. Anyone else gets a private link, no account needed.")}</Hint>
            {editing ? (
              <div className="mt-3 flex flex-col gap-3">
                <p className="m-0 rounded-[16px] p-3.5 text-[14px] leading-[1.5]" style={{ background: K.mist }}>
                  {initialKind === "household"
                    ? t("sitForm.householdAssigned", "A household member is assigned. Swapping caregiver type isn't available yet — delete this sit and create a new one to change it.")
                    : t("sitForm.externalSitterHasLink", "An external sitter has the link. {{who}} is current; you can edit the name or email below.", { who: sitterName?.trim() || sitterEmail || theirInfo })}
                </p>
                {initialKind === "external" && (
                  <SitterFields name={sitterName} email={sitterEmail} onName={setSitterName} onEmail={setSitterEmail} />
                )}
              </div>
            ) : (
              <CaregiverPicker
                eligibleMembers={eligibleMembers}
                selectedBirdCount={selected.size}
                caregiverKind={caregiverKind}
                householdUserId={householdUserId}
                sitterName={sitterName}
                sitterEmail={sitterEmail}
                onPickHousehold={(id) => { setCaregiverKind("household"); setHouseholdUserId(id); }}
                onPickExternal={() => { setCaregiverKind("external"); setHouseholdUserId(null); }}
                onChangeSitterName={setSitterName}
                onChangeSitterEmail={setSitterEmail}
              />
            )}
          </section>

          {/* 4. Name this sit */}
          <section>
            <Question>{t("sitForm.nameThisSit", "Name this sit")}</Question>
            <Hint>{t("sitForm.nameHint", "Just for you, so you can find it later.")}</Hint>
            <input className={`${PILL_FIELD} mt-3`} style={PILL_STYLE} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("sitForm.namePlaceholder", "e.g. Thanksgiving trip")} aria-label={t("sitForm.nameThisSit", "Name this sit")} />
          </section>

          {/* 5. Anything else? */}
          <section>
            <Question>
              {coverName
                ? t("sitForm.anythingElseName", "Anything else {{name}} should know?", { name: coverName })
                : t("sitForm.anythingElseSitter", "Anything else your sitter should know?")}
            </Question>
            <Hint>{t("sitForm.notesHint", "Notes for this sit only. The care plan covers the everyday routine.")}</Hint>
            <textarea
              className="mt-3 min-h-[110px] w-full rounded-[18px] border-2 bg-white px-4 py-3 text-[16px] outline-none focus:border-[#1a3d2e]"
              style={PILL_STYLE}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("sitForm.notesPlaceholder", "e.g. The neighbor has a spare key.")}
              aria-label={t("sitForm.notesForThisSit", "Notes for this sit")}
            />
          </section>

          {/* Delete sit — edit mode only, gated by manage_sits (RLS enforces). */}
          {editing && canDelete && (
            <section>
              {confirmingDelete ? (
                <div className="rounded-[16px] p-3.5" style={{ background: "#fcebeb" }}>
                  {isActiveSit && (
                    <p className="m-0 mb-2 flex items-start gap-1.5 text-[14px] font-[700]" style={{ color: K.red }}>
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      {t("sitForm.activeSitDeleteWarning", "This sit is active right now — a sitter is covering. Deleting it ends their access immediately.")}
                    </p>
                  )}
                  <p className="m-0 text-[14px] leading-[1.5]">
                    {t("sitForm.deleteThisSitThisCan", "Delete this sit? This can't be undone. Its checklist and task completions are removed; logged scans, weights, and photos are kept but no longer tied to the sit.")}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={deleteSit} disabled={deleting} className="min-h-[48px] flex-1 rounded-full px-4 text-[15px] font-[700] text-white disabled:opacity-50" style={{ background: K.red }}>
                      {deleting ? t("sitForm.deleting", "Deleting…") : t("sitForm.deleteSit", "Delete sit")}
                    </button>
                    <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting} className="min-h-[48px] rounded-full border-2 bg-white px-5 text-[15px] font-[700] disabled:opacity-50" style={{ borderColor: K.forest, color: K.forest }}>{t("sitForm.keep", "Keep")}</button>
                  </div>
                </div>
              ) : (
                <KyaLink color={K.red} onClick={() => setConfirmingDelete(true)}>{t("sitForm.deleteSit", "Delete sit")}</KyaLink>
              )}
            </section>
          )}
        </main>
      </div>

      {/* Pinned footer */}
      {!gaps && (
        <div className="sticky z-10 border-t bg-white px-4 pb-3 pt-3" style={{ bottom: "var(--nav-spacer)", borderColor: K.line }}>
          <div className="mx-auto max-w-md">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700] disabled:opacity-45"
              style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
            >
              {submitLabel}
            </button>
          </div>
        </div>
      )}

      {gaps && (
        <BottomSheet onClose={() => { setGaps(null); setRequiredMissing(null); }}>
          <div className="flex flex-col gap-4" style={{ color: S.forest }}>
            <div>
              <h2 className="m-0 text-[28px] font-[700] leading-[1.1]" style={{ fontFamily: SERIF }}>
                {t("sitForm.gaps.title", "{{name}} will need a little more", { name: caregiverLabel() })}
              </h2>
              <p className="m-0 mt-2 text-[15.5px] leading-[1.5]" style={{ color: S.helper }}>
                {gapBirdCount() > 3
                  ? t("sitForm.gaps.bodyCount", "{{count}} birds' plans are missing a few things a sitter leans on.", { count: gapBirdCount() })
                  : gapBirdCount() > 1
                  ? t("sitForm.gaps.bodyMany", "{{names}}'s plans are missing a few things a sitter leans on.", { names: gapBirdNames() })
                  : t("sitForm.gaps.body", "{{names}}'s plan is missing a few things a sitter leans on.", { names: gapBirdNames() })}
              </p>
            </div>

            {requiredMissing && (
              <div className="flex flex-col gap-2.5 rounded-[18px] p-3.5" style={{ background: S.lime }}>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="m-0 text-[15px] font-[700]">{t("sitForm.gaps.neededBefore", "Needed before you can create a sit")}</p>
                  <Tag kind="required" />
                </div>
                <div className="flex items-center gap-3 rounded-[14px] bg-white px-3.5 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-[700]">{t("planOverview.rowEmergencyContacts", "Emergency contacts")}</span>
                    <span className="block text-[14px]" style={{ color: S.helper }}>
                      {requiredMissing.needs.length === 2
                        ? t("sitForm.gaps.needBoth", "Your phone number and your avian vet's phone")
                        : requiredMissing.needs[0] === "owner_phone"
                          ? t("sitForm.gaps.needOwnerPhone", "Your phone number")
                          : t("sitForm.gaps.needVetPhone", "Your avian vet's phone")}
                    </span>
                  </span>
                  <SetupTextButton onClick={() => openGap(requiredMissing.birdId, "emergency")}>{t("sitForm.gaps.add", "Add")}</SetupTextButton>
                </div>
              </div>
            )}

            {gaps.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-[13px] font-[700]" style={{ color: S.quiet }}>{t("sitForm.gaps.goodToAdd", "Good to add when you can")}</p>
                {gaps.flatMap((g) => g.missing.map((m) => (
                  <div key={`${g.birdId}-${m}`} className="flex items-center gap-3 rounded-[14px] px-3.5 py-3" style={{ background: S.card }}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-[700]">
                        {gaps.length > 1 ? `${g.name} · ${gapLabel(t, m)}` : gapLabel(t, m)}
                      </span>
                      <span className="block text-[14px]" style={{ color: S.helper }}>{gapDetail(t, m, g.name)}</span>
                    </span>
                    <SetupTextButton onClick={() => openGap(g.birdId, m)}>{t("sitForm.gaps.add", "Add")}</SetupTextButton>
                  </div>
                )))}
              </div>
            )}

            <div className="flex flex-col gap-2.5">
              <SetupPrimaryButton
                arrow={false}
                onClick={() => {
                  track("sit_gaps_choice", { choice: "fill_in" });
                  if (requiredMissing) openGap(requiredMissing.birdId, "emergency");
                  else if (gaps[0]) openGap(gaps[0].birdId, gaps[0].missing[0]);
                }}
              >
                {t("sitForm.gaps.fillIn", "Fill these in")}
              </SetupPrimaryButton>
              <SetupSecondaryButton
                disabled={saving || !!requiredMissing}
                onClick={() => {
                  track("sit_gaps_choice", { choice: "create_anyway" });
                  acceptGapsRef.current = true;
                  setGaps(null);
                  rootRef.current?.requestSubmit();
                }}
              >
                {t("sitForm.gaps.createAnyway", "Create the sit anyway")}
              </SetupSecondaryButton>
              {requiredMissing && (
                <p className="m-0 text-center text-[14px]" style={{ color: S.helper }}>
                  {t("sitForm.gaps.addContactsFirst", "Add your emergency contacts to create the sit.")}
                </p>
              )}
            </div>
          </div>
        </BottomSheet>
      )}
    </form>
  );
}

const PILL_FIELD = "h-12 w-full min-w-0 rounded-full border-2 bg-white px-[18px] text-[16px] outline-none focus:border-[#1a3d2e]";
const PILL_STYLE = { borderColor: "#d6dfd5", color: K.forest } as const;

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

function Question({ children }: { children: React.ReactNode }) {
  return <h2 className="m-0 text-[20px] font-[700] leading-[1.2]" style={{ fontFamily: SERIF }}>{children}</h2>;
}
function Hint({ children }: { children: React.ReactNode }) {
  return <p className="m-0 mt-1 text-[14px] leading-[1.45]" style={{ color: K.quiet }}>{children}</p>;
}

function SitterFields({ name, email, onName, onEmail }: { name: string; email: string; onName: (v: string) => void; onEmail: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="mb-1.5 block text-[13.5px] font-[700]">{t("sitForm.sittersName", "Sitter's name")}</span>
        <input className={PILL_FIELD} style={PILL_STYLE} value={name} onChange={(e) => onName(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[13.5px] font-[700]">{t("sitForm.sittersEmail", "Sitter's email")}</span>
        <input className={PILL_FIELD} style={PILL_STYLE} type="email" value={email} onChange={(e) => onEmail(e.target.value)} placeholder={t("sitForm.sitterExampleCom", "sitter@example.com")} />
      </label>
    </div>
  );
}

// Where each missing section is filled in (the care plan editor's tabs).
const GAP_TAB: Record<SitGapSection, string> = {
  food: "food", health: "health", personality: "behavior", day: "routine", environment: "home", emergency: "emergency",
};
function gapLabel(t: (k: string, d: string) => string, m: SitGapSection): string {
  switch (m) {
    case "food": return t("planEditor.tabFood", "Food");
    case "health": return t("planEditor.tabHealth", "Health");
    case "personality": return t("planEditor.tabBehavior", "Behavior");
    case "day": return t("planOverview.rowDay", "Day");
    case "environment": return t("planOverview.rowReminders", "Reminders for your sitter");
    case "emergency": return t("planOverview.rowEmergencyContacts", "Emergency contacts");
  }
}

/** What a sitter misses when a section is empty, for the reminder sheet. */
function gapDetail(t: TFunction, m: SitGapSection, name: string): string {
  switch (m) {
    case "food": return t("sitForm.gaps.detailFood", "What {{name}} eats and how much", { name });
    case "health": return t("sitForm.gaps.detailHealth", "Weight, medications, and when to call", { name });
    case "personality": return t("sitForm.gaps.detailBehavior", "Handling, likes, and {{name}}'s space", { name });
    case "day": return t("sitForm.gaps.detailDay", "{{name}}'s daily tasks", { name });
    case "environment": return t("sitForm.gaps.detailReminders", "Hazards, off-limits areas, and cleaning", { name });
    case "emergency": return t("sitForm.gaps.detailEmergency", "Your phone and your avian vet", { name });
  }
}

// "Who's covering?" — one option card per household member who can see every
// picked bird, then "Someone else". Picking one is exclusive; "Someone else"
// shows the sitter's name and email underneath.
function CaregiverPicker({
  eligibleMembers, selectedBirdCount,
  caregiverKind, householdUserId,
  sitterName, sitterEmail,
  onPickHousehold, onPickExternal,
  onChangeSitterName, onChangeSitterEmail,
}: {
  eligibleMembers: { userId: string; name: string | null; email: string | null }[];
  selectedBirdCount: number;
  caregiverKind: "household" | "external" | null;
  householdUserId: string | null;
  sitterName: string;
  sitterEmail: string;
  onPickHousehold: (id: string) => void;
  onPickExternal: () => void;
  onChangeSitterName: (v: string) => void;
  onChangeSitterEmail: (v: string) => void;
}) {
  const { t } = useTranslation();
  if (selectedBirdCount === 0) {
    return <p className="m-0 mt-3 text-[14px]" style={{ color: K.quiet }}>{t("sitForm.pickABirdAboveFirst", "Pick a bird above first.")}</p>;
  }
  const externalOn = caregiverKind === "external";
  return (
    <div className="mt-3 flex flex-col gap-2.5" role="radiogroup" aria-label={t("sitForm.whosCoveringQ", "Who's covering?")}>
      {eligibleMembers.map((m) => {
        const on = caregiverKind === "household" && householdUserId === m.userId;
        const display = memberDisplayName(m);
        return (
          <OptionCard key={m.userId} on={on} onClick={() => onPickHousehold(m.userId)}
            leading={<span className="grid size-11 shrink-0 place-items-center rounded-full text-[15px] font-[700] text-white" style={{ background: K.forest }}>{memberInitials(display)}</span>}
            title={display}
            detail={t("sitForm.household", "Household")}
          />
        );
      })}
      <OptionCard on={externalOn} onClick={onPickExternal}
        leading={<span className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: K.lime, color: K.forest }}><Mail className="size-5" aria-hidden="true" /></span>}
        title={t("sitForm.someoneElse", "Someone else")}
        detail={t("sitForm.weEmailThemALink", "We'll email them a link")}
      />
      {externalOn && (
        <div className="mt-1.5">
          <SitterFields name={sitterName} email={sitterEmail} onName={onChangeSitterName} onEmail={onChangeSitterEmail} />
        </div>
      )}
    </div>
  );
}

function OptionCard({ on, onClick, leading, title, detail }: { on: boolean; onClick: () => void; leading: React.ReactNode; title: string; detail: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className="flex min-h-[68px] w-full items-center gap-3 rounded-[18px] border-2 px-3.5 py-2.5 text-left"
      style={on ? { borderColor: K.forest, background: K.mist, color: K.forest } : { borderColor: "#d6dfd5", background: "#fff", color: K.forest }}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-[700]">{title}</span>
        <span className="block text-[13px]" style={{ color: K.quiet }}>{detail}</span>
      </span>
      <span className="grid size-6 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: on ? K.forest : "#b9c7ba" }} aria-hidden="true">
        {on && <span className="size-3 rounded-full" style={{ background: K.forest }} />}
      </span>
    </button>
  );
}
