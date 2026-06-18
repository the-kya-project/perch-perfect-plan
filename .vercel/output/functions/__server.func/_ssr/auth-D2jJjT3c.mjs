import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { e as useNavigate, L as Link } from "../_libs/tanstack__react-router.mjs";
import { supabase } from "./client-HgPYj8QJ.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import { B as BrandLogo } from "./BrandLogo-B5fKKIHf.mjs";
import { R as Route$g, t as track } from "./router-Cu2Tdjxf.mjs";
import "../_libs/seroval.mjs";
import { A as ArrowLeft } from "../_libs/lucide-react.mjs";
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
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "../_libs/tanstack__query-core.mjs";
import "../_libs/tanstack__react-query.mjs";
import "./server-9nIpN7MJ.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "../_libs/zod.mjs";
async function captureLead(input) {
  try {
    const { error } = await supabase.functions.invoke("capture-lead", {
      body: {
        email: input.email,
        firstName: input.firstName ?? "",
        lastName: input.lastName ?? "",
        source: input.source,
        marketingConsent: input.marketingConsent
      }
    });
    if (error) {
      console.warn("captureLead failed", error);
    }
  } catch (err) {
    console.warn("captureLead threw", err);
  }
}
function AuthPage() {
  const {
    mode
  } = Route$g.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = reactExports.useState("");
  const [password, setPassword] = reactExports.useState("");
  const [firstName, setFirstName] = reactExports.useState("");
  const [lastName, setLastName] = reactExports.useState("");
  const [marketingOptIn, setMarketingOptIn] = reactExports.useState(true);
  const [loading, setLoading] = reactExports.useState(false);
  reactExports.useEffect(() => {
    supabase.auth.getUser().then(({
      data
    }) => {
      if (data.user) navigate({
        to: "/dashboard"
      });
    });
  }, [navigate]);
  function readCooldown(key) {
    if (typeof window === "undefined") return 0;
    const v = Number(window.sessionStorage.getItem(key) ?? "0");
    return Number.isFinite(v) ? v : 0;
  }
  function setCooldown(key, seconds) {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(key, String(Date.now() + seconds * 1e3));
  }
  function remainingCooldown(key) {
    const until = readCooldown(key);
    return Math.max(0, Math.ceil((until - Date.now()) / 1e3));
  }
  function bumpAttempts(key) {
    if (typeof window === "undefined") return 1;
    const n = Number(window.sessionStorage.getItem(key) ?? "0") + 1;
    window.sessionStorage.setItem(key, String(n));
    return n;
  }
  function clearAttempts(key) {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(key);
  }
  async function handleEmail(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const {
          data,
          error
        } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0],
              marketing_opt_in: marketingOptIn
            },
            emailRedirectTo: window.location.origin
          }
        });
        if (error) throw error;
        track("owner_signup", {
          marketing_opt_in: marketingOptIn,
          verification_required: !data.session
        });
        if (marketingOptIn) track("marketing_opt_in_checked", {
          context: "signup"
        });
        void captureLead({
          email,
          firstName: firstName || void 0,
          lastName: lastName || void 0,
          source: "owner-signup",
          marketingConsent: marketingOptIn
        });
        if (!data.session) {
          toast.success("Check your inbox to confirm your email, then sign in.");
          navigate({
            to: "/auth",
            search: {
              mode: "signin"
            }
          });
        } else {
          navigate({
            to: "/dashboard"
          });
        }
      } else {
        const cooldownKey = `signin:cooldown:${email.toLowerCase()}`;
        const attemptsKey = `signin:attempts:${email.toLowerCase()}`;
        const wait = remainingCooldown(cooldownKey);
        if (wait > 0) {
          toast.error(`Too many attempts. Try again in ${wait}s.`);
          return;
        }
        const {
          error
        } = await supabase.auth.signInWithPassword({
          email,
          password
        });
        if (error) {
          const n = bumpAttempts(attemptsKey);
          if (n >= 5) {
            setCooldown(cooldownKey, 60);
            clearAttempts(attemptsKey);
            toast.error("Too many failed attempts. Try again in 60s, or reset your password.");
          } else {
            toast.error(error.message);
          }
          return;
        }
        clearAttempts(attemptsKey);
        navigate({
          to: "/dashboard"
        });
      }
    } catch (err) {
      toast.error(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }
  async function handleGoogle() {
    setLoading(true);
    try {
      const {
        error
      } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin + "/dashboard"
        }
      });
      if (error) {
        toast.error(error.message ?? "Google sign-in failed.");
        setLoading(false);
      }
    } catch (err) {
      toast.error(err.message ?? "Google sign-in failed.");
      setLoading(false);
    }
  }
  async function handleForgotPassword() {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Enter your email above first, then tap Forgot password.");
      return;
    }
    const cooldownKey = `reset:cooldown:${trimmed.toLowerCase()}`;
    const wait = remainingCooldown(cooldownKey);
    if (wait > 0) {
      toast.error(`Please wait ${wait}s before requesting another reset email.`);
      return;
    }
    setLoading(true);
    try {
      const {
        error
      } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      setCooldown(cooldownKey, 60);
      toast.success("If that email is registered, a reset link is on its way.");
    } catch (err) {
      toast.error(err.message ?? "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen bg-[#f4f1e8]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md px-5 py-8", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/", className: "inline-flex items-center gap-1 text-sm text-[#5f5e5a]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-4" }),
        " Back"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(BrandLogo, { size: "md" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-8 text-2xl font-medium tracking-tight", children: mode === "signup" ? "Create your owner account" : "Sign in" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-[#5f5e5a]", children: mode === "signup" ? "We'll save your bird profiles and care plans across trips." : "Welcome back." }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: handleGoogle, disabled: loading, className: "mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-[#e0d8c4] bg-white px-4 py-3 text-sm font-medium shadow-sm active:scale-[0.99] disabled:opacity-50", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(GoogleIcon, {}),
        " Continue with Google"
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-[#5f5e5a]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-px flex-1 bg-sage-200" }),
        "or with email",
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-px flex-1 bg-sage-200" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("form", { onSubmit: handleEmail, className: "space-y-3", children: [
        mode === "signup" && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-2 gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "First name", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "text", value: firstName, onChange: (e) => setFirstName(e.target.value), className: "input", placeholder: "Maya" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Last name", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "text", value: lastName, onChange: (e) => setLastName(e.target.value), className: "input", placeholder: "Lopez" }) })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Email", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "email", required: true, value: email, onChange: (e) => setEmail(e.target.value), className: "input", placeholder: "you@example.com" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Password", children: /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "password", required: true, minLength: 6, value: password, onChange: (e) => setPassword(e.target.value), className: "input", placeholder: "••••••••" }) }),
        mode === "signin" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-end", children: /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: handleForgotPassword, disabled: loading, className: "text-xs font-medium text-sage-700 underline disabled:opacity-50", children: "Forgot password?" }) }),
        mode === "signup" && /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "mt-2 flex items-start gap-2 text-xs text-sage-700", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "checkbox", checked: marketingOptIn, onChange: (e) => {
            setMarketingOptIn(e.target.checked);
            if (e.target.checked) track("marketing_opt_in_checked", {
              context: "checkbox"
            });
          }, className: "mt-0.5 size-4 rounded border-sage-300" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Email me about The Kya Project community and updates. (Optional)" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "submit", disabled: loading, className: "mt-2 w-full rounded-xl bg-[#1a3d2e] px-4 py-3 text-sm font-medium text-white active:scale-[0.99] disabled:opacity-50", children: loading ? "..." : mode === "signup" ? "Create account" : "Sign in" }),
        mode === "signup" && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-center text-[11px] text-[#5f5e5a]", children: [
          "By creating an account you agree to our",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/terms", className: "underline", children: "Terms" }),
          " and",
          " ",
          /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/privacy", className: "underline", children: "Privacy Policy" }),
          "."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-6 text-center text-sm text-[#5f5e5a]", children: mode === "signup" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/auth", search: {
        mode: "signin"
      }, className: "font-medium underline", children: "Already have an account? Sign in" }) : /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/auth", search: {
        mode: "signup"
      }, className: "font-medium underline", children: "Need an account? Sign up" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-4 text-center text-[11px] text-[#5f5e5a]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/privacy", className: "underline", children: "Privacy" }),
        " · ",
        /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/terms", className: "underline", children: "Terms" })
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
function Field({
  label,
  children
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]", children: label }),
    children
  ] });
}
function GoogleIcon() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { className: "size-4", viewBox: "0 0 24 24", "aria-hidden": true, children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "#EA4335", d: "M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 12s4.3 9.7 9.6 9.7c5.6 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" }) });
}
export {
  AuthPage as component
};
