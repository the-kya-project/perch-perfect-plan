import { createFileRoute, Link, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { deleteMyAccount } from "@/lib/account.functions";
import { APP_VERSION } from "@/lib/version";
import { OwnerTabBar } from "@/components/OwnerTabBar";
import {
  ArrowLeft, ChevronRight, ShieldAlert, Bell, Smartphone, Lock, X, Share, Plus, MoreVertical,
} from "lucide-react";
import { toast } from "sonner";

// Support inbox for the "Help & support" row. If this address changes, update it
// here (and ideally point it at a monitored mailbox).
const SUPPORT_EMAIL = "support@thekyaproject.com";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({ meta: [{ title: "Account — Parrot Care Co-Pilot" }] }),
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
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <header className="bg-[#1a3d2e] pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 pb-5 pt-1">
          <button onClick={goBack} aria-label="Back" className="-ml-1 rounded-full p-1.5 text-white hover:bg-white/10">
            <ArrowLeft className="size-6" />
          </button>
          <h1 className="text-[27px] font-medium leading-tight text-white">Account</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-5 pt-5">
        {/* Identity */}
        <section className="rounded-[20px] bg-[#efe9da] p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-14 shrink-0 place-items-center rounded-full bg-[#1a3d2e] text-xl font-medium text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium text-[#1a3d2e]">{name.trim() || "Your name"}</p>
              <p className="truncate text-xs text-[#5f5e5a]">{email}</p>
              {emailPending && (
                <p className="mt-0.5 truncate text-[11px] text-[#84600f]">Change to {pendingEmail} pending — confirm the emailed links.</p>
              )}
            </div>
            <button onClick={() => setEditOpen(true)} className="shrink-0 text-sm font-medium text-[#1a3d2e] underline">Edit</button>
          </div>
        </section>

        {/* Care settings */}
        <div>
          <GroupLabel>Care settings</GroupLabel>
          <div className="overflow-hidden rounded-[20px] bg-[#efe9da]">
            <Link to="/dashboard" search={{ emergencyDefaults: true }}>
              <Row
                icon={ShieldAlert} iconBg="#d6e8dc" iconColor="#1a5e3f" emphasized
                title="Emergency defaults"
                desc="Vet, contacts & spend limit — used for every bird."
              />
            </Link>
            <Divider />
            <Link to="/notifications/settings">
              <Row icon={Bell} title="Notifications" desc="How you hear about scans and updates." />
            </Link>
            <Divider />
            <button type="button" onClick={() => setA2hsOpen(true)} className="block w-full text-left">
              <Row icon={Smartphone} title="Add to home screen" desc="Open it like an app, get alerts." />
            </button>
          </div>
        </div>

        {/* Account */}
        <div>
          <GroupLabel>Account</GroupLabel>
          <div className="overflow-hidden rounded-[20px] bg-[#efe9da]">
            <Link to="/account/security">
              <Row icon={Lock} title="Password & sign-in" desc="Manage how you log in." />
            </Link>
          </div>
        </div>

        {/* Legal / meta */}
        <div className="overflow-hidden rounded-[20px] bg-[#efe9da]">
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Parrot%20Care%20Co-Pilot%20support`}>
            <SimpleRow title="Help & support" />
          </a>
          <Divider />
          <Link to="/privacy"><SimpleRow title="Privacy policy" /></Link>
          <Divider />
          <Link to="/terms"><SimpleRow title="Terms of service" /></Link>
        </div>

        <p className="text-center text-xs text-[#a8a596]">Version {APP_VERSION}</p>

        <button
          onClick={signOut}
          className="w-full rounded-[16px] border border-[#d8cfb8] bg-[#efe9da] py-3 text-sm font-medium text-[#1a3d2e] active:scale-[.99]"
        >
          Sign out
        </button>

        <button
          onClick={() => setDeleteOpen(true)}
          className="block w-full py-1 text-center text-sm font-medium text-[#993C1D]"
        >
          Delete account
        </button>
      </main>

      <OwnerTabBar />

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

// ---------- Rows ----------

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wider text-[#8a897f]">{children}</p>;
}

function Divider() {
  return <div className="h-px bg-[#e3dcc9]" />;
}

function Row({
  icon: Icon, title, desc, iconBg = "#e8f0ec", iconColor = "#2d6a4f", emphasized = false,
}: {
  icon: typeof Bell; title: string; desc: string; iconBg?: string; iconColor?: string; emphasized?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3.5 ${emphasized ? "bg-[#f0ede1]" : ""}`}>
      <div className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: iconBg }}>
        <Icon className="size-5" style={{ color: iconColor }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[#1a3d2e]">{title}</p>
        <p className="text-xs leading-snug text-[#5f5e5a]">{desc}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-[#a8a596]" />
    </div>
  );
}

function SimpleRow({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <p className="text-sm font-medium text-[#1a3d2e]">{title}</p>
      <ChevronRight className="size-4 shrink-0 text-[#a8a596]" />
    </div>
  );
}

// ---------- Modals ----------

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-[#f4f1e8] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#1a3d2e]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-[#5f5e5a] hover:bg-black/5">
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
      <label className="block text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">Name</label>
      <input
        value={nameInput}
        onChange={(e) => setNameInput(e.target.value)}
        placeholder="Your name"
        className="mt-1 w-full rounded-xl border border-[#d8cfb8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2d6a4f]"
      />
      <label className="mt-4 block text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">Email address</label>
      <input
        type="email"
        value={emailInput}
        onChange={(e) => setEmailInput(e.target.value)}
        placeholder="you@example.com"
        className="mt-1 w-full rounded-xl border border-[#d8cfb8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#2d6a4f]"
      />
      <p className="mt-1.5 text-xs text-[#5f5e5a]">Changing your email sends a confirmation link to both your current and new address. Both must be confirmed.</p>
      <button
        onClick={save}
        disabled={saving || (!nameDirty && !emailDirty)}
        className="mt-4 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </ModalShell>
  );
}

function AddToHomeModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Add to home screen" onClose={onClose}>
      <p className="text-sm text-[#5f5e5a]">Install Parrot Care Co-Pilot to open it like an app and receive alerts.</p>
      <div className="mt-4 space-y-4">
        <div className="rounded-2xl bg-[#efe9da] p-4">
          <p className="text-sm font-medium text-[#1a3d2e]">iPhone &amp; iPad (Safari)</p>
          <ol className="mt-2 space-y-1.5 text-sm text-[#5f5e5a]">
            <li className="flex items-center gap-2"><Share className="size-4 shrink-0 text-[#2d6a4f]" /> Tap the Share button.</li>
            <li className="flex items-center gap-2"><Plus className="size-4 shrink-0 text-[#2d6a4f]" /> Choose “Add to Home Screen.”</li>
            <li>Tap “Add” to confirm.</li>
          </ol>
        </div>
        <div className="rounded-2xl bg-[#efe9da] p-4">
          <p className="text-sm font-medium text-[#1a3d2e]">Android (Chrome)</p>
          <ol className="mt-2 space-y-1.5 text-sm text-[#5f5e5a]">
            <li className="flex items-center gap-2"><MoreVertical className="size-4 shrink-0 text-[#2d6a4f]" /> Tap the menu (three dots).</li>
            <li className="flex items-center gap-2"><Plus className="size-4 shrink-0 text-[#2d6a4f]" /> Choose “Add to Home screen” / “Install app.”</li>
            <li>Tap “Add” / “Install” to confirm.</li>
          </ol>
        </div>
      </div>
      <button onClick={onClose} className="mt-4 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white">Got it</button>
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
      <p className="text-sm text-[#5f5e5a]">
        This permanently deletes your account and <strong className="text-[#1a3d2e]">everything in it</strong> — your birds,
        care plans, clips, sits, sitter logs, and your contact record. Sitter links stop working. This cannot be undone.
      </p>
      <label className="mt-4 block text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">Type DELETE to confirm</label>
      <input
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="DELETE"
        autoCapitalize="characters"
        className="mt-1 w-full rounded-xl border border-[#d8cfb8] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#993C1D]"
      />
      <button
        onClick={run}
        disabled={!ready || deleting}
        className="mt-4 w-full rounded-[14px] bg-[#993C1D] py-3 text-sm font-medium text-white disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Permanently delete my account"}
      </button>
      <button onClick={onClose} disabled={deleting} className="mt-2 w-full py-2 text-center text-sm font-medium text-[#5f5e5a] disabled:opacity-50">
        Cancel
      </button>
    </ModalShell>
  );
}
