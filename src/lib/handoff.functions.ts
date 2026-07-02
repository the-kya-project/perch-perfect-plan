// Bird handoff (transfer of ownership) + foster-fail server functions.
// In-app transfer is atomic via the handoff_accept_transfer SQL function;
// PDF/offline handoff snapshots Past birds then deletes the bird (no recipient
// account). Owner actions are authenticated; the accept/decline path is token +
// service role. No notifications/reminders — transactional email only.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildHandoffInviteEmail, buildHandoffAcceptedEmail, buildHandoffDeclinedEmail } from "./emailTemplates";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
function appUrl() {
  return process.env.APP_URL || "https://app.thekyaproject.com";
}
function makeToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}
async function displayName(sb: any, userId: string): Promise<string> {
  const { data } = await sb.from("profiles").select("display_name").eq("id", userId).maybeSingle();
  const n = (data?.display_name ?? "").toString().trim();
  if (n) return n;
  try {
    const { data: u } = await sb.auth.admin.getUserById(userId);
    return (u?.user?.user_metadata?.display_name ?? "").toString().trim() || u?.user?.email?.split("@")[0] || "Someone";
  } catch { return "Someone"; }
}
async function sendEmail(to: string, toName: string | undefined, built: { subject: string; html: string; text: string }) {
  const { sendTransactionalEmail } = await import("./brevoEmail.server");
  await sendTransactionalEmail({ to, toName, subject: built.subject, htmlContent: built.html, textContent: built.text });
}

// Build a small, SELF-CONTAINED keepsake thumbnail (base64 data URL) from a
// bird's photo, captured at handoff time. The live photo moves to the new owner
// and the sender loses storage access, so we bake a tiny copy into the past_birds
// row (owner-read RLS covers it; no storage access needed to display later).
// Best-effort: any failure returns null and the archive just shows an icon.
async function keepsakeThumb(sb: any, photoUrl: string | null | undefined): Promise<string | null> {
  const src = (photoUrl ?? "").toString();
  if (!src) return null;
  try {
    // Legacy inline data: URL — already self-contained; keep it if it's small.
    if (src.startsWith("data:")) return src.length <= 200_000 ? src : null;
    if (src.startsWith("http")) return null; // external URL — don't retain
    // Storage path: transform to a small thumbnail, fetch the bytes, base64 it.
    const { data } = await sb.storage
      .from("bird-photos")
      .createSignedUrl(src, 120, { transform: { width: 200, height: 200, resize: "cover", quality: 60 } });
    if (!data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 200_000) return null; // safety cap
    const mime = res.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

// ---- Owner: start an in-app handoff ----------------------------------------
export const createHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string; recipientEmail: string; recipientName?: string }) =>
    z.object({
      birdId: z.string().uuid(),
      recipientEmail: z.string().email(),
      recipientName: z.string().trim().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const senderId = context.userId as string;
    const { data: bird } = await sb.from("birds").select("id, name, owner_id").eq("id", data.birdId).maybeSingle();
    if (!bird || bird.owner_id !== senderId) throw new Error("You can only hand off a bird you own.");

    // One pending handoff at a time.
    const { data: existing } = await sb
      .from("handoffs").select("id").eq("bird_id", data.birdId).eq("status", "pending").maybeSingle();
    if (existing) throw new Error("There's already a handoff pending for this bird.");

    const token = makeToken();
    const { data: handoff, error } = await sb.from("handoffs").insert({
      bird_id: data.birdId,
      sender_user_id: senderId,
      recipient_email: data.recipientEmail,
      recipient_name: data.recipientName?.trim() || null,
      mode: "app",
      token,
      status: "pending",
    }).select("id, recipient_email, recipient_name, status, expires_at").single();
    if (error) throw new Error(error.message);

    try {
      const senderName = await displayName(sb, senderId);
      await sendEmail(data.recipientEmail, data.recipientName?.trim() || undefined,
        buildHandoffInviteEmail({ senderName, birdName: bird.name as string, link: `${appUrl()}/handoff/${token}` }));
    } catch (e) { console.error("[handoff] invite email failed", e); }

    return { ok: true, handoff };
  });

// ---- Owner: pending handoff state for a bird -------------------------------
export const getPendingHandoff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string }) => z.object({ birdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const { data: h } = await sb
      .from("handoffs")
      .select("id, recipient_email, recipient_name, status, expires_at, mode")
      .eq("bird_id", data.birdId)
      .eq("sender_user_id", context.userId as string)
      .eq("status", "pending")
      .maybeSingle();
    if (!h) return { pending: null };
    if (new Date(h.expires_at as string).getTime() <= Date.now()) {
      await sb.from("handoffs").update({ status: "expired" }).eq("id", h.id);
      return { pending: null };
    }
    return { pending: { id: h.id, email: h.recipient_email, name: h.recipient_name } };
  });

