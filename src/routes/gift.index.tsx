import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { track } from "@/lib/analytics";
import { createGiftCheckout, getGiftOptions, type GiftOption } from "@/lib/gifts.functions";
import { formatCents, giftToday, GIFT_MESSAGE_MAX, GIFT_NAME_MAX, GIFT_SEND_LAST_DATE, type GiftPlan } from "@/lib/gifts";
import { K, KyaCard, KyaHeading } from "@/components/kya";
import { giftPlanName, giftTiming, planBlurb } from "@/lib/giftCopy";
import { FrontDoorBody, FrontDoorError, FrontDoorHeader, FrontDoorPage, LegalLinks } from "@/components/frontDoor";

// Gift memberships: a public page, no account needed to buy. Payment happens on
// Stripe Checkout; nothing is recorded until Stripe confirms it (see the
// webhook). The Flock itself stays hidden; this page doesn't link into it.
const search = z.object({
  canceled: z.union([z.literal(1), z.literal("1")]).optional().catch(undefined),
});

export const Route = createFileRoute("/gift/")({
  ssr: false,
  validateSearch: search,
  head: () => ({ meta: [
    { title: i18next.t("gift.pageTitle", "Give a gift membership — The Kya Project") },
    { name: "description", content: i18next.t("gift.metaDescription", "Give a year in the Flock or a year of app premium to the parrot person in your life.") },
  ]}),
  component: GiftPage,
});

const inputCls = "min-h-[48px] w-full rounded-[14px] border-[1.5px] bg-white px-4 text-[16px] outline-none focus-visible:border-[#2d6a4f] focus-visible:ring-2 focus-visible:ring-[#2d6a4f]/30";

