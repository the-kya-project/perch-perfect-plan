import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useActiveCaregiver } from "@/components/CaregiverHome";
import { KyaCaregiverToday, KyaCaregiverEmpty, KyaCaregiverLoading, caregiverGreeting, caregiverBackLine } from "@/components/CaregiverToday";
import { KyaPage, KyaBody } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
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
  const navigate = useNavigate();
  const goBack = useGoBack(useCallback(() => navigate({ to: "/dashboard" }), [navigate]));
  const { data, isLoading } = useActiveCaregiver();
  if (isLoading) {
    return (
      <KyaPage>
        <PageHeader title={t("todayPage.today", "Today")} onBack={goBack} />
        <KyaBody><KyaCaregiverLoading /></KyaBody>
      </KyaPage>
    );
  }
  if (!data || data.sits.length === 0) {
    return (
      <KyaPage>
        <PageHeader title={t("todayPage.nothingOnTitle", "Nothing on for today")} onBack={goBack} />
        <KyaBody><KyaCaregiverEmpty upcoming={data?.upcoming ?? null} /></KyaBody>
      </KyaPage>
    );
  }
  // One sit: its "back in N days" line sits under the greeting. Several: each
  // block carries its own line.
  const single = data.sits.length === 1 ? data.sits[0] : null;
  return (
    <KyaPage>
      <PageHeader
        title={caregiverGreeting(t)}
        line={single ? caregiverBackLine(t, single) : undefined}
        onBack={goBack}
      />
      <KyaBody className="gap-6">
        <KyaCaregiverToday sits={data.sits} />
      </KyaBody>
    </KyaPage>
  );
}
