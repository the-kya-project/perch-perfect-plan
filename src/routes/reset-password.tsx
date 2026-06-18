import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — Parrot Care Co-Pilot" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  // Supabase puts the recovery token in the URL hash and exchanges it for a
  // session. Wait for the recovery event (or an existing session) before
  // letting the user submit a new password.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated. You're signed in.");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Could not update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f1e8]">
      <main className="mx-auto max-w-md px-5 py-8">
        <Link to="/auth" search={{ mode: "signin" }} className="inline-flex items-center gap-1 text-sm text-[#5f5e5a]">
          <ArrowLeft className="size-4" /> Back to sign in
        </Link>

        <div className="mt-6">
          <BrandLogo size="md" />
        </div>

        <h1 className="mt-8 text-2xl font-medium tracking-tight">Set a new password</h1>
        <p className="mt-1 text-sm text-[#5f5e5a]">
          {ready
            ? "Choose a new password for your account."
            : "Open this page from the password reset email you received."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">New password</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              disabled={!ready}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">Confirm password</span>
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="input"
              placeholder="••••••••"
              disabled={!ready}
            />
          </label>
          <button
            type="submit"
            disabled={loading || !ready}
            className="mt-2 w-full rounded-xl bg-[#1a3d2e] px-4 py-3 text-sm font-medium text-white active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "..." : "Update password"}
          </button>
        </form>
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
