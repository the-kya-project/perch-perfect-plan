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
import { PRESET_CAPABILITIES, ASSIGNABLE_PRESETS, type AssignablePreset, type Capability } from "@/lib/capabilities";
import { activeOwnerBirdsMin } from "@/lib/activeBirds";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildHouseholdInviteEmail } from "./emailTemplates";
import { localeForUser, joinNamesLocalized, fallbackOwnerLabel } from "./emailLocale.server";
import { realPersonName } from "./personName.server";
import { mergeEmergency, emergencyDifferent } from "./emergency";
import { mergeHome, homeDifferences, birdHasOwn, HOME_GROUPS } from "./homeDefaults";
import { isCfClip, cfUid } from "./clipRef";
import { computeSetupCompleteness, type SetupCheck } from "./setupCompleteness";

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

// Human list: "Willow", "Willow and Moxie", "Willow, Moxie, and Kiwi" — in the
// email's language (English when no locale is passed).
function joinNames(names: string[], locale: string = "en"): string {
  return joinNamesLocalized(names, locale, "bird");
}

/** Owner's display name, or null when there's nothing to show (no profile
 *  name, metadata name, or email). Callers supply their own fallback. */
async function ownerDisplayNameRaw(sb: any, ownerId: string): Promise<string | null> {
  return realPersonName(sb, ownerId);
}

async function ownerDisplayName(sb: any, ownerId: string, locale: string = "en"): Promise<string> {
  return (await realPersonName(sb, ownerId)) ?? fallbackOwnerLabel(locale);
}

