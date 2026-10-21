import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getHandoff, acceptHandoff, declineHandoff, type HandoffLinkProblem } from "@/lib/handoff.functions";
import { captureLead } from "@/lib/captureLead";
import { firstName as firstNameOf } from "@/lib/memberDisplay";
import { speciesLabel } from "@/lib/speciesLabel";
import { birdAgeLabel } from "@/lib/birdAge";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { K, SERIF, KyaCard, KyaHeading, KyaLabel, KyaLink, KyaPrimaryButton } from "@/components/kya";
import { FrontDoorPage, FrontDoorHeader, FrontDoorBody, FrontDoorError, CheckListCard, SignInInstead } from "@/components/frontDoor";
import { SocialSignInButtons } from "@/components/SocialSignInButtons";
import { AcceptCheckEmail } from "@/components/AcceptCheckEmail";
import { BrandLockup } from "@/components/BrandLogo";
import { friendlyError } from "@/lib/errorMessage";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { useTranslation, Trans } from "react-i18next";
import type { TFunction } from "i18next";
import i18next from "i18next";
import { currentLocale } from "@/lib/i18n/ownerLocale";

// Public handoff-accept screen. Renders for logged-out visitors; the token is
// the access check. Invalid/expired → clean message, no data exposed (an
// accepted link only names the bird, to say it's already home).
export const Route = createFileRoute("/handoff/$token")({
  ssr: false,
  head: () => ({ meta: [
    { title: i18next.t("handoff.pageTitle", "A bird is being handed off to you — Kya & Co.") },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: HandoffAccept,
});

type Pronoun = "him" | "her" | "them";
/** From birds.sex: first letter m / f (any case), else them. */
function pronounFor(sex: string | null | undefined): Pronoun {
  const c = (sex ?? "").trim().charAt(0).toLowerCase();
  return c === "m" ? "him" : c === "f" ? "her" : "them";
}

function HandoffAccept() {
  const { t } = useTranslation();
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const getH = useServerFn(getHandoff);
  const { data: handoff, isLoading, isFetching, refetch } = useQuery({ queryKey: ["handoff", token], queryFn: () => getH({ data: { token } }), retry: false });
  // A new account waiting on its confirmation email: the whole screen becomes
  // "Check your email" until they confirm (or go back).
  const [confirmSent, setConfirmSent] = useState(false);
  const { data: session } = useQuery({
    queryKey: ["handoff-session"],
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
      return { email: data.session?.user?.email?.toLowerCase() ?? null, signedIn: !!data.session };
    },
  });

  if (isLoading) {
    return (
      <FrontDoorPage>
        <div className="grid flex-1 place-items-center" role="status" aria-label={t("handoff.loading", "Loading…")}>
          <Loader2 className="size-8 animate-spin" style={{ color: K.lime }} />
        </div>
      </FrontDoorPage>
    );
  }

  // Couldn't reach the server (offline, or it failed): say so and offer a retry,
  // rather than calling a good link expired. (Keyed on having no data, so a
  // background refetch that fails doesn't replace a screen that loaded.)
  if (!handoff) {
    return (
      <FrontDoorPage>
        <FrontDoorHeader
          title={t("handoff.couldNotLoadTitle", "We couldn't load this handoff")}
          line={t("handoff.couldNotLoadLine", "Check your connection and try again.")}
        />
        <FrontDoorBody>
          <KyaPrimaryButton disabled={isFetching} onClick={() => { void refetch(); }}>
            {isFetching ? t("handoff.tryingAgain", "Trying again…") : t("handoff.tryAgain", "Try again")}
          </KyaPrimaryButton>
          <div className="flex justify-center">
            <KyaLink onClick={() => { window.location.href = "/"; }}>{t("handoff.goToApp", "Go to Kya & Co.")}</KyaLink>
          </div>
        </FrontDoorBody>
      </FrontDoorPage>
    );
  }

  if (!handoff.valid) {
    return <HandoffProblem reason={handoff.reason} birdName={handoff.birdName} signedIn={!!session?.signedIn} />;
  }

  if (confirmSent && !session?.signedIn) {
    return (
      <AcceptCheckEmail
        email={handoff.recipientEmail}
        returnPath={`/handoff/${token}`}
        onBack={() => setConfirmSent(false)}
        message={
          <Trans
            i18nKey="handoff.confirmSentBody"
            defaults="We sent a confirmation link to <b>{{email}}</b>. Open it and you'll come right back here to accept."
            values={{ email: handoff.recipientEmail }}
            components={{ b: <span className="font-[700] [overflow-wrap:anywhere]" style={{ color: K.forest }} /> }}
          />
        }
      />
    );
  }

  // The server returns raw names (null when missing); fallbacks are localized here.
  const sender = handoff.senderName ? firstNameOf(handoff.senderName) : t("handoff.someone", "Someone");
  const birdName = handoff.birdName ?? t("handoff.thisBird", "this bird");
  const pronoun = pronounFor(handoff.sex);
  const facts = [
    handoff.species ? speciesLabel(t, handoff.species) : null,
    birdAgeLabel(t, { age: handoff.age, birth_date: handoff.birthDate }),
  ].filter(Boolean).join(" · ");
  const inviteEmail = handoff.recipientEmail.toLowerCase();
  const matches = !!session?.signedIn && session.email === inviteEmail;
  const wrongAccount = !!session?.signedIn && session.email !== inviteEmail;
  const leave = () => navigate({ to: "/" });

  return (
    <FrontDoorPage>
      <header className="text-white">
        <div className="relative mx-auto h-[45dvh] max-h-[460px] min-h-[260px] max-w-md overflow-hidden">
          {handoff.birdPhotoUrl ? (
            <img src={handoff.birdPhotoUrl} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: handoff.birdPhotoPosition ?? "50% 20%" }} />
          ) : (
            <div className="absolute inset-0 grid place-items-center" style={{ background: K.teal, color: K.forest }} aria-hidden="true">
              <span className="-mt-6 text-[96px] font-[700] leading-none" style={{ fontFamily: SERIF }}>{(birdName.trim()[0] ?? "?").toUpperCase()}</span>
            </div>
          )}
          {/* Darken the top for the logo; fade the bottom into forest. */}
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, rgba(18,41,31,0.55) 0%, rgba(18,41,31,0) 28%, rgba(26,61,46,0) 50%, ${K.forest} 100%)` }} aria-hidden="true" />
          <div className="absolute inset-x-5 top-[calc(env(safe-area-inset-top)+14px)] flex min-h-[44px] items-center justify-center">
            {/* All-white lockup over the photo (the ink lockup carries its own forest box). */}
            <BrandLockup orientation="horizontal" variant="white" size={118} />
          </div>
        </div>
        <div className="mx-auto -mt-10 max-w-md px-5 pb-[46px]">
          <KyaHeading as="h1" size={30} className="relative text-white">
            {t("handoff.titleHandingOff", "{{sender}} is handing {{bird}} off to you", { sender, bird: birdName })}
          </KyaHeading>
          {facts && <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>{facts}</p>}
        </div>
      </header>
      <FrontDoorBody>
        <p className="m-0 px-1 text-[20px] font-[700] leading-[1.25]" style={{ fontFamily: SERIF, color: K.forest }}>
          {recordComesWith(t, pronoun, birdName)}
        </p>
        <CheckListCard items={transferLines(t, pronoun)} />

        <div className="mt-2 flex flex-col gap-2">
          {wrongAccount ? (
            <WrongAccount inviteEmail={handoff.recipientEmail} token={token} onLeave={leave} />
          ) : matches ? (
            <SignedInAccept token={token} birdName={birdName} onDone={() => navigate({ to: "/dashboard" })} onLeave={leave} />
          ) : (
            <LoggedOutAccept token={token} birdName={birdName} inviteEmail={handoff.recipientEmail} onLeave={leave} onConfirmSent={() => setConfirmSent(true)} />
          )}
        </div>
      </FrontDoorBody>
    </FrontDoorPage>
  );
}

/** Why the link can't be used, in words, with the way forward for each. The
 *  server names nobody here (only the bird, once it's already home), so the
 *  copy points back to "the person handing off the bird". */
function HandoffProblem({ reason, birdName, signedIn }: { reason: HandoffLinkProblem; birdName: string | null; signedIn: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  let title: string;
  let line: string | undefined;
  switch (reason) {
    case "accepted":
      title = t("handoff.alreadyHome", "{{bird}} is already home with you", { bird: birdName ?? t("handoff.yourBird", "Your bird") });
      line = signedIn ? undefined : t("handoff.alreadyHomeSignIn", "Sign in to see their record.");
      break;
    case "declined":
      title = t("handoff.declinedTitle", "This handoff was declined");
      line = t("handoff.declinedLine", "Changed your mind? Ask the person handing off the bird to send a new link.");
      break;
    case "canceled":
      title = t("handoff.canceledTitle", "This handoff was canceled");
      line = t("handoff.canceledLine", "Ask the person handing off the bird if you think that's a mistake.");
      break;
    case "not_found":
      title = t("handoff.notFoundTitle", "We couldn't find this handoff");
      line = t("handoff.notFoundLine", "Check that you opened the whole link from the email, or ask the person handing off the bird to send a new one.");
      break;
    default:
      title = t("handoff.expiredTitle", "This handoff link has expired");
      line = t("handoff.expiredLine", "Ask the person handing off the bird to send a new link.");
  }
  const signInToApp = reason === "accepted" && !signedIn;
  return (
    <FrontDoorPage>
      <FrontDoorHeader title={title} line={line} />
      <FrontDoorBody>
        {signInToApp ? (
          <KyaPrimaryButton onClick={() => navigate({ to: "/auth", search: { mode: "signin", redirect: "/dashboard" } })}>
            {t("handoff.signIn", "Sign in")}
          </KyaPrimaryButton>
        ) : (
          <KyaPrimaryButton onClick={() => { window.location.href = reason === "accepted" ? "/dashboard" : "/"; }}>
            {t("handoff.goToApp", "Go to Kya & Co.")}
          </KyaPrimaryButton>
        )}
      </FrontDoorBody>
    </FrontDoorPage>
  );
}

function recordComesWith(t: TFunction, p: Pronoun, bird: string): string {
  switch (p) {
    case "him": return t("handoff.recordComesWithHimHeading", "{{bird}}'s record comes with him, so you won't start from scratch", { bird });
    case "her": return t("handoff.recordComesWithHerHeading", "{{bird}}'s record comes with her, so you won't start from scratch", { bird });
    case "them": return t("handoff.recordComesWithThemHeading", "{{bird}}'s record comes with them, so you won't start from scratch", { bird });
  }
}

/** What moves with the bird today: acceptHandoff hands over the bird row
 *  itself, so everything keyed to it (care plan, routine, weights, scans,
 *  journal, moments, identity fields) comes along. */
function transferLines(t: TFunction, p: Pronoun): string[] {
  const plan = p === "him" ? t("handoff.carePlanHis", "His care plan: food, routine, and behavior")
    : p === "her" ? t("handoff.carePlanHer", "Her care plan: food, routine, and behavior")
    : t("handoff.carePlanTheir", "Their care plan: food, routine, and behavior");
  const identity = p === "him" ? t("handoff.identityHis", "His identity: band, microchip, and hatch date")
    : p === "her" ? t("handoff.identityHer", "Her identity: band, microchip, and hatch date")
    : t("handoff.identityTheir", "Their identity: band, microchip, and hatch date");
  return [
    plan,
    t("handoff.healthHistory", "Health history, weights, and vet notes"),
    identity,
    t("handoff.journalMoments", "Journal entries and moments"),
  ];
}

function useAcceptDecline(token: string, birdName: string, onDone: () => void) {
  const { t } = useTranslation();
  const accept = useServerFn(acceptHandoff);
  const decline = useServerFn(declineHandoff);
  const [busy, setBusy] = useState<null | "accept" | "decline">(null);
  const [error, setError] = useState<string | null>(null);
  async function doAccept() {
    setBusy("accept");
    setError(null);
    try { await accept({ data: { token } }); toast.success(t("handoff.welcomeHomeToast", "Welcome home, {{bird}}", { bird: birdName })); onDone(); }
    catch (e: any) {
      setError(friendlyError(e, t("handoff.couldNotAccept", "Couldn't accept."))); setBusy(null);
    }
  }
  async function doDecline() {
    setBusy("decline");
    setError(null);
    try { await decline({ data: { token } }); window.location.href = "/"; }
    catch {
      // Stay on the handoff so they can try again or just leave.
      setError(t("handoff.couldNotDecline", "Couldn't decline the handoff. Check your connection and try again."));
      setBusy(null);
    }
  }
  return { busy, error, doAccept, doDecline };
}

/** "Not now" leaves without touching the handoff; declining is a separate,
 *  quieter control (it tells the sender and closes the handoff). */
function LeaveLinks({ onLeave, onDecline, busy }: { onLeave: () => void; onDecline?: () => void; busy?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center">
      <KyaLink onClick={onLeave}>{t("handoff.notNow", "Not now")}</KyaLink>
      {onDecline && (
        <button type="button" onClick={onDecline} disabled={busy} className="inline-flex min-h-[44px] items-center text-[13.5px] font-[600] underline-offset-2 hover:underline disabled:opacity-45" style={{ color: K.quiet }}>
          {t("handoff.declineHandoff", "Decline handoff")}
        </button>
      )}
    </div>
  );
}

function SignedInAccept({ token, birdName, onDone, onLeave }: { token: string; birdName: string; onDone: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  const { busy, error, doAccept, doDecline } = useAcceptDecline(token, birdName, onDone);
  return (
    <>
      {error && <FrontDoorError>{error}</FrontDoorError>}
      <KyaPrimaryButton disabled={!!busy} onClick={doAccept}>
        {busy === "accept" ? t("handoff.accepting", "Accepting…") : t("handoff.welcomeHome", "Welcome {{bird}} home", { bird: birdName })}
      </KyaPrimaryButton>
      <LeaveLinks onLeave={onLeave} onDecline={doDecline} busy={!!busy} />
    </>
  );
}

function WrongAccount({ inviteEmail, token, onLeave }: { inviteEmail: string; token: string; onLeave: () => void }) {
  const { t } = useTranslation();
  async function switchAccount() { await supabase.auth.signOut(); window.location.href = `/handoff/${token}`; }
  return (
    <>
      <KyaCard className="p-4">
        <p className="m-0 text-[15px] leading-[1.45]" style={{ color: K.ink }}>
          <Trans i18nKey="handoff.wrongAccount" defaults="This handoff was sent to <b>{{email}}</b>, but you're signed in with a different account." values={{ email: inviteEmail }} components={{ b: <span className="font-[700]" style={{ color: K.forest }} /> }} />
        </p>
      </KyaCard>
      <KyaPrimaryButton onClick={switchAccount}>{t("handoff.signOutAndAccept", "Sign out and accept as {{email}}", { email: inviteEmail })}</KyaPrimaryButton>
      <LeaveLinks onLeave={onLeave} />
    </>
  );
}

function LoggedOutAccept({ token, birdName, inviteEmail, onLeave, onConfirmSent }: { token: string; birdName: string; inviteEmail: string; onLeave: () => void; onConfirmSent: () => void }) {
  const { t } = useTranslation();
  const { busy, error: declineError, doDecline } = useAcceptDecline(token, birdName, () => {});
  const [creating, setCreating] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [socialBusy, setSocialBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const redirect = `${window.location.origin}/handoff/${token}`;
  // The card (FrontDoorError) is the one place an error shows.
  const fail = (msg: string) => setError(msg);

  async function createAndAccept() {
    const first = firstName.trim();
    const last = lastName.trim();
    setError(null);
    if (!first) { fail(t("handoff.enterFirstName", "Enter your first name.")); return; }
    if (password.length < 8) { fail(t("handoff.useEightChars", "Use at least 8 characters.")); return; }
    setPending(true);
    try {
      // Store the REAL name so handle_new_user captures it — never the email prefix.
      const fullName = [first, last].filter(Boolean).join(" ");
      const { data, error } = await supabase.auth.signUp({ email: inviteEmail, password, options: { data: { display_name: fullName, full_name: fullName, given_name: first, family_name: last || undefined, locale: currentLocale() }, emailRedirectTo: redirect } });
      if (error) { fail(authErrorMessage(error)); setPending(false); return; }
      // Land the new account in Brevo with a real name (no marketing consent).
      void captureLead({ email: inviteEmail, firstName: first, lastName: last || undefined, source: "handoff", marketingConsent: false, attribution: null });
      if (data.session) { window.location.href = redirect; return; }
      setPending(false); onConfirmSent();
    } catch (e: any) { fail(authErrorMessage(e, t("handoff.couldNotCreate", "Couldn't create your account."))); setPending(false); }
  }
  if (!creating) {
    return (
      <>
        <KyaPrimaryButton onClick={() => setCreating(true)}>{t("handoff.welcomeHome", "Welcome {{bird}} home", { bird: birdName })}</KyaPrimaryButton>
        {declineError && <FrontDoorError>{declineError}</FrontDoorError>}
        <LeaveLinks onLeave={onLeave} onDecline={doDecline} busy={!!busy} />
      </>
    );
  }
  return (
    <>
      {error && <FrontDoorError>{error}</FrontDoorError>}
      <CreateAccountForm
        idPrefix="handoff"
        email={inviteEmail}
        firstName={firstName} setFirstName={setFirstName}
        lastName={lastName} setLastName={setLastName}
        password={password} setPassword={setPassword}
        labels={{
          firstName: t("handoff.firstName", "First name"),
          firstNamePlaceholder: t("handoff.firstName", "First name"),
          lastName: t("handoff.lastName", "Last name"),
          lastNamePlaceholder: t("handoff.lastName", "Last name"),
          email: t("handoff.email", "Email"),
          password: t("handoff.createPassword", "Create a password"),
          passwordPlaceholder: t("handoff.passwordPlaceholder", "At least 8 characters"),
          or: t("handoff.or", "or"),
          required: t("setupUi.required", "Required"),
        }}
        submit={
          <KyaPrimaryButton disabled={pending || socialBusy} onClick={createAndAccept}>
            {pending ? t("handoff.creating", "Creating…") : t("handoff.createAndAccept", "Create account & accept")}
          </KyaPrimaryButton>
        }
        social={
          // Same buttons, conditions, and sign-in code as /auth; the provider
          // brings them straight back here (web redirect, or the native shell
          // pushes this path once signed in).
          <SocialSignInButtons redirectPath={`/handoff/${token}`} disabled={pending} onBusyChange={setSocialBusy} onError={setError} />
        }
      />
      <SignInInstead returnTo={`/handoff/${token}`} />
      <LeaveLinks onLeave={onLeave} />
    </>
  );
}

/** Name, the handoff's (fixed) email, a password; then the create button,
 *  "or", and the provider buttons (Google, and Apple where /auth offers it). */
function CreateAccountForm({ idPrefix, email, firstName, setFirstName, lastName, setLastName, password, setPassword, labels, submit, social }: {
  idPrefix: string;
  email: string;
  firstName: string; setFirstName: (v: string) => void;
  lastName: string; setLastName: (v: string) => void;
  password: string; setPassword: (v: string) => void;
  labels: { firstName: string; firstNamePlaceholder: string; lastName: string; lastNamePlaceholder: string; email: string; password: string; passwordPlaceholder: string; or: string; required: string };
  submit: ReactNode;
  social: ReactNode;
}) {
  return (
    <KyaCard className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <KyaLabel htmlFor={`${idPrefix}-first`} required requiredLabel={labels.required}>{labels.firstName}</KyaLabel>
          <input id={`${idPrefix}-first`} className="kya-input" value={firstName} maxLength={60} onChange={(e) => setFirstName(e.target.value)} placeholder={labels.firstNamePlaceholder} autoComplete="given-name" required />
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
        <KyaLabel htmlFor={`${idPrefix}-password`} required requiredLabel={labels.required}>{labels.password}</KyaLabel>
        <input id={`${idPrefix}-password`} className="kya-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={labels.passwordPlaceholder} autoComplete="new-password" required minLength={8} />
      </div>
      {submit}
      <div className="flex items-center gap-3 text-[13px]" style={{ color: K.quiet }}>
        <span className="h-px flex-1" style={{ background: K.line }} /> {labels.or} <span className="h-px flex-1" style={{ background: K.line }} />
      </div>
      {social}
    </KyaCard>
  );
}
