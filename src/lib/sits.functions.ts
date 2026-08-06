// Sit notification server functions — email a household caregiver when they're
// assigned to, or affected by changes to, a sit. Owner -> caregiver, transactional,
// unconditional (not preference-gated). External-sitter sits are a separate
// token flow and are NEVER touched here.
//
// These run AFTER the client-side sits insert/update/delete (Option B) — sit
// creation/editing/deletion stays client-side. Each is authorized to the sit's
// owner, no-ops for external sits, resolves the caregiver email + names via the
// service role, and returns { ok, emailed, reason?, caregiverName? } so the
// client can surface a precise failure toast. Email is best-effort: a send
// failure never throws, it comes back as emailed:false.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildSitAssignedEmail, buildSitUpdatedEmail, buildSitCancelledEmail,
  buildSitterInviteEmail, buildSitterInviteUpdatedEmail, buildSitterInviteCancelledEmail,
  type BuiltEmail,
} from "./emailTemplates";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function appUrl() {
  return process.env.APP_URL || "https://app.thekyaproject.com";
}

// Human list: "Willow", "Willow and Moxie", "Willow, Moxie, and Kiwi".
function joinNames(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return "your birds";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(", ")}, and ${n[n.length - 1]}`;
}

// "Aug 12, 2026" (UTC — sit dates are calendar dates, no timezone shift).
function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
function fmtRange(start: string, end: string): string {
  return start === end ? fmtDate(start) : `${fmtDate(start)} – ${fmtDate(end)}`;
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

// Caregiver email + display name via the service role. auth.email is the reliable
// source (profiles.email can be null); mirrors household.functions.
async function resolveCaregiver(sb: any, userId: string): Promise<{ email: string | null; name: string | null }> {
  try {
    const { data: u } = await sb.auth.admin.getUserById(userId);
    const email = (u?.user?.email ?? "").toString().trim() || null;
    const meta = (u?.user?.user_metadata?.display_name ?? "").toString().trim();
    const name = meta || (email ? email.split("@")[0] : "") || null;
    return { email, name };
  } catch {
    return { email: null, name: null };
  }
}

// Bird names for the given ids, in the passed order.
async function birdNames(sb: any, birdIds: string[]): Promise<string[]> {
  const { data } = await sb.from("birds").select("id, name").in("id", birdIds);
  const byId = new Map((data ?? []).map((b: any) => [b.id, b.name as string]));
  return birdIds.map((id) => byId.get(id)).filter(Boolean) as string[];
}

async function send(built: BuiltEmail, to: string, toName: string | null): Promise<boolean> {
  const { sendTransactionalEmail } = await import("./brevoEmail.server");
  const res = await sendTransactionalEmail({
    to,
    toName: toName || undefined,
    subject: built.subject,
    htmlContent: built.html,
    textContent: built.text,
  });
  return res.ok;
}

export type NotifyResult = { ok: boolean; emailed: boolean; reason?: string; caregiverName?: string };

// ── Assigned (create) ────────────────────────────────────────────────────────
export const notifySitAssigned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sitId: string }) => z.object({ sitId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<NotifyResult> => {
    const sb = await getAdmin();
    const ownerId = (context as any).userId as string;
    const { data: sit } = await sb
      .from("sits")
      .select("id, owner_id, caregiver_user_id, start_date, end_date")
      .eq("id", data.sitId)
      .maybeSingle();
    if (!sit) return { ok: false, emailed: false, reason: "sit-not-found" };
    if (sit.owner_id !== ownerId) throw new Error("Not authorized");
    if (!sit.caregiver_user_id) return { ok: true, emailed: false, reason: "external-sit" };

    const { data: sbRows } = await sb.from("sit_birds").select("bird_id").eq("sit_id", sit.id);
    const ids = (sbRows ?? []).map((r: any) => r.bird_id as string);
    const { email, name } = await resolveCaregiver(sb, sit.caregiver_user_id);
    if (!email) return { ok: true, emailed: false, reason: "no-caregiver-email", caregiverName: name ?? undefined };

    const built = buildSitAssignedEmail({
      ownerName: await ownerDisplayName(sb, ownerId),
      birdNames: joinNames(await birdNames(sb, ids)),
      dateRange: fmtRange(sit.start_date, sit.end_date),
      link: `${appUrl()}/today`,
    });
    const ok = await send(built, email, name);
    if (!ok) console.error("[sits] assigned email failed for sit", sit.id);
    return { ok: true, emailed: ok, reason: ok ? undefined : "send-failed", caregiverName: name ?? undefined };
  });

// ── Updated (edit: dates and/or bird-set changed) ────────────────────────────
export const notifySitUpdated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sitId: string; datesChanged: boolean; birdsChanged: boolean }) =>
    z.object({ sitId: z.string().uuid(), datesChanged: z.boolean(), birdsChanged: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<NotifyResult> => {
    const sb = await getAdmin();
    const ownerId = (context as any).userId as string;
    const { data: sit } = await sb
      .from("sits")
      .select("id, owner_id, caregiver_user_id, start_date, end_date")
      .eq("id", data.sitId)
      .maybeSingle();
    if (!sit) return { ok: false, emailed: false, reason: "sit-not-found" };
    if (sit.owner_id !== ownerId) throw new Error("Not authorized");
    if (!sit.caregiver_user_id) return { ok: true, emailed: false, reason: "external-sit" };

    const parts: string[] = [];
    if (data.datesChanged) parts.push("the dates");
    if (data.birdsChanged) parts.push("which birds you're covering");
    const changeSummary = parts.join(" and ") || "some details";

    const { data: sbRows } = await sb.from("sit_birds").select("bird_id").eq("sit_id", sit.id);
    const ids = (sbRows ?? []).map((r: any) => r.bird_id as string);
    const { email, name } = await resolveCaregiver(sb, sit.caregiver_user_id);
    if (!email) return { ok: true, emailed: false, reason: "no-caregiver-email", caregiverName: name ?? undefined };

    const built = buildSitUpdatedEmail({
      ownerName: await ownerDisplayName(sb, ownerId),
      birdNames: joinNames(await birdNames(sb, ids)),
      dateRange: fmtRange(sit.start_date, sit.end_date),
      changeSummary,
      link: `${appUrl()}/today`,
    });
    const ok = await send(built, email, name);
    if (!ok) console.error("[sits] updated email failed for sit", sit.id);
    return { ok: true, emailed: ok, reason: ok ? undefined : "send-failed", caregiverName: name ?? undefined };
  });

// ── Cancelled (delete) ───────────────────────────────────────────────────────
// The sit row is already gone by the time this runs (the client deletes first,
// so a FAILED delete can never send a false cancellation), so the details are
// passed in. Authorization is by bird ownership: the caller must own every bird
// passed — which also proves they were the sit's owner.
export const notifySitCancelled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caregiverUserId: string; birdIds: string[]; startDate: string; endDate: string }) =>
    z
      .object({
        caregiverUserId: z.string().uuid(),
        birdIds: z.array(z.string().uuid()).min(1).max(50),
        startDate: z.string(),
        endDate: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<NotifyResult> => {
    const sb = await getAdmin();
    const ownerId = (context as any).userId as string;

    const { data: rows } = await sb.from("birds").select("id, name, owner_id").in("id", data.birdIds);
    const birds = (rows ?? []) as { id: string; name: string; owner_id: string }[];
    if (!birds.length) return { ok: false, emailed: false, reason: "no-birds" };
    // Every returned bird must belong to the caller — proves ownership, blocks
    // a non-owner from firing arbitrary cancellation emails.
    if (birds.some((b) => b.owner_id !== ownerId)) throw new Error("Not authorized");

    const nameById = new Map(birds.map((b) => [b.id, b.name]));
    const names = data.birdIds.map((id) => nameById.get(id)).filter(Boolean) as string[];
    const { email, name } = await resolveCaregiver(sb, data.caregiverUserId);
    if (!email) return { ok: true, emailed: false, reason: "no-caregiver-email", caregiverName: name ?? undefined };

    const built = buildSitCancelledEmail({
      ownerName: await ownerDisplayName(sb, ownerId),
      birdNames: joinNames(names),
      dateRange: fmtRange(data.startDate, data.endDate),
      link: `${appUrl()}/today`,
    });
    const ok = await send(built, email, name);
    if (!ok) console.error("[sits] cancelled email failed for caregiver", data.caregiverUserId);
    return { ok: true, emailed: ok, reason: ok ? undefined : "send-failed", caregiverName: name ?? undefined };
  });

// ─────────────────────────────────────────────────────────────────────────────
// External (token-link) sitter notifications. Distinct from the caregiver fns
// above, and the exact INVERSE of their guard: these fire ONLY for external sits
// (invite_token present, caregiver_user_id null) and no-op for household sits.
// The recipient has no account, so the address is sits.sitter_email (a column) —
// never an auth lookup. Same best-effort, failure-visible contract.
// ─────────────────────────────────────────────────────────────────────────────

export type SitterNotifyResult = { ok: boolean; emailed: boolean; reason?: string; sitterName?: string };

// Shared load + validity gate for the token-link path. Returns a reason (no
// send) when the row is missing, not an external sit, revoked, expired, or has
// no sitter email — mirrors loadSitByToken's revoke/expiry checks so we never
// email a dead link.
async function loadSendableSitterSit(sb: any, sitId: string, ownerId: string) {
  const { data: sit } = await sb
    .from("sits")
    .select("id, owner_id, caregiver_user_id, invite_token, token_expires_at, revoked, sitter_email, sitter_name, start_date, end_date")
    .eq("id", sitId)
    .maybeSingle();
  if (!sit) return { sit: null, reason: "sit-not-found" as const };
  if (sit.owner_id !== ownerId) throw new Error("Not authorized");
  if (sit.caregiver_user_id || !sit.invite_token) return { sit, reason: "household-sit" as const };
  if (sit.revoked) return { sit, reason: "token-revoked" as const };
  if (!sit.token_expires_at || new Date(sit.token_expires_at) < new Date()) return { sit, reason: "token-expired" as const };
  if (!((sit.sitter_email ?? "").trim())) return { sit, reason: "no-sitter-email" as const };
  return { sit, reason: null };
}

// ── Invite (external sit created) ────────────────────────────────────────────
export const notifySitterInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sitId: string }) => z.object({ sitId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SitterNotifyResult> => {
    const sb = await getAdmin();
    const ownerId = (context as any).userId as string;
    const { sit, reason } = await loadSendableSitterSit(sb, data.sitId, ownerId);
    if (reason) return { ok: reason === "sit-not-found" ? false : true, emailed: false, reason, sitterName: sit?.sitter_name ?? undefined };

    const { data: sbRows } = await sb.from("sit_birds").select("bird_id").eq("sit_id", sit.id);
    const ids = (sbRows ?? []).map((r: any) => r.bird_id as string);
    const built = buildSitterInviteEmail({
      ownerName: await ownerDisplayName(sb, ownerId),
      birdNames: joinNames(await birdNames(sb, ids)),
      dateRange: fmtRange(sit.start_date, sit.end_date),
      link: `${appUrl()}/sitter/${sit.invite_token}`,
    });
    const ok = await send(built, (sit.sitter_email as string).trim(), sit.sitter_name);
    if (!ok) console.error("[sits] sitter invite email failed for sit", sit.id);
    return { ok: true, emailed: ok, reason: ok ? undefined : "send-failed", sitterName: sit.sitter_name ?? undefined };
  });

// ── Updated (external sit edited: dates and/or bird-set changed) ──────────────
export const notifySitterInviteUpdated = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sitId: string; datesChanged: boolean; birdsChanged: boolean }) =>
    z.object({ sitId: z.string().uuid(), datesChanged: z.boolean(), birdsChanged: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<SitterNotifyResult> => {
    const sb = await getAdmin();
    const ownerId = (context as any).userId as string;
    const { sit, reason } = await loadSendableSitterSit(sb, data.sitId, ownerId);
    if (reason) return { ok: reason === "sit-not-found" ? false : true, emailed: false, reason, sitterName: sit?.sitter_name ?? undefined };

    const parts: string[] = [];
    if (data.datesChanged) parts.push("the dates");
    if (data.birdsChanged) parts.push("which birds you're covering");
    const changeSummary = parts.join(" and ") || "some details";

    const { data: sbRows } = await sb.from("sit_birds").select("bird_id").eq("sit_id", sit.id);
    const ids = (sbRows ?? []).map((r: any) => r.bird_id as string);
    const built = buildSitterInviteUpdatedEmail({
      ownerName: await ownerDisplayName(sb, ownerId),
      birdNames: joinNames(await birdNames(sb, ids)),
      dateRange: fmtRange(sit.start_date, sit.end_date),
      changeSummary,
      link: `${appUrl()}/sitter/${sit.invite_token}`,
    });
    const ok = await send(built, (sit.sitter_email as string).trim(), sit.sitter_name);
    if (!ok) console.error("[sits] sitter update email failed for sit", sit.id);
    return { ok: true, emailed: ok, reason: ok ? undefined : "send-failed", sitterName: sit.sitter_name ?? undefined };
  });

// ── Cancelled (external sit deleted) ─────────────────────────────────────────
// The row (and its token/sit_birds) is gone by the time this runs, so the
// details — including the sitter's email — are passed in, captured before the
// delete. Authorized by bird ownership: the caller must own every bird passed,
// which proves they owned the sit. No link (the token is already dead).
export const notifySitterCancelled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdIds: string[]; startDate: string; endDate: string; sitterEmail: string; sitterName?: string | null }) =>
    z
      .object({
        birdIds: z.array(z.string().uuid()).min(1).max(50),
        startDate: z.string(),
        endDate: z.string(),
        sitterEmail: z.string(),
        sitterName: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<SitterNotifyResult> => {
    const sb = await getAdmin();
    const ownerId = (context as any).userId as string;
    const to = (data.sitterEmail ?? "").trim();
    if (!to) return { ok: true, emailed: false, reason: "no-sitter-email", sitterName: data.sitterName ?? undefined };

    const { data: rows } = await sb.from("birds").select("id, name, owner_id").in("id", data.birdIds);
    const birds = (rows ?? []) as { id: string; name: string; owner_id: string }[];
    if (!birds.length) return { ok: false, emailed: false, reason: "no-birds" };
    if (birds.some((b) => b.owner_id !== ownerId)) throw new Error("Not authorized");

    const nameById = new Map(birds.map((b) => [b.id, b.name]));
    const names = data.birdIds.map((id) => nameById.get(id)).filter(Boolean) as string[];
    const built = buildSitterInviteCancelledEmail({
      ownerName: await ownerDisplayName(sb, ownerId),
      birdNames: joinNames(names),
      dateRange: fmtRange(data.startDate, data.endDate),
    });
    const ok = await send(built, to, data.sitterName ?? null);
    if (!ok) console.error("[sits] sitter cancelled email failed");
    return { ok: true, emailed: ok, reason: ok ? undefined : "send-failed", sitterName: data.sitterName ?? undefined };
  });
