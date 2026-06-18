import { c as createServerRpc } from "./createServerRpc-ogiVSUVQ.mjs";
import { c as createServerFn } from "./server-9nIpN7MJ.mjs";
import { c as computeTriage } from "./triage-DfSRYuT8.mjs";
import { m as mergeEmergency } from "./emergency-WC6wgYb2.mjs";
import "../_libs/seroval.mjs";
import "../_libs/react.mjs";
import { o as objectType, s as stringType, b as booleanType, e as enumType, r as recordType } from "../_libs/zod.mjs";
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
async function getAdmin() {
  const {
    supabaseAdmin
  } = await import("./client.server-D5ro3rAQ.mjs");
  return supabaseAdmin;
}
async function loadSitByToken(token) {
  const sb = await getAdmin();
  const {
    data: sit,
    error
  } = await sb.from("sits").select("*").eq("invite_token", token).maybeSingle();
  if (error) throw new Error(error.message);
  if (!sit) throw new Error("SITTER_LINK_INVALID");
  if (sit.revoked) throw new Error("SITTER_LINK_REVOKED");
  if (new Date(sit.token_expires_at) < /* @__PURE__ */ new Date()) {
    throw new Error("SITTER_LINK_EXPIRED");
  }
  return sit;
}
async function loadSitBirdIds(sitId) {
  const sb = await getAdmin();
  const {
    data,
    error
  } = await sb.from("sit_birds").select("bird_id").eq("sit_id", sitId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.bird_id);
}
async function assertBirdInSit(sitId, birdId) {
  const ids = await loadSitBirdIds(sitId);
  if (!ids.includes(birdId)) throw new Error("Bird not in this sit.");
}
const getSitterContext_createServerFn_handler = createServerRpc({
  id: "50cb8f45f66e937d950971564c827d6b93feac9abf3e61bbc9b3d96c12ce922f",
  name: "getSitterContext",
  filename: "src/lib/sitter.functions.ts"
}, (opts) => getSitterContext.__executeServer(opts));
const getSitterContext = createServerFn({
  method: "GET"
}).inputValidator((d) => objectType({
  token: stringType().min(8),
  birdId: stringType().uuid().optional()
}).parse(d)).handler(getSitterContext_createServerFn_handler, async ({
  data
}) => {
  const sb = await getAdmin();
  const sit = await loadSitByToken(data.token);
  const birdIds = await loadSitBirdIds(sit.id);
  if (birdIds.length === 0) throw new Error("This sit has no birds.");
  const {
    data: birds,
    error: bErr
  } = await sb.from("birds").select("id, name, species, photo_url, photo_position").in("id", birdIds);
  if (bErr) throw new Error(bErr.message);
  const activeId = data.birdId && birdIds.includes(data.birdId) ? data.birdId : birdIds[0];
  const [birdRes, planRes, contactsRes] = await Promise.all([sb.from("birds").select("*").eq("id", activeId).maybeSingle(), sb.from("care_plans").select("*").eq("bird_id", activeId).maybeSingle(), sb.from("emergency_contacts").select("*").eq("bird_id", activeId).maybeSingle()]);
  if (birdRes.error || !birdRes.data) throw new Error("Bird not found.");
  const {
    data: defaultsRow
  } = await sb.from("owner_emergency_defaults").select("*").eq("owner_id", birdRes.data.owner_id).maybeSingle();
  const mergedContacts = {
    ...contactsRes.data ?? {
      bird_id: activeId
    },
    ...mergeEmergency(contactsRes.data, defaultsRow)
  };
  const tasksRes = planRes.data ? await sb.from("routine_tasks").select("*").eq("care_plan_id", planRes.data.id).order("category").order("sort_order") : {
    data: []
  };
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const completionsRes = await sb.from("task_completions").select("*").eq("sit_id", sit.id).eq("completed_date", today);
  const todayLogRes = await sb.from("daily_logs").select("*").eq("sit_id", sit.id).eq("bird_id", activeId).eq("log_date", today).order("created_at", {
    ascending: false
  }).limit(1).maybeSingle();
  const ownerId = birdRes.data.owner_id;
  const birdName = birdRes.data.name;
  void (async () => {
    const ins = await sb.from("sit_open_events").insert({
      sit_id: sit.id
    }).select("sit_id").maybeSingle();
    if (!ins.data) return;
    const {
      sendPushToOwner
    } = await import("./pushSender.server-DKbD_ZCz.mjs");
    await sendPushToOwner(ownerId, "sitter_opened", {
      title: "Your sitter is on it",
      body: `${birdName ?? "Your bird"}'s sitter just opened the care sheet.`,
      url: "/dashboard",
      tag: `sitter-opened-${sit.id}`
    });
  })();
  const watchClipSlots = [{
    key: "step_up",
    column: "clip_step_up_path",
    label: "How she steps up"
  }, {
    key: "food_water",
    column: "clip_food_water_path",
    label: "How to refill food & water safely"
  }, {
    key: "locations",
    column: "clip_locations_path",
    label: "Where everything is"
  }, {
    key: "bedtime",
    column: "clip_bedtime_path",
    label: "Settling her for the night"
  }];
  const watchClips = [];
  let baselineDroppingsUrl = null;
  let baselineClipUrl = null;
  if (planRes.data) {
    for (const slot of watchClipSlots) {
      const path = planRes.data[slot.column];
      if (!path) continue;
      const {
        data: signed
      } = await sb.storage.from("bird-photos").createSignedUrl(path, 3600);
      if (signed?.signedUrl) watchClips.push({
        key: slot.key,
        label: slot.label,
        url: signed.signedUrl
      });
    }
    const bdp = planRes.data.baseline_droppings_path;
    if (bdp) {
      const {
        data: signed
      } = await sb.storage.from("bird-photos").createSignedUrl(bdp, 3600);
      baselineDroppingsUrl = signed?.signedUrl ?? null;
    }
    const bcp = planRes.data.baseline_clip_path;
    if (bcp) {
      const {
        data: signed
      } = await sb.storage.from("bird-photos").createSignedUrl(bcp, 3600);
      baselineClipUrl = signed?.signedUrl ?? null;
    }
  }
  return {
    sit,
    birds: birds ?? [],
    activeBirdId: activeId,
    bird: birdRes.data,
    plan: planRes.data,
    contacts: mergedContacts,
    tasks: tasksRes.data ?? [],
    completions: completionsRes.data ?? [],
    todayLog: todayLogRes.data ?? null,
    watchClips,
    baselineDroppingsUrl,
    baselineClipUrl
  };
});
const toggleTaskCompletion_createServerFn_handler = createServerRpc({
  id: "df233a4b290a36bb9e590e32dfac9aae25c6873908fa14f6aa9c1760b8843e1b",
  name: "toggleTaskCompletion",
  filename: "src/lib/sitter.functions.ts"
}, (opts) => toggleTaskCompletion.__executeServer(opts));
const toggleTaskCompletion = createServerFn({
  method: "POST"
}).inputValidator((d) => objectType({
  token: stringType().min(8),
  taskId: stringType().uuid(),
  completed: booleanType()
}).parse(d)).handler(toggleTaskCompletion_createServerFn_handler, async ({
  data
}) => {
  const sb = await getAdmin();
  const sit = await loadSitByToken(data.token);
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  if (data.completed) {
    await sb.from("task_completions").upsert({
      sit_id: sit.id,
      routine_task_id: data.taskId,
      completed_date: today
    }, {
      onConflict: "sit_id,routine_task_id,completed_date"
    });
  } else {
    await sb.from("task_completions").delete().eq("sit_id", sit.id).eq("routine_task_id", data.taskId).eq("completed_date", today);
  }
  return {
    ok: true
  };
});
const AnswerEnum = enumType(["normal", "not_sure", "concerning"]);
const submitHealthScan_createServerFn_handler = createServerRpc({
  id: "62e39282bef46fbf34bede070d2f06f18924ed0ea466fbc7ce31bb612a1b943a",
  name: "submitHealthScan",
  filename: "src/lib/sitter.functions.ts"
}, (opts) => submitHealthScan.__executeServer(opts));
const submitHealthScan = createServerFn({
  method: "POST"
}).inputValidator((d) => objectType({
  token: stringType().min(8),
  birdId: stringType().uuid(),
  answers: recordType(stringType(), AnswerEnum),
  notes: stringType().max(2e3).optional()
}).parse(d)).handler(submitHealthScan_createServerFn_handler, async ({
  data
}) => {
  const sb = await getAdmin();
  const sit = await loadSitByToken(data.token);
  await assertBirdInSit(sit.id, data.birdId);
  const triage = computeTriage(data.answers);
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const a = data.answers;
  const {
    data: row,
    error
  } = await sb.from("daily_logs").insert({
    sit_id: sit.id,
    bird_id: data.birdId,
    log_date: today,
    alertness_status: a.alertness,
    food_status: a.food,
    droppings_status: a.droppings,
    breathing_status: a.breathing,
    posture_status: a.posture,
    behavior_status: a.noise,
    energy_status: a.fluffed,
    injury_status: a.injury,
    exposure_status: a.exposure,
    notes: data.notes ?? null,
    triage_status: triage.status,
    triage_reasons: triage.reasons.join(" | ")
  }).select().single();
  if (error) throw new Error(error.message);
  void (async () => {
    const {
      data: birdRow
    } = await sb.from("birds").select("owner_id, name").eq("id", data.birdId).maybeSingle();
    if (!birdRow?.owner_id) return;
    const {
      sendPushToOwner
    } = await import("./pushSender.server-DKbD_ZCz.mjs");
    if (triage.status === "red") {
      await sendPushToOwner(birdRow.owner_id, "health_concern", {
        title: "Health concern flagged",
        body: `${birdRow.name ?? "Your bird"}'s sitter logged a concerning result. Tap to review.`,
        url: "/dashboard",
        tag: `health-concern-${row.id}`,
        requireInteraction: true
      });
    } else {
      await sendPushToOwner(birdRow.owner_id, "sitter_log", {
        title: "New daily log",
        body: `${birdRow.name ?? "Your bird"}'s sitter posted today's health log.`,
        url: "/dashboard",
        tag: `sitter-log-${row.id}`
      });
    }
  })();
  return {
    log: row,
    triage
  };
});
const uploadDroppingsPhoto_createServerFn_handler = createServerRpc({
  id: "dc345fee44e99de68d1e2909355bedb00b78b877879c1ce3d16ec502e757ff98",
  name: "uploadDroppingsPhoto",
  filename: "src/lib/sitter.functions.ts"
}, (opts) => uploadDroppingsPhoto.__executeServer(opts));
const uploadDroppingsPhoto = createServerFn({
  method: "POST"
}).inputValidator((d) => objectType({
  token: stringType().min(8),
  birdId: stringType().uuid(),
  dataUrl: stringType().startsWith("data:image/").max(25e5),
  notes: stringType().max(1e3).optional()
}).parse(d)).handler(uploadDroppingsPhoto_createServerFn_handler, async ({
  data
}) => {
  const sb = await getAdmin();
  const sit = await loadSitByToken(data.token);
  await assertBirdInSit(sit.id, data.birdId);
  const {
    error
  } = await sb.from("photo_logs").insert({
    sit_id: sit.id,
    bird_id: data.birdId,
    photo_type: "droppings",
    photo_url: data.dataUrl,
    notes: data.notes ?? null
  });
  if (error) throw new Error(error.message);
  return {
    ok: true
  };
});
const getGuideCards_createServerFn_handler = createServerRpc({
  id: "8ce1c9c9a340fa1f4f599420438c639d99ad297758879e6c48d6681ae24abd15",
  name: "getGuideCards",
  filename: "src/lib/sitter.functions.ts"
}, (opts) => getGuideCards.__executeServer(opts));
const getGuideCards = createServerFn({
  method: "GET"
}).handler(getGuideCards_createServerFn_handler, async () => {
  const sb = await getAdmin();
  const {
    data,
    error
  } = await sb.from("guide_cards").select("*").order("category").order("title");
  if (error) throw new Error(error.message);
  return data;
});
export {
  getGuideCards_createServerFn_handler,
  getSitterContext_createServerFn_handler,
  submitHealthScan_createServerFn_handler,
  toggleTaskCompletion_createServerFn_handler,
  uploadDroppingsPhoto_createServerFn_handler
};
