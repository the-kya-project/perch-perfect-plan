import { supabase } from "@/integrations/supabase/client";
import type { Attribution } from "./attribution";

export type CaptureLeadInput = {
  email: string;
  firstName?: string;
  lastName?: string;
  source: string;
  marketingConsent: boolean;
  /** First-touch traffic attribution → Brevo SIGNUP_* attributes. */
  attribution?: Attribution | null;
};

/**
 * Fire-and-forget marketing lead capture.
 * Never throws; failures are logged so the calling flow is not blocked.
 */
export async function captureLead(input: CaptureLeadInput): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("capture-lead", {
      body: {
        email: input.email,
        firstName: input.firstName ?? "",
        lastName: input.lastName ?? "",
        source: input.source,
        marketingConsent: input.marketingConsent,
        attribution: input.attribution ?? null,
      },
    });
    if (error) {
      console.warn("captureLead failed", error);
    }
  } catch (err) {
    console.warn("captureLead threw", err);
  }
}
