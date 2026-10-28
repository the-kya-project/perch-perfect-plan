import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { K, KyaPrimaryButton } from "@/components/kya";
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
// ssr: false, like /reset-password: nothing here can be rendered on the server,
// and a link scanner that only fetches the HTML never redeems the token.
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

function VerifyLink() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token_hash: tokenHash, type: rawType, next } = Route.useSearch();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const type = TYPES.find((x) => x === rawType);
    if (!tokenHash || !type) {
      setFailed(true);
      return;
    }
    const target = safeInternalPath(next) ?? defaultNext(type);
    void (async () => {
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
      else setFailed(true);
    })();
  }, [tokenHash, rawType, next, navigate]);

  const toSignIn = () => navigate({ to: "/auth", search: { mode: "signin" } });
  return (
    <FrontDoorPage>
      <FrontDoorHeader onBack={toSignIn} title={failed ? t("verifyLink.failedTitle", "This link didn't work") : t("verifyLink.title", "One moment")} />
      <FrontDoorBody>
        {failed ? (
          <>
            <FrontDoorError>{t("verifyLink.failedBody", "It may have expired or already been used. Sign in, or ask for a new email.")}</FrontDoorError>
            <KyaPrimaryButton onClick={toSignIn}>{t("verifyLink.toSignIn", "Go to sign in")}</KyaPrimaryButton>
          </>
        ) : (
          <p className="m-0 flex items-center gap-2 text-[14px]" style={{ color: K.quiet }}>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("verifyLink.checking", "Checking your link…")}
          </p>
        )}
      </FrontDoorBody>
    </FrontDoorPage>
  );
}
