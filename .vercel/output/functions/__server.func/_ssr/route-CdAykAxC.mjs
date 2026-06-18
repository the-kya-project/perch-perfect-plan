import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { d as useSearch } from "../_libs/tanstack__react-router.mjs";
import { u as useSuspenseQuery } from "../_libs/tanstack__react-query.mjs";
import { u as useServerFn, g as getSitterContext } from "./router-Cu2Tdjxf.mjs";
import "../_libs/sonner.mjs";
import "../_libs/seroval.mjs";
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
import "./client-HgPYj8QJ.mjs";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "./server-9nIpN7MJ.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "../_libs/lucide-react.mjs";
import "../_libs/zod.mjs";
function useSitterContext(token) {
  const search = useSearch({
    from: "/sitter/$token"
  });
  const birdId = search.birdId;
  const fn = useServerFn(getSitterContext);
  return useSuspenseQuery({
    queryKey: ["sitter-ctx", token, birdId ?? null],
    queryFn: () => fn({
      data: {
        token,
        birdId
      }
    })
  });
}
const SplitErrorComponent = ({
  error
}) => {
  const code = error.message;
  const copy = code === "SITTER_LINK_EXPIRED" ? {
    title: "This sitter link has expired",
    body: "The sit it was created for has ended, so it no longer opens the care plan."
  } : code === "SITTER_LINK_REVOKED" ? {
    title: "This sitter link was turned off",
    body: "The owner revoked access to this link."
  } : code === "SITTER_LINK_INVALID" ? {
    title: "This sitter link isn't valid",
    body: "Double-check the link, or ask the owner to resend it."
  } : {
    title: "This sitter link can't be opened",
    body: error.message
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid min-h-screen place-items-center bg-[#f4f1e8] p-6 text-center", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-sm", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-medium", children: copy.title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-[#5f5e5a]", children: copy.body }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-4 text-xs text-[#5f5e5a]", children: "Ask the owner to send you a new link." })
  ] }) });
};
export {
  SplitErrorComponent as errorComponent,
  useSitterContext
};
