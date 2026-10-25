// Has this email address already confirmed its account? Asked by /link-expired
// when someone opens an old or replaced confirmation link: a confirmed account
// goes straight to sign-in instead of being sent yet another link (Supabase's
// resend returns success for a confirmed account and sends nothing, so the
// browser can't tell on its own).
//
// The answer is one boolean, and only "confirmed" changes what the page does.
// Sign-up already says whether an email has an account (the "You already have
// an account" card), so this adds little to what an outsider could learn.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getConfirmationStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => z.object({ email: z.string().trim().email().max(320) }).parse(d))
  .handler(async ({ data }): Promise<{ confirmed: boolean }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Postdates the generated types.
    const { data: confirmed, error } = await (supabaseAdmin as any).rpc("auth_email_confirmed", { p_email: data.email });
    if (error) {
      // Not knowing is never fatal: the page falls back to sending a new link.
      console.error("[confirmation-status] rpc failed", error.message);
      return { confirmed: false };
    }
    return { confirmed: confirmed === true };
  });
