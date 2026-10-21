import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaSheet, KyaHeading, KyaIconTile, KyaSecondaryButton } from "@/components/kya";

// Shown when notifications are blocked at the device/browser level (permission
// "denied"). The web can't open OS app-notification settings directly, so this
// gives clear per-platform steps to turn them back on. After the user enables
// them in settings and returns, the settings page re-checks permission on focus.
export function NotificationsBlockedModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const steps = "m-0 mt-1.5 list-decimal space-y-1.5 pl-5 text-[15px] leading-[1.5]";
  return (
    <KyaSheet
      onClose={onClose}
      closeLabel={t("notificationsBlocked.close", "Close")}
      title={
        <div className="flex flex-col items-start gap-3">
          <KyaIconTile size={44}><Bell className="size-5" /></KyaIconTile>
          <KyaHeading size={24}>{t("notificationsBlocked.title", "Turn on notifications")}</KyaHeading>
        </div>
      }
      footer={
        <KyaSecondaryButton className="w-full" onClick={onClose}>
          {t("notificationsBlocked.done", "Done")}
        </KyaSecondaryButton>
      }
    >
      <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
        {t("notificationsBlocked.body", "Notifications are turned off for this app in your device settings. Your phone won't ask again, so you'll need to switch them on there — it only takes a few taps.")}
      </p>
      <div className="mt-5" style={{ color: K.ink }}>
        <p className="m-0 text-[15px] font-[700]" style={{ color: K.forest }}>{t("notificationsBlocked.iphoneIpad", "iPhone & iPad")}</p>
        <ol className={steps}>
          <li>{t("notificationsBlocked.iosStep1", "Open the Settings app.")}</li>
          <li>{t("notificationsBlocked.iosStep2", "Tap Notifications, then find “Kya & Co.”")}</li>
          <li>{t("notificationsBlocked.iosStep3", "Turn on “Allow Notifications.”")}</li>
        </ol>
      </div>
      <div className="mt-5" style={{ color: K.ink }}>
        <p className="m-0 text-[15px] font-[700]" style={{ color: K.forest }}>{t("notificationsBlocked.android", "Android")}</p>
        <ol className={steps}>
          <li>{t("notificationsBlocked.androidStep1", "Press and hold the app icon, then tap App info (ⓘ).")}</li>
          <li>{t("notificationsBlocked.androidStep2", "Tap Notifications.")}</li>
          <li>{t("notificationsBlocked.androidStep3", "Turn notifications on.")}</li>
        </ol>
        <p className="m-0 mt-3 text-[13.5px] leading-[1.45]" style={{ color: K.quiet }}>
          {t("notificationsBlocked.chromeHint", "Using Chrome without installing the app? Tap the ⋮ menu → Settings → Site settings → Notifications, then allow this site.")}
        </p>
      </div>
    </KyaSheet>
  );
}
