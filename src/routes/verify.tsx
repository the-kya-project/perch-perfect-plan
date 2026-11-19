import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import i18next from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import { KyaPrimaryButton } from "@/components/kya";
import { FrontDoorBody, FrontDoorError, FrontDoorHeader, FrontDoorPage } from "@/components/frontDoor";
import { safeInternalPath } from "@/lib/returnTo";

// Where the links in our sign-in emails land: confirm your email, reset your
// password, change your email, an emailed sign-in link. The send-email hook
// (authEmailHook.server.ts) points them here, on our own domain, instead of at
// Supabase's /auth/v1/verify, so that on an iPhone with the app installed the
// link opens the app (it's a Universal Link, see appLinks.ts).
//
// The link carries the one-time token_hash, and this page redeems it with
// verifyOtp. Unlike the old redirect (which came back with a PKCE ?code= that
// only the browser that started the sign-up could exchange), a token_hash works
// wherever it's opened: the app, Safari, another computer. Each link works once.
//
// The token is redeemed only when the person taps the button, never on load.
// Email security scanners (Gmail's, Microsoft Safe Links) open links, run the
// page's JavaScript, and sometimes do it BEFORE the person does: redeeming on
// load let a scanner spend the token and left the real person on
// /link-expired. A scanner doesn't tap buttons.
//
// ssr: false, like /reset-password: nothing here can be rendered on the server.
const TYPES = ["signup", "invite", "magiclink", "recovery", "email_change", "email"] as const;
type LinkType = (typeof TYPES)[number];

export const Route = createFileRoute("/verify")({
  ssr: false,
  validateSearch: z.object({
    token_hash: z.string().max(200).optional(),
    type: z.string().max(32).optional(),
    next: z.string().max(500).optional(),
  }),
  head: () => ({
    meta: [
      { title: i18next.t("verifyLink.pageTitle", "Opening your link — Kya & Co.") },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: VerifyLink,
});

/** Where each kind of link goes once it's redeemed, when the email didn't say. */
function defaultNext(type: LinkType): string {
  switch (type) {
    case "recovery": return "/reset-password";
    case "email_change": return "/account";
    case "magiclink":
    case "email": return "/dashboard";
    default: return "/welcome";
  }
}

/** Title, line and button for each kind of link. Literal keys, so
 *  `npm run i18n:extract` finds them. */
function copyFor(type: LinkType, t: TFunction): { title: string; line: string; button: string } {
  switch (type) {
    case "signup": return {
      title: t("verifyLink.signup.title", "Confirm your email"),
      line: t("verifyLink.signup.line", "One quick tap and you're in."),
      button: t("verifyLink.signup.button", "Confirm my email"),
    };
    case "invite": return {
      title: t("verifyLink.invite.title", "Accept your invite"),
      line: t("verifyLink.invite.line", "Tap below to join the household."),
      button: t("verifyLink.invite.button", "Accept invite"),
    };
    case "recovery": return {
      title: t("verifyLink.recovery.title", "Reset your password"),
      line: t("verifyLink.recovery.line", "Tap below to choose a new password."),
      button: t("verifyLink.recovery.button", "Reset my password"),
    };
    case "email_change": return {
      title: t("verifyLink.emailChange.title", "Confirm your new email"),
      line: t("verifyLink.emailChange.line", "Tap below to finish updating your email."),
      button: t("verifyLink.emailChange.button", "Confirm my new email"),
    };
    case "magiclink":
    case "email": return {
      title: t("verifyLink.signIn.title", "Sign in to Kya & Co."),
      line: t("verifyLink.signIn.line", "Tap below to sign in."),
      button: t("verifyLink.signIn.button", "Sign me in"),
    };
  }
}

function VerifyLink() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token_hash: tokenHash, type: rawType, next } = Route.useSearch();
  const type = TYPES.find((x) => x === rawType);
  const usable = !!tokenHash && !!type;
  const [failed, setFailed] = useState(!usable);
  const [busy, setBusy] = useState(false);
  const viewed = useRef(false);
  const tapped = useRef(false);

  useEffect(() => {
    if (!usable || viewed.current) return;
    viewed.current = true;
    track("confirm_page_viewed", { type });
  }, [usable, type]);

  async function confirm() {
    if (!tokenHash || !type || tapped.current) return;
    tapped.current = true;
    setBusy(true);
    track("confirm_tapped", { type });
    // `next` comes from the email link, so it only ever names a path on our
    // own site (safeInternalPath); anything else falls back to the default.
    const target = safeInternalPath(next) ?? defaultNext(type);
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      navigate({ href: target, replace: true });
      return;
    }
    // Expired, already used, or replaced by a newer email. Hand off to the
    // pages that already explain each case and offer the next step.
    const reason = (error.code ?? "link_invalid").slice(0, 64);
    if (type === "signup" || type === "invite") navigate({ to: "/link-expired", search: { reason }, replace: true });
    else if (type === "recovery") navigate({ href: `/reset-password?error=${encodeURIComponent(reason)}`, replace: true });
    else {
      setBusy(false);
      setFailed(true);
    }
  }

  const toSignIn = () => navigate({ to: "/auth", search: { mode: "signin" } });
  if (failed || !type) {
    return (
      <FrontDoorPage>
        <FrontDoorHeader onBack={toSignIn} title={t("verifyLink.failedTitle", "This link didn't work")} />
        <FrontDoorBody>
          <FrontDoorError>{t("verifyLink.failedBody", "It may have expired or already been used. Sign in, or ask for a new email.")}</FrontDoorError>
          <KyaPrimaryButton onClick={toSignIn}>{t("verifyLink.toSignIn", "Go to sign in")}</KyaPrimaryButton>
        </FrontDoorBody>
      </FrontDoorPage>
    );
  }
  const copy = copyFor(type, t);
  return (
    <FrontDoorPage>
      <FrontDoorHeader onBack={toSignIn} title={copy.title} line={copy.line} />
      <FrontDoorBody>
        <KyaPrimaryButton
          onClick={() => void confirm()}
          disabled={busy}
          icon={busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : undefined}
        >
          {busy ? t("verifyLink.checking", "Checking your link…") : copy.button}
        </KyaPrimaryButton>
      </FrontDoorBody>
    </FrontDoorPage>
  );
}
