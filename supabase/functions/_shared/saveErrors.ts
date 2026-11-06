// Save-error rows from Supabase edge functions (Deno).
//
// The same rules as src/lib/brevoListFailures.ts and
// src/lib/serverSaveErrors.server.ts, copied because Deno can't import from
// src/: a missing setting is category 'config', a Brevo refusal or outage is
// 'server', and the row goes into public.save_errors with the service role,
// so the app's save-error alerts email about it. No personal data: only the
// category, the setting involved and the function's name.
//
// The website's functions (thekyaproject-site → supabase/functions) keep their
// own copy of this file. Keep the three in step.
//
// Never throws: recording a failure must not become a second failure.

export type EdgeSaveErrorCategory = "config" | "server" | "database";

const TARGET = /^[a-z_][a-z0-9_]{0,62}$/;
const PRODUCTION_REF = "koyqdyamazuuwvqbttnj";

export async function recordEdgeSaveError(
  fn: string,
  e: { category: EdgeSaveErrorCategory; target: string; operation?: "brevo_list" | "write" },
): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
      console.error(`${fn}: save error not recorded (no service role in this function's env)`);
      return;
    }
    const target = e.target.toLowerCase();
    const res = await fetch(`${url}/rest/v1/save_errors`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        category: e.category,
        sqlstate: null,
        target: TARGET.test(target) ? target : null,
        operation: e.operation ?? "brevo_list",
        route: `/fn/${fn}`,
        platform: "server",
        app_version: "edge",
        environment: url.includes(PRODUCTION_REF) ? "production" : "preview",
      }),
    });
    if (!res.ok) console.error(`${fn}: save error not recorded`, res.status, await res.text());
  } catch (err) {
    console.error(`${fn}: save error not recorded`, err);
  }
}
