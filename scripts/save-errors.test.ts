// Save-error alerting: what a failed save records (saveErrors.ts), and when
// that becomes an urgent or daily email (saveErrorAlerts.ts).
import assert from "node:assert/strict";
import { classifySaveError, noteSaveError, saveErrorSignature, setSaveErrorRecorder, type SaveErrorShape } from "@/lib/saveErrors";
import { friendlyError } from "@/lib/errorMessage";
import {
  ALERT_SENDER_NAME, alertSettings, buildDailyEmail, buildDeliveryProblemPush, buildUrgentEmail, describeGroup, groupSaveErrors, planUrgent, sampleSaveErrorGroups,
  type SaveErrorRow,
} from "@/lib/saveErrorAlerts";

let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.error(`not ok - ${name}\n`, e); }
}

// The Oct 26 failure, exactly as PostgREST returned it to SitForm.
const SITS_RLS = { code: "42501", message: 'new row violates row-level security policy for table "sits"', details: null, hint: null };

// ---- What is recorded --------------------------------------------------------

check("the Oct 26 sits error: permission, 42501, sits, write", () => {
  assert.deepEqual(classifySaveError(SITS_RLS), { category: "permission", sqlstate: "42501", target: "sits", operation: "write" });
});
check("a server function's rethrown error (no code) is read from its text", () => {
  const e = new Error('insert or update on table "health_scans" violates foreign key constraint "health_scans_bird_id_fkey"');
  assert.deepEqual(classifySaveError(e), { category: "still_linked", sqlstate: "23503", target: "health_scans", operation: "write" });
});
check("SQLSTATE codes map to plain categories", () => {
  const cat = (code: string) => classifySaveError({ code, message: "x" })?.category;
  assert.equal(cat("23505"), "conflict");
  assert.equal(cat("23502"), "missing_required");
  assert.equal(cat("22P02"), "invalid");
  assert.equal(cat("P0001"), "rejected");
  assert.equal(cat("42P01"), "schema");
  assert.equal(cat("PGRST204"), "schema");
  assert.equal(cat("PGRST301"), "auth");
  assert.equal(cat("57014"), "database");
});
check("delete blocked by a foreign key names the table and 'delete'", () => {
  const s = classifySaveError({ code: "23503", message: 'update or delete on table "birds" violates foreign key constraint "x" on table "sits"' });
  assert.equal(s?.target, "birds");
  assert.equal(s?.operation, "delete");
});
check("permission denied for a function is an rpc", () => {
  const s = classifySaveError({ code: "42501", message: "permission denied for function accept_household_invite" });
  assert.deepEqual(s, { category: "permission", sqlstate: "42501", target: "accept_household_invite", operation: "rpc" });
});
check("storage RLS refusals are storage operations", () => {
  const e = Object.assign(new Error("new row violates row-level security policy"), { name: "StorageApiError", status: 403 });
  assert.deepEqual(classifySaveError(e), { category: "permission", sqlstate: "42501", target: null, operation: "storage" });
});
check("network failures and 5xx are recorded", () => {
  assert.equal(classifySaveError(new TypeError("Failed to fetch"))?.category, "network");
  assert.equal(classifySaveError(new TypeError("Load failed"))?.category, "network");
  assert.equal(classifySaveError(Object.assign(new Error("Edge Function returned a non-2xx status code"), { status: 502 }))?.category, "server");
});
check("messages written for a person are not failures", () => {
  assert.equal(classifySaveError(new Error("Pick a start and end date.")), null);
  assert.equal(classifySaveError(new Error("Bird not in this sit.")), null);
  assert.equal(classifySaveError(new Error("SITTER_LINK_EXPIRED")), null);
  // Supabase auth: a wrong password is an answer, not a failure.
  assert.equal(classifySaveError({ name: "AuthApiError", code: "invalid_credentials", status: 400, message: "Invalid login credentials" }), null);
});
check("the read-only sitter preview and cancelled requests are not failures", () => {
  assert.equal(classifySaveError(new Error("This is a read-only preview — changes aren't saved.")), null);
  assert.equal(classifySaveError(Object.assign(new Error("aborted"), { name: "AbortError" })), null);
  assert.equal(classifySaveError(null), null);
  assert.equal(classifySaveError("boom"), null);
});
check("nothing personal leaves: no message text in the shape", () => {
  const s = classifySaveError({ code: "23505", message: 'duplicate key value violates unique constraint "birds_name_key" Key (name)=(Kiwi) already exists.' });
  assert.ok(!JSON.stringify(s).includes("Kiwi"));
  assert.deepEqual(Object.keys(s!).sort(), ["category", "operation", "sqlstate", "target"]);
});
check("a table name that isn't a plain identifier is dropped", () => {
  assert.equal(classifySaveError({ code: "42501", message: 'new row violates row-level security policy for table "Kiwi Bird; drop"' })?.target, null);
});