// ---- Owner: create an invite -----------------------------------------------
export const createHouseholdInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { inviteeEmail: string; inviteeName?: string; birdIds: string[]; preset?: AssignablePreset }) =>
    z
      .object({
        inviteeEmail: z.string().email(),
        inviteeName: z.string().trim().max(120).optional(),
        birdIds: z.array(z.string().uuid()).min(1),
        preset: z.enum([...ASSIGNABLE_PRESETS] as [AssignablePreset, ...AssignablePreset[]]).default("caregiver"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const ownerId = context.userId as string;

    // Every selected bird must belong to the caller AND be active (a passed
    // bird can't be granted; it's excluded from the picker and rejected here).
    const { data: owned } = await sb.from("birds").select("id, name").in("id", data.birdIds).eq("owner_id", ownerId).is("passed_at", null);
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
        // preset column added in 20260630160000; cast until generated types catch up.
        preset: data.preset,
        token,
        status: "pending",
      } as any)
      .select("id, invitee_email, invitee_name, bird_ids, status, created_at, expires_at")
      .single();
    if (error) throw new Error(error.message);

    // Send the invite email (best-effort — the invite is created regardless).
    try {
      // Account-less invitee (group 2) → the SENDER's (owner's) locale.
      const locale = await localeForUser(sb, ownerId);
      const inviterName = await ownerDisplayName(sb, ownerId, locale);
      const birdNames = joinNames((owned ?? []).map((b: any) => b.name).filter(Boolean), locale);
      const built = buildHouseholdInviteEmail({
        inviterName,
        birdNames,
        link: `${appUrl()}/invite/${token}`,
        locale,
      });
      const { sendTransactionalEmail } = await import("./brevoEmail.server");
      await sendTransactionalEmail({
        to: data.inviteeEmail,
        toName: data.inviteeName?.trim() || undefined,
        subject: built.subject,
        htmlContent: built.html,
        textContent: built.text,
        tag: "household_invite",
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

// A member's household permissions row (owner-wide grants: sits, invites,
// handoffs) should only exist while they're on at least one of the owner's
// birds. Per-bird removal used to leave it behind, so someone removed bird by
// bird kept reading every sit and its sitter link. Call after any per-bird
// removal.
async function dropPermissionsIfNoBirdsLeft(sb: any, ownerId: string, memberId: string) {
  const { data: owned } = await sb.from("birds").select("id").eq("owner_id", ownerId);
  const ownedIds = (owned ?? []).map((b: any) => b.id);
  if (ownedIds.length) {
    const { count } = await sb
      .from("bird_members")
      .select("bird_id", { count: "exact", head: true })
      .eq("user_id", memberId)
      .eq("role", "household")
      .in("bird_id", ownedIds);
    if ((count ?? 0) > 0) return;
  }
  const { error } = await sb
    .from("household_member_permissions").delete()
    .eq("owner_id", ownerId).eq("member_user_id", memberId);
  if (error) throw new Error(error.message);
}

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
    await dropPermissionsIfNoBirdsLeft(sb, ownerId, data.userId);
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
    const { data: bird } = await sb.from("birds").select("owner_id").eq("id", data.birdId).maybeSingle();
    const { error } = await sb
      .from("bird_members")
      .delete()
      .eq("bird_id", data.birdId)
      .eq("user_id", userId)
      .eq("role", "household");
    if (error) throw new Error(error.message);
    if (bird?.owner_id && bird.owner_id !== userId) await dropPermissionsIfNoBirdsLeft(sb, bird.owner_id, userId);
    return { ok: true };
  });

// ---- Public: read an invite by token (safe fields only) --------------------
/** Why an invite link can't be used; the invite screen picks the copy. */
export type InviteLinkProblem = "expired" | "accepted" | "declined" | "canceled" | "not_found";

export const getHouseholdInvite = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(16) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    // Cast the builder: `preset` (migration 20260630160000) isn't in the
    // generated types yet, which would otherwise poison the whole select type.
    const { data: invite } = await (sb as any)
      .from("household_invites")
      .select("id, owner_id, invitee_email, invitee_name, bird_ids, status, expires_at, preset")
      .eq("token", data.token)
      .maybeSingle();
    // Why an invite can't be used, as a code the screen turns into copy.
    // Only the inviter's name comes back with it (the link holder already has
    // it from the email) so the screen can say who to ask. No bird data.
    if (!invite) return { valid: false as const, reason: "not_found" as InviteLinkProblem, inviterName: null as string | null };

    const expired = new Date(invite.expires_at).getTime() <= Date.now();
    if (invite.status !== "pending" || expired) {
      // Best-effort: flip a stale pending invite to 'expired' so the owner sees it.
      if (invite.status === "pending" && expired) {
        await sb.from("household_invites").update({ status: "expired" }).eq("id", invite.id);
      }
      const reason: InviteLinkProblem =
        invite.status === "accepted" ? "accepted"
        : invite.status === "declined" ? "declined"
        : invite.status === "canceled" ? "canceled"
        : "expired";
      return { valid: false as const, reason, inviterName: (await ownerDisplayNameRaw(sb, invite.owner_id)) as string | null };
    }

    // Raw data only: the invite screen joins the names and supplies the
    // "An owner" fallback in the reader's language (joinNamesDisplay / t()).
    const inviterName: string | null = await ownerDisplayNameRaw(sb, invite.owner_id);
    const { data: birds } = await sb.from("birds").select("name, photo_url, photo_position").in("id", invite.bird_ids);
    const birdNames: string[] = (birds ?? []).map((b: any) => b.name as string).filter(Boolean);
    // Name + signed photo for the avatar row on the accept screen.
    const birdPreviews = await Promise.all(
      (birds ?? []).filter((b: any) => b.name).map(async (b: any) => ({
        name: b.name as string,
        photoUrl: await signBirdPhotoPath(sb, b.photo_url),
        photoPosition: (b.photo_position ?? null) as string | null,
      })),
    );
    // What the member will be able to do once they accept: the preset's
    // capability bundle (Caregiver for older invites with no stored preset,
    // matching acceptHouseholdInvite).
    const preset = ((invite.preset ?? "caregiver") as AssignablePreset);
    const capabilities: Capability[] = PRESET_CAPABILITIES[preset] ? [...PRESET_CAPABILITIES[preset]] : [];
    return {
      valid: true as const,
      inviterName,
      birdNames,
      birds: birdPreviews,
      capabilities,
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

    // Cast the builder: `preset` (migration 20260630160000) isn't in the
    // generated types yet, which would otherwise poison the whole select type.
    const { data: invite } = await (sb as any)
      .from("household_invites")
      .select("id, owner_id, invitee_email, bird_ids, status, expires_at, preset")
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

    // Only grant birds the inviter STILL owns. invite.bird_ids is a snapshot from
    // invite time; a bird can leave that flock before accept (handoff/transfer),
    // and granting it would hand a third party access to someone else's bird.
    // Filter to currently-owned birds (defense in depth; the handoff RPC also
    // prunes the bird from pending invites).
    const requestedIds = (invite.bird_ids as string[]) ?? [];
    // Only active birds the inviter still owns — never grant access to a passed bird.
    const { data: ownedNow } = await sb.from("birds").select("id").eq("owner_id", invite.owner_id).in("id", requestedIds).is("passed_at", null);
    const grantIds = (ownedNow ?? []).map((b: any) => b.id as string);
    if (grantIds.length === 0) throw new Error("This invite is no longer valid — those birds have moved to another owner.");

    // Grant household access per bird (don't downgrade an existing owner row).
    const rows = grantIds.map((bird_id) => ({ bird_id, user_id: userId, role: "household" }));
    const { error: insErr } = await sb.from("bird_members").upsert(rows, { onConflict: "bird_id,user_id", ignoreDuplicates: true });
    if (insErr) throw new Error(insErr.message);

    // Starting permissions: the preset the owner chose at invite time (defaults
    // to Caregiver for older invites with no stored preset). The owner can still
    // adjust on the Permissions screen. Idempotent — don't clobber an existing
    // row (e.g. re-accept after a prior membership).
    const preset = (((invite as any).preset ?? "caregiver") as AssignablePreset);
    await sb.from("household_member_permissions").upsert(
      {
        owner_id: invite.owner_id,
        member_user_id: userId,
        capabilities: PRESET_CAPABILITIES[preset],
        preset,
      } as any,
      { onConflict: "owner_id,member_user_id", ignoreDuplicates: true },
    );

    await sb
      .from("household_invites")
      .update({ status: "accepted", accepted_user_id: userId })
      .eq("id", invite.id);

    return { ok: true, birdIds: grantIds };
  });

// ---- Public: decline an invite ---------------------------------------------
export const declineHouseholdInvite = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(16) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const { error } = await sb
      .from("household_invites")
      .update({ status: "declined" })
      .eq("token", data.token)
      .eq("status", "pending");
    // A code, not copy: the invite screen shows its own message.
    if (error) { console.error("[invite] decline failed", error); throw new Error("decline_failed"); }
    return { ok: true };
  });

