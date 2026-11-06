/**
 * Sorting what @capgo/capacitor-social-login (and the web fallback) reject
 * with into "the person cancelled", "this build has no plugin", and real
 * failures. Pure, so scripts/oauth-errors.test.ts can pin it.
 *
 * Why the message alone isn't enough (Nov 2026): Apple's cancel arrived as
 * "The operation couldn't be completed. (com.apple.AuthenticationServices.
 * AuthorizationError error 1001.)", with no "cancel" in it, and was shown on
 * /auth as an error. 1001 is ASAuthorizationError.canceled. The plugin (8.7+)
 * also sets code "USER_CANCELLED" on it, which the old check never read. iOS
 * localizes the word "error" in that text ("fout" in Dutch), so the domain and
 * number are matched with anything short in between.
 */

/** The plugin's code for any cancel, on iOS and Android. */
export const USER_CANCELLED_CODE = "USER_CANCELLED";

function readCode(e: unknown): string {
  try {
    const anyE = e as { code?: unknown } | null;
    return anyE?.code == null ? "" : String(anyE.code);
  } catch {
    return "";
  }
}

function readMessage(e: unknown): string {
  try {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    const anyE = e as { message?: unknown } | null;
    return typeof anyE?.message === "string" ? anyE.message : String(e);
  } catch {
    return "";
  }
}

const CANCEL_PATTERNS: RegExp[] = [
  // "User cancelled", "The user canceled the sign-in flow." (Google iOS),
  // "activity is cancelled by the user." (Android Credential Manager),
  // "User cancelled login." (the plugin's OAuth2 provider)
  /cancel/i,
  // Apple: ASAuthorizationError.canceled, in any iOS language
  /AuthorizationError\D{0,12}1001\b/,
  // ASWebAuthenticationSession's canceledLogin (a browser-based sheet closed)
  /WebAuthenticationSession\D{0,12}\b1\b/,
  // Google Sign-In for iOS: kGIDSignInErrorCodeCanceled
  /GIDSignIn\D{0,12}-5\b/,
  // The provider's own "the person said no" on the web flow
  /access[_ ]denied/i,
];

/** The person closed or declined the sign-in: not an error to show. */
export function isOAuthCancel(e: unknown): boolean {
  if (readCode(e) === USER_CANCELLED_CODE) return true;
  const msg = readMessage(e);
  return CANCEL_PATTERNS.some((re) => re.test(msg));
}

/**
 * Capacitor's rejection for a plugin the native build doesn't have. This, and
 * only this, sends sign-in to the web fallback.
 */
export function isPluginUnimplemented(e: unknown): boolean {
  return readCode(e) === "UNIMPLEMENTED" || /plugin is not implemented/i.test(readMessage(e));
}
