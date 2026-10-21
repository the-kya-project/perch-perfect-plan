import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { toast } from "sonner";
import { Check, Eye, Loader2 } from "lucide-react";
import {
  removeHouseholdMember, removeHouseholdMemberEverywhere, addExistingHouseholdMember,
} from "@/lib/household.functions";
import { supabase } from "@/integrations/supabase/client";
import { CAPABILITIES, presetForCapabilities, type Capability } from "@/lib/capabilities";
import { friendlyError } from "@/lib/errorMessage";
import { formatLocalDate } from "@/lib/dates";
import { memberDisplayName, memberInitials } from "@/lib/memberDisplay";
import { K, KyaSheet, KyaHeading, KyaSwitch, KyaLink } from "@/components/kya";
import { useConfirm } from "@/components/ConfirmSheet";

export type HouseholdAccountMember = {
  userId: string; name: string | null; email: string | null;
  birdIds: string[]; birdNames: string[]; scope: "all" | "scoped"; since: string;
};

/** Plain switch labels, each matched to what the capability actually gates
 *  (RLS in supabase/migrations/20260626160000_capability_write_policies.sql and
 *  later, plus the useCapability() call sites). */
export function capabilitySwitchLabel(c: Capability): string {
  switch (c) {
    // weight_entries, photo_logs, task_completions (sit checklist ticks)
    case "log_daily_care": return i18next.t("household.capLogDailyCare", "Log weights and daily tasks");
    // daily_logs (the daily health scan) and journal_entries + attachments
    case "record_health": return i18next.t("household.capRecordHealthCheck", "Run daily checks and write journal entries");
    // care_plans, routine_tasks
    case "edit_care_plans": return i18next.t("household.capEditCarePlans", "Edit care plans");
    // emergency_contacts
    case "manage_emergency": return i18next.t("household.capManageEmergency", "Edit emergency info");
    // sits DELETE only — creating and editing a sit stays owner-only
    case "manage_sits": return i18next.t("household.capManageSits", "Delete sits");
    // birds update/delete (identity, basic info), handoffs
    case "manage_flock": return i18next.t("household.capManageFlock", "Edit, hand off and delete birds");
    // bird_members + household_invites writes
    case "manage_household": return i18next.t("household.capManageHousehold", "Invite and manage household members");
  }
}

/** Short lowercase phrase for the member row summary ("can log weights and edit care plans"). */
function capabilityShort(c: Capability): string {
  switch (c) {
    case "log_daily_care": return i18next.t("household.capShortLogDailyCare", "log weights");
    case "record_health": return i18next.t("household.capShortRecordHealthCheck", "run daily checks");
    case "edit_care_plans": return i18next.t("household.capShortEditCarePlans", "edit care plans");
    case "manage_emergency": return i18next.t("household.capShortManageEmergency", "edit emergency info");
    case "manage_sits": return i18next.t("household.capShortManageSits", "delete sits");
    case "manage_flock": return i18next.t("household.capShortManageFlock", "manage birds");
    case "manage_household": return i18next.t("household.capShortManageHousehold", "manage the household");
  }
}

/** "can see everything", "full access", "can log weights and edit care plans",
 *  or "can log weights, edit care plans and more". */
export function capabilitySummary(caps: readonly string[]): string {
  const held = CAPABILITIES.filter((c) => caps.includes(c));
  if (held.length === 0) return i18next.t("household.capSummaryNone", "can see everything");
  if (held.length === CAPABILITIES.length) return i18next.t("household.capSummaryAll", "full access");
  const parts = held.map(capabilityShort);
  if (parts.length === 1) return i18next.t("household.capSummaryOne", "can {{a}}", { a: parts[0] });
  if (parts.length === 2) return i18next.t("household.capSummaryTwo", "can {{a}} and {{b}}", { a: parts[0], b: parts[1] });
  return i18next.t("household.capSummaryMore", "can {{a}}, {{b}} and more", { a: parts[0], b: parts[1] });
}

export function MemberAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-[700]"
      style={{ width: size, height: size, background: K.paleGreen, color: K.forest, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {memberInitials(name)}
    </span>
  );
}

