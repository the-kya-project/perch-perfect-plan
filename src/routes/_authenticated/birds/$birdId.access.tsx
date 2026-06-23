import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import {
  createHouseholdInvite, getHouseholdForBird, cancelHouseholdInvite, removeHouseholdMember,
} from "@/lib/household.functions";
import { toast } from "sonner";
import { ArrowLeft, Plus, ChevronRight, Calendar, MoreHorizontal, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/birds/$birdId/access")({
  head: () => ({ meta: [{ title: "Who can see this record — Parrot Care Co-Pilot" }] }),
  component: AccessHub,
});

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function initialOf(s: string | null | undefined, fallback = "?") {
  return (s?.trim()?.slice(0, 1) || fallback).toUpperCase();
}

function AccessHub() {
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);

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

  const name = bird?.row?.name ?? "this bird";

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/birds/$birdId" params={{ birdId }} aria-label="Back to bird record" className="-ml-1 rounded p-1 text-[#1a3d2e]">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="truncate text-base font-medium text-[#1a3d2e]">Who can see {name}'s record</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-5 py-5">
        {/* You */}
        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-[#5f5e5a]">You</h2>
          <div className="flex items-center gap-3 rounded-[14px] bg-white p-4 ring-1 ring-[#e3dcc9]">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1a3d2e] text-sm font-medium text-white">
              <OwnerInitial />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#1a3d2e]">You</p>
              <p className="text-xs text-[#8a897f]">Owner · full access</p>
            </div>
          </div>
        </section>

        {/* Household */}
        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-[#5f5e5a]">Household</h2>
          {isLoading ? (
            <div className="flex items-center gap-2 rounded-[14px] bg-white p-4 text-sm text-[#8a897f] ring-1 ring-[#e3dcc9]">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-2">
              {(household?.members ?? []).map((m) => (
                <MemberCard key={m.userId} birdId={birdId} member={m} onChanged={() => qc.invalidateQueries({ queryKey: ["household", birdId] })} />
              ))}
              {(household?.pending ?? []).map((p) => (
                <PendingCard key={p.id} invite={p} onChanged={() => qc.invalidateQueries({ queryKey: ["household", birdId] })} />
              ))}
              <button
                type="button"
                onClick={() => setInviting(true)}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#c8bfa6] bg-[#fbfaf2] text-sm font-medium text-[#5f5e5a] active:scale-[0.99]"
              >
                <Plus className="size-4" /> Add a household member
              </button>
            </div>
          )}
          <p className="px-1 text-xs leading-relaxed text-[#5f5e5a]">
            Household members can view and log alongside you. Good for partners or family who help with {name}.
          </p>
        </section>

        {/* Sitters */}
        <section className="space-y-2">
          <h2 className="px-1 text-[11px] font-semibold uppercase tracking-widest text-[#5f5e5a]">Sitters</h2>
          <Link
            to="/sits"
            className="flex items-center gap-3 rounded-[14px] bg-white p-4 ring-1 ring-[#e3dcc9] active:bg-[#f4f1e8]"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#efe9da] text-[#2d6a4f]">
              <Calendar className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[#1a3d2e]">Sitter access</p>
              <p className="text-xs text-[#8a897f]">Temporary links, managed per sit</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-[#bcb6a3]" />
          </Link>
        </section>
      </main>

      {inviting && (
        <InviteSheet birdId={birdId} onClose={() => setInviting(false)} onSent={() => { setInviting(false); qc.invalidateQueries({ queryKey: ["household", birdId] }); }} />
      )}
    </div>
  );
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

function MemberCard({ birdId, member, onChanged }: { birdId: string; member: { userId: string; name: string | null; email: string | null; addedAt: string }; onChanged: () => void }) {
  const [menu, setMenu] = useState(false);
  const remove = useServerFn(removeHouseholdMember);
  const m = useMutation({
    mutationFn: () => remove({ data: { birdId, userId: member.userId } }),
    onSuccess: () => { toast.success("Removed from household."); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't remove."),
  });
  const label = member.name?.trim() || member.email || "Household member";
  return (
    <div className="relative flex items-center gap-3 rounded-[14px] bg-white p-4 ring-1 ring-[#e3dcc9]">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#cfe3dc] text-sm font-medium text-[#1a5e3f]">
        {initialOf(member.name || member.email)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#1a3d2e]">{label}</p>
        <p className="truncate text-xs text-[#8a897f]">Can view &amp; log · added {fmtDate(member.addedAt)}</p>
      </div>
      <button type="button" aria-label="Member options" onClick={() => setMenu((v) => !v)} className="-mr-1 shrink-0 rounded-full p-2 text-[#5f5e5a] active:bg-[#f4f1e8]">
        <MoreHorizontal className="size-5" />
      </button>
      {menu && (
        <>
          <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
          <div className="absolute right-3 top-12 z-20 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-[#e3dcc9]">
            <button
              type="button"
              disabled={m.isPending}
              onClick={() => {
                setMenu(false);
                if (window.confirm(`Remove ${label} from ${"this bird"}'s household? Their past logs stay in the record.`)) m.mutate();
              }}
              className="block w-full px-4 py-3 text-left text-sm font-medium text-warn-red disabled:opacity-50"
            >
              Remove from household
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PendingCard({ invite, onChanged }: { invite: { id: string; email: string; name: string | null; expiresAt: string }; onChanged: () => void }) {
  const cancel = useServerFn(cancelHouseholdInvite);
  const m = useMutation({
    mutationFn: () => cancel({ data: { inviteId: invite.id } }),
    onSuccess: () => { toast.success("Invite canceled."); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't cancel."),
  });
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-dashed bg-[#f6e7c4]/30 p-4" style={{ borderColor: "#d8b25a" }}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f6e7c4] text-sm font-medium text-[#854F0B]">
        {initialOf(invite.name || invite.email)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#1a3d2e]">{invite.name?.trim() || invite.email}</p>
        <p className="truncate text-xs font-medium text-[#854F0B]">Invited · pending</p>
      </div>
      <button type="button" disabled={m.isPending} onClick={() => m.mutate()} className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium text-[#854F0B] underline disabled:opacity-50">
        Cancel
      </button>
    </div>
  );
}

function InviteSheet({ birdId, onClose, onSent }: { birdId: string; onClose: () => void; onSent: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set([birdId]));

  const { data: birds = [] } = useQuery({
    queryKey: ["owner-birds-min-access"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const { data } = await supabase.from("birds").select("id, name").eq("owner_id", u.user?.id ?? "").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const create = useServerFn(createHouseholdInvite);
  const m = useMutation({
    mutationFn: () => create({ data: { inviteeEmail: email.trim(), inviteeName: name.trim() || undefined, birdIds: [...selected] } }),
    onSuccess: () => { toast.success("Invite sent."); onSent(); },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't send the invite."),
  });

  const emailOk = /\S+@\S+\.\S+/.test(email.trim());
  const canSend = emailOk && selected.size > 0 && !m.isPending;
  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f4f1e8]">
      <header className="flex items-center justify-between border-b border-[#e3ded0] px-5 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button type="button" onClick={onClose} className="text-sm font-medium text-[#5f5e5a]">Cancel</button>
        <h2 className="text-base font-medium text-[#1a3d2e]">Invite a household member</h2>
        <span className="w-12" />
      </header>

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <p className="text-sm text-[#5f5e5a]">They'll get an email invite to create an account and help care for your birds.</p>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5f5e5a]">Email</span>
          <input className="input" type="email" inputMode="email" autoCapitalize="off" autoCorrect="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="partner@example.com" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5f5e5a]">Their name (optional)</span>
          <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daniel" />
        </label>

        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5f5e5a]">Which birds can they access?</span>
          <div className="overflow-hidden rounded-[14px] bg-white ring-1 ring-[#e3dcc9]">
            {birds.map((b, i) => (
              <label key={b.id} className={`flex min-h-[48px] cursor-pointer items-center gap-3 px-4 ${i ? "border-t border-[#ece6d6]" : ""}`}>
                <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggle(b.id)} className="size-4 accent-[#1a3d2e]" />
                <span className="text-sm text-[#1a3d2e]">{b.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-[14px] bg-[#f6e7c4]/40 p-4 ring-1 ring-[#e3dcc9]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#854F0B]">What they'll see</p>
          <ul className="mt-2 space-y-1 text-xs text-[#5f5e5a]">
            <li>Each bird's care plan, weight, journal, identity</li>
            <li>Can log weights and journal entries</li>
            <li>Won't see your private notes or other people's contact info</li>
          </ul>
        </div>
      </div>

      <footer className="border-t border-[#e3ded0] px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="mx-auto flex max-w-md gap-2">
          <button type="button" onClick={onClose} className="min-h-[44px] flex-1 rounded-[14px] border border-[#c8bfa6] text-sm font-medium text-[#1a3d2e]">Cancel</button>
          <button type="button" disabled={!canSend} onClick={() => m.mutate()} className="min-h-[44px] flex-1 rounded-[14px] bg-[#1a3d2e] text-sm font-medium text-white disabled:opacity-50">
            {m.isPending ? "Sending…" : "Send invite"}
          </button>
        </div>
      </footer>
    </div>
  );
}
