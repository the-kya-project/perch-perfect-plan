import { createFileRoute, Link, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { deleteMyAccount } from "@/lib/account.functions";
import { APP_VERSION } from "@/lib/version";
import { ArrowLeft, ShieldAlert, Bell, Smartphone, Lock, X, Archive, Users } from "lucide-react";
import { AddToHomeModal } from "@/components/AddToHomeModal";
import { InkHero, Card, RecordRow, IconTile, SectionHead, PrimaryButton } from "@/components/system";
import { toast } from "sonner";

// Support inbox for the "Help & support" row. If this address changes, update it
// here (and ideally point it at a monitored mailbox).
const SUPPORT_EMAIL = "brittany@thekyaproject.com";

export const Route = createFileRoute("/_authenticated/account/")({
  head: () => ({ meta: [{ title: "Account — Kya & Co." }] }),
  component: AccountPage,
});

function AccountPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteMyAccount);

  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [name, setName] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [a2hsOpen, setA2hsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await getLocalUser();
      const user = u.user;
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email ?? "");
      setPendingEmail((user as { new_email?: string | null }).new_email ?? null);
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();
      setName(p?.display_name ?? "");
    })();
  }, []);

  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/dashboard" }));

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out.");
    navigate({ to: "/", replace: true });
  }

  const initial = (name.trim()[0] || email.trim()[0] || "?").toUpperCase();
  const emailPending = pendingEmail && pendingEmail.toLowerCase() !== email.toLowerCase();

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          eyebrow="Account"
          headline="Your account"
        />

        <main className="space-y-6 px-5 pt-5">
          {/* Identity */}
          <Card>
            <div className="flex items-center gap-3 p-4">
              <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-xl font-[500] text-white">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="t-item truncate">{name.trim() || "Your name"}</p>
                <p className="t-meta truncate">{email}</p>
                {emailPending && (
                  <p className="mt-0.5 truncate text-[11px] text-[var(--amber-ink)]">Change to {pendingEmail} pending — confirm the emailed links.</p>
                )}
              </div>
              <button onClick={() => setEditOpen(true)} className="shrink-0 text-[13px] font-[500] text-[var(--moss)] active:opacity-70">Edit</button>
            </div>
          </Card>

          {/* Care settings */}
          <div>
            <SectionHead title="Care settings" />
            <Card>
              <Link to="/dashboard" search={{ emergencyDefaults: true }} className="block">
                <RecordRow
                  leading={<IconTile tone="pale" icon={<ShieldAlert className="size-5" />} />}
                  title="Emergency defaults"
                  subtitle="Vet, contacts & spend limit — used for every bird."
                />
              </Link>
              <Link to="/scans/settings" className="block">
                <RecordRow
                  leading={<IconTile icon={<Bell className="size-5" />} />}
                  title="Notifications"
                  subtitle="How you hear about scans and updates."
                />
              </Link>
              <Link to="/household" className="block">
                <RecordRow
                  leading={<IconTile icon={<Users className="size-5" />} />}
                  title="Household"
                  subtitle="People who help care for your birds."
                />
              </Link>
              <RecordRow
                onClick={() => setA2hsOpen(true)}
                leading={<IconTile icon={<Smartphone className="size-5" />} />}
                title="Add to home screen"
                subtitle="Open it like an app, get alerts."
                last
              />
            </Card>
          </div>

          {/* Account */}
          <div>
            <SectionHead title="Account" />
            <Card>
              <Link to="/account/security" className="block">
                <RecordRow
                  leading={<IconTile icon={<Lock className="size-5" />} />}
                  title="Password & sign-in"
                  subtitle="Manage how you log in."
                />
              </Link>
              <Link to="/past-birds" className="block">
                <RecordRow
                  leading={<IconTile icon={<Archive className="size-5" />} />}
                  title="Past birds"
                  subtitle="Birds you've handed off — who they were, where they went."
                  last
                />
              </Link>
            </Card>
          </div>

          {/* Legal / meta */}
          <div>
            <SectionHead title="Legal" />
            <Card>
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Kya%20%26%20Co.%20support`} className="block">
                <RecordRow title="Help & support" chevron />
              </a>
              <Link to="/privacy" className="block">
                <RecordRow title="Privacy policy" chevron />
              </Link>
              <Link to="/terms" className="block">
                <RecordRow title="Terms of service" chevron last />
              </Link>
            </Card>
          </div>

          <p className="t-meta text-center">Version {APP_VERSION}</p>

          <PrimaryButton tone="outline" onPress={signOut}>Sign out</PrimaryButton>

          <button
            onClick={() => setDeleteOpen(true)}
            className="block w-full min-h-[44px] py-1 text-center text-[13px] font-[500] text-[var(--red-ink)] active:opacity-70"
          >
            Delete account
          </button>
        </main>
      </div>

      {editOpen && (
        <EditIdentityModal
          userId={userId}
          name={name}
          email={email}
          onName={setName}
          onPendingEmail={setPendingEmail}
          onClose={() => setEditOpen(false)}
        />
      )}
      {a2hsOpen && <AddToHomeModal onClose={() => setA2hsOpen(false)} />}
      {deleteOpen && (
        <DeleteAccountModal
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            await deleteFn();
            await qc.cancelQueries();
            qc.clear();
            await supabase.auth.signOut();
            toast.success("Your account and all data have been deleted.");
            navigate({ to: "/", replace: true });
          }}
        />
      )}
    </div>
  );
}

// ---------- Modals ----------

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-[var(--cream)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-[500] text-[var(--ink)]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-[var(--mute)] hover:bg-black/5">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EditIdentityModal({
  userId, name, email, onName, onPendingEmail, onClose,
}: {
  userId: string | null;
  name: string;
  email: string;
  onName: (v: string) => void;
  onPendingEmail: (v: string | null) => void;
  onClose: () => void;
}) {
  const [nameInput, setNameInput] = useState(name);
  const [emailInput, setEmailInput] = useState(email);
  const [saving, setSaving] = useState(false);

  const nameDirty = nameInput.trim() !== name.trim();
  const emailDirty = emailInput.trim().length > 0 && emailInput.trim().toLowerCase() !== email.toLowerCase();

  async function save() {
    if (!userId || (!nameDirty && !emailDirty)) { onClose(); return; }
    setSaving(true);
    try {
      if (nameDirty) {
        const { error } = await supabase.from("profiles").update({ display_name: nameInput.trim() || null }).eq("id", userId);
        if (error) throw error;
        onName(nameInput.trim());
      }
      if (emailDirty) {
        const next = emailInput.trim().toLowerCase();
        const { error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: `${window.location.origin}/dashboard` });
        if (error) throw error;
        onPendingEmail(next);
        toast.success("Confirmation links sent to your current and new email — both must be confirmed.");
      } else if (nameDirty) {
        toast.success("Name updated.");
      }
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Edit your details" onClose={onClose}>
      <label className="t-eyebrow block text-[var(--mute)]">Name</label>
      <input
        value={nameInput}
        onChange={(e) => setNameInput(e.target.value)}
        placeholder="Your name"
        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--moss)]"
      />
      <label className="t-eyebrow mt-4 block text-[var(--mute)]">Email address</label>
      <input
        type="email"
        value={emailInput}
        onChange={(e) => setEmailInput(e.target.value)}
        placeholder="you@example.com"
        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--moss)]"
      />
      <p className="t-meta mt-1.5">Changing your email sends a confirmation link to both your current and new address. Both must be confirmed.</p>
      <div className="mt-4">
        <PrimaryButton tone="ink" onPress={save} disabled={saving || (!nameDirty && !emailDirty)}>
          {saving ? "Saving…" : "Save changes"}
        </PrimaryButton>
      </div>
    </ModalShell>
  );
}

function DeleteAccountModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => Promise<void> }) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const ready = confirmText.trim().toUpperCase() === "DELETE";

  async function run() {
    if (!ready) return;
    setDeleting(true);
    try {
      await onConfirm();
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete account.");
      setDeleting(false);
    }
  }

  return (
    <ModalShell title="Delete account" onClose={deleting ? () => {} : onClose}>
      <p className="t-body text-[var(--mute)]">
        This permanently deletes your account and <strong className="text-[var(--ink)]">everything in it</strong> — your birds,
        care plans, clips, sits, sitter logs, and your contact record. Sitter links stop working. This cannot be undone.
      </p>
      <label className="t-eyebrow mt-4 block text-[var(--mute)]">Type DELETE to confirm</label>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="DELETE"
        autoCapitalize="characters"
        className="mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--red-line)]"
      />
      <button
        onClick={run}
        disabled={!ready || deleting}
        className="mt-4 w-full min-h-[44px] rounded-[12px] bg-[var(--red-deep)] py-3 text-[15px] font-[500] text-white disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Permanently delete my account"}
      </button>
      <button onClick={onClose} disabled={deleting} className="mt-2 w-full min-h-[44px] py-2 text-center text-[13px] font-[500] text-[var(--mute)] disabled:opacity-50">
        Cancel
      </button>
    </ModalShell>
  );
}
