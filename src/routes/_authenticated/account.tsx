import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";
import { captureLead } from "@/lib/captureLead";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account — Parrot Care Co-Pilot" }] }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteMyAccount);
  const [email, setEmail] = useState<string | null>(null);
  const [marketing, setMarketing] = useState(false);
  const [savingMarketing, setSavingMarketing] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setEmail(u.user?.email ?? null);
      if (u.user) {
        const { data: p } = await supabase
          .from("profiles")
          .select("marketing_opt_in")
          .eq("id", u.user.id)
          .maybeSingle();
        setMarketing(!!p?.marketing_opt_in);
      }
    })();
  }, []);

  async function toggleMarketing(next: boolean) {
    setMarketing(next);
    setSavingMarketing(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ marketing_opt_in: next })
        .eq("id", u.user.id);
      if (error) throw error;
      void captureLead({
        email: u.user.email ?? "",
        source: "account-settings",
        marketingConsent: next,
      });
      toast.success(next ? "You'll receive community updates." : "You've opted out of updates.");
    } catch (e: any) {
      setMarketing(!next);
      toast.error(e.message ?? "Could not save preference.");
    } finally {
      setSavingMarketing(false);
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

  return (
    <div className="min-h-screen bg-sage-50">
      <main className="mx-auto max-w-md px-5 py-6">
        <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-sage-600">
          <ArrowLeft className="size-4" /> Back
        </Link>

        <h1 className="mt-4 text-2xl font-bold tracking-tight">Account</h1>
        {email && <p className="mt-1 text-sm text-sage-600">Signed in as {email}</p>}

        <section className="mt-6 rounded-2xl bg-white p-4 ring-1 ring-sage-100">
          <h2 className="text-sm font-bold">Email preferences</h2>
          <label className="mt-3 flex items-start gap-3">
            <input
              type="checkbox"
              checked={marketing}
              disabled={savingMarketing}
              onChange={(e) => toggleMarketing(e.target.checked)}
              className="mt-1 size-4 rounded border-sage-300"
            />
            <span className="text-sm text-sage-700">
              Email me about The Kya Project community and updates.
            </span>
          </label>
        </section>

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
