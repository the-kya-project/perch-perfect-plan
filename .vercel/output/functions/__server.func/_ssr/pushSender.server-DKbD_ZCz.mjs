const TOGGLE_COLUMN = {
  sitter_opened: "push_sitter_opened",
  sitter_log: "push_sitter_log",
  care_plan_reminder: "push_care_plan_reminder"
};
async function sendPushToOwner(ownerId, eventKey, payload) {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    return { sent: 0, pruned: 0, skipped: "vapid-not-configured" };
  }
  const { supabaseAdmin } = await import("./client.server-D5ro3rAQ.mjs");
  if (eventKey !== "health_concern") {
    const col = TOGGLE_COLUMN[eventKey];
    const { data: profile } = await supabaseAdmin.from("profiles").select(col).eq("id", ownerId).maybeSingle();
    if (!profile || !profile[col]) {
      return { sent: 0, pruned: 0, skipped: "toggle-off" };
    }
  }
  const { data: subs } = await supabaseAdmin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", ownerId);
  if (!subs || subs.length === 0) return { sent: 0, pruned: 0, skipped: "no-subscriptions" };
  const webpush = (await import("../_libs/web-push.mjs").then(function(n) {
    return n.i;
  })).default;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  const body = JSON.stringify(payload);
  let sent = 0;
  const toPrune = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
          { TTL: 60 * 60 * 24 }
        );
        sent += 1;
      } catch (err) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) toPrune.push(s.id);
        else console.error("[push] send failed", status, err);
      }
    })
  );
  if (toPrune.length > 0) {
    await supabaseAdmin.from("push_subscriptions").delete().in("id", toPrune);
  }
  return { sent, pruned: toPrune.length };
}
export {
  sendPushToOwner
};
