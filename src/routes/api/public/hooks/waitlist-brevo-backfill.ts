/**
 * One-time backfill: waitlist_signups rows that never reached Brevo → list 4.
 *
 * Written for the original Google Form waitlist (Nov 2026): its 22 people were
 * inserted into public.waitlist_signups with source 'waitlist-google-form' and
 * no brevo_status. This adds every row whose brevo_status is still null to
 * Brevo list 4 "TKP Waitlist" through addContactToListReported, the same path
 * the live waitlist uses:
 *   - FIRSTNAME, LASTNAME and SOURCE (the row's source). SOURCE is set only
 *     when Brevo creates the contact; an existing contact keeps its own.
 *   - List 4 only. Never the marketing list. No email is sent.
 *   - A missing setting or a Brevo error records a save_errors row (alert).
 * Then it writes what happened to each row's brevo_status.
 *
 * Safe to run again: rows already tried are skipped. It answers with counts
 * and, for anything Brevo refused, first name + last initial and the reason;
 * never an email address.
 *
 * Auth: `Authorization: Bearer <cron_hook_token>` (src/lib/cronAuth.ts). Run
 * it from SQL so the token never leaves the database:
 *   select private.call_cron_hook('/api/public/hooks/waitlist-brevo-backfill', '{"dryRun":true}');
 * then read the answer in net._http_response. Body: { "dryRun": true } →
 * counts only, nothing sent. Not scheduled; delete this route once done.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { withCronTelemetry } from "@/lib/cronTelemetry";
import { cronAuthFailure } from "@/lib/cronAuth";

const ROUTE = "/api/public/hooks/waitlist-brevo-backfill";
/** private.call_cron_hook waits 5 seconds for an answer (pg_net's default), and
 *  each Brevo add takes one or two calls: small batches, run until pending is 0. */
const BATCH = 8;

type Row = { id: number; email: string; first_name: string | null; last_name: string | null; source: string };

export const Route = createFileRoute("/api/public/hooks/waitlist-brevo-backfill")({
  server: {
    handlers: {
      POST: withCronTelemetry(
        "waitlist-brevo-backfill",
        withErrorTelemetry(ROUTE, async ({ request }) => {
          const denied = await cronAuthFailure(request, "waitlist-brevo-backfill");
          if (denied) return denied;

          let dryRun = false;
          try {
            const body = (await request.json()) as { dryRun?: boolean } | null;
            dryRun = body?.dryRun === true;
          } catch {
            /* no body is fine */
          }

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          // The table postdates the generated types.
          const db = supabaseAdmin as any;
          const { data, error } = await db
            .from("waitlist_signups")
            .select("id, email, first_name, last_name, source")
            .is("brevo_status", null)
            .order("created_at", { ascending: true })
            .limit(BATCH);
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          const rows = (data ?? []) as Row[];
          if (dryRun) return Response.json({ ok: true, dryRun: true, pending: rows.length });

          const { addContactToListReported, listAddStatus } = await import("@/lib/serverSaveErrors.server");
          let added = 0;
          let skipped = 0;
          const refused: { who: string; reason: string }[] = [];
          for (const r of rows) {
            const result = await addContactToListReported(
              "BREVO_WAITLIST_LIST_ID",
              { email: r.email, firstName: r.first_name, lastName: r.last_name, source: r.source },
              { route: ROUTE },
            );
            const status = listAddStatus(result);
            if (result.ok) added++;
            else if (status.startsWith("skipped:")) skipped++;
            else refused.push({ who: `${r.first_name ?? "?"} ${(r.last_name ?? "").slice(0, 1)}.`.trim(), reason: status });
            const { error: upErr } = await db
              .from("waitlist_signups")
              .update({ brevo_status: status, brevo_synced_at: result.ok ? new Date().toISOString() : null })
              .eq("id", r.id);
            if (upErr) console.error("[waitlist-backfill] status not saved", r.id, upErr.message);
          }
          return Response.json({ ok: refused.length === 0, tried: rows.length, added, skipped, refused });
        }),
      ),
    },
  },
});
