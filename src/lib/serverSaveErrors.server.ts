/**
 * Server-only: the server half of save-error alerting.
 *
 * The browser records its failed saves itself (saveErrorReporting.ts); this
 * records the server's, with the service role, into the same
 * public.save_errors table, so the same alerts (urgent for a new kind, daily
 * summary) cover both. Rows carry platform 'server', no user and no content:
 * only the category, the setting or table involved, and the route.
 *
 * Use addContactToListReported for every Brevo list add: it records a missing
 * setting (category 'config') or a Brevo error (category 'server') and stays
 * quiet for normal skips (preview, test address, no email). See
 * brevoListFailures.ts for the rules.
 *
 * Never throws: recording a failure must not become a second failure.
 */

import { DEPLOY_ENV } from "./deployEnv";
import { WEB_BUILD } from "./errorTags";
import { APP_VERSION } from "./version";
import type { SaveErrorShape } from "./saveErrors";
import { listAddFailureShape } from "./brevoListFailures";
import { addContactToList, type ListAddResult, type ListContact } from "./brevoContacts.server";

const ROUTE_SHAPE = /^(\/[A-Za-z0-9_$.-]*)+$/;

/** Record one server-side failure. `route` is a pattern, never a URL with data. */
export async function recordServerSaveError(shape: SaveErrorShape, route: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Typed loosely: the table postdates the generated types.
    const { error } = await (supabaseAdmin as unknown as { from: (t: string) => { insert: (row: object) => Promise<{ error: { message: string } | null }> } })
      .from("save_errors")
      .insert({
        category: shape.category,
        sqlstate: shape.sqlstate,
        target: shape.target,
        operation: shape.operation,
        route: ROUTE_SHAPE.test(route) && route.length <= 120 ? route : "unknown",
        platform: "server",
        app_version: APP_VERSION,
        web_build: WEB_BUILD,
        user_role: null,
        environment: DEPLOY_ENV,
        user_hash: null,
      });
    if (error) console.error("[save-errors] server row not recorded", error.message);
  } catch (err) {
    console.error("[save-errors] server row not recorded", err);
  }
}

/** addContactToList, plus a save_errors row when it failed for a real reason. */
export async function addContactToListReported(
  listEnvVar: string,
  contact: ListContact,
  opts: { route: string },
): Promise<ListAddResult> {
  const result = await addContactToList(listEnvVar, contact);
  const shape = listAddFailureShape(result, listEnvVar);
  if (shape) await recordServerSaveError(shape, opts.route);
  return result;
}

/** A short, data-free word for what happened, for a status column. */
export function listAddStatus(result: ListAddResult): string {
  if (result.ok) return "added";
  if (result.skipped) return `${listAddFailureShape(result, "x") ? "failed" : "skipped"}:${result.skipped}`;
  return `failed:brevo-${result.status ?? "error"}`;
}
