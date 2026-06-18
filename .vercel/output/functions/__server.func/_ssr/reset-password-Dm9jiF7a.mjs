import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { e as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { supabase } from "./client-HgPYj8QJ.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { B as BrandLogo } from "./BrandLogo-B5fKKIHf.mjs";
import { A as ArrowLeft } from "../_libs/lucide-react.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
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
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = reactExports.useState(false);
  const [password, setPassword] = reactExports.useState("");
  const [confirm, setConfirm] = reactExports.useState("");
  const [loading, setLoading] = reactExports.useState(false);
  reactExports.useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({
      data
    }) => {
      if (active && data.session) setReady(true);
    });
    const {
      data: sub
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const {
        error
      } = await supabase.auth.updateUser({
        password
      });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({
        to: "/dashboard"
      });
    } catch (err) {
      toast.error(err.message ?? "Could not update password.");
    } finally {
      setLoading(false);
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen bg-[#f4f1e8]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md px-5 py-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/auth", search: {
        mode: "signin"
      }, className: "inline-flex items-center gap-1 text-sm text-[#5f5e5a]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-4" }),
        " Back to sign in"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(BrandLogo, { size: "md" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-8 text-2xl font-medium tracking-tight", children: "Set a new password" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-[#5f5e5a]", children: ready ? "Choose a new password for your account." : "Open this page from the password reset email you received." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleSubmit, className: "mt-6 space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]", children: "New password" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "password", required: true, minLength: 6, value: password, onChange: (e) => setPassword(e.target.value), className: "input", placeholder: "••••••••", disabled: !ready })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]", children: "Confirm password" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "password", required: true, minLength: 6, value: confirm, onChange: (e) => setConfirm(e.target.value), className: "input", placeholder: "••••••••", disabled: !ready })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", disabled: loading || !ready, className: "mt-2 w-full rounded-xl bg-[#1a3d2e] px-4 py-3 text-sm font-medium text-white active:scale-[0.99] disabled:opacity-50", children: loading ? "..." : "Update password" })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("style", { children: `
        .input {
          width: 100%;
          border-radius: 0.75rem;
          background: white;
          border: 1px solid var(--sage-200);
          padding: 0.75rem 0.875rem;
          font-size: 16px;
          outline: none;
        }
        .input:focus { border-color: var(--sage-600); box-shadow: 0 0 0 3px rgb(74 103 65 / 0.15); }
      ` })
  ] });
}
export {
  ResetPasswordPage as component
};
