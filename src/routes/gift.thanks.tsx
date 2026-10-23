import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Loader2, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { getGiftBySession, type GiftForThanks } from "@/lib/gifts.functions";
import { formatGiftDate } from "@/lib/gifts";
import { giftPlanName, giftTiming } from "@/lib/giftCopy";
import { K, SERIF, KyaCard, KyaHeading, KyaPrimaryButton } from "@/components/kya";
import { FrontDoorBody, FrontDoorError, FrontDoorHeader, FrontDoorPage } from "@/components/frontDoor";
import { BrandLockup } from "@/components/BrandLogo";

// After Stripe Checkout. Shows the gift code and a printable card once the
// webhook has recorded the purchase; the Checkout session id in the URL is what
// identifies it (see getGiftBySession). Nothing here creates or changes a gift.
const search = z.object({ session_id: z.string().max(255).optional().catch(undefined) });

export const Route = createFileRoute("/gift/thanks")({
  ssr: false,
  validateSearch: search,
  head: () => ({ meta: [
    { title: i18next.t("giftThanks.pageTitle", "Your gift — The Kya Project") },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: GiftThanks,
});

// The webhook normally lands within a second or two; give it a minute.
const POLL_MS = 2000;
const POLL_LIMIT_MS = 60_000;

function GiftThanks() {
  const { t } = useTranslation();
  const { session_id } = Route.useSearch();
  const giftFn = useServerFn(getGiftBySession);
  const started = useRef(Date.now());
  const headingRef = useRef<HTMLHeadingElement>(null);

  const valid = !!session_id && /^cs_(test|live)_/.test(session_id);
  const { data, isError } = useQuery({
    queryKey: ["gift-thanks", session_id],
    enabled: valid,
    queryFn: () => giftFn({ data: { sessionId: session_id! } }),
    refetchInterval: (q) => (q.state.data?.status === "pending" && Date.now() - started.current < POLL_LIMIT_MS ? POLL_MS : false),
    retry: 1,
  });

  const ready = data && data.status === "ready" ? (data as Extract<GiftForThanks, { status: "ready" }>) : null;
  useEffect(() => { if (ready) headingRef.current?.focus(); }, [ready]);

  const timedOut = data?.status === "pending" && Date.now() - started.current >= POLL_LIMIT_MS;

  return (
    <FrontDoorPage>
      <div className="print:hidden">
        <FrontDoorHeader
          title={ready ? t("giftThanks.title", "Thank you. Your gift is ready.") : t("giftThanks.titlePending", "Thank you for your gift")}
          line={ready
            ? (ready.recipientEmail && ready.sendOn
              ? t("giftThanks.lineEmail", "We'll email it to {{email}} on {{date}}. Your receipt, with the code, is on its way to you now.", { email: ready.recipientEmail, date: formatGiftDate(ready.sendOn) })
              : t("giftThanks.lineSelf", "Print the card below or forward the code. Your receipt, with the code, is on its way to you now."))
            : undefined}
        />
      </div>
      <FrontDoorBody>
        {!valid || data?.status === "not_found" || isError ? (
          <FrontDoorError>
            {t("giftThanks.notFound", "We couldn't find this gift. If you just paid, check your email for the receipt, or reply to it and we'll help.")}
          </FrontDoorError>
        ) : !ready ? (
          timedOut ? (
            <FrontDoorError>
              {t("giftThanks.slow", "Your payment went through, and we're still finishing up. Your receipt with the gift code will arrive by email shortly.")}
            </FrontDoorError>
          ) : (
            <div className="grid place-items-center gap-3 py-10 text-center" role="status">
              <Loader2 className="size-8 animate-spin" style={{ color: K.moss }} aria-hidden="true" />
              <p className="m-0 text-[15px]" style={{ color: K.ink }}>{t("giftThanks.finishing", "Finishing up your gift…")}</p>
            </div>
          )
        ) : (
          <>
            <h2 ref={headingRef} tabIndex={-1} className="sr-only">{t("giftThanks.cardHeading", "Your gift card")}</h2>
            {ready.refunded && (
              <FrontDoorError>{t("giftThanks.refunded", "This gift was refunded, so its code no longer works.")}</FrontDoorError>
            )}
            <GiftCard
              planName={giftPlanName(t, ready.plan)}
              recipientName={ready.recipientName}
              message={ready.message}
              code={ready.giftCode}
              timing={giftTiming(t, ready.plan)}
            />
            <div className="print:hidden flex flex-col gap-3">
              <KyaPrimaryButton onClick={() => window.print()} icon={<Printer className="size-5" aria-hidden="true" />}>
                {t("giftThanks.print", "Print the gift card")}
              </KyaPrimaryButton>
              <KyaCard className="p-5">
                <KyaHeading size={19}>{t("giftThanks.givingTitle", "Where some of it goes")}</KyaHeading>
                <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
                  {t("giftThanks.giving", "{{percent}}% of this gift goes to parrot rescue and conservation. Thank you for that, too.", { percent: Math.round(ready.givingRate * 100) })}
                </p>
              </KyaCard>
              <Link to="/gift" className="inline-flex min-h-[44px] items-center justify-center text-[15px] font-[700]" style={{ color: K.moss }}>
                {t("giftThanks.another", "Give another gift")}
              </Link>
            </div>
          </>
        )}
      </FrontDoorBody>
    </FrontDoorPage>
  );
}

/** The printable card. Forest panel with the lockup, a lime plan pill, the
 *  recipient's name and message, and the code. Prints with its colors. */
function GiftCard({ planName, recipientName, message, code, timing }: {
  planName: string;
  recipientName: string;
  message: string | null;
  code: string;
  timing: string;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("giftThanks.cardHeading", "Your gift card")}
      className="overflow-hidden rounded-[22px] border-2 print:mx-auto print:max-w-[520px]"
      style={{ borderColor: K.forest, background: "#fbf9f3", WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" }}
    >
      <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ background: K.forest }}>
        <BrandLockup orientation="horizontal" variant="ink" size={112} />
        <span className="rounded-full px-3 py-1 text-[12.5px] font-[700]" style={{ background: K.lime, color: K.forest }}>{planName}</span>
      </div>
      <div className="px-5 pb-6 pt-5">
        <p className="m-0 text-[13px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>{t("giftThanks.cardFor", "A gift for")}</p>
        <p className="m-0 mt-1 text-[30px] font-[700] leading-[1.1]" style={{ fontFamily: SERIF, color: K.forest }}>{recipientName}</p>
        {message && (
          <blockquote className="m-0 mt-4 whitespace-pre-line rounded-[16px] px-4 py-3 text-[15.5px] leading-[1.5]" style={{ background: "#f4f1e8", color: K.ink }}>
            {message}
          </blockquote>
        )}
        <div className="mt-5 rounded-[16px] border-2 border-dashed px-4 py-4 text-center" style={{ borderColor: K.forest }}>
          <p className="m-0 text-[12.5px] font-[700] uppercase tracking-[0.08em]" style={{ color: K.quiet }}>{t("giftThanks.codeLabel", "Gift code")}</p>
          <p className="m-0 mt-1 select-all text-[26px] font-[700] tracking-[0.08em]" style={{ color: K.forest, fontVariantNumeric: "tabular-nums" }}>{code}</p>
        </div>
        <p className="m-0 mt-4 text-[14.5px] leading-[1.5]" style={{ color: K.ink }}>
          {t("giftThanks.howTo", "Redeem it at app.thekyaproject.com/redeem: sign in or create a free account, then enter the code.")}
        </p>
        <p className="m-0 mt-2 text-[13.5px] leading-[1.5]" style={{ color: K.quiet }}>{timing}</p>
      </div>
    </section>
  );
}
