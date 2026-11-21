// The Founding 50 (/founding): the public counter and the claim.
//
// The rules live in the database (supabase/migrations/*_founding_claims.sql):
// claim_founding_spot() takes the lock, refuses a second claim and anything
// past 50 (there's no closing date: founding_deadline() is infinity), and saves the
// region to flock_profiles. This file only carries the calls and adds the
// claimant to the Brevo "Founding 50" list afterwards (BREVO_FOUNDING_LIST_ID;
// a missing id or Brevo error raises a save-error alert).
//
// A claim also grants a founding entitlement (database trigger, migration
// 20261107120000_flock_entitlement_grants): free from opening day
// (flock_settings.flock_opens_at) until the free season ends
// (flock_settings.free_season_ends_at, set when Brittany opens the Flock;
// migration 20261119150000_founding_free_season_end), stored as free_until; billing at
// the locked $15 starts from free_until in the payments step.
// FOUNDING PRICE IS ONE-WAY: if a founding membership is cancelled, the
// founding price does not come back. A returning member pays the regular
// price; payments code must never re-apply locked_price_cents after a cancel.

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
  .inputValidator((d: { regionSlug: string; source?: string | null; showOnFoundersPage?: boolean }) =>
    z
      .object({
        regionSlug: z.string().trim().min(1).max(64),
        source: z.string().trim().max(80).nullish(),
        showOnFoundersPage: z.boolean().optional(),
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

    // "Show me on the founding members page" (unchecked unless chosen). Saved
    // right after the claim; a failure never undoes the claim, and the founder
    // can set it later on their Flock profile.
    if (data.showOnFoundersPage === true) {
      // Not in the generated types yet (20261121120000).
      const { error: showError } = await (context.supabase as any).rpc("founding_set_show", { p_show: true });
      if (showError) console.error("[founding] saving the founders page choice failed", showError.message);
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
        const { addContactToListReported } = await import("./serverSaveErrors.server");
        const { realFirstName } = await import("./personName");
        // Brevo's own campaigns greet with FIRSTNAME: real names only.
        const firstName = profile ? realFirstName(profile, email, profile.email) ?? null : null;
        // List 9 only (consent: "We'll email you before the Flock opens").
        // A missing list id or a Brevo error is recorded and alerted on.
        await addContactToListReported("BREVO_FOUNDING_LIST_ID", { email, firstName }, { route: "/founding" });
      }
    } catch (err) {
      // Reading the user or profile failed before the list add was tried.
      console.error("[founding] Brevo list add failed", err);
      const { recordServerSaveError } = await import("./serverSaveErrors.server");
      await recordServerSaveError({ category: "server", sqlstate: null, target: "brevo_founding_list_id", operation: "brevo_list" }, "/founding");
    }

    return { ok: true, spotNumber: row.spot_number, regionSlug: row.region_slug };
  });
