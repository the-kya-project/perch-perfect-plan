import i18next from "i18next";
import { friendlyError } from "@/lib/errorMessage";

/**
 * Supabase Auth returns English copy ("Invalid login credentials", …) that we
 * used to show verbatim. Map the common ones to keyed strings at display time so
 * they follow the app language. The English defaults are the exact Supabase
 * messages, so English output is unchanged. Anything unrecognised falls back to
 * friendlyError (the raw message, or the caller's fallback for database noise).
 */
export function authErrorMessage(err: unknown, fallback?: string): string {
  const e = err as { message?: unknown } | null | undefined;
  const raw = typeof e?.message === "string" ? e.message.trim() : "";

  switch (raw) {
    case "Invalid login credentials":
      return i18next.t("authError.invalidCredentials", "Invalid login credentials");
    case "Email not confirmed":
      return i18next.t("authError.emailNotConfirmed", "Email not confirmed");
    case "User already registered":
      return i18next.t("authError.userAlreadyRegistered", "User already registered");
    case "Email rate limit exceeded":
      return i18next.t("authError.emailRateLimit", "Email rate limit exceeded");
    case "Request rate limit reached":
      return i18next.t("authError.requestRateLimit", "Request rate limit reached");
    case "New password should be different from the old password.":
      return i18next.t("authError.samePassword", "New password should be different from the old password.");
  }

  const wait = /^For security purposes, you can only request this after (\d+) seconds\.$/.exec(raw);
  if (wait) {
    return i18next.t(
      "authError.securityWait",
      "For security purposes, you can only request this after {{seconds}} seconds.",
      { seconds: wait[1] },
    );
  }

  const weak = /^Password should be at least (\d+) characters\.$/.exec(raw);
  if (weak) {
    return i18next.t("authError.weakPasswordLength", "Password should be at least {{n}} characters.", { n: weak[1] });
  }

  return fallback === undefined ? friendlyError(err) : friendlyError(err, fallback);
}
