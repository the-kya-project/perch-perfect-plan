import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { activeOwnerBirdsMin, type ActiveBirdMin } from "@/lib/activeBirds";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { createHouseholdInvite, getHouseholdAccount, addExistingHouseholdMember } from "@/lib/household.functions";
import { ASSIGNABLE_PRESETS, PRESET_LABELS, PRESET_DESCRIPTIONS, type AssignablePreset } from "@/lib/capabilities";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";

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
      toast.success(`${member.name?.trim() || member.email || "Member"} added.`);
      // Refresh the eligible list (in place) and the access hub behind the sheet.
      qc.invalidateQueries({ queryKey: ["household-account"] });
      qc.invalidateQueries({ queryKey: ["household", targetBirdId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't add them.");
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
        {/* Quick-add from people already in the household (single-bird context). */}
        {targetBirdId && (accountLoading || eligible.length > 0) && (
          <div>
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5f5e5a]">Already in your household</span>
            <div className="overflow-hidden rounded-[14px] bg-white ring-1 ring-[#e3dcc9]">
              {accountLoading ? (
                <div className="flex items-center gap-2 px-4 py-4 text-sm text-[#8a897f]"><Loader2 className="size-4 animate-spin" /> Loading…</div>
              ) : (
                eligible.map((m, i) => {
                  const label = m.name?.trim() || m.email || "Household member";
                  return (
                    <div key={m.userId} className={`flex min-h-[56px] items-center gap-3 px-4 ${i ? "border-t border-[#ece6d6]" : ""}`}>
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#cfe3dc] text-sm font-medium text-[#1a5e3f]">
                        {(label.slice(0, 1) || "?").toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-[#1a3d2e]">{label}</p>
                        {m.email && m.name && <p className="truncate text-xs text-[#8a897f]">{m.email}</p>}
                      </div>
                      <button
                        type="button"
                        disabled={addingId === m.userId}
                        onClick={() => quickAdd(m)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#1a3d2e] px-3 py-1.5 text-xs font-medium text-white active:scale-95 disabled:opacity-50"
                      >
                        {addingId === m.userId ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
                      </button>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#e3ded0]" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#8a897f]">or invite someone new</span>
              <div className="h-px flex-1 bg-[#e3ded0]" />
            </div>
          </div>
        )}

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

        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5f5e5a]">Permission level</span>
          <div className="overflow-hidden rounded-[14px] bg-white ring-1 ring-[#e3dcc9]">
            {ASSIGNABLE_PRESETS.map((p, i) => (
              <label key={p} className={`flex min-h-[56px] cursor-pointer items-start gap-3 px-4 py-3 ${i ? "border-t border-[#ece6d6]" : ""}`}>
                <input type="radio" name="preset" checked={preset === p} onChange={() => setPreset(p)} className="mt-0.5 size-4 shrink-0 accent-[#1a3d2e]" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[#1a3d2e]">{PRESET_LABELS[p]}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[#5f5e5a]">{PRESET_DESCRIPTIONS[p]}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-[#8a897f]">You can fine-tune this anytime on the permissions screen.</p>
        </div>

        <div className="rounded-[14px] bg-[#f6e7c4]/40 p-4 ring-1 ring-[#e3dcc9]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#854F0B]">Always</p>
          <ul className="mt-2 space-y-1 text-xs text-[#5f5e5a]">
            <li>They can view each selected bird's care plan, weight, journal, and identity</li>
            <li>They won't see your private notes or other people's contact info</li>
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
