import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { captureServerFnErrors } from "./lib/errorMiddleware";
import { captureServerException } from "./lib/errorTelemetry";
import { routeShapeFromPath } from "./lib/errorTags";

const errorMiddleware = createMiddleware().server(async ({ next, request, pathname }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    // Awaited before the 500 page is returned — post-response work is frozen
    // on Vercel. Bounded and error-swallowing (see errorTelemetry.ts).
    await captureServerException(error, {
      route: routeShapeFromPath(pathname),
      authorization: request.headers.get("authorization"),
      mechanism: "request_middleware",
    });
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  // captureServerFnErrors first: it wraps everything after it, including
  // requireSupabaseAuth and every handler.
  functionMiddleware: [captureServerFnErrors, attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
