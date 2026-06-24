import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { Feather, Plus, Mail, Check, Users } from "lucide-react";

// Create OR edit a sit. In edit mode (`editSit` set) it preserves the existing
// invite_token — the same sitter link keeps working; editing changes what it
// grants (dates → access window, and which birds are included), not the link.
export function SitForm({
  birds,
  onSaved,
  initialOpen = false,
  preselectBirdId,
  activeSit,
  editSit,
  onCancel,
  returnTo = "/dashboard",
  hidePrompt = false,
}: {
  birds: any[];
  onSaved: () => void;
  initialOpen?: boolean;
  preselectBirdId?: string;
  activeSit?: any;
  editSit?: any;
  onCancel?: () => void;
  // Where to clear the ?newSit param back to after opening (the screen hosting
  // the form). Defaults to /dashboard for back-compat.
  returnTo?: string;
  // Suppress the closed-state "New sit / Going away?" prompt card when the host
  // screen already provides the open CTA (e.g. the Sits tab hero button).
  hidePrompt?: boolean;
}) {
  const editing = !!editSit;
  const navigate = useNavigate();
  const [open, setOpen] = useState(initialOpen || editing);

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (editing) return new Set<string>(((editSit.sit_birds ?? []) as any[]).map((sb) => sb.bird_id));
    return preselectBirdId
      ? new Set([preselectBirdId])
      : new Set<string>(birds.length === 1 ? [birds[0].id] : []);
  });
  // Authoritative current bird list for reconcile (SitCard in the bird editor
  // doesn't pass sit_birds, so we fetch it below).
  const currentBirdIds = useRef<string[]>(editing ? Array.from(selected) : []);

  const [title, setTitle] = useState(editing ? (editSit.title ?? "") : "");
  const [sitterName, setSitterName] = useState(editing ? (editSit.sitter_name ?? "") : "");
  const [sitterEmail, setSitterEmail] = useState(editing ? (editSit.sitter_email ?? "") : "");
  const [start, setStart] = useState(editing ? (editSit.start_date ?? "") : "");
  const [end, setEnd] = useState(editing ? (editSit.end_date ?? "") : "");
  const [notes, setNotes] = useState(editing ? (editSit.notes ?? "") : "");
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLFormElement>(null);

  // Caregiver kind:
  //   "household" + householdUserId = no token, no email — assigns a household
  //                                    member who already has bird access.
  //   "external" + sitterName/Email = the existing per-trip token flow.
  // Defaults to whichever was set on the row when editing; null on a fresh form
  // (the owner picks during creation). PR 1 doesn't allow swapping the kind in
  // edit mode — surfaced as a small note in the UI; a follow-up will add it.
  type CaregiverKind = "household" | "external";
  const initialKind: CaregiverKind | null = editing
    ? (editSit.caregiver_user_id ? "household" : "external")
    : null;
  const [caregiverKind, setCaregiverKind] = useState<CaregiverKind | null>(initialKind);
  const [householdUserId, setHouseholdUserId] = useState<string | null>(editing ? (editSit.caregiver_user_id ?? null) : null);

  // Household members eligible to cover this sit = anyone who has household
  // access to EVERY currently-selected bird. Re-runs when the selection
  // changes; the owner can only pick a member who covers all of it. Owner
  // reads bird_members via the existing owner RLS — no new permission.
  const birdIdsKey = useMemo(() => Array.from(selected).sort().join(","), [selected]);
  const { data: eligibleMembers = [] } = useQuery({
    queryKey: ["sit-eligible-household", birdIdsKey],
    enabled: !editing && selected.size > 0,
    queryFn: async () => {
      const ids = Array.from(selected);
      const { data: rows } = await supabase
        .from("bird_members").select("user_id, bird_id, created_at")
        .in("bird_id", ids).eq("role", "household");
      const byUser = new Map<string, Set<string>>();
      for (const r of (rows ?? []) as any[]) {
        const s = byUser.get(r.user_id) ?? new Set<string>();
        s.add(r.bird_id);
        byUser.set(r.user_id, s);
      }
      // Filter to members on EVERY selected bird.
      const userIds = [...byUser.entries()].filter(([, s]) => s.size === ids.length).map(([id]) => id);
      if (!userIds.length) return [];
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", userIds);
      const nameById = new Map((profs ?? []).map((p: any) => [p.id, (p.display_name ?? "").trim()]));
      return userIds.map((id) => ({ userId: id, name: nameById.get(id) || "Household member" })).sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  // Create-only: opens the form when ?newSit is set, then clears the param.
  // Keyed on initialOpen (not just mount) so it also fires when the param flips
  // true while the dashboard is already mounted — e.g. the checklist's "Create
  // your first sit", which links to /dashboard?newSit while already there.
  useEffect(() => {
    if (initialOpen && !editing) {
      setOpen(true);
      navigate({ to: returnTo, search: {}, replace: true } as any);
      // The form can be below the fold on the dashboard — bring it into view.
      setTimeout(() => rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpen]);

  // Edit: load the sit's authoritative current birds (prefill + reconcile).
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("sit_birds").select("bird_id").eq("sit_id", editSit.id);
      if (cancelled) return;
      const ids = (data ?? []).map((r: any) => r.bird_id);
      currentBirdIds.current = ids;
      setSelected(new Set(ids));
    })();
    return () => { cancelled = true; };
  }, [editing, editSit?.id]);

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }
  function selectAll() {
    setSelected(new Set(birds.map((b) => b.id)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (selected.size === 0) { toast.error("Pick at least one bird."); return; }
    if (!start || !end) { toast.error("Pick a start and end date."); return; }
    if (end < start) { toast.error("End date must be on or after start date."); return; }
    // Validate the caregiver choice — required on create; preserved on edit.
    if (!editing) {
      if (!caregiverKind) { toast.error("Pick who's covering this sit."); return; }
      if (caregiverKind === "household" && !householdUserId) { toast.error("Pick a household member."); return; }
      if (caregiverKind === "external" && !sitterEmail.trim()) { toast.error("Add the sitter's email."); return; }
    }
    setSaving(true);
    try {
      const birdIds = Array.from(selected);
      const [{ data: contacts, error: ecErr }, { data: u }] = await Promise.all([
        supabase
          .from("emergency_contacts")
          .select("bird_id, owner_phone, avian_vet_phone")
          .in("bird_id", birdIds),
        getLocalUser(),
      ]);
      if (ecErr) { toast.error(ecErr.message); setSaving(false); return; }
      if (!u.user) { toast.error("You're signed out."); setSaving(false); return; }
      // Emergency-contact preflight is for the external-sitter share — the
      // sitter has no other access, so the contacts must be on file before we
      // mint a link. A household caregiver already has bird access and the
      // contacts via existing membership; skip the gate for that path.
      const kind: CaregiverKind = editing ? (initialKind as CaregiverKind) : (caregiverKind as CaregiverKind);
      if (kind === "external") {
        const { data: defaults } = await supabase
          .from("owner_emergency_defaults")
          .select("owner_phone, avian_vet_phone")
          .eq("owner_id", u.user.id)
          .maybeSingle();
        const contactByBird = new Map((contacts ?? []).map((c: any) => [c.bird_id, c]));
        const eff = (c: any, k: string) =>
          (c?.[k]?.trim?.() || (defaults as any)?.[k]?.trim?.() || "");
        const missing = birdIds
          .map((id) => {
            const c = contactByBird.get(id);
            const needs: string[] = [];
            if (!eff(c, "owner_phone")) needs.push("your phone");
            if (!eff(c, "avian_vet_phone")) needs.push("avian vet phone");
            return needs.length ? { bird: birds.find((b: any) => b.id === id), needs } : null;
          })
          .filter(Boolean) as { bird: any; needs: string[] }[];
        if (missing.length) {
          const details = missing.map((m) => `${m.bird?.name ?? "Bird"}: ${m.needs.join(" & ")}`).join("; ");
          toast.error(
            `Add the required emergency contacts before sharing a sitter link — ${details}. Set account defaults below, or open the bird's Emergency tab.`,
            { duration: 8000 },
          );
          setSaving(false);
          return;
        }
      }

      // External sits keep a token window ending at end-of-day on the end
      // date. Household sits have no token — token_expires_at stays null.
      const expires = new Date(end + "T23:59:59Z").toISOString();

      if (editing) {
        // PR 1: caregiver KIND is locked on edit (UI disables the picker too).
        // The fields that update depend on which kind this row already is:
        //   external → bird-set, dates, sitter_name/email + the token window.
        //   household → bird-set, dates only (sitter_* + token stay null per
        //               the sits_one_caregiver_chk constraint).
        const update: any = {
          title: title || null,
          start_date: start,
          end_date: end,
          notes: notes || null,
        };
        if (kind === "external") {
          update.sitter_name = sitterName || null;
          update.sitter_email = sitterEmail || null;
          update.token_expires_at = expires;
        }
        const { error } = await supabase.from("sits").update(update).eq("id", editSit.id);
        if (error) { toast.error(error.message); setSaving(false); return; }

        // Reconcile which birds the token grants access to.
        const cur = new Set(currentBirdIds.current);
        const toAdd = birdIds.filter((id) => !cur.has(id));
        const toRemove = currentBirdIds.current.filter((id) => !selected.has(id));
        if (toAdd.length) {
          const { error: addErr } = await supabase
            .from("sit_birds")
            .insert(toAdd.map((bird_id) => ({ sit_id: editSit.id, bird_id })));
          if (addErr) { toast.error(addErr.message); setSaving(false); return; }
        }
        if (toRemove.length) {
          const { error: remErr } = await supabase
            .from("sit_birds")
            .delete()
            .eq("sit_id", editSit.id)
            .in("bird_id", toRemove);
          if (remErr) { toast.error(remErr.message); setSaving(false); return; }
        }
        track("sit_edited", { bird_count: birdIds.length });
        toast.success("Sit updated.");
        onSaved();
        onCancel?.();
      } else {
        // Insert shape depends on caregiver kind. The check constraint
        // sits_one_caregiver_chk requires EITHER (invite_token + no caregiver)
        // OR (caregiver_user_id + no token), so the household path explicitly
        // nulls the token columns to override the table default.
        const insert: any = {
          owner_id: u.user.id,
          title: title || null,
          start_date: start, end_date: end,
          notes: notes || null,
          status: "upcoming",
        };
        if (kind === "external") {
          insert.sitter_name = sitterName || null;
          insert.sitter_email = sitterEmail || null;
          insert.token_expires_at = expires;
        } else {
          insert.caregiver_user_id = householdUserId;
          insert.invite_token = null;
          insert.token_expires_at = null;
          insert.sitter_name = null;
          insert.sitter_email = null;
        }
        const { data: sit, error } = await supabase.from("sits").insert(insert).select().single();
        if (error || !sit) { toast.error(error?.message ?? "Could not create sit."); setSaving(false); return; }
        const rows = birdIds.map((bird_id) => ({ sit_id: sit.id, bird_id }));
        const { error: linkErr } = await supabase.from("sit_birds").insert(rows);
        if (linkErr) { toast.error(linkErr.message); setSaving(false); return; }
        const days = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1);
        track("sit_created", { bird_count: birdIds.length, days, has_email: !!sitterEmail, caregiver_kind: kind });
        toast.success(kind === "household" ? "Sit created — your household member is set." : "Sit created.");
        setOpen(false);
        setTitle(""); setSitterName(""); setSitterEmail(""); setStart(""); setEnd(""); setNotes("");
        setCaregiverKind(null); setHouseholdUserId(null);
        setSelected(new Set(birds.length === 1 ? [birds[0].id] : []));
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  // Closed prompt (create mode only).
  if (!open && !editing) {
    if (hidePrompt) return null;
    if (activeSit) {
      return (
        <div className="rounded-[20px] bg-[#cdeab0] p-5">
          <p className="text-lg font-medium text-[#1f3d12]">Sit active</p>
          <p className="mt-1 text-sm text-[#3f5e22]">A sit is underway right now. Your sitter has their private link.</p>
          <button onClick={() => setOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">
            <Plus className="size-4" /> New sit
          </button>
        </div>
      );
    }
    return (
      <div className="relative overflow-hidden rounded-[20px] bg-[#cdeab0] p-5">
        <Feather className="pointer-events-none absolute -right-3 -top-3 size-20 rotate-12 text-[#1f3d12]/10" />
        <p className="text-lg font-medium text-[#1f3d12]">Going away soon?</p>
        <p className="mt-1 max-w-[18rem] text-sm text-[#3f5e22]">Create a sit and send your sitter a private link with everything they need.</p>
        <button onClick={() => setOpen(true)} className="mt-4 inline-flex items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">
          <Plus className="size-4" /> New sit
        </button>
      </div>
    );
  }

  return (
    <form ref={rootRef} onSubmit={submit} noValidate className="space-y-3 rounded-[20px] bg-[#efe9da] p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[#1a3d2e]">{editing ? "Edit sit" : "New sit"}</p>
        <button type="button" onClick={() => (editing ? onCancel?.() : setOpen(false))} className="text-xs text-[#5f5e5a] underline">Cancel</button>
      </div>

      <div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">Sit name</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. June vacation" />
        </label>
        <p className="mt-1 text-[11px] text-[#8a897f]">A label to recognize this sit, e.g. June vacation, August work trip.</p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">Birds included</p>
          {birds.length > 1 && (
            <button type="button" onClick={selectAll} className="text-[11px] font-medium text-[#1a3d2e] underline">Select all</button>
          )}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {birds.map((b: any) => {
            const on = selected.has(b.id);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => toggle(b.id)}
                className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-sm ${on ? "border-[#2d6a4f] bg-[#e8f0ec]" : "border-[#e0d8c4] bg-white"}`}
              >
                <span className={`grid size-4 shrink-0 place-items-center rounded border-2 ${on ? "border-[#2d6a4f] bg-[#2d6a4f]" : "border-[#bcb6a3]"}`}>
                  {on && <svg viewBox="0 0 20 20" className="size-3 text-white"><path fill="currentColor" d="M7.629 13.314 4.4 10.085l1.214-1.214 2.015 2.015 5.757-5.757 1.214 1.214z"/></svg>}
                </span>
                <span className="truncate text-[#1a3d2e]">{b.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Two equal columns, top-aligned. min-w-0 lets the cells shrink to the
          column; the global input[type=date] appearance reset (styles.css) stops
          the native iOS date control from overflowing/overlapping. */}
      <div className="grid grid-cols-2 items-start gap-3">
        <div className="min-w-0"><Field label="Start"><input className="input min-w-0" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field></div>
        <div className="min-w-0"><Field label="End"><input className="input min-w-0" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field></div>
      </div>

      {/* Who's covering — household member (no token, already has access) OR
          an external sitter (the existing per-trip link flow). Edit mode keeps
          the row's existing kind (PR 1 doesn't swap caregiver type yet). */}
      {editing ? (
        <div className="rounded-[14px] border border-[#e0d8c4] bg-white p-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">Who's covering</p>
          <p className="mt-1 text-[13px] text-[#1a3d2e]">
            {initialKind === "household"
              ? `A household member is assigned. Swapping caregiver type isn't available yet — delete this sit and create a new one to change it.`
              : `An external sitter has the link. ${sitterName?.trim() || sitterEmail || "Their info"} is current; you can edit the name or email below.`}
          </p>
          {initialKind === "external" && (
            <div className="mt-2 space-y-2">
              <Field label="Sitter name"><input className="input" value={sitterName} onChange={(e) => setSitterName(e.target.value)} /></Field>
              <Field label="Sitter email"><input className="input" type="email" value={sitterEmail} onChange={(e) => setSitterEmail(e.target.value)} /></Field>
            </div>
          )}
        </div>
      ) : (
        <CaregiverPicker
          eligibleMembers={eligibleMembers}
          selectedBirdCount={selected.size}
          caregiverKind={caregiverKind}
          householdUserId={householdUserId}
          sitterName={sitterName}
          sitterEmail={sitterEmail}
          onPickHousehold={(id) => { setCaregiverKind("household"); setHouseholdUserId(id); }}
          onPickExternal={() => { setCaregiverKind("external"); setHouseholdUserId(null); }}
          onChangeSitterName={setSitterName}
          onChangeSitterEmail={setSitterEmail}
        />
      )}

      <Field label="Notes for this sit"><textarea className="input area" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>

      <button type="submit" disabled={saving} className="w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white disabled:opacity-50">
        {saving
          ? (editing ? "Saving..." : "Creating...")
          : editing
            ? "Save changes"
            : caregiverKind === "household" ? "Create sit" : "Create sit & generate link"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">{label}</span>
      {children}
    </label>
  );
}

// "Who's covering" — household member cards (filtered to people on every
// selected bird) above an "or" divider and the external-sitter expander. Picks
// are mutually exclusive: choosing a household member collapses the external
// fields; opening external clears any household selection.
function CaregiverPicker({
  eligibleMembers, selectedBirdCount,
  caregiverKind, householdUserId,
  sitterName, sitterEmail,
  onPickHousehold, onPickExternal,
  onChangeSitterName, onChangeSitterEmail,
}: {
  eligibleMembers: { userId: string; name: string }[];
  selectedBirdCount: number;
  caregiverKind: "household" | "external" | null;
  householdUserId: string | null;
  sitterName: string;
  sitterEmail: string;
  onPickHousehold: (id: string) => void;
  onPickExternal: () => void;
  onChangeSitterName: (v: string) => void;
  onChangeSitterEmail: (v: string) => void;
}) {
  const noBirdsPicked = selectedBirdCount === 0;
  const noEligible = !noBirdsPicked && eligibleMembers.length === 0;
  return (
    <div className="space-y-3 rounded-[14px] border border-[#e0d8c4] bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">Who's covering</p>

      {noBirdsPicked ? (
        <p className="text-[13px] text-[#5f5e5a]">Pick a bird above first.</p>
      ) : noEligible ? (
        <div className="rounded-[10px] bg-[#f4f1e8] p-3 text-[13px] text-[#5f5e5a]">
          No household yet — <Link to="/household" className="underline">invite someone</Link> or send a link to a sitter below.
        </div>
      ) : (
        <div className="space-y-2">
          {eligibleMembers.map((m) => {
            const on = caregiverKind === "household" && householdUserId === m.userId;
            const initial = (m.name?.slice(0, 1) ?? "?").toUpperCase();
            return (
              <button
                key={m.userId}
                type="button"
                onClick={() => onPickHousehold(m.userId)}
                aria-pressed={on}
                className={`flex w-full items-center gap-3 rounded-[12px] border p-3 text-left active:scale-[0.99] ${
                  on ? "border-[#2d6a4f] bg-[#e8f0ec] ring-1 ring-[#2d6a4f]" : "border-[#e0d8c4] bg-white"
                }`}
              >
                <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-medium ${on ? "bg-[#1a3d2e] text-white" : "bg-[#cfe3dc] text-[#1a5e3f]"}`}>{initial}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-[#1a3d2e]">{m.name}</span>
                    <span className="shrink-0 rounded-full bg-[#cfe3dc] px-2 py-0.5 text-[10px] font-medium text-[#1a5e3f]">Household</span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-[#5f5e5a]">Already has access · they'll see the daily checklist while you're away.</span>
                </span>
                {on && <Check className="size-4 shrink-0 text-[#2d6a4f]" aria-hidden />}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 py-1 text-[11px] uppercase tracking-widest text-[#8a897f]">
        <span className="h-px flex-1 bg-[#e0d8c4]" /> or <span className="h-px flex-1 bg-[#e0d8c4]" />
      </div>

      {caregiverKind === "external" ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Mail className="size-4 text-[#5f5e5a]" />
            <p className="flex-1 text-[13px] font-medium text-[#1a3d2e]">Send a link to someone else</p>
          </div>
          <Field label="Sitter name"><input className="input" value={sitterName} onChange={(e) => onChangeSitterName(e.target.value)} /></Field>
          <Field label="Sitter email"><input className="input" type="email" value={sitterEmail} onChange={(e) => onChangeSitterEmail(e.target.value)} placeholder="sitter@example.com" /></Field>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPickExternal}
          className="flex w-full items-center gap-3 rounded-[12px] border border-dashed border-[#c8bfa6] bg-[#fbfaf2] p-3 text-left active:scale-[0.99]"
        >
          <Mail className="size-4 shrink-0 text-[#5f5e5a]" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium text-[#1a3d2e]">Send a link to someone else</span>
            <span className="mt-0.5 block text-[11.5px] text-[#5f5e5a]">An email + a per-trip link, no account needed.</span>
          </span>
          <Users className="size-4 shrink-0 text-[#8a897f]" aria-hidden />
        </button>
      )}
    </div>
  );
}
