import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getHandoff, acceptHandoff, declineHandoff } from "@/lib/handoff.functions";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { InkHero, Card, PrimaryButton, CtaLink } from "@/components/system";

// Public handoff-accept screen. Renders for logged-out visitors; the token is
// the access check. Invalid/expired/used → clean message, no data exposed.
export const Route = createFileRoute("/handoff/$token")({
  ssr: false,
  head: () => ({ meta: [
    { title: "A bird is being handed off to you — Parrot Care Co-Pilot" },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: HandoffAccept,
});

function HandoffAccept() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const getH = useServerFn(getHandoff);
  const { data: handoff, isLoading } = useQuery({ queryKey: ["handoff", token], queryFn: () => getH({ data: { token } }), retry: false });
  const { data: session } = useQuery({
    queryKey: ["handoff-session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return { email: data.session?.user?.email?.toLowerCase() ?? null, signedIn: !!data.session };
    },
  });

  if (isLoading) {
    return (
      <Shell hero={<InkHero eyebrow="Bird handoff" headline="Loading…" />}>
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--mute)]"><Loader2 className="size-4 animate-spin" /> Loading…</div>
      </Shell>
    );
  }

  if (!handoff?.valid) {
    return (
      <Shell hero={<InkHero eyebrow="Bird handoff" headline="This handoff isn't active anymore" body="Ask the sender to start a new one." />}>
        <Card className="p-6 text-center">
          <p className="t-body text-[var(--mute)]">Ask the sender to start a new one.</p>
          <a href="/" className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-[12px] bg-[var(--ink)] px-[18px] py-[11px] text-[15px] font-[500] text-white">Go to Parrot Care</a>
        </Card>
      </Shell>
    );
  }

  const inviteEmail = handoff.recipientEmail.toLowerCase();
  const matches = session?.signedIn && session.email === inviteEmail;
  const wrongAccount = session?.signedIn && session.email !== inviteEmail;

  return (
    <Shell
      hero={
        <InkHero
          eyebrow="Bird handoff"
          headline={`${handoff.senderName} is handing ${handoff.birdName} to you.`}
          body={`So you have everything they learned while caring for ${handoff.birdName}.`}
        />
      }
    >
      <div className="space-y-5">
        <Card className="p-5">
          <p className="t-eyebrow text-[var(--moss)]">You'll receive</p>
          <ul className="mt-3 space-y-2">
            <Li>{handoff.birdName}'s care plan and identity</Li>
            <Li>Weight history, journal, and moments</Li>
            <Li>The photos in those records</Li>
          </ul>
        </Card>

        <p className="t-body text-[var(--mute)]">Once you accept, {handoff.birdName}'s record is yours and {handoff.senderName} no longer has access.</p>

        {wrongAccount ? (
          <WrongAccount inviteEmail={handoff.recipientEmail} token={token} />
        ) : matches ? (
          <SignedInAccept token={token} onDone={() => navigate({ to: "/dashboard" })} />
        ) : (
          <LoggedOutAccept token={token} inviteEmail={handoff.recipientEmail} />
        )}
      </div>
    </Shell>
  );
}

function Shell({ hero, children }: { hero: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[var(--cream)]">
      <div className="mx-auto max-w-md">
        {hero}
        <main className="px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
function Li({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2 t-body text-[var(--ink)]"><Check className="mt-0.5 size-4 shrink-0 text-[var(--moss)]" /><span>{children}</span></li>;
}

function useAcceptDecline(token: string, onDone: () => void) {
  const accept = useServerFn(acceptHandoff);
  const decline = useServerFn(declineHandoff);
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  async function doAccept() {
    setBusy("accept");
    try { await accept({ data: { token } }); toast.success("The bird is yours — welcome!"); onDone(); }
    catch (e: any) { toast.error(e?.message ?? "Couldn't accept."); setBusy(null); }
  }
  async function doDecline() {
    setBusy("decline");
    try { await decline({ data: { token } }); window.location.href = "/"; } catch { setBusy(null); }
  }
  return { busy, doAccept, doDecline };
}

function SignedInAccept({ token, onDone }: { token: string; onDone: () => void }) {
  const { busy, doAccept, doDecline } = useAcceptDecline(token, onDone);
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <PrimaryButton tone="outline" disabled={!!busy} onPress={doDecline}>Decline</PrimaryButton>
      </div>
      <div className="flex-1">
        <PrimaryButton tone="ink" disabled={!!busy} onPress={doAccept}>{busy === "accept" ? "Accepting…" : "Accept"}</PrimaryButton>
      </div>
    </div>
  );
}

function WrongAccount({ inviteEmail, token }: { inviteEmail: string; token: string }) {
  async function switchAccount() { await supabase.auth.signOut(); window.location.href = `/handoff/${token}`; }
  return (
    <Card className="bg-[var(--amber-fill)] p-4 ring-[var(--line)]">
      <p className="t-body text-[var(--ink)]">This handoff was sent to <span className="font-[500]">{inviteEmail}</span>, but you're signed in with a different account.</p>
      <div className="mt-3">
        <PrimaryButton tone="ink" onPress={switchAccount}>Sign out and accept as {inviteEmail}</PrimaryButton>
      </div>
    </Card>
  );
}

function LoggedOutAccept({ token, inviteEmail }: { token: string; inviteEmail: string }) {
  const { busy, doDecline } = useAcceptDecline(token, () => {});
  const [creating, setCreating] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const redirect = `${window.location.origin}/handoff/${token}`;

  async function createAndAccept() {
    if (password.length < 8) { toast.error("Use at least 8 characters."); return; }
    setPending(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: inviteEmail, password, options: { data: { display_name: inviteEmail.split("@")[0] }, emailRedirectTo: redirect } });
      if (error) { toast.error(error.message); setPending(false); return; }
      if (data.session) { window.location.href = redirect; return; }
      setConfirmSent(true); setPending(false);
    } catch (e: any) { toast.error(e?.message ?? "Couldn't create your account."); setPending(false); }
  }
  async function google() { await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect } }); }

  if (confirmSent) {
    return (
      <Card className="p-5 text-center">
        <h2 className="t-section">Confirm your email to finish</h2>
        <p className="t-body mt-2 text-[var(--mute)]">We sent a confirmation link to <span className="font-[500]">{inviteEmail}</span>. Open it and you'll come right back here to accept.</p>
      </Card>
    );
  }
  if (!creating) {
    return (
      <div className="space-y-2">
        <PrimaryButton tone="lime" onPress={() => setCreating(true)}>Accept &amp; create account</PrimaryButton>
        <PrimaryButton tone="outline" disabled={!!busy} onPress={doDecline}>Decline</PrimaryButton>
      </div>
    );
  }
  return (
    <Card className="space-y-3 p-5">
      <label className="block"><span className="t-eyebrow mb-1 block text-[var(--mute)]">Email</span><input className="input" value={inviteEmail} readOnly disabled /></label>
      <label className="block"><span className="t-eyebrow mb-1 block text-[var(--mute)]">Create a password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /></label>
      <PrimaryButton tone="ink" type="button" disabled={pending} onPress={createAndAccept}>{pending ? "Creating…" : "Create account & accept"}</PrimaryButton>
      <div className="t-eyebrow flex items-center gap-3 text-[var(--mute2)]"><div className="h-px flex-1 bg-[var(--line)]" /> or <div className="h-px flex-1 bg-[var(--line)]" /></div>
      <PrimaryButton tone="outline" onPress={google}>Continue with Google</PrimaryButton>
    </Card>
  );
}
