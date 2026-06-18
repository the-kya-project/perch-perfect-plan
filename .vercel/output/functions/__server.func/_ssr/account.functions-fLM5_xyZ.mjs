import { c as createServerRpc } from "./createServerRpc-ogiVSUVQ.mjs";
import { c as createServerFn } from "./server-9nIpN7MJ.mjs";
import { r as requireSupabaseAuth } from "./auth-middleware-Cl5HH3Ao.mjs";
import "../_libs/seroval.mjs";
import "../_libs/react.mjs";
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
const deleteMyAccount_createServerFn_handler = createServerRpc({
  id: "27301031363e284184ead21ac910c33ebfbe9159435c975f26319c6a65fade88",
  name: "deleteMyAccount",
  filename: "src/lib/account.functions.ts"
}, (opts) => deleteMyAccount.__executeServer(opts));
const deleteMyAccount = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).handler(deleteMyAccount_createServerFn_handler, async ({
  context
}) => {
  const {
    supabaseAdmin
  } = await import("./client.server-D5ro3rAQ.mjs");
  const userId = context.userId;
  const {
    data: birds
  } = await supabaseAdmin.from("birds").select("id").eq("owner_id", userId);
  const birdIds = (birds ?? []).map((b) => b.id);
  try {
    const {
      data: files
    } = await supabaseAdmin.storage.from("bird-photos").list(userId, {
      limit: 1e3
    });
    if (files && files.length) {
      await supabaseAdmin.storage.from("bird-photos").remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch {
  }
  if (birdIds.length) {
    await supabaseAdmin.from("photo_logs").delete().in("bird_id", birdIds);
    await supabaseAdmin.from("weight_logs").delete().in("bird_id", birdIds);
    await supabaseAdmin.from("daily_logs").delete().in("bird_id", birdIds);
    await supabaseAdmin.from("emergency_contacts").delete().in("bird_id", birdIds);
    const {
      data: plans
    } = await supabaseAdmin.from("care_plans").select("id").in("bird_id", birdIds);
    const planIds = (plans ?? []).map((p) => p.id);
    if (planIds.length) {
      await supabaseAdmin.from("routine_tasks").delete().in("care_plan_id", planIds);
    }
    await supabaseAdmin.from("care_plans").delete().in("bird_id", birdIds);
    await supabaseAdmin.from("sit_birds").delete().in("bird_id", birdIds);
  }
  const {
    data: sits
  } = await supabaseAdmin.from("sits").select("id").eq("owner_id", userId);
  const sitIds = (sits ?? []).map((s) => s.id);
  if (sitIds.length) {
    await supabaseAdmin.from("task_completions").delete().in("sit_id", sitIds);
    await supabaseAdmin.from("sit_checklist_items").delete().in("sit_id", sitIds);
    await supabaseAdmin.from("sit_birds").delete().in("sit_id", sitIds);
    await supabaseAdmin.from("photo_logs").delete().in("sit_id", sitIds);
    await supabaseAdmin.from("daily_logs").delete().in("sit_id", sitIds);
  }
  await supabaseAdmin.from("sits").delete().eq("owner_id", userId);
  await supabaseAdmin.from("birds").delete().eq("owner_id", userId);
  await supabaseAdmin.from("owner_emergency_defaults").delete().eq("owner_id", userId);
  await supabaseAdmin.from("profiles").delete().eq("id", userId);
  const {
    error
  } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
  return {
    ok: true
  };
});
export {
  deleteMyAccount_createServerFn_handler
};
