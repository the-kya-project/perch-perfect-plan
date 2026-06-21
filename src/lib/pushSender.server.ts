/**
 * Server-only push sender. Imported dynamically inside server-function
 * handlers so the web-push library and VAPID private key never reach the
 * client bundle.
 *
 * Event keys map 1:1 to `profiles.push_*` toggles, plus a special
 * "health_concern" key that is always sent (cannot be disabled).
 */

type EventKey =
  | "sitter_log"
  | "care_plan_reminder"
  | "health_concern";

const TOGGLE_COLUMN: Record<Exclude<EventKey, "health_concern">, string> = {
  sitter_log: "push_sitter_log",
  care_plan_reminder: "push_care_plan_reminder",
};

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
}

/**
 * Send a push to every active subscription belonging to `ownerId`, gated by
 * the owner's per-event toggle (except `health_concern`, which is always on).
 * Subscriptions that return 404/410 are pruned automatically.
 */
export async function sendPushToOwner(
  ownerId: string,
  eventKey: EventKey,
  payload: PushPayload,
): Promise<{ sent: number; pruned: number; skipped?: string }> {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    return { sent: 0, pruned: 0, skipped: "vapid-not-configured" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Toggle gate (skip for safety-critical health concerns).
  if (eventKey !== "health_concern") {
    const col = TOGGLE_COLUMN[eventKey];
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select(col)
      .eq("id", ownerId)
      .maybeSingle();
    if (!profile || !(profile as unknown as Record<string, unknown>)[col]) {
      return { sent: 0, pruned: 0, skipped: "toggle-off" };
    }
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", ownerId);
  if (!subs || subs.length === 0) return { sent: 0, pruned: 0, skipped: "no-subscriptions" };

  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const body = JSON.stringify(payload);
  let sent = 0;
  const toPrune: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24 },
        );
        sent += 1;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) toPrune.push(s.id);
        else console.error("[push] send failed", status, err);
      }
    }),
  );

  if (toPrune.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", toPrune);
  }
  return { sent, pruned: toPrune.length };
}