// ---- Member: read-only care-plan view (household or owner) ------------------
// Returns the same shape CareSheetView consumes (signed photo + clips, merged
// contacts) plus routine tasks. Access is verified via bird_members; data is
// read with the service role only after that check.
/**
 * Owner's effective emergency fields for a bird the caller is a member of.
 * Lets non-owner surfaces (care-plan overview badge) judge emergency
 * readiness from the same merged data the read view shows — the client-side
 * owner_emergency_defaults query only ever sees the VIEWER's own defaults,
 * which made the badge say "Needs info" for household members.
 */
export const getBirdEmergencyReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string }) => z.object({ birdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const userId = context.userId as string;
    const { data: membership } = await sb
      .from("bird_members")
      .select("role")
      .eq("bird_id", data.birdId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) throw new Error("Not found.");

    const { data: bird } = await sb.from("birds").select("owner_id").eq("id", data.birdId).maybeSingle();
    if (!bird) throw new Error("Not found.");
    const { data: contacts } = await sb.from("emergency_contacts").select("*").eq("bird_id", data.birdId).maybeSingle();
    const { data: defaults } = await sb
      .from("owner_emergency_defaults")
      .select("*")
      .eq("owner_id", (bird as any).owner_id)
      .maybeSingle();
    const merged = mergeEmergency(contacts, defaults) as Record<string, unknown>;
    const has = (k: string) => !!(merged?.[k] ?? "").toString().trim();
    // "Your home" reminders, judged on the same merged data the read view shows.
    const [{ data: plan }, { data: home }] = await Promise.all([
      sb.from("care_plans").select("hazards, hazards_other, off_limits, off_limits_rooms, other_pets, cleaning_instructions").eq("bird_id", data.birdId).maybeSingle(),
      sb.from("owner_home_defaults").select("*").eq("owner_id", (bird as any).owner_id).maybeSingle(),
    ]);
    const mergedPlan = mergeHome(plan ?? {}, home);
    return {
      ready: has("owner_phone") && has("avian_vet_phone"),
      homeReady: HOME_GROUPS.some((g) => birdHasOwn(mergedPlan, g)),
      homeDifferent: homeDifferences(plan, home).length > 0,
      emergencyDifferent: emergencyDifferent(contacts, defaults),
    };
  });

