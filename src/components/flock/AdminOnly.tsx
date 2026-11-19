import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaBackRow, KyaBody, KyaHeader, KyaPage, KyaPrimaryButton, KyaTitle } from "@/components/kya";
import { useIsAdmin } from "@/lib/flockData";

/** An admin page's body, or a spinner while checking, or "Page not available"
 *  for anyone else. A courtesy only: the database refuses non-admins anyway. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: isAdmin, isLoading } = useIsAdmin();
  if (isLoading) {
    return <KyaPage><div className="grid min-h-[60vh] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-8 animate-spin" style={{ color: K.moss }} /></div></KyaPage>;
  }
  if (!isAdmin) {
    return (
      <KyaPage>
        <KyaHeader>
          <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/dashboard" })} />
          <KyaTitle title={t("flock.review.notAvailable", "Page not available")} line={t("flock.ideasAdmin.adminOnly", "This page is only for Kya & Co. admins.")} />
        </KyaHeader>
        <KyaBody><KyaPrimaryButton onClick={() => void navigate({ to: "/dashboard" })}>{t("flock.review.home", "Go to Home")}</KyaPrimaryButton></KyaBody>
      </KyaPage>
    );
  }
  return <>{children}</>;
}
