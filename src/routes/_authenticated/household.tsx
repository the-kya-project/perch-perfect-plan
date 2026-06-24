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
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <header className="pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <button onClick={goBack} aria-label="Back" className="-ml-1 rounded-full p-1.5 text-[#1a3d2e] active:bg-black/5"><ArrowLeft className="size-5" /></button>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-5 pb-6">
        <div>
          <h1 className="font-display text-[25px] font-medium leading-tight text-[#1a3d2e]">Your household</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-[#5b6b61]">
            People you've given access to your birds. By default they can help with all your birds — you can scope it to specific ones if you'd like.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 rounded-[16px] bg-white p-4 text-sm text-[#8a897f] ring-1 ring-[#eee6d4]">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <section className="overflow-hidden rounded-[16px] bg-white" style={{ boxShadow: "0 1px 0 rgba(40,50,40,.02), 0 6px 14px -8px rgba(40,50,40,.08)" }}>
              {isEmpty ? (
                <p className="px-4 py-5 text-sm text-[#5b6b61]">No one yet. Invite a partner or family member who helps care for your birds.</p>
              ) : (
                <ul>
                  {members.map((m, i) => (
                    <li key={m.userId} className={i ? "border-t border-[#eee6d4]" : ""}>
                      <MemberRow member={m} onManage={() => setManageUserId(m.userId)} />
                    </li>
                  ))}
                  {pending.map((p, i) => (
                    <li key={p.email} className={members.length || i ? "border-t border-[#eee6d4]" : ""}>
                      <PendingRow invite={p} onChanged={refresh} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <button
              type="button"
              onClick={() => setInviting(true)}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-[#c8bfa6] bg-[#fbfaf2] text-sm font-medium text-[#2d6a4f] active:scale-[0.99]"
            >
              <Plus className="size-4" /> Invite a household member
            </button>

            <section className="rounded-[16px] bg-white p-4 ring-1 ring-[#eee6d4]">
              <h2 className="font-display text-[14.5px] font-medium text-[#1a3d2e]">What they can do</h2>
              <ul className="mt-2 space-y-1.5 text-sm text-[#5b6b61]">
                <Can yes>View care plans, identity, weight, journal, moments</Can>
                <Can yes>Log weights, journal entries, and scans</Can>
                <Can>They can't edit the care plan, manage sharing, or remove birds</Can>
              </ul>
            </section>

            <p className="font-display text-center text-[13px] italic text-[#8a8270]">
              Sitters are managed per-trip from the Sits tab.
            </p>
          </>
        )}
      </main>

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
    <li className="flex items-start gap-2">
      {yes
        ? <Check className="mt-0.5 size-4 shrink-0 text-[#2d8a5d]" />
        : <X className="mt-0.5 size-4 shrink-0 text-[#9a978c]" />}
      <span>{children}</span>
    </li>
  );
}

function MemberRow({ member, onManage }: { member: AccountMember; onManage: () => void }) {
  const label = member.name?.trim() || member.email || "Household member";
  const scopeLabel = member.scope === "all" ? "All birds" : `Sharing ${truncNames(member.birdNames)}`;
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#cfe3dc] text-sm font-medium text-[#1a5e3f]">{initialOf(member.name || member.email)}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#1a3d2e]">{label}</p>
        <p className="truncate text-xs text-[#8a8270]">{scopeLabel} · since {fmtMonth(member.since)}</p>
      </div>
      <button type="button" aria-label={`Manage ${label}`} onClick={onManage} className="-mr-1 grid size-9 shrink-0 place-items-center rounded-full text-[#5b6b61] active:bg-[#f4f1e8]">
        <MoreHorizontal className="size-5" />
      </button>
    </div>
  );
}

function PendingRow({ invite, onChanged }: { invite: AccountPending; onChanged: () => void }) {
  const cancel = useServerFn(cancelHouseholdInvite);
  const m = useMutation({
    mutationFn: async () => { for (const id of invite.inviteIds) await cancel({ data: { inviteId: id } }); },
    onSuccess: () => { toast.success("Invite canceled."); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't cancel."),
  });
  return (
    <div className="flex items-center gap-3 bg-[#f6e7c4]/30 px-4 py-3.5">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f6e7c4] text-[#854F0B]"><Mail className="size-[18px]" /></span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#1a3d2e]">{invite.name?.trim() || invite.email}</p>
        <p className="truncate text-xs font-medium text-[#854F0B]">Invited · pending</p>
      </div>
      <button type="button" disabled={m.isPending} onClick={() => m.mutate()} className="shrink-0 px-2 py-1 text-xs font-medium text-[#854F0B] underline disabled:opacity-50">Cancel</button>
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
      <div className="relative w-full max-w-md rounded-t-2xl bg-[#f4f1e8] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-[19px] font-medium text-[#1a3d2e]">{label}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-[#5b6b61] active:bg-black/5"><X className="size-5" /></button>
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#8a8270]">Can help with</p>
        <div className="mt-1.5 overflow-hidden rounded-[14px] bg-white ring-1 ring-[#eee6d4]">
          {accessibleBirds.map((b, i) => (
            <div key={b.id} className={`flex min-h-[48px] items-center gap-3 px-4 ${i ? "border-t border-[#eee6d4]" : ""}`}>
              <Check className="size-4 shrink-0 text-[#2d8a5d]" />
              <span className="flex-1 text-sm text-[#1a3d2e]">{b.name}</span>
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
                className="shrink-0 px-2 py-1 text-xs font-medium text-warn-red underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 px-1 text-xs text-[#8a8270]">To add another bird, use “Invite a household member” and choose that bird.</p>

        <button
          type="button"
          disabled={removeEverywhere.isPending}
          onClick={() => { if (window.confirm(`Remove ${label} from your household? They'll lose access to all your birds. Their past logs stay in the record.`)) removeEverywhere.mutate(); }}
          className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-[14px] border border-[#e3b3ad] bg-white text-sm font-medium text-warn-red disabled:opacity-50"
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
