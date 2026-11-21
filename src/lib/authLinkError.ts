// Did Supabase send the reader back here because an emailed auth link failed?
//
// A confirmation link points at Supabase's /auth/v1/verify. When the token is
// expired, already used, or was replaced by a newer email (each resend
// invalidates the previous link), Supabase redirects to the link's
// redirect_to (/welcome for owner sign-up) with the error in the URL:
//
//   /welcome?error=access_denied&error_code=otp_expired&error_description=…#error=…&sb=
//
// (PKCE puts it in the query; the hash always carries it too.) It's the same
// error whether the link expired, was replaced, or the account is already
// confirmed, so the reason alone can't say which. /link-expired sorts that out.

export type AuthLinkError = {
  /** Supabase's error_code, e.g. "otp_expired". */
  code: string;
};

function params(raw: string): URLSearchParams {
  return new URLSearchParams(raw.replace(/^[?#]/, ""));
}

// Only failures of an emailed link. Google and Apple sign-in come back to
// /welcome too, and a cancelled one arrives as error=access_denied; that must
// not read as "your link expired".
const EMAIL_LINK_CODES = new Set(["otp_expired", "otp_disabled"]);
const EMAIL_LINK_DESCRIPTION = /email link|link is invalid|token (has )?expired|invalid (or expired )?token|already (been )?used/i;

/** Read an emailed-link failure from a URL's query string and hash (with or
 *  without the leading ? / #). Null when the URL carries none. */
export function readAuthLinkError(search: string, hash: string): AuthLinkError | null {
  for (const p of [params(search), params(hash)]) {
    const code = p.get("error_code") ?? "";
    const description = p.get("error_description") ?? "";
    if (EMAIL_LINK_CODES.has(code) || EMAIL_LINK_DESCRIPTION.test(description)) {
      return { code: (code || p.get("error") || "unknown").slice(0, 64) };
    }
  }
  return null;
}
