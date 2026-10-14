// Tags every error report carries, browser and server alike. Isomorphic and
// dependency-free so it can be imported from the client bundle and from server
// middleware. Never put anything user-entered here — these are dimensions to
// group by, not context.

import { APP_VERSION } from "./version";

/** 7-char commit SHA of the running web build ("local" outside Vercel). */
export const WEB_BUILD: string =
  typeof __WEB_BUILD__ !== "undefined" && __WEB_BUILD__ ? __WEB_BUILD__ : "local";

/** Who hit the error. "sitter" is anyone on a token link, signed in or not. */
export type ErrorUserRole = "owner" | "household" | "sitter" | "anonymous" | "system";

export type ErrorPlatform = "web" | "ios" | "android" | "server";

/** Where it happened. Alerts watch "production" only; preview reports are for
 *  testing a deploy before it ships. */
export type ErrorEnvironment = "production" | "preview" | "development";

export type ErrorTags = {
  environment: ErrorEnvironment;
  app_version: string;
  web_build: string;
  platform: ErrorPlatform;
  /** Route PATTERN (e.g. "/sitter/$token/scan"), never the concrete URL. */
  route: string;
  user_role: ErrorUserRole;
  error_source: "client" | "server";
};

export function baseErrorTags(
  environment: ErrorEnvironment,
  source: "client" | "server",
  platform: ErrorPlatform,
  route: string,
  user_role: ErrorUserRole,
): ErrorTags {
  return { environment, app_version: APP_VERSION, web_build: WEB_BUILD, platform, route, user_role, error_source: source };
}

/** The sitter surface, by route pattern or path. Both forms start this way. */
export function isSitterRoute(routeOrPath: string): boolean {
  return /^\/sitter\//.test(routeOrPath);
}

/**
 * A concrete request path reduced to something route-shaped for tagging:
 * token segments become placeholders (urlScrub) and ids become `$id`, so
 * "/birds/<uuid>/weight" groups as "/birds/$id/weight".
 */
export function routeShapeFromPath(path: string): string {
  return path
    .replace(/\/(sitter|invite|handoff)\/[^/?#]+/gi, "/$1/$$token")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "$$id")
    .replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g, "/$$secret")
    .replace(/[?#].*$/, "");
}
