import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { currentLocale } from "@/lib/i18n/ownerLocale";
import { getHouseholdInvite, acceptHouseholdInvite, declineHouseholdInvite, type InviteLinkProblem } from "@/lib/household.functions";
import { captureLead } from "@/lib/captureLead";
import { firstName as firstNameOf } from "@/lib/memberDisplay";
import type { Capability } from "@/lib/capabilities";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { K, SERIF, KyaCard, KyaHeading, KyaLabel, KyaLink, KyaPrimaryButton } from "@/components/kya";
import { FrontDoorPage, FrontDoorHeader, FrontDoorBody, FrontDoorError, CheckListCard, SignInInstead } from "@/components/frontDoor";
import { SocialSignInButtons } from "@/components/SocialSignInButtons";
import { AcceptCheckEmail } from "@/components/AcceptCheckEmail";
import { friendlyError } from "@/lib/errorMessage";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { useTranslation, Trans } from "react-i18next";
import type { TFunction } from "i18next";
import i18next from "i18next";
import { birdNames } from "@/lib/birdNames";

// Public household-invite accept screen. Renders for logged-out visitors too;
// the token is the access check. Never reveals bird data for an
// invalid/expired/used token (only the inviter's name, to say who to ask).
export const Route = createFileRoute("/invite/$token")({
  ssr: false,
  head: () => ({ meta: [
    { title: i18next.t("invite.pageTitle", "You're invited — Kya & Co.") },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: InviteAccept,
});

type BirdPreview = { name: string; photoUrl: string | null; photoPosition: string | null };

function InviteAccept() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const navigate = useNavigate();

  const getInvite = useServerFn(getHouseholdInvite);
  const { data: invite, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => getInvite({ data: { token } }),
    retry: false,
  });
  // A new account waiting on its confirmation email: the whole screen becomes
  // "Check your email" until they confirm (or go back).
  const [confirmSent, setConfirmSent] = useState(false);

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
      <FrontDoorPage>
        <div className="grid flex-1 place-items-center" role="status" aria-label={t("invite.loading", "Loading your invite…")}>
          <Loader2 className="size-8 animate-spin" style={{ color: K.lime }} />
        </div>
      </FrontDoorPage>
    );
  }

  // Couldn't reach the server (offline, or it failed): say so and offer a retry,
  // rather than calling a good invite expired. (Keyed on having no data, so a
  // background refetch that fails doesn't replace a screen that loaded.)
  if (!invite) {
    return (
      <FrontDoorPage>
        <FrontDoorHeader
          title={t("invite.couldNotLoadTitle", "We couldn't load this invite")}
          line={t("invite.couldNotLoadLine", "Check your connection and try again.")}
        />
        <FrontDoorBody>
          <KyaPrimaryButton disabled={isFetching} onClick={() => { void refetch(); }}>
            {isFetching ? t("invite.tryingAgain", "Trying again…") : t("invite.tryAgain", "Try again")}
          </KyaPrimaryButton>
          <div className="flex justify-center">
            <KyaLink onClick={() => { window.location.href = "/"; }}>{t("invite.goToApp", "Go to Kya & Co.")}</KyaLink>
          </div>
        </FrontDoorBody>
      </FrontDoorPage>
    );
  }

  if (!invite.valid) {
    return <InviteProblem reason={invite.reason} inviterName={invite.inviterName} signedIn={!!session?.signedIn} />;
  }

  if (confirmSent && !session?.signedIn) {
    return (
      <AcceptCheckEmail
        email={invite.inviteeEmail}
        returnPath={`/invite/${token}`}
        onBack={() => setConfirmSent(false)}
        message={
          <Trans
            i18nKey="invite.confirmSentBody"
            defaults="We sent a confirmation link to <b>{{email}}</b>. Open it and you'll come right back here to join the household."
            values={{ email: invite.inviteeEmail }}
            components={{ b: <span className="font-[700] [overflow-wrap:anywhere]" style={{ color: K.forest }} /> }}
          />
        }
      />
    );
  }

  // The server returns raw data; join the names and localize the fallback here.
  const owner = invite.inviterName ? firstNameOf(invite.inviterName) : t("invite.anOwner", "An owner");
  const names = invite.birdNames;
  const birds: BirdPreview[] = invite.birds ?? names.map((name) => ({ name, photoUrl: null, photoPosition: null }));
  const many = names.length > 3;
  const title = many
    ? t("invite.titleManyBirds", "{{owner}} invited you to help care for {{count}} birds", { owner, count: names.length })
    : t("invite.titleBirds", "{{owner}} invited you to help care for {{birds}}", { owner, birds: names.length ? birdNames(t, names) : t("nameList.yourBirds", "your birds") });
  const inviteEmail = invite.inviteeEmail.toLowerCase();
  const matches = !!session?.signedIn && session.email === inviteEmail;
  const wrongAccount = !!session?.signedIn && session.email !== inviteEmail;
  const leave = () => navigate({ to: "/" });

  return (
    <FrontDoorPage>
      <FrontDoorHeader>
        {birds.length > 0 && <BirdAvatars birds={birds} />}
        <KyaHeading as="h1" size={30} className={`${birds.length > 0 ? "mt-5" : "mt-7"} text-white`}>{title}</KyaHeading>
      </FrontDoorHeader>
      <FrontDoorBody>
        <p className="m-0 px-1 text-[20px] font-[700] leading-[1.25]" style={{ fontFamily: SERIF, color: K.forest }}>
          {t("invite.asPartOfHousehold", "As part of the household, you can")}
        </p>
        <CheckListCard items={capabilityLines(t, invite.capabilities ?? [])} />

        <div className="mt-2 flex flex-col gap-2">
          {wrongAccount ? (
            <WrongAccount inviteEmail={invite.inviteeEmail} token={token} onLeave={leave} />
          ) : matches ? (
            <SignedInAccept token={token} onDone={() => navigate({ to: "/dashboard" })} onLeave={leave} />
          ) : (
            <LoggedOutAccept token={token} inviteEmail={invite.inviteeEmail} onLeave={leave} onConfirmSent={() => setConfirmSent(true)} />
          )}
        </div>
      </FrontDoorBody>
    </FrontDoorPage>
  );
}

