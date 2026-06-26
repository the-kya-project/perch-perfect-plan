import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { getHouseholdAccount } from "@/lib/household.functions";
import {
  CAPABILITIES, CAPABILITY_LABELS, PRESETS, PRESET_LABELS,
  capabilitiesForPreset, presetForCapabilities, type Capability, type Preset,
} from "@/lib/capabilities";
import { memberDisplayName, memberInitials } from "@/lib/memberDisplay";
import { InkHero, Card } from "@/components/system";
import { ArrowLeft, ChevronDown, Lock, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

// Owner-facing permissions manager. Each household member's capabilities[] +
// preset is owner-writable (RLS "hmp" owner-only). The owner is always full
// access and never editable. (Co-owner management of OTHER members isn't
// possible under the shipped owner-only hmp RLS — deferred.)
export const Route = createFileRoute("/_authenticated/household-permissions")({
  head: () => ({ meta: [{ title: "Permissions — Kya & Co." }] }),
  component: PermissionsScreen,
});

const ASSIGNABLE_PRESETS = PRESETS.filter((p) => p !== "custom") as Exclude<Preset, "custom">[];

function PermissionsScreen() {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const qc = useQueryClient();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/household" }));

  const getAccount = useServerFn(getHouseholdAccount);
  const { data: account, isLoading: accountLoading } = useQuery({ queryKey: ["household-account"], queryFn: () => getAccount() });

  // Current owner (this screen manages the viewer's OWN household) + their name.
  const { data: me } = useQuery({
    queryKey: ["me-with-name"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const id = u.user?.id ?? null;
      if (!id) return { id: null as string | null, name: null as string | null };
      const { data: p } = await supabase.from("profiles").select("display_name, email").eq("id", id).maybeSingle();
      return { id, name: memberDisplayName({ name: (p as any)?.display_name, email: (p as any)?.email }) };
    },
  });
  const myId = me?.id ?? null;

  // Each member's stored permissions (owner can read all rows for their household).
  const { data: permRows = [], isLoading: permsLoading } = useQuery({
    queryKey: ["household-permissions", myId],
    enabled: !!myId,
    queryFn: async () => {
      const { data } = await supabase
        .from("household_member_permissions")
        .select("member_user_id, capabilities, preset")
        .eq("owner_id", myId!);
      return (data ?? []) as { member_user_id: string; capabilities: string[]; preset: string }[];
    },
  });
  const permByMember = new Map(permRows.map((r) => [r.member_user_id, r]));

  const members = (account?.members ?? []) as { userId: string; name: string | null; email: string | null }[];
  const loading = accountLoading || permsLoading || !myId;

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          eyebrow="Household"
          headline="Permissions"
          body="Choose what each member can do. Everyone can always see everything; you control what they can change."
        />
        <main className="space-y-3 px-5 pt-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[var(--mute)]"><Loader2 className="size-4 animate-spin" /> Loading…</div>
          ) : (
            <Card>
              {/* Owner row — always full access, never editable. */}
              <div className="flex items-center gap-3 border-b border-[var(--line2)] px-4 py-3">
                <Avatar name={me?.name ?? "You"} />
                <div className="min-w-0 flex-1">
                  <p className="t-item truncate">{me?.name ?? "You"}</p>
                  <p className="t-meta">Owner · You</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--pale)] px-2.5 py-1 text-[11.5px] font-[500] text-[var(--ink)]">
                  <Lock className="size-3" /> Full access
                </span>
              </div>

              {members.length === 0 ? (
                <p className="px-4 py-6 text-center t-body text-[var(--mute)]">
                  No household members yet. Invite someone from the Household screen.
                </p>
              ) : (
                members.map((m, i) => (
                  <MemberRow
                    key={m.userId}
                    member={m}
                    ownerId={myId!}
                    stored={permByMember.get(m.userId)}
                    last={i === members.length - 1}
                    onSaved={() => qc.invalidateQueries({ queryKey: ["household-permissions", myId] })}
                  />
                ))
              )}
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}

