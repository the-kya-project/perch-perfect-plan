/**
 * A personal note from Brittany when a bird dies — daily cron.
 *
 * Sending rules, all deliberate (see docs/email-plan.md):
 *   - the DAY AFTER the owner marks the bird as passed, never the same day:
 *     an instant email would feel automated at the worst possible moment
 *   - ONCE PER BIRD, forever (bereavement_email_log, bird_id primary key)
 *   - two birds marked on the same day produce ONE note naming both
 *   - NEVER on a handoff: a transferred bird's passed_at stays null, so the
 *     query below can't pick one up
 *   - reply-to is Brittany, because the note invites a reply
 *
 * It is not gated on any notification preference. It is a condolence note, not
 * a product email, and it is the one message a grieving owner should not have
 * to have opted into. It is also the last thing they hear about that bird —
 * the same commit that marks a bird passed stops every other reminder.
 *
 * Auth: `Authorization: Bearer <CARE_PLAN_REMINDER_SECRET>`, the shared cron
 * secret. JSON body: { "dryRun": true } → planned sends, nothing sent/logged.
 *
 * Serverless gotcha (memory/perch-serverless-fire-and-forget): every send is
 * awaited before the response returns — nothing fire-and-forget here.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withCronTelemetry } from "@/lib/cronTelemetry";

const DAY = 1000 * 60 * 60 * 24;

/** "Willow", "Willow and Moxie", "Echo, Willow and Moxie". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

export const Route = createFileRoute("/api/public/hooks/bereavement-note")({
  server: {
    handlers: {
      POST: withCronTelemetry("bereavement-note", async ({ request }) => {
        const secret = process.env.CARE_PLAN_REMINDER_SECRET;
        if (!secret) {
          return Response.json({ ok: false, error: "CARE_PLAN_REMINDER_SECRET not configured" }, { status: 503 });
        }
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${secret}`) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        let dryRun = false;
        try {
          const body = (await request.json()) as { dryRun?: boolean } | null;
          dryRun = body?.dryRun === true;
        } catch {
          /* no body is fine */
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as any;

        // Birds marked as passed at least a day ago. The upper bound is open:
        // a bird marked while the cron was failing still gets its note on the
        // next successful run rather than being silently skipped.
        const cutoff = new Date(Date.now() - DAY).toISOString();
        const { data: birds, error: birdErr } = await sb
          .from("birds")
          .select("id, name, owner_id, passed_at")
          .not("passed_at", "is", null)
          .lte("passed_at", cutoff);
        if (birdErr) {
          return Response.json({ ok: false, error: birdErr.message }, { status: 500 });
        }

        const { data: alreadySent, error: logErr } = await sb
          .from("bereavement_email_log")
          .select("bird_id");
        if (logErr) {
          return Response.json({ ok: false, error: logErr.message }, { status: 500 });
        }
        const sentIds = new Set((alreadySent ?? []).map((r: any) => r.bird_id as string));

        const pending = (birds ?? []).filter((b: any) => !sentIds.has(b.id));
        if (pending.length === 0) {
          return Response.json({ ok: true, sent: 0, notes: 0 });
        }

        // One note per OWNER, not per bird: two birds marked on the same day
        // get a single note naming both.
        const byOwner = new Map<string, any[]>();
        for (const b of pending) {
          const list = byOwner.get(b.owner_id) ?? [];
          list.push(b);
          byOwner.set(b.owner_id, list);
        }

        const { buildBereavementEmail } = await import("@/lib/emailTemplates");
        const { sendTransactionalEmail, founderReplyTo } = await import("@/lib/brevoEmail.server");

        const planned: Array<{ ownerId: string; email: string; names: string; birdIds: string[]; firstName?: string }> = [];

        for (const [ownerId, ownerBirds] of byOwner) {
          const { data: profile } = await sb
            .from("profiles")
            .select("email, display_name, locale")
            .eq("id", ownerId)
            .maybeSingle();

          let email = (profile?.email ?? "").toString().trim();
          if (!email) {
            const { data: au } = await sb.auth.admin.getUserById(ownerId);
            email = au?.user?.email ?? "";
          }
          if (!email) continue;

          planned.push({
            ownerId,
            email,
            names: joinNames(ownerBirds.map((b: any) => b.name as string)),
            birdIds: ownerBirds.map((b: any) => b.id as string),
            firstName: ((profile?.display_name ?? "").trim().split(/\s+/)[0] || "") || undefined,
          });
        }

        if (dryRun) {
          return Response.json({
            ok: true,
            dryRun: true,
            planned: planned.map((p) => ({ email: p.email, birds: p.names, count: p.birdIds.length })),
          });
        }

        let notes = 0;
        let failed = 0;

        for (const p of planned) {
          const { data: profile } = await sb.from("profiles").select("display_name, locale").eq("id", p.ownerId).maybeSingle();
          const built = buildBereavementEmail({
            firstName: p.firstName,
            birdName: p.names,
            locale: (profile as { locale?: string } | null)?.locale ?? undefined,
          });
          const res = await sendTransactionalEmail({
            to: p.email,
            toName: profile?.display_name ?? undefined,
            subject: built.subject,
            htmlContent: built.html,
            textContent: built.text,
            replyTo: founderReplyTo(),
          });
          if (!res.ok) {
            failed += 1;
            continue;
          }
          // Log AFTER a confirmed send, one row per bird the note covered, so a
          // failed send retries on the next run rather than being lost.
          const { error: insErr } = await sb
            .from("bereavement_email_log")
            .insert(p.birdIds.map((birdId) => ({ bird_id: birdId, owner_id: p.ownerId })));
          if (insErr) console.error("[bereavement-note] log insert failed", p.ownerId, insErr.message);
          notes += 1;
        }

        return Response.json({ ok: true, notes, birds: planned.reduce((n, p) => n + p.birdIds.length, 0), failed });
      }),
    },
  },
});
