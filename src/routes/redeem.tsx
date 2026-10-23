import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { getReadySession } from "@/lib/authReady";
import { track } from "@/lib/analytics";
import { isGiftPlan, type GiftPlan } from "@/lib/gifts";
import { giftPlanName } from "@/lib/giftCopy";
import { K, SERIF, KyaCard, KyaHeading, KyaPrimaryButton, KyaSecondaryButton } from "@/components/kya";
import { FrontDoorBody, FrontDoorHeader, FrontDoorPage, LegalLinks } from "@/components/frontDoor";

// Redeem a gift code. Public page; redeeming needs an account, so a signed-out
// visitor is sent to sign up (or in) and brought straight back, code intact.
// redeem_gift() does the work and the rate limiting; every bad code gets the
// same answer so codes can't be probed.
const search = z.object({ code: z.string().max(40).optional().catch(undefined) });

export const Route = createFileRoute("/redeem")({
  ssr: false,
  validateSearch: search,
  head: () => ({ meta: [
    { title: i18next.t("redeem.pageTitle", "Redeem a gift — The Kya Project") },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  component: RedeemPage,
});

function RedeemPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { code: codeParam } = Route.useSearch();
  const [code, setCode] = useState(codeParam ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState<GiftPlan | null>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  const { data: session, isLoading } = useQuery({
    queryKey: ["redeem-session"],
    queryFn: async () => {
      const s = await getReadySession().catch(() => null);
      return s ? { userId: s.user.id } : null;
    },
  });

  useEffect(() => { if (redeemed) doneRef.current?.focus(); }, [redeemed]);

  const back = `/redeem${code.trim() ? `?${new URLSearchParams({ code: code.trim() }).toString()}` : ""}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!code.trim()) {
      setError(t("redeem.enterCode", "Enter the gift code from your card or email."));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc("redeem_gift", { p_code: code });
      const row = Array.isArray(data) ? data[0] : data;
      if (rpcError || !row) {
        setError(t("redeem.error", "We couldn't redeem that just now. Please try again."));
      } else if (row.ok && isGiftPlan(row.plan)) {
        track("gift_redeemed", { plan: row.plan });
        setRedeemed(row.plan);
      } else if (row.reason === "rate_limited") {
        setError(t("redeem.rateLimited", "That's a lot of tries in a short time. Please wait an hour, then try again."));
      } else {
        setError(t("redeem.invalid", "That code didn't work. Check it against your card or email and try again."));
      }
    } catch {
      setError(t("redeem.error", "We couldn't redeem that just now. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FrontDoorPage>
      <FrontDoorHeader
        title={redeemed ? t("redeem.doneTitle", "Your gift is saved.") : t("redeem.title", "Redeem a gift")}
        line={redeemed ? undefined : t("redeem.line", "Someone gave you a year with The Kya Project. Enter your code to save it to your account.")}
      />
      <FrontDoorBody>
        {isLoading ? (
          <div className="grid place-items-center py-10" role="status" aria-label={t("redeem.loading", "Loading")}>
            <Loader2 className="size-8 animate-spin" style={{ color: K.moss }} />
          </div>
        ) : redeemed ? (
          <>
            <section className="rounded-[20px] p-5" style={{ background: K.lime, color: K.forest }}>
              <p className="m-0 text-[13px] font-[700] uppercase tracking-[0.06em]">{giftPlanName(t, redeemed)}</p>
              <h2 ref={doneRef} tabIndex={-1} className="m-0 mt-1 text-[22px] font-[700] leading-[1.2] outline-none" style={{ fontFamily: SERIF }}>
                {redeemed === "flock_year"
                  ? t("redeem.doneFlock", "Your gift is saved. Your year in the Flock starts when it opens in January.")
                  : t("redeem.donePremium", "Your gift is saved. Your year of app premium starts when it launches in January.")}
              </h2>
            </section>
            <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
              {t("redeem.doneNext", "We'll email you before it starts. There's nothing else you need to do.")}
            </p>
            <KyaSecondaryButton onClick={() => void navigate({ to: "/dashboard" })}>{t("redeem.toApp", "Go to Kya & Co.")}</KyaSecondaryButton>
          </>
        ) : !session ? (
          <KyaCard className="p-5">
            <KyaHeading size={21}>{t("redeem.signInTitle", "Sign in to redeem")}</KyaHeading>
            <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
              {t("redeem.signInBody", "Your gift is saved to your Kya & Co. account. Creating one is free and takes a minute, and you'll come straight back here.")}
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <KyaPrimaryButton onClick={() => void navigate({ to: "/auth", search: { mode: "signup", redirect: back } })}>
                {t("redeem.createAccount", "Create a free account")}
              </KyaPrimaryButton>
              <KyaSecondaryButton onClick={() => void navigate({ to: "/auth", search: { mode: "signin", redirect: back } })}>
                {t("redeem.signIn", "I have an account")}
              </KyaSecondaryButton>
            </div>
          </KyaCard>
        ) : (
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            <KyaCard className="p-5">
              <label htmlFor="redeem-code" className="block text-[15px] font-[700]" style={{ color: K.forest }}>
                {t("redeem.codeLabel", "Gift code")}
              </label>
              <input
                id="redeem-code"
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
                placeholder="KYA-XXXX-XXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={40}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "redeem-code-error" : undefined}
                className="mt-2 min-h-[52px] w-full rounded-[14px] border-[1.5px] bg-white px-4 text-[20px] font-[700] tracking-[0.08em] outline-none focus-visible:border-[#2d6a4f] focus-visible:ring-2 focus-visible:ring-[#2d6a4f]/30"
                style={{ borderColor: error ? K.red : "#d5dfd5", color: K.forest }}
              />
              {error && <p id="redeem-code-error" role="alert" className="m-0 mt-2 text-[13.5px] font-[600]" style={{ color: K.red }}>{error}</p>}
            </KyaCard>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1a3d2e] disabled:opacity-45"
              style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
            >
              {submitting ? t("redeem.redeeming", "Redeeming…") : t("redeem.submit", "Redeem my gift")}
            </button>
          </form>
        )}
        <div className="mt-auto pt-2"><LegalLinks /></div>
      </FrontDoorBody>
    </FrontDoorPage>
  );
}