/**
 * The bird OWNER's account emergency defaults and display name, for a bird the
 * caller is a member of. RLS on owner_emergency_defaults only lets a user read
 * their own row, so household members would otherwise see their OWN defaults
 * on someone else's bird. Read-only: members can never edit the owner's
 * account defaults (writes stay owner-only through RLS).
 */
export const getBirdOwnerEmergency = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string }) => z.object({ birdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const userId = context.userId as string;
    const { data: membership } = await sb
      .from("bird_members")
      .select("role")
      .eq("bird_id", data.birdId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) throw new Error("Not found.");

    const { data: bird } = await sb.from("birds").select("owner_id").eq("id", data.birdId).maybeSingle();
    if (!bird) throw new Error("Not found.");
    const ownerId = (bird as any).owner_id as string;
    const [{ data: defaults }, { data: prof }] = await Promise.all([
      sb.from("owner_emergency_defaults").select("*").eq("owner_id", ownerId).maybeSingle(),
      sb.from("profiles").select("display_name").eq("id", ownerId).maybeSingle(),
    ]);
    // Real name only — never an email prefix. Empty → the client shows a
    // localized "the owner" fallback.
    let ownerName = ((prof as any)?.display_name ?? "").toString().trim();
    if (!ownerName) {
      try {
        const { data: u } = await sb.auth.admin.getUserById(ownerId);
        ownerName = (u?.user?.user_metadata?.display_name ?? "").toString().trim();
      } catch { /* keep empty */ }
    }
    return { defaults: (defaults ?? null) as Record<string, any> | null, ownerName };
  });

/** The care-plan sections a sit's birds are still missing, for the soft
 *  "will need a little more" reminder before a sit is created. Judged on the
 *  same merged data the sitter sees (per-bird answers over the owner's shared
 *  "Your home" answers and emergency defaults). Tips are optional, so they're
 *  never listed. The caller must be a member (owner or household) of each bird. */
