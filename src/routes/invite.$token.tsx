import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { getHouseholdInvite, acceptHouseholdInvite, declineHouseholdInvite } from "@/lib/household.functions";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { InkHero, Card, PrimaryButton, CtaLink } from "@/components/system";
import { BrandLockup } from "@/components/BrandLogo";

// Public household-invite accept screen. Renders for logged-out visitors too;
// the token is the access check. Never reveals bird/owner data for an
// invalid/expired/used token.
export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({ meta: [
    { title: "You're invited — Kya & Co." },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: InviteAccept,
});

function InviteAccept() {
  const { token } = Route.useParams();
  const navigate = useNavigate();

  const getInvite = useServerFn(getHouseholdInvite);
  const { data: invite, isLoading } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => getInvite({ data: { token } }),
    retry: false,
  });

  // Current session (to decide one-tap vs create-account).
  const { data: session } = useQuery({
    queryKey: ["invite-session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return { email: data.session?.user?.email?.toLowerCase() ?? null, signedIn: !!data.session };
    },
  });

  if (isLoading) {
    return (
      <Shell eyebrow="Household invite" headline="Loading your invite…">
        <Card className="p-6">
          <div className="flex items-center justify-center gap-2 py-4 text-[14px] text-[var(--mute)]">
            <Loader2 className="size-4 animate-spin" /> Loading your invite…
          </div>
        </Card>
      </Shell>
    );
  }

  if (!invite?.valid) {
    return (
      <Shell eyebrow="Household invite" headline="This invite isn't active anymore." body="Ask the owner to send you a new one.">
        <Card className="p-6 text-center">
          <p className="t-body text-[var(--ink2)]">This link has expired or already been used. Ask the owner to send you a new one.</p>
          <div className="mt-5">
            <a href="/"><PrimaryButton tone="ink">Go to Kya & Co.</PrimaryButton></a>
          </div>
        </Card>
      </Shell>
    );
  }

  const inviteEmail = invite.inviteeEmail.toLowerCase();
  const matches = session?.signedIn && session.email === inviteEmail;
  const wrongAccount = session?.signedIn && session.email !== inviteEmail;

  return (
    <Shell
      eyebrow="Household invite"
      headline={`${invite.inviterName} shared ${invite.birdNames} with you.`}
      body="Join the household to help care for them."
    >
      <div className="space-y-5">
        <Card className="p-5">
          <p className="t-eyebrow text-[var(--moss)]">You'll be able to</p>
          <ul className="mt-3 space-y-2.5">
            <Li>See each bird's care plan, weight, journal, identity, and health scans</Li>
            <Li>Log weights, journal entries, and daily health scans</Li>
            <Li>Help care for {invite.birdNames} alongside {invite.inviterName}</Li>
          </ul>
        </Card>

        <p className="t-meta leading-relaxed">
          {invite.inviterName} stays the owner — you can't change the care plan or who has access, and you can leave the household any time.
        </p>

        {wrongAccount ? (
          <WrongAccount inviteEmail={invite.inviteeEmail} token={token} />
        ) : matches ? (
          <SignedInAccept token={token} onDone={() => navigate({ to: "/dashboard" })} />
        ) : (
          <LoggedOutAccept token={token} inviteEmail={invite.inviteeEmail} onDone={() => navigate({ to: "/dashboard" })} />
        )}
      </div>
    </Shell>
  );
}

function Shell({ eyebrow, headline, body, children }: { eyebrow: string; headline: string; body?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[var(--cream)]">
      <div className="flex justify-center bg-[var(--ink)] pt-[max(env(safe-area-inset-top),24px)]">
        <BrandLockup orientation="stacked" variant="ink" size={220} />
      </div>
      <InkHero eyebrow={eyebrow} headline={headline} body={body} />
      <main className="mx-auto max-w-md px-5 py-6">{children}</main>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <Check className="mt-0.5 size-4 shrink-0 text-[var(--moss)]" />
      <span className="t-body text-[var(--ink)]">{children}</span>
    </li>
  );
}

