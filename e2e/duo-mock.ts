// Shared by the iPhone Duo screenshot tests (duo.screens.ts, duo.inventory.ts):
// a made-up signed-in session, and the app's Supabase requests answered in the
// browser from e2e/duo-fixture.ts, so nothing real is reached.
import type { BrowserContext, Route } from "@playwright/test";
import { duoFixture } from "./duo-fixture";
import { MOCK } from "./helpers";
import { embed, fakeJwt, filterRows } from "./duo-rows";

/** Sign in as the fixture's owner and answer Supabase from `fx`. With
 *  `signedIn: false` only the answering is set up. */
export async function mockDuo(context: BrowserContext, fx: ReturnType<typeof duoFixture>, signedIn = true, variant = "base") {
  if (signedIn) {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const session = {
      access_token: fakeJwt(fx.user.id, exp, variant), refresh_token: "duo-refresh", token_type: "bearer",
      expires_in: 3600, expires_at: exp, user: fx.user,
    };
    const storageKey = `sb-${new URL(MOCK).hostname.split(".")[0]}-auth-token`;
    await context.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [storageKey, JSON.stringify(session)] as const);
  }
  await context.route(`${MOCK}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
      route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", ...headers }, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "content-range" } });
    }
    if (p === "/auth/v1/user") return json(fx.user);
    if (p.startsWith("/auth/v1/")) return json({});
    if (p.startsWith("/rest/v1/rpc/")) return json(fx.rpc[p.split("/").pop()!] ?? null);
    if (p.startsWith("/rest/v1/")) {
      const table = p.split("/")[3];
      if (req.method() !== "GET" && req.method() !== "HEAD") return json([], 201);
      const all = fx.tables[table] ?? [];
      const rows = embed(table, filterRows(all, url.searchParams), url.searchParams.get("select"), fx.tables);
      const range = { "content-range": `0-${Math.max(rows.length - 1, 0)}/${filterRows(all, new URLSearchParams([...url.searchParams].filter(([k]) => k !== "limit"))).length}` };
      if ((req.headers()["accept"] ?? "").includes("vnd.pgrst.object")) {
        return rows[0] ? json(rows[0], 200, range) : json({ code: "PGRST116", message: "no rows" }, 406);
      }
      return json(rows, 200, range);
    }
    return json([]);
  });
}
