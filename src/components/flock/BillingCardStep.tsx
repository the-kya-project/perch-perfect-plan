// The card step on Membership (backlog 1.14, switched off). Renders nothing
// unless BILLING_ENABLED is on for this deployment, and never in the native
// app. Spec: docs/flock/payments-plan.md items 1–3 of the payments build.
import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaPrimaryButton, KyaSecondaryButton } from "@/components/kya";
import { getBillingState, openBillingPortal, startBillingCheckout } from "@/lib/billing.functions";
import { BILLING_CHOICES, cardStep, type BillingChoice } from "@/lib/billing";
import { formatCents } from "@/lib/gifts";
import { day } from "@/lib/flockProfile";
import { isNativeApp } from "@/lib/nativeApp";

export function BillingCardStep({ returned, fallback }: { returned: boolean; fallback: ReactNode }) {
  const { t } = useTranslation();
  // Read after mount, so the server render and the first browser render match.
  const [native, setNative] = useState<boolean | null>(null);
  useEffect(() => setNative(isNativeApp()), []);
  const stateFn = useServerFn(getBillingState);
  const checkoutFn = useServerFn(startBillingCheckout);
  const portalFn = useServerFn(openBillingPortal);
  const { data } = useQuery({
    queryKey: ["flock", "billing"],
    enabled: native === false,
    queryFn: () => stateFn(),
    // Just back from Checkout: the webhook may take a moment to write the row.
    refetchInterval: (q) => (returned && q.state.data?.enabled && !q.state.data.subscription ? 3000 : false),
  });
  const [choice, setChoice] = useState<BillingChoice>("annual");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const step = cardStep(data, native !== false);
  // Billing off (or the native app): exactly what Membership showed before.
  if (step.kind === "hidden") return <>{fallback}</>;

  const go = async (fn: () => Promise<{ ok: true; url: string } | { ok: false }>) => {
    setBusy(true);
    setFailed(false);
    const res = await fn().catch(() => ({ ok: false as const }));
    if (res.ok) window.location.assign(res.url);
    else { setFailed(true); setBusy(false); }
  };
  const price = (plan: "founding" | "monthly" | "annual") => {
    const cents = data?.enabled ? data.prices[plan] : undefined;
    return cents == null ? "" : formatCents(cents);
  };
  const errorLine = failed && (
    <p role="alert" className="m-0 mt-3 text-[14px]" style={{ color: K.red }}>
      {t("flock.billing.error", "That didn't work. Try again in a moment.")}
    </p>
  );

  if (step.kind === "not_ready") {
    return (
      <KyaCard className="p-5">
        <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
          {t("flock.billing.notReady", "Adding a card opens once the free season's end is set.")}
        </p>
      </KyaCard>
    );
  }

  if (step.kind === "on_file") {
    return (
      <KyaCard className="p-5">
        <p className="m-0 text-[17px] font-[700]" style={{ color: K.forest }}>{t("flock.billing.onFile", "Card on file")}</p>
        <p className="m-0 mt-1 text-[15px] leading-[1.5]" data-testid="billing-on-file" style={{ color: K.ink }}>
          {step.firstChargeOn
            ? t("flock.billing.firstChargeOn", "First charge on {{date}}.", { date: day(step.firstChargeOn) })
            : step.status === "past_due"
              ? t("flock.billing.pastDue", "Your last payment didn't go through. Update your card to keep your membership.")
              : step.willRenew
                ? t("flock.billing.renews", "Your membership renews automatically.")
                : t("flock.billing.ends", "Your membership won't renew.")}
        </p>
        <div className="mt-4">
          <KyaSecondaryButton disabled={busy} onClick={() => go(() => portalFn())}>
            {t("flock.billing.manage", "Manage billing")}
          </KyaSecondaryButton>
        </div>
        {errorLine}
      </KyaCard>
    );
  }

  const when = step.chargedToday
    ? t("flock.billing.chargedToday", "You'll be charged today.")
    : t("flock.billing.zeroToday", "$0 today. Your first charge is on {{date}}.", { date: day(step.firstChargeOn) });

  return (
    <KyaCard className="p-5">
      <p className="m-0 text-[17px] font-[700]" style={{ color: K.forest }}>{t("flock.billing.addCard", "Add a card")}</p>
      {returned && (
        <p className="m-0 mt-1 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
          {t("flock.billing.confirming", "We're confirming your card. This can take a minute.")}
        </p>
      )}
      {step.founding ? (
        <p className="m-0 mt-1 text-[15px] leading-[1.5]" data-testid="billing-founding" style={{ color: K.ink }}>
          {t("flock.billing.founding", "Founding price: {{price}} a month, locked in for as long as you stay a member.", { price: price("founding") })}
        </p>
      ) : (
        <fieldset className="m-0 mt-3 border-0 p-0">
          <legend className="sr-only">{t("flock.billing.choose", "Choose a plan")}</legend>
          {BILLING_CHOICES.map((c) => (
            <label key={c} className="flex min-h-[44px] items-center gap-3 text-[15px]" style={{ color: K.ink }}>
              <input type="radio" name="billing-plan" value={c} checked={choice === c} onChange={() => setChoice(c)} />
              {c === "annual"
                ? t("flock.billing.yearly", "Yearly: {{price}} a year", { price: price("annual") })
                : t("flock.billing.monthly", "Monthly: {{price}} a month", { price: price("monthly") })}
            </label>
          ))}
        </fieldset>
      )}
      <p className="m-0 mt-2 text-[14px] leading-[1.5]" style={{ color: K.quiet }}>{when}</p>
      <div className="mt-4">
        <KyaPrimaryButton disabled={busy} onClick={() => go(() => checkoutFn({ data: { choice } }))}>
          {t("flock.billing.addCard", "Add a card")}
        </KyaPrimaryButton>
      </div>
      {errorLine}
    </KyaCard>
  );
}
