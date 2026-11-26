// The billing screens on Membership (backlog 1.14 and 1.14a, switched off).
// Shows the ordinary Membership page unless BILLING_ENABLED is on for this
// deployment, and never in the native app. Which screen shows is decided by
// billingScreen (src/lib/billing.ts); the designs are in BillingScreens.tsx.
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { K, KyaCard } from "@/components/kya";
import {
  BillingConfirming, BillingMembership, BillingPastDue, BillingWelcome,
  CardStepAfterSeason, CardStepSeasonFounder, CardStepSeasonMember, type MembershipSub,
} from "@/components/flock/BillingScreens";
import { getBillingState, openBillingPortal, startBillingCheckout } from "@/lib/billing.functions";
import { billingDay, billingScreen, CONFIRM_WAIT_MS, cardStep, type CheckoutChoice } from "@/lib/billing";
import { pickLocale } from "@/lib/i18n/config";
import { isNativeApp } from "@/lib/nativeApp";

export function BillingCardStep({ returned, page, soon }: {
  returned: boolean;
  /** The ordinary Membership page, with `slot` under its summary card. */
  page: (slot: ReactNode) => ReactNode;
  /** What that slot says while billing is off. */
  soon: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const locale = pickLocale(i18n.language);
  const navigate = useNavigate();
  // Read after mount, so the server render and the first browser render match.
  const [native, setNative] = useState<boolean | null>(null);
  useEffect(() => setNative(isNativeApp()), []);
  // Back from Checkout, the webhook may take a moment. Stop waiting after a while.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!returned) return;
    const id = window.setTimeout(() => setSlow(true), CONFIRM_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [returned]);
  const stateFn = useServerFn(getBillingState);
  const checkoutFn = useServerFn(startBillingCheckout);
  const portalFn = useServerFn(openBillingPortal);
  const { data } = useQuery({
    queryKey: ["flock", "billing"],
    enabled: native === false,
    queryFn: () => stateFn(),
    refetchInterval: (q) => (returned && !slow && q.state.data?.enabled && !q.state.data.subscription ? 3000 : false),
  });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const step = cardStep(data, native !== false);
  // Billing off (or the native app): exactly what Membership showed before.
  if (step.kind === "hidden" || !data?.enabled) return <>{page(soon)}</>;

  if (step.kind === "not_ready") {
    return (
      <>
        {page(
          <KyaCard className="p-5">
            <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
              {t("flock.billing.notReady", "Adding a card opens once the free season's end is set.")}
            </p>
          </KyaCard>,
        )}
      </>
    );
  }

  const go = async (fn: () => Promise<{ ok: true; url: string } | { ok: false }>) => {
    setBusy(true);
    setFailed(false);
    const res = await fn().catch(() => ({ ok: false as const }));
    if (res.ok) window.location.assign(res.url);
    else { setFailed(true); setBusy(false); }
  };
  const checkout = (choice: CheckoutChoice) => go(() => checkoutFn({ data: { choice, locale } }));
  const manage = () => go(() => portalFn({ data: { locale } }));
  const shared = { prices: data.prices, busy, failed, onCheckout: checkout };

  const screen = billingScreen(step, returned);
  if (screen === "confirming") return <BillingConfirming slow={slow} />;
  if (step.kind === "choose") {
    const date = billingDay(step.firstChargeOn, locale);
    if (screen === "after_season") return <CardStepAfterSeason {...shared} founding={step.founding} />;
    if (screen === "season_founder") return <CardStepSeasonFounder {...shared} date={date} spot={data.foundingSpot} />;
    return <CardStepSeasonMember {...shared} date={date} />;
  }

  const sub: MembershipSub = {
    plan: step.plan,
    status: step.status,
    periodEnd: data.subscription?.current_period_end ?? null,
    willRenew: step.willRenew,
    last4: data.subscription?.card_last4 ?? null,
  };
  if (screen === "welcome" && step.firstChargeOn) {
    return (
      <BillingWelcome
        founder={step.plan === "founding"}
        spot={data.foundingSpot}
        plan={step.plan}
        date={billingDay(step.firstChargeOn, locale)}
        last4={sub.last4}
        onMembership={() => void navigate({ to: "/flock/you/membership", search: {}, replace: true })}
      />
    );
  }
  if (screen === "past_due") return <BillingPastDue sub={sub} busy={busy} failed={failed} onManage={manage} />;
  return <BillingMembership sub={sub} busy={busy} failed={failed} onManage={manage} />;
}
