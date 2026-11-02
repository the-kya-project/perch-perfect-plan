// When a failed save becomes an email, and what the email says.
//
// Rows come from public.save_errors (see saveErrors.ts for what a row is).
// /api/public/hooks/save-error-alerts loads them and asks this file:
//
//   urgent (every 15 minutes)
//     - a NEW kind of error: an error type that has never been in an alert
//       email before, seen in the last 24 hours; or
//     - a SPIKE: one error type hitting SPIKE_USERS (3) or more distinct people
//       in the last 60 minutes.
//     Network and session-expiry errors (DAILY_ONLY_CATEGORIES) never count as
//     urgent. At most one urgent email per error type per UTC day (the hook
//     claims a save_error_alerts row before sending).
//   daily (13:30 UTC)
//     - every error in the last 24 hours, grouped by type; nothing sent when
//       there were none.
//
// Settings (Vercel env, Production):
//   SAVE_ERROR_ALERTS      "all" (default) | "daily" (summary only) | "off"
//   SAVE_ERROR_ALERT_TO    recipient (default: the support inbox)
//   SAVE_ERROR_SPIKE_USERS people in an hour that make a type urgent (default 3)
//
// Pure, no server imports: scripts/save-errors.test.ts runs it directly.
import { DAILY_ONLY_CATEGORIES, saveErrorSignature, type SaveErrorCategory } from "./saveErrors";
import { SUPPORT_EMAIL } from "./support";

export type SaveErrorRow = {
  created_at: string;
  category: SaveErrorCategory;
  sqlstate: string | null;
  target: string | null;
  operation: string | null;
  route: string;
  platform: string;
  app_version: string;
  user_hash: string | null;
};

export type SaveErrorGroup = {
  signature: string;
  category: SaveErrorCategory;
  sqlstate: string | null;
  target: string | null;
  operation: string | null;
  count: number;
  people: number;
  platforms: Record<string, number>;
  routes: string[];
  versions: string[];
  first: string;
  last: string;
  /** Made-up data (sampleSaveErrorGroups). An email built from it is always
   *  marked TEST, so a sample can't be mistaken for a real outage. */
  sample?: true;
};

export type AlertMode = "all" | "daily" | "off";

export type AlertSettings = { mode: AlertMode; to: string; spikeUsers: number };

export const SPIKE_WINDOW_MS = 60 * 60_000;
export const NEW_WINDOW_MS = 24 * 3_600_000;

export function alertSettings(env: Record<string, string | undefined>): AlertSettings {
  const raw = (env.SAVE_ERROR_ALERTS ?? "").trim().toLowerCase();
  const mode: AlertMode = raw === "off" || raw === "daily" ? raw : "all";
  const to = (env.SAVE_ERROR_ALERT_TO ?? "").trim() || SUPPORT_EMAIL;
  const n = Number.parseInt(env.SAVE_ERROR_SPIKE_USERS ?? "", 10);
  return { mode, to, spikeUsers: Number.isFinite(n) && n >= 1 ? n : 3 };
}

/** Rows grouped by error type, most people affected first. A row with no
 *  person id counts as one more person. */
export function groupSaveErrors(rows: SaveErrorRow[]): SaveErrorGroup[] {
  const groups = new Map<string, SaveErrorGroup & { _people: Set<string>; _routes: Set<string>; _versions: Set<string> }>();
  let unknown = 0;
  for (const r of rows) {
    const signature = saveErrorSignature(r as Parameters<typeof saveErrorSignature>[0]);
    let g = groups.get(signature);
    if (!g) {
      g = {
        signature, category: r.category, sqlstate: r.sqlstate, target: r.target, operation: r.operation,
        count: 0, people: 0, platforms: {}, routes: [], versions: [], first: r.created_at, last: r.created_at,
        _people: new Set(), _routes: new Set(), _versions: new Set(),
      };
      groups.set(signature, g);
    }
    g.count += 1;
    g._people.add(r.user_hash ?? `unknown:${unknown++}`);
    g.platforms[r.platform] = (g.platforms[r.platform] ?? 0) + 1;
    g._routes.add(r.route);
    g._versions.add(r.app_version);
    if (r.created_at < g.first) g.first = r.created_at;
    if (r.created_at > g.last) g.last = r.created_at;
  }
  return [...groups.values()]
    .map(({ _people, _routes, _versions, ...g }) => ({ ...g, people: _people.size, routes: [..._routes].sort(), versions: [..._versions].sort() }))
    .sort((a, b) => b.people - a.people || b.count - a.count || a.signature.localeCompare(b.signature));
}

export type UrgentItem = { group: SaveErrorGroup; reasons: Array<"new" | "spike"> };

/**
 * Which error types need an urgent email now.
 * @param rows            save_errors from at least the last 24 hours
 * @param known           every signature already in an alert email
 * @param alertedToday    signatures with an urgent email already today (UTC)
 */
