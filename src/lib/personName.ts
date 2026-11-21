// Names for emails: real names only, never anything made from an email address.
//
// Sign in with Apple users who hide their email get an address like
// 2dkh5ctcgb@privaterelay.appleid.com, and sign-ups that gave no name used to
// fall back to the part before the @. Emails then said "Welcome to the flock,
// 2dkh5ctcgb." Every template has a nameless version ("Welcome to the flock."),
// so when there's no real name the right answer is no name.
//
// "Made from the email" means EXACTLY the part before the @, capitals included:
// the old fallbacks copied it verbatim (split_part / split("@")), so a derived
// name is always lowercase-identical to the address, while a real name that
// happens to match ("Brittany" for brittany@…) keeps its capital and is kept.

/** The part of an email address before the @, or "" when there isn't one. */
export function emailLocalPart(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  const at = e.indexOf("@");
  return at > 0 ? e.slice(0, at) : "";
}

/** True when `name` is empty, looks like an address, or is exactly the part of
 *  `email` before the @ (or of any of `emails`). */
export function isEmailDerivedName(name: string | null | undefined, ...emails: Array<string | null | undefined>): boolean {
  const n = (name ?? "").trim();
  if (!n || n.includes("@")) return true;
  return emails.some((e) => {
    const local = emailLocalPart(e);
    return local !== "" && n === local;
  });
}

/** A real full name for a person, or null: the first of `candidates` that
 *  isn't made from their email. For "To:" lines and "<name> invited you". */
export function realFullName(
  candidates: Array<string | null | undefined>,
  ...emails: Array<string | null | undefined>
): string | null {
  for (const c of candidates) {
    const n = (c ?? "").toString().trim();
    if (n && !isEmailDerivedName(n, ...emails)) return n;
  }
  return null;
}

/** A real first name for a greeting, or undefined (the template then greets
 *  with no name): profiles.first_name, else the first word of the full or
 *  display name, skipping anything made from the email. */
export function realFirstName(
  p: { first_name?: string | null; full_name?: string | null; display_name?: string | null },
  ...emails: Array<string | null | undefined>
): string | undefined {
  const first = (p.first_name ?? "").toString().trim();
  if (first && !isEmailDerivedName(first, ...emails)) return first;
  const full = realFullName([p.full_name, p.display_name], ...emails);
  const word = (full ?? "").split(/\s+/)[0] ?? "";
  return word && !isEmailDerivedName(word, ...emails) ? word : undefined;
}
