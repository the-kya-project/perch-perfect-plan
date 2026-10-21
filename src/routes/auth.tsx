import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { track } from "@/lib/analytics";
import { captureLead } from "@/lib/captureLead";
import { attributionMetadata, getFirstTouch } from "@/lib/attribution";
import { currentLocale } from "@/lib/i18n/ownerLocale";
import { PENDING_EMAIL_KEY } from "./confirm-email";
import { K, KyaLabel } from "@/components/kya";
import { FrontDoorBody, FrontDoorError, FrontDoorHeader, FrontDoorPage, LegalLinks } from "@/components/frontDoor";
import { CheckEmailView } from "@/components/CheckEmailView";
import { SocialSignInButtons } from "@/components/SocialSignInButtons";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { useTranslation, Trans } from "react-i18next";
import i18next from "i18next";
import { safeInternalPath, stashReturnTo, takeReturnTo } from "@/lib/returnTo";

const search = z.object({
  mode: z.enum(["signin", "signup"]).default("signin"),
  // Deep-link return path: where to land after auth (e.g. an email link into an
  // authenticated view). Validated to an internal path at use to avoid open redirects.
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: i18next.t("auth.pageTitle", "Sign in — Kya & Co.") },
      { name: "description", content: i18next.t("auth.metaDescription", "Sign in or create an owner account to build a bird care plan.") },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t } = useTranslation();
  const { mode, redirect } = Route.useSearch();
  const navigate = useNavigate();
  const returnTo = safeInternalPath(redirect);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [loading, setLoading] = useState(false);
  // Which button started the current request, for its spinner.
  const [busy, setBusy] = useState<"email" | "reset" | null>(null);
  // Errors show in a card on the page (FrontDoorError), never only as a toast.
  const [error, setError] = useState<string | null>(null);
  // Forgot password lives on this page as a step of sign in, not a URL mode:
  // "forgot" asks for the email, "resetSent" is the check-your-email screen.
  const [view, setView] = useState<"form" | "forgot" | "resetSent">("form");
  const [resetCooldown, setResetCooldown] = useState(0);
  const [resetJustSent, setResetJustSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) { takeReturnTo(); navigate({ href: returnTo ?? "/dashboard" }); }
    });
    // Also leave whenever a session APPEARS while this page is open — covers
    // the native OAuth callback completing after mount (TestFlight sign-in
    // loop: the deep-link exchange finishes while the user is parked here).
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // `href`, not `to`: the return path can carry a query string
      // (/birds/new?next=weight) that `to` would treat as part of the path.
      // The stash is left alone here: native sign-in pushes /welcome right
      // after this fires, and /welcome is what reads it.
      if (event === "SIGNED_IN") navigate({ href: returnTo ?? "/dashboard" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, returnTo]);

  // Client-side cooldowns on top of Supabase Auth's built-in rate limits,
  // to discourage brute-force loops from the same browser session.
  function readCooldown(key: string): number {
    if (typeof window === "undefined") return 0;
    const v = Number(window.sessionStorage.getItem(key) ?? "0");
    return Number.isFinite(v) ? v : 0;
  }
  function setCooldown(key: string, seconds: number) {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(key, String(Date.now() + seconds * 1000));
  }
  function remainingCooldown(key: string): number {
    const until = readCooldown(key);
    return Math.max(0, Math.ceil((until - Date.now()) / 1000));
  }
  function bumpAttempts(key: string): number {
    if (typeof window === "undefined") return 1;
    const n = Number(window.sessionStorage.getItem(key) ?? "0") + 1;
    window.sessionStorage.setItem(key, String(n));
    return n;
  }
  function clearAttempts(key: string) {
    if (typeof window === "undefined") return;
    window.sessionStorage.removeItem(key);
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setBusy("email");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0],
              marketing_opt_in: marketingOptIn,
              // Read by the "Confirm signup" email template ({{ .Data.locale }}).
              locale: currentLocale(),
              // First-touch attribution → handle_new_user trigger writes it onto
              // the profile (works even when email confirmation defers the session).
              ...attributionMetadata(),
            },
            // Land confirmed owners on the one-time welcome (first sign-in),
            // which then routes returning owners straight to the dashboard.
            emailRedirectTo: window.location.origin + "/welcome",
          },
        });
        // Already-registered email — handle BOTH Supabase configs the same way
        // (bounce to sign-in, email persists on the same /auth route):
        //   • Confirm-email OFF → signUp returns an error ("User already
        //     registered"). Without this we'd just toast a raw error and leave
        //     them on the form, free to keep retrying.
        //   • Confirm-email ON → no error (anti-enumeration), but an obfuscated
        //     user with an EMPTY identities array and no session — otherwise
        //     we'd send them to "check your email to confirm" for a mail that
        //     never comes.
        const identities = (data?.user as { identities?: unknown[] } | null)?.identities;
        const alreadyRegistered =
          (!!error && /already\s*(registered|exist)/i.test(error.message ?? "")) ||
          (!error && Array.isArray(identities) && identities.length === 0);
        if (alreadyRegistered) {
          // The card stays on the sign-in form this lands on (same page).
          setError(t("auth.emailAlreadyHasAccount", "That email already has an account — sign in instead."));
          toast.error(t("auth.emailAlreadyHasAccount", "That email already has an account — sign in instead."));
          navigate({ to: "/auth", search: { mode: "signin" } });
          return;
        }
        if (error) throw error; // any other signup error
        track("owner_signup", { method: "email", marketing_opt_in: marketingOptIn, verification_required: !data.session });
        if (marketingOptIn) track("marketing_opt_in_checked", { context: "signup" });
        void captureLead({
          email,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          source: "owner-signup",
          marketingConsent: marketingOptIn,
          attribution: getFirstTouch(),
        });
        // With email confirmation required, no session is returned until the
        // user clicks the verification link. Send them to a persistent screen
        // (not a disappearing toast) that waits for confirmation. Stash the
        // email in sessionStorage — it's personal data, so keep it out of the URL.
        if (!data.session) {
          try { window.sessionStorage.setItem(PENDING_EMAIL_KEY, email); } catch {}
          navigate({ to: "/confirm-email" });
        } else {
          // New owner with a session → one-time welcome screen, then dashboard.
          navigate({ to: "/welcome" });
        }
      } else {
        const cooldownKey = `signin:cooldown:${email.toLowerCase()}`;
        const attemptsKey = `signin:attempts:${email.toLowerCase()}`;
        const wait = remainingCooldown(cooldownKey);
        if (wait > 0) {
          setError(t("auth.tooManyAttemptsWait", "Too many attempts. Try again in {{wait}}s.", { wait }));
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const n = bumpAttempts(attemptsKey);
          if (n >= 5) {
            setCooldown(cooldownKey, 60);
            clearAttempts(attemptsKey);
            setError(t("auth.tooManyFailedAttempts", "Too many failed attempts. Try again in 60s, or reset your password."));
          } else {
            setError(authErrorMessage(error));
          }
          return;
        }
        clearAttempts(attemptsKey);
        // Deep-link return (e.g. the handoff email → Past birds) takes an existing
        // owner straight there. Otherwise route through the welcome screen, which
        // shows only on first sign-in and otherwise redirects to the dashboard.
        navigate({ href: returnTo ?? "/welcome" });
      }
    } catch (err: any) {
      setError(authErrorMessage(err, t("auth.somethingWentWrong", "Something went wrong.")));
    } finally {
      setLoading(false);
      setBusy(null);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setError(t("auth.enterEmailForReset", "Enter the email you signed up with."));
      return;
    }
    const cooldownKey = `reset:cooldown:${trimmed.toLowerCase()}`;
    const wait = remainingCooldown(cooldownKey);
    if (wait > 0) {
      setError(t("auth.waitBeforeReset", "Please wait {{wait}}s before requesting another reset email.", { wait }));
      return;
    }
    setLoading(true);
    setBusy("reset");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setCooldown(cooldownKey, 60);
      setResetCooldown(60);
      if (view === "resetSent") setResetJustSent(true);
      setView("resetSent");
    } catch (err: any) {
      setError(authErrorMessage(err, t("auth.couldNotSendReset", "Could not send reset email.")));
    } finally {
      setLoading(false);
      setBusy(null);
    }
  }

  // Countdown for "Send it again" on the reset-link-sent screen, from the same
  // per-email cooldown the reset request sets (60s).
  useEffect(() => {
    if (view !== "resetSent") return;
    const key = `reset:cooldown:${email.trim().toLowerCase()}`;
    const tick = () => setResetCooldown(remainingCooldown(key));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
    // remainingCooldown only reads sessionStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, email]);
  useEffect(() => {
    if (!resetJustSent) return;
    const id = window.setTimeout(() => setResetJustSent(false), 2500);
    return () => window.clearTimeout(id);
  }, [resetJustSent]);

  function backToSignInForm() {
    setError(null);
    setView("form");
  }

  if (view === "resetSent") {
    return (
      <CheckEmailView
        email={email.trim()}
        kind="reset"
        onBack={backToSignInForm}
        onResend={() => { if (!loading) void handleForgotPassword(); }}
        resending={busy === "reset"}
        cooldown={resetCooldown}
        justSent={resetJustSent}
        error={error}
        onUseDifferentEmail={() => { setError(null); setView("forgot"); }}
      />
    );
  }

  const forgot = view === "forgot";
  const title = forgot
    ? t("auth.resetTitle", "Reset your password")
    : mode === "signup" ? t("auth.signupTitle", "Create your account") : t("auth.signinTitle", "Welcome back");
  const line = forgot
    ? t("auth.resetLine", "We'll email you a link to set a new one.")
    : mode === "signup" ? t("auth.signupLine", "Free, and it takes a minute.") : t("auth.signinLine", "Sign in to pick up where you left off.");
  const linkCls = "inline-flex min-h-[44px] items-center font-[700]";

  return (
    <FrontDoorPage>
      <FrontDoorHeader
        onBack={forgot ? backToSignInForm : () => navigate({ to: "/" })}
        title={title}
        line={line}
      />
      <FrontDoorBody>
        {error && <FrontDoorError>{error}</FrontDoorError>}

        {forgot ? (
          <form
            onSubmit={(e) => { e.preventDefault(); if (!loading) void handleForgotPassword(); }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <KyaLabel htmlFor="auth-reset-email">{t("auth.email", "Email")}</KyaLabel>
              <input
                id="auth-reset-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="kya-input"
                placeholder="you@example.com"
              />
            </div>
            <SubmitButton disabled={loading} busy={busy === "reset"}>
              {t("auth.sendResetLink", "Send reset link")}
            </SubmitButton>
            <p className="m-0 text-center text-[12.5px]">
              <button type="button" onClick={backToSignInForm} className={linkCls} style={{ color: K.moss }}>
                {t("auth.backToSignIn", "Back to sign in")}
              </button>
            </p>
          </form>
        ) : (
          <>
            {/* Land on the one-time welcome; it redirects returning owners
                straight to the dashboard (gated by an account flag), so only new
                owners see it. The provider round trip can't carry a deep link,
                so /welcome picks it up from the stash and forwards there instead. */}
            <SocialSignInButtons
              redirectPath="/welcome"
              beforeStart={() => stashReturnTo(returnTo)}
              disabled={loading}
              onBusyChange={setLoading}
              onError={setError}
            />

            <div className="flex items-center gap-3 py-1" style={{ color: K.quiet }}>
              <div className="h-px flex-1" style={{ background: "#d5dfd5" }} />
              <span className="text-[13px] font-[600]">{t("auth.orWithEmailLine", "or with email")}</span>
              <div className="h-px flex-1" style={{ background: "#d5dfd5" }} />
            </div>

            <form onSubmit={handleEmail} className="flex flex-col gap-4">
              {mode === "signup" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <KyaLabel htmlFor="auth-first">{t("auth.firstName", "First name")}</KyaLabel>
                    <input
                      id="auth-first"
                      type="text"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="kya-input"
                      placeholder={t("auth.firstNamePlaceholder", "Maya")}
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <KyaLabel htmlFor="auth-last">{t("auth.lastName", "Last name")}</KyaLabel>
                    <input
                      id="auth-last"
                      type="text"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="kya-input"
                      placeholder={t("auth.lastNamePlaceholder", "Lopez")}
                    />
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <KyaLabel htmlFor="auth-email">{t("auth.email", "Email")}</KyaLabel>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="kya-input"
                  placeholder="you@example.com"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <KyaLabel htmlFor="auth-password">{t("auth.password", "Password")}</KyaLabel>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="kya-input"
                  placeholder="••••••••"
                />
                {mode === "signin" && (
                  <div className="-mb-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setError(null); setView("forgot"); }}
                      className="inline-flex min-h-[44px] items-center px-1 text-[14px] font-[700]"
                      style={{ color: K.moss }}
                    >
                      {t("auth.forgotPassword", "Forgot password?")}
                    </button>
                  </div>
                )}
              </div>
              {mode === "signup" && (
                <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-[13.5px] leading-[1.45]" style={{ color: K.ink }}>
                  <input
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={(e) => { setMarketingOptIn(e.target.checked); if (e.target.checked) track("marketing_opt_in_checked", { context: "checkbox" }); }}
                    className="mt-0.5 size-5 shrink-0 rounded"
                    style={{ accentColor: K.forest }}
                  />
                  <span>{t("auth.marketingOptIn", "Email me about The Kya Project community and updates. (Optional)")}</span>
                </label>
              )}
              <SubmitButton disabled={loading} busy={busy === "email"}>
                {mode === "signup" ? t("auth.createAccount", "Create account") : t("auth.signIn", "Sign in")}
              </SubmitButton>
              {mode === "signup" && (
                <p className="m-0 text-center text-[12px] leading-[1.45]" style={{ color: K.quiet }}>
                  <Trans
                    i18nKey="auth.agreeToTerms"
                    defaults="By creating an account you agree to our <terms>Terms</terms> and <privacy>Privacy Policy</privacy>."
                    components={{
                      terms: <Link to="/terms" className="font-[700] underline" style={{ color: K.moss }} />,
                      privacy: <Link to="/privacy" className="font-[700] underline" style={{ color: K.moss }} />,
                    }}
                  />
                </p>
              )}
            </form>

            <p className="m-0 text-center text-[12.5px]" style={{ color: K.quiet }}>
              {mode === "signup" ? (
                <Trans
                  i18nKey="auth.haveAccountSignIn"
                  defaults="Already have an account? <go>Sign in</go>"
                  components={{ go: <Link to="/auth" search={{ mode: "signin" }} onClick={() => setError(null)} className={linkCls} style={{ color: K.moss }} /> }}
                />
              ) : (
                <Trans
                  i18nKey="auth.newHereCreate"
                  defaults="New here? <go>Create an account</go>"
                  components={{ go: <Link to="/auth" search={{ mode: "signup" }} onClick={() => setError(null)} className={linkCls} style={{ color: K.moss }} /> }}
                />
              )}
            </p>
          </>
        )}

        <div className="mt-auto pt-2">
          <LegalLinks />
        </div>
      </FrontDoorBody>
    </FrontDoorPage>
  );
}

/** KyaPrimaryButton's look as a real submit button, so Enter submits the form. */
function SubmitButton({ children, disabled, busy }: { children: React.ReactNode; disabled?: boolean; busy?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="mt-1 inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700] disabled:opacity-45"
      style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
    >
      {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
