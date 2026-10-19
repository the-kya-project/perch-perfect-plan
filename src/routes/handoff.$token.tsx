import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/nativeOAuth";
import { getHandoff, acceptHandoff, declineHandoff } from "@/lib/handoff.functions";
import { captureLead } from "@/lib/captureLead";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { InkHero, Card, PrimaryButton, CtaLink } from "@/components/system";
import { friendlyError } from "@/lib/errorMessage";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { useTranslation, Trans } from "react-i18next";
import i18next from "i18next";

// Public handoff-accept screen. Renders for logged-out visitors; the token is
// the access check. Invalid/expired/used → clean message, no data exposed.
export const Route = createFileRoute("/handoff/$token")({
  ssr: false,
  head: () => ({ meta: [
    { title: i18next.t("handoff.pageTitle", "A bird is being handed off to you — Kya & Co.") },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: HandoffAccept,
});

function HandoffAccept() {
  const { t } = useTranslation();
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
      <Shell hero={<InkHero eyebrow={t("handoff.eyebrow", "Bird handoff")} headline={t("handoff.loading", "Loading…")} />}>
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--mute)]"><Loader2 className="size-4 animate-spin" /> {t("handoff.loading", "Loading…")}</div>
      </Shell>
    );
  }

  if (!handoff?.valid) {
    return (
      <Shell hero={<InkHero eyebrow={t("handoff.eyebrow", "Bird handoff")} headline={t("handoff.inactiveHeadline", "This handoff isn't active anymore")} body={t("handoff.askSender", "Ask the sender to start a new one.")} />}>
        <Card className="p-6 text-center">
          <p className="t-body text-[var(--mute)]">{t("handoff.askSender", "Ask the sender to start a new one.")}</p>
          <a href="/" className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-[12px] bg-[var(--ink)] px-[18px] py-[11px] text-[15px] font-[500] text-white">{t("handoff.goToApp", "Go to Kya & Co.")}</a>
        </Card>
      </Shell>
    );
  }

  // The server returns raw names (null when missing); fallbacks are localized here.
  const senderName = handoff.senderName || t("handoff.someone", "Someone");
  const birdName = handoff.birdName ?? t("handoff.thisBird", "this bird");
  const inviteEmail = handoff.recipientEmail.toLowerCase();
  const matches = session?.signedIn && session.email === inviteEmail;
  const wrongAccount = session?.signedIn && session.email !== inviteEmail;

  return (
    <Shell
      hero={
        <InkHero
          eyebrow={t("handoff.eyebrow", "Bird handoff")}
          headline={t("handoff.headline", "{{sender}} is handing {{bird}} to you.", { sender: senderName, bird: birdName })}
          body={t("handoff.body", "So you have everything they learned while caring for {{bird}}.", { bird: birdName })}
        />
      }
    >
      <div className="space-y-5">
        <Card className="p-5">
          <p className="t-eyebrow text-[var(--teal-on-cream)]">{t("handoff.youllReceive", "You'll receive")}</p>
          <ul className="mt-3 space-y-2">
            <Li>{t("handoff.receiveCarePlan", "{{bird}}'s care plan and identity", { bird: birdName })}</Li>
            <Li>{t("handoff.receiveHistory", "Weight history, journal, and moments")}</Li>
            <Li>{t("handoff.receivePhotos", "The photos in those records")}</Li>
          </ul>
        </Card>

        <p className="t-body text-[var(--mute)]">{t("handoff.onceYouAccept", "Once you accept, {{bird}}'s record is yours and {{sender}} no longer has access.", { bird: birdName, sender: senderName })}</p>

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
  const { t } = useTranslation();
  const accept = useServerFn(acceptHandoff);
  const decline = useServerFn(declineHandoff);
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  async function doAccept() {
    setBusy("accept");
    try { await accept({ data: { token } }); toast.success(t("handoff.acceptedToast", "The bird is yours — welcome!")); onDone(); }
    catch (e: any) { toast.error(friendlyError(e, t("handoff.couldNotAccept", "Couldn't accept."))); setBusy(null); }
  }
  async function doDecline() {
    setBusy("decline");
    try { await decline({ data: { token } }); window.location.href = "/"; } catch { setBusy(null); }
  }
  return { busy, doAccept, doDecline };
}

