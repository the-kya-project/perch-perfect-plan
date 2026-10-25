// The Founding 50 (/founding): the public counter and the claim.
//
// The rules live in the database (supabase/migrations/*_founding_claims.sql):
// claim_founding_spot() takes the lock, checks the deadline against the
// database clock, refuses a second claim and anything past 50, and saves the
// region to flock_profiles. This file only carries the calls and adds the
// claimant to the Brevo "Founding 50" list afterwards.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type FoundingStatus = { claimed: number; cap: number; open: boolean };

/** The public counter. Read with the service role so signed-out visitors need
 *  no database grant; founding_status() returns aggregates only. */
export const getFoundingStatus = createServerFn({ method: "GET" }).handler(async (): Promise<FoundingStatus> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("founding_status");
  if (error) throw new Error(`founding_status failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { claimed: row?.claimed ?? 0, cap: row?.cap ?? 50, open: row?.open === true };
});

export type ClaimRefusal = "already_claimed" | "full" | "closed" | "invalid_region" | "error";
export type ClaimResult =
  | { ok: true; spotNumber: number; regionSlug: string }
  | { ok: false; reason: ClaimRefusal };

// The claim function's exception messages (see the migration).
function refusalFrom(message: string): ClaimRefusal {
  if (message.includes("founding_already_claimed")) return "already_claimed";
  if (message.includes("founding_full")) return "full";
  if (message.includes("founding_closed")) return "closed";
  if (message.includes("founding_invalid_region")) return "invalid_region";
  return "error";
}

export const claimFoundingSpot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { regionSlug: string; source?: string | null }) =>
    z
      .object({
        regionSlug: z.string().trim().min(1).max(64),
        source: z.string().trim().max(80).nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<ClaimResult> => {
    // Runs as the signed-in user: the function reads auth.uid() from this JWT.
    const { data: row, error } = await context.supabase.rpc("claim_founding_spot", {
      p_region_slug: data.regionSlug,
      p_source: data.source ?? undefined,
    });
    if (error || !row) {
      const reason = refusalFrom(error?.message ?? "");
      if (reason === "error") console.error("[founding] claim failed", error?.message);
      return { ok: false, reason };
    }

    // Brevo "Founding 50" list. Best effort and awaited (a serverless function
    // can stop as soon as it returns); a failure never undoes the claim.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ data: user }, { data: profile }] = await Promise.all([
        supabaseAdmin.auth.admin.getUserById(context.userId),
        supabaseAdmin.from("profiles").select("first_name, full_name, display_name, email").eq("id", context.userId).maybeSingle(),
      ]);
      const email = user?.user?.email;
      if (email) {
        const { addContactToList } = await import("./brevoContacts.server");
        const { realFirstName } = await import("./personName");
        // Brevo's own campaigns greet with FIRSTNAME: real names only.
        const firstName = profile ? realFirstName(profile, email, profile.email) ?? null : null;
        await addContactToList("BREVO_FOUNDING_LIST_ID", { email, firstName });
      }
    } catch (err) {
      console.error("[founding] Brevo list add failed", err);
    }

    return { ok: true, spotNumber: row.spot_number, regionSlug: row.region_slug };
  });
