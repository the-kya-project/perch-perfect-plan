import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { captureServerException } from "./lib/errorTelemetry";
import { routeShapeFromPath } from "./lib/errorTags";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response, request: Request): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  const swallowed = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(swallowed);
  await reportEntryError(swallowed, request);
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// Last-resort reporting for failures that escaped every middleware. Awaited
// before the error page is returned (Vercel freezes post-response work).
async function reportEntryError(error: unknown, request: Request) {
  let path = "unknown";
  try {
    path = new URL(request.url).pathname;
  } catch {
    /* keep "unknown" */
  }
  await captureServerException(error, {
    route: routeShapeFromPath(path),
    authorization: request.headers.get("authorization"),
    mechanism: "server_entry",
  });
}

// /assets/* is hashed build output, served by Vercel straight from the static
// files. A request only reaches this function when that file is missing, e.g.
// a page from one deploy asking for a file during the switch to another. The
// build's routing gives every /assets/* response `max-age=31536000, immutable`,
// so without our own header the browser stores that 404 for a year and never
// asks again: on 2026-10-21 the installed iOS app kept a saved 404 for the
// stylesheet across later deploys and ran with no styles. A Cache-Control set
// here overrides the routing header, so a miss is never stored.
function missingAssetResponse(request: Request): Response | null {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return null;
  }
  if (!pathname.startsWith("/assets/")) return null;
  return new Response("Not found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const missingAsset = missingAssetResponse(request);
    if (missingAsset) return missingAsset;
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response, request);
    } catch (error) {
      console.error(error);
      await reportEntryError(error, request);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
