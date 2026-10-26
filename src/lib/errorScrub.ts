// Redaction for error reports (PostHog `$exception` events), on top of the URL
// scrubber. Pure and dependency-free apart from urlScrub, so it runs in the
// browser, on the server, and directly in scripts/url-scrub.test.ts.
//
// An error message is the one field we don't write ourselves, and the places
// it comes from can quote user data back at us:
//   - Postgres: `Failing row contains (<every column of the row>)` and
//     `Key (col)=(<value>) already exists` — whole care-plan rows, health notes
//     included, can arrive inside a constraint violation.
//   - `invalid input syntax for type uuid: "<whatever was sent>"` and friends
//     quote the offending input.
//   - Our own code occasionally interpolates an email address into a message.
// So every message is scrubbed here before it leaves, and capped.

import { redactSecrets } from "./urlScrub";

export const ERROR_MESSAGE_MAX = 500;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Postgres row dump in a constraint violation. Greedy to the end of the line:
// row values can contain parentheses.
const FAILING_ROW_RE = /Failing row contains \(.*$/gim;
// `Key (col1, col2)=(v1, v2)` — keep the column names, drop the values.
const KEY_VALUE_RE = /(Key \([^)]*\))=\(.*?\)(?= |$|\.)/gi;
// DETAIL / HINT lines carry row values too.
const PG_DETAIL_RE = /\b(DETAIL|HINT):[^\n]*/g;
// `…: "quoted input"` — the input Postgres or a validator is complaining about.
const QUOTED_INPUT_RE = /:\s*"[^"]*"/g;

/** Scrub one error message. Safe on any string; idempotent. */
export function scrubErrorMessage(message: string): string {
  let out = message
    .replace(FAILING_ROW_RE, "Failing row contains [row redacted]")
    .replace(KEY_VALUE_RE, "$1=[value redacted]")
    .replace(PG_DETAIL_RE, "$1: [redacted]")
    .replace(QUOTED_INPUT_RE, ': "[value redacted]"')
    .replace(EMAIL_RE, "[email]");
  out = redactSecrets(out);
  return out.length > ERROR_MESSAGE_MAX ? `${out.slice(0, ERROR_MESSAGE_MAX - 1)}…` : out;
}

function scrubStringArray(v: unknown): unknown {
  return Array.isArray(v) ? v.map((s) => (typeof s === "string" ? scrubErrorMessage(s) : s)) : v;
}

// Frame fields that can carry text from the error MESSAGE. Browsers' stack
// parsers can mistake part of a message for a frame line (a message containing
// " at /some/path" becomes a frame whose function name is the message text),
// so every textual frame field gets the full message scrub, not just the
// URL/token pass. Found by the 2026-10-26 production test: the fake email and
// care-plan row survived in `function` / `$exception_functions`.
const FRAME_TEXT_FIELDS = ["function", "filename", "module", "abs_path", "mangled_name", "resolved_name"] as const;

function scrubFrame(frame: unknown): unknown {
  if (!frame || typeof frame !== "object") return frame;
  const copy: Record<string, unknown> = { ...(frame as Record<string, unknown>) };
  for (const field of FRAME_TEXT_FIELDS) {
    if (typeof copy[field] === "string") copy[field] = scrubErrorMessage(copy[field] as string);
  }
  return copy;
}

/**
 * Scrub the exception-specific properties of an `$exception` event in place:
 * message text everywhere PostHog puts it, INCLUDING stack frames and the
 * derived function list. Run AFTER the generic analytics scrubber, which has
 * already handled URLs and tokens everywhere.
 */
export function scrubExceptionProperties(props: Record<string, any>): Record<string, any> {
  const list = props.$exception_list;
  if (Array.isArray(list)) {
    props.$exception_list = list.map((ex) => {
      if (!ex || typeof ex !== "object") return ex;
      const copy = { ...ex };
      if (typeof copy.value === "string") copy.value = scrubErrorMessage(copy.value);
      if (copy.stacktrace && typeof copy.stacktrace === "object" && Array.isArray(copy.stacktrace.frames)) {
        copy.stacktrace = { ...copy.stacktrace, frames: copy.stacktrace.frames.map(scrubFrame) };
      }
      return copy;
    });
  }
  for (const key of ["$exception_message", "$issue_description", "$issue_name"]) {
    if (typeof props[key] === "string") props[key] = scrubErrorMessage(props[key]);
  }
  props.$exception_values = scrubStringArray(props.$exception_values);
  props.$exception_functions = scrubStringArray(props.$exception_functions);
  return props;
}
