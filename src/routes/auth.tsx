import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

const search = z.object({
  mode: z.enum(["signin", "signup"]).default("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [
      { title: "Sign in — Parrot Care Co-Pilot" },
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
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard" });
    });
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName || email.split("@")[0] },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast.success("Account created. You're signed in.");
        navigate({ to: "/dashboard" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
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
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/dashboard",
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google sign-in failed.");
        setLoading(false);
        return;
      }
      if (result.redirected) return;
      navigate({ to: "/dashboard" });
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
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset email sent. Check your inbox.");
    } catch (err: any) {
      toast.error(err.message ?? "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }



  return (
    <div className="min-h-screen bg-sage-50">
      <main className="mx-auto max-w-md px-5 py-8">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-sage-600">
          <ArrowLeft className="size-4" /> Back
        </Link>

        <div className="mt-6">
          <BrandLogo size="md" />
        </div>

        <h1 className="mt-8 text-2xl font-bold tracking-tight">
          {mode === "signup" ? "Create your owner account" : "Sign in"}
        </h1>
        <p className="mt-1 text-sm text-sage-600">
          {mode === "signup"
            ? "We'll save your bird profiles and care plans across trips."
            : "Welcome back."}
        </p>

        <button
          onClick={handleGoogle}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl border border-sage-200 bg-white px-4 py-3 text-sm font-semibold shadow-sm active:scale-[0.99] disabled:opacity-50"
        >
          <GoogleIcon /> Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-widest text-sage-600">
          <div className="h-px flex-1 bg-sage-200" />
          or with email
          <div className="h-px flex-1 bg-sage-200" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          {mode === "signup" && (
            <Field label="Your name">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input"
                placeholder="Maya"
              />
            </Field>
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
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="text-xs font-semibold text-sage-700 underline disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-xl bg-sage-600 px-4 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "..." : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-sage-600">
          {mode === "signup" ? (
            <Link to="/auth" search={{ mode: "signin" }} className="font-semibold underline">
              Already have an account? Sign in
            </Link>
          ) : (
            <Link to="/auth" search={{ mode: "signup" }} className="font-semibold underline">
              Need an account? Sign up
            </Link>
          )}
        </p>
      </main>

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
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-sage-600">{label}</span>
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
