// TEMPORARY — error-capture verification trigger. Remove after rollout.
//
// Signed in as the owner's account, open any page with
//   ?kya_error_test=<kind>&n=<nonce>
// kind: client (uncaught error) | unhandled (rejected promise) | render (React
// error screen) | server (server function) | burst (11 server errors, same type).
// The nonce becomes part of the error TYPE, so every run is a brand-new issue.
//
// The message deliberately carries DUMMY data shaped like the things that must
// never reach PostHog (a care-plan row, an email, a sitter link), so the
// production payload can be checked for them.

// Read ONCE, when the app first loads, before the router validates the search
// string: routes with validateSearch (e.g. /dashboard) drop unknown params like
// kya_error_test from the address bar, so reading it later finds nothing.
export const ERROR_TEST_INITIAL_SEARCH: string =
  typeof window !== "undefined" ? window.location.search : "";

export const ERROR_TEST_ACCOUNT = "df4c89f5-0be0-4df2-9ecf-e6818fa7471d"; // brittany@thekyaproject.com

export function errorTestMessage(kind: string): string {
  return (
    `Kya error test (${kind}). Failing row contains (Testbird, test health note plucking, 999) ` +
    `for error-test@example.com at /sitter/0000000000000000000000000000000000000000000000000000000000000000`
  );
}