// ---- friendlyError and the mutation cache hand errors to the recorder ------------

// i18next isn't initialised here: a stand-in t returns each key's English default.
const t = ((_key: string, fallback: string) => fallback) as unknown as Parameters<typeof friendlyError>[2];
const recorded: SaveErrorShape[] = [];
setSaveErrorRecorder((s) => recorded.push(s));

check("friendlyError records a failed save once, and still says the friendly thing", () => {
  recorded.length = 0;
  const err = { ...SITS_RLS };
  assert.equal(friendlyError(err, undefined, t), "You don't have permission to do that.");
  noteSaveError(err); // the mutation cache seeing the same error object
  friendlyError(err, "Could not create sit.", t);
  assert.equal(recorded.length, 1);
  assert.equal(saveErrorSignature(recorded[0]), "permission|42501|sits|write");
});
check("a successful save records nothing (friendlyError never runs; noting null/undefined is a no-op)", () => {
  recorded.length = 0;
  noteSaveError(null);
  noteSaveError(undefined);
  // supabase-js resolves a successful insert to { data, error: null }; callers
  // only reach friendlyError(error) when error is set.
  const result = { data: [{ id: 1 }], error: null };
  if (result.error) friendlyError(result.error);
  assert.equal(recorded.length, 0);
});
check("validation copy through friendlyError records nothing", () => {
  recorded.length = 0;
  assert.equal(friendlyError(new Error("Pick a start and end date."), undefined, t), "Pick a start and end date.");
  assert.equal(recorded.length, 0);
});
check("a recorder that throws can't break friendlyError", () => {
  setSaveErrorRecorder(() => { throw new Error("recorder down"); });
  assert.equal(friendlyError({ code: "42501", message: "permission denied for table birds" }, undefined, t), "You don't have permission to do that.");
  setSaveErrorRecorder(null);
});

// ---- When an email goes ------------------------------------------------------------

const NOW = new Date("2026-10-27T15:00:00Z");
const row = (minAgo: number, user: string, over: Partial<SaveErrorRow> = {}): SaveErrorRow => ({
  created_at: new Date(NOW.getTime() - minAgo * 60_000).toISOString(),
  category: "permission", sqlstate: "42501", target: "sits", operation: "write",
  route: "/sits/new", platform: "ios", app_version: "1.4.2", user_hash: user, ...over,
});
const SITS = "permission|42501|sits|write";

