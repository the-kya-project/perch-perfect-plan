/**
 * Server functions for web-push subscription management.
 *
 * The web-push library and VAPID secrets are loaded inside handler bodies
 * via dynamic import so they never leak into the client bundle.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) throw new Error("VAPID_PUBLIC_KEY is not configured.");
  return { publicKey: key };
});

export const savePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { endpoint: string; p256dh: string; auth: string; userAgent?: string }) =>
    z.object({
      endpoint: z.string().url(),
      p256dh: z.string().min(1),
      auth: z.string().min(1),
      userAgent: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: userId,
          endpoint: data.endpoint,
          p256dh: data.p256dh,
          auth: data.auth,
          user_agent: data.userAgent ?? null,
          last_used_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deletePushSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { endpoint: string }) =>
    z.object({ endpoint: z.string().url() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", data.endpoint);
    return { ok: true };
  });

/**
 * Register a NATIVE device token (APNs on iOS, FCM on Android).
 *
 * Uses the admin client on purpose. A device token identifies a PHONE, not an
 * account: if someone signs out and a different person signs in on the same
 * device, Apple/Google hand us the same token. Left alone, the previous user's
 * row would keep matching and they would receive the new user's notifications.
 * So any existing row for this token is cleared first, regardless of who owns
 * it -- which RLS would (correctly) forbid from a user-scoped client.
 *
 * `userId` comes from the verified session via middleware, never from input,
 * so this cannot be used to write a row for someone else.
 */
export const savePushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string; transport: "apns" | "fcm"; userAgent?: string }) =>
    z.object({
      token: z.string().min(16).max(512),
      transport: z.enum(["apns", "fcm"]),
      userAgent: z.string().max(400).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Reassign the device rather than duplicate it (see note above).
    await supabaseAdmin.from("push_subscriptions").delete().eq("token", data.token);

    const { data: rows, error } = await supabaseAdmin
      .from("push_subscriptions")
      .insert({
        user_id: userId,
        transport: data.transport,
        token: data.token,
        user_agent: data.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      })
      .select("id");
    if (error) throw new Error(error.message);
    // A silent 0-row write is the failure mode that hides here; require proof.
    if (!rows || rows.length !== 1) throw new Error("push token was not stored");
    return { ok: true };
  });

/** Drop a native device token (user turned push off, or signed out). */
export const deletePushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string }) =>
    z.object({ token: z.string().min(16).max(512) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("token", data.token);
    return { ok: true };
  });
