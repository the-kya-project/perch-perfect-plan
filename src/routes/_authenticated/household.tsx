import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getHouseholdAccount, cancelHouseholdInvite, removeHouseholdMember, removeHouseholdMemberEverywhere,
} from "@/lib/household.functions";
import { HouseholdInviteSheet } from "@/components/HouseholdInviteSheet";
import { toast } from "sonner";
import { ArrowLeft, Plus, Mail, MoreHorizontal, Loader2, X, Check } from "lucide-react";
import { InkHero, Card, RecordRow, IconTile } from "@/components/system";

// Account-level household management — every person who can help with the
// owner's birds, each shown ONCE (memberships grouped by user, invites by
// email). Per-bird scoping/removal reuses removeHouseholdMember; the per-bird
// access hub (/birds/$id/access) is unchanged.
export const Route = createFileRoute("/_authenticated/household")({
  head: () => ({ meta: [{ title: "Your household — Parrot Care Co-Pilot" }] }),
  component: HouseholdScreen,
});

type AccountMember = {
  userId: string; name: string | null; email: string | null;
  birdIds: string[]; birdNames: string[]; scope: "all" | "scoped"; since: string;
};
type AccountPending = {
  email: string; inviteIds: string[]; name: string | null;
  birdIds: string[]; birdNames: string[]; scope: "all" | "scoped"; expiresAt: string;
};

