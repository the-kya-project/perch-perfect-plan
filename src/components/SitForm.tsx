import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation, Trans } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
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
import { Feather, Plus, Mail, Check, Users, Trash2, AlertTriangle } from "lucide-react";
import { friendlyError } from "@/lib/errorMessage";
import { localDateISO } from "@/lib/localDay";

// Create OR edit a sit. In edit mode (`editSit` set) it preserves the existing
// invite_token — the same sitter link keeps working; editing changes what it
// grants (dates → access window, and which birds are included), not the link.
export function SitForm({
  birds,
  onSaved,
  initialOpen = false,
  preselectBirdId,
  activeSit,
  editSit,
  onCancel,
  returnTo = "/dashboard",
  hidePrompt = false,
}: {
  birds: any[];
  onSaved: () => void;
  initialOpen?: boolean;
  preselectBirdId?: string;
  activeSit?: any;
  editSit?: any;
  onCancel?: () => void;
  // Where to clear the ?newSit param back to after opening (the screen hosting
  // the form). Defaults to /dashboard for back-compat.
  returnTo?: string;
  // Suppress the closed-state "New sit / Going away?" prompt card when the host
  // screen already provides the open CTA (e.g. the Sits tab hero button).
  hidePrompt?: boolean;
}) {
  const { t } = useTranslation();
  const theirInfo = t("sitForm.theirInfo", "Their info");
  const editing = !!editSit;
  const navigate = useNavigate();
  const [open, setOpen] = useState(initialOpen || editing);

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
    onCancel?.();   // close the form
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

  // Create-only: opens the form when ?newSit is set, then clears the param.
  // Keyed on initialOpen (not just mount) so it also fires when the param flips
  // true while the dashboard is already mounted — e.g. the checklist's "Create
  // your first sit", which links to /dashboard?newSit while already there.
  useEffect(() => {
    if (initialOpen && !editing) {
      setOpen(true);
      navigate({ to: returnTo, search: {}, replace: true } as any);
      // The form can be below the fold on the dashboard — bring it into view.
      setTimeout(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpen]);

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
        onCancel?.();
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
          toast.error(t("sitForm.createdSitterEmailFailed", "Sit created, but we couldn't email {{name}} the invite. Open the sit and copy the link to send it yourself.", { name: sitterLabel }), { duration: 10000 });
        } else {
          toast.success(
            kind === "household" ? t("sitForm.createdHousehold", "Sit created — your household member is set.") : t("sitForm.createdInviteSent", "Sit created — invite sent to {{name}}.", { name: sitterLabel }),
          );
        }
        setOpen(false);
        setTitle(""); setSitterName(""); setSitterEmail(""); setStart(""); setEnd(""); setNotes("");
        setCaregiverKind(null); setHouseholdUserId(null);
        setSelected(new Set(birds.length === 1 ? [birds[0].id] : []));
        onSaved();
        // Land the owner on the Sits tab, where the sit they just created is
        // the focal element — not back on Home. (No-op when already on /sits.)
        navigate({ to: "/sits" });
      }
    } finally {
      setSaving(false);
    }
  }

  // Closed prompt (create mode only).
  if (!open && !editing) {
    if (hidePrompt) return null;
    if (activeSit) {
      return (
        <div className="rounded-[20px] bg-[#cdeab0] p-5">
          <p className="text-lg font-medium text-[#1f3d12]">{t("sitForm.sitActive", "Sit active")}</p>
          <p className="mt-1 text-sm text-[#3f5e22]">{t("sitForm.aSitIsUnderwayRight", "A sit is underway right now. Your sitter has their private link.")}</p>
          <button onClick={() => setOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">
            <Plus className="size-4" /> {t("sitForm.newSit", "New sit")}
          </button>
        </div>
      );
    }
    return (
      <div className="relative overflow-hidden rounded-[20px] bg-[#cdeab0] p-5">
        <Feather className="pointer-events-none absolute -right-3 -top-3 size-20 rotate-12 text-[#1f3d12]/10" />
        <p className="text-lg font-medium text-[#1f3d12]">{t("sitForm.goingAwaySoon", "Going away soon?")}</p>
        <p className="mt-1 max-w-[18rem] text-sm text-[#3f5e22]">{t("sitForm.createASitAndSend", "Create a sit and send your sitter a private link with everything they need.")}</p>
        <button onClick={() => setOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">
          <Plus className="size-4" /> {t("sitForm.newSit", "New sit")}
        </button>
      </div>
    );
  }

  return (
    <form ref={rootRef} onSubmit={submit} noValidate className="space-y-3 rounded-[20px] bg-[#efe9da] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#1a3d2e]">{editing ? t("sitForm.editSit", "Edit sit") : t("sitForm.newSit", "New sit")}</p>
        <button type="button" onClick={() => (editing ? onCancel?.() : setOpen(false))} className="text-xs text-[#5f5e5a] underline">{t("sitForm.cancel", "Cancel")}</button>
      </div>

      <div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">{t("sitForm.sitName", "Sit name")}</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("sitForm.eGJuneVacation", "e.g. June vacation")} />
        </label>
        <p className="mt-1 text-[11px] text-[#8a897f]">{t("sitForm.aLabelToRecognizeThis", "A label to recognize this sit, e.g. June vacation, August work trip.")}</p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">{t("sitForm.birdsIncluded", "Birds included")}</p>
          {birds.length > 1 && (
            <button type="button" onClick={selectAll} className="text-[11px] font-medium text-[#1a3d2e] underline">{t("sitForm.selectAll", "Select all")}</button>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {birds.map((b: any) => {
            const on = selected.has(b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => toggle(b.id)}
                className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-sm ${on ? "border-[#2d6a4f] bg-[#e8f0ec]" : "border-[#e0d8c4] bg-white"}`}
              >
                <span className={`grid size-4 shrink-0 place-items-center rounded border-2 ${on ? "border-[#2d6a4f] bg-[#2d6a4f]" : "border-[#bcb6a3]"}`}>
                  {on && <svg viewBox="0 0 20 20" className="size-3 text-white"><path fill="currentColor" d="M7.629 13.314 4.4 10.085l1.214-1.214 2.015 2.015 5.757-5.757 1.214 1.214z"/></svg>}
                </span>
                <span className="truncate text-[#1a3d2e]">{b.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Two equal columns, top-aligned. min-w-0 lets the cells shrink to the
          column; the global input[type=date] appearance reset (styles.css) stops
          the native iOS date control from overflowing/overlapping. */}
      <div className="grid grid-cols-2 items-start gap-3">
        <div className="min-w-0"><Field label={t("sitForm.start", "Start")}><input className="input min-w-0" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field></div>
        <div className="min-w-0"><Field label={t("sitForm.end", "End")}><input className="input min-w-0" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field></div>
      </div>

      {/* Who's covering — household member (no token, already has access) OR
          an external sitter (the existing per-trip link flow). Edit mode keeps
          the row's existing kind (PR 1 doesn't swap caregiver type yet). */}
      {editing ? (
        <div className="rounded-[14px] border border-[#e0d8c4] bg-white p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">{t("sitForm.whoSCovering", "Who's covering")}</p>
          <p className="mt-1 text-[13px] text-[#1a3d2e]">
            {initialKind === "household"
              ? t("sitForm.householdAssigned", "A household member is assigned. Swapping caregiver type isn't available yet — delete this sit and create a new one to change it.")
              : t("sitForm.externalSitterHasLink", "An external sitter has the link. {{who}} is current; you can edit the name or email below.", { who: sitterName?.trim() || sitterEmail || theirInfo })}
          </p>
          {initialKind === "external" && (
            <div className="mt-2 space-y-2">
              <Field label={t("sitForm.sitterName", "Sitter name")}><input className="input" value={sitterName} onChange={(e) => setSitterName(e.target.value)} /></Field>
              <Field label={t("sitForm.sitterEmail", "Sitter email")}><input className="input" type="email" value={sitterEmail} onChange={(e) => setSitterEmail(e.target.value)} /></Field>
            </div>
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

      <Field label={t("sitForm.notesForThisSit", "Notes for this sit")}><textarea className="input area" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

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

      {!gaps && <button type="submit" disabled={saving} className="w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white disabled:opacity-50">
        {saving
          ? (editing ? t("sitForm.saving", "Saving...") : t("sitForm.creating", "Creating..."))
          : editing
            ? t("sitForm.saveChanges", "Save changes")
            : caregiverKind === "household" ? t("sitForm.createSit", "Create sit") : t("sitForm.createSitAndLink", "Create sit & generate link")}
      </button>}

      {/* Delete sit — edit mode only, gated by manage_sits (RLS enforces). */}
      {editing && canDelete && (
        <div className="border-t border-[#e0d8c4] pt-3">
          {confirmingDelete ? (
            <div className="rounded-[12px] bg-[var(--red-fill)] p-3 ring-1 ring-[var(--red-deep)]/15">
              {isActiveSit && (
                <p className="mb-2 flex items-start gap-1.5 text-[13px] font-[500] text-[var(--red-deep)]">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {t("sitForm.activeSitDeleteWarning", "This sit is active right now — a sitter is covering. Deleting it ends their access immediately.")}
                </p>
              )}
              <p className="text-[13px] text-[#1a3d2e]">
                {t("sitForm.deleteThisSitThisCan", "Delete this sit? This can't be undone. Its checklist and task completions are removed; logged scans, weights, and photos are kept but no longer tied to the sit.")}
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={deleteSit} disabled={deleting} className="min-h-[44px] flex-1 rounded-[12px] bg-[var(--red-deep)] px-4 text-sm font-[600] text-white disabled:opacity-50">
                  {deleting ? t("sitForm.deleting", "Deleting…") : t("sitForm.deleteSit", "Delete sit")}
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting} className="min-h-[44px] rounded-[12px] border border-[#c8bfa6] px-4 text-sm font-[500] text-[#5f5e5a] disabled:opacity-50">{t("sitForm.keep", "Keep")}</button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} className="inline-flex min-h-[44px] items-center gap-2 text-sm font-[500] text-[var(--red-deep)]">
              <Trash2 className="size-4" /> {t("sitForm.deleteSit", "Delete sit")}
            </button>
          )}
        </div>
      )}
    </form>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">{label}</span>
      {children}
    </label>
  );
}

// "Who's covering" — household member cards (filtered to people on every
// selected bird) above an "or" divider and the external-sitter expander. Picks
// are mutually exclusive: choosing a household member collapses the external
// fields; opening external clears any household selection.
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
  const noBirdsPicked = selectedBirdCount === 0;
  const noEligible = !noBirdsPicked && eligibleMembers.length === 0;
  return (
    <div className="space-y-3 rounded-[14px] border border-[#e0d8c4] bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">{t("sitForm.whoSCovering", "Who's covering")}</p>

      {noBirdsPicked ? (
        <p className="text-[13px] text-[#5f5e5a]">{t("sitForm.pickABirdAboveFirst", "Pick a bird above first.")}</p>
      ) : noEligible ? (
        <div className="rounded-[10px] bg-[#f4f1e8] p-3 text-[13px] text-[#5f5e5a]">
          <Trans i18nKey="sitForm.noHouseholdYet" defaults="No household yet — <1>invite someone</1> or send a link to a sitter below." components={{ 1: <Link to="/household" className="underline" /> }} />
        </div>
      ) : (
        <div className="space-y-2">
          {eligibleMembers.map((m) => {
            const on = caregiverKind === "household" && householdUserId === m.userId;
            const display = memberDisplayName(m);
            const initial = memberInitials(display);
            return (
              <button
                key={m.userId}
                type="button"
                onClick={() => onPickHousehold(m.userId)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-[12px] border p-3 text-left active:scale-[0.99] ${
                  on ? "border-[#2d6a4f] bg-[#e8f0ec] ring-1 ring-[#2d6a4f]" : "border-[#e0d8c4] bg-white"
                }`}
              >
                <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-medium ${on ? "bg-[#1a3d2e] text-white" : "bg-[#cfe3dc] text-[#1a5e3f]"}`}>{initial}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-[#1a3d2e]">{display}</span>
                    <span className="shrink-0 rounded-full bg-[#cfe3dc] px-2 py-0.5 text-[10px] font-medium text-[#1a5e3f]">{t("sitForm.household", "Household")}</span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-[#5f5e5a]">{t("sitForm.alreadyHasAccessTheyLl", "Already has access · they'll see the daily checklist while you're away.")}</span>
                </span>
                {on && <Check className="size-4 shrink-0 text-[#2d6a4f]" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 py-1 text-[11px] uppercase tracking-widest text-[#8a897f]">
        <span className="h-px flex-1 bg-[#e0d8c4]" /> {t("sitForm.or", "or")} <span className="h-px flex-1 bg-[#e0d8c4]" />
      </div>

      {caregiverKind === "external" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-[#5f5e5a]" />
            <p className="flex-1 text-[13px] font-medium text-[#1a3d2e]">{t("sitForm.sendALinkToSomeone", "Send a link to someone else")}</p>
          </div>
          <Field label={t("sitForm.sitterName", "Sitter name")}><input className="input" value={sitterName} onChange={(e) => onChangeSitterName(e.target.value)} /></Field>
          <Field label={t("sitForm.sitterEmail", "Sitter email")}><input className="input" type="email" value={sitterEmail} onChange={(e) => onChangeSitterEmail(e.target.value)} placeholder={t("sitForm.sitterExampleCom", "sitter@example.com")} /></Field>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPickExternal}
          className="flex w-full items-center gap-3 rounded-[12px] border border-dashed border-[#c8bfa6] bg-[#fbfaf2] p-3 text-left active:scale-[0.99]"
        >
          <Mail className="size-4 shrink-0 text-[#5f5e5a]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium text-[#1a3d2e]">{t("sitForm.sendALinkToSomeone", "Send a link to someone else")}</span>
            <span className="mt-0.5 block text-[11.5px] text-[#5f5e5a]">{t("sitForm.anEmailAPerTrip", "An email + a per-trip link, no account needed.")}</span>
          </span>
          <Users className="size-4 shrink-0 text-[#8a897f]" aria-hidden />
        </button>
      )}
    </div>
  );
}
