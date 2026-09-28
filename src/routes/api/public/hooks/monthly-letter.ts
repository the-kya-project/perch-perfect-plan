/**
 * The monthly letter — cron, the 2nd of each month.
 *
 * One letter per account, one section per bird, recapping the PREVIOUS month.
 * Rules, all deliberate:
 *   - ONE letter per account per recapped month (monthly_letter_log, keyed on
 *     owner + the month being recapped), so a retry or a double-fire can never
 *     send twice
 *   - accounts with notify_monthly_letter = false are skipped: the letter's own
 *     footer promises it can be turned off
 *   - birds marked as passed are excluded — a memorial has no place in a recap,
 *     and the bereavement note already covered that bird
 *   - an account with no living birds gets nothing at all. There is no recap to
 *     write, and "here is your empty month" is a bad email
 *   - when EVERY bird is quiet the letter changes shape (see buildMonthlyEmail)
 *   - reply-to is Brittany: the letter asks for a reply
 *
 * The article block is fetched ONCE per run and shared by every letter. If the
 * Webflow pull is unconfigured or fails it returns null and the block is
 * dropped — see src/lib/monthlyArticle.server.ts.
 *
 * Auth: `Authorization: Bearer <CARE_PLAN_REMINDER_SECRET>`, the shared cron
 * secret. JSON body options:
 *   { "dryRun": true }             → planned sends returned, nothing sent/logged
 *   { "month": 9, "year": 2026 }   → recap that month instead of last month,
 *                                     for checking a specific month by hand
 *   { "onlyEmail": "x@y.z" }       → restrict the run to one account
 *
 * Serverless gotcha (memory/perch-serverless-fire-and-forget): every send is
 * awaited before the response returns — nothing fire-and-forget here.
 *
 * SCALE: this pulls the month's rows in a handful of bulk queries and groups
 * them in memory, rather than querying per account. Supabase caps a select at
 * 1000 rows by default, so if the flock ever outgrows that these need
 * pagination — the counts are returned in the response so it is visible.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withCronTelemetry } from "@/lib/cronTelemetry";
import {
  buildMonthlyEmail,
  isQuietMonth,
  type MonthlyBird,
} from "@/lib/emailTemplates";

const APP_URL = "https://app.thekyaproject.com";

/** "18 September" — the long form the letter uses for a single date. */
function longDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(d);
}

/** "12 Sep" — the short form the stat cards use. */
function shortDate(iso: string, locale: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-NL" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(d);
}

const spread = (xs: number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);

