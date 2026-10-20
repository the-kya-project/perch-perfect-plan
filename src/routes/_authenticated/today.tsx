import { createFileRoute } from "@tanstack/react-router";
import { CaregiverHome, CaregiverEmpty, CaregiverLoading, useActiveCaregiver } from "@/components/CaregiverHome";
import { InkHero } from "@/components/system";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

// /today — the active-caregiver Today view. Dedicated route reached from the
// bottom nav's second tab (Sits → Today swap while an assignment is active).
// When no assignment is active, falls back to a calm empty state with the
// upcoming-assignment countdown ("Today's check starts in N days").
export const Route = createFileRoute("/_authenticated/today")({
  head: () => ({ meta: [{ title: i18next.t("todayPage.pageTitle", "Today — Kya & Co.") }] }),
  component: TodayPage,
});

function TodayPage() {
  const { t } = useTranslation();
  const { data, isLoading } = useActiveCaregiver();
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--cream)] pb-nav">
        <div className="mx-auto max-w-md">
          <InkHero eyebrow={t("todayPage.today", "Today")} headline={t("todayPage.loading", "Loading…")} />
          <main className="px-5 pt-5"><CaregiverLoading /></main>
        </div>
      </div>
    );
  }
  if (!data || data.sits.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--cream)] pb-nav">
        <div className="mx-auto max-w-md">
          <InkHero eyebrow={t("todayPage.today", "Today")} headline={t("todayPage.nothingOnForToday", "Nothing on for today.")} />
          <main className="px-5 pt-5"><CaregiverEmpty upcoming={data?.upcoming ?? null} /></main>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <CaregiverHome data={data} />
      </div>
    </div>
  );
}
