import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { track } from "@/lib/analytics";
import { authErrorMessage } from "@/lib/authErrorMessage";
import { isNativeApp, nativePlatform, nativePluginAvailable } from "@/lib/nativeApp";
import { appCallbackUrl, readAppReturnParams, type AppReturnParams } from "@/lib/oauthAppReturn";
import { K, KyaPrimaryButton } from "@/components/kya";
import { FrontDoorBody, FrontDoorError, FrontDoorHeader, FrontDoorPage } from "@/components/frontDoor";

// Both ends of the app's web sign-in fallback (lib/oauthAppReturn.ts), used
// only by native builds that lack the SocialLogin plugin:
//   • in the in-app browser sheet, where Supabase lands with ?code=…: hand the
//     code to the app on kyaco://auth-callback (the sheet can't use it: the
//     PKCE verifier is in the app's storage, not the sheet's);
//   • in the app, reached from that kyaco:// link: close the sheet, exchange
//     the code, and go on to `next`, signed in.
// Client-only (ssr: false): everything here depends on where it's running.
export const Route = createFileRoute("/app-signin-return")({
  ssr: false,
  head: () => ({
    meta: [
      { title: i18next.t("appSignInReturn.pageTitle", "Signing in — Kya & Co.") },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AppSignInReturn,
});

function AppSignInReturn() {
  const { t } = useTranslation();
  const router = useRouter();
  const [handoff, setHandoff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const params = readAppReturnParams(window.location.search);

    if (!isNativeApp()) {
      // The browser sheet (or a stray visit): pass the result to the app.
      if (!params.code && !params.error) {
        void router.navigate({ to: "/auth", replace: true });
        return;
      }
      const url = appCallbackUrl(params);
      setHandoff(url);
      window.location.replace(url);
      return;
    }

    void finishInApp(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function finishInApp(p: AppReturnParams) {
    if (nativePluginAvailable("Browser")) {
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.close();
      } catch { /* already closed */ }
    }
    const fail = (err: string) => {
      track("native_oauth_failed", { provider: p.provider, platform: nativePlatform(), stage: "web_fallback", err: err.replace(/\s+/g, " ").slice(0, 80) });
    };
    if (p.error || !p.code) {
      fail(p.error ?? "no code");
      setError(t("appSignInReturn.didNotFinish", "Sign-in didn't finish. Please try again."));
      return;
    }
    try {
      // Supabase may already have used the code while starting up on this URL.
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(p.code);
        if (exchangeError) throw exchangeError;
      }
      track("native_oauth_exchanged", { provider: p.provider, via: "web_fallback" });
      void router.navigate({ href: p.next, replace: true } as never);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e));
      setError(authErrorMessage(e, t("appSignInReturn.didNotFinish", "Sign-in didn't finish. Please try again.")));
    }
  }

  return (
    <FrontDoorPage>
      <FrontDoorHeader title={error ? t("appSignInReturn.errorTitle", "Sign-in didn't finish") : t("appSignInReturn.title", "Finishing sign-in")} />
      <FrontDoorBody>
        {error ? (
          <>
            <FrontDoorError>{error}</FrontDoorError>
            <p className="m-0 text-center text-[14px]">
              <Link to="/auth" replace className="inline-flex min-h-[44px] items-center font-[700]" style={{ color: K.moss }}>
                {t("appSignInReturn.backToSignIn", "Back to sign in")}
              </Link>
            </p>
          </>
        ) : (
          <>
            <div className="flex justify-center py-4" style={{ color: K.moss }}>
              <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            </div>
            {handoff && (
              <KyaPrimaryButton onClick={() => window.location.replace(handoff)}>
                {t("appSignInReturn.returnToApp", "Return to Kya & Co.")}
              </KyaPrimaryButton>
            )}
          </>
        )}
      </FrontDoorBody>
    </FrontDoorPage>
  );
}
