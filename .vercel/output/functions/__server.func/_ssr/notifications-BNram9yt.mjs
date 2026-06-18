import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { u as useServerFn, c as createSsrRpc } from "./router-Cu2Tdjxf.mjs";
import { supabase } from "./client-HgPYj8QJ.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { c as createServerFn } from "./server-9nIpN7MJ.mjs";
import { r as requireSupabaseAuth } from "./auth-middleware-Cl5HH3Ao.mjs";
import "../_libs/seroval.mjs";
import { A as ArrowLeft, S as Smartphone, c as ShieldAlert, B as Bell } from "../_libs/lucide-react.mjs";
import { o as objectType, s as stringType } from "../_libs/zod.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
const SW_URL = "/sw.js";
function isIOS() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || /Macintosh/.test(ua) && "ontouchend" in document;
}
function isStandalone() {
  if (typeof navigator.standalone === "boolean" && navigator.standalone) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}
function detectPushSupport() {
  if (typeof window === "undefined") return { ok: false, reason: "no-sw" };
  if (!("serviceWorker" in navigator)) return { ok: false, reason: "no-sw" };
  if (!("PushManager" in window)) return { ok: false, reason: "no-push" };
  if (!("Notification" in window)) return { ok: false, reason: "no-notifications" };
  if (isIOS() && !isStandalone()) return { ok: false, reason: "ios-not-installed" };
  return { ok: true };
}
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
async function ensureRegistration() {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: "/" });
}
async function subscribeToPush(vapidPublicKey) {
  const support = detectPushSupport();
  if (!support.ok) throw new Error(support.reason);
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;
  const reg = await ensureRegistration();
  const key = urlBase64ToUint8Array(vapidPublicKey);
  const appServerKey = new Uint8Array(key).buffer;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: appServerKey
  });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Browser did not return a usable subscription.");
  }
  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent
  };
}
async function unsubscribeFromPush() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
async function getCurrentEndpoint() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!reg) return null;
  const sub = await reg.pushManager.getSubscription();
  return sub?.endpoint ?? null;
}
const getVapidPublicKey = createServerFn({
  method: "GET"
}).handler(createSsrRpc("78cc8d1f6340d6a3afbbfa56eb27d07047d617e75a30cf50925c68148d0e296a"));
const savePushSubscription = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator((d) => objectType({
  endpoint: stringType().url(),
  p256dh: stringType().min(1),
  auth: stringType().min(1),
  userAgent: stringType().optional()
}).parse(d)).handler(createSsrRpc("3dd075d941fe87add5a112b1d488c70b7f22ef898e03c52b61a8df45a139ffeb"));
const deletePushSubscription = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).inputValidator((d) => objectType({
  endpoint: stringType().url()
}).parse(d)).handler(createSsrRpc("08b04c880185fa9688c2b98c5c9d1b8fa87038e0577bb5cc1885a88fffc153cc"));
const ROWS = [{
  emailKey: "notify_sitter_opened",
  pushKey: "push_sitter_opened",
  title: "Sitter opened the care sheet",
  desc: "Tell me when a sitter first opens or starts using the shared care sheet."
}, {
  emailKey: "notify_sitter_log",
  pushKey: "push_sitter_log",
  title: "Sitter added a daily log",
  desc: "Tell me when a sitter posts a new daily log entry during a sit."
}, {
  emailKey: "notify_care_plan_reminder",
  pushKey: "push_care_plan_reminder",
  title: "Care plan update reminder",
  desc: "Remind me to review the care plan before an upcoming sit."
}];
function NotificationsPage() {
  const [prefs, setPrefs] = reactExports.useState(null);
  const [saving, setSaving] = reactExports.useState(null);
  const [support, setSupport] = reactExports.useState(null);
  const [pushEndpoint, setPushEndpoint] = reactExports.useState(null);
  const [busy, setBusy] = reactExports.useState(false);
  const getVapidKey = useServerFn(getVapidPublicKey);
  const saveSub = useServerFn(savePushSubscription);
  const deleteSub = useServerFn(deletePushSubscription);
  reactExports.useEffect(() => {
    (async () => {
      const {
        data: u
      } = await supabase.auth.getUser();
      if (!u.user) return;
      const {
        data
      } = await supabase.from("profiles").select("notify_sitter_opened, notify_sitter_log, notify_care_plan_reminder, push_sitter_opened, push_sitter_log, push_care_plan_reminder").eq("id", u.user.id).maybeSingle();
      if (data) setPrefs(data);
      setSupport(detectPushSupport());
      setPushEndpoint(await getCurrentEndpoint());
    })();
  }, []);
  async function toggle(key, next) {
    if (!prefs) return;
    const prev = prefs[key];
    setPrefs({
      ...prefs,
      [key]: next
    });
    setSaving(key);
    try {
      const {
        data: u
      } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in.");
      const patch = {
        [key]: next
      };
      const {
        error
      } = await supabase.from("profiles").update(patch).eq("id", u.user.id);
      if (error) throw error;
    } catch (e) {
      setPrefs({
        ...prefs,
        [key]: prev
      });
      toast.error(e instanceof Error ? e.message : "Could not save preference.");
    } finally {
      setSaving(null);
    }
  }
  async function enablePush() {
    setBusy(true);
    try {
      const {
        publicKey
      } = await getVapidKey();
      const sub = await subscribeToPush(publicKey);
      if (!sub) {
        toast.error("Notification permission was not granted.");
        return;
      }
      await saveSub({
        data: sub
      });
      setPushEndpoint(sub.endpoint);
      toast.success("Push notifications enabled on this device.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not enable push.";
      if (msg === "ios-not-installed") {
        toast.error("On iPhone, add this app to your Home Screen first.");
      } else {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }
  async function disablePush() {
    setBusy(true);
    try {
      const endpoint = await unsubscribeFromPush();
      if (endpoint) await deleteSub({
        data: {
          endpoint
        }
      });
      setPushEndpoint(null);
      toast.success("Push notifications turned off on this device.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not disable push.");
    } finally {
      setBusy(false);
    }
  }
  const pushEnabled = !!pushEndpoint;
  const pushBlocked = support && !support.ok;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-screen bg-sage-50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md px-5 py-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/account", className: "inline-flex items-center gap-1 text-sm text-sage-600", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-4" }),
      " Account"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-4 text-2xl font-bold tracking-tight", children: "Notifications" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-sage-600", children: "Choose which sitter activity reaches you, by email and on this device." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("section", { className: "mt-6 rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Smartphone, { className: "mt-0.5 size-5 shrink-0 text-sage-700" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold text-sage-900", children: "Push on this device" }),
        pushBlocked && support?.reason === "ios-not-installed" ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-sage-600", children: "On iPhone, add this app to your Home Screen first (Safari Share menu → Add to Home Screen), then come back here." }) : pushBlocked ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-sage-600", children: "This browser doesn't support push notifications." }) : pushEnabled ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-sage-600", children: "Enabled. Per-event push toggles below control what reaches this device." }) : /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-sage-600", children: "Get instant alerts for sitter activity without needing to check email." })
      ] }),
      !pushBlocked && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: pushEnabled ? disablePush : enablePush, disabled: busy, className: `shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${pushEnabled ? "bg-sage-100 text-sage-800 hover:bg-sage-200" : "bg-sage-700 text-white hover:bg-sage-800"} disabled:opacity-50`, children: pushEnabled ? "Turn off" : "Enable push" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mb-2 flex items-center gap-6 px-4 text-[10px] font-bold uppercase tracking-widest text-sage-500", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1", children: "Event" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-12 text-center", children: "Email" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-12 text-center", children: "Push" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-3", children: ROWS.map((row) => {
        const emailChecked = prefs ? Boolean(prefs[row.emailKey]) : false;
        const pushChecked = prefs ? Boolean(prefs[row.pushKey]) : false;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-4 rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold text-sage-900", children: row.title }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-sage-600", children: row.desc })
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "checkbox", "aria-label": `Email: ${row.title}`, className: "mt-1 size-5 w-12 rounded border-sage-300", checked: emailChecked, disabled: !prefs || saving === row.emailKey, onChange: (e) => toggle(row.emailKey, e.target.checked) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "checkbox", "aria-label": `Push: ${row.title}`, className: "mt-1 size-5 w-12 rounded border-sage-300 disabled:opacity-40", checked: pushChecked, disabled: !prefs || saving === row.pushKey || !pushEnabled, onChange: (e) => toggle(row.pushKey, e.target.checked) })
        ] }, row.emailKey);
      }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { className: "mt-0.5 size-5 shrink-0 text-amber-700" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold text-amber-900", children: "Health & behavior alerts are always on" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-amber-800", children: "If a sitter flags a health or behavior concern, we'll always send the alert by email and (if enabled) push. This safety alert can't be turned off." })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-sage-600", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Bell, { className: "size-3.5" }),
      "Email delivery is being rolled out — your preferences are saved and respected as soon as each channel ships."
    ] })
  ] }) });
}
export {
  NotificationsPage as component
};