function HouseholdScreen() {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const qc = useQueryClient();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/dashboard" }));

  const [inviting, setInviting] = useState(false);
  const [manageUserId, setManageUserId] = useState<string | null>(null);

  const getAccount = useServerFn(getHouseholdAccount);
  const { data, isLoading } = useQuery({ queryKey: ["household-account"], queryFn: () => getAccount() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["household-account"] });

  const members = (data?.members ?? []) as AccountMember[];
  const pending = (data?.pending ?? []) as AccountPending[];
  // Derive the managed member from live data so per-bird removals reflect
  // immediately; if they're removed entirely the sheet closes on its own.
  const manage = members.find((m) => m.userId === manageUserId) ?? null;
  const isEmpty = !isLoading && members.length === 0 && pending.length === 0;

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          eyebrow="Household"
          headline="Your household"
          body="People you've given access to your birds. By default they can help with all your birds — you can scope it to specific ones if you'd like."
        />

        <main className="space-y-5 px-5 pt-5">
          {isLoading ? (
            <Card>
              <div className="flex items-center gap-2 px-4 py-4 text-sm text-[var(--mute2)]">
                <Loader2 className="size-4 animate-spin" /> Loading…
              </div>
            </Card>
          ) : (
            <>
              <Card>
                {isEmpty ? (
                  <p className="t-body px-4 py-5 text-[var(--mute)]">No one yet. Invite a partner or family member who helps care for your birds.</p>
                ) : (
                  <>
                    {members.map((m, i) => (
                      <MemberRow
                        key={m.userId}
                        member={m}
                        last={i === members.length - 1 && pending.length === 0}
                        onManage={() => setManageUserId(m.userId)}
                      />
                    ))}
                    {pending.map((p, i) => (
                      <PendingRow key={p.email} invite={p} last={i === pending.length - 1} onChanged={refresh} />
                    ))}
                  </>
                )}
              </Card>

              <button
                type="button"
                onClick={() => setInviting(true)}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-[var(--line)] bg-white/40 text-[15px] font-[500] text-[var(--moss)] active:scale-[0.99]"
              >
                <Plus className="size-4" /> Invite a household member
              </button>

              <Card className="p-4">
                <h2 className="t-section text-[14.5px]">What they can do</h2>
                <ul className="mt-2 space-y-1.5">
                  <Can yes>View care plans, identity, weight, journal, moments</Can>
                  <Can yes>Log weights, journal entries, and scans</Can>
                  <Can>They can't edit the care plan, manage sharing, or remove birds</Can>
                </ul>
              </Card>

              <p className="t-meta text-center italic">
                Sitters are managed per-trip from the Sits tab.
              </p>
            </>
          )}
        </main>
      </div>

      {inviting && (
        <HouseholdInviteSheet onClose={() => setInviting(false)} onSent={() => { setInviting(false); refresh(); }} />
      )}
      {manage && (
        <MemberManageSheet
          member={manage}
          allBirds={(data?.birds ?? []) as { id: string; name: string }[]}
          onClose={() => setManageUserId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function Can({ children, yes }: { children: React.ReactNode; yes?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-[14px] leading-relaxed text-[var(--mute)]">
      {yes
        ? <Check className="mt-0.5 size-4 shrink-0 text-[var(--moss)]" />
        : <X className="mt-0.5 size-4 shrink-0 text-[var(--mute2)]" />}
      <span>{children}</span>
    </li>
  );
}

function MemberRow({ member, last, onManage }: { member: AccountMember; last?: boolean; onManage: () => void }) {
  const label = member.name?.trim() || member.email || "Household member";
  const scopeLabel = member.scope === "all" ? "All birds" : `Sharing ${truncNames(member.birdNames)}`;
  return (
    <RecordRow
      leading={
        <span className="grid size-10 place-items-center rounded-full bg-[var(--pale)] text-sm font-[500] text-[var(--moss)]">
          {initialOf(member.name || member.email)}
        </span>
      }
      title={label}
      subtitle={`${scopeLabel} · since ${fmtMonth(member.since)}`}
      last={last}
      trailing={
        <button
          type="button"
          aria-label={`Manage ${label}`}
          onClick={onManage}
          className="-mr-1 grid size-9 shrink-0 place-items-center rounded-full text-[var(--mute)] active:bg-[var(--cream)]"
        >
          <MoreHorizontal className="size-5" />
        </button>
      }
    />
  );
}

function PendingRow({ invite, last, onChanged }: { invite: AccountPending; last?: boolean; onChanged: () => void }) {
  const cancel = useServerFn(cancelHouseholdInvite);
  const m = useMutation({
    mutationFn: async () => { for (const id of invite.inviteIds) await cancel({ data: { inviteId: id } }); },
    onSuccess: () => { toast.success("Invite canceled."); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't cancel."),
  });
  return (
    <div className={`flex min-h-[44px] items-center gap-3 bg-[var(--amber-fill)]/30 px-4 py-3 ${last ? "" : "border-b border-[var(--line2)]"}`}>
      <IconTile tone="amber" size={40} icon={<Mail className="size-[18px]" />} />
      <div className="min-w-0 flex-1">
        <p className="t-item truncate">{invite.name?.trim() || invite.email}</p>
        <p className="t-meta mt-0.5 truncate font-[500] text-[var(--amber-ink)]">Invited · pending</p>
      </div>
      <button
        type="button"
        disabled={m.isPending}
        onClick={() => m.mutate()}
        className="min-h-[44px] shrink-0 px-2 text-xs font-[500] text-[var(--amber-ink)] underline disabled:opacity-50"
      >
        Cancel
      </button>
    </div>
  );
}

// Manage a member: scope which birds they can help with (per-bird removal reuses
// removeHouseholdMember — single source) or remove them from the household
// entirely. Adding a new bird is done via the Invite flow (sends a fresh invite).
function MemberManageSheet({ member, allBirds, onClose, onChanged }: {
  member: AccountMember; allBirds: { id: string; name: string }[]; onClose: () => void; onChanged: () => void;
}) {
  const removeOne = useServerFn(removeHouseholdMember);
  const removeAll = useServerFn(removeHouseholdMemberEverywhere);
  const has = new Set(member.birdIds);
  const label = member.name?.trim() || member.email || "this member";

  const removeBird = useMutation({
    mutationFn: (birdId: string) => removeOne({ data: { birdId, userId: member.userId } }),
    onSuccess: () => { toast.success("Updated."); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't update."),
  });
  const removeEverywhere = useMutation({
    mutationFn: () => removeAll({ data: { userId: member.userId } }),
    onSuccess: () => { toast.success(`${label} removed from your household.`); onChanged(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't remove."),
  });
  const accessibleBirds = allBirds.filter((b) => has.has(b.id));

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-[var(--cream)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="t-section text-[19px]">{label}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-[var(--mute)] active:bg-black/5"><X className="size-5" /></button>
        </div>

        <p className="t-eyebrow text-[var(--mute2)]">Can help with</p>
        <Card className="mt-1.5">
          {accessibleBirds.map((b, i) => (
            <div key={b.id} className={`flex min-h-[48px] items-center gap-3 px-4 ${i ? "border-t border-[var(--line2)]" : ""}`}>
              <Check className="size-4 shrink-0 text-[var(--moss)]" />
              <span className="t-item flex-1 font-[400]">{b.name}</span>
              <button
                type="button"
                disabled={removeBird.isPending}
                onClick={() => {
                  if (accessibleBirds.length === 1) {
                    if (window.confirm(`${b.name} is the only bird ${label} can help with. Removing it takes them out of your household. Continue?`)) removeEverywhere.mutate();
                    return;
                  }
                  removeBird.mutate(b.id);
                }}
                className="min-h-[44px] shrink-0 px-2 text-xs font-[500] text-[var(--red-ink)] underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </Card>
        <p className="t-meta mt-2 px-1">To add another bird, use “Invite a household member” and choose that bird.</p>

        <button
          type="button"
          disabled={removeEverywhere.isPending}
          onClick={() => { if (window.confirm(`Remove ${label} from your household? They'll lose access to all your birds. Their past logs stay in the record.`)) removeEverywhere.mutate(); }}
          className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-[14px] border border-[var(--red-line)] bg-white text-[15px] font-[500] text-[var(--red-ink)] disabled:opacity-50"
        >
          {removeEverywhere.isPending ? "Removing…" : "Remove from household"}
        </button>
      </div>
    </div>
  );
}

// ---- helpers ----
function initialOf(s: string | null | undefined, fallback = "?") {
  return (s?.trim()?.slice(0, 1) || fallback).toUpperCase();
}
function fmtMonth(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}
function truncNames(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return "no birds";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} & ${n[1]}`;
  return `${n[0]}, ${n[1]} and ${n.length - 2} more`;
}
