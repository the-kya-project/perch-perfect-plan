import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Minimal column set for owner "active bird" pickers and lists (id + name).
export const ACTIVE_BIRD_MIN_SELECT = "id, name";

export type ActiveBirdMin = { id: string; name: string };

// Owner's ACTIVE birds — the standard "not passed" query with the
// `.is("passed_at", null)` filter baked in, so new surfaces get it by
// construction. Passed birds live only in Remembering; they must never appear
// in a live list, picker, or count. Returns the query builder so callers chain
// the `.order(...)` they need, then `await` it (or read `.data`).
//
// Works with both the browser `supabase` client and the server `supabaseAdmin`
// client (identical query-builder API). Pass `ownerId` to scope by owner —
// REQUIRED on `supabaseAdmin`, which bypasses RLS; optional on the browser
// client, where RLS already restricts rows to the signed-in owner's birds.
export function activeOwnerBirdsMin(
  client: SupabaseClient<Database>,
  ownerId?: string | null,
) {
  const q = client
    .from("birds")
    .select(ACTIVE_BIRD_MIN_SELECT)
    .is("passed_at", null);
  return ownerId != null ? q.eq("owner_id", ownerId) : q;
}