function MemberRow({
  member, ownerId, stored, last, onSaved,
}: {
  member: { userId: string; name: string | null; email: string | null };
  ownerId: string;
  stored?: { capabilities: string[]; preset: string };
  last: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const display = memberDisplayName(member);

  // Draft state (defaults to stored, else Caregiver — the accept default).
  const initialCaps = new Set<Capability>(((stored?.capabilities ?? capabilitiesForPreset("caregiver")) as Capability[]));
  const [caps, setCaps] = useState<Set<Capability>>(initialCaps);
  const [preset, setPreset] = useState<Preset>((stored?.preset as Preset) ?? presetForCapabilities([...initialCaps]));
  const [dirty, setDirty] = useState(false);

  function applyPreset(p: Exclude<Preset, "custom">) {
    setCaps(new Set(capabilitiesForPreset(p)));
    setPreset(p);
    setDirty(true);
  }
  function toggleCap(c: Capability) {
    setCaps((prev) => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
    setPreset("custom"); // manual flip → Custom, chips deselected
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const { error } = await supabase.from("household_member_permissions").upsert(
        { owner_id: ownerId, member_user_id: member.userId, capabilities: [...caps], preset } as any,
        { onConflict: "owner_id,member_user_id" },
      );
      if (error) throw error;
      toast.success("Permissions saved.");
      setDirty(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  const currentLabel = PRESET_LABELS[preset];

  return (
    <div className={last ? "" : "border-b border-[var(--line2)]"}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.02]">
        <Avatar name={display} />
        <div className="min-w-0 flex-1">
          <p className="t-item truncate">{display}</p>
          <p className="t-meta">{currentLabel}</p>
        </div>
        <ChevronDown className={`size-4 shrink-0 text-[var(--mute2)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-4 px-4 pb-4">
          {/* Preset chips */}
          <div className="flex flex-wrap gap-2">
            {ASSIGNABLE_PRESETS.map((p) => {
              const on = preset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => applyPreset(p)}
                  aria-pressed={on}
                  className={`rounded-full px-3 py-1.5 text-[13px] font-[500] ${on ? "bg-[var(--ink)] text-white" : "bg-[var(--cream2)] text-[var(--ink)]"}`}
                >
                  {PRESET_LABELS[p]}
                </button>
              );
            })}
            {preset === "custom" && (
              <span className="rounded-full bg-[var(--ink)] px-3 py-1.5 text-[13px] font-[500] text-white">Custom</span>
            )}
          </div>

          {/* Baseline (locked on) + the seven capability switches */}
          <div className="space-y-1 rounded-[12px] border border-[var(--line2)] bg-white">
            <ToggleRow label="See everything" on locked />
            {CAPABILITIES.map((c) => (
              <ToggleRow key={c} label={CAPABILITY_LABELS[c]} on={caps.has(c)} onToggle={() => toggleCap(c)} />
            ))}
          </div>

          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--ink)] text-[14px] font-[500] text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null} {saving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, on, locked, onToggle }: { label: string; on: boolean; locked?: boolean; onToggle?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--line2)] px-3 py-2.5 last:border-b-0">
      <span className={`text-[14px] ${locked ? "text-[var(--mute)]" : "text-[var(--ink)]"}`}>{label}</span>
      {locked ? (
        <span className="inline-flex items-center gap-1 text-[12px] text-[var(--mute2)]"><Lock className="size-3" /> Always on</span>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          role="switch"
          aria-checked={on}
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--moss)]" : "bg-[var(--line)]"}`}
        >
          <span className={`absolute top-0.5 size-5 rounded-full bg-white transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
        </button>
      )}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--pale)] text-[13px] font-[600] text-[var(--moss)]">
      {memberInitials(name)}
    </span>
  );
}
