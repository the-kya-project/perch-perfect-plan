// Household sharing server functions — invite, accept, decline, cancel, remove,
// leave, and list. Household members get role='household' rows in bird_members
// (the same table owners use), granting per-bird "view + log" access enforced
// by RLS. Sitter sharing is a separate, token-only path and is untouched here.
//
// Owner-side actions are authenticated (requireSupabaseAuth → context.userId)
// and validate bird ownership. The token-based accept/decline path runs through
// the service-role admin client (the token IS the access check), mirroring the
// sitter pattern.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildHouseholdInviteEmail } from "./emailTemplates";
import { mergeEmergency } from "./emergency";
import { isCfClip, cfUid } from "./clipRef";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// Sign a clip ref to a playable URL (Cloudflare Stream iframe or signed Storage
// URL). Mirrors the sitter helper — household reads need signed media too.
async function resolveClipUrl(sb: any, ref: string): Promise<string | null> {
  if (isCfClip(ref)) {
    try {
      const { signedIframeUrl } = await import("@/lib/cloudflareStream.server");
      return await signedIframeUrl(cfUid(ref));
    } catch { return null; }
  }
  const { data } = await sb.storage.from("bird-photos").createSignedUrl(ref, 3600);
  return data?.signedUrl ?? null;
}
async function signBirdPhotoPath(sb: any, value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("data:") || value.startsWith("http")) return value;
  const { data } = await sb.storage.from("bird-photos").createSignedUrl(value, 3600);
  return data?.signedUrl ?? null;
}

function appUrl() {
  return process.env.APP_URL || "https://app.thekyaproject.com";
}

// 64-char url-safe token (two uuids, dashes stripped).
function makeToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