function GiftPage() {
  const { t } = useTranslation();
  const { canceled } = Route.useSearch();
  const optionsFn = useServerFn(getGiftOptions);
  const checkoutFn = useServerFn(createGiftCheckout);
  const { data: opts, isLoading } = useQuery({ queryKey: ["gift-options"], queryFn: () => optionsFn(), staleTime: 10 * 60_000 });

  const today = giftToday();
  const [plan, setPlan] = useState<GiftPlan>("flock_year");
  const [recipientName, setRecipientName] = useState("");
  const [message, setMessage] = useState("");
  const [delivery, setDelivery] = useState<"email" | "self">("email");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendOn, setSendOn] = useState(today);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track("gift_page_viewed", { canceled: !!canceled });
  }, [canceled]);

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!recipientName.trim()) e.recipientName = t("gift.errName", "Add the name of the person you're giving this to.");
    if (message.length > GIFT_MESSAGE_MAX) e.message = t("gift.errMessage", "Keep the message to {{max}} characters.", { max: GIFT_MESSAGE_MAX });
    if (delivery === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail.trim())) e.recipientEmail = t("gift.errEmail", "Add the email address to send the gift to.");
      if (!sendOn || sendOn < today || sendOn > GIFT_SEND_LAST_DATE) e.sendOn = t("gift.errDate", "Pick a date from today through December 31, 2026.");
    }
    return e;
  }

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) {
      // Move focus to the first field that needs attention.
      const first = ["recipientName", "message", "recipientEmail", "sendOn"].find((k) => e[k]);
      if (first) document.getElementById(`gift-${first}`)?.focus();
      return;
    }
    setSubmitting(true);
    track("gift_checkout_started", { plan, delivery });
    try {
      const res = await checkoutFn({ data: {
        plan,
        recipientName: recipientName.trim(),
        message: message.trim(),
        delivery,
        recipientEmail: delivery === "email" ? recipientEmail.trim() : undefined,
        sendOn: delivery === "email" ? sendOn : undefined,
      }});
      if (res.ok) {
        window.location.assign(res.url);
        return; // keep the button disabled while the browser leaves
      }
      setSubmitError(res.reason === "unavailable"
        ? t("gift.errUnavailable", "Gift memberships aren't available just yet. Please check back soon.")
        : res.reason === "invalid"
          ? t("gift.errInvalid", "Something in the form needs another look. Check the details and try again.")
          : t("gift.errCheckout", "We couldn't start checkout just now. Please try again."));
    } catch {
      setSubmitError(t("gift.errCheckout", "We couldn't start checkout just now. Please try again."));
    }
    setSubmitting(false);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  const options: GiftOption[] = opts?.options ?? [];
  const price = (p: GiftPlan) => {
    const o = options.find((x) => x.plan === p);
    return o ? formatCents(o.amountCents, o.currency) : "";
  };

  return (
    <FrontDoorPage>
      <FrontDoorHeader
        title={t("gift.title", "Give a gift membership")}
        line={t("gift.line", "A year with The Kya Project for the parrot person in your life. Pick a gift, add a note, and choose when it arrives.")}
      />
      <FrontDoorBody>
        {canceled && (
          <p role="status" className="m-0 rounded-[16px] bg-white px-4 py-3 text-[14.5px]" style={{ color: K.ink }}>
            {t("gift.canceled", "Checkout was canceled, and nothing was charged. Your choices are below if you'd like to try again.")}
          </p>
        )}
        {isLoading ? (
          <div className="grid place-items-center py-10" role="status" aria-label={t("gift.loading", "Loading")}>
            <Loader2 className="size-8 animate-spin" style={{ color: K.moss }} />
          </div>
        ) : !opts?.available ? (
          <KyaCard className="p-5">
            <KyaHeading size={21}>{t("gift.unavailableTitle", "Gifts are almost ready")}</KyaHeading>
            <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
              {t("gift.errUnavailable", "Gift memberships aren't available just yet. Please check back soon.")}
            </p>
          </KyaCard>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-5">
            <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
              <legend className="mb-3 p-0"><KyaHeading size={21} as="h2">{t("gift.chooseTitle", "Choose a gift")}</KyaHeading></legend>
              {(["flock_year", "app_premium_year"] as const).map((p) => (
                <label
                  key={p}
                  className="flex cursor-pointer items-start gap-3 rounded-[18px] border-2 bg-white p-4 focus-within:ring-2 focus-within:ring-[#2d6a4f]/40"
                  style={{ borderColor: plan === p ? K.forest : K.line }}
                >
                  <input type="radio" name="plan" value={p} checked={plan === p} onChange={() => setPlan(p)} className="mt-1 size-5 shrink-0 accent-[#1a3d2e]" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-[17px] font-[700]" style={{ color: K.forest }}>{giftPlanName(t, p)}</span>
                      <span className="text-[17px] font-[700]" style={{ color: K.forest }}>{price(p)}</span>
                    </span>
                    <span className="mt-1 block text-[14.5px] leading-[1.45]" style={{ color: K.quiet }}>{planBlurb(t, p)}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            <KyaCard className="flex flex-col gap-4 p-5">
              <Field id="gift-recipientName" label={t("gift.recipientName", "Who's it for?")} error={errors.recipientName}>
                <input
                  id="gift-recipientName"
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  maxLength={GIFT_NAME_MAX}
                  autoComplete="off"
                  placeholder={t("gift.recipientNamePlaceholder", "Their name")}
                  aria-invalid={errors.recipientName ? true : undefined}
                  aria-describedby={errors.recipientName ? "gift-recipientName-error" : undefined}
                  className={inputCls}
                  style={{ borderColor: errors.recipientName ? K.red : "#d5dfd5", color: K.forest }}
                />
              </Field>
              <Field
                id="gift-message"
                label={t("gift.message", "Personal message")}
                optional={t("gift.optional", "Optional")}
                error={errors.message}
                hint={<span aria-live="polite">{t("gift.messageCount", "{{n}} of {{max}} characters", { n: message.length, max: GIFT_MESSAGE_MAX })}</span>}
              >
                <textarea
                  id="gift-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, GIFT_MESSAGE_MAX))}
                  rows={4}
                  maxLength={GIFT_MESSAGE_MAX}
                  aria-invalid={errors.message ? true : undefined}
                  aria-describedby="gift-message-hint"
                  className={`${inputCls} min-h-[112px] py-3`}
                  style={{ borderColor: errors.message ? K.red : "#d5dfd5", color: K.forest }}
                />
              </Field>
            </KyaCard>

            <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
              <legend className="mb-3 p-0"><KyaHeading size={21} as="h2">{t("gift.deliveryTitle", "How should it arrive?")}</KyaHeading></legend>
              {([
                ["email", t("gift.deliveryEmail", "Email it to them on a date I choose")],
                ["self", t("gift.deliverySelf", "Send it to me to print or forward")],
              ] as const).map(([v, label]) => (
                <label
                  key={v}
                  className="flex cursor-pointer items-center gap-3 rounded-[18px] border-2 bg-white px-4 py-3.5 focus-within:ring-2 focus-within:ring-[#2d6a4f]/40"
                  style={{ borderColor: delivery === v ? K.forest : K.line }}
                >
                  <input type="radio" name="delivery" value={v} checked={delivery === v} onChange={() => setDelivery(v)} className="size-5 shrink-0 accent-[#1a3d2e]" />
                  <span className="text-[15.5px] font-[700]" style={{ color: K.forest }}>{label}</span>
                </label>
              ))}
              {delivery === "email" && (
                <KyaCard className="flex flex-col gap-4 p-5">
                  <Field id="gift-recipientEmail" label={t("gift.recipientEmail", "Their email")} error={errors.recipientEmail}>
                    <input
                      id="gift-recipientEmail"
                      type="email"
                      inputMode="email"
                      autoComplete="off"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      aria-invalid={errors.recipientEmail ? true : undefined}
                      aria-describedby={errors.recipientEmail ? "gift-recipientEmail-error" : undefined}
                      className={inputCls}
                      style={{ borderColor: errors.recipientEmail ? K.red : "#d5dfd5", color: K.forest }}
                    />
                  </Field>
                  <Field
                    id="gift-sendOn"
                    label={t("gift.sendOn", "Send it on")}
                    error={errors.sendOn}
                    hint={t("gift.sendOnHint", "Any day from today through December 31. It arrives in the morning, Eastern time.")}
                  >
                    <input
                      id="gift-sendOn"
                      type="date"
                      value={sendOn}
                      min={today}
                      max={GIFT_SEND_LAST_DATE}
                      onChange={(e) => setSendOn(e.target.value)}
                      aria-invalid={errors.sendOn ? true : undefined}
                      aria-describedby={errors.sendOn ? "gift-sendOn-hint gift-sendOn-error" : "gift-sendOn-hint"}
                      className={inputCls}
                      style={{ borderColor: errors.sendOn ? K.red : "#d5dfd5", color: K.forest }}
                    />
                  </Field>
                </KyaCard>
              )}
            </fieldset>

            <section className="rounded-[20px] p-5" style={{ background: K.lime, color: K.forest }}>
              <p className="m-0 text-[15px] leading-[1.5]">{giftTiming(t, plan)}</p>
            </section>

            {submitError && <div ref={errorRef} tabIndex={-1} className="outline-none"><FrontDoorError>{submitError}</FrontDoorError></div>}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1a3d2e] disabled:opacity-45"
              style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
            >
              {submitting ? t("gift.continuing", "Opening secure checkout…") : t("gift.continue", "Continue to payment · {{price}}", { price: price(plan) })}
            </button>
            <p className="m-0 text-center text-[13.5px] leading-[1.45]" style={{ color: K.quiet }}>
              {t("gift.checkoutNote", "Payment is handled by Stripe. Have a promo code? You can enter it on the next page.")}
            </p>
          </form>
        )}
        <div className="mt-auto pt-2"><LegalLinks /></div>
      </FrontDoorBody>
    </FrontDoorPage>
  );
}

function Field({ id, label, optional, error, hint, children }: {
  id: string;
  label: string;
  optional?: string;
  error?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-2 text-[14px] font-[700]" style={{ color: K.forest }}>
        {label}
        {optional && <span className="text-[12.5px] font-[500]" style={{ color: K.quiet }}>{optional}</span>}
      </label>
      {children}
      {hint && <p id={`${id}-hint`} className="m-0 mt-1.5 text-[13px]" style={{ color: K.quiet }}>{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="m-0 mt-1.5 text-[13.5px] font-[600]" style={{ color: K.red }}>{error}</p>}
    </div>
  );
}
