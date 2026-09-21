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
  | "weight_reminder"
  | "checkin_reminder"
  | "health_concern";

const TOGGLE_COLUMN: Record<Exclude<EventKey, "health_concern">, string> = {
  sitter_log: "push_sitter_log",
  care_plan_reminder: "push_care_plan_reminder",
  weight_reminder: "push_weight_reminder",
  checkin_reminder: "push_checkin_reminder",
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
  const webPushReady = !!(subject && publicKey && privateKey);

  // NOTE: this used to bail out entirely when VAPID was unset, which would now
  // silently disable NATIVE push too. Each transport is gated on its own
  // credentials instead, so a missing VAPID key only skips the web rows.

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
    .select("id, transport, endpoint, p256dh, auth, token")
    .eq("user_id", ownerId);
  if (!subs || subs.length === 0) return { sent: 0, pruned: 0, skipped: "no-subscriptions" };

  const { sendApns, apnsConfigured } = await import("./apns.server");
  const { sendFcm, fcmConfigured } = await import("./fcm.server");

  const body = JSON.stringify(payload);
  let sent = 0;
  const toPrune: string[] = [];
  const skippedTransports = new Set<string>();

  // web-push is only loaded (and VAPID only configured) when there is actually
  // a web row to send to -- native-only users should not pay for the import.
  let webpush: typeof import("web-push") | null = null;
  if (webPushReady && subs.some((s) => (s.transport ?? "webpush") === "webpush")) {
    webpush = (await import("web-push")).default;
    webpush.setVapidDetails(subject!, publicKey!, privateKey!);
  }

  await Promise.all(
    subs.map(async (s) => {
      const transport = (s.transport ?? "webpush") as "webpush" | "apns" | "fcm";
      try {
        if (transport === "webpush") {
          if (!webpush) { skippedTransports.add("vapid-not-configured"); return; }
          await webpush.sendNotification(
            { endpoint: s.endpoint!, keys: { p256dh: s.p256dh!, auth: s.auth! } },
            body,
            { TTL: 60 * 60 * 24 },
          );
          sent += 1;
          return;
        }

        if (!s.token) { toPrune.push(s.id); return; }

        if (transport === "apns") {
          if (!apnsConfigured()) { skippedTransports.add("apns-not-configured"); return; }
          const res = await sendApns(s.token, payload);
          if (res.ok) sent += 1;
          else if (res.prune) toPrune.push(s.id);
          else console.error("[push] apns failed", res.reason);
          return;
        }

        if (transport === "fcm") {
          if (!fcmConfigured()) { skippedTransports.add("fcm-not-configured"); return; }
          const res = await sendFcm(s.token, payload);
          if (res.ok) sent += 1;
          else if (res.prune) toPrune.push(s.id);
          else console.error("[push] fcm failed", res.reason);
        }
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) toPrune.push(s.id);
        else console.error("[push] send failed", transport, status, err);
      }
    }),
  );

  if (toPrune.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", toPrune);
  }
  // Only report "skipped" when nothing at all went out, so a partly-configured
  // setup still reads as a success for the transports that did deliver.
  const skipped =
    sent === 0 && skippedTransports.size > 0 ? [...skippedTransports].join(",") : undefined;
  return { sent, pruned: toPrune.length, skipped };
}
