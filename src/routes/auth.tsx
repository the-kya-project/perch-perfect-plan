import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { track } from "@/lib/analytics";
import { captureLead } from "@/lib/captureLead";
import { attributionMetadata, getFirstTouch } from "@/lib/attribution";
import { PENDING_EMAIL_KEY } from "./confirm-email";
import { InkHero, PrimaryButton, CtaLink, Card } from "@/components/system";

const search = z.object({
  mode: z.enum(["signin", "signup"]).default("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Sign in — Kya & Co." },
      { name: "description", content: "Sign in or create an owner account to build a bird care plan." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

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
    setLoading(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0],
              marketing_opt_in: marketingOptIn,
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
          toast.error("That email already has an account — sign in instead.");
          navigate({ to: "/auth", search: { mode: "signin" } });
          return;
        }
        if (error) throw error; // any other signup error
        track("owner_signup", { marketing_opt_in: marketingOptIn, verification_required: !data.session });
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
          toast.error(`Too many attempts. Try again in ${wait}s.`);
          return;
        }
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          const n = bumpAttempts(attemptsKey);
          if (n >= 5) {
            setCooldown(cooldownKey, 60);
            clearAttempts(attemptsKey);
            toast.error("Too many failed attempts. Try again in 60s, or reset your password.");
          } else {
            toast.error(error.message);
          }
          return;
        }
        clearAttempts(attemptsKey);
        // Route through the welcome screen, which shows only on the owner's
        // first sign-in (gated by an account flag) and otherwise redirects
        // straight to the dashboard.
        navigate({ to: "/welcome" });
      }
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        // Land on the one-time welcome; it redirects returning owners straight to
        // the dashboard (gated by an account flag), so only new owners see it.
        options: { redirectTo: window.location.origin + "/welcome" },
      });
      if (error) {
        toast.error(error.message ?? "Google sign-in failed.");
        setLoading(false);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Google sign-in failed.");
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Enter your email above first, then tap Forgot password.");
      return;
    }
    const cooldownKey = `reset:cooldown:${trimmed.toLowerCase()}`;
    const wait = remainingCooldown(cooldownKey);
    if (wait > 0) {
      toast.error(`Please wait ${wait}s before requesting another reset email.`);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setCooldown(cooldownKey, 60);
      toast.success("If that email is registered, a reset link is on its way.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }



  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <div className="mx-auto max-w-md">
        <InkHero
          // Sign-up keeps the lockup as chrome; sign-in removes it so the
          // welcome carries the screen.
          showBrand={mode === "signup"}
          eyebrow={mode === "signup" ? "Get started" : "Welcome back"}
          headline={mode === "signup" ? "Create your account." : "Pick up where you left off."}
          body={
            mode === "signup"
              ? "Save bird profiles and care plans across trips, sitters, and the people who help."
              : "Sign in to your bird's record."
          }
          backIcon={<ArrowLeft className="size-5" />}
          onBack={() => navigate({ to: "/" })}
        />

        <main className="px-5 py-7">
          <Card className="p-5">
            <PrimaryButton
              tone="outline"
              icon={<GoogleIcon />}
              onPress={handleGoogle}
              disabled={loading}
            >
              Continue with Google
            </PrimaryButton>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[var(--line2)]" />
              <span className="t-eyebrow text-[var(--mute2)]">Or with email</span>
              <div className="h-px flex-1 bg-[var(--line2)]" />
            </div>

            <form onSubmit={handleEmail} className="space-y-3">
              {mode === "signup" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="First name">
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="input"
                      placeholder="Maya"
                    />
                  </Field>
                  <Field label="Last name">
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="input"
                      placeholder="Lopez"
                    />
                  </Field>
                </div>
              )}
              <Field label="Email">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                />
              </Field>
              <Field label="Password">
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                />
              </Field>
              {mode === "signin" && (
                <div className="flex justify-end">
                  <CtaLink
                    label="Forgot password?"
                    icon={<span />}
                    onPress={() => { if (!loading) handleForgotPassword(); }}
                  />
                </div>
              )}
              {mode === "signup" && (
                <label className="mt-2 flex items-start gap-2 text-[13px] text-[var(--mute)]">
                  <input
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={(e) => { setMarketingOptIn(e.target.checked); if (e.target.checked) track("marketing_opt_in_checked", { context: "checkbox" }); }}
                    className="mt-0.5 size-4 rounded border-[var(--line)]"
                  />
                  <span>Email me about The Kya Project community and updates. (Optional)</span>
                </label>
              )}
              <div className="pt-1">
                <PrimaryButton
                  tone="lime"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "..." : mode === "signup" ? "Create account" : "Sign in"}
                </PrimaryButton>
              </div>
              {mode === "signup" && (
                <p className="text-center text-[11px] text-[var(--mute2)]">
                  By creating an account you agree to our{" "}
                  <Link to="/terms" className="text-[var(--moss)] underline">Terms</Link> and{" "}
                  <Link to="/privacy" className="text-[var(--moss)] underline">Privacy Policy</Link>.
                </p>
              )}
            </form>
          </Card>

          <p className="mt-6 text-center text-[14px] text-[var(--mute)]">
            {mode === "signup" ? (
              <Link to="/auth" search={{ mode: "signin" }} className="font-[500] text-[var(--moss)] underline">
                Already have an account? Sign in
              </Link>
            ) : (
              <Link to="/auth" search={{ mode: "signup" }} className="font-[500] text-[var(--moss)] underline">
                Need an account? Sign up
              </Link>
            )}
          </p>

          <p className="mt-4 text-center text-[11px] text-[var(--mute2)]">
            <Link to="/privacy" className="text-[var(--moss)] underline">Privacy</Link>
            {" · "}
            <Link to="/terms" className="text-[var(--moss)] underline">Terms</Link>
          </p>
        </main>
      </div>

      <style>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          background: white;
          border: 1px solid var(--sage-200);
          padding: 0.75rem 0.875rem;
          font-size: 16px;
          outline: none;
        }
        .input:focus { border-color: var(--sage-600); box-shadow: 0 0 0 3px rgb(74 103 65 / 0.15); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-[500] uppercase tracking-wider text-[var(--mute)]">{label}</span>
      {children}
    </label>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 12s4.3 9.7 9.6 9.7c5.6 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  );
}