export const Route = createFileRoute("/api/public/hooks/monthly-letter")({
  server: {
    handlers: {
      POST: withCronTelemetry("monthly-letter", async ({ request }) => {
        const secret = process.env.CARE_PLAN_REMINDER_SECRET;
        if (!secret) {
          return Response.json({ ok: false, error: "CARE_PLAN_REMINDER_SECRET not configured" }, { status: 503 });
        }
        if ((request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
          return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
        }

        let dryRun = false;
        let monthOverride: number | undefined;
        let yearOverride: number | undefined;
        let onlyEmail: string | undefined;
        try {
          const body = (await request.json()) as
            | { dryRun?: boolean; month?: number; year?: number; onlyEmail?: string }
            | null;
          dryRun = body?.dryRun === true;
          monthOverride = body?.month;
          yearOverride = body?.year;
          onlyEmail = body?.onlyEmail;
        } catch {
          /* no body is fine */
        }

        // The month being recapped, and the month we are sending IN (which
        // drives the hero and the care note).
        const now = new Date();
        const recapMonth = monthOverride ?? (now.getUTCMonth() === 0 ? 12 : now.getUTCMonth());
        const recapYear = yearOverride ?? (now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear());
        const sendMonth = recapMonth === 12 ? 1 : recapMonth + 1;
        const sendYear = recapMonth === 12 ? recapYear + 1 : recapYear;

        const start = new Date(Date.UTC(recapYear, recapMonth - 1, 1)).toISOString();
        const end = new Date(Date.UTC(recapYear, recapMonth, 1)).toISOString();
        const prevStart = new Date(Date.UTC(recapYear, recapMonth - 2, 1)).toISOString();
        const recapMonthKey = start.slice(0, 10); // YYYY-MM-01, the log key

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const sb = supabaseAdmin as any;

        // ── Who ────────────────────────────────────────────────────────────
        let profileQ = sb
          .from("profiles")
          .select("id, email, first_name, display_name, locale, notify_monthly_letter")
          .eq("notify_monthly_letter", true);
        if (onlyEmail) profileQ = profileQ.eq("email", onlyEmail);
        const { data: profiles, error: pErr } = await profileQ;
        if (pErr) return Response.json({ ok: false, error: pErr.message }, { status: 500 });

        const ownerIds = (profiles ?? []).map((p: any) => p.id);
        if (ownerIds.length === 0) return Response.json({ ok: true, considered: 0, sent: 0, skipped: [] });

        // Already sent this month's recap? Never send twice.
        const { data: already } = await sb
          .from("monthly_letter_log")
          .select("owner_id")
          .eq("recap_month", recapMonthKey)
          .in("owner_id", ownerIds);
        const done = new Set((already ?? []).map((r: any) => r.owner_id));

        // ── What ───────────────────────────────────────────────────────────
        const { data: birds } = await sb
          .from("birds")
          .select("id, owner_id, name, species, passed_at")
          .in("owner_id", ownerIds)
          .is("passed_at", null);
        const birdIds = (birds ?? []).map((b: any) => b.id);
        if (birdIds.length === 0) return Response.json({ ok: true, considered: profiles.length, sent: 0, skipped: ["no living birds"] });

        const [weights, prevWeights, logs, journal, plans, moments] = await Promise.all([
          sb.from("weight_entries").select("bird_id, grams, measured_at").in("bird_id", birdIds).gte("measured_at", start).lt("measured_at", end).order("measured_at"),
          sb.from("weight_entries").select("bird_id, grams").in("bird_id", birdIds).gte("measured_at", prevStart).lt("measured_at", start),
          sb.from("daily_logs").select("bird_id, log_date, triage_status").in("bird_id", birdIds).gte("log_date", start.slice(0, 10)).lt("log_date", end.slice(0, 10)),
          sb.from("journal_entries").select("bird_id, body, occurred_on, photo_path").in("bird_id", birdIds).gte("occurred_on", start.slice(0, 10)).lt("occurred_on", end.slice(0, 10)).order("occurred_on", { ascending: false }),
          sb.from("care_plans").select("bird_id, updated_at").in("bird_id", birdIds).gte("updated_at", start).lt("updated_at", end),
          sb.from("moments").select("bird_id, title, on_date").in("bird_id", birdIds),
        ]);

        // Anything before the recapped month, for a quiet bird's "last on the record".
        const { data: lastWeights } = await sb
          .from("weight_entries").select("bird_id, grams, measured_at").in("bird_id", birdIds).lt("measured_at", end).order("measured_at", { ascending: false });
        const { data: lastLogs } = await sb
          .from("daily_logs").select("bird_id, log_date, triage_status").in("bird_id", birdIds).lt("log_date", end.slice(0, 10)).order("log_date", { ascending: false });

        const by = <T,>(rows: T[] | null, key: (r: T) => string) => {
          const m = new Map<string, T[]>();
          for (const r of rows ?? []) {
            const k = key(r);
            (m.get(k) ?? m.set(k, []).get(k)!).push(r);
          }
          return m;
        };
        const wByBird = by(weights?.data, (r: any) => r.bird_id);
        const pwByBird = by(prevWeights?.data, (r: any) => r.bird_id);
        const lByBird = by(logs?.data, (r: any) => r.bird_id);
        const jByBird = by(journal?.data, (r: any) => r.bird_id);
        const cByBird = by(plans?.data, (r: any) => r.bird_id);
        const mByBird = by(moments?.data, (r: any) => r.bird_id);
        const lwByBird = by(lastWeights, (r: any) => r.bird_id);
        const llByBird = by(lastLogs, (r: any) => r.bird_id);
        const birdsByOwner = by(birds, (b: any) => b.owner_id);

        // One article for the whole run. Null when unconfigured or failing.
        const { fetchLatestArticle } = await import("@/lib/monthlyArticle.server");
        const article = await fetchLatestArticle();

        const { sendTransactionalEmail, founderReplyTo } = await import("@/lib/brevoEmail.server");

        const planned: Array<{ email: string; birds: number; allQuiet: boolean; subject: string }> = [];
        const skipped: string[] = [];
        let sent = 0;
        let failed = 0;

        for (const p of profiles as any[]) {
          if (done.has(p.id)) { skipped.push(`${p.email}: already sent`); continue; }
          const mine = birdsByOwner.get(p.id) ?? [];
          if (mine.length === 0) { skipped.push(`${p.email}: no living birds`); continue; }
          if (!p.email) { skipped.push(`${p.id}: no email`); continue; }
          const locale = p.locale ?? "en";

          const modelled: MonthlyBird[] = mine.map((b: any) => {
            const ws = (wByBird.get(b.id) ?? []).map((r: any) => Number(r.grams));
            const prev = (pwByBird.get(b.id) ?? []).map((r: any) => Number(r.grams));
            const ls = lByBird.get(b.id) ?? [];
            const js = jByBird.get(b.id) ?? [];
            const quotable = js.find((j: any) => typeof j.body === "string" && j.body.trim().length > 0);
            const plan = (cByBird.get(b.id) ?? []).sort((a: any, z: any) => z.updated_at.localeCompare(a.updated_at))[0];
            const lw = (lwByBird.get(b.id) ?? [])[0];
            const ll = (llByBird.get(b.id) ?? [])[0];
            return {
              name: b.name,
              species: b.species ?? "",
              recordUrl: `${APP_URL}/birds/${b.id}`,
              weights: ws,
              prevSpread: prev.length >= 2 ? spread(prev) : null,
              checks: ls.length,
              flagged: ls.filter((l: any) => l.triage_status === "red").length,
              journalEntries: js.length,
              journalPhotos: js.filter((j: any) => j.photo_path).length,
              planUpdated: plan ? { date: shortDate(plan.updated_at, locale), sections: "" } : null,
              quote: quotable ? { date: longDate(quotable.occurred_on, locale), body: String(quotable.body).slice(0, 240) } : null,
              lastWeight: lw ? { grams: Number(lw.grams), date: longDate(lw.measured_at, locale) } : null,
              lastCheck: ll ? { date: shortDate(ll.log_date, locale), flagged: ll.triage_status === "red" } : null,
            };
          });

          // Dates already on the record that fall in the month we are sending in.
          const coming = mine
            .flatMap((b: any) => (mByBird.get(b.id) ?? []).map((m: any) => ({ bird: b.name, ...m })))
            .filter((m: any) => m.on_date && new Date(m.on_date).getUTCMonth() + 1 === sendMonth)
            .sort((a: any, z: any) => new Date(a.on_date).getUTCDate() - new Date(z.on_date).getUTCDate())
            .slice(0, 3)
            .map((m: any) => ({
              mon: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(m.on_date)),
              day: new Date(m.on_date).getUTCDate(),
              title: m.title ?? "",
              sub: "",
            }));

          const built = buildMonthlyEmail({
            firstName: p.first_name ?? p.display_name ?? undefined,
            birds: modelled,
            month: sendMonth,
            year: sendYear,
            link: APP_URL,
            coming,
            article,
            locale,
          });

          const allQuiet = modelled.every(isQuietMonth);
          planned.push({ email: p.email, birds: modelled.length, allQuiet, subject: built.subject });
          if (dryRun) continue;

          const res = await sendTransactionalEmail({
            to: p.email,
            toName: p.first_name ?? p.display_name ?? undefined,
            subject: built.subject,
            htmlContent: built.html,
            textContent: built.text,
            replyTo: founderReplyTo(),
          });
          if (!res.ok) { failed++; skipped.push(`${p.email}: send failed`); continue; }
          sent++;
          await sb.from("monthly_letter_log").insert({
            owner_id: p.id,
            recap_month: recapMonthKey,
            bird_count: modelled.length,
            all_quiet: allQuiet,
          });
        }

        return Response.json({
          ok: true,
          dryRun,
          recapMonth: recapMonthKey,
          sendMonth,
          articleBlock: article ? "included" : "omitted (webflow unconfigured or failed)",
          considered: profiles.length,
          planned: planned.length,
          sent,
          failed,
          skipped,
          ...(dryRun ? { wouldSend: planned } : {}),
        });
      }),
    },
  },
});
