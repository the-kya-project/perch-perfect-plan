import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { e as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { u as useServerFn, c as createSsrRpc } from "./router-Cu2Tdjxf.mjs";
import { a as useQueryClient } from "../_libs/tanstack__react-query.mjs";
import { supabase } from "./client-HgPYj8QJ.mjs";
import { c as createServerFn } from "./server-9nIpN7MJ.mjs";
import { r as requireSupabaseAuth } from "./auth-middleware-Cl5HH3Ao.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import "../_libs/seroval.mjs";
import { A as ArrowLeft, B as Bell, j as ChevronRight, T as TriangleAlert } from "../_libs/lucide-react.mjs";
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
import "../_libs/zod.mjs";
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
const deleteMyAccount = createServerFn({
  method: "POST"
}).middleware([requireSupabaseAuth]).handler(createSsrRpc("27301031363e284184ead21ac910c33ebfbe9159435c975f26319c6a65fade88"));
function AccountPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteMyAccount);
  const [userId, setUserId] = reactExports.useState(null);
  const [email, setEmail] = reactExports.useState("");
  const [pendingEmail, setPendingEmail] = reactExports.useState(null);
  const [emailInput, setEmailInput] = reactExports.useState("");
  const [savingEmail, setSavingEmail] = reactExports.useState(false);
  const [name, setName] = reactExports.useState("");
  const [nameLoaded, setNameLoaded] = reactExports.useState("");
  const [savingName, setSavingName] = reactExports.useState(false);
  const [sendingReset, setSendingReset] = reactExports.useState(false);
  const [confirmText, setConfirmText] = reactExports.useState("");
  const [deleting, setDeleting] = reactExports.useState(false);
  reactExports.useEffect(() => {
    (async () => {
      const {
        data: u
      } = await supabase.auth.getUser();
      const user = u.user;
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email ?? "");
      setEmailInput(user.email ?? "");
      const newEmail = user.new_email ?? null;
      setPendingEmail(newEmail);
      const {
        data: p
      } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
      const dn = p?.display_name ?? "";
      setName(dn);
      setNameLoaded(dn);
    })();
  }, []);
  async function saveName() {
    if (!userId) return;
    setSavingName(true);
    try {
      const {
        error
      } = await supabase.from("profiles").update({
        display_name: name.trim() || null
      }).eq("id", userId);
      if (error) throw error;
      setNameLoaded(name);
      toast.success("Name updated.");
    } catch (e) {
      toast.error(e.message ?? "Could not update name.");
    } finally {
      setSavingName(false);
    }
  }
  async function changeEmail() {
    const next = emailInput.trim().toLowerCase();
    if (!next || next === email.toLowerCase()) return;
    setSavingEmail(true);
    try {
      const {
        error
      } = await supabase.auth.updateUser({
        email: next
      }, {
        emailRedirectTo: `${window.location.origin}/dashboard`
      });
      if (error) throw error;
      setPendingEmail(next);
      toast.success("Confirmation links sent to your current and new email addresses. Both must be confirmed.");
    } catch (e) {
      toast.error(e.message ?? "Could not start email change.");
    } finally {
      setSavingEmail(false);
    }
  }
  async function sendPasswordReset() {
    if (!email) return;
    setSendingReset(true);
    try {
      const {
        error
      } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      toast.success("Password reset link sent. Check your email.");
    } catch (e) {
      toast.error(e.message ?? "Could not send reset email.");
    } finally {
      setSendingReset(false);
    }
  }
  async function handleDelete() {
    if (confirmText.trim().toUpperCase() !== "DELETE") {
      toast.error("Type DELETE to confirm.");
      return;
    }
    setDeleting(true);
    try {
      await deleteFn();
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      toast.success("Your account and all data have been deleted.");
      navigate({
        to: "/",
        replace: true
      });
    } catch (e) {
      toast.error(e.message ?? "Could not delete account.");
      setDeleting(false);
    }
  }
  const nameDirty = name.trim() !== nameLoaded.trim();
  const emailDirty = emailInput.trim().toLowerCase() !== email.toLowerCase() && emailInput.trim().length > 0;
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-screen bg-sage-50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md px-5 py-6", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/dashboard", className: "inline-flex items-center gap-1 text-sm text-sage-600", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-4" }),
      " Back"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-4 text-2xl font-bold tracking-tight", children: "Account" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-6 rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Your details" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "mt-3 block text-xs font-semibold uppercase tracking-wider text-sage-600", children: "Name" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "text", value: name, onChange: (e) => setName(e.target.value), className: "mt-1 w-full rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm", placeholder: "Your name" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: saveName, disabled: !nameDirty || savingName, className: "mt-2 rounded-xl bg-sage-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50", children: savingName ? "Saving…" : "Save name" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "mt-5 block text-xs font-semibold uppercase tracking-wider text-sage-600", children: "Email address" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "email", value: emailInput, onChange: (e) => setEmailInput(e.target.value), className: "mt-1 w-full rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm", placeholder: "you@example.com" }),
      pendingEmail && pendingEmail.toLowerCase() !== email.toLowerCase() && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-xs text-amber-700", children: [
        "Change to ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: pendingEmail }),
        " pending — confirm the links sent to both your current and new addresses."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: changeEmail, disabled: !emailDirty || savingEmail, className: "mt-2 rounded-xl bg-sage-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50", children: savingEmail ? "Sending…" : "Change email" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-sage-600", children: "We'll send a confirmation link to both your current and new email addresses. Both must be confirmed for the change to take effect." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "mt-5 block text-xs font-semibold uppercase tracking-wider text-sage-600", children: "Password" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: sendPasswordReset, disabled: !email || sendingReset, className: "mt-1 rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm font-semibold text-sage-700 disabled:opacity-50", children: sendingReset ? "Sending…" : "Send password reset email" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/notifications", className: "mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Bell, { className: "size-5 text-sage-700" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "text-sm font-semibold text-sage-900", children: "Notifications" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-sage-600", children: "Manage product and sitter activity emails." })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "size-4 text-sage-500" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "mt-6 rounded-2xl border border-red-200 bg-white p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 text-red-700", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-4" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-sm font-bold", children: "Delete account" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-sage-700", children: "Permanently delete your account and all associated data — birds, care plans, clips, sits, logs, and your marketing-contact record. This cannot be undone." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("label", { className: "mt-3 block text-xs font-semibold uppercase tracking-wider text-sage-600", children: "Type DELETE to confirm" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "text", value: confirmText, onChange: (e) => setConfirmText(e.target.value), className: "mt-1 w-full rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm", placeholder: "DELETE" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: handleDelete, disabled: deleting || confirmText.trim().toUpperCase() !== "DELETE", className: "mt-3 w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50", children: deleting ? "Deleting…" : "Permanently delete my account" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-8 text-center text-xs text-sage-600", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/privacy", className: "underline", children: "Privacy" }),
      " · ",
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/terms", className: "underline", children: "Terms" })
    ] })
  ] }) });
}
export {
  AccountPage as component
};