check("settings: defaults, daily-only, off, recipient, spike size", () => {
  assert.deepEqual(alertSettings({}), { mode: "all", to: "brittany@thekyaproject.com", spikeUsers: 3 });
  assert.equal(alertSettings({ SAVE_ERROR_ALERTS: "Daily" }).mode, "daily");
  assert.equal(alertSettings({ SAVE_ERROR_ALERTS: "off" }).mode, "off");
  assert.equal(alertSettings({ SAVE_ERROR_ALERTS: "nonsense" }).mode, "all");
  assert.equal(alertSettings({ SAVE_ERROR_ALERT_TO: "ops@thekyaproject.com" }).to, "ops@thekyaproject.com");
  assert.equal(alertSettings({ SAVE_ERROR_SPIKE_USERS: "5" }).spikeUsers, 5);
  assert.equal(alertSettings({ SAVE_ERROR_SPIKE_USERS: "0" }).spikeUsers, 3);
});
check("grouping counts times, distinct people and platforms", () => {
  const [g] = groupSaveErrors([row(5, "a"), row(4, "a"), row(3, "b", { platform: "web" }), row(2, null as unknown as string)]);
  assert.equal(g.count, 4);
  assert.equal(g.people, 3);
  assert.deepEqual(g.platforms, { ios: 3, web: 1 });
});
check("a kind of error never emailed before is urgent (new)", () => {
  const items = planUrgent([row(10, "a")], NOW, { known: new Set(), alertedToday: new Set(), spikeUsers: 3 });
  assert.deepEqual(items.map((i) => [i.group.signature, i.reasons]), [[SITS, ["new"]]]);
});
check("a known kind is quiet below 3 people in an hour", () => {
  const items = planUrgent([row(10, "a"), row(20, "b"), row(30, "a")], NOW, { known: new Set([SITS]), alertedToday: new Set(), spikeUsers: 3 });
  assert.equal(items.length, 0);
});
check("3 distinct people within an hour is urgent (spike)", () => {
  const items = planUrgent([row(10, "a"), row(20, "b"), row(59, "c")], NOW, { known: new Set([SITS]), alertedToday: new Set(), spikeUsers: 3 });
  assert.deepEqual(items.map((i) => [i.reasons, i.group.people]), [[["spike"], 3]]);
});
check("3 people spread over more than an hour is not a spike", () => {
  const items = planUrgent([row(10, "a"), row(20, "b"), row(61, "c")], NOW, { known: new Set([SITS]), alertedToday: new Set(), spikeUsers: 3 });
  assert.equal(items.length, 0);
});
check("at most one urgent email per kind per day", () => {
  const rows = [row(10, "a"), row(20, "b"), row(30, "c")];
  assert.equal(planUrgent(rows, NOW, { known: new Set(), alertedToday: new Set([SITS]), spikeUsers: 3 }).length, 0);
});
check("network and expired sessions never make an urgent email", () => {
  const rows = ["a", "b", "c", "d"].map((u, i) => row(i + 1, u, { category: "network", sqlstate: null, target: null, operation: null }))
    .concat([row(5, "e", { category: "auth", sqlstate: "PGRST301", target: null, operation: null })]);
  assert.equal(planUrgent(rows, NOW, { known: new Set(), alertedToday: new Set(), spikeUsers: 3 }).length, 0);
});
check("errors older than a day don't count as new", () => {
  assert.equal(planUrgent([row(25 * 60, "a")], NOW, { known: new Set(), alertedToday: new Set(), spikeUsers: 3 }).length, 0);
});

// ---- What the emails say -------------------------------------------------------------

check("plain-language description", () => {
  assert.equal(describeGroup({ category: "permission", target: "sits", operation: "write" }), "The database refused the save (a permission rule said no), saving to sits");
});
check("urgent email: says URGENT, what failed, how many, where", () => {
  const [g] = sampleSaveErrorGroups(NOW);
  const e = buildUrgentEmail([{ group: g, reasons: ["new", "spike"] }]);
  assert.match(e.subject, /^TEST: URGENT: saves failing in Kya & Co\. \(4 people in the last hour\)/);
  assert.match(e.text, /7 times, 4 people\. Platforms: iOS app 4, web 3\./);
  assert.match(e.text, /Screens: \/sits\/new/);
  assert.match(e.html, /URGENT/);
});
check("daily email: nothing at all when nothing failed", () => {
  assert.equal(buildDailyEmail([], { urgentToday: new Set() }), null);
});
check("daily email: says it isn't urgent, and lists every kind", () => {
  const groups = sampleSaveErrorGroups(NOW);
  const e = buildDailyEmail(groups, { urgentToday: new Set() })!;
  assert.equal(e.subject, "TEST: Daily save errors: 9 failures in the last 24 hours (nothing urgent)");
  assert.match(e.text, /or 3\+ people in an hour/);
  assert.match(buildDailyEmail(groups, { urgentToday: new Set(), spikeUsers: 5 })!.text, /or 5\+ people in an hour/);
  assert.match(e.html, /NOT URGENT/);
  assert.match(e.text, /The save never reached the server/);
  const withUrgent = buildDailyEmail(groups, { urgentToday: new Set([SITS]) })!;
  assert.match(withUrgent.subject, /includes an urgent one/);
  assert.match(withUrgent.text, /Already sent as urgent today\./);
});
check("emails escape HTML and carry no personal data fields", () => {
  const g = { ...sampleSaveErrorGroups(NOW)[0], routes: ["/a<b>"] };
  const e = buildUrgentEmail([{ group: g, reasons: ["new"] }]);
  assert.ok(e.html.includes("/a&lt;b&gt;"));
  assert.ok(!/@/.test(e.text.replace(/@thekyaproject\.com/g, "")));
});

