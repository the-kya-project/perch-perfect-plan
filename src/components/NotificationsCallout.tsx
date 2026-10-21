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
import type { ReactNode } from "react";
import { Bell, BellOff } from "lucide-react";
import { K, KyaCard, KyaHeading, KyaIconTile } from "@/components/kya";
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

/** The sunflower main button, sized to its label so "Not now" fits beside it. */
function CompactPrimary({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-[48px] items-center justify-center rounded-full border-2 px-5 text-[15px] font-[700] disabled:opacity-45"
      style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
    >
      {children}
    </button>
  );
}

/** White card: forest icon tile, Newsreader title, muted body, actions. */
function CalloutCard({ icon, title, body, children }: { icon: ReactNode; title: ReactNode; body: ReactNode; children?: ReactNode }) {
  return (
    <KyaCard style={{ color: K.forest }}>
      <div className="flex items-start gap-3 p-4">
        <KyaIconTile size={40}>{icon}</KyaIconTile>
        <div className="min-w-0 flex-1">
          <KyaHeading size={19} as="h2">{title}</KyaHeading>
          <p className="m-0 mt-1 text-[15px] leading-[1.5]" style={{ color: K.quiet }}>{body}</p>
          {children}
        </div>
      </div>
    </KyaCard>
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
      className="min-h-[44px] whitespace-nowrap px-2.5 text-[15px] font-[700] disabled:opacity-50"
      style={{ color: K.moss }}
    >
      {t("notificationsCallout.notNow", "Not now")}
    </button>
  );

  // Push is on and working. Saying so would just be noise on a settings screen
  // whose per-event toggles already say what reaches the phone.
  if (state.kind === "native-granted") return null;

  if (state.kind === "native-prompt") {
    return (
      <CalloutCard
        icon={<Bell className="size-5" />}
        title={t("notificationsCallout.turnOnReminders", "Turn on reminders")}
        body={t("notificationsCallout.turnOnRemindersBody", "We'll let you know when it's time to weigh {{bird}} and when a check-in is due. You can change this anytime.", { bird: birdLabel })}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <CompactPrimary onClick={onEnable} disabled={busy}>
            {/* Shorter beside "Not now" so the pair fits one line on a phone. */}
            {onDismiss ? t("notificationsCallout.turnOn", "Turn on") : t("notificationsCallout.turnOnNotifications", "Turn on notifications")}
          </CompactPrimary>
          {notNow}
        </div>
      </CalloutCard>
    );
  }

  if (state.kind === "native-denied") {
    return (
      <CalloutCard
        icon={<BellOff className="size-5" />}
        title={t("notificationsCallout.notificationsAreOff", "Notifications are off")}
        body={t("notificationsCallout.notificationsAreOffBody", "To get reminders, turn on notifications for Kya & Co. in your phone's settings.")}
      >
        {/* Android has no supported way to open the app's settings page
            without another plugin, so it gets the sentence and no button
            rather than a button that does nothing. */}
        {((state.canOpenSettings && onOpenSettings) || notNow) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {state.canOpenSettings && onOpenSettings && (
              <CompactPrimary onClick={onOpenSettings} disabled={busy}>
                {t("notificationsCallout.openSettings", "Open settings")}
              </CompactPrimary>
            )}
            {notNow}
          </div>
        )}
      </CalloutCard>
    );
  }

  if (state.kind === "web-mobile") {
    return (
      <CalloutCard
        icon={<Bell className="size-5" />}
        title={t("notificationsCallout.getTheApp", "Get the Kya & Co. app")}
        body={t("notificationsCallout.getTheAppBody", "Reminders, quick logging, and your flock's whole record, right on your phone. Same account, nothing to move over.")}
      >
        <StoreBadge platform={state.platform} />
      </CalloutCard>
    );
  }

  // Desktop: no install prompt. One line, so the per-event push toggles below
  // are not mysterious on a machine that will never receive a push.
  return (
    <p className="m-0 px-4 text-[13px] leading-[1.45]" style={{ color: K.quiet }}>
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
