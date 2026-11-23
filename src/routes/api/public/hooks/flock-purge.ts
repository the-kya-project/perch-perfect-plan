/**
 * Flock purge — daily cron (job `flock-deleted-purge-daily`, 04:23 UTC).
 *
 * A deleted Flock post or comment is hidden at once and kept for 180 days in
 * flock_deleted_items (backlog 1.3, legal draft D10). This deletes, for good,
 * the ones whose 180 days are over: their photos first (through the Storage
 * API), then the items. Before that, posts and comments a reviewer removed
 * 180+ days ago join them, and reports closed 180+ days ago are deleted
 * (backlog 1.4, legal draft D9). The rules are in src/lib/flockPurge.ts.
 *
 * Auth: `Authorization: Bearer <cron_hook_token>`, the Vault secret pg_cron sends
 * (src/lib/cronAuth.ts). JSON body: { "dryRun": true } → counts only, nothing deleted.
 * Answers 500 when any photo failed to delete (those items wait for the next run).
 */
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { createFileRoute } from "@tanstack/react-router";
import { withCronTelemetry } from "@/lib/cronTelemetry";
import { cronAuthFailure } from "@/lib/cronAuth";
import { runFlockPurge, type DueItem } from "@/lib/flockPurge";

export const Route = createFileRoute("/api/public/hooks/flock-purge")({
  server: {
    handlers: {
      POST: withCronTelemetry(
        "flock-purge",
        withErrorTelemetry("/api/public/hooks/flock-purge", async ({ request }) => {
          const denied = await cronAuthFailure(request, "flock-purge");
          if (denied) return denied;

          let dryRun = false;
          try {
            const body = (await request.json()) as { dryRun?: boolean } | null;
            dryRun = body?.dryRun === true;
          } catch {
            /* no body is fine */
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const sb = supabaseAdmin as any;
          const result = await runFlockPurge(
            {
              expire: async (dry) => {
                const { data, error } = await sb.rpc("flock_moderation_purge", { p_dry_run: dry });
                if (error) throw new Error(`flock_moderation_purge: ${error.message}`);
                const row = (Array.isArray(data) ? data[0] : data) ?? {};
                return { posts: Number(row.posts ?? 0), comments: Number(row.comments ?? 0), reports: Number(row.reports ?? 0) };
              },
              due: async (limit) => {
                const { data, error } = await sb.rpc("flock_purge_due", { p_limit: limit });
                if (error) throw new Error(`flock_purge_due: ${error.message}`);
                return (data ?? []) as DueItem[];
              },
              done: async (ids) => {
                const { data, error } = await sb.rpc("flock_purge_done", { p_ids: ids });
                if (error) throw new Error(`flock_purge_done: ${error.message}`);
                return Number(data ?? 0);
              },
              remove: async (paths) => {
                const { error } = await sb.storage.from("flock-posts").remove(paths);
                if (error) {
                  console.error(`[flock-purge] photos: ${error.message ?? error}`);
                  throw new Error("remove failed");
                }
              },
            },
            { dryRun },
          );
          return Response.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 500 });
        }),
      ),
    },
  },
});
