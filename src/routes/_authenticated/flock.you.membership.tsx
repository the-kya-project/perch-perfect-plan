import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaIconTile } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { membershipSummary } from "@/lib/flockProfile";
import { useIsAdmin, useMyEntitlements } from "@/lib/flockData";

// Membership and billing: what access you have, from your entitlements. No
// payment actions yet (the payments step adds them).
export const Route = createFileRoute("/_authenticated/flock/you/membership")({
  component: FlockMembership,
});

function FlockMembership() {
  const { t } = useTranslation();
  const { data: ents, isLoading } = useMyEntitlements();
  const { data: isAdmin } = useIsAdmin();
  const m = membershipSummary(ents ?? [], !!isAdmin);
  return (
    <FlockSubPage title={t("flock.you.membership", "Membership and billing")} fallback="/flock/you">
      <KyaCard className="p-5">
        <div className="flex items-start gap-3">
          <KyaIconTile tone="lime"><CreditCard className="size-5" /></KyaIconTile>
          <div className="min-w-0">
            <p className="m-0 text-[17px] font-[700]" style={{ color: K.forest }}>{isLoading ? " " : m.title}</p>
            <p className="m-0 mt-1 text-[15px] leading-[1.5]" data-testid="membership-line" style={{ color: K.ink }}>{isLoading ? " " : m.line}</p>
          </div>
        </div>
      </KyaCard>
      <p className="m-0 px-1 text-[14px] leading-[1.5]" style={{ color: K.quiet }}>
        {t("flock.membership.billingSoon", "Billing details and changes will live here once payments open.")}
      </p>
    </FlockSubPage>
  );
}
