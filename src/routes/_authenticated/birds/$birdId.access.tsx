import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import {
  getHouseholdForBird, cancelHouseholdInvite, removeHouseholdMember,
} from "@/lib/household.functions";
import { HouseholdInviteSheet } from "@/components/HouseholdInviteSheet";
import { toast } from "sonner";
import { Plus, Calendar, MoreHorizontal, Loader2 } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaRow, KyaGroupLabel, KyaIconTile, KyaHeading, KyaLink, KyaSheet } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { friendlyError } from "@/lib/errorMessage";
import { formatLocalDate } from "@/lib/dates";
import { capabilitySummary } from "@/components/HouseholdMemberSheet";
import i18next from "i18next";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/birds/$birdId/access")({
  head: () => ({ meta: [{ title: i18next.t("birdAccess.metaTitle", "Who can see this record — Kya & Co.") }] }),
  component: AccessHub,
});

function fmtDate(iso: string): string {
  return formatLocalDate(new Date(iso), { month: "short", day: "numeric", year: "numeric" });
}
/** "can log weights" → "Can log weights" (the summary is written mid-sentence). */
function sentenceStart(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function initialOf(s: string | null | undefined, fallback = "?") {
  return (s?.trim()?.slice(0, 1) || fallback).toUpperCase();
}

function AccessHub() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const goBack = useGoBack(useCallback(() => navigate({ to: "/birds/$birdId", params: { birdId } }), [navigate, birdId]));

  const { data: bird } = useQuery({
    queryKey: ["bird-access-head", birdId],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const { data } = await supabase.from("birds").select("id, name, owner_id").eq("id", birdId).maybeSingle();
      return { row: data as { id: string; name: string; owner_id: string } | null, uid: u.user?.id ?? null };
    },
  });

  // Household members can't manage access — bounce them to the record.
  useEffect(() => {
    if (bird?.row && bird.uid && bird.row.owner_id !== bird.uid) {
      navigate({ to: "/birds/$birdId", params: { birdId }, replace: true });
    }
  }, [bird, birdId, navigate]);

  const getHousehold = useServerFn(getHouseholdForBird);
  const { data: household, isLoading } = useQuery({
    queryKey: ["household", birdId],
    queryFn: () => getHousehold({ data: { birdId } }),
  });

  const name = bird?.row?.name ?? t("birdAccess.thisBird", "this bird");

  // Each member's real permissions (household_member_permissions; no row =
  // can see only). Same key and shape as the Household page, so the two share
  // the cache and always say the same thing.
  const { data: myId = null } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await getLocalUser()).data.user?.id ?? null,
  });
  const { data: permRows } = useQuery({
    queryKey: ["household-permissions", myId] as const,
    enabled: !!myId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("household_member_permissions")
        .select("member_user_id, capabilities, preset")
        .eq("owner_id", myId!);
      if (error) throw error;
      return (data ?? []) as { member_user_id: string; capabilities: string[] | null; preset: string | null }[];
    },
  });
  const capsByMember = permRows ? new Map(permRows.map((r) => [r.member_user_id, r.capabilities ?? []])) : null;

  const members = household?.members ?? [];
  const pending = household?.pending ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["household", birdId] });

  return (
    <KyaPage>
      <PageHeader title={t("birdAccess.title", "Who can see {{name}}'s record", { name })} onBack={goBack} />

      <KyaBody className="gap-5">
        {/* You */}
        <section className="flex flex-col gap-2">
          <KyaGroupLabel>{t("birdAccess.youHeading", "You")}</KyaGroupLabel>
          <KyaCard>
            <KyaRow
              last
              leading={<Avatar tone="forest"><OwnerInitial /></Avatar>}
              title={t("birdAccess.you", "You")}
              detail={t("birdAccess.ownerFullAccess", "Owner · full access")}
            />
          </KyaCard>
        </section>

        {/* Household */}
        <section className="flex flex-col gap-2">
          <KyaGroupLabel>{t("birdAccess.household", "Household")}</KyaGroupLabel>
          <KyaCard>
            {isLoading ? (
              <div className="flex min-h-[60px] items-center gap-2 px-4 text-[14px]" style={{ color: K.quiet }}>
                <Loader2 className="size-4 animate-spin" /> {t("birdAccess.loading", "Loading…")}
              </div>
            ) : (
              <>
                {members.map((m) => (
                  <MemberRow key={m.userId} birdId={birdId} member={m} caps={capsByMember ? capsByMember.get(m.userId) ?? [] : null} onChanged={refresh} />
                ))}
                {pending.map((p) => (
                  <PendingRow key={p.id} invite={p} onChanged={refresh} />
                ))}
                <KyaRow
                  last
                  onClick={() => setInviting(true)}
                  chevron={false}
                  leading={<KyaIconTile tone="mist"><Plus className="size-5" /></KyaIconTile>}
                  title={<span style={{ color: K.moss }}>{t("birdAccess.addMember", "Add a household member")}</span>}
                />
              </>
            )}
          </KyaCard>
          <p className="m-0 px-1 text-[13.5px] leading-[1.5]" style={{ color: K.quiet }}>
            {t("birdAccess.householdHintPerms", "Household members see {{name}}'s record and can do what you allow each of them. Good for partners or family who help with {{name}}.", { name })}
          </p>
        </section>

        {/* Sitters */}
        <section className="flex flex-col gap-2">
          <KyaGroupLabel>{t("birdAccess.sitters", "Sitters")}</KyaGroupLabel>
          <KyaCard>
            <KyaRow
              last
              onClick={() => navigate({ to: "/sits" })}
              leading={<KyaIconTile><Calendar className="size-5" /></KyaIconTile>}
              title={t("birdAccess.sitterAccess", "Sitter access")}
              detail={t("birdAccess.sitterAccessHint", "Temporary links, managed per sit")}
            />
          </KyaCard>
        </section>
      </KyaBody>

      {inviting && (
        <HouseholdInviteSheet initialBirdIds={[birdId]} onClose={() => setInviting(false)} onSent={() => { setInviting(false); refresh(); }} />
      )}
    </KyaPage>
  );
}

