// The iPhone hydration check. Each test runs once per browser engine and
// language (see playwright.config.ts), and fails on any React hydration error
// (#418/#421/#422/#423/#425) or uncaught error. Background: PRs #393–#395.
import { test, expect, load, expectClean, wording, asIOSApp, pageLanguage, MOCK } from "./helpers";

const PENDING_EMAIL_KEY = "ppc_pending_confirm_email"; // src/routes/confirm-email.tsx

// Every front-door page, and the catalog key of the heading it should show.
const PAGES = [
  { path: "/", heading: "landing.headlineV2" },
  { path: "/auth?mode=signin", heading: "auth.signinTitle" },
  { path: "/auth?mode=signup", heading: "auth.signupTitle" },
  // With a pending email stored, as after sign-up: reloading this page is what
  // broke on Oct 22–24 (the address was read during the first render).
  { path: "/confirm-email", heading: "checkEmail.title", pendingEmail: true },
  { path: "/link-expired", heading: "linkExpired.title" },
] as const;

for (const shell of ["Safari", "iOS app"] as const) {
  test.describe(`${shell}`, () => {
    for (const p of PAGES) {
      test(`${p.path} hydrates cleanly`, async ({ page, problems, locale_ }) => {
        if (shell === "iOS app") await asIOSApp(page);
        if ("pendingEmail" in p) {
          await page.addInitScript(([k, v]) => sessionStorage.setItem(k, v), [PENDING_EMAIL_KEY, "kiwi@example.com"]);
        }
        await load(page, p.path);
        expectClean(problems, `${shell} ${p.path} (${locale_})`);
        // The page shows its own heading, in this language: the language
        // switch happened, and after hydration rather than during it.
        await expect(page.locator("h1").first()).toHaveText(wording(locale_, p.heading));
        expect(await pageLanguage(page)).toBe(locale_);
      });
    }
  });
}

test("sign-up with an email that already has an account", async ({ page, request, problems, locale_, uniqueEmail }) => {
  const email = uniqueEmail();
  await request.post(`${MOCK}/__seed`, { data: { email, confirmed: false } });

  await load(page, "/auth?mode=signup");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", "secret123");
  await page.click("button[type=submit]");

  // Supabase answers a duplicate with no error and an empty identities list;
  // the page must say so plainly and offer the confirmation email again.
  await expect(page.getByText(wording(locale_, "auth.alreadyHaveAccountCheckInbox"))).toBeVisible();
  await expect(page).toHaveURL(/mode=signin/);
  await expect(page.locator("#auth-email")).toHaveValue(email);
  const before = (await (await request.get(`${MOCK}/__links?email=${encodeURIComponent(email)}`)).json()).tokens.length;
  await page.getByRole("button", { name: wording(locale_, "auth.resendConfirmation") }).click();
  await expect(page.getByText(wording(locale_, "confirmNote.sentUseNewest"))).toBeVisible();
  const after = (await (await request.get(`${MOCK}/__links?email=${encodeURIComponent(email)}`)).json()).tokens.length;
  expect(after, "Resend should issue exactly one new link").toBe(before + 1);

  expectClean(problems, `duplicate-email sign-up (${locale_})`);
});

test("tapping an old confirmation link after a newer one was sent", async ({ page, request, problems, locale_, uniqueEmail }) => {
  const email = uniqueEmail();
  const links = async () => (await (await request.get(`${MOCK}/__links?email=${encodeURIComponent(email)}`)).json()) as { tokens: string[]; current: string | null; confirmed: boolean };
  const verify = (token: string) => `${MOCK}/auth/v1/verify?token=${token}&type=signup&redirect_to=${encodeURIComponent(new URL("/welcome", page.url()).href)}`;

  // Sign up, then ask for another email (which cancels the first link).
  await load(page, "/auth?mode=signup");
  await page.fill("#auth-email", email);
  await page.fill("#auth-password", "secret123");
  await page.click("button[type=submit]");
  await page.waitForURL("**/confirm-email");
  await request.post(`${MOCK}/auth/v1/resend`, { data: { type: "signup", email } });
  const first = await links();
  expect(first.tokens.length).toBe(2);

  // The delayed first email arrives; its link is dead.
  await page.goto(verify(first.tokens[0]), { waitUntil: "networkidle" });
  await page.waitForURL("**/link-expired**");
  await expect(page.locator("h1").first()).toHaveText(wording(locale_, "linkExpired.title"));
  await expect(page.locator("#link-expired-email")).toHaveValue(email);
  await page.getByRole("button", { name: wording(locale_, "linkExpired.sendNewLink") }).click();
  await expect(page.getByText(wording(locale_, "confirmNote.sentUseNewest"))).toBeVisible();
  const second = await links();
  expect(second.tokens.length).toBe(3);

  // They use the newest link, then tap an old one again: already confirmed,
  // so straight to sign-in with the email filled in.
  await page.goto(verify(second.current!), { waitUntil: "networkidle" });
  expect((await links()).confirmed).toBe(true);
  await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [PENDING_EMAIL_KEY, email]);
  await page.goto(verify(first.tokens[1]), { waitUntil: "networkidle" });
  await page.waitForURL(/\/auth\?mode=signin/);
  await expect(page.getByText(wording(locale_, "auth.alreadyConfirmedSignIn"))).toBeVisible();
  await expect(page.locator("#auth-email")).toHaveValue(email);

  expectClean(problems, `old confirmation link (${locale_})`);
});
