import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { signInWithGoogle } from "@/lib/nativeOAuth";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { joinNamesDisplay } from "@/lib/i18n/joinNames";
import { getHouseholdInvite, acceptHouseholdInvite, declineHouseholdInvite } from "@/lib/household.functions";
import { captureLead } from "@/lib/captureLead";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { InkHero, Card, PrimaryButton, CtaLink } from "@/components/system";
import { friendlyError } from "@/lib/errorMessage";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { useTranslation, Trans } from "react-i18next";
import i18next from "i18next";

// Public household-invite accept screen. Renders for logged-out visitors too;
// the token is the access check. Never reveals bird/owner data for an
// invalid/expired/used token.
export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({ meta: [
    { title: i18next.t("invite.pageTitle", "You're invited — Kya & Co.") },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: InviteAccept,
});

function InviteAccept() {
  const { t } = useTranslation();
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
      <Shell eyebrow={t("invite.eyebrow", "Household invite")} headline={t("invite.loading", "Loading your invite…")}>
        <Card className="p-6">
          <div className="flex items-center justify-center gap-2 py-4 text-[14px] text-[var(--mute)]">
            <Loader2 className="size-4 animate-spin" /> {t("invite.loading", "Loading your invite…")}
          </div>
        </Card>
      </Shell>
    );
  }

  if (!invite?.valid) {
    return (
      <Shell eyebrow={t("invite.eyebrow", "Household invite")} headline={t("invite.inactiveHeadline", "This invite isn't active anymore.")} body={t("invite.askForNew", "Ask the owner to send you a new one.")}>
        <Card className="p-6 text-center">
          <p className="t-body text-[var(--ink2)]">{t("invite.expiredBody", "This link has expired or already been used. Ask the owner to send you a new one.")}</p>
          <div className="mt-5">
            <a href="/"><PrimaryButton tone="ink">{t("invite.goToApp", "Go to Kya & Co.")}</PrimaryButton></a>
          </div>
        </Card>
      </Shell>
    );
  }

  // The server returns raw data; join the names and localize the fallback here.
  const inviterName = invite.inviterName || t("invite.anOwner", "An owner");
  const birdNames = joinNamesDisplay(invite.birdNames, "bird", t);
  const inviteEmail = invite.inviteeEmail.toLowerCase();
  const matches = session?.signedIn && session.email === inviteEmail;
  const wrongAccount = session?.signedIn && session.email !== inviteEmail;

  return (
    <Shell
      eyebrow={t("invite.eyebrow", "Household invite")}
      headline={t("invite.sharedWithYou", "{{inviter}} shared {{birds}} with you.", { inviter: inviterName, birds: birdNames })}
      body={t("invite.joinBody", "Join the household to help care for them.")}
    >
      <div className="space-y-5">
        <Card className="p-5">
          <p className="t-eyebrow text-[var(--teal-on-cream)]">{t("invite.youllBeAbleTo", "You'll be able to")}</p>
          <ul className="mt-3 space-y-2.5">
            <Li>{t("invite.canSee", "See each bird's care plan, weight, journal, identity, and health checks")}</Li>
            <Li>{t("invite.canLog", "Log weights, journal entries, and daily health checks")}</Li>
            <Li>{t("invite.canHelp", "Help care for {{birds}} alongside {{inviter}}", { birds: birdNames, inviter: inviterName })}</Li>
          </ul>
        </Card>

        <p className="t-meta leading-relaxed">
          {t("invite.staysOwner", "{{inviter}} stays the owner — you can't change the care plan or who has access, and you can leave the household any time.", { inviter: inviterName })}
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
  const { t } = useTranslation();
  const accept = useServerFn(acceptHouseholdInvite);
  const decline = useServerFn(declineHouseholdInvite);
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  async function doAccept() {
    setBusy("accept");
    try {
      await accept({ data: { token } });
      toast.success(t("invite.acceptedToast", "You're in — welcome to the household."));
      onDone();
    } catch (e: any) {
      toast.error(friendlyError(e, t("invite.couldNotAccept", "Couldn't accept the invite.")));
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
  const { t } = useTranslation();
  const { busy, doAccept, doDecline } = useAcceptDecline(token, onDone);
  return (
    <div className="flex gap-2">
      <PrimaryButton tone="outline" disabled={!!busy} onPress={doDecline}>
        {t("invite.decline", "Decline")}
      </PrimaryButton>
      <PrimaryButton tone="lime" disabled={!!busy} onPress={doAccept}>
        {busy === "accept" ? t("invite.joining", "Joining…") : t("invite.accept", "Accept")}
      </PrimaryButton>
    </div>
  );
}

function WrongAccount({ inviteEmail, token }: { inviteEmail: string; token: string }) {
  const { t } = useTranslation();
  async function switchAccount() {
    await supabase.auth.signOut();
    // Reload the invite screen logged-out so they can accept as the invite email.
    window.location.href = `/invite/${token}`;
  }
  return (
    <Card className="p-4">
      <p className="t-body text-[var(--ink)]">
        <Trans
          i18nKey="invite.wrongAccount"
          defaults="This invite was sent to <b>{{email}}</b>, but you're signed in with a different account."
          values={{ email: inviteEmail }}
          components={{ b: <span className="font-[500]" /> }}
        />
      </p>
      <div className="mt-3">
        <PrimaryButton tone="ink" onPress={switchAccount}>
          {t("invite.signOutAndAccept", "Sign out and accept as {{email}}", { email: inviteEmail })}
        </PrimaryButton>
      </div>
    </Card>
  );
}

function LoggedOutAccept({ token, inviteEmail, onDone }: { token: string; inviteEmail: string; onDone: () => void }) {
  const { t } = useTranslation();
  const { busy, doDecline } = useAcceptDecline(token, onDone);
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const redirect = `${window.location.origin}/invite/${token}`;

  async function createAndAccept() {
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first) { toast.error(t("invite.enterFirstName", "Enter your first name.")); return; }
    if (password.length < 8) { toast.error(t("invite.useEightChars", "Use at least 8 characters.")); return; }
    setPending(true);
    try {
      // Store the REAL name (display_name/full_name + given_name/family_name) so
      // handle_new_user captures it — never the email prefix.
      const fullName = [first, last].filter(Boolean).join(" ");
      const { data, error } = await supabase.auth.signUp({
        email: inviteEmail,
        password,
        options: { data: { display_name: fullName, full_name: fullName, given_name: first, family_name: last || undefined }, emailRedirectTo: redirect },
      });
      if (error) { toast.error(authErrorMessage(error)); setPending(false); return; }
      // Land the new member in Brevo with a real name. No marketing consent —
      // they're joining a household, not opting into marketing (the edge fn still
      // records the contact + name, just not the marketing list).
      void captureLead({ email: inviteEmail, firstName: first, lastName: last || undefined, source: "household-invite", marketingConsent: false, attribution: null });
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
      toast.error(authErrorMessage(e, t("invite.couldNotCreate", "Couldn't create your account.")));
      setPending(false);
    }
  }

  async function google() {
    try { await signInWithGoogle(redirect); }
    catch (e: any) { toast.error(authErrorMessage(e, t("invite.googleFailed", "Google sign-in failed."))); }
  }

  if (confirmSent) {
    return (
      <Card className="p-5 text-center">
        <h2 className="t-section">{t("invite.confirmToFinish", "Confirm your email to finish")}</h2>
        <p className="t-body mt-2 text-[var(--ink2)]">
          <Trans
            i18nKey="invite.confirmSentBody"
            defaults="We sent a confirmation link to <b>{{email}}</b>. Open it and you'll come right back here to join the household."
            values={{ email: inviteEmail }}
            components={{ b: <span className="font-[500]" /> }}
          />
        </p>
      </Card>
    );
  }

  if (!creating) {
    return (
      <div className="space-y-2">
        <PrimaryButton tone="lime" onPress={() => setCreating(true)}>
          {t("invite.acceptAndCreate", "Accept & create account")}
        </PrimaryButton>
        <PrimaryButton tone="outline" disabled={!!busy} onPress={doDecline}>
          {t("invite.decline", "Decline")}
        </PrimaryButton>
      </div>
    );
  }

  return (
    <Card className="space-y-3 p-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="t-eyebrow mb-1 block text-[var(--mute)]">{t("invite.firstName", "First name")}</span>
          <input className="input" value={firstName} maxLength={60} onChange={(e) => setFirstName(e.target.value)} placeholder={t("invite.firstNamePlaceholder", "Brittany")} autoComplete="given-name" />
        </label>
        <label className="block">
          <span className="t-eyebrow mb-1 block text-[var(--mute)]">{t("invite.lastName", "Last name")}</span>
          <input className="input" value={lastName} maxLength={60} onChange={(e) => setLastName(e.target.value)} placeholder={t("invite.lastNamePlaceholder", "King")} autoComplete="family-name" />
        </label>
      </div>
      <label className="block">
        <span className="t-eyebrow mb-1 block text-[var(--mute)]">{t("invite.email", "Email")}</span>
        <input className="input" value={inviteEmail} readOnly disabled />
      </label>
      <label className="block">
        <span className="t-eyebrow mb-1 block text-[var(--mute)]">{t("invite.createPassword", "Create a password")}</span>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("invite.passwordPlaceholder", "At least 8 characters")} autoComplete="new-password" />
      </label>
      <PrimaryButton tone="ink" type="button" disabled={pending} onPress={createAndAccept}>
        {pending ? t("invite.creating", "Creating…") : t("invite.createAndAccept", "Create account & accept")}
      </PrimaryButton>
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-widest text-[var(--mute2)]">
        <div className="h-px flex-1 bg-[var(--line)]" /> {t("invite.or", "or")} <div className="h-px flex-1 bg-[var(--line)]" />
      </div>
      <PrimaryButton tone="outline" onPress={google}>
        {t("invite.continueWithGoogle", "Continue with Google")}
      </PrimaryButton>
      <style>{`.input:disabled{background:var(--cream);color:var(--mute)}`}</style>
    </Card>
  );
}
