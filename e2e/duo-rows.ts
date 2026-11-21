// Plain helpers for answering Supabase requests from made-up rows, shared by
// the browser-side mock (duo-mock.ts) and the stand-in server
// (duo-mock-server.ts). No test-runner imports, so a plain Node process can use them.

/** PostgREST filters the app uses, applied to fixture rows. Unknown ones pass. */
export function filterRows(rows: any[], params: URLSearchParams): any[] {
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
export function embed(table: string, rows: any[], select: string | null, tables: Record<string, any[]>): any[] {
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

/** A made-up access token. `variant` rides in the payload so the stand-in
 *  server answers the app server's requests with the same made-up data. */
export function fakeJwt(sub: string, exp: number, variant = "base"): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, exp, role: "authenticated", aud: "authenticated", duo_variant: variant })}.duo`;
}

/** The variant in a request's bearer token, or null. */
export function variantOf(authorization: string | null | undefined): string | null {
  const token = (authorization ?? "").replace(/^Bearer /, "");
  const part = token.split(".")[1];
  if (!part) return null;
  try { return (JSON.parse(Buffer.from(part, "base64url").toString()) as { duo_variant?: string }).duo_variant ?? null; } catch { return null; }
}

