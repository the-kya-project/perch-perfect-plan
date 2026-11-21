// "Open in the Kya & Co. app" for people who land in an iPhone browser from an
// email link (see lib/openInApp.ts for which pages and how it falls back).
//   bar  — top of an app screen; can be closed for the rest of the visit.
//   card — on /auth, above the sign-in options, pointing at the screen the
//          email was for.
// Decided after mount: the server can't see the device, so rendering from the
// user agent during the first render would break hydration.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Smartphone, X } from "lucide-react";
import { K } from "@/components/kya";
import { APP_STORE_URL } from "@/lib/storeLinks";
import { APP_URL_SCHEME_LIVE, isIPhoneBrowser, openInApp } from "@/lib/openInApp";
import { track } from "@/lib/analytics";

const DISMISS_KEY = "kya:openInAppDismissed";

export function OpenInAppBar({ path, variant }: { path: string | null; variant: "bar" | "card" }) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!APP_URL_SCHEME_LIVE || !path || !isIPhoneBrowser()) return setShow(false);
    let dismissed = false;
    try { dismissed = variant === "bar" && sessionStorage.getItem(DISMISS_KEY) === "1"; } catch { /* storage blocked */ }
    setShow(!dismissed);
  }, [path, variant]);

  if (!show || !path) return null;

  const open = () => {
    track("open_in_app_tapped", { surface: variant });
    openInApp(path, APP_STORE_URL);
  };
  const dismiss = () => {
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch { /* storage blocked */ }
    setShow(false);
  };
  const button = (
    <button
      type="button"
      onClick={open}
      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-[700] active:scale-[0.98]"
      style={{ background: K.lime, color: K.forest }}
    >
      <Smartphone className="size-4" aria-hidden="true" />
      {t("openInApp.button", "Open in the Kya & Co. app")}
    </button>
  );

  if (variant === "card") {
    return (
      <div className="flex flex-col gap-3 rounded-[18px] p-4" style={{ background: K.forest, color: "#fff" }}>
        <p className="m-0 text-[14.5px] leading-[1.45]">
          {t("openInApp.cardBody", "Have the app on this iPhone? Open this there instead.")}
        </p>
        {button}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2" style={{ background: K.forest, color: "#fff" }}>
      <div className="min-w-0 flex-1">{button}</div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t("openInApp.dismiss", "Not now")}
        className="grid size-11 shrink-0 place-items-center rounded-full active:scale-95"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}
