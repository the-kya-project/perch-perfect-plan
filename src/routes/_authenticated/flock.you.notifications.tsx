import { createFileRoute } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";

export const Route = createFileRoute("/_authenticated/flock/you/notifications")({
  component: FlockNotifications,
});

function FlockNotifications() {
  const { t } = useTranslation();
  return (
    <FlockSubPage title={t("flock.you.notifications", "Notifications")} line={t("flock.you.notificationsLine", "Community is separate from care reminders")} fallback="/flock/you">
      <FlockEmpty icon={<Bell className="size-6" />} title={t("flock.notifications.soonTitle", "Coming soon")}>
        {t("flock.notifications.soon", "You'll choose which Community updates reach you here. Your care reminders won't change.")}
      </FlockEmpty>
    </FlockSubPage>
  );
}
