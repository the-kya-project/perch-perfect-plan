/**
 * The "turn on reminders" card at the top of Home, inside the app only.
 *
 * Weigh-in and check-in reminders only reach a phone that has registered for
 * push, and the only other asks (the getting-started checklist, the callout at
 * the top of Settings) are easy to miss: the checklist disappears after 30
 * days, and a fresh install on an older account never sees it again. In
 * October 2026 only 3 of 30 owners with birds had push set up. So Home asks,
 * for every owner, until push is on or they say "not now".
 *
 * Same card and copy as Settings (NotificationsCallout), plus "Not now", which
 * hides it on this device for 14 days. Hidden entirely when:
 *   - not in the app (phone browsers and desktop are Settings' job)
 *   - the shell predates the push plugin (it needs an update, not a prompt)
 *   - permission is already granted
 *   - the owner switched push off in Settings (that was a choice, not a miss)
 */
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { NotificationsCallout } from "@/components/NotificationsCallout";
import { useAppSurface } from "@/lib/appSurface";
import { savePushToken } from "@/lib/push.functions";
import { track } from "@/lib/analytics";
import { useTranslation } from "react-i18next";
import {
  nativePushAvailable,
  nativePushOptedOut,
  registerForNativePush,
  setNativePushOptedOut,
  syncNativePushToken,
} from "@/lib/pushNative";

const SNOOZE_KEY = "kya_home_push_banner_snoozed_until";
const SNOOZE_MS = 14 * 86_400_000;

function snoozed(): boolean {
  try {
    return Number(window.localStorage.getItem(SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

export function HomePushBanner({ birdNames }: { birdNames: string[] }) {
  const { t } = useTranslation();
  const surface = useAppSurface();
  const saveToken = useServerFn(savePushToken);
  const [available, setAvailable] = useState(false);
  const [hidden, setHidden] = useState(() => snoozed() || nativePushOptedOut());
  const [busy, setBusy] = useState(false);
  // Set when the prompt is declined here. The system alert does not reliably
  // fire focus/visibilitychange, so useAppSurface may not notice on its own.
  const [deniedHere, setDeniedHere] = useState(false);

  useEffect(() => {
    if (surface.surface !== "native") return;
    let cancelled = false;
    void nativePushAvailable().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [surface.surface]);

  // Turned on in the phone's Settings app and come back: the card hides, but
  // the token would otherwise wait for the next launch to reach the server.
  const sawNotGranted = useRef(false);
  useEffect(() => {
    if (surface.surface !== "native" || !surface.ready) return;
    if (surface.nativePermission !== "granted") {
      sawNotGranted.current = true;
    } else if (sawNotGranted.current) {
      sawNotGranted.current = false;
      void syncNativePushToken((token, transport) => saveToken({ data: { token, transport } }));
    }
  }, [surface.surface, surface.ready, surface.nativePermission, saveToken]);

  const show =
    surface.surface === "native" &&
    surface.ready &&
    available &&
    !hidden &&
    birdNames.length > 0 &&
    surface.nativePermission !== "granted";

  useEffect(() => {
    if (show) track("push_banner_shown", { permission: surface.nativePermission });
  }, [show, surface.nativePermission]);

  if (!show) return null;

  async function enable() {
    setBusy(true);
    try {
      const res = await registerForNativePush();
      if (!res.ok) {
        // "denied" flips the card to the phone-settings state. Anything else
        // is worth a retry.
        if (res.reason === "denied") setDeniedHere(true);
        else toast.error(t("homePushBanner.couldNotTurnOn", "Could not turn on notifications. Please try again."));
        track("push_banner_result", { result: res.reason });
        return;
      }
      await saveToken({ data: { token: res.token, transport: res.transport } });
      setNativePushOptedOut(false);
      setHidden(true);
      track("push_banner_result", { result: "enabled" });
      toast.success(t("homePushBanner.remindersOn", "Reminders are on."));
    } catch {
      toast.error(t("homePushBanner.couldNotTurnOn", "Could not turn on notifications. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    try {
      window.localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      /* storage unavailable: hidden for this visit only */
    }
    setHidden(true);
    track("push_banner_result", { result: "not_now" });
  }

  return (
    <NotificationsCallout
      state={
        deniedHere || surface.nativePermission === "denied"
          ? { kind: "native-denied", canOpenSettings: false }
          : { kind: "native-prompt" }
      }
      birdLabel={birdNames.length === 1 ? birdNames[0] : t("homePushBanner.yourBirds", "your birds")}
      busy={busy}
      onEnable={enable}
      onDismiss={dismiss}
      secondaryButton
    />
  );
}
