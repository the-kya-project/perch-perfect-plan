import { c as createServerRpc } from "./createServerRpc-ogiVSUVQ.mjs";
import { c as createServerFn } from "./server-9nIpN7MJ.mjs";
import { r as requireSupabaseAuth } from "./auth-middleware-Cl5HH3Ao.mjs";
import "../_libs/seroval.mjs";
import "../_libs/react.mjs";
import { o as objectType, s as stringType } from "../_libs/zod.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "node:stream";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "../_libs/tanstack__react-router.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
const getVapidPublicKey_createServerFn_handler = createServerRpc({
  id: "78cc8d1f6340d6a3afbbfa56eb27d07047d617e75a30cf50925c68148d0e296a",
  name: "getVapidPublicKey",
  filename: "src/lib/push.functions.ts"
}, (opts) => getVapidPublicKey.__executeServer(opts));
const getVapidPublicKey = createServerFn({
  method: "GET"
}).handler(getVapidPublicKey_createServerFn_handler, async () => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) throw new Error("VAPID_PUBLIC_KEY is not configured.");
  return {
    publicKey: key
  };
});
const savePushSubscription_createServerFn_handler = createServerRpc({
  id: "3dd075d941fe87add5a112b1d488c70b7f22ef898e03c52b61a8df45a139ffeb",
  name: "savePushSubscription",
  filename: "src/lib/push.functions.ts"
}, (opts) => savePushSubscription.__executeServer(opts));
const savePushSubscription = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator((d) => objectType({
  endpoint: stringType().url(),
  p256dh: stringType().min(1),
  auth: stringType().min(1),
  userAgent: stringType().optional()
}).parse(d)).handler(savePushSubscription_createServerFn_handler, async ({
  data,
  context
}) => {
  const {
    supabase,
    userId
  } = context;
  const {
    error
  } = await supabase.from("push_subscriptions").upsert({
    user_id: userId,
    endpoint: data.endpoint,
    p256dh: data.p256dh,
    auth: data.auth,
    user_agent: data.userAgent ?? null,
    last_used_at: (/* @__PURE__ */ new Date()).toISOString()
  }, {
    onConflict: "endpoint"
  });
  if (error) throw new Error(error.message);
  return {
    ok: true
  };
});
const deletePushSubscription_createServerFn_handler = createServerRpc({
  id: "08b04c880185fa9688c2b98c5c9d1b8fa87038e0577bb5cc1885a88fffc153cc",
  name: "deletePushSubscription",
  filename: "src/lib/push.functions.ts"
}, (opts) => deletePushSubscription.__executeServer(opts));
const deletePushSubscription = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator((d) => objectType({
  endpoint: stringType().url()
}).parse(d)).handler(deletePushSubscription_createServerFn_handler, async ({
  data,
  context
}) => {
  const {
    supabase,
    userId
  } = context;
  await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", data.endpoint);
  return {
    ok: true
  };
});
export {
  deletePushSubscription_createServerFn_handler,
  getVapidPublicKey_createServerFn_handler,
  savePushSubscription_createServerFn_handler
};
