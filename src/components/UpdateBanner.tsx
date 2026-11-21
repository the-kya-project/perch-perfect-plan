// "A new version is ready. Update when you're done." Shown only while a new
// build is waiting AND a form is in progress (sw-register.ts applies updates
// quietly otherwise). Update saves every draft, then reloads. If something on
// screen can't be kept as a draft (a clip mid-upload), the button waits until
// it's finished.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "@tanstack/react-router";
import { sitterI18n } from "@/lib/i18n";
import { Loader2 } from "lucide-react";
import { K } from "@/components/kya";
import { subscribeUpdate, updateIsReady, updateNow } from "@/lib/sw-register";
import { formInProgress, subscribeForms, unsavedWorkWithoutDraft } from "@/lib/formsInProgress";

function read() {
  return { ready: updateIsReady(), busy: formInProgress(), blocked: unsavedWorkWithoutDraft() };
}

export function UpdateBanner() {
  // Mounted at the root, outside the sitter page's own language: on a sit link
  // use the sitter's (their toggle can differ from the browser's).
  const onSitLink = useLocation({ select: (l) => l.pathname.startsWith("/sitter/") });
  const { t } = useTranslation(undefined, onSitLink && sitterI18n.isInitialized ? { i18n: sitterI18n } : undefined);
  // Starts hidden on the server and the first client render (no hydration
  // difference); the real state arrives from the subscriptions after mount.
  const [state, setState] = useState({ ready: false, busy: false, blocked: false });
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    const sync = () => setState(read());
    sync();
    const offUpdate = subscribeUpdate(sync);
    const offForms = subscribeForms(sync);
    // Forms report "pending" from refs; a slow poll catches what isn't notified.
    const id = window.setInterval(sync, 2000);
    return () => { offUpdate(); offForms(); window.clearInterval(id); };
  }, []);

  if (!state.ready || (!state.busy && !updating)) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+8px)] z-[90] px-3">
      <div
        role="status"
        className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-[18px] border bg-white py-2.5 pl-4 pr-2.5 shadow-[0_6px_24px_rgba(18,41,31,0.16)]"
        style={{ borderColor: K.line, color: K.forest }}
      >
        <p className="m-0 min-w-0 flex-1 text-[14px] leading-[1.4]">
          {state.blocked && !updating
            ? t("update.readyFinishFirst", "A new version is ready. Finish what you're doing, then update.")
            : t("update.ready", "A new version is ready. Update when you're done.")}
        </p>
        <button
          type="button"
          disabled={state.blocked || updating}
          onClick={() => { setUpdating(true); void updateNow(); }}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-[700] disabled:opacity-50"
          style={{ background: K.forest, color: "#fff" }}
        >
          {updating && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {t("update.update", "Update")}
        </button>
      </div>
    </div>
  );
}
