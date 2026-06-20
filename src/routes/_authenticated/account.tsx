import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { deleteMyAccount } from "@/lib/account.functions";
import { ArrowLeft, AlertTriangle, Bell, ChevronRight } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account — Parrot Care Co-Pilot" }] }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteMyAccount);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState<string>("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [name, setName] = useState<string>("");
  const [nameLoaded, setNameLoaded] = useState<string>("");
  const [savingName, setSavingName] = useState(false);

  const [sendingReset, setSendingReset] = useState(false);

  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await getLocalUser();
      const user = u.user;
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email ?? "");
      setEmailInput(user.email ?? "");
      const newEmail = (user as { new_email?: string | null }).new_email ?? null;
      setPendingEmail(newEmail);

      const { data: p } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      const dn = p?.display_name ?? "";
      setName(dn);
      setNameLoaded(dn);
    })();
  }, []);

  async function saveName() {
    if (!userId) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: name.trim() || null })
        .eq("id", userId);
      if (error) throw error;
      setNameLoaded(name);
      toast.success("Name updated.");
    } catch (e: any) {
      toast.error(e.message ?? "Could not update name.");
    } finally {
      setSavingName(false);
    }
  }

  async function changeEmail() {
    const next = emailInput.trim().toLowerCase();
    if (!next || next === email.toLowerCase()) return;
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser(
        { email: next },
        { emailRedirectTo: `${window.location.origin}/dashboard` },
      );
      if (error) throw error;
      setPendingEmail(next);
      toast.success(
        "Confirmation links sent to your current and new email addresses. Both must be confirmed.",
      );
    } catch (e: any) {
      toast.error(e.message ?? "Could not start email change.");
    } finally {
      setSavingEmail(false);
    }
  }

  async function sendPasswordReset() {
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

  async function handleDelete() {
    if (confirmText.trim().toUpperCase() !== "DELETE") {
      toast.error("Type DELETE to confirm.");
      return;
    }
    setDeleting(true);
    try {
      await deleteFn();
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
      toast.success("Your account and all data have been deleted.");
      navigate({ to: "/", replace: true });
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete account.");
      setDeleting(false);
    }
  }

  const nameDirty = name.trim() !== nameLoaded.trim();
  const emailDirty =
    emailInput.trim().toLowerCase() !== email.toLowerCase() && emailInput.trim().length > 0;

  return (
    <div className="min-h-screen bg-sage-50">
      <main className="mx-auto max-w-md px-5 py-6">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-sage-600">
          <ArrowLeft className="size-4" /> Back
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight">Account</h1>

        <section className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-sage-100">
          <h2 className="text-sm font-bold">Your details</h2>

          <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-sage-600">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm"
            placeholder="Your name"
          />
          <button
            onClick={saveName}
            disabled={!nameDirty || savingName}
            className="mt-2 rounded-xl bg-sage-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {savingName ? "Saving…" : "Save name"}
          </button>

          <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-sage-600">
            Email address
          </label>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="mt-1 w-full rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm"
            placeholder="you@example.com"
          />
          {pendingEmail && pendingEmail.toLowerCase() !== email.toLowerCase() && (
            <p className="mt-2 text-xs text-amber-700">
              Change to <strong>{pendingEmail}</strong> pending — confirm the links sent to
              both your current and new addresses.
            </p>
          )}
          <button
            onClick={changeEmail}
            disabled={!emailDirty || savingEmail}
            className="mt-2 rounded-xl bg-sage-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {savingEmail ? "Sending…" : "Change email"}
          </button>
          <p className="mt-2 text-xs text-sage-600">
            We'll send a confirmation link to both your current and new email addresses.
            Both must be confirmed for the change to take effect.
          </p>

          <label className="mt-5 block text-xs font-semibold uppercase tracking-wider text-sage-600">
            Password
          </label>
          <button
            onClick={sendPasswordReset}
            disabled={!email || sendingReset}
            className="mt-1 rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm font-semibold text-sage-700 disabled:opacity-50"
          >
            {sendingReset ? "Sending…" : "Send password reset email"}
          </button>
        </section>

        <Link
          to="/notifications/settings"
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100"
        >
          <div className="flex items-center gap-3">
            <Bell className="size-5 text-sage-700" />
            <div>
              <div className="text-sm font-semibold text-sage-900">Notifications</div>
              <p className="text-xs text-sage-600">Manage product and sitter activity emails.</p>
            </div>
          </div>
          <ChevronRight className="size-4 text-sage-500" />
        </Link>

        <section className="mt-6 rounded-2xl border border-red-200 bg-white p-4">
          <div className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="size-4" />
            <h2 className="text-sm font-bold">Delete account</h2>
          </div>
          <p className="mt-2 text-sm text-sage-700">
            Permanently delete your account and all associated data — birds, care plans,
            clips, sits, logs, and your marketing-contact record. This cannot be undone.
          </p>
          <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-sage-600">
            Type DELETE to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="mt-1 w-full rounded-xl border border-sage-200 bg-white px-3 py-2 text-sm"
            placeholder="DELETE"
          />
          <button
            onClick={handleDelete}
            disabled={deleting || confirmText.trim().toUpperCase() !== "DELETE"}
            className="mt-3 w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Permanently delete my account"}
          </button>
        </section>

        <p className="mt-8 text-center text-xs text-sage-600">
          <Link to="/privacy" className="underline">Privacy</Link>
          {" · "}
          <Link to="/terms" className="underline">Terms</Link>
        </p>
      </main>
    </div>
  );
}
