// Display names for OTHER users (household members, owners, caregivers).
// profiles RLS is self-only, so a client `from("profiles")` read of someone
// else's row comes back empty. This goes through resolveHouseholdNames (service
// role, scoped to people who share a bird with the caller) instead.
// Returns user_id -> trimmed display name; ids without a name are omitted, so
// callers keep their own fallback ("Household member", "Someone", …).
// A failed lookup returns {} so a list never fails over names; pass
// { rethrow: true } from a query function of its own so the failure isn't
// cached as "no names" and the query retries.
import { resolveHouseholdNames } from "@/lib/home.functions";

export async function fetchDisplayNames(
  ids: Array<string | null | undefined>,
  opts: { rethrow?: boolean } = {},
): Promise<Record<string, string>> {
  const want = [...new Set(ids.filter((id): id is string => !!id))];
  if (!want.length) return {};
  try {
    const res = await resolveHouseholdNames({ data: { userIds: want.slice(0, 200) } });
    const out: Record<string, string> = {};
    for (const [id, r] of Object.entries(res ?? {})) {
      const n = (r?.name ?? "").trim();
      if (n) out[id] = n;
    }
    return out;
  } catch (e) {
    if (opts.rethrow) throw e;
    return {};
  }
}
