// Stand-in Supabase for `npm run screens:duo` (e2e/duo.config.ts), on the same
// port as the hydration check's e2e/mock-supabase.mjs, which it replaces for
// that run only. It answers the APP SERVER's requests (server functions:
// household, care plan, sits, past birds...) from the same made-up data the
// browser gets (e2e/duo-fixture.ts), plus the sitter fixture
// (e2e/sitter-fixture.mjs) so sitter links keep working.
//
// Which made-up data: the variant carried in the request's bearer token
// (duo-rows.ts fakeJwt), so a server function called for an "empty" screen sees
// the empty account. Service-role calls carry no variant: they get the last one
// seen, so the run goes one worker at a time (duo.config.ts).
// Read-only: writes are accepted and dropped.
//
//   npx --yes vite-node e2e/duo-mock-server.ts   (port MOCK_SUPABASE_PORT, default 54399)
import http from "node:http";
import { duoFixture, type DuoVariant } from "./duo-fixture";
import { embed, filterRows, variantOf } from "./duo-rows";
// @ts-expect-error plain JS fixture
import { sitterFixture } from "./sitter-fixture.mjs";

const port = Number(process.env.MOCK_SUPABASE_PORT || 54399);
const APP = `http://127.0.0.1:${Number(process.env.E2E_APP_PORT || 4173)}`;
const sitter = sitterFixture(`http://127.0.0.1:${port}`) as { tables: Record<string, Record<string, unknown>[]>; users: Record<string, unknown> };

const VARIANTS: DuoVariant[] = ["base", "filled", "empty", "nobirds", "new", "readiness"];
function data(variant: string | null) {
  const v = (VARIANTS as string[]).includes(variant ?? "") ? (variant as DuoVariant) : "filled";
  const fx = duoFixture(APP, Date.now(), v);
  const tables: Record<string, Record<string, unknown>[]> = { ...fx.tables };
  for (const [t, rows] of Object.entries(sitter.tables)) tables[t] = [...(tables[t] ?? []), ...rows];
  return { fx, tables };
}

let lastVariant: string | null = null;

http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
  const p = url.pathname;
  const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, {
      "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*",
      "access-control-allow-methods": "*", "access-control-expose-headers": "content-range", ...headers,
    });
    res.end(body === undefined ? "" : JSON.stringify(body));
  };
  if (req.method === "OPTIONS") return send(204, undefined);
  if (p === "/__health") return send(200, { ok: true });

  // Service-role calls carry no token of the person: they get the variant of
  // the last signed-in request (the inventory runs one screen at a time).
  const fromToken = variantOf(req.headers.authorization);
  if (fromToken) lastVariant = fromToken;
  const variant = fromToken ?? lastVariant;
  if (process.env.DUO_MOCK_LOG) console.log(`[duo-mock-server] ${req.method} ${p}${url.search} (${variant ?? "-"})`);
  const { fx, tables } = data(variant);

  // getClaims() on an HS256 token asks for the user: that's the server's sign-in check.
  if (p === "/auth/v1/user") return fromToken ? send(200, fx.user) : send(401, { code: 401, msg: "no session" });
  const admin = p.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
  if (admin) {
    const u = admin[1] === fx.user.id ? fx.user : sitter.users[admin[1]];
    return u ? send(200, u) : send(404, { code: 404, msg: "User not found" });
  }
  if (p.startsWith("/auth/v1/")) return send(401, { code: 401, msg: "no session" });
  if (p.startsWith("/rest/v1/rpc/")) {
    const fn = p.split("/").pop()!;
    if (fn === "auth_email_confirmed") return send(200, false);
    return send(200, fx.rpc[fn] ?? null);
  }
  if (p.startsWith("/rest/v1/")) {
    if (req.method !== "GET" && req.method !== "HEAD") return send(201, []);
    const table = p.split("/")[3];
    const all = tables[table] ?? [];
    const rows = embed(table, filterRows(all, url.searchParams), url.searchParams.get("select"), tables);
    const range = { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` };
    if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
      return rows[0] ? send(200, rows[0], range) : send(406, { code: "PGRST116", message: "no rows" });
    }
    return send(200, rows, range);
  }
  if (p.startsWith("/storage/v1/")) return send(200, []);
  send(404, { message: "not mocked" });
}).listen(port, "127.0.0.1", () => console.log(`[duo-mock-server] on ${port}`));
