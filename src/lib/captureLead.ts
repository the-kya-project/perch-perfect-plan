import { supabase } from "@/integrations/supabase/client";

export type CaptureLeadInput = {
  email: string;
  name?: string;
  source: string;
  marketingConsent: boolean;
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
        name: input.name ?? "",
        source: input.source,
        marketingConsent: input.marketingConsent,
      },
    });
    if (error) {
      console.warn("captureLead failed", error);
    }
  } catch (err) {
    console.warn("captureLead threw", err);
  }
}
