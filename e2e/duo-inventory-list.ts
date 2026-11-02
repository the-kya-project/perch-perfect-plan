// Every screen in the app, for the iPhone Duo redesign inventory
// (e2e/duo.inventory.ts captures each at 951x669 with the bridge off).
//
// type:   "list + detail" | "dashboard" | "form / flow" | "empty state" |
//         "settings" | "other" (with `note` saying what it is)
// layout: "two-pane" — already has a Duo two-pane layout; "phone" — still the
//         centered phone column (the side column still shows on signed-in screens)
// variant / signedIn: which made-up data the capture uses (e2e/duo-fixture.ts).
// Screens with an empty and a filled state appear twice.
import { ECHO_ID, SIT_ACTIVE_ID, SIT_UPCOMING_ID } from "./duo-fixture";
import type { DuoVariant } from "./duo-fixture";

export type ScreenType = "list + detail" | "dashboard" | "form / flow" | "empty state" | "settings" | "other";
export type Screen = {
  route: string;
  /** Path actually opened (placeholders filled in). */
  path: string;
  name: string;
  who: string;
  type: ScreenType;
  note?: string;
  layout: "two-pane" | "phone";
  variant: DuoVariant;
  signedIn: boolean;
  /** "filled" / "empty" when a screen is captured in both states. */
  state?: "filled" | "empty";
  /** Not captured: a redirect or a link that leaves the app. */
  skip?: string;
};

const E = ECHO_ID;
const SITTER = "e2e-sitter-long-care"; // e2e/sitter-fixture.mjs, answered by e2e/mock-supabase.mjs

const owner = (route: string, path: string, name: string, type: ScreenType, extra: Partial<Screen> = {}): Screen =>
  ({ route, path, name, who: "Owner", type, layout: "phone", variant: "filled", signedIn: true, ...extra });
const pub = (route: string, path: string, name: string, type: ScreenType, extra: Partial<Screen> = {}): Screen =>
  ({ route, path, name, who: "Anyone (signed out)", type, layout: "phone", variant: "filled", signedIn: false, ...extra });
const sitter = (route: string, path: string, name: string, type: ScreenType, extra: Partial<Screen> = {}): Screen =>
  ({ route, path, name, who: "Sitter (link, no account)", type, layout: "phone", variant: "filled", signedIn: false, ...extra });
const both = (s: Screen): Screen[] => [
  { ...s, state: "filled" },
  { ...s, state: "empty", variant: s.route === "/dashboard" ? "nobirds" : "empty" },
];