function useAcceptDecline(token: string, onDone: () => void) {
  const accept = useServerFn(acceptHouseholdInvite);
  const decline = useServerFn(declineHouseholdInvite);
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  async function doAccept() {
    setBusy("accept");
    try {
      await accept({ data: { token } });
      toast.success("You're in — welcome to the household.");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't accept the invite.");
      setBusy(null);
    }
  }
  async function doDecline() {
    setBusy("decline");
    try {
      await decline({ data: { token } });
      window.location.href = "/";
    } catch {
      setBusy(null);
    }
  }
  return { busy, doAccept, doDecline };
}

function SignedInAccept({ token, onDone }: { token: string; onDone: () => void }) {
  const { busy, doAccept, doDecline } = useAcceptDecline(token, onDone);
  return (
    <div className="flex gap-2">
      <PrimaryButton tone="outline" disabled={!!busy} onPress={doDecline}>
        Decline
      </PrimaryButton>
      <PrimaryButton tone="lime" disabled={!!busy} onPress={doAccept}>
        {busy === "accept" ? "Joining…" : "Accept"}
      </PrimaryButton>
    </div>
  );
}

function WrongAccount({ inviteEmail, token }: { inviteEmail: string; token: string }) {
  async function switchAccount() {
    await supabase.auth.signOut();
    // Reload the invite screen logged-out so they can accept as the invite email.
    window.location.href = `/invite/${token}`;
  }
  return (
    <Card className="p-4">
      <p className="t-body text-[var(--ink)]">
        This invite was sent to <span className="font-[500]">{inviteEmail}</span>, but you're signed in with a different account.
      </p>
      <div className="mt-3">
        <PrimaryButton tone="ink" onPress={switchAccount}>
          Sign out and accept as {inviteEmail}
        </PrimaryButton>
      </div>
    </Card>
  );
}

function LoggedOutAccept({ token, inviteEmail, onDone }: { token: string; inviteEmail: string; onDone: () => void }) {
  const { busy, doDecline } = useAcceptDecline(token, onDone);
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const redirect = `${window.location.origin}/invite/${token}`;

  async function createAndAccept() {
    if (password.length < 8) { toast.error("Use at least 8 characters."); return; }
    setPending(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: inviteEmail,
        password,
        options: { data: { display_name: inviteEmail.split("@")[0] }, emailRedirectTo: redirect },
      });
      if (error) { toast.error(error.message); setPending(false); return; }
      if (data.session) {
        // Confirmation disabled → reload so the screen sees the matching
        // session and offers one-tap Accept.
        window.location.href = redirect;
        return;
      }
      // Email confirmation required: they'll return to this screen after clicking
      // the link (now signed-in with a matching email) and can tap Accept.
      setConfirmSent(true);
      setPending(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't create your account.");
      setPending(false);
    }
  }

  async function google() {
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect } });
  }

  if (confirmSent) {
    return (
      <Card className="p-5 text-center">
        <h2 className="t-section">Confirm your email to finish</h2>
        <p className="t-body mt-2 text-[var(--ink2)]">
          We sent a confirmation link to <span className="font-[500]">{inviteEmail}</span>. Open it and you'll come right back here to join the household.
        </p>
      </Card>
    );
  }

  if (!creating) {
    return (
      <div className="space-y-2">
        <PrimaryButton tone="lime" onPress={() => setCreating(true)}>
          Accept &amp; create account
        </PrimaryButton>
        <PrimaryButton tone="outline" disabled={!!busy} onPress={doDecline}>
          Decline
        </PrimaryButton>
      </div>
    );
  }

  return (
    <Card className="space-y-3 p-5">
      <label className="block">
        <span className="t-eyebrow mb-1 block text-[var(--mute)]">Email</span>
        <input className="input" value={inviteEmail} readOnly disabled />
      </label>
      <label className="block">
        <span className="t-eyebrow mb-1 block text-[var(--mute)]">Create a password</span>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" />
      </label>
      <PrimaryButton tone="ink" type="button" disabled={pending} onPress={createAndAccept}>
        {pending ? "Creating…" : "Create account & accept"}
      </PrimaryButton>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-[var(--mute2)]">
        <div className="h-px flex-1 bg-[var(--line)]" /> or <div className="h-px flex-1 bg-[var(--line)]" />
      </div>
      <PrimaryButton tone="outline" onPress={google}>
        Continue with Google
      </PrimaryButton>
      <style>{`.input:disabled{background:var(--cream);color:var(--mute)}`}</style>
    </Card>
  );
}
