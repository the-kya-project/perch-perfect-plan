import { createStart, createMiddleware, createCsrfMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// CSRF protection for server functions only. Server functions are same-origin
// RPC endpoints, and with the Supabase session in localStorage an unprotected
// one is a real cross-site-request risk. Scoped to handlerType === "serverFn"
// so it validates RPC calls (default same-origin Sec-Fetch-Site/Origin check,
// 403 on failure) but leaves page/router navigations alone — cross-site links
// into the app and the OAuth redirect landing must still load. Every serverFn
// is called from our own same-origin client (incl. the same-origin "View as
// sitter" iframe), so legitimate calls pass. The public capture-lead path
// (Supabase edge function) and the cron hook (an /api server route) are NOT
// serverFns and are therefore unaffected.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  // CSRF first so its clean 403 isn't wrapped by the error page; errorMiddleware
  // still wraps the actual handler.
  requestMiddleware: [csrfMiddleware, errorMiddleware],
}));