export function planUrgent(
  rows: SaveErrorRow[],
  now: Date,
  opts: { known: Set<string>; alertedToday: Set<string>; spikeUsers: number },
): UrgentItem[] {
  const t = now.getTime();
  const recentDay = rows.filter((r) => t - Date.parse(r.created_at) <= NEW_WINDOW_MS);
  const lastHour = new Map(groupSaveErrors(recentDay.filter((r) => t - Date.parse(r.created_at) <= SPIKE_WINDOW_MS)).map((g) => [g.signature, g]));
  const out: UrgentItem[] = [];
  for (const g of groupSaveErrors(recentDay)) {
    if (DAILY_ONLY_CATEGORIES.has(g.category) || opts.alertedToday.has(g.signature)) continue;
    const reasons: UrgentItem["reasons"] = [];
    if (!opts.known.has(g.signature)) reasons.push("new");
    const hour = lastHour.get(g.signature);
    if (hour && hour.people >= opts.spikeUsers) reasons.push("spike");
    // A spike is reported with the last hour's numbers.
    if (reasons.length) out.push({ group: reasons.includes("spike") && hour ? hour : g, reasons });
  }
  return out;
}

// ---- Copy ------------------------------------------------------------------

const CATEGORY_TEXT: Record<SaveErrorCategory, string> = {
  permission: "The database refused the save (a permission rule said no)",
  conflict: "The save clashed with something that already exists",
  still_linked: "The change was blocked because it's still linked to something else",
  missing_required: "The save was missing a required value",
  invalid: "The database said some of the details weren't valid",
  schema: "The app asked for a table, column or function the database doesn't have",
  auth: "The person's sign-in had expired or was refused",
  rejected: "One of our own database rules turned the save down",
  database: "The database returned an error",
  server: "The server failed while saving",
  network: "The save never reached the server (connection dropped)",
};

const OPERATION_TEXT: Record<string, string> = {
  write: "saving to",
  delete: "deleting from",
  rpc: "calling",
  storage: "uploading a file",
  server_fn: "saving through the server",
};

/** "The database refused the save (a permission rule said no), saving to sits". */
export function describeGroup(g: Pick<SaveErrorGroup, "category" | "target" | "operation">): string {
  const what = CATEGORY_TEXT[g.category] ?? "A save failed";
  if (g.target) return `${what}, ${OPERATION_TEXT[g.operation ?? ""] ?? "on"} ${g.target}`;
  if (g.operation === "storage") return `${what}, ${OPERATION_TEXT.storage}`;
  return what;
}

const PLATFORM_NAMES: Record<string, string> = { web: "web", ios: "iOS app", android: "Android app" };

function platformsText(p: Record<string, number>): string {
  return Object.entries(p)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${PLATFORM_NAMES[k] ?? k} ${n}`)
    .join(", ");
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function utcTime(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

function groupLines(g: SaveErrorGroup): string[] {
  return [
    describeGroup(g),
    `${plural(g.count, "time")}, ${plural(g.people, "person", "people")}. Platforms: ${platformsText(g.platforms)}.`,
    `Screens: ${g.routes.join(", ")}`,
    `Code: ${g.sqlstate ?? "none"} · app ${g.versions.join(", ")} · first ${utcTime(g.first)}, last ${utcTime(g.last)}`,
  ];
}

const NEXT_STEPS =
  "Where to look: Supabase → Logs → Postgres for the full error, and the migrations merged most recently. " +
  "This email holds no personal data; each person is counted by an anonymous id.";

function layout(banner: { text: string; color: string }, intro: string, groups: Array<{ g: SaveErrorGroup; note?: string }>, footer: string): string {
  const items = groups
    .map(({ g, note }) => {
      const [title, ...rest] = groupLines(g);
      return `<tr><td style="padding:12px 0;border-top:1px solid #e5e7eb">
<div style="font-weight:600;font-size:15px;color:#111827">${esc(title)}</div>
${note ? `<div style="font-size:13px;color:${banner.color};font-weight:600;margin-top:2px">${esc(note)}</div>` : ""}
${rest.map((l) => `<div style="font-size:13px;color:#4b5563;margin-top:2px">${esc(l)}</div>`).join("\n")}
</td></tr>`;
    })
    .join("\n");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px" cellpadding="0" cellspacing="0">
<tr><td><div style="display:inline-block;padding:4px 10px;border-radius:4px;background:${banner.color};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:.04em">${esc(banner.text)}</div></td></tr>
<tr><td style="padding:12px 0 8px;font-size:15px;color:#111827;line-height:1.5">${esc(intro)}</td></tr>
${items}
<tr><td style="padding-top:16px;font-size:12px;color:#6b7280;line-height:1.5">${esc(footer)}</td></tr>
</table></body></html>`;
}

export type BuiltEmail = { subject: string; html: string; text: string };

/** Who the alerts come from (the address stays the verified Brevo sender). */
export const ALERT_SENDER_NAME = "Kya & Co. Alerts";

export const TEST_LABEL = "TEST · SAMPLE DATA, NOT A REAL OUTAGE";

