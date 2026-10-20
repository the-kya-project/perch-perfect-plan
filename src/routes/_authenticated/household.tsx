import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getHouseholdAccount, cancelHouseholdInvite } from "@/lib/household.functions";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { HouseholdInviteSheet } from "@/components/HouseholdInviteSheet";
import {
  HouseholdMemberSheet, MemberAvatar, capabilitySummary, type HouseholdAccountMember,
} from "@/components/HouseholdMemberSheet";
import { toast } from "sonner";
import { Plus, Mail, Loader2, User } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaLink, KyaPrimaryButton, KyaRow, KyaIconTile } from "@/components/kya";
import { PageHeader } from "@/components/headers";
import { friendlyError } from "@/lib/errorMessage";
import { namesAsCount } from "@/lib/birdNames";
import { memberDisplayName } from "@/lib/memberDisplay";
import type { Capability } from "@/lib/capabilities";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

// Account-level household management — every person who can help with the
// owner's birds, each shown ONCE (memberships grouped by user, invites by
// email). Tapping a member opens HouseholdMemberSheet: which birds (per-bird
// add/remove via the same server fns as the per-bird access hub), what they
// can do (household_member_permissions — formerly /household-permissions), and
// remove from the household.
export const Route = createFileRoute("/_authenticated/household")({
  head: () => ({ meta: [{ title: i18next.t("household.pageTitle", "Your household — Kya & Co.") }] }),
  component: HouseholdScreen,
});

type AccountPending = {
  email: string; inviteIds: string[]; name: string | null;
  birdIds: string[]; birdNames: string[]; scope: "all" | "scoped"; expiresAt: string;
};
type PermRow = { member_user_id: string; capabilities: string[]; preset: string };

function HouseholdScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const qc = useQueryClient();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/account" }));

  const [inviting, setInviting] = useState(false);
  const [manageUserId, setManageUserId] = useState<string | null>(null);

  const getAccount = useServerFn(getHouseholdAccount);
  const { data, isLoading } = useQuery({ queryKey: ["household-account"], queryFn: () => getAccount() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["household-account"] });

  // Same key + shape as sits.index / useOwnedBirds.
  const { data: myId = null } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await getLocalUser()).data.user?.id ?? null,
  });

  // Each member's stored permissions (owner reads all rows for their household;
  // RLS "hmp" is owner-writable). No row = no capabilities beyond seeing.
  const permKey = ["household-permissions", myId] as const;
  const { data: permRows, isLoading: permsLoading } = useQuery({
    queryKey: permKey,
    enabled: !!myId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_member_permissions")
        .select("member_user_id, capabilities, preset")
        .eq("owner_id", myId!);
      if (error) throw error;
      return (data ?? []) as PermRow[];
    },
  });
  const capsByMember = new Map((permRows ?? []).map((r) => [r.member_user_id, r.capabilities ?? []]));

  const members = (data?.members ?? []) as HouseholdAccountMember[];
  const pending = (data?.pending ?? []) as AccountPending[];
  const allBirds = (data?.birds ?? []) as { id: string; name: string }[];
  // Derive the managed member from live data so per-bird changes reflect
  // immediately; if they're removed entirely the sheet closes on its own.
  const manage = members.find((m) => m.userId === manageUserId) ?? null;

  function birdsSummary(m: HouseholdAccountMember): string {
    const allIds = new Set(allBirds.map((b) => b.id));
    const hasAll = allBirds.length > 0 && allBirds.every((b) => m.birdIds.includes(b.id));
    if (hasAll || m.scope === "all") return t("household.allBirds", "All birds");
    const names = m.birdIds.filter((id) => allIds.has(id)).map((id) => allBirds.find((b) => b.id === id)!.name);
    if (namesAsCount(names)) return t("birdNames.count", "{{count}} birds", { count: names.length });
    if (names.length <= 1) return names[0] ?? t("household.noBirds", "no birds");
    return t("birdNames.and", "{{first}} and {{last}}", { first: names.slice(0, -1).join(", "), last: names[names.length - 1] });
  }

  function onCapsSaved(userId: string, caps: Capability[], preset: string) {
    qc.setQueryData<PermRow[]>(permKey, (rows) => {
      const list = rows ?? [];
      const row = { member_user_id: userId, capabilities: caps, preset };
      return list.some((r) => r.member_user_id === userId)
        ? list.map((r) => (r.member_user_id === userId ? row : r))
        : [...list, row];
    });
    qc.invalidateQueries({ queryKey: permKey });
  }

  return (
    <KyaPage>
      <PageHeader onBack={goBack} title={t("household.headline", "Your household")} line={t("household.intro", "People who help with your birds every day. You decide what each person can see and do.")} />

      <KyaBody>
        <KyaCard>
          <KyaRow
            leading={
              <span className="grid size-10 place-items-center rounded-full" style={{ background: K.forest, color: K.lime }} aria-hidden="true">
                <User className="size-5" />
              </span>
            }
            title={t("household.you", "You")}
            detail={t("household.ownerAllBirds", "Owner · all birds")}
            last={!isLoading && members.length === 0 && pending.length === 0}
          />
          {isLoading ? (
            <div className="flex min-h-[60px] items-center gap-2 px-4 text-[14px]" style={{ color: K.quiet }}>
              <Loader2 className="size-4 animate-spin" /> {t("household.loading", "Loading…")}
            </div>
          ) : (
            <>
              {members.map((m, i) => {
                const display = memberDisplayName(m);
                const caps = capsByMember.get(m.userId) ?? [];
                const capText = permsLoading ? "" : ` · ${capabilitySummary(caps)}`;
                return (
                  <KyaRow
                    key={m.userId}
                    leading={<MemberAvatar name={display} />}
                    title={display}
                    detail={`${birdsSummary(m)}${capText}`}
                    onClick={() => setManageUserId(m.userId)}
                    last={i === members.length - 1 && pending.length === 0}
                  />
                );
              })}
              {pending.map((p, i) => (
                <PendingRow key={p.email} invite={p} last={i === pending.length - 1} onChanged={refresh} />
              ))}
            </>
          )}
        </KyaCard>

        {!isLoading && members.length === 0 && pending.length === 0 && (
          <p className="m-0 px-1 text-[14px] leading-[1.5]" style={{ color: K.quiet }}>
            {t("household.empty", "No one yet. Invite a partner or family member who helps care for your birds.")}
          </p>
        )}

        <KyaPrimaryButton icon={<Plus className="size-5" />} onClick={() => setInviting(true)}>
          {t("household.inviteSomeone", "Invite someone")}
        </KyaPrimaryButton>

        <KyaCard className="p-4">
          <KyaHeading as="h2" size={18}>{t("household.orSitterTitle", "Household or sitter?")}</KyaHeading>
          <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
            {t("household.orSitterBody", "Household members help every day and keep access until you remove them. Sitters cover a trip and only have access during that sit.")}
          </p>
          <KyaLink className="mt-1" onClick={() => navigate({ to: "/sits/new" })}>
            {t("household.setUpSitInstead", "Set up a sit instead →")}
          </KyaLink>
        </KyaCard>
      </KyaBody>

      {inviting && (
        <HouseholdInviteSheet onClose={() => setInviting(false)} onSent={() => { setInviting(false); refresh(); }} />
      )}
      {manage && (
        <HouseholdMemberSheet
          key={manage.userId}
          member={manage}
          allBirds={allBirds}
          ownerId={myId}
          storedCaps={permsLoading || !permRows ? null : (capsByMember.get(manage.userId) ?? [])}
          onClose={() => setManageUserId(null)}
          onChanged={refresh}
          onCapsSaved={(caps, preset) => onCapsSaved(manage.userId, caps, preset)}
        />
      )}
    </KyaPage>
  );
}

function PendingRow({ invite, last, onChanged }: { invite: AccountPending; last?: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const cancel = useServerFn(cancelHouseholdInvite);
  const m = useMutation({
    mutationFn: async () => { for (const id of invite.inviteIds) await cancel({ data: { inviteId: id } }); },
    onSuccess: () => { toast.success(t("household.inviteCanceled", "Invite canceled.")); onChanged(); },
    onError: (e: any) => toast.error(friendlyError(e, t("household.couldNotCancel", "Couldn't cancel."))),
  });
  const display = invite.name?.trim() || invite.email;
  return (
    <KyaRow
      leading={<KyaIconTile tone="amber"><Mail className="size-[18px]" /></KyaIconTile>}
      title={display}
      detail={t("household.invitedPending", "Invited · pending")}
      last={last}
      trailing={
        <KyaLink
          className="px-2 text-[14px]"
          onClick={() => { if (!m.isPending) m.mutate(); }}
        >
          {m.isPending ? <Loader2 className="size-4 animate-spin" /> : t("household.cancelInvite", "Cancel invite")}
        </KyaLink>
      }
    />
  );
}