export type SitGapSection = Exclude<SetupCheck["key"], "clips">;
export const getSitReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdIds: string[] }) => z.object({ birdIds: z.array(z.string().uuid()).min(1).max(50) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const userId = context.userId as string;
    const birdIds = [...new Set(data.birdIds)];
    const { data: memberships } = await sb.from("bird_members").select("bird_id").eq("user_id", userId).in("bird_id", birdIds);
    const allowed = new Set(((memberships ?? []) as { bird_id: string }[]).map((m) => m.bird_id));
    const ids = birdIds.filter((id) => allowed.has(id));
    if (!ids.length) return { birds: [] as { birdId: string; missing: SitGapSection[] }[] };

    const [{ data: birds }, { data: plans }, { data: contacts }] = await Promise.all([
      sb.from("birds").select("id, owner_id, normal_weight").in("id", ids),
      sb.from("care_plans").select("*").in("bird_id", ids),
      sb.from("emergency_contacts").select("*").in("bird_id", ids),
    ]);
    const ownerIds = [...new Set(((birds ?? []) as any[]).map((b) => b.owner_id as string))];
    const planIds = ((plans ?? []) as any[]).map((p) => p.id as string);
    const [{ data: ecDefaults }, { data: homeDefaults }, { data: tasks }] = await Promise.all([
      sb.from("owner_emergency_defaults").select("*").in("owner_id", ownerIds),
      sb.from("owner_home_defaults").select("*").in("owner_id", ownerIds),
      planIds.length ? sb.from("routine_tasks").select("care_plan_id").in("care_plan_id", planIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const byBird = <T,>(rows: T[] | null, key: string) => new Map(((rows ?? []) as any[]).map((r) => [r[key] as string, r as T]));
    const planByBird = byBird(plans as any[], "bird_id");
    const contactsByBird = byBird(contacts as any[], "bird_id");
    const ecByOwner = byBird(ecDefaults as any[], "owner_id");
    const homeByOwner = byBird(homeDefaults as any[], "owner_id");
    const taskCount = new Map<string, number>();
    for (const r of (tasks ?? []) as any[]) taskCount.set(r.care_plan_id, (taskCount.get(r.care_plan_id) ?? 0) + 1);

    return {
      birds: ((birds ?? []) as any[]).map((b) => {
        const plan = planByBird.get(b.id) as any;
        const { checks } = computeSetupCompleteness({
          bird: b,
          plan: mergeHome(plan ?? null, homeByOwner.get(b.owner_id) as any),
          tasksCount: plan ? taskCount.get(plan.id) ?? 0 : 0,
          contacts: contactsByBird.get(b.id) ?? null,
          defaults: ecByOwner.get(b.owner_id) ?? null,
        });
        const missing = checks.filter((c) => !c.done && c.key !== "clips").map((c) => c.key as SitGapSection);
        return { birdId: b.id as string, missing };
      }),
    };
  });

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
    const { data: home } = await sb
      .from("owner_home_defaults")
      .select("*")
      .eq("owner_id", (bird as any).owner_id)
      .maybeSingle();

    // Sign photo + clips.
    const signedBird = { ...bird, photo_url: await signBirdPhotoPath(sb, (bird as any).photo_url) };
    const watchClipSlots = [
      { key: "step_up", column: "clip_step_up_path", label: "How they step up" },
      { key: "food_water", column: "clip_food_water_path", label: "How to refill food & water safely" },
      { key: "locations", column: "clip_locations_path", label: "Where everything is" },
      { key: "bedtime", column: "clip_bedtime_path", label: "Settling them for the night" },
      { key: "food_prep", column: "clip_food_prep_path", label: "Food prep" },
      { key: "toys_foraging", column: "clip_toys_foraging_path", label: "Toys & foraging" },
      { key: "targeting", column: "clip_targeting_path", label: "Targeting & interaction" },
      { key: "anything_else", column: "clip_anything_else_path", label: "Anything else?" },
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

    // Shared "Your home" reminders fill in wherever this bird has none of its own.
    return { bird: signedBird, plan: plan ? mergeHome(plan, home) : null, contacts: mergedContacts, tasks, watchClips, baselineClipUrl };
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

    // Active birds only — the household/permissions view lists birds members can
    // be given access to; passed birds live in Remembering.
    const { data: birds } = await activeOwnerBirdsMin(sb, ownerId).order("name");
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
    // Revoke the household-level permission grant FIRST. The birds SELECT RLS
    // gates a member's read on has_capability(bird, uid, 'view'), which is TRUE
    // when an household_member_permissions row exists for (owner, member) — the
    // owner-level grant created on invite-accept — INDEPENDENT of bird_members.
    // Deleting only bird_members (below) left this row intact, so removed members
    // still read every bird record (has_capability('view') → hmp branch), while
    // photos revoked (storage keys on has_bird_access → bird_members). Deleting
    // the hmp row makes has_capability('view') false so DB read and storage read
    // cut off TOGETHER. Keyed by (owner_id, member_user_id) → household-wide.
    const { error: permErr } = await sb
      .from("household_member_permissions").delete()
      .eq("owner_id", ownerId).eq("member_user_id", data.userId);
    if (permErr) throw new Error(permErr.message);

    const { data: birds } = await sb.from("birds").select("id").eq("owner_id", ownerId);
    const birdIds = (birds ?? []).map((b: any) => b.id);
    if (!birdIds.length) return { ok: true };
    const { error } = await sb
      .from("bird_members").delete()
      .in("bird_id", birdIds).eq("user_id", data.userId).eq("role", "household");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
