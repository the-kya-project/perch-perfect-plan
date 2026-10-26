// "Continue with Google" and "Continue with Apple" (everywhere but the Android
// app; see appleSignInAvailable): the
// one set of provider buttons for /auth and the invite and handoff
// create-account forms, so all three offer the same methods under the same
// conditions and go through the same sign-in code (lib/nativeOAuth).
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { KyaSecondaryButton } from "@/components/kya";
import { signInWithGoogle, signInWithApple } from "@/lib/nativeOAuth";
import { appleSignInAvailable } from "@/lib/nativeApp";
import { authErrorMessage } from "@/lib/authErrorMessage";

type Provider = "google" | "apple";

export function SocialSignInButtons({ redirectPath, beforeStart, disabled, onBusyChange, onError }: {
  /** Same-origin path the provider returns to (web) or that's pushed once the
   *  native sign-in finishes, e.g. "/welcome" or "/invite/<token>". */
  redirectPath: string;
  /** Runs right before the provider starts (/auth stashes its return path here). */
  beforeStart?: () => void;
  disabled?: boolean;
  /** True while a provider sign-in is running, so the page can hold its other buttons. */
  onBusyChange?: (busy: boolean) => void;
  /** Called with null when a sign-in starts and with the message when one fails. */
  onError: (message: string | null) => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<Provider | null>(null);
  // Read after mount, not during render: the server can't tell it's rendering
  // for one of the apps, so deciding during render made the server HTML and the
  // app's first render disagree whenever the app opened straight onto /auth
  // (React errors #422/#520, recovered by a re-render).
  const [showApple, setShowApple] = useState(false);
  useEffect(() => setShowApple(appleSignInAvailable()), []);

  async function start(provider: Provider) {
    onError(null);
    setBusy(provider);
    onBusyChange?.(true);
    try {
      beforeStart?.();
      const redirectTo = window.location.origin + redirectPath;
      if (provider === "apple") await signInWithApple(redirectTo);
      else await signInWithGoogle(redirectTo);
    } catch (err) {
      onError(provider === "apple"
        ? authErrorMessage(err, t("auth.appleSignInFailed", "Apple sign-in failed."))
        : authErrorMessage(err, t("auth.googleSignInFailed", "Google sign-in failed.")));
    } finally {
      setBusy(null);
      onBusyChange?.(false);
    }
  }

  const spinner = <Loader2 className="size-4 animate-spin" aria-hidden="true" />;
  const off = disabled || busy !== null;
  return (
    <>
      <KyaSecondaryButton
        className="w-full"
        icon={busy === "google" ? spinner : <GoogleIcon />}
        onClick={() => void start("google")}
        disabled={off}
      >
        {t("auth.continueWithGoogle", "Continue with Google")}
      </KyaSecondaryButton>
      {showApple && (
        <KyaSecondaryButton
          className="w-full"
          icon={busy === "apple" ? spinner : <AppleIcon />}
          onClick={() => void start("apple")}
          disabled={off}
        >
          {t("auth.continueWithApple", "Continue with Apple")}
        </KyaSecondaryButton>
      )}
    </>
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4-5.5 4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.3 14.6 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 12s4.3 9.7 9.6 9.7c5.6 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.417 2.2-1.11 2.98-.833.94-2.2 1.66-3.32 1.57-.14-1.1.42-2.27 1.06-2.99.72-.82 2-1.44 3.02-1.56.02.14.35.6.35 0zM20.5 17.02c-.55 1.27-.82 1.84-1.53 2.96-.99 1.56-2.39 3.5-4.12 3.51-1.54.02-1.93-1-4.02-.99-2.09.01-2.52 1.01-4.06.99-1.73-.02-3.05-1.77-4.04-3.33C-.05 16.5-.36 11.2 1.94 8.36 3.05 6.98 4.66 6.11 6.2 6.11c1.57 0 2.55 1 3.85 1 1.26 0 2.03-1 3.85-1 1.36 0 2.8.74 3.83 2.02-3.36 1.84-2.81 6.63.77 7.89z"/>
    </svg>
  );
}