export const SCREENS: Screen[] = [
  // ── Signed out ───────────────────────────────────────────────────────────
  pub("/", "/", "Landing page", "other", { note: "marketing landing; signed-in people go straight to Home" }),
  pub("/auth", "/auth?mode=signin", "Sign in", "form / flow"),
  pub("/auth", "/auth?mode=signup", "Sign up", "form / flow"),
  pub("/confirm-email", "/confirm-email", "Check your email (after sign-up)", "other", { note: "status message with resend" }),
  pub("/link-expired", "/link-expired?reason=otp_expired", "Link expired", "other", { note: "error state for an old email link" }),
  pub("/verify", "/verify", "Email link landing", "other", { note: "hand-off page for sign-in email links; shows its fallback with no link" }),
  pub("/reset-password", "/reset-password", "Reset password", "form / flow"),
  pub("/delete-account", "/delete-account", "Delete account request", "form / flow"),
  pub("/privacy", "/privacy", "Privacy policy", "other", { note: "long legal document" }),
  pub("/terms", "/terms", "Terms of use", "other", { note: "long legal document" }),
  pub("/founding", "/founding", "Founding 50 offer", "other", { note: "offer / sales page" }),
  pub("/gift/", "/gift", "Gift a membership", "form / flow"),
  pub("/gift/thanks", "/gift/thanks", "Gift thank-you", "other", { note: "confirmation message" }),
  pub("/redeem", "/redeem", "Redeem a gift code", "form / flow"),
  pub("/invite/$token", "/invite/duo-invalid-token", "Household invite", "form / flow", { note: "made-up token, so it shows the invalid-invite state" }),
  pub("/handoff/$token", "/handoff/duo-invalid-token", "Accept a bird hand-off", "form / flow", { note: "made-up token, so it shows the invalid-link state" }),
  pub("/get", "/get", "App download link (bios, ads)", "other", { note: "store redirect; a desktop or unknown device sees a page" }),
  pub("/get-app", "/get-app", "App download link (launch email)", "other", { note: "store redirect; a desktop or unknown device sees a page" }),
  pub("/review", "/review", "Leave a review link", "other", { note: "store redirect; a desktop or unknown device sees a page" }),
  pub("/r/$token", "/r/x", "Email click tracking", "other", { note: "redirect only", skip: "redirects to the email's target; no screen" }),

  // ── Onboarding ───────────────────────────────────────────────────────────
  owner("/welcome", "/welcome", "Welcome (first sign-in)", "form / flow", { who: "New owner, once", variant: "new" }),
  owner("/birds/new", "/birds/new", "Add a bird", "form / flow"),
  owner("/birds/$birdId/setup", `/birds/${E}/setup`, "Care plan walkthrough", "form / flow"),

  // ── Home and Today ───────────────────────────────────────────────────────
  ...both(owner("/dashboard", "/dashboard", "Home", "dashboard", { layout: "two-pane", who: "Owner, household member" })),
  owner("/check", "/check", "Daily flock check", "form / flow", { who: "Owner, household member" }),
  owner("/today", "/today", "Today (covering a sit)", "empty state", { who: "Household member covering a sit", note: "the fixture account covers no sit, so this is its empty state" }),
  owner("/covering/$sitId/$birdId", `/covering/${SIT_ACTIVE_ID}/${E}`, "Covering: one bird's checklist", "form / flow", { who: "Household member covering a sit" }),
  ...both(owner("/updates", "/updates", "Updates (the bell)", "list + detail", { who: "Owner, household member" })),

  // ── A bird ───────────────────────────────────────────────────────────────
  ...both(owner("/birds/$birdId", `/birds/${E}`, "Bird page", "dashboard", { layout: "two-pane", who: "Owner, household member" })),
  ...both(owner("/birds/$birdId/weight", `/birds/${E}/weight`, "Weight", "dashboard", { layout: "two-pane", who: "Owner, household member", note: "log form + chart + history" })),
  owner("/birds/$birdId/scan", `/birds/${E}/scan`, "Full health check", "form / flow", { layout: "two-pane", who: "Owner, household member" }),
  owner("/birds/$birdId/scans/$scanId", `/birds/${E}/scans/00000000-0000-4000-8000-0000000e0000`, "One health check", "list + detail", { who: "Owner, household member", note: "the detail half" }),
  ...both(owner("/birds/$birdId/journal", `/birds/${E}/journal`, "Journal", "list + detail", { who: "Owner, household member" })),
  ...both(owner("/birds/$birdId/moments", `/birds/${E}/moments`, "Moments", "list + detail", { who: "Owner, household member" })),
  owner("/birds/$birdId/plan/", `/birds/${E}/plan`, "Care plan overview", "dashboard", { note: "six sections with Ready / Needs info" }),
  owner("/birds/$birdId/plan/editor", `/birds/${E}/plan/editor`, "Care plan editor", "form / flow"),
  owner("/birds/$birdId/care-plan", `/birds/${E}/care-plan`, "Care plan (read only)", "other", { who: "Owner, household member", note: "long read view, six anchored cards" }),
  owner("/birds/$birdId/view-as-sitter", `/birds/${E}/view-as-sitter`, "View as your sitter", "other", { note: "preview of the sitter view" }),
  owner("/birds/$birdId/identity", `/birds/${E}/identity`, "Identity", "settings"),
  owner("/birds/$birdId/emergency", `/birds/${E}/emergency`, "Emergency info", "settings"),
  owner("/birds/$birdId/access", `/birds/${E}/access`, "Who can see this bird", "settings"),
  owner("/birds/$birdId/vet-summary", `/birds/${E}/vet-summary`, "Vet summary", "other", { note: "printable one-page record" }),
  owner("/birds/$birdId/handoff", `/birds/${E}/handoff`, "Hand off to a new owner", "form / flow"),
  owner("/birds/$birdId/export", `/birds/${E}/export`, "Hand off with a PDF", "form / flow"),
  owner("/birds/$birdId/farewell", `/birds/${E}/farewell`, "Mark as passed", "form / flow"),
  owner("/birds/$birdId/concern", `/birds/${E}/concern`, "Something's wrong (covering)", "form / flow", { who: "Household member covering a sit" }),

  // ── Sits ─────────────────────────────────────────────────────────────────
  ...both(owner("/sits/", "/sits", "Sits", "list + detail")),
  owner("/sits/$sitId", `/sits/${SIT_UPCOMING_ID}`, "One sit", "list + detail", { note: "the detail half" }),
  owner("/sits/new", "/sits/new", "Set up a sit", "form / flow"),
  owner("/sits/edit/$sitId", `/sits/edit/${SIT_UPCOMING_ID}`, "Edit a sit", "form / flow"),
  owner("/sit-preview/$sitId", `/sit-preview/${SIT_UPCOMING_ID}`, "Preview a sit as the sitter", "other", { note: "the sitter view in a frame" }),

  // ── Health, Explore, Community ───────────────────────────────────────────
  ...both(owner("/scans/", "/scans", "Health", "list + detail", { who: "Owner, household member" })),
  owner("/scans/history", "/scans/history", "Health history", "list + detail", { who: "Owner, household member" }),
  owner("/scans/settings", "/scans/settings", "Notification settings", "settings", { who: "Owner, household member" }),
  owner("/explore", "/explore", "Explore", "list + detail", { who: "Everyone signed in", note: "article cards from the blog" }),
  owner("/flock/", "/flock", "Community", "dashboard", { who: "Admins until launch" }),
  owner("/flock/learn", "/flock/learn", "Community: learn", "list + detail", { who: "Admins until launch" }),
  owner("/flock/spaces", "/flock/spaces", "Community: spaces", "list + detail", { who: "Admins until launch" }),

  // ── Account and household ────────────────────────────────────────────────
  owner("/account/", "/account", "Account", "settings", { who: "Everyone signed in" }),
  owner("/account/security", "/account/security", "Sign-in and security", "settings", { who: "Everyone signed in" }),
  owner("/account/emergency", "/account/emergency", "Your emergency info", "settings"),
  ...both(owner("/household", "/household", "Household", "settings")),
  ...both(owner("/past-birds", "/past-birds", "Past birds", "list + detail")),
  owner("/remembering", "/remembering", "Remembering", "empty state", { note: "memorials for birds marked as passed; the fixture has none" }),
  owner("/admin/founding", "/admin/founding", "Admin: Founding 50 claims", "list + detail", { who: "Admins" }),
  owner("/admin/gifts", "/admin/gifts", "Admin: gift memberships", "list + detail", { who: "Admins" }),
  owner("/notifications", "/notifications", "(old) Notifications", "other", { skip: "redirects to /scans" }),
  owner("/notifications/settings", "/notifications/settings", "(old) Notification settings", "other", { skip: "redirects to /scans/settings" }),
  owner("/household-permissions", "/household-permissions", "(old) Household permissions", "other", { skip: "redirects to /household" }),

  // ── Sitter (link, no account) ────────────────────────────────────────────
  sitter("/sitter/$token/", `/sitter/${SITTER}`, "Sitter: Today", "dashboard"),
  sitter("/sitter/$token/home", `/sitter/${SITTER}/home`, "Sitter: all birds", "dashboard", { note: "sits with 2+ birds; one-bird sits go to Today" }),
  sitter("/sitter/$token/care-sheet", `/sitter/${SITTER}/care-sheet`, "Sitter: care plan", "other", { note: "long read view" }),
  sitter("/sitter/$token/guide", `/sitter/${SITTER}/guide`, "Sitter: guide", "list + detail"),
  sitter("/sitter/$token/around", `/sitter/${SITTER}/around`, "Sitter: around the house", "other", { note: "reference info" }),
  sitter("/sitter/$token/emergency", `/sitter/${SITTER}/emergency`, "Sitter: emergency", "other", { note: "reference info and call buttons" }),
  sitter("/sitter/$token/scan", `/sitter/${SITTER}/scan`, "Sitter: daily check", "form / flow"),
  sitter("/sitter/$token/concern", `/sitter/${SITTER}/concern`, "Sitter: something's wrong", "form / flow"),
];

export const slug = (s: Screen) =>
  `${s.route.replace(/^\//, "").replace(/[/$.]+/g, "-").replace(/-+$/, "") || "landing"}${s.path.includes("signup") ? "-signup" : ""}${s.state ? `-${s.state}` : ""}`;
