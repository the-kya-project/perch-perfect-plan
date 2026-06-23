import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getHandoff, acceptHandoff, declineHandoff } from "@/lib/handoff.functions";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";

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

  if (isLoading) return <Shell><div className="flex items-center justify-center gap-2 py-10 text-sm text-[#5f5e5a]"><Loader2 className="size-4 animate-spin" /> Loading…</div></Shell>;

  if (!handoff?.valid) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-[#e3dcc9]">
          <h1 className="text-lg font-medium text-[#1a3d2e]">This handoff isn't active anymore</h1>
          <p className="mt-2 text-sm text-[#5f5e5a]">Ask the sender to start a new one.</p>
          <a href="/" className="mt-5 inline-block rounded-xl bg-[#1a3d2e] px-4 py-2.5 text-sm font-medium text-white">Go to Parrot Care</a>
        </div>
      </Shell>
    );
  }

  const inviteEmail = handoff.recipientEmail.toLowerCase();
  const matches = session?.signedIn && session.email === inviteEmail;
  const wrongAccount = session?.signedIn && session.email !== inviteEmail;

  return (
    <Shell>
      <div className="space-y-5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#5f5e5a]">Bird handoff</p>
          <h1 className="mt-1 text-2xl font-medium leading-tight text-[#1a3d2e]">{handoff.senderName} is handing off {handoff.birdName} to you</h1>
          <p className="mt-2 text-sm text-[#5f5e5a]">So you have everything they learned while caring for {handoff.birdName}.</p>
        </div>

        <div className="rounded-2xl bg-white p-5 ring-1 ring-[#e3dcc9]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5a]">You'll receive</p>
          <ul className="mt-3 space-y-2 text-sm text-[#1a3d2e]">
            <Li>{handoff.birdName}'s care plan and identity</Li>
            <Li>Weight history, journal, and moments</Li>
            <Li>The photos in those records</Li>
          </ul>
        </div>

        <p className="text-xs leading-relaxed text-[#5f5e5a]">Once you accept, {handoff.birdName}'s record is yours and {handoff.senderName} no longer has access.</p>

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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#f4f1e8]">
      <header className="border-b border-[#e3ded0] px-5 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="mx-auto flex max-w-md items-center gap-2.5">
          <img src="/kya_parrot_icon_teal.png" alt="" className="size-8 object-contain" />
          <div className="leading-tight">
            <div className="text-sm font-medium tracking-tight text-[#1a3d2e]">Parrot Care Co-Pilot</div>
            <div className="text-[11px] text-[#5f5e5a]">by The Kya Project</div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-md px-5 py-6">{children}</main>
    </div>
  );
}
function Li({ children }: { children: React.ReactNode }) {
  return <li className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[#2d8a5d]" /><span>{children}</span></li>;
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
      <button type="button" disabled={!!busy} onClick={doDecline} className="min-h-[48px] flex-1 rounded-xl border border-[#c8bfa6] text-sm font-medium text-[#1a3d2e] disabled:opacity-50">Decline</button>
      <button type="button" disabled={!!busy} onClick={doAccept} className="min-h-[48px] flex-1 rounded-xl bg-[#1a3d2e] text-sm font-medium text-white disabled:opacity-50">{busy === "accept" ? "Accepting…" : "Accept"}</button>
    </div>
  );
}

function WrongAccount({ inviteEmail, token }: { inviteEmail: string; token: string }) {
  async function switchAccount() { await supabase.auth.signOut(); window.location.href = `/handoff/${token}`; }
  return (
    <div className="rounded-2xl bg-[#f6e7c4]/40 p-4 ring-1 ring-[#e3dcc9]">
      <p className="text-sm text-[#1a3d2e]">This handoff was sent to <span className="font-medium">{inviteEmail}</span>, but you're signed in with a different account.</p>
      <button type="button" onClick={switchAccount} className="mt-3 min-h-[44px] w-full rounded-xl bg-[#1a3d2e] text-sm font-medium text-white">Sign out and accept as {inviteEmail}</button>
    </div>
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
      <div className="rounded-2xl bg-white p-5 text-center ring-1 ring-[#e3dcc9]">
        <h2 className="text-base font-medium text-[#1a3d2e]">Confirm your email to finish</h2>
        <p className="mt-2 text-sm text-[#5f5e5a]">We sent a confirmation link to <span className="font-medium">{inviteEmail}</span>. Open it and you'll come right back here to accept.</p>
      </div>
    );
  }
  if (!creating) {
    return (
      <div className="space-y-2">
        <button type="button" onClick={() => setCreating(true)} className="min-h-[48px] w-full rounded-xl bg-[#1a3d2e] text-sm font-medium text-white">Accept &amp; create account</button>
        <button type="button" disabled={!!busy} onClick={doDecline} className="min-h-[48px] w-full rounded-xl border border-[#c8bfa6] text-sm font-medium text-[#1a3d2e] disabled:opacity-50">Decline</button>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-2xl bg-white p-5 ring-1 ring-[#e3dcc9]">
      <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5f5e5a]">Email</span><input className="input" value={inviteEmail} readOnly disabled /></label>
      <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5f5e5a]">Create a password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /></label>
      <button type="button" disabled={pending} onClick={createAndAccept} className="min-h-[48px] w-full rounded-xl bg-[#1a3d2e] text-sm font-medium text-white disabled:opacity-50">{pending ? "Creating…" : "Create account & accept"}</button>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-[#8a897f]"><div className="h-px flex-1 bg-[#e3dcc9]" /> or <div className="h-px flex-1 bg-[#e3dcc9]" /></div>
      <button type="button" onClick={google} className="min-h-[48px] w-full rounded-xl border border-[#c8bfa6] bg-white text-sm font-medium text-[#1a3d2e]">Continue with Google</button>
      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:disabled{background:#f4f1e8;color:#5f5e5a}`}</style>
    </div>
  );
}
