import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { activeOwnerBirdsMin, type ActiveBirdMin } from "@/lib/activeBirds";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { createHouseholdInvite, getHouseholdAccount, addExistingHouseholdMember } from "@/lib/household.functions";
import { ASSIGNABLE_PRESETS, type AssignablePreset } from "@/lib/capabilities";
import { presetLabel, presetDescription } from "@/lib/capabilityLabels";
import { useTranslation } from "react-i18next";
import { track } from "@/lib/analytics";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { friendlyError } from "@/lib/errorMessage";
import { K, KyaSheet, KyaHeading, KyaLabel, KyaPrimaryButton } from "@/components/kya";

// Shared household invite flow — used by the per-bird access hub and the
// account-level /household screen. The invite defaults to ALL of the owner's
// birds (the common case); pass `initialBirdIds` to preselect a subset (the
// per-bird hub passes just that bird). Single source — don't fork this.
export function HouseholdInviteSheet({
  initialBirdIds,
  onClose,
  onSent,
}: {
  initialBirdIds?: string[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(initialBirdIds ?? []));
  const [seeded, setSeeded] = useState(!!initialBirdIds?.length);
  const [preset, setPreset] = useState<AssignablePreset>("caregiver");

  // When adding to a single bird (the per-bird access hub), offer people already
  // in the household — they can be added directly, no email round-trip.
  const targetBirdId = initialBirdIds?.length === 1 ? initialBirdIds[0] : null;
  const householdAccount = useServerFn(getHouseholdAccount);
  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ["household-account"],
    enabled: !!targetBirdId,
    queryFn: () => householdAccount(),
  });
  const eligible = targetBirdId
    ? ((account?.members ?? []) as any[]).filter((m) => !m.birdIds?.includes(targetBirdId))
    : [];

  const addExisting = useServerFn(addExistingHouseholdMember);
  const [addingId, setAddingId] = useState<string | null>(null);
  async function quickAdd(member: { userId: string; name: string | null; email: string | null }) {
    if (!targetBirdId) return;
    setAddingId(member.userId);
    try {
      await addExisting({ data: { birdId: targetBirdId, userId: member.userId } });
      toast.success(t("householdInvite.addedToast", "{{name}} added.", { name: member.name?.trim() || member.email || t("householdInvite.member", "Member") }));
      // Refresh the eligible list (in place) and the access hub behind the sheet.
      qc.invalidateQueries({ queryKey: ["household-account"] });
      qc.invalidateQueries({ queryKey: ["household", targetBirdId] });
    } catch (e: any) {
      toast.error(friendlyError(e, t("householdInvite.couldNotAdd", "Couldn't add them.")));
    } finally {
      setAddingId(null);
    }
  }

  const { data: birds = [] } = useQuery({
    queryKey: ["owner-birds-min-access"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      // Active birds only — a passed bird isn't something to grant access to
      // (it lives in Remembering). activeOwnerBirdsMin bakes in the filter.
      const { data } = await activeOwnerBirdsMin(supabase, u.user?.id ?? "").order("name");
      return (data ?? []) as ActiveBirdMin[];
    },
  });

  // With no explicit preselection, default to every bird once the list loads.
  useEffect(() => {
    if (!seeded && birds.length) { setSelected(new Set(birds.map((b) => b.id))); setSeeded(true); }
  }, [birds, seeded]);

  const create = useServerFn(createHouseholdInvite);
  const m = useMutation({
    mutationFn: () => create({ data: { inviteeEmail: email.trim(), inviteeName: name.trim() || undefined, birdIds: [...selected], preset } }),
    onSuccess: () => {
      toast.success(t("householdInvite.sent", "Invite sent."));
      track("household_member_invited", { bird_count: selected.size, preset });
      onSent();
    },
    onError: (e: any) => toast.error(friendlyError(e, t("householdInvite.couldNotSend", "Couldn't send the invite."))),
  });

  const emailOk = /\S+@\S+\.\S+/.test(email.trim());
  const canSend = emailOk && selected.size > 0 && !m.isPending;
  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const listBox = "overflow-hidden rounded-[20px] border-[1.5px] bg-white";

  return (
    <KyaSheet
      onClose={onClose}
      closeLabel={t("householdInvite.close", "Close")}
      title={<KyaHeading size={24}>{t("householdInvite.titleInviteSomeone", "Invite someone")}</KyaHeading>}
      footer={
        <KyaPrimaryButton disabled={!canSend} onClick={() => m.mutate()}>
          {m.isPending ? t("householdInvite.sending", "Sending…") : t("householdInvite.sendInvite", "Send invite")}
        </KyaPrimaryButton>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Quick-add from people already in the household (single-bird context). */}
        {targetBirdId && (accountLoading || eligible.length > 0) && (
          <div className="flex flex-col gap-1.5">
            <KyaLabel as="span">{t("householdInvite.alreadyInHousehold", "Already in your household")}</KyaLabel>
            <div className={listBox} style={{ borderColor: K.line }}>
              {accountLoading ? (
                <div className="flex items-center gap-2 px-4 py-4 text-[15px]" style={{ color: K.quiet }}><Loader2 className="size-4 animate-spin" /> {t("householdInvite.loading", "Loading…")}</div>
              ) : (
                eligible.map((m, i) => {
                  const label = m.name?.trim() || m.email || t("householdInvite.householdMember", "Household member");
                  return (
                    <div key={m.userId} className="flex min-h-[60px] items-center gap-3 px-4 py-2" style={i ? { borderTop: `1px solid ${K.line}` } : undefined}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-full text-[13px] font-[700] text-white" style={{ background: K.forest }}>
                        {(label.slice(0, 1) || "?").toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate text-[15px] font-[700]">{label}</p>
                        {m.email && m.name && <p className="m-0 truncate text-[13px]" style={{ color: K.quiet }}>{m.email}</p>}
                      </div>
                      <button
                        type="button"
                        disabled={addingId === m.userId}
                        onClick={() => quickAdd(m)}
                        className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border-2 bg-white px-4 text-[14px] font-[700] active:scale-95 disabled:opacity-50"
                        style={{ borderColor: K.forest, color: K.forest }}
                      >
                        {addingId === m.userId ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} {t("householdInvite.add", "Add")}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-px flex-1" style={{ background: K.line }} />
              <span className="text-[13px] font-[700]" style={{ color: K.quiet }}>{t("householdInvite.orInviteNew", "or invite someone new")}</span>
              <div className="h-px flex-1" style={{ background: K.line }} />
            </div>
          </div>
        )}

        <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("householdInvite.intro", "They'll get an email invite to create an account and help care for your birds.")}</p>

        <div className="flex flex-col gap-1.5">
          <KyaLabel htmlFor="invite-email" required requiredLabel={t("householdInvite.required", "Required")}>{t("householdInvite.email", "Email")}</KyaLabel>
          <input id="invite-email" className="kya-input" type="email" inputMode="email" autoCapitalize="off" autoCorrect="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="partner@example.com" />
        </div>
        <div className="flex flex-col gap-1.5">
          <KyaLabel htmlFor="invite-name">{t("householdInvite.theirName", "Their name (optional)")}</KyaLabel>
          <input id="invite-name" className="kya-input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={t("householdInvite.namePlaceholder", "e.g. Daniel")} />
        </div>

        <div className="flex flex-col gap-1.5">
          <KyaLabel as="span">{t("householdInvite.whichBirds", "Which birds can they access?")}</KyaLabel>
          <div className={listBox} style={{ borderColor: K.line }}>
            {birds.map((b, i) => (
              <label key={b.id} className="flex min-h-[52px] cursor-pointer items-center gap-3 px-4" style={i ? { borderTop: `1px solid ${K.line}` } : undefined}>
                <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="size-5 shrink-0 accent-[#1a3d2e]" />
                <span className="text-[15px] font-[700]">{b.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <KyaLabel as="span">{t("householdInvite.permissionLevel", "Permission level")}</KyaLabel>
          <div className={listBox} style={{ borderColor: K.line }}>
            {ASSIGNABLE_PRESETS.map((p, i) => (
              <label key={p} className="flex min-h-[60px] cursor-pointer items-start gap-3 px-4 py-3" style={i ? { borderTop: `1px solid ${K.line}` } : undefined}>
                <input type="radio" name="preset" checked={preset === p} onChange={() => setPreset(p)} className="mt-0.5 size-5 shrink-0 accent-[#1a3d2e]" />
                <span className="min-w-0">
                  <span className="block text-[15px] font-[700]">{presetLabel(p)}</span>
                  <span className="mt-0.5 block text-[13px] leading-[1.45]" style={{ color: K.quiet }}>{presetDescription(p)}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="m-0 px-1 text-[13px]" style={{ color: K.quiet }}>{t("householdInvite.fineTuneHousehold", "You can change this anytime from your household.")}</p>
        </div>

        <div className="rounded-[20px] p-4" style={{ background: K.amberBg }}>
          <p className="m-0 text-[13.5px] font-[700]" style={{ color: K.amberText }}>{t("householdInvite.always", "Always")}</p>
          <ul className="m-0 mt-2 list-disc space-y-1 pl-5 text-[14px] leading-[1.45]" style={{ color: K.ink }}>
            <li>{t("householdInvite.canView", "They can view each selected bird's care plan, weight, journal, and identity")}</li>
            <li>{t("householdInvite.wontSee", "They won't see your private notes or other people's contact info")}</li>
          </ul>
        </div>
      </div>
    </KyaSheet>
  );
}