function Avatar({ children, tone }: { children: ReactNode; tone: "forest" | "lime" | "amber" }) {
  const c = tone === "forest" ? { background: K.forest, color: "#fff" }
    : tone === "lime" ? { background: K.lime, color: K.forest }
    : { background: K.amberBg, color: K.amberText };
  return <span className="grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-[700]" style={c} aria-hidden="true">{children}</span>;
}

function OwnerInitial() {
  const { data } = useQuery({
    queryKey: ["owner-initial"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const uid = u.user?.id;
      if (!uid) return "Y";
      const { data: p } = await supabase.from("profiles").select("display_name").eq("id", uid).maybeSingle();
      const n = (p?.display_name ?? u.user?.email ?? "You").toString();
      return (n.trim().slice(0, 1) || "Y").toUpperCase();
    },
  });
  return <>{data ?? "Y"}</>;
}

function MemberRow({ birdId, member, caps, onChanged }: { birdId: string; member: { userId: string; name: string | null; email: string | null; addedAt: string }; caps: string[] | null; onChanged: () => void }) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);
  const remove = useServerFn(removeHouseholdMember);
  const m = useMutation({
    mutationFn: () => remove({ data: { birdId, userId: member.userId } }),
    onSuccess: () => { toast.success(t("birdAccess.removed", "Removed from household.")); setMenu(false); onChanged(); },
    onError: (e: any) => toast.error(friendlyError(e, t("birdAccess.removeFailed", "Couldn't remove."))),
  });
  const label = member.name?.trim() || member.email || t("birdAccess.householdMember", "Household member");
  return (
    <>
      <KyaRow
        chevron={false}
        leading={<Avatar tone="lime">{initialOf(member.name || member.email)}</Avatar>}
        title={label}
        detail={caps === null
          ? t("birdAccess.addedOn", "Added {{date}}", { date: fmtDate(member.addedAt) })
          : t("birdAccess.permsAdded", "{{perms}} · added {{date}}", { perms: sentenceStart(capabilitySummary(caps)), date: fmtDate(member.addedAt) })}
        trailing={
          <button
            type="button"
            aria-label={t("birdAccess.memberOptions", "Member options")}
            onClick={() => setMenu(true)}
            className="-mr-2 grid size-11 place-items-center rounded-full active:bg-black/[0.04]"
            style={{ color: K.quiet }}
          >
            <MoreHorizontal className="size-5" />
          </button>
        }
      />
      <KyaSheet
        open={menu}
        onClose={() => setMenu(false)}
        closeLabel={t("birdAccess.close", "Close")}
        title={<KyaHeading size={24}>{label}</KyaHeading>}
      >
        <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.quiet }}>
          {t("birdAccess.confirmRemove", "Remove {{name}} from this bird's household? Their past logs stay in the record.", { name: label })}
        </p>
        <button
          type="button"
          disabled={m.isPending}
          onClick={() => m.mutate()}
          className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 bg-white px-6 text-[16px] font-[700] disabled:opacity-45"
          style={{ borderColor: K.red, color: K.red }}
        >
          {m.isPending && <Loader2 className="size-4 animate-spin" />}
          {t("birdAccess.removeFromHousehold", "Remove from household")}
        </button>
      </KyaSheet>
    </>
  );
}

function PendingRow({ invite, onChanged }: { invite: { id: string; email: string; name: string | null; expiresAt: string }; onChanged: () => void }) {
  const { t } = useTranslation();
  const cancel = useServerFn(cancelHouseholdInvite);
  const m = useMutation({
    mutationFn: () => cancel({ data: { inviteId: invite.id } }),
    onSuccess: () => { toast.success(t("birdAccess.inviteCanceled", "Invite canceled.")); onChanged(); },
    onError: (e: any) => toast.error(friendlyError(e, t("birdAccess.cancelFailed", "Couldn't cancel."))),
  });
  return (
    <KyaRow
      chevron={false}
      leading={<Avatar tone="amber">{initialOf(invite.name || invite.email)}</Avatar>}
      title={invite.name?.trim() || invite.email}
      detail={<span className="font-[700]" style={{ color: K.amberText }}>{t("birdAccess.invitedPending", "Invited · pending")}</span>}
      trailing={
        <KyaLink onClick={() => { if (!m.isPending) m.mutate(); }} className="px-1">
          {t("birdAccess.cancel", "Cancel")}
        </KyaLink>
      }
    />
  );
}
