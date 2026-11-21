// Did supabase.auth.signUp() just meet an email that already has an account?
//
// Production has "Confirm email" ON. There, Supabase hides which emails are
// registered: signUp() for an existing email returns NO error, a null session,
// and an obfuscated user whose `identities` array is EMPTY (a real new sign-up
// always has one identity). That empty array is the only signal, so it's the
// primary check.
//
// With "Confirm email" OFF (the staging branch that Vercel previews use),
// Supabase returns an error instead ("User already registered"), so that's
// checked too; otherwise a preview would show the raw error.
//
// Pinned by `npm run test:signup-existing`, which feeds the real supabase-js
// signUp() the response bodies Supabase sends in each case.

type SignUpResult = {
  data: { user: { identities?: unknown[] | null } | null; session: unknown } | null;
  error: { message?: string } | null;
};

export type ExistingAccountSignal = "empty_identities" | "error";

export function existingAccountSignal({ data, error }: SignUpResult): ExistingAccountSignal | null {
  if (error) return /already\s*(registered|exist)/i.test(error.message ?? "") ? "error" : null;
  const identities = data?.user?.identities;
  if (!data?.session && Array.isArray(identities) && identities.length === 0) return "empty_identities";
  return null;
}