function SignedInAccept({ token, onDone }: { token: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { busy, doAccept, doDecline } = useAcceptDecline(token, onDone);
  return (
    <div className="flex gap-2">
      <div className="flex-1">
        <PrimaryButton tone="outline" disabled={!!busy} onPress={doDecline}>{t("handoff.decline", "Decline")}</PrimaryButton>
      </div>
      <div className="flex-1">
        <PrimaryButton tone="ink" disabled={!!busy} onPress={doAccept}>{busy === "accept" ? t("handoff.accepting", "Accepting…") : t("handoff.accept", "Accept")}</PrimaryButton>
      </div>
    </div>
  );
}

function WrongAccount({ inviteEmail, token }: { inviteEmail: string; token: string }) {
  const { t } = useTranslation();
  async function switchAccount() { await supabase.auth.signOut(); window.location.href = `/handoff/${token}`; }
  return (
    <Card className="bg-[var(--amber-fill)] p-4 ring-[var(--line)]">
      <p className="t-body text-[var(--ink)]"><Trans i18nKey="handoff.wrongAccount" defaults="This handoff was sent to <b>{{email}}</b>, but you're signed in with a different account." values={{ email: inviteEmail }} components={{ b: <span className="font-[500]" /> }} /></p>
      <div className="mt-3">
        <PrimaryButton tone="ink" onPress={switchAccount}>{t("handoff.signOutAndAccept", "Sign out and accept as {{email}}", { email: inviteEmail })}</PrimaryButton>
      </div>
    </Card>
  );
}

function LoggedOutAccept({ token, inviteEmail }: { token: string; inviteEmail: string }) {
  const { t } = useTranslation();
  const { busy, doDecline } = useAcceptDecline(token, () => {});
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const redirect = `${window.location.origin}/handoff/${token}`;

  async function createAndAccept() {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first) { toast.error(t("handoff.enterFirstName", "Enter your first name.")); return; }
    if (password.length < 8) { toast.error(t("handoff.useEightChars", "Use at least 8 characters.")); return; }
    setPending(true);
    try {
      // Store the REAL name so handle_new_user captures it — never the email prefix.
      const fullName = [first, last].filter(Boolean).join(" ");
      const { data, error } = await supabase.auth.signUp({ email: inviteEmail, password, options: { data: { display_name: fullName, full_name: fullName, given_name: first, family_name: last || undefined }, emailRedirectTo: redirect } });
      if (error) { toast.error(authErrorMessage(error)); setPending(false); return; }
      // Land the new account in Brevo with a real name (no marketing consent).
      void captureLead({ email: inviteEmail, firstName: first, lastName: last || undefined, source: "handoff", marketingConsent: false, attribution: null });
      if (data.session) { window.location.href = redirect; return; }
      setConfirmSent(true); setPending(false);
    } catch (e: any) { toast.error(authErrorMessage(e, t("handoff.couldNotCreate", "Couldn't create your account."))); setPending(false); }
  }
  async function google() {
    try { await signInWithGoogle(redirect); }
    catch (e: any) { toast.error(authErrorMessage(e, t("handoff.googleFailed", "Google sign-in failed."))); }
  }

  if (confirmSent) {
    return (
      <Card className="p-5 text-center">
        <h2 className="t-section">{t("handoff.confirmToFinish", "Confirm your email to finish")}</h2>
        <p className="t-body mt-2 text-[var(--mute)]"><Trans i18nKey="handoff.confirmSentBody" defaults="We sent a confirmation link to <b>{{email}}</b>. Open it and you'll come right back here to accept." values={{ email: inviteEmail }} components={{ b: <span className="font-[500]" /> }} /></p>
      </Card>
    );
  }
  if (!creating) {
    return (
      <div className="space-y-2">
        <PrimaryButton tone="lime" onPress={() => setCreating(true)}>{t("handoff.acceptAndCreate", "Accept & create account")}</PrimaryButton>
        <PrimaryButton tone="outline" disabled={!!busy} onPress={doDecline}>{t("handoff.decline", "Decline")}</PrimaryButton>
      </div>
    );
  }
  return (
    <Card className="space-y-3 p-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="t-eyebrow mb-1 block text-[var(--mute)]">{t("handoff.firstName", "First name")}</span><input className="input" value={firstName} maxLength={60} onChange={(e) => setFirstName(e.target.value)} placeholder={t("handoff.firstNamePlaceholder", "Brittany")} autoComplete="given-name" /></label>
        <label className="block"><span className="t-eyebrow mb-1 block text-[var(--mute)]">{t("handoff.lastName", "Last name")}</span><input className="input" value={lastName} maxLength={60} onChange={(e) => setLastName(e.target.value)} placeholder={t("handoff.lastNamePlaceholder", "King")} autoComplete="family-name" /></label>
      </div>
      <label className="block"><span className="t-eyebrow mb-1 block text-[var(--mute)]">{t("handoff.email", "Email")}</span><input className="input" value={inviteEmail} readOnly disabled /></label>
      <label className="block"><span className="t-eyebrow mb-1 block text-[var(--mute)]">{t("handoff.createPassword", "Create a password")}</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("handoff.passwordPlaceholder", "At least 8 characters")} autoComplete="new-password" /></label>
      <PrimaryButton tone="ink" type="button" disabled={pending} onPress={createAndAccept}>{pending ? t("handoff.creating", "Creating…") : t("handoff.createAndAccept", "Create account & accept")}</PrimaryButton>
      <div className="t-eyebrow flex items-center gap-3 text-[var(--mute2)]"><div className="h-px flex-1 bg-[var(--line)]" /> {t("handoff.or", "or")} <div className="h-px flex-1 bg-[var(--line)]" /></div>
      <PrimaryButton tone="outline" onPress={google}>{t("handoff.continueWithGoogle", "Continue with Google")}</PrimaryButton>
    </Card>
  );
}