// Human list: "Willow", "Willow and Moxie", "Willow, Moxie, and Kiwi".
function joinNames(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return "your bird";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(", ")}, and ${n[n.length - 1]}`;
}

async function ownerDisplayName(sb: any, ownerId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("display_name").eq("id", ownerId).maybeSingle();
  const name = (data?.display_name ?? "").toString().trim();
  if (name) return name;
  try {
    const { data: u } = await sb.auth.admin.getUserById(ownerId);
    const meta = (u?.user?.user_metadata?.display_name ?? "").toString().trim();
    return meta || u?.user?.email?.split("@")[0] || "An owner";
  } catch {
    return "An owner";
  }
}

// ---- Owner: create an invite -----------------------------------------------
export const createHouseholdInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inviteeEmail: string; inviteeName?: string; birdIds: string[] }) =>
    z
      .object({
        inviteeEmail: z.string().email(),
        inviteeName: z.string().trim().max(120).optional(),
        birdIds: z.array(z.string().uuid()).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const ownerId = context.userId as string;

    // Every selected bird must belong to the caller.
    const { data: owned } = await sb.from("birds").select("id, name").in("id", data.birdIds).eq("owner_id", ownerId);
    const ownedIds = new Set((owned ?? []).map((b: any) => b.id));
    const missing = data.birdIds.filter((id) => !ownedIds.has(id));
    if (missing.length) throw new Error("You can only invite people to birds you own.");

    const token = makeToken();
    const { data: invite, error } = await sb
      .from("household_invites")
      .insert({
        owner_id: ownerId,
        invitee_email: data.inviteeEmail,
        invitee_name: data.inviteeName?.trim() || null,
        bird_ids: data.birdIds,
        token,
        status: "pending",
      })
      .select("id, invitee_email, invitee_name, bird_ids, status, created_at, expires_at")
      .single();
    if (error) throw new Error(error.message);

    // Send the invite email (best-effort — the invite is created regardless).
    try {
      const inviterName = await ownerDisplayName(sb, ownerId);
      const birdNames = joinNames((owned ?? []).map((b: any) => b.name).filter(Boolean));
      const built = buildHouseholdInviteEmail({
        inviterName,
        birdNames,
        link: `${appUrl()}/invite/${token}`,
      });
      const { sendTransactionalEmail } = await import("./brevoEmail.server");
      await sendTransactionalEmail({
        to: data.inviteeEmail,
        toName: data.inviteeName?.trim() || undefined,
        subject: built.subject,
        htmlContent: built.html,
        textContent: built.text,
      });
    } catch (e) {
      console.error("[household] invite email failed", e);
    }

    return { ok: true, invite };
  });

// ---- Owner: list household + pending invites for a bird --------------------
export const getHouseholdForBird = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string }) => z.object({ birdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const ownerId = context.userId as string;

    const { data: bird } = await sb.from("birds").select("id, name, owner_id").eq("id", data.birdId).maybeSingle();
    if (!bird || bird.owner_id !== ownerId) throw new Error("Not found.");

    // Active household members (exclude the owner row).
    const { data: members } = await sb
      .from("bird_members")
      .select("user_id, role, created_at")
      .eq("bird_id", data.birdId)
      .eq("role", "household");
    const memberIds = (members ?? []).map((m: any) => m.user_id);

    const profilesById = new Map<string, string>();
    const emailById = new Map<string, string>();
    if (memberIds.length) {
      const { data: profs } = await sb.from("profiles").select("id, display_name").in("id", memberIds);
      for (const p of profs ?? []) profilesById.set(p.id, (p.display_name ?? "").toString());
      // Emails come from auth.users (admin).
      await Promise.all(
        memberIds.map(async (id: string) => {
          try {
            const { data: u } = await sb.auth.admin.getUserById(id);
            if (u?.user?.email) emailById.set(id, u.user.email);
          } catch { /* ignore */ }
        }),
      );
    }

    const householdMembers = (members ?? []).map((m: any) => ({
      userId: m.user_id,
      name: profilesById.get(m.user_id)?.trim() || null,
      email: emailById.get(m.user_id) ?? null,
      addedAt: m.created_at,
    }));

    // Pending invites that include this bird.
    const { data: invites } = await sb
      .from("household_invites")
      .select("id, invitee_email, invitee_name, status, created_at, expires_at, bird_ids")
      .eq("owner_id", ownerId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    const now = Date.now();
    const pending = (invites ?? [])
      .filter((iv: any) => Array.isArray(iv.bird_ids) && iv.bird_ids.includes(data.birdId))
      .filter((iv: any) => new Date(iv.expires_at).getTime() > now)
      .map((iv: any) => ({
        id: iv.id,
        email: iv.invitee_email,
        name: iv.invitee_name,
        createdAt: iv.created_at,
        expiresAt: iv.expires_at,
      }));

    return { birdName: bird.name as string, members: householdMembers, pending };
  });

// ---- Owner: cancel a pending invite ----------------------------------------
export const cancelHouseholdInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inviteId: string }) => z.object({ inviteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const ownerId = context.userId as string;
    const { error } = await sb
      .from("household_invites")
      .update({ status: "canceled" })
      .eq("id", data.inviteId)
      .eq("owner_id", ownerId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Owner: remove a household member from a bird --------------------------
export const removeHouseholdMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string; userId: string }) =>
    z.object({ birdId: z.string().uuid(), userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const ownerId = context.userId as string;
    const { data: bird } = await sb.from("birds").select("owner_id").eq("id", data.birdId).maybeSingle();
    if (!bird || bird.owner_id !== ownerId) throw new Error("Not allowed.");
    if (data.userId === ownerId) throw new Error("The owner can't be removed.");
    // Delete only the household membership — their logged content is preserved.
    const { error } = await sb
      .from("bird_members")
      .delete()
      .eq("bird_id", data.birdId)
      .eq("user_id", data.userId)
      .eq("role", "household");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Owner: add someone ALREADY in the household to another bird ------------
// No email/invite round-trip — the person already has an account and is already
// trusted in the household, so grant access directly. Guard: the target user
// must already be a household member on at least one OTHER bird the caller owns
// (you can't add an arbitrary user id this way).
export const addExistingHouseholdMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string; userId: string }) =>
    z.object({ birdId: z.string().uuid(), userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const ownerId = context.userId as string;

    const { data: bird } = await sb.from("birds").select("id, owner_id").eq("id", data.birdId).maybeSingle();
    if (!bird || bird.owner_id !== ownerId) throw new Error("Not allowed.");
    if (data.userId === ownerId) throw new Error("You already have access.");

    // The user must already be in the caller's household (on some owned bird).
    const { data: ownedBirds } = await sb.from("birds").select("id").eq("owner_id", ownerId);
    const ownedIds = (ownedBirds ?? []).map((b: any) => b.id);
    const { data: existing } = await sb
      .from("bird_members")
      .select("bird_id")
      .eq("user_id", data.userId)
      .eq("role", "household")
      .in("bird_id", ownedIds);
    if (!existing || existing.length === 0) {
      throw new Error("That person isn't in your household yet — invite them by email.");
    }

    const { error } = await sb
      .from("bird_members")
      .upsert({ bird_id: data.birdId, user_id: data.userId, role: "household" }, { onConflict: "bird_id,user_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Member: leave a bird's household --------------------------------------
export const leaveHousehold = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string }) => z.object({ birdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const userId = context.userId as string;
    // Only removes a household role — never the owner's own row.
    const { error } = await sb
      .from("bird_members")
      .delete()
      .eq("bird_id", data.birdId)
      .eq("user_id", userId)
      .eq("role", "household");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Public: read an invite by token (safe fields only) --------------------
export const getHouseholdInvite = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(16) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const { data: invite } = await sb
      .from("household_invites")
      .select("id, owner_id, invitee_email, invitee_name, bird_ids, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) return { valid: false as const };

    const expired = new Date(invite.expires_at).getTime() <= Date.now();
    if (invite.status !== "pending" || expired) {
      // Best-effort: flip a stale pending invite to 'expired' so the owner sees it.
      if (invite.status === "pending" && expired) {
        await sb.from("household_invites").update({ status: "expired" }).eq("id", invite.id);
      }
      return { valid: false as const };
    }

    const inviterName = await ownerDisplayName(sb, invite.owner_id);
    const { data: birds } = await sb.from("birds").select("name").in("id", invite.bird_ids);
    const birdNames = joinNames((birds ?? []).map((b: any) => b.name).filter(Boolean));
    return {
      valid: true as const,
      inviterName,
      birdNames,
      birdCount: invite.bird_ids.length,
      inviteeEmail: invite.invitee_email as string,
      inviteeName: invite.invitee_name as string | null,
    };
  });

// ---- Authenticated: accept an invite (email must match the caller) ---------
export const acceptHouseholdInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(16) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const userId = context.userId as string;

    // Caller's email (from JWT claims, else admin lookup).
    let email = (context.claims?.email ?? "").toString().toLowerCase();
    if (!email) {
      try {
        const { data: u } = await sb.auth.admin.getUserById(userId);
        email = (u?.user?.email ?? "").toLowerCase();
      } catch { /* ignore */ }
    }

    const { data: invite } = await sb
      .from("household_invites")
      .select("id, owner_id, invitee_email, bird_ids, status, expires_at")
      .eq("token", data.token)
      .maybeSingle();
    if (!invite) throw new Error("This invite isn't active anymore.");
    if (invite.status !== "pending" || new Date(invite.expires_at).getTime() <= Date.now()) {
      throw new Error("This invite isn't active anymore.");
    }
    if (email && email !== invite.invitee_email.toString().toLowerCase()) {
      throw new Error(`This invite was sent to ${invite.invitee_email}. Sign in with that email to accept.`);
    }
    if (userId === invite.owner_id) throw new Error("That's your own invite.");

    // Grant household access per bird (don't downgrade an existing owner row).
    const rows = (invite.bird_ids as string[]).map((bird_id) => ({ bird_id, user_id: userId, role: "household" }));
    const { error: insErr } = await sb.from("bird_members").upsert(rows, { onConflict: "bird_id,user_id", ignoreDuplicates: true });
    if (insErr) throw new Error(insErr.message);

    await sb
      .from("household_invites")
      .update({ status: "accepted", accepted_user_id: userId })
      .eq("id", invite.id);

    return { ok: true, birdIds: invite.bird_ids as string[] };
  });

// ---- Public: decline an invite ---------------------------------------------
export const declineHouseholdInvite = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(16) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    await sb
      .from("household_invites")
      .update({ status: "declined" })
      .eq("token", data.token)
      .eq("status", "pending");
    return { ok: true };
  });

// ---- Member: read-only care-plan view (household or owner) ------------------
// Returns the same shape CareSheetView consumes (signed photo + clips, merged
// contacts) plus routine tasks. Access is verified via bird_members; data is
// read with the service role only after that check.
export const getHouseholdCarePlanView = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string }) => z.object({ birdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const userId = context.userId as string;

    // Must have a membership row on this bird (owner or household).
    const { data: membership } = await sb
      .from("bird_members")
      .select("role")
      .eq("bird_id", data.birdId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) throw new Error("Not found.");

    const { data: bird } = await sb.from("birds").select("*").eq("id", data.birdId).maybeSingle();
    if (!bird) throw new Error("Not found.");
    const { data: plan } = await sb.from("care_plans").select("*").eq("bird_id", data.birdId).maybeSingle();

    // Routine tasks for the schedule section.
    let tasks: any[] = [];
    if (plan?.id) {
      const { data: t } = await sb
        .from("routine_tasks")
        .select("id, title, instructions, category, time_of_day, sort_order")
        .eq("care_plan_id", plan.id)
        .order("sort_order");
      tasks = t ?? [];
    }

    // Emergency contacts merged with the owner's account defaults (household may
    // view them — see the household-sharing decision).
    const { data: contacts } = await sb.from("emergency_contacts").select("*").eq("bird_id", data.birdId).maybeSingle();
    const { data: defaults } = await sb
      .from("owner_emergency_defaults")
      .select("*")
      .eq("owner_id", (bird as any).owner_id)
      .maybeSingle();
    const mergedContacts = { ...mergeEmergency(contacts, defaults) };

    // Sign photo + clips.
    const signedBird = { ...bird, photo_url: await signBirdPhotoPath(sb, (bird as any).photo_url) };
    const watchClipSlots = [
      { key: "step_up", column: "clip_step_up_path", label: "How they step up" },
      { key: "food_water", column: "clip_food_water_path", label: "How to refill food & water safely" },
      { key: "locations", column: "clip_locations_path", label: "Where everything is" },
      { key: "bedtime", column: "clip_bedtime_path", label: "Settling them for the night" },
    ];
    const watchClips: { key: string; label: string; url: string }[] = [];
    let baselineClipUrl: string | null = null;
    if (plan) {
      for (const slot of watchClipSlots) {
        const path = (plan as any)[slot.column] as string | null;
        if (!path) continue;
        const url = await resolveClipUrl(sb, path);
        if (url) watchClips.push({ key: slot.key, label: slot.label, url });
      }
      const bcp = (plan as any).baseline_clip_path as string | null;
      if (bcp) baselineClipUrl = await resolveClipUrl(sb, bcp);
    }

    return { bird: signedBird, plan: plan ?? null, contacts: mergedContacts, tasks, watchClips, baselineClipUrl };
  });

// ---- Owner: account-level household (aggregate across all owned birds) ------
// Powers the /household screen. Each person appears ONCE: memberships are
// grouped by user_id and pending invites by email, with scope derived from how
// many of the owner's birds they cover. Read-only (admin client after the
// owner-scoped bird filter).
export const getHouseholdAccount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await getAdmin();
    const ownerId = context.userId as string;

    const { data: birds } = await sb.from("birds").select("id, name").eq("owner_id", ownerId).order("name");
    const birdRows = (birds ?? []) as { id: string; name: string }[];
    const totalBirds = birdRows.length;
    if (!totalBirds) return { totalBirds: 0, birds: [] as { id: string; name: string }[], members: [], pending: [] };
    const birdIds = birdRows.map((b) => b.id);
    const nameByBird = new Map(birdRows.map((b) => [b.id, b.name]));

    // Active memberships across every owned bird, grouped per person.
    const { data: memberRows } = await sb
      .from("bird_members").select("user_id, bird_id, created_at, role")
      .in("bird_id", birdIds).eq("role", "household");
    const byUser = new Map<string, { birdIds: string[]; since: string }>();
    for (const r of (memberRows ?? []) as any[]) {
      const e = byUser.get(r.user_id) ?? { birdIds: [] as string[], since: r.created_at as string };
      e.birdIds.push(r.bird_id);
      if (new Date(r.created_at) < new Date(e.since)) e.since = r.created_at;
      byUser.set(r.user_id, e);
    }
    const memberIds = [...byUser.keys()];

    const nameByUser = new Map<string, string>();
    const emailByUser = new Map<string, string>();
    if (memberIds.length) {
      const { data: profs } = await sb.from("profiles").select("id, display_name").in("id", memberIds);
      for (const p of (profs ?? []) as any[]) nameByUser.set(p.id, (p.display_name ?? "").toString());
      await Promise.all(memberIds.map(async (id) => {
        try { const { data: u } = await sb.auth.admin.getUserById(id); if (u?.user?.email) emailByUser.set(id, u.user.email); } catch { /* ignore */ }
      }));
    }

    const members = memberIds.map((id) => {
      const e = byUser.get(id)!;
      const scope: "all" | "scoped" = e.birdIds.length >= totalBirds ? "all" : "scoped";
      return {
        userId: id,
        name: nameByUser.get(id)?.trim() || null,
        email: emailByUser.get(id) ?? null,
        birdIds: e.birdIds,
        birdNames: e.birdIds.map((b) => nameByBird.get(b)!).filter(Boolean),
        scope,
        since: e.since,
      };
    }).sort((a, b) => (a.name || a.email || "").localeCompare(b.name || b.email || ""));

    // Pending invites grouped by email (union their birds; keep every invite id
    // so Cancel can clear them all via the existing cancel fn).
    const now = Date.now();
    const { data: invites } = await sb
      .from("household_invites")
      .select("id, invitee_email, invitee_name, bird_ids, status, expires_at, created_at")
      .eq("owner_id", ownerId).eq("status", "pending").order("created_at", { ascending: false });
    const pendingByEmail = new Map<string, { inviteIds: string[]; name: string | null; birdIds: Set<string>; expiresAt: string }>();
    for (const iv of (invites ?? []) as any[]) {
      if (new Date(iv.expires_at).getTime() <= now) continue;
      const key = iv.invitee_email.toString().toLowerCase();
      const e = pendingByEmail.get(key) ?? { inviteIds: [] as string[], name: iv.invitee_name as string | null, birdIds: new Set<string>(), expiresAt: iv.expires_at as string };
      e.inviteIds.push(iv.id);
      for (const bid of (iv.bird_ids ?? []) as string[]) if (nameByBird.has(bid)) e.birdIds.add(bid);
      if (!e.name && iv.invitee_name) e.name = iv.invitee_name;
      pendingByEmail.set(key, e);
    }
    const pending = [...pendingByEmail.entries()].map(([email, e]) => ({
      email,
      inviteIds: e.inviteIds,
      name: e.name,
      birdIds: [...e.birdIds],
      birdNames: [...e.birdIds].map((b) => nameByBird.get(b)!).filter(Boolean),
      scope: (e.birdIds.size >= totalBirds ? "all" : "scoped") as "all" | "scoped",
      expiresAt: e.expiresAt,
    }));

    return { totalBirds, birds: birdRows, members, pending };
  });

// ---- Owner: remove a person from the household ENTIRELY ---------------------
// Drops all of that user's household memberships across every owned bird (RLS
// access stops immediately). Per-bird removal stays in removeHouseholdMember.
export const removeHouseholdMemberEverywhere = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const ownerId = context.userId as string;
    if (data.userId === ownerId) throw new Error("The owner can't be removed.");
    const { data: birds } = await sb.from("birds").select("id").eq("owner_id", ownerId);
    const birdIds = (birds ?? []).map((b: any) => b.id);
    if (!birdIds.length) return { ok: true };
    const { error } = await sb
      .from("bird_members").delete()
      .in("bird_id", birdIds).eq("user_id", data.userId).eq("role", "household");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
