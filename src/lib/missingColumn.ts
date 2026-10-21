// The web app can go live a few minutes before the migration it ships with is
// applied (Vercel deploys on push to main; Supabase applies migrations on
// merge). A write that names a column the database doesn't have yet fails with
// PGRST204 / 42703; callers retry without that column so nothing breaks in the
// gap. Reads avoid the problem by selecting "*".
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined, column: string): boolean {
  if (!error) return false;
  return (error.code === "PGRST204" || error.code === "42703") && (error.message ?? "").includes(column);
}
