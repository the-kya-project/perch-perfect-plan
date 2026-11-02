// iPhone Duo screenshots and checks (not part of the hydration run in CI).
//
//   npm run screens:duo
//
// Home, Echo's page, the weight page and the full health check at the three
// Duo sizes: folded cover screen (382×837), unfolded upright (669×904, today's
// layout) and unfolded sideways (951×669). The app's Supabase requests are
// answered in the browser from e2e/duo-fixture.ts, signed in with a made-up
// session, so nothing real is reached. Screenshots land in test-results/duo/.
import { test, expect, type Route } from "@playwright/test";
import { duoFixture, ECHO_ID } from "./duo-fixture";
import { MOCK } from "./helpers";

const SIZES = {
  folded: { width: 382, height: 837 },
  upright: { width: 669, height: 904 },
  sideways: { width: 951, height: 669 },
} as const;

const PAGES = {
  home: "/dashboard",
  bird: `/birds/${ECHO_ID}`,
  weight: `/birds/${ECHO_ID}/weight`,
  check: `/birds/${ECHO_ID}/scan`,
} as const;

/** PostgREST filters the app uses, applied to fixture rows. Unknown ones pass. */
function filterRows(rows: any[], params: URLSearchParams): any[] {
  let out = [...rows];
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "or", "and"].includes(key)) continue;
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    const get = (r: any) => (r[key] === undefined ? null : r[key]);
    if (op === "eq") out = out.filter((r) => String(get(r)) === val);
    else if (op === "neq") out = out.filter((r) => String(get(r)) !== val);
    else if (op === "in") {
      const set = new Set(val.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"(.*)"$/, "$1")));
      out = out.filter((r) => set.has(String(get(r))));
    } else if (op === "is") out = out.filter((r) => (val === "null" ? get(r) == null : String(get(r)) === val));
    else if (raw.startsWith("not.is.null")) out = out.filter((r) => get(r) != null);
    else if (op === "gte") out = out.filter((r) => get(r) != null && String(get(r)) >= val);
    else if (op === "gt") out = out.filter((r) => get(r) != null && String(get(r)) > val);
    else if (op === "lte") out = out.filter((r) => get(r) != null && String(get(r)) <= val);
    else if (op === "lt") out = out.filter((r) => get(r) != null && String(get(r)) < val);
  }
  const order = params.get("order");
  if (order) {
    const keys = order.split(",").map((o) => { const [col, dir] = o.split("."); return { col, desc: dir === "desc" }; });
    out.sort((a, b) => {
      for (const { col, desc } of keys) {
        const x = a[col] ?? "", y = b[col] ?? "";
        if (x < y) return desc ? 1 : -1;
        if (x > y) return desc ? -1 : 1;
      }
      return 0;
    });
  }
  const offset = Number(params.get("offset") || 0);
  const limit = params.get("limit");
  return out.slice(offset, limit ? offset + Number(limit) : undefined);
}

/** Embedded selects (birds → weight_entries(...)): attach child rows by
 *  <table>_id, or a parent object when the row holds its id. */
function embed(table: string, rows: any[], select: string | null, tables: Record<string, any[]>): any[] {
  if (!select) return rows;
  const rels = [...select.matchAll(/(?:(\w+):)?(\w+)(?:!\w+)?\(/g)].map((m) => ({ as: m[1] ?? m[2], rel: m[2] }));
  if (!rels.length) return rows;
  const fk = `${table.replace(/s$/, "")}_id`;
  return rows.map((r) => {
    const o = { ...r };
    for (const { as, rel } of rels) {
      const child = tables[rel] ?? [];
      const parentKey = `${rel.replace(/s$/, "")}_id`;
      o[as] = parentKey in r ? child.find((c) => c.id === r[parentKey]) ?? null : child.filter((c) => c[fk] === r.id);
    }
    return o;
  });
}

function fakeJwt(sub: string, exp: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, exp, role: "authenticated", aud: "authenticated" })}.duo`;
}

for (const [size, viewport] of Object.entries(SIZES)) {
  for (const [name, path] of Object.entries(PAGES)) {
    test(`${size} · ${name}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({
        viewport, screen: viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
        locale: "en-US", serviceWorkers: "block", baseURL,
      });
      const fx = duoFixture(baseURL!);
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const session = {
        access_token: fakeJwt(fx.user.id, exp), refresh_token: "duo-refresh", token_type: "bearer",
        expires_in: 3600, expires_at: exp, user: fx.user,
      };
      const storageKey = `sb-${new URL(MOCK).hostname.split(".")[0]}-auth-token`;
      await context.addInitScript(([k, v]) => { localStorage.setItem(k, v); }, [storageKey, JSON.stringify(session)] as const);

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

      const page = await context.newPage();
      await page.goto(path);
      const rail = page.locator("nav.duo-rail");
      const tabs = rail.getByRole("link");

      if (name === "home") await expect(page.getByText(/Your flock today/)).toBeVisible({ timeout: 20_000 });
      if (name === "bird") await expect(page.getByRole("heading", { name: "Echo", exact: true }).first()).toBeVisible({ timeout: 20_000 });
      if (name === "weight") await expect(page.getByRole("heading", { name: "Echo's weight" })).toBeVisible({ timeout: 20_000 });
      if (name === "check") await expect(page.getByRole("heading", { name: /full health check/ })).toBeVisible({ timeout: 20_000 });
      // Photos and the chart settle.
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);

      if (size === "upright") {
        // Today's layout: no column; the bottom bar on regular pages.
        await expect(rail).toHaveCount(0);
        if (name !== "check") await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
      } else if (name === "check") {
        // A task: Close and the main action, no tabs.
        await expect(rail).toBeVisible();
        await expect(rail.getByRole("button", { name: "Close" })).toBeVisible();
        await expect(rail.getByRole("button", { name: /Save/ })).toBeVisible();
        await expect(tabs).toHaveCount(0);
      } else {
        // Every regular page keeps all its tabs in the column.
        await expect(rail).toBeVisible();
        for (const label of ["Home", "Sits", "Health", "Explore", "Community"]) {
          await expect(rail.getByRole("link", { name: label })).toBeVisible();
        }
        if (name !== "home") await expect(rail.getByRole("button", { name: "Back" })).toBeVisible();
      }

      await page.screenshot({ path: `test-results/duo/${size}-${name}.png` });
      await context.close();
    });
  }
}
