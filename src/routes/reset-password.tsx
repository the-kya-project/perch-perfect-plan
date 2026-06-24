import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { InkHero, PrimaryButton, CtaLink } from "@/components/system";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — Kya & Co." },
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
    <div className="min-h-screen bg-[var(--cream)]">
      <InkHero
        eyebrow="Kya & Co."
        headline="Set a new password."
        body={
          ready
            ? "Choose a new password for your account."
            : "Open this page from the password reset email you received."
        }
      />

      <main className="mx-auto max-w-md px-5 py-8">
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="t-eyebrow mb-1 block text-[var(--mute)]">New password</span>
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
            <span className="t-eyebrow mb-1 block text-[var(--mute)]">Confirm password</span>
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
          <div className="pt-2">
            <PrimaryButton tone="ink" type="submit" disabled={loading || !ready}>
              {loading ? "..." : "Update password"}
            </PrimaryButton>
          </div>
        </form>

        <div className="mt-6">
          <CtaLink
            label="Back to sign in"
            onPress={() => navigate({ to: "/auth", search: { mode: "signin" } })}
          />
        </div>
      </main>
    </div>
  );
}
