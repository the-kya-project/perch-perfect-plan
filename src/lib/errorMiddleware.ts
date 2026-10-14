// Global server-function middleware: reports any unexpected error thrown by a
// server function (or by a middleware after this one) to PostHog, awaited, and
// then rethrows it so behaviour is unchanged. Registered FIRST in
// src/start.ts → functionMiddleware, so it wraps every server function.
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { captureServerException } from "./errorTelemetry";

export const captureServerFnErrors = createMiddleware({ type: "function" }).server(
  async ({ next, data, serverFnMeta }) => {
    try {
      return await next();
    } catch (error) {
      let authorization: string | null = null;
      try {
        authorization = getRequest()?.headers.get("authorization") ?? null;
      } catch {
        /* no request context — report without identity */
      }
      await captureServerException(error, {
        route: `serverfn:${serverFnMeta?.name ?? "unknown"}`,
        authorization,
        data,
        mechanism: "server_fn_middleware",
      });
      throw error;
    }
  },
);
