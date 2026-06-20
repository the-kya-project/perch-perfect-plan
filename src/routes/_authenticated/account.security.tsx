import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OwnerTabBar } from "@/components/OwnerTabBar";
import { ArrowLeft, Check, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account/security")({
  head: () => ({ meta: [{ title: "Password & sign-in — Parrot Care Co-Pilot" }] }),
  component: SecurityPage,
});

function SecurityPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();

  const [email, setEmail] = useState("");
  const [providers, setProviders] = useState<string[]>([]);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (user) {
        setEmail(user.email ?? "");
        const fromMeta = (user.app_metadata?.providers as string[] | undefined) ?? [];
        const fromIdentities = (user.identities ?? []).map((i) => i.provider);
        setProviders(Array.from(new Set([...fromMeta, ...fromIdentities])));
        const g = (user.identities ?? []).find((i) => i.provider === "google");
        setGoogleEmail((g?.identity_data as { email?: string } | undefined)?.email ?? null);
      }
      setLoaded(true);
    })();
  }, []);

  const hasPassword = providers.includes("email");
  const googleConnected = providers.includes("google");

  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/account" }));

  async function savePassword() {
    if (pw.length < 6) { toast.error("Use at least 6 characters."); return; }
    if (pw !== confirm) { toast.error("Passwords don't match."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      toast.success(hasPassword ? "Password updated." : "Password set — you can now sign in with email too.");
      setPw(""); setConfirm("");
      setProviders((p) => (p.includes("email") ? p : [...p, "email"]));
    } catch (e: any) {
      toast.error(e.message ?? "Could not update password.");
    } finally {
      setSaving(false);
    }
  }

  async function emailResetLink() {
    if (!email) return;
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Password reset link sent. Check your email.");
    } catch (e: any) {
      toast.error(e.message ?? "Could not send reset email.");
    } finally {
      setSendingReset(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <header className="bg-[#1a3d2e] pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 pb-5 pt-1">
          <button onClick={goBack} aria-label="Back" className="-ml-1 rounded-full p-1.5 text-white hover:bg-white/10">
            <ArrowLeft className="size-6" />
          </button>
          <h1 className="text-[22px] font-medium leading-tight text-white">Password &amp; sign-in</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-5 pt-5">
        {/* Password */}
        <section className="rounded-[20px] bg-[#efe9da] p-4">
          <h2 className="text-sm font-medium text-[#1a3d2e]">{hasPassword ? "Change password" : "Set a password"}</h2>
          <p className="mt-1 text-xs text-[#5f5e5a]">
            {hasPassword
              ? "Choose a new password for signing in with your email."
              : "Add a password so you can sign in with your email as well as Google."}
          </p>

          <label className="mt-4 block text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">New password</label>
          <input
            type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password"
            placeholder="At least 6 characters"
            className="mt-1 w-full rounded-xl border border-[#d8cfb8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2d6a4f]"
          />
          <label className="mt-3 block text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">Confirm new password</label>
          <input
            type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
            placeholder="Re-enter password"
            className="mt-1 w-full rounded-xl border border-[#d8cfb8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2d6a4f]"
          />
          <button
            onClick={savePassword}
            disabled={saving || !pw || !confirm}
            className="mt-4 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : hasPassword ? "Update password" : "Set password"}
          </button>

          {hasPassword && (
            <button
              onClick={emailResetLink}
              disabled={sendingReset}
              className="mt-2 w-full py-2 text-center text-sm font-medium text-[#1a3d2e] underline disabled:opacity-50"
            >
              {sendingReset ? "Sending…" : "Email me a reset link instead"}
            </button>
          )}
        </section>

        {/* Connected accounts */}
        <div>
          <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-[#8a897f]">Sign-in methods</p>
          <div className="overflow-hidden rounded-[20px] bg-[#efe9da]">
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e8f0ec]">
                <Mail className="size-5 text-[#2d6a4f]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#1a3d2e]">Email &amp; password</p>
                <p className="truncate text-xs text-[#5f5e5a]">{email}</p>
              </div>
              <StatusChip on={hasPassword} onLabel="Password set" offLabel="No password" />
            </div>
            <div className="h-px bg-[#e3dcc9]" />
            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-[#e3dcc9]">
                <GoogleGlyph />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#1a3d2e]">Google</p>
                <p className="truncate text-xs text-[#5f5e5a]">
                  {googleConnected ? (googleEmail ?? "Connected") : "Not connected"}
                </p>
              </div>
              <StatusChip on={googleConnected} onLabel="Connected" offLabel="Not connected" />
            </div>
          </div>
          {loaded && !hasPassword && !googleConnected && (
            <p className="mt-2 px-1 text-xs text-[#5f5e5a]">No sign-in method detected — set a password above to be safe.</p>
          )}
        </div>
      </main>

      <OwnerTabBar />
    </div>
  );
}

function StatusChip({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return on ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#d6e8dc] px-2.5 py-1 text-[11px] font-medium text-[#1a5e3f]">
      <Check className="size-3" /> {onLabel}
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-[#e8e1d0] px-2.5 py-1 text-[11px] font-medium text-[#5f5e5a]">{offLabel}</span>
  );
}

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
    </svg>
  );
}
