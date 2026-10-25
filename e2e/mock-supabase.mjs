// A tiny stand-in for Supabase, for the iPhone hydration check (e2e/).
//
// The check runs the real production build against this instead of a real
// project, so it needs no secrets and never touches staging or production
// data. It answers only what the front-door pages call:
//
//   POST /auth/v1/signup                       new → user with one identity;
//                                              existing → user with identities: []
//                                              (what Supabase returns with Confirm
//                                              email on, as in production)
//   POST /auth/v1/resend                       issues a new link, cancelling the old
//   GET  /auth/v1/verify                       current link → confirm + ?code=…;
//                                              old link → the exact error redirect
//                                              Supabase builds (otp_expired)
//   POST /rest/v1/rpc/auth_email_confirmed     the /link-expired server check
//   GET  /rest/v1/<table>                      read-only rows from the sitter
//                                              fixture (e2e/sitter-fixture.mjs), with
//                                              PostgREST's eq / neq / in / is / gte /
//                                              lte filters, order and limit
//   GET  /auth/v1/admin/users/<id>             the fixture's owner account
//   everything else under /auth/v1             "no session"
//
// Test helpers (not Supabase): POST /__seed {email, confirmed} pre-creates an
// account; GET /__links?email= returns its link tokens; GET /__photo.png?delay=ms
// is a bird photo that arrives late.
//
//   node e2e/mock-supabase.mjs        (port from MOCK_SUPABASE_PORT, default 54399)

import http from "node:http";
import { sitterFixture } from "./sitter-fixture.mjs";

const port = Number(process.env.MOCK_SUPABASE_PORT || 54399);
const users = new Map(); // email → { id, confirmed, token, tokens[] }
let n = 0;
const fixture = sitterFixture(`http://127.0.0.1:${port}`);
// 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

/** PostgREST-style filtering over the fixture's rows (read-only). */
function selectRows(table, params) {
  let rows = [...(fixture.tables[table] ?? [])];
  const unquote = (v) => v.replace(/^"(.*)"$/, "$1");
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset"].includes(key)) continue;
    const dot = raw.indexOf(".");
    const op = raw.slice(0, dot);
    const val = raw.slice(dot + 1);
    const get = (r) => (r[key] === undefined ? null : r[key]);
    if (op === "eq") rows = rows.filter((r) => String(get(r)) === val);
    else if (op === "neq") rows = rows.filter((r) => String(get(r)) !== val);
    else if (op === "in") {
      const set = new Set(val.replace(/^\(|\)$/g, "").split(",").map(unquote));
      rows = rows.filter((r) => set.has(String(get(r))));
    } else if (op === "is") rows = rows.filter((r) => (val === "null" ? get(r) == null : String(get(r)) === val));
    else if (op === "gte") rows = rows.filter((r) => get(r) != null && String(get(r)) >= val);
    else if (op === "lte") rows = rows.filter((r) => get(r) != null && String(get(r)) <= val);
  }
  const order = params.get("order");
  if (order) {
    const keys = order.split(",").map((o) => { const [col, dir] = o.split("."); return { col, desc: dir === "desc" }; });
    rows.sort((a, b) => {
      for (const { col, desc } of keys) {
        const x = a[col] ?? "";
        const y = b[col] ?? "";
        if (x < y) return desc ? 1 : -1;
        if (x > y) return desc ? -1 : 1;
      }
      return 0;
    });
  }
  const offset = Number(params.get("offset") || 0);
  const limit = params.get("limit");
  return rows.slice(offset, limit ? offset + Number(limit) : undefined);
}