// Manage one household member: which birds they help with (grant via
// addExistingHouseholdMember, revoke via removeHouseholdMember — unchecking the
// LAST bird confirms and removes them from the household), what they can do
// (household_member_permissions, saved per switch), or remove them entirely.
export function HouseholdMemberSheet({ member, allBirds, ownerId, storedCaps, onClose, onChanged, onCapsSaved }: {
  member: HouseholdAccountMember;
  allBirds: { id: string; name: string }[];
  ownerId: string | null;
  /** Their stored capabilities, or null while still loading. No row = none. */
  storedCaps: string[] | null;
  onClose: () => void;
  onChanged: () => void;
  onCapsSaved: (caps: Capability[], preset: string) => void;
}) {
  const { t } = useTranslation();
  const removeOne = useServerFn(removeHouseholdMember);
  const removeAll = useServerFn(removeHouseholdMemberEverywhere);
  const { confirm, sheet: confirmSheet } = useConfirm();
  const addOne = useServerFn(addExistingHouseholdMember);
  const has = new Set(member.birdIds);
  const display = memberDisplayName(member);
  const label = member.name?.trim() || member.email || t("household.thisMember", "this member");
  const since = formatLocalDate(new Date(member.since), { month: "long", year: "numeric" });

  // Optimistic per-bird overrides so a chip paints immediately. A key is
  // dropped on failure, which reverts the chip to `has` (server truth). On
  // success it's kept until onChanged's refetch lands, avoiding a flicker.
  const [pendingBird, setPendingBird] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const hasAccess = (id: string) => optimistic[id] ?? has.has(id);
  const accessCount = allBirds.filter((b) => hasAccess(b.id)).length;

  // Optimistic capability set; null = show what's stored.
  const [draftCaps, setDraftCaps] = useState<Capability[] | null>(null);
  const [savingCaps, setSavingCaps] = useState(false);
  const caps: Capability[] = draftCaps ?? ((storedCaps ?? []).filter((c): c is Capability => (CAPABILITIES as readonly string[]).includes(c)));

  const removeEverywhere = useMutation({
    mutationFn: () => removeAll({ data: { userId: member.userId } }),
    onSuccess: () => { toast.success(t("household.removedToast", "{{name}} removed from your household.", { name: label })); onChanged(); onClose(); },
    onError: (e: any) => toast.error(friendlyError(e, t("household.couldNotRemove", "Couldn't remove."))),
  });

  async function toggleBird(bird: { id: string; name: string }) {
    if (pendingBird || removeEverywhere.isPending) return;
    const granting = !hasAccess(bird.id);
    // Unchecking the only bird they can help with removes them from the
    // household — same confirm and same server call as before.
    if (!granting && accessCount === 1) {
      const yes = await confirm({
        title: t("household.confirmRemoveTitle", "Remove {{name}} from your household?", { name: label }),
        body: t("household.confirmLastBirdBody", "{{bird}} is the only bird {{name}} can help with, so removing it takes them out of your household.", { bird: bird.name, name: label }),
        confirmLabel: t("household.removeConfirmLabel", "Remove"),
      });
      if (yes) removeEverywhere.mutate();
      return;
    }
    setPendingBird(bird.id);
    setOptimistic((o) => ({ ...o, [bird.id]: granting }));
    try {
      const data = { birdId: bird.id, userId: member.userId };
      await (granting ? addOne({ data }) : removeOne({ data }));
      onChanged();
    } catch (e: any) {
      setOptimistic((o) => { const n = { ...o }; delete n[bird.id]; return n; });
      toast.error(friendlyError(e, t("household.couldNotUpdate", "Couldn't update.")));
    } finally {
      setPendingBird(null);
    }
  }

  async function toggleCap(c: Capability, on: boolean) {
    if (!ownerId || savingCaps || storedCaps === null) return;
    const prev = draftCaps;
    const next = CAPABILITIES.filter((x) => (x === c ? on : caps.includes(x)));
    const preset = presetForCapabilities(next);
    setDraftCaps(next);
    setSavingCaps(true);
    try {
      const { error } = await supabase.from("household_member_permissions").upsert(
        { owner_id: ownerId, member_user_id: member.userId, capabilities: next, preset } as any,
        { onConflict: "owner_id,member_user_id" },
      );
      if (error) throw error;
      onCapsSaved(next, preset);
    } catch (e: any) {
      setDraftCaps(prev);
      toast.error(friendlyError(e, t("household.couldNotSaveCaps", "Couldn't save that change.")));
    } finally {
      setSavingCaps(false);
    }
  }

  const busy = !!pendingBird || removeEverywhere.isPending;
  const capsDisabled = savingCaps || storedCaps === null || !ownerId || removeEverywhere.isPending;
  const closeLabel = t("household.close", "Close");

  return (
    <KyaSheet
      onClose={onClose}
      closeLabel={closeLabel}
      title={<MemberAvatar name={display} size={52} />}
    >
      <KyaHeading size={24}>{display}</KyaHeading>
      <p className="m-0 mt-1 text-[14px]" style={{ color: K.quiet }}>
        {t("household.householdSince", "Household since {{month}}", { month: since })}
      </p>

      <KyaHeading as="h3" size={18} className="mt-6">{t("household.whichBirds", "Which birds?")}</KyaHeading>
      <div className="mt-3 flex flex-wrap gap-2">
        {allBirds.map((b) => {
          const on = hasAccess(b.id);
          return (
            <button
              key={b.id}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => toggleBird(b)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 px-4 text-[15px] font-[700] active:scale-[0.98] disabled:opacity-60"
              style={on
                ? { background: K.forest, borderColor: K.forest, color: "#fff" }
                : { background: "#fff", borderColor: "#d5dfd5", color: K.forest }}
            >
              {pendingBird === b.id
                ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                : on ? <Check className="size-4" aria-hidden="true" /> : null}
              {b.name}
            </button>
          );
        })}
      </div>

      <KyaHeading as="h3" size={18} className="mt-6">{t("household.whatCanTheyDo", "What can they do?")}</KyaHeading>
      <div className="mt-3 rounded-[16px] px-4" style={{ background: K.mist }}>
        <div className="flex min-h-[52px] items-center gap-3 py-2" style={{ borderBottom: `1px solid ${K.line}` }}>
          <Eye className="size-[18px] shrink-0" style={{ color: K.moss }} aria-hidden="true" />
          <span className="flex-1 text-[15px]" style={{ color: K.ink }}>
            {t("household.alwaysSeeEverything", "They can always see everything")}
          </span>
        </div>
        {CAPABILITIES.map((c, i) => {
          const text = capabilitySwitchLabel(c);
          return (
            <div
              key={c}
              className="flex min-h-[52px] items-center gap-3 py-1"
              style={{ borderBottom: i === CAPABILITIES.length - 1 ? undefined : `1px solid ${K.line}` }}
            >
              <span className="flex-1 text-[15px] font-[700]">{text}</span>
              <KyaSwitch checked={caps.includes(c)} onChange={(v) => toggleCap(c, v)} label={text} disabled={capsDisabled} />
            </div>
          );
        })}
      </div>
      <p className="m-0 mt-3 px-1 text-[13px]" style={{ color: K.quiet }}>
        {t("household.savesAsYouGo", "Changes save as you go.")}
      </p>

      <div className="mt-4">
        <KyaLink
          color={K.red}
          onClick={async () => {
            if (removeEverywhere.isPending) return;
            const yes = await confirm({
              title: t("household.confirmRemoveTitle", "Remove {{name}} from your household?", { name: label }),
              body: t("household.confirmRemoveBody", "They'll lose access to all your birds. Their past logs stay in the record. If they're covering a sit right now, that sit keeps its own access until it ends; cancel the sit from the Sits tab to end that too."),
              confirmLabel: t("household.removeConfirmLabel", "Remove"),
            });
            if (yes) removeEverywhere.mutate();
          }}
        >
          {removeEverywhere.isPending
            ? t("household.removing", "Removing…")
            : t("household.removeNameFromHousehold", "Remove {{name}} from your household", { name: display })}
        </KyaLink>
      </div>
      {confirmSheet}
    </KyaSheet>
  );
}
