import { supabase } from "@/integrations/supabase/client";
import { dateInTimeZone, deviceTimeZone } from "./sitTimeZone";

// Sits created before sits.time_zone existed have none, so their sitter link
// still ends at 23:59:59 UTC on the last day (the afternoon or evening of that
// day in the Americas). When the owner opens the app, save this device's zone
// on their own sits that haven't ended yet; the sits trigger then moves each
// link's end to the end of the last day in that zone.
//
// One UPDATE per app open, owner-scoped (the "sits update" policy is owner-only
// anyway), and only rows still missing a zone — so it is a no-op once done and
// never overwrites a zone the owner already saved. Best-effort: a failure just
// leaves the old UTC expiry in place until the next open.
let ran = false;

export async function backfillSitTimeZones(userId: string): Promise<void> {
  if (ran) return;
  ran = true;
  const tz = deviceTimeZone();
  if (!tz) return;
  try {
    const { error } = await supabase
      .from("sits")
      .update({ time_zone: tz })
      .eq("owner_id", userId)
      .is("time_zone", null)
      .gte("end_date", dateInTimeZone(tz));
    if (error) console.warn("backfillSitTimeZones failed", error.message);
  } catch (err) {
    console.warn("backfillSitTimeZones failed", err);
  }
}