const now = () => new Date().toISOString();
const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
function issue(u) {
  u.token = `tok${++n}`;
  u.tokens.push(u.token);
}
function userBody(email, u, identities) {
  return {
    id: u.id, aud: "authenticated", role: "authenticated", email, phone: "",
    confirmation_sent_at: now(), app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {},
    identities: identities ?? [{ identity_id: `${u.id}-i`, id: u.id, user_id: u.id, provider: "email", identity_data: { email, sub: u.id }, created_at: now(), updated_at: now(), email }],
    created_at: now(), updated_at: now(), is_anonymous: false,
  };
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    ...headers,
  });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://mock");
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.method === "OPTIONS") return send(res, 204);
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { /* not JSON */ }
      const p = url.pathname;
      const email = (v) => String(v ?? "").trim().toLowerCase();

      if (p === "/__health") return send(res, 200, { ok: true });
      if (p === "/__photo.png") {
        const delay = Number(url.searchParams.get("delay") || 0);
        setTimeout(() => {
          res.writeHead(200, { "content-type": "image/png", "access-control-allow-origin": "*", "cache-control": "no-store" });
          res.end(PNG);
        }, delay);
        return;
      }
      if (req.method === "GET" && p.startsWith("/rest/v1/") && !p.startsWith("/rest/v1/rpc/")) {
        const rows = selectRows(decodeURIComponent(p.slice("/rest/v1/".length)), url.searchParams);
        // .single() asks for one object; .maybeSingle() and lists take the array.
        if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
          return rows.length === 1 ? send(res, 200, rows[0]) : send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
        }
        return send(res, 200, rows, { "content-range": `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });
      }
      const admin = p.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
      if (admin) {
        const u = fixture.users[admin[1]];
        return u ? send(res, 200, { ...u, aud: "authenticated", role: "authenticated", app_metadata: {}, identities: [], created_at: now() }) : send(res, 404, { code: 404, msg: "User not found" });
      }
      if (p === "/__seed") {
        const u = { id: newId(), confirmed: !!body.confirmed, tokens: [] };
        if (!u.confirmed) issue(u);
        users.set(email(body.email), u);
        return send(res, 200, { ok: true });
      }
      if (p === "/__links") {
        const u = users.get(email(url.searchParams.get("email")));
        return send(res, u ? 200 : 404, u ? { confirmed: u.confirmed, tokens: u.tokens, current: u.token } : { error: "no such user" });
      }
      if (p === "/auth/v1/signup") {
        const e = email(body.email);
        const existing = users.get(e);
        if (existing) return send(res, 200, userBody(e, existing, []));
        const u = { id: newId(), confirmed: false, tokens: [] };
        issue(u);
        users.set(e, u);
        return send(res, 200, userBody(e, u));
      }
      if (p === "/auth/v1/resend") {
        const u = users.get(email(body.email));
        // Supabase: a confirmed account gets a 200 and no email.
        if (u && !u.confirmed) issue(u);
        return send(res, 200, {});
      }
      if (p === "/auth/v1/verify") {
        const token = url.searchParams.get("token");
        const r = new URL(url.searchParams.get("redirect_to") ?? "http://127.0.0.1/welcome");
        const u = [...users.values()].find((x) => x.token === token && !x.confirmed);
        if (u) {
          u.confirmed = true;
          u.token = null;
          r.searchParams.set("code", `code-${token}`);
          return send(res, 303, undefined, { location: r.toString() });
        }
        // prepErrorRedirectURL in supabase/auth internal/api/verify.go (PKCE).
        const hq = new URLSearchParams({ error: "access_denied", error_code: "otp_expired", error_description: "Email link is invalid or has expired" });
        for (const [k, v] of hq) r.searchParams.set(k, v);
        hq.set("sb", "");
        r.hash = hq.toString();
        return send(res, 303, undefined, { location: r.toString() });
      }
      if (p === "/rest/v1/rpc/auth_email_confirmed") {
        const u = users.get(email(body.p_email));
        return send(res, 200, !!(u && u.confirmed));
      }
      if (p === "/auth/v1/token") return send(res, 400, { code: 400, error_code: "flow_state_not_found", msg: "invalid flow state, no valid flow state found" });
      if (p === "/auth/v1/logout") return send(res, 204);
      if (p.startsWith("/auth/v1/")) return send(res, 401, { code: 401, error_code: "no_authorization", msg: "no session" });
      return send(res, 404, { msg: `mock: not found ${p}` });
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`[mock-supabase] listening on 127.0.0.1:${port}`));
