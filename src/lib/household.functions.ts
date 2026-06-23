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

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
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
