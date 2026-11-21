// The last two steps of account deletion (deleteMyAccount in
// account.functions.ts), kept dependency-free so scripts/account-deletion.test.ts
// can run them with stand-ins for Supabase and PostHog.
//
// ORDER MATTERS:
//   1. Delete the auth user. Fatal on failure: the account still exists, and
//      reporting success would be a lie. PostHog is NOT touched in that case,
//      so a person who can still sign in keeps their history.
//   2. Then delete their PostHog person, events and recordings (the privacy
//      policy promises this). AWAITED, because post-response work is frozen on
//      Vercel, and best-effort: a PostHog failure is logged inside
//      deletePostHogPerson and never fails the deletion.

export type FinishAccountDeletionDeps = {
  deleteAuthUser: (userId: string) => Promise<{ error: { message: string } | null }>;
  deletePostHogPerson: (userId: string) => Promise<{ ok: boolean; reason?: string }>;
};

export async function finishAccountDeletion(
  deps: FinishAccountDeletionDeps,
  userId: string,
): Promise<{ analyticsDeleted: boolean }> {
  const { error } = await deps.deleteAuthUser(userId);
  if (error) throw new Error(error.message);
  let analytics: { ok: boolean };
  try {
    analytics = await deps.deletePostHogPerson(userId);
  } catch {
    // deletePostHogPerson never throws today; this keeps it that way for the caller.
    analytics = { ok: false };
  }
  return { analyticsDeleted: analytics.ok };
}