// ---- Test sends can't be mistaken for an outage ---------------------------------------

const real = (g: ReturnType<typeof sampleSaveErrorGroups>[number]) => { const { sample: _s, ...rest } = g; return rest; };
check("sample data is always marked TEST: subject first, label at the top", () => {
  for (const e of [
    buildUrgentEmail([{ group: sampleSaveErrorGroups(NOW)[0], reasons: ["new"] }]),
    buildDailyEmail(sampleSaveErrorGroups(NOW), { urgentToday: new Set() })!,
  ]) {
    assert.match(e.subject, /^TEST: /);
    assert.match(e.text, /^TEST · SAMPLE DATA, NOT A REAL OUTAGE\n/);
    // The label sits above the email's own content.
    assert.ok(e.html.indexOf("TEST · SAMPLE DATA") < e.html.indexOf('<table role="presentation"'));
  }
});
check("test: true marks real-shaped data too", () => {
  const g = real(sampleSaveErrorGroups(NOW)[0]);
  assert.match(buildUrgentEmail([{ group: g, reasons: ["new"] }], { test: true }).subject, /^TEST: /);
  assert.match(buildDailyEmail([g], { urgentToday: new Set(), test: true })!.subject, /^TEST: /);
});
check("a real alert is never marked TEST", () => {
  const groups = sampleSaveErrorGroups(NOW).map(real);
  const u = buildUrgentEmail([{ group: groups[0], reasons: ["spike"] }]);
  const d = buildDailyEmail(groups, { urgentToday: new Set() })!;
  for (const e of [u, d]) {
    assert.ok(!/TEST/.test(e.subject) && !/TEST/.test(e.html) && !/TEST/.test(e.text));
  }
  assert.match(u.subject, /^URGENT: /);
});
check("alerts come from Kya & Co. Alerts", () => {
  assert.equal(ALERT_SENDER_NAME, "Kya & Co. Alerts");
});

// ---- When the alert email itself can't go: a push ----------------------------

check("delivery push: a blocklisted address says so and how to fix it", () => {
  const p = buildDeliveryProblemPush("blocked:unsubscribedViaEmail", { to: "brittany@thekyaproject.com" });
  assert.equal(p.title, "Kya & Co. alerts can't reach your inbox");
  assert.match(p.body, /Brevo has brittany@thekyaproject\.com on its blocklist \(unsubscribedViaEmail\)/);
  assert.match(p.body, /Remove the address from Brevo's blocked contacts/);
});
check("delivery push: any other send failure", () => {
  assert.match(buildDeliveryProblemPush("brevo-api-key-not-configured", { to: "a@b.co" }).body, /failed to send \(brevo-api-key-not-configured\)/);
});
check("delivery push: the test version says TEST and that nothing is wrong", () => {
  const p = buildDeliveryProblemPush("blocked:unsubscribed", { to: "a@b.co", test: true });
  assert.match(p.title, /^TEST: /);
  assert.match(p.body, /^This is a test of the alert push; nothing is wrong\./);
});

if (failed) process.exit(1);
