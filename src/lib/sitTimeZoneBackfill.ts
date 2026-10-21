import { supabase } from "@/integrations/supabase/client";
import { dateInTimeZone, deviceTimeZone, isMissingTimeZoneColumn, isValidTimeZone } from "./sitTimeZone";
import { pickSitTimeZone } from "./sitTimeZoneNames";

// The owner's HOME time zone is saved on their account (profiles.time_zone),
// and sits follow it: the sits trigger stamps every sit with the account zone
// whatever the device sends, and changing the account zone moves the owner's
// current and upcoming sits (20261021180000_profile_time_zone). So a phone
// that is travelling never shifts when a sitter link ends.
//
// The account zone is filled from this device the first time the owner opens
// the app; after that only Account → Time zone changes it.

/** The account's saved home zone, or null when none is saved yet. */
export async function fetchAccountTimeZone(userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("time_zone").eq("id", userId).maybeSingle();
  if (error) throw error;
  const tz = (data as { time_zone?: string | null } | null)?.time_zone;
  return isValidTimeZone(tz) ? tz : null;
}

/** Save the account's home zone. The database then moves the owner's current
 *  and upcoming sits to it. Throws if the row didn't change (an RLS-blocked
 *  UPDATE returns no error, just zero rows). */
export async function saveAccountTimeZone(userId: string, tz: string): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .update({ time_zone: tz })
    .eq("id", userId)
    .select("time_zone")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Couldn't save your time zone. Please try again.");
}

/** Fill the account zone from this device only while it is still empty, so a
 *  zone the owner already has (or chose) is never overwritten. Returns false
 *  when profiles.time_zone isn't in the database yet. */
async function fillAccountTimeZone(userId: string, tz: string): Promise<boolean> {
  const { error } = await supabase.from("profiles").update({ time_zone: tz }).eq("id", userId).is("time_zone", null);
  if (isMissingTimeZoneColumn(error)) return false;
  if (error) console.warn("fillAccountTimeZone failed", error.message);
  return true;
}

/**
 * The zone a sit is saved with: the account's, else this device's — which is
 * then saved as the account's too, so every later sit (and the trigger) use it.
 * Best-effort: on any error it falls back to the device zone, and the trigger
 * still applies the account zone whenever one exists.
 */
export async function resolveSitTimeZone(userId: string): Promise<string | null> {
  const device = deviceTimeZone();
  try {
    const { zone, saveToAccount } = pickSitTimeZone(await fetchAccountTimeZone(userId), device);
    if (saveToAccount && zone) await fillAccountTimeZone(userId, zone);
    return zone;
  } catch {
    return device;
  }
}

let ran = false;

/**
 * On app open: the first time, save this device's zone as the account's home
 * zone (the database then gives it to the owner's current and upcoming sits
 * that have none). Once saved it is left alone, so opening the app while
 * travelling changes nothing. One read per app open; best-effort.
 */
export async function ensureAccountTimeZone(userId: string): Promise<void> {
  if (ran) return;
  ran = true;
  const tz = deviceTimeZone();
  if (!tz) return;
  try {
    const { data, error } = await supabase.from("profiles").select("time_zone").eq("id", userId).maybeSingle();
    if (isMissingTimeZoneColumn(error)) { await legacySitBackfill(userId, tz); return; }
    if (error) { console.warn("ensureAccountTimeZone failed", error.message); return; }
    if (!data || (data as { time_zone?: string | null }).time_zone) return;
    if (!(await fillAccountTimeZone(userId, tz))) await legacySitBackfill(userId, tz);
  } catch (err) {
    console.warn("ensureAccountTimeZone failed", err);
  }
}

// Only while profiles.time_zone isn't in the database yet (the web app can go
// live moments before its migration): the previous behaviour, saving this
// device's zone on the owner's not-yet-ended sits that have none.
async function legacySitBackfill(userId: string, tz: string): Promise<void> {
  const { error } = await supabase
    .from("sits")
    .update({ time_zone: tz })
    .eq("owner_id", userId)
    .is("time_zone", null)
    .gte("end_date", dateInTimeZone(tz));
  if (error) console.warn("legacySitBackfill failed", error.message);
}
