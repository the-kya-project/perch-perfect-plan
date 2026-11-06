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
import { LoadError } from "@/components/LoadError";
import { useLoadState } from "@/lib/useTooLong";
import { friendlyError } from "@/lib/errorMessage";
import { birdNames } from "@/lib/birdNames";
import { memberDisplayName } from "@/lib/memberDisplay";
import type { Capability } from "@/lib/capabilities";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { useDuoMode } from "@/lib/duo";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { RailBack } from "@/components/DuoRail";
import { SERIF } from "@/components/kya";
import { DUO, DuoTwoPane, PopOutCard, Tile, TileGrid } from "@/components/duo/DuoBlocks";

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
  const duo = useDuoMode() === "sideways";

  const getAccount = useServerFn(getHouseholdAccount);
  const accountQ = useQuery({ queryKey: ["household-account"], queryFn: () => getAccount() });
  const { data } = accountQ;
  // A failed load must not read as "No one yet": offer a retry instead.
  const load = useLoadState([accountQ]);
  const isLoading = load.loading;
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
    if (names.length === 0) return t("household.noBirds", "no birds");
    return birdNames(t, names);
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

  // iPhone Duo, two panes: people as tiles on the left, the chosen person (or
  // the invite form) in the right half.
  if (duo) {
    return (
      <HouseholdDuo
        members={members}
        pending={pending}
        allBirds={allBirds}
        myId={myId}
        loading={isLoading}
        failed={load.failed}
        onRetry={load.retry}
        capsFor={(id) => (permsLoading || !permRows ? null : (capsByMember.get(id) ?? []))}
        onBack={goBack}
        onChanged={refresh}
        onCapsSaved={onCapsSaved}
      />
    );
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
            last={load.failed || (!isLoading && members.length === 0 && pending.length === 0)}
          />
          {load.failed ? null : isLoading ? (
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

        {load.failed && <LoadError onRetry={load.retry} />}

        {!load.failed && !isLoading && members.length === 0 && pending.length === 0 && (
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

type DuoPick = { kind: "you" } | { kind: "member"; id: string } | { kind: "pending"; email: string } | { kind: "invite" };

/** The household on the iPhone Duo: people as tiles (avatar initial, name,
 *  what they can do) plus a dashed "Invite someone" tile; the right half shows
 *  the chosen person's birds and switches (HouseholdMemberSheet, inline), or
 *  the invite form (HouseholdInviteSheet, inline). */
function HouseholdDuo({ members, pending, allBirds, myId, loading, failed, onRetry, capsFor, onBack, onChanged, onCapsSaved }: {
  members: HouseholdAccountMember[];
  pending: AccountPending[];
  allBirds: { id: string; name: string }[];
  myId: string | null;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  capsFor: (userId: string) => string[] | null;
  onBack: () => void;
  onChanged: () => void;
  onCapsSaved: (userId: string, caps: Capability[], preset: string) => void;
}) {
  const { t } = useTranslation();
  const [pick, setPick] = useState<DuoPick | null>(null);
  // Bird photos for the chips (same 800px width as Home, so the crop matches).
  const { data: photoRows = [] } = useQuery({
    queryKey: ["household-duo-bird-photos", allBirds.map((b) => b.id).join(",")],
    enabled: allBirds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("id, photo_url, photo_position").in("id", allBirds.map((b) => b.id));
      return (data ?? []) as { id: string; photo_url: string | null; photo_position: string | null }[];
    },
  });
  const photoOf = useBirdPhotos(photoRows.map((r) => r.photo_url), 800);
  const birdPhotos = Object.fromEntries(photoRows.flatMap((r) => {
    const ph = photoOf(r.photo_url);
    return ph ? [[r.id, { url: ph.url, original: ph.original, position: r.photo_position }]] : [];
  }));

  // Default: the first person who helps, else the invite form.
  const current: DuoPick = pick
    ?? (members[0] ? { kind: "member", id: members[0].userId } : loading ? { kind: "you" } : { kind: "invite" });
  const member = current.kind === "member" ? members.find((m) => m.userId === current.id) ?? null : null;
  const invite = current.kind === "pending" ? pending.find((p) => p.email === current.email) ?? null : null;
  const roleOf = (m: HouseholdAccountMember) => {
    const caps = capsFor(m.userId);
    if (!caps) return undefined;
    const text = capabilitySummary(caps);
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  const initial = (name: string) => <span aria-hidden="true" className="grid size-11 place-items-center rounded-full text-[18px] font-[700]" style={{ background: K.paleGreen, color: K.forest }}>{(name.trim()[0] ?? "?").toUpperCase()}</span>;

  const left = (
    <>
      <RailBack onBack={onBack} />
      <h1 className="m-0 text-[30px] font-[600] leading-tight" style={{ fontFamily: SERIF }}>{t("householdDuo.title", "Household")}</h1>
      <p className="m-0 mt-1.5 text-[16px] leading-[1.45]" style={{ color: DUO.quiet }}>{t("householdDuo.line", "People who help care for your birds all the time.")}</p>
      <div className="mt-6">
        {failed ? <LoadError onRetry={onRetry} /> : (
          <TileGrid label={t("householdDuo.people", "People")}>
            <Tile media={initial(t("household.you", "You"))} title={t("household.you", "You")} status={t("householdDuo.owner", "Owner")} tone="fine" selected={current.kind === "you"} onSelect={() => setPick({ kind: "you" })} />
            {members.map((m) => {
              const name = memberDisplayName(m);
              return <Tile key={m.userId} media={initial(name)} title={name} status={roleOf(m)} tone="fine" selected={current.kind === "member" && current.id === m.userId} onSelect={() => setPick({ kind: "member", id: m.userId })} />;
            })}
            {pending.map((p) => {
              const name = p.name?.trim() || p.email;
              return <Tile key={p.email} media={initial(name)} title={name} status={t("householdDuo.invited", "Invited")} tone="attention" selected={current.kind === "pending" && current.email === p.email} onSelect={() => setPick({ kind: "pending", email: p.email })} />;
            })}
            <Tile dashed icon={<Plus />} title={t("household.inviteSomeone", "Invite someone")} selected={current.kind === "invite"} onSelect={() => setPick({ kind: "invite" })} />
          </TileGrid>
        )}
      </div>
    </>
  );

  const right = current.kind === "invite" ? (
    <HouseholdInviteSheet inline onClose={() => setPick({ kind: "you" })} onSent={() => { setPick(null); onChanged(); }} />
  ) : member ? (
    <HouseholdMemberSheet
      key={member.userId}
      inline
      birdPhotos={birdPhotos}
      member={member}
      allBirds={allBirds}
      ownerId={myId}
      storedCaps={capsFor(member.userId)}
      onClose={() => setPick({ kind: "you" })}
      onChanged={onChanged}
      onCapsSaved={(caps, preset) => onCapsSaved(member.userId, caps, preset)}
    />
  ) : invite ? (
    <PopOutCard eyebrow={t("household.headline", "Your household")} title={invite.name?.trim() || invite.email}>
      <p className="m-0 text-[15px] leading-[1.5]" style={{ color: DUO.quiet }}>{t("householdDuo.invitedLine", "Invited to help with {{birds}}. They join once they accept the email.", { birds: birdNames(t, invite.birdNames) })}</p>
      <div className="mt-2"><PendingRow invite={invite} last onChanged={() => { setPick(null); onChanged(); }} /></div>
    </PopOutCard>
  ) : (
    <PopOutCard eyebrow={t("household.headline", "Your household")} title={t("household.you", "You")}>
      <p className="m-0 text-[16px] leading-[1.5]" style={{ color: K.ink }}>{t("household.ownerAllBirds", "Owner · all birds")}</p>
      <p className="m-0 mt-3 text-[15px] leading-[1.5]" style={{ color: DUO.quiet }}>{t("household.orSitterBody", "Household members help every day and keep access until you remove them. Sitters cover a trip and only have access during that sit.")}</p>
    </PopOutCard>
  );

  return <DuoTwoPane left={left} right={right} leftLabel={t("householdDuo.title", "Household")} />;
}