// ---- Owner: cancel a pending handoff ---------------------------------------
export const cancelHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { handoffId: string }) => z.object({ handoffId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const { error } = await sb.from("handoffs").update({ status: "canceled" })
      .eq("id", data.handoffId).eq("sender_user_id", context.userId as string).eq("status", "pending");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---- Owner: complete a PDF/offline handoff (snapshot + delete the bird) -----
export const completePdfHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string; recipientName?: string }) =>
    z.object({ birdId: z.string().uuid(), recipientName: z.string().trim().max(120).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const senderId = context.userId as string;
    const { data: bird } = await sb.from("birds")
      .select("id, name, species, intake_date, is_foster, owner_id, photo_url").eq("id", data.birdId).maybeSingle();
    if (!bird || (bird as any).owner_id !== senderId) throw new Error("Not allowed.");

    // Keepsake thumbnail before the record is deleted below.
    const thumb = await keepsakeThumb(sb, (bird as any).photo_url);

    // Snapshot the sender's memory BEFORE removing the record.
    const { error: pbErr } = await sb.from("past_birds").insert({
      original_owner_id: senderId,
      bird_name: (bird as any).name,
      species: (bird as any).species ?? null,
      intake_date: (bird as any).intake_date ?? null,
      departed_on: new Date().toISOString().slice(0, 10),
      recipient_name: data.recipientName?.trim() || null,
      mode: "pdf",
      was_foster: !!(bird as any).is_foster,
      photo_thumb: thumb,
    } as any);
    if (pbErr) throw new Error(pbErr.message);

    // The record left as a PDF — delete the DB record (cascades its data).
    const { error: delErr } = await sb.from("birds").delete().eq("id", data.birdId);
    if (delErr) throw new Error(delErr.message);
    return { ok: true };
  });

// ---- Owner: foster-fail — make a foster permanent --------------------------
export const makePermanent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { birdId: string }) => z.object({ birdId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const senderId = context.userId as string;
    const today = new Date().toISOString().slice(0, 10);
    const { data: bird } = await sb.from("birds").select("owner_id, is_foster").eq("id", data.birdId).maybeSingle();
    if (!bird || (bird as any).owner_id !== senderId) throw new Error("Not allowed.");

    const { error } = await sb.from("birds")
      .update({ is_foster: false, became_permanent_on: today }).eq("id", data.birdId);
    if (error) throw new Error(error.message);

    // Celebratory anchor Moment (year-over-year). Don't duplicate if re-run.
    const { data: existing } = await sb.from("moments")
      .select("id").eq("bird_id", data.birdId).eq("kind", "custom").eq("title", "Joined the flock").maybeSingle();
    if (!existing) {
      await sb.from("moments").insert({
        bird_id: data.birdId, kind: "custom", title: "Joined the flock",
        on_date: today, auto_generated: true, recurs: true,
      });
    }
    return { ok: true };
  });

// ---- Owner: Past birds archive ---------------------------------------------
export const getPastBirds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await getAdmin();
    const { data } = await sb.from("past_birds")
      .select("id, bird_name, species, intake_date, departed_on, recipient_name, mode, was_foster, photo_thumb")
      .eq("original_owner_id", context.userId as string)
      .order("departed_on", { ascending: false });
    return { birds: data ?? [] };
  });

// ---- Public: read a handoff by token (safe fields only) --------------------
export const getHandoff = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(16) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const { data: h } = await sb.from("handoffs")
      .select("id, bird_id, sender_user_id, recipient_email, status, expires_at").eq("token", data.token).maybeSingle();
    if (!h) return { valid: false as const };
    const expired = new Date(h.expires_at as string).getTime() <= Date.now();
    if (h.status !== "pending" || expired) {
      if (h.status === "pending" && expired) await sb.from("handoffs").update({ status: "expired" }).eq("id", h.id);
      return { valid: false as const };
    }
    const senderName = await displayName(sb, h.sender_user_id as string);
    const { data: bird } = await sb.from("birds").select("name").eq("id", h.bird_id).maybeSingle();
    return {
      valid: true as const,
      senderName,
      birdName: (bird?.name ?? "this bird") as string,
      recipientEmail: h.recipient_email as string,
    };
  });

