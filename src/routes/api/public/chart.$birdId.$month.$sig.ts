/**
 * A bird's weight chart for that month, as a PNG.
 *
 * Rendered when a mail client asks for it rather than when the email is sent:
 * no bucket, no uploads, nothing to expire. The URL carries a bird id, a month
 * and an HMAC — never the weights, which would otherwise end up in a query
 * string that Gmail's proxy fetches and logs.
 *
 * Public by necessity (a mail client has no session), so the signature is what
 * keeps it from being walked. An unsigned or wrong signature is a 404, not a
 * 403: there is no reason to confirm that a bird id exists.
 *
 * A RENDER failure is a 500, not a 404. Those two used to be the same response,
 * which is how a broken asset path shipped and looked exactly like a stale
 * link — nothing in the logs stood out because nothing was logged as an error.
 * A 500 with the real message is the difference between "someone clicked an old
 * email" and "every chart in the programme is down".
 *
 * Cached hard. The month being drawn is over, so the picture will not change,
 * and Gmail proxies and caches it once per recipient anyway.
 */
import { createFileRoute } from "@tanstack/react-router";
import { chartSigValid, CHART_DEMO_ID } from "@/lib/chartLink";

/** The sample series the onboarding weighing letter shows. Fixed on purpose:
 *  it is a picture of what a record looks like, not anyone's real bird. */
const DEMO_POINTS = [
  { day: 2, g: 752 }, { day: 4, g: 749 }, { day: 6, g: 755 }, { day: 8, g: 751 },
  { day: 10, g: 747 }, { day: 12, g: 753 }, { day: 14, g: 758 }, { day: 16, g: 750 },
  { day: 18, g: 746 }, { day: 20, g: 754 }, { day: 22, g: 757 }, { day: 24, g: 752 },
  { day: 26, g: 748 }, { day: 28, g: 756 }, { day: 30, g: 751 },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];

export const Route = createFileRoute("/api/public/chart/$birdId/$month/$sig")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { birdId, month, sig } = params as { birdId: string; month: string; sig: string };
        const m = /^(\d{4})-(\d{2})$/.exec(month);
        if (!m || !chartSigValid(birdId, month, sig)) return new Response("Not found", { status: 404 });
        const year = Number(m[1]);
        const mon = Number(m[2]);
        if (mon < 1 || mon > 12) return new Response("Not found", { status: 404 });
        const days = new Date(Date.UTC(year, mon, 0)).getUTCDate();

        let points: Array<{ day: number; g: number }>;
        if (birdId === CHART_DEMO_ID) {
          points = DEMO_POINTS;
        } else {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const start = new Date(Date.UTC(year, mon - 1, 1)).toISOString();
          const end = new Date(Date.UTC(year, mon, 1)).toISOString();
          const { data, error } = await (supabaseAdmin as any)
            .from("weight_entries")
            .select("grams, measured_at")
            .eq("bird_id", birdId)
            .gte("measured_at", start)
            .lt("measured_at", end)
            .order("measured_at");
          if (error) {
            console.error("[chart] weight query failed", { birdId, month, error });
            return new Response("Chart could not be rendered", { status: 500 });
          }
          points = (data ?? []).map((r: any) => ({ day: new Date(r.measured_at).getUTCDate(), g: Number(r.grams) }));
        }
        if (points.length === 0) return new Response("Not found", { status: 404 });

        try {
          const { chartPng } = await import("@/lib/weightChart.server");
          const png = await chartPng(
            { points, days, axisStart: `${MONTHS[mon - 1]} 1`, axisEnd: `${MONTHS[mon - 1]} ${days}` },
            new URL(request.url).origin,
          );
          return new Response(new Uint8Array(png), {
            headers: {
              "content-type": "image/png",
              // The month is over; this image is final.
              "cache-control": "public, max-age=31536000, immutable",
            },
          });
        } catch (e) {
          // Loud on purpose: this is our bug, not a bad link.
          console.error("[chart] RENDER FAILED", {
            birdId,
            month,
            origin: new URL(request.url).origin,
            error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
          });
          return new Response("Chart could not be rendered", { status: 500 });
        }
      },
    },
  },
});
