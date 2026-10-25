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
//   everything else under /auth/v1             "no session"
//
// Test helpers (not Supabase): POST /__seed {email, confirmed} pre-creates an
// account; GET /__links?email= returns its link tokens.
//
//   node e2e/mock-supabase.mjs        (port from MOCK_SUPABASE_PORT, default 54399)

import http from "node:http";

const port = Number(process.env.MOCK_SUPABASE_PORT || 54399);
const users = new Map(); // email → { id, confirmed, token, tokens[] }
let n = 0;

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
