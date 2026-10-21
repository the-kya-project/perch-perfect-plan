/**
 * The notifications callout at the top of Settings.
 *
 * Replaces the "add this app to your home screen" advice, which existed only
 * because iOS web push needed a standalone install. Both store apps are live
 * with real APNs/FCM push, so the answer on a phone is now "get the app", and
 * inside the app it is "turn on notifications".
 *
 * Five states, and one of them is deliberately nothing:
 *
 *   in the app, push granted        -> render nothing at all
 *   in the app, not asked / prompt  -> ask, with the native permission flow
 *   in the app, denied at OS level  -> point at the OS settings page
 *   mobile browser                  -> get the app, one store badge
 *   desktop browser                 -> one quiet line, no install push
 */
import { Bell, BellOff } from "lucide-react";
import { Card, IconTile, PrimaryButton } from "@/components/system";
import {
  APP_STORE_BADGE, APP_STORE_BADGE_SIZE, APP_STORE_URL,
  PLAY_STORE_BADGE, PLAY_STORE_BADGE_SIZE, PLAY_STORE_URL,
} from "@/lib/storeLinks";
import type { CalloutState } from "@/lib/notificationsCallout";
import { useTranslation, Trans } from "react-i18next";

function StoreBadge({ platform }: { platform: "ios" | "android" }) {
  const { t } = useTranslation();
  const ios = platform === "ios";
  const size = ios ? APP_STORE_BADGE_SIZE : PLAY_STORE_BADGE_SIZE;
  return (
    <a
      href={ios ? APP_STORE_URL : PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex min-h-[44px] items-center"
    >
      <img
        src={ios ? APP_STORE_BADGE : PLAY_STORE_BADGE}
        width={size.width}
        height={size.height}
        alt={ios ? t("notificationsCallout.appStoreBadgeAlt", "Download on the App Store") : t("notificationsCallout.playStoreBadgeAlt", "Get it on Google Play")}
        style={{ width: size.width, height: size.height }}
      />
    </a>
  );
}

export function NotificationsCallout({
  state,
  birdLabel,
  busy,
  onEnable,
  onOpenSettings,
  onDismiss,
}: {
  state: CalloutState;
  /** The bird's name, or "your birds" when there is more than one. */
  birdLabel: string;
  busy?: boolean;
  onEnable: () => void;
  /** Absent while nothing we ship can open the OS settings page. */
  onOpenSettings?: () => void;
  /** Home only: adds "Not now" to the two in-app states. Settings has none. */
  onDismiss?: () => void;
}) {
  const { t } = useTranslation();
  const notNow = onDismiss && (
    <button
      type="button"
      onClick={onDismiss}
      disabled={busy}
      className="min-h-[44px] whitespace-nowrap px-2.5 text-[15px] text-[var(--mute)] disabled:opacity-50"
    >
      {t("notificationsCallout.notNow", "Not now")}
    </button>
  );

  // Push is on and working. Saying so would just be noise on a settings screen
  // whose per-event toggles already say what reaches the phone.
  if (state.kind === "native-granted") return null;

  if (state.kind === "native-prompt") {
    return (
      <Card>
        <div className="flex items-start gap-3 p-4">
          <IconTile size={38} icon={<Bell className="size-5" />} />
          <div className="min-w-0 flex-1">
            <div className="t-item">{t("notificationsCallout.turnOnReminders", "Turn on reminders")}</div>
            <p className="t-body mt-1 text-[var(--mute)]">
              {t("notificationsCallout.turnOnRemindersBody", "We'll let you know when it's time to weigh {{bird}} and when a check-in is due. You can change this anytime.", { bird: birdLabel })}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <PrimaryButton tone="sunflower" full={false} onPress={onEnable} disabled={busy}>
                {/* Shorter beside "Not now" so the pair fits one line on a phone. */}
                {onDismiss ? t("notificationsCallout.turnOn", "Turn on") : t("notificationsCallout.turnOnNotifications", "Turn on notifications")}
              </PrimaryButton>
              {notNow}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (state.kind === "native-denied") {
    return (
      <Card>
        <div className="flex items-start gap-3 p-4">
          <IconTile size={38} icon={<BellOff className="size-5" />} />
          <div className="min-w-0 flex-1">
            <div className="t-item">{t("notificationsCallout.notificationsAreOff", "Notifications are off")}</div>
            <p className="t-body mt-1 text-[var(--mute)]">
              {t("notificationsCallout.notificationsAreOffBody", "To get reminders, turn on notifications for Kya & Co. in your phone's settings.")}
            </p>
            {/* Android has no supported way to open the app's settings page
                without another plugin, so it gets the sentence and no button
                rather than a button that does nothing. */}
            {((state.canOpenSettings && onOpenSettings) || notNow) && (
              <div className="mt-3 flex items-center gap-2">
                {state.canOpenSettings && onOpenSettings && (
                  <PrimaryButton tone="sunflower" full={false} onPress={onOpenSettings} disabled={busy}>
                    {t("notificationsCallout.openSettings", "Open settings")}
                  </PrimaryButton>
                )}
                {notNow}
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  }

  if (state.kind === "web-mobile") {
    return (
      <Card>
        <div className="flex items-start gap-3 p-4">
          <IconTile size={38} icon={<Bell className="size-5" />} />
          <div className="min-w-0 flex-1">
            <div className="t-item">{t("notificationsCallout.getTheApp", "Get the Kya & Co. app")}</div>
            <p className="t-body mt-1 text-[var(--mute)]">
              {t("notificationsCallout.getTheAppBody", "Reminders, quick logging, and your flock's whole record, right on your phone. Same account, nothing to move over.")}
            </p>
            <StoreBadge platform={state.platform} />
          </div>
        </div>
      </Card>
    );
  }

  // Desktop: no install prompt. One line, so the per-event push toggles below
  // are not mysterious on a machine that will never receive a push.
  return (
    <p className="t-meta px-4 text-[var(--mute)]">
      <Trans
        i18nKey="notificationsCallout.desktopLine"
        defaults="Reminders go to your phone. Get the app for <1>iPhone</1> or <2>Android</2>."
        components={{
          1: <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="underline" />,
          2: <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="underline" />,
        }}
      />
    </p>
  );
}