/** Why the link can't be used, in words, with the way forward for each:
 *  expired, declined, or canceled → ask the owner; already accepted → into the
 *  app (or sign in); not found → check the link. */
function InviteProblem({ reason, inviterName, signedIn }: { reason: InviteLinkProblem; inviterName: string | null; signedIn: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const owner = inviterName ? firstNameOf(inviterName) : null;
  let title: string;
  let line: string;
  switch (reason) {
    case "accepted":
      title = t("invite.alreadyAcceptedTitle", "You've already accepted this invite");
      line = signedIn
        ? t("invite.alreadyAcceptedSignedIn", "The birds you help care for are in the app.")
        : t("invite.alreadyAcceptedSignIn", "Sign in to see the birds you help care for.");
      break;
    case "declined":
      title = t("invite.declinedTitle", "This invite was declined");
      line = owner
        ? t("invite.declinedAskOwner", "Changed your mind? Ask {{owner}} to send a new one.", { owner })
        : t("invite.declinedAsk", "Changed your mind? Ask the owner to send a new one.");
      break;
    case "canceled":
      title = t("invite.canceledTitle", "This invite was canceled");
      line = owner
        ? t("invite.canceledAskOwner", "Ask {{owner}} if you think that's a mistake.", { owner })
        : t("invite.canceledAsk", "Ask the owner if you think that's a mistake.");
      break;
    case "not_found":
      title = t("invite.notFoundTitle", "We couldn't find this invite");
      line = t("invite.notFoundLine", "Check that you opened the whole link from the email, or ask the owner to send a new one.");
      break;
    default:
      title = t("invite.expiredTitle", "This invite has expired");
      line = owner
        ? t("invite.askOwnerForNew", "Ask {{owner}} to send a new one.", { owner })
        : t("invite.askForNew", "Ask the owner to send you a new one.");
  }
  const signInToApp = reason === "accepted" && !signedIn;
  return (
    <FrontDoorPage>
      <FrontDoorHeader title={title} line={line} />
      <FrontDoorBody>
        {signInToApp ? (
          <KyaPrimaryButton onClick={() => navigate({ to: "/auth", search: { mode: "signin", redirect: "/dashboard" } })}>
            {t("invite.signIn", "Sign in")}
          </KyaPrimaryButton>
        ) : (
          <KyaPrimaryButton onClick={() => { window.location.href = reason === "accepted" ? "/dashboard" : "/"; }}>
            {t("invite.goToApp", "Go to Kya & Co.")}
          </KyaPrimaryButton>
        )}
      </FrontDoorBody>
    </FrontDoorPage>
  );
}

/** What this invite's access allows, from the capabilities the owner granted.
 *  Viewing everything (care plan, routine, emergency info) is every member's
 *  baseline; the rest follows the capability gates in capabilities.ts. */
function capabilityLines(t: TFunction, caps: readonly Capability[]): string[] {
  const has = (c: Capability) => caps.includes(c);
  const lines = [
    t("invite.canSeePlan", "See each bird's care plan and routine"),
    t("invite.canReachVet", "Reach the vet and emergency info in one tap"),
  ];
  if (has("log_daily_care") && has("record_health")) lines.push(t("invite.canLogChecksWeights", "Log daily checks and weights"));
  else if (has("log_daily_care")) lines.push(t("invite.canLogWeightsTasks", "Log weights and daily tasks"));
  else if (has("record_health")) lines.push(t("invite.canRunChecks", "Run daily checks and write journal entries"));
  if (has("edit_care_plans")) lines.push(t("invite.canEditPlans", "Edit care plans"));
  if (has("manage_emergency")) lines.push(t("invite.canUpdateEmergency", "Update emergency info"));
  // manage_sits only lets a member delete a sit; creating one stays the owner's.
  if (has("manage_sits")) lines.push(t("invite.canCancelSits", "Cancel sits"));
  if (has("manage_flock")) lines.push(t("invite.canManageBirds", "Edit, hand off, and delete birds"));
  if (has("manage_household")) lines.push(t("invite.canManageHousehold", "Invite and manage household members"));
  return lines;
}

/** Overlapping 52px bird circles: photo, or the initial on teal. More than
 *  five shows the first four and a "+n" circle. */
function BirdAvatars({ birds }: { birds: BirdPreview[] }) {
  const shown = birds.length > 5 ? birds.slice(0, 4) : birds;
  const extra = birds.length - shown.length;
  const ring = { boxShadow: `0 0 0 2px ${K.forestDeep}` };
  const circle = "-ml-3 grid size-[52px] shrink-0 place-items-center overflow-hidden rounded-full first:ml-0";
  return (
    <div className="mt-7 flex items-center pl-[2px]" aria-hidden="true">
      {shown.map((b, i) => (
        <span key={i} className={circle} style={{ ...ring, background: K.teal, color: K.forest, zIndex: shown.length - i }}>
          {b.photoUrl
            ? <img src={b.photoUrl} alt="" className="size-full object-cover" style={{ objectPosition: b.photoPosition ?? "50% 20%" }} />
            : <span className="text-[20px] font-[700]" style={{ fontFamily: SERIF }}>{(b.name.trim()[0] ?? "?").toUpperCase()}</span>}
        </span>
      ))}
      {extra > 0 && (
        <span className={circle} style={{ ...ring, background: K.forestDeep, color: "#fff" }}>
          <span className="text-[15px] font-[700]">+{extra}</span>
        </span>
      )}
    </div>
  );
}

function useAcceptDecline(token: string, onDone: () => void) {
  const { t } = useTranslation();
  const accept = useServerFn(acceptHouseholdInvite);
  const decline = useServerFn(declineHouseholdInvite);
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  const [error, setError] = useState<string | null>(null);
  async function doAccept() {
    setBusy("accept");
    setError(null);
    try {
      await accept({ data: { token } });
      toast.success(t("invite.acceptedToast", "You're in — welcome to the household."));
      onDone();
    } catch (e: any) {
      setError(friendlyError(e, t("invite.couldNotAccept", "Couldn't accept the invite.")));
      setBusy(null);
    }
  }
  async function doDecline() {
    setBusy("decline");
    setError(null);
    try {
      await decline({ data: { token } });
      window.location.href = "/";
    } catch {
      // Stay on the invite so they can try again or just leave.
      setError(t("invite.couldNotDecline", "Couldn't decline the invite. Check your connection and try again."));
      setBusy(null);
    }
  }
  return { busy, error, doAccept, doDecline };
}

/** "Not now" leaves without touching the invite; declining is a separate,
 *  quieter control (it tells the owner and closes the invite). */
function LeaveLinks({ onLeave, onDecline, busy }: { onLeave: () => void; onDecline?: () => void; busy?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center">
      <KyaLink onClick={onLeave}>{t("invite.notNow", "Not now")}</KyaLink>
      {onDecline && (
        <button type="button" onClick={onDecline} disabled={busy} className="inline-flex min-h-[44px] items-center text-[13.5px] font-[600] underline-offset-2 hover:underline disabled:opacity-45" style={{ color: K.quiet }}>
          {t("invite.declineInvite", "Decline invite")}
        </button>
      )}
    </div>
  );
}

function SignedInAccept({ token, onDone, onLeave }: { token: string; onDone: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  const { busy, error, doAccept, doDecline } = useAcceptDecline(token, onDone);
  return (
    <>
      {error && <FrontDoorError>{error}</FrontDoorError>}
      <KyaPrimaryButton disabled={!!busy} onClick={doAccept}>
        {busy === "accept" ? t("invite.joining", "Joining…") : t("invite.acceptInvite", "Accept invite")}
      </KyaPrimaryButton>
      <LeaveLinks onLeave={onLeave} onDecline={doDecline} busy={!!busy} />
    </>
  );
}

function WrongAccount({ inviteEmail, token, onLeave }: { inviteEmail: string; token: string; onLeave: () => void }) {
  const { t } = useTranslation();
  async function switchAccount() {
    await supabase.auth.signOut();
    // Reload the invite screen logged-out so they can accept as the invite email.
    window.location.href = `/invite/${token}`;
  }
  return (
    <>
      <KyaCard className="p-4">
        <p className="m-0 text-[15px] leading-[1.45]" style={{ color: K.ink }}>
          <Trans
            i18nKey="invite.wrongAccount"
            defaults="This invite was sent to <b>{{email}}</b>, but you're signed in with a different account."
            values={{ email: inviteEmail }}
            components={{ b: <span className="font-[700]" style={{ color: K.forest }} /> }}
          />
        </p>
      </KyaCard>
      <KyaPrimaryButton onClick={switchAccount}>
        {t("invite.signOutAndAccept", "Sign out and accept as {{email}}", { email: inviteEmail })}
      </KyaPrimaryButton>
      <LeaveLinks onLeave={onLeave} />
    </>
  );
}

function LoggedOutAccept({ token, inviteEmail, onLeave, onConfirmSent }: { token: string; inviteEmail: string; onLeave: () => void; onConfirmSent: () => void }) {
  const { t } = useTranslation();
  const { busy, error: declineError, doDecline } = useAcceptDecline(token, () => {});
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [socialBusy, setSocialBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirect = `${window.location.origin}/invite/${token}`;
  // The card (FrontDoorError) is the one place an error shows.
  const fail = (msg: string) => setError(msg);

  async function createAndAccept() {
    const first = firstName.trim();
    const last = lastName.trim();
    setError(null);
    if (!first) { fail(t("invite.enterFirstName", "Enter your first name.")); return; }
    if (password.length < 8) { fail(t("invite.useEightChars", "Use at least 8 characters.")); return; }
    setPending(true);
    try {
      // Store the REAL name (display_name/full_name + given_name/family_name) so
      // handle_new_user captures it — never the email prefix.
      const fullName = [first, last].filter(Boolean).join(" ");
      const { data, error } = await supabase.auth.signUp({
        email: inviteEmail,
        password,
        options: { data: { display_name: fullName, full_name: fullName, given_name: first, family_name: last || undefined, locale: currentLocale() }, emailRedirectTo: redirect },
      });
      if (error) { fail(authErrorMessage(error)); setPending(false); return; }
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
      setPending(false);
      onConfirmSent();
    } catch (e: any) {
      fail(authErrorMessage(e, t("invite.couldNotCreate", "Couldn't create your account.")));
      setPending(false);
    }
  }

  if (!creating) {
    return (
      <>
        <KyaPrimaryButton onClick={() => setCreating(true)}>{t("invite.acceptInvite", "Accept invite")}</KyaPrimaryButton>
        <p className="m-0 text-center text-[12.5px]" style={{ color: K.quiet }}>
          {t("invite.signInNext", "You'll sign in or create a free account next.")}
        </p>
        {declineError && <FrontDoorError>{declineError}</FrontDoorError>}
        <LeaveLinks onLeave={onLeave} onDecline={doDecline} busy={!!busy} />
      </>
    );
  }

  return (
    <>
      {error && <FrontDoorError>{error}</FrontDoorError>}
      <CreateAccountForm
        idPrefix="invite"
        email={inviteEmail}
        firstName={firstName} setFirstName={setFirstName}
        lastName={lastName} setLastName={setLastName}
        password={password} setPassword={setPassword}
        labels={{
          firstName: t("invite.firstName", "First name"),
          firstNamePlaceholder: t("invite.firstNamePlaceholder", "Brittany"),
          lastName: t("invite.lastName", "Last name"),
          lastNamePlaceholder: t("invite.lastNamePlaceholder", "King"),
          email: t("invite.email", "Email"),
          password: t("invite.createPassword", "Create a password"),
          passwordPlaceholder: t("invite.passwordPlaceholder", "At least 8 characters"),
          or: t("invite.or", "or"),
        }}
        submit={
          <KyaPrimaryButton disabled={pending || socialBusy} onClick={createAndAccept}>
            {pending ? t("invite.creating", "Creating…") : t("invite.createAndAccept", "Create account & accept")}
          </KyaPrimaryButton>
        }
        social={
          // Same buttons, conditions, and sign-in code as /auth; the provider
          // brings them straight back here (web redirect, or the native shell
          // pushes this path once signed in).
          <SocialSignInButtons redirectPath={`/invite/${token}`} disabled={pending} onBusyChange={setSocialBusy} onError={setError} />
        }
      />
      <SignInInstead returnTo={`/invite/${token}`} />
      <LeaveLinks onLeave={onLeave} />
    </>
  );
}

/** Name, the invite's (fixed) email, a password; then the create button,
 *  "or", and the provider buttons (Google, and Apple where /auth offers it). */
function CreateAccountForm({ idPrefix, email, firstName, setFirstName, lastName, setLastName, password, setPassword, labels, submit, social }: {
  idPrefix: string;
  email: string;
  firstName: string; setFirstName: (v: string) => void;
  lastName: string; setLastName: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  labels: { firstName: string; firstNamePlaceholder: string; lastName: string; lastNamePlaceholder: string; email: string; password: string; passwordPlaceholder: string; or: string };
  submit: ReactNode;
  social: ReactNode;
}) {
  return (
    <KyaCard className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <KyaLabel htmlFor={`${idPrefix}-first`}>{labels.firstName}</KyaLabel>
          <input id={`${idPrefix}-first`} className="kya-input" value={firstName} maxLength={60} onChange={(e) => setFirstName(e.target.value)} placeholder={labels.firstNamePlaceholder} autoComplete="given-name" />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <KyaLabel htmlFor={`${idPrefix}-last`}>{labels.lastName}</KyaLabel>
          <input id={`${idPrefix}-last`} className="kya-input" value={lastName} maxLength={60} onChange={(e) => setLastName(e.target.value)} placeholder={labels.lastNamePlaceholder} autoComplete="family-name" />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <KyaLabel htmlFor={`${idPrefix}-email`}>{labels.email}</KyaLabel>
        <input id={`${idPrefix}-email`} className="kya-input" value={email} readOnly disabled />
      </div>
      <div className="flex flex-col gap-1.5">
        <KyaLabel htmlFor={`${idPrefix}-password`}>{labels.password}</KyaLabel>
        <input id={`${idPrefix}-password`} className="kya-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={labels.passwordPlaceholder} autoComplete="new-password" />
      </div>
      {submit}
      <div className="flex items-center gap-3 text-[13px]" style={{ color: K.quiet }}>
        <span className="h-px flex-1" style={{ background: K.line }} /> {labels.or} <span className="h-px flex-1" style={{ background: K.line }} />
      </div>
      {social}
    </KyaCard>
  );
}
