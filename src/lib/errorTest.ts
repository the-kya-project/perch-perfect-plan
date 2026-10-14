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

export const ERROR_TEST_ACCOUNT = "0696b18f-681b-489b-9301-9074cb3f3ac4";

export function errorTestMessage(kind: string): string {
  return (
    `Kya error test (${kind}). Failing row contains (Testbird, test health note plucking, 999) ` +
    `for error-test@example.com at /sitter/0000000000000000000000000000000000000000000000000000000000000000`
  );
}