// ---- Authenticated: accept a handoff (atomic transfer) ---------------------
export const acceptHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(16) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = await getAdmin();
    const userId = context.userId as string;
    let email = (context.claims?.email ?? "").toString().toLowerCase();
    if (!email) { try { const { data: u } = await sb.auth.admin.getUserById(userId); email = (u?.user?.email ?? "").toLowerCase(); } catch { /* */ } }

    const { data: h } = await sb.from("handoffs")
      .select("id, bird_id, sender_user_id, recipient_email, status, expires_at").eq("token", data.token).maybeSingle();
    if (!h) throw new Error("This handoff isn't active anymore.");
    if (h.status !== "pending" || new Date(h.expires_at as string).getTime() <= Date.now()) throw new Error("This handoff isn't active anymore.");
    if (email && email !== (h.recipient_email as string).toLowerCase()) {
      throw new Error(`This handoff was sent to ${h.recipient_email}. Sign in with that email to accept.`);
    }
    if (userId === h.sender_user_id) throw new Error("That's your own handoff.");

    // Capture a keepsake thumbnail BEFORE the transfer (the photo is about to move
    // to the new owner's folder). Passed to the RPC so it lands on past_birds in
    // the same atomic snapshot. Best-effort — null just means an icon in the archive.
    const { data: preBird } = await sb.from("birds").select("photo_url").eq("id", h.bird_id).maybeSingle();
    const thumb = await keepsakeThumb(sb, (preBird as any)?.photo_url);

    const { error } = await (sb as any).rpc("handoff_accept_transfer", { p_handoff_id: h.id, p_new_owner: userId, p_photo_thumb: thumb });
    if (error) throw new Error(error.message);

    // The RPC revokes the old owner's DB + membership access atomically, but the
    // bird's profile photo object physically lives in the UPLOADER's storage
    // folder ("<uploader_uid>/<file>.jpg"), and the bird-photos "owner" storage
    // policies grant read by folder prefix — so without this the previous owner
    // would keep direct storage access to that one image. Move it into the new
    // owner's folder so DB and storage revoke together (the new owner still reads
    // it via has_bird_access; this just strips the old owner's folder-prefix grant).
    try {
      const { data: b } = await sb.from("birds").select("photo_url").eq("id", h.bird_id).maybeSingle();
      const photoUrl = (b?.photo_url ?? "").toString();
      const slash = photoUrl.indexOf("/");
      const firstSeg = slash > 0 ? photoUrl.slice(0, slash) : "";
      // Only relocate real storage objects still under a DIFFERENT user's folder
      // (skip legacy data:/http URLs and anything already in the new owner's folder).
      if (slash > 0 && firstSeg !== userId && !photoUrl.startsWith("data:") && !photoUrl.startsWith("http")) {
        const newPath = `${userId}/${photoUrl.slice(slash + 1)}`;
        const { error: moveErr } = await sb.storage.from("bird-photos").move(photoUrl, newPath);
        if (!moveErr) await sb.from("birds").update({ photo_url: newPath }).eq("id", h.bird_id);
        else console.error("[handoff] profile photo relocate failed", moveErr);
      }
    } catch (e) { console.error("[handoff] profile photo relocate error", e); }

    // Notify the sender it's done (best-effort).
    try {
      const recipientLabel = await displayName(sb, userId);
      const { data: bird } = await sb.from("birds").select("name").eq("id", h.bird_id).maybeSingle();
      const { data: su } = await sb.auth.admin.getUserById(h.sender_user_id as string);
      if (su?.user?.email) await sendEmail(su.user.email, undefined, buildHandoffAcceptedEmail({ birdName: (bird?.name ?? "your bird") as string, recipientLabel }));
    } catch (e) { console.error("[handoff] accepted email failed", e); }

    return { ok: true, birdId: h.bird_id as string };
  });

// ---- Public: decline a handoff ---------------------------------------------
export const declineHandoff = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => z.object({ token: z.string().min(16) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await getAdmin();
    const { data: h } = await sb.from("handoffs").select("id, bird_id, sender_user_id, status").eq("token", data.token).maybeSingle();
    if (!h || h.status !== "pending") return { ok: true };
    await sb.from("handoffs").update({ status: "declined" }).eq("id", h.id);
    try {
      const { data: bird } = await sb.from("birds").select("name").eq("id", h.bird_id).maybeSingle();
      const { data: su } = await sb.auth.admin.getUserById(h.sender_user_id as string);
      if (su?.user?.email) await sendEmail(su.user.email, undefined, buildHandoffDeclinedEmail({ birdName: (bird?.name ?? "your bird") as string }));
    } catch (e) { console.error("[handoff] declined email failed", e); }
    return { ok: true };
  });