/** Test sends and samples: "TEST:" leads the subject, a label tops the email. */
function markTest(email: BuiltEmail): BuiltEmail {
  return {
    subject: `TEST: ${email.subject}`,
    html: email.html.replace(
      '<table role="presentation"',
      `<div style="max-width:600px;margin:0 auto 12px;padding:10px 14px;border-radius:6px;background:#1f2937;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:.04em;text-align:center">${TEST_LABEL}</div>\n<table role="presentation"`,
    ),
    text: `${TEST_LABEL}\n\n${email.text}`,
  };
}

export function buildUrgentEmail(items: UrgentItem[], opts: { test?: boolean } = {}): BuiltEmail {
  const people = items.reduce((n, i) => n + i.group.people, 0);
  const lead = items[0];
  const subject =
    items.length === 1
      ? `URGENT: saves failing in Kya & Co. (${lead.reasons.includes("spike") ? `${plural(lead.group.people, "person", "people")} in the last hour` : "new error"}): ${describeGroup(lead.group)}`
      : `URGENT: ${items.length} kinds of save are failing in Kya & Co. (${plural(people, "person", "people")})`;
  const intro =
    "Act on this today. People tried to save something in the app and it failed. " +
    "They saw a short error message and their change was not saved.";
  const note = (i: UrgentItem) =>
    [
      i.reasons.includes("new") ? "New: this kind of error hasn't been seen before." : null,
      i.reasons.includes("spike") ? `Spreading: ${plural(i.group.people, "person", "people")} hit this in the last hour.` : null,
    ].filter(Boolean).join(" ");
  const footer = `${NEXT_STEPS} You'll get at most one urgent email per kind of error per day; the daily summary covers the rest.`;
  const text = [
    "URGENT: saves are failing",
    "",
    intro,
    "",
    ...items.flatMap((i) => [...groupLines(i.group).map((l, k) => (k === 0 ? `- ${l}` : `  ${l}`)), `  ${note(i)}`, ""]),
    footer,
  ].join("\n");
  const built = { subject, html: layout({ text: "URGENT", color: "#b91c1c" }, intro, items.map((i) => ({ g: i.group, note: note(i) })), footer), text };
  return opts.test || items.some((i) => i.group.sample) ? markTest(built) : built;
}

/** The daily summary, or null when there were no errors (nothing is sent). */
export function buildDailyEmail(groups: SaveErrorGroup[], opts: { urgentToday: Set<string>; spikeUsers?: number; test?: boolean }): BuiltEmail | null {
  if (groups.length === 0) return null;
  const total = groups.reduce((n, g) => n + g.count, 0);
  const anyUrgent = groups.some((g) => opts.urgentToday.has(g.signature));
  const subject = `Daily save errors: ${plural(total, "failure")} in the last 24 hours${anyUrgent ? " (includes an urgent one)" : " (nothing urgent)"}`;
  const intro = anyUrgent
    ? "Some saves failed in the last 24 hours, and at least one of them already had an urgent email. Check it's fixed."
    : `Some saves failed in the last 24 hours. Nothing reached the urgent level (a new kind of error, or ${opts.spikeUsers ?? 3}+ people in an hour), so this can wait for a normal working day.`;
  const footer = NEXT_STEPS;
  const note = (g: SaveErrorGroup) => (opts.urgentToday.has(g.signature) ? "Already sent as urgent today." : undefined);
  const text = [
    "Daily save errors",
    "",
    intro,
    "",
    ...groups.flatMap((g) => [...groupLines(g).map((l, k) => (k === 0 ? `- ${l}` : `  ${l}`)), ...(note(g) ? [`  ${note(g)}`] : []), ""]),
    footer,
  ].join("\n");
  const built = {
    subject,
    html: layout(anyUrgent ? { text: "DAILY · CHECK THE URGENT ONE", color: "#b45309" } : { text: "DAILY · NOT URGENT", color: "#047857" }, intro, groups.map((g) => ({ g, note: note(g) })), footer),
    text,
  };
  return opts.test || groups.some((g) => g.sample) ? markTest(built) : built;
}

// Sample data for the QA sender and the tests: the Oct 26 sits failure.
// Marked `sample`, so every email built from it says TEST.
export function sampleSaveErrorGroups(now = new Date("2026-10-27T15:00:00Z")): SaveErrorGroup[] {
  const at = (minAgo: number) => new Date(now.getTime() - minAgo * 60_000).toISOString();
  return [
    {
      signature: "permission|42501|sits|write", category: "permission", sqlstate: "42501", target: "sits", operation: "write",
      count: 7, people: 4, platforms: { ios: 4, web: 3 }, routes: ["/sits/new"], versions: ["1.4.2"], first: at(52), last: at(3), sample: true,
    },
    {
      signature: "network|-|-|-", category: "network", sqlstate: null, target: null, operation: null,
      count: 2, people: 2, platforms: { android: 1, ios: 1 }, routes: ["/sitter/$token/scan"], versions: ["1.4.2"], first: at(600), last: at(90), sample: true,
    },
  ];
}
