/**
 * CSP violation collector.
 *
 * The policy has been shipping as `Content-Security-Policy-Report-Only` with no
 * `report-uri` and no `report-to`, which means it did nothing whatsoever: it
 * blocked nothing (report-only) and recorded nothing (nowhere to report to).
 * This endpoint is the missing half, so the policy can be observed on real
 * traffic before anyone flips it to enforce.
 *
 * Deliberately NOT authenticated — browsers post violation reports with no
 * credentials, so it cannot be. That makes it an open write path, so it stays
 * cheap and bounded: the body is size-capped, nothing is persisted, and the
 * output is a single structured log line per report.
 *
 * PRIVACY: a raw report is not safe to log. `document-uri` and `referrer` carry
 * the full URL, and this app puts **sitter invite tokens in the path**
 * (`/sitter/<token>`), plus handoff and household invite tokens. Logging those
 * verbatim would leak working credentials into Vercel's log store. Every URL is
 * therefore reduced to origin + a redacted path shape before it is logged.
 */
import { createFileRoute } from "@tanstack/react-router";

/** Reports are small; anything larger is noise or abuse. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Path segments that are secrets in this app. Anything following one of these
 * is replaced, so `/sitter/abc123` logs as `/sitter/:token`.
 */
const TOKEN_PARENTS = new Set(["sitter", "handoff", "invite", "accept"]);

/** Reduce a URL to something safe: origin plus a path with secrets removed. */
function redactUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  // Non-http schemes (inline, eval, data:, blob:) carry no user data.
  if (!/^https?:/i.test(raw)) return raw.slice(0, 120);
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "<unparseable>";
  }
  const parts = u.pathname.split("/").filter(Boolean);
  const safe = parts.map((seg, i) => {
    const parent = i > 0 ? parts[i - 1].toLowerCase() : "";
    if (TOKEN_PARENTS.has(parent)) return ":token";
    // UUIDs are record ids — identifying, and not needed to triage a violation.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return ":id";
    return seg;
  });
  // The query string is dropped entirely: it is never needed here and is the
  // other place tokens turn up.
  return `${u.origin}/${safe.join("/")}`;
}

/** Pull the fields worth triaging out of either report format. */
function summarize(report: Record<string, unknown>) {
  // Legacy `report-uri` nests under "csp-report"; the Reporting API uses "body".
  const r = (report["csp-report"] ?? report.body ?? report) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) if (typeof r[k] === "string" && r[k]) return r[k] as string;
    return null;
  };
  return {
    directive: pick("effective-directive", "effectiveDirective", "violated-directive", "violatedDirective"),
    blocked: redactUrl(pick("blocked-uri", "blockedURL", "blockedURI")),
    document: redactUrl(pick("document-uri", "documentURL", "documentURI")),
    // The offending source line is useful and carries no user data, but cap it.
    sample: (pick("script-sample", "sample") ?? "").slice(0, 200) || null,
    disposition: pick("disposition"),
  };
}

export const Route = createFileRoute("/api/public/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Always answer 204 regardless of what arrives. A browser has nothing
        // useful to do with an error here, and a noisy status would only invite
        // retries.
        const noContent = new Response(null, { status: 204 });
        try {
          const raw = await request.text();
          if (!raw || raw.length > MAX_BODY_BYTES) return noContent;

          const parsed = JSON.parse(raw) as unknown;
          // The Reporting API posts an array; `report-uri` posts one object.
          const reports = Array.isArray(parsed) ? parsed : [parsed];

          for (const entry of reports.slice(0, 10)) {
            if (!entry || typeof entry !== "object") continue;
            const s = summarize(entry as Record<string, unknown>);
            if (!s.directive && !s.blocked) continue; // not a CSP report
            console.warn(`[csp-report] ${JSON.stringify(s)}`);
          }
        } catch {
          /* malformed body — ignore, never surface */
        }
        return noContent;
      },
    },
  },
});
