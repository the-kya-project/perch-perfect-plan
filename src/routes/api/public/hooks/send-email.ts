/**
 * Supabase Auth "Send Email" hook. Supabase calls this for every auth email
 * instead of sending it itself; we send it through Brevo in the user's
 * language. See src/lib/authEmailHook.server.ts for the why and the contract.
 *
 * Auth: Standard Webhooks signature, secret SEND_EMAIL_HOOK_SECRET (the
 * "v1,whsec_…" value from Supabase → Authentication → Auth Hooks).
 *
 * Errors use the shape Supabase expects, { error: { http_code, message } },
 * which it shows to the user as the auth action's failure.
 */
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { createFileRoute } from "@tanstack/react-router";

const fail = (status: number, message: string) =>
  Response.json({ error: { http_code: status, message } }, { status });

export const Route = createFileRoute("/api/public/hooks/send-email")({
  server: {
    handlers: {
      POST: withErrorTelemetry("/api/public/hooks/send-email", async ({ request }) => {
        const secret = process.env.SEND_EMAIL_HOOK_SECRET;
        const supabaseUrl = process.env.SUPABASE_URL;
        if (!secret || !supabaseUrl) return fail(503, "send-email hook not configured");

        const body = await request.text();
        const {
          verifyHookSignature,
          planAuthEmails,
          authEmailLocale,
          sendAuthEmails,
        } = await import("@/lib/authEmailHook.server");

        const signed = verifyHookSignature(
          body,
          {
            id: request.headers.get("webhook-id"),
            timestamp: request.headers.get("webhook-timestamp"),
            signature: request.headers.get("webhook-signature"),
          },
          secret,
        );
        if (!signed) return fail(401, "invalid signature");

        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          return fail(400, "invalid json");
        }
        if (!payload?.user?.id || !payload?.email_data?.email_action_type) {
          return fail(400, "missing user or email_data");
        }

        const planned = planAuthEmails(payload, supabaseUrl);
        if (planned.length === 0) {
          console.warn("[send-email] no template for", payload.email_data.email_action_type);
          return Response.json({});
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const locale = await authEmailLocale(supabaseAdmin, payload.user);
        const res = await sendAuthEmails(planned, locale);
        if (!res.ok) {
          console.error("[send-email] send failed", payload.email_data.email_action_type, res.error);
          return fail(500, "We couldn't send the email. Please try again in a moment.");
        }
        return Response.json({});
      }),
    },
  },
});
