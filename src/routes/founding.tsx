import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { getReadySession } from "@/lib/authReady";
import { track } from "@/lib/analytics";
import { claimFoundingSpot, getFoundingStatus, type ClaimRefusal } from "@/lib/founding.functions";
import { K, SERIF, KyaCard, KyaHeading, KyaPrimaryButton, KyaSecondaryButton } from "@/components/kya";
import { CheckListCard, FrontDoorBody, FrontDoorError, FrontDoorHeader, FrontDoorPage, LegalLinks } from "@/components/frontDoor";
import { WaitlistModal } from "@/components/WaitlistCard";

// The Founding 50: public offer page for the first Flock members. Anyone can
// view it; claiming needs an account. The Flock itself stays hidden behind
// flock_enabled() — nothing here links into it.
//
//   ?src=tiktok      where the visitor came from; saved on the claim
//   ?claim=1         set on the way out to sign-up / sign-in, so the region
//                    question opens as soon as they're back
const search = z.object({
  src: z.string().max(80).optional().catch(undefined),
  claim: z.union([z.literal(1), z.literal("1")]).optional().catch(undefined),
});

export const Route = createFileRoute("/founding")({
  ssr: false,
  validateSearch: search,
  head: () => ({ meta: [
    { title: i18next.t("founding.pageTitle", "Be one of the Founding 50 — The Kya Project") },
    { name: "description", content: i18next.t("founding.metaDescription", "Join the Flock as one of its first 50 members: $15 a month for as long as you're a member, with your first six months free.") },
  ]}),
  component: FoundingPage,
});

/** Same shape the claim function stores (lowercase slug), so PostHog and the
 *  admin page agree. Anything else is dropped. */
function cleanSource(raw: string | undefined): string | null {
  const s = (raw ?? "").trim().toLowerCase().slice(0, 40);
  return /^[a-z0-9][a-z0-9_-]*$/.test(s) ? s : null;
}

const STATUS_QUERY = ["founding-status"] as const;

type Step = "offer" | "region" | "done";

function FoundingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { src, claim } = Route.useSearch();
  const source = cleanSource(src);

  const statusFn = useServerFn(getFoundingStatus);
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: STATUS_QUERY,
    queryFn: () => statusFn(),
    // A live counter, without hammering: refresh every 30s while open.
    refetchInterval: 30_000,
  });

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ["founding-session"],
    queryFn: async () => {
      const s = await getReadySession().catch(() => null);
      return s ? { userId: s.user.id } : null;
    },
  });
  const userId = session?.userId ?? null;

  // The visitor's own claim (RLS: own row only; admins can read every row,
  // hence the explicit user filter).
  const { data: myClaim, isLoading: claimLoading } = useQuery({
    queryKey: ["founding-my-claim", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("founding_claims")
        .select("spot_number")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data ? { spotNumber: data.spot_number } : null;
    },
  });

  const [step, setStep] = useState<Step>("offer");
  const [spotNumber, setSpotNumber] = useState<number | null>(null);
  const [notice, setNotice] = useState<ClaimRefusal | null>(null);

  // One view event per visit.
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track("founding_page_viewed", { source: source ?? "direct" });
  }, [source]);

  // Already claimed: go straight to their confirmation.
  useEffect(() => {
    if (myClaim) {
      setSpotNumber(myClaim.spotNumber);
      setStep("done");
    }
  }, [myClaim]);

  // Back from sign-up / sign-in with ?claim=1: open the region question once.
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current || !claim || !userId || claimLoading || myClaim || !status) return;
    resumed.current = true;
    if (status.open) setStep("region");
  }, [claim, userId, claimLoading, myClaim, status]);

  function startClaim() {
    setNotice(null);
    if (!userId) {
      const back = `/founding?${new URLSearchParams({ ...(source ? { src: source } : {}), claim: "1" }).toString()}`;
      void navigate({ to: "/auth", search: { mode: "signup", redirect: back } });
      return;
    }
    setStep("region");
  }

  const loading = statusLoading || sessionLoading || (!!userId && claimLoading);
  const isOpen = status?.open ?? false;

  return (
    <FrontDoorPage>
      <FrontDoorHeader
        title={step === "done" ? t("founding.doneTitle", "You're one of the Founding 50.") : t("founding.title", "Be one of the Founding 50")}
        line={step === "done"
          ? undefined
          : t("founding.line", "The Flock is The Kya Project's community for parrot people, opening in January. Its first 50 members get the best price we'll ever offer and a hand in shaping what it becomes.")}
      />
      <FrontDoorBody>
        {loading ? (
          <div className="grid place-items-center py-10" role="status" aria-label={t("founding.loading", "Loading")}>
            <Loader2 className="size-8 animate-spin" style={{ color: K.moss }} />
          </div>
        ) : step === "done" && spotNumber != null ? (
          <Confirmation spotNumber={spotNumber} cap={status?.cap ?? 50} />
        ) : step === "region" && isOpen ? (
          <RegionStep
            source={source}
            onBack={() => setStep("offer")}
            onClaimed={(n) => {
              setSpotNumber(n);
              setStep("done");
              void queryClient.invalidateQueries({ queryKey: STATUS_QUERY });
              void queryClient.invalidateQueries({ queryKey: ["founding-my-claim"] });
            }}
            onRefused={(reason) => {
              setNotice(reason);
              setStep("offer");
              void queryClient.invalidateQueries({ queryKey: STATUS_QUERY });
              if (reason === "already_claimed") void queryClient.invalidateQueries({ queryKey: ["founding-my-claim"] });
            }}
          />
        ) : (
          <>
            <Offer />
            <Counter claimed={status?.claimed ?? 0} cap={status?.cap ?? 50} />
            {notice === "full" || notice === "closed" ? (
              <FrontDoorError>
                {notice === "full"
                  ? t("founding.justFilled", "The last founding spot was claimed just before yours. Thank you for wanting in.")
                  : t("founding.justClosed", "Founding spots have closed.")}
              </FrontDoorError>
            ) : notice ? (
              <FrontDoorError>{t("founding.claimError", "We couldn't save your spot just now. Please try again.")}</FrontDoorError>
            ) : null}
            {isOpen ? (
              <KyaPrimaryButton onClick={startClaim}>{t("founding.claimButton", "Claim my founding spot")}</KyaPrimaryButton>
            ) : (
              <Full />
            )}
            {isOpen && (
              <p className="m-0 text-center text-[13.5px] leading-[1.45]" style={{ color: K.quiet }}>
                {t("founding.noCard", "No card needed today. You'll create a free Kya & Co. account, or sign in, to hold your spot.")}
              </p>
            )}
          </>
        )}
        <div className="mt-auto pt-2"><LegalLinks /></div>
      </FrontDoorBody>
    </FrontDoorPage>
  );
}

function Offer() {
  const { t } = useTranslation();
  return (
    <>
      <KyaCard className="p-5">
        <p className="m-0 text-[13px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>{t("founding.offerLabel", "Founding price")}</p>
        <p className="m-0 mt-1.5 flex flex-wrap items-baseline gap-x-2">
          <span className="text-[34px] font-[700] leading-none" style={{ fontFamily: SERIF, color: K.forest }}>{t("founding.price", "$15 a month")}</span>
          <span className="text-[14.5px]" style={{ color: K.quiet }}>{t("founding.regular", "Regular price $30")}</span>
        </p>
        <p className="m-0 mt-3 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
          {t("founding.locked", "Locked for as long as you're a member. Your first six months are free.")}
        </p>
      </KyaCard>
      <KyaHeading size={21} className="mt-2">{t("founding.perksTitle", "What founding members get")}</KyaHeading>
      <CheckListCard items={[
        t("founding.perkBadge", "A founding badge on your Flock profile"),
        t("founding.perkCall", "An invitation to the founders' kickoff call"),
        t("founding.perkVote", "A vote on the first expert Q&As and the first chapters"),
      ]} />
    </>
  );
}

/** "31 of 50 spots claimed", announced politely when the number changes. */
function Counter({ claimed, cap }: { claimed: number; cap: number }) {
  const { t } = useTranslation();
  const pct = Math.min(100, Math.round((claimed / Math.max(cap, 1)) * 100));
  return (
    <KyaCard className="p-5">
      <p role="status" aria-live="polite" aria-atomic="true" className="m-0 text-[17px] font-[700]" style={{ color: K.forest }}>
        {t("founding.counter", "{{claimed}} of {{cap}} spots claimed", { claimed, cap })}
      </p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full" style={{ background: K.mist }} aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: K.moss }} />
      </div>
      <p className="m-0 mt-3 text-[14.5px]" style={{ color: K.quiet }}>{t("founding.deadline", "Founding spots close December 31")}</p>
    </KyaCard>
  );
}

/** Spots gone or past the deadline: launch news through the existing waitlist form. */
function Full() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-[20px] p-5" style={{ background: K.lime, color: K.forest }}>
      <KyaHeading size={22}>{t("founding.fullTitle", "The Founding 50 is full")}</KyaHeading>
      <p className="m-0 mt-2 text-[15px] leading-[1.5]">
        {t("founding.fullBody", "The Flock opens in January. Leave your email and we'll tell you the day it does.")}
      </p>
      <div className="mt-4"><KyaPrimaryButton onClick={() => setOpen(true)}>{t("founding.launchNews", "Get launch news")}</KyaPrimaryButton></div>
      {open && <WaitlistModal onClose={() => setOpen(false)} />}
    </section>
  );
}

function RegionStep({ source, onBack, onClaimed, onRefused }: {
  source: string | null;
  onBack: () => void;
  onClaimed: (spotNumber: number) => void;
  onRefused: (reason: ClaimRefusal) => void;
}) {
  const { t } = useTranslation();
  const claimFn = useServerFn(claimFoundingSpot);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [region, setRegion] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyboard and screen-reader users land on the question, not the page top.
  useEffect(() => { headingRef.current?.focus(); }, []);

  const { data: regions, isLoading, isError } = useQuery({
    queryKey: ["regions"],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("regions").select("slug, name, states").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!region) {
      setError(t("founding.pickRegion", "Choose your region to continue."));
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await claimFn({ data: { regionSlug: region, source } });
      if (res.ok) {
        track("founding_spot_claimed", { source: source ?? "direct", region: res.regionSlug });
        onClaimed(res.spotNumber);
      } else if (res.reason === "invalid_region") {
        setError(t("founding.pickRegion", "Choose your region to continue."));
      } else if (res.reason === "error") {
        setError(t("founding.claimError", "We couldn't save your spot just now. Please try again."));
      } else {
        onRefused(res.reason);
      }
    } catch {
      setError(t("founding.claimError", "We couldn't save your spot just now. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <KyaCard className="p-5">
        <h2 ref={headingRef} tabIndex={-1} className="m-0 text-[22px] font-[700] leading-[1.15] outline-none" style={{ fontFamily: SERIF }}>
          <label htmlFor="founding-region">{t("founding.regionQ", "Which region are you in?")}</label>
        </h2>
        <p id="founding-region-hint" className="m-0 mt-2 text-[14.5px] leading-[1.45]" style={{ color: K.quiet }}>
          {t("founding.regionHint", "We'll place you in your local chapter when the Flock opens.")}
        </p>
        <select
          id="founding-region"
          value={region}
          onChange={(e) => { setRegion(e.target.value); setError(null); }}
          required
          aria-describedby={error ? "founding-region-hint founding-region-error" : "founding-region-hint"}
          aria-invalid={error ? true : undefined}
          disabled={isLoading || isError}
          className="mt-4 min-h-[48px] w-full appearance-none rounded-full border-[1.5px] bg-white px-4 text-[16px] outline-none focus:border-[#2d6a4f]"
          style={{ borderColor: error ? K.red : "#d5dfd5", color: K.forest }}
        >
          <option value="">{isLoading ? t("founding.regionsLoading", "Loading regions…") : t("founding.selectRegion", "Select your region")}</option>
          {(regions ?? []).map((r) => (
            <option key={r.slug} value={r.slug}>
              {r.states.length ? `${r.name} (${r.states.join(", ")})` : r.name}
            </option>
          ))}
        </select>
        {error && <p id="founding-region-error" role="alert" className="m-0 mt-2 text-[13.5px] font-[600]" style={{ color: K.red }}>{error}</p>}
        {isError && <p role="alert" className="m-0 mt-2 text-[13.5px] font-[600]" style={{ color: K.red }}>{t("founding.regionsError", "We couldn't load the regions. Refresh the page to try again.")}</p>}
      </KyaCard>
      <button
        type="submit"
        disabled={submitting || isLoading || isError}
        className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700] disabled:opacity-45"
        style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
      >
        {submitting ? t("founding.claiming", "Saving your spot…") : t("founding.confirm", "Confirm my founding spot")}
      </button>
      <p className="m-0 text-center text-[13.5px]" style={{ color: K.quiet }}>{t("founding.noPayment", "No card and no payment today.")}</p>
      <KyaSecondaryButton onClick={onBack}>{t("founding.back", "Back")}</KyaSecondaryButton>
    </form>
  );
}

function Confirmation({ spotNumber, cap }: { spotNumber: number; cap: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <>
      <section className="rounded-[20px] p-5" style={{ background: K.lime, color: K.forest }}>
        <p className="m-0 text-[13px] font-[700] uppercase tracking-[0.06em]">{t("founding.yourSpot", "Your founding spot")}</p>
        <p ref={ref} tabIndex={-1} className="m-0 mt-1 text-[40px] font-[700] leading-none outline-none" style={{ fontFamily: SERIF }}>
          {t("founding.spotNumber", "#{{n}} of {{cap}}", { n: spotNumber, cap })}
        </p>
      </section>
      <KyaCard className="p-5">
        <KyaHeading size={20}>{t("founding.nextTitle", "What happens next")}</KyaHeading>
        <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
          {t("founding.next", "We'll email you before the Flock opens in January. Your six free months start when it opens.")}
        </p>
        <p className="m-0 mt-3 text-[14.5px] leading-[1.5]" style={{ color: K.quiet }}>
          {t("founding.nextPrice", "After that, it's $15 a month for as long as you're a member.")}
        </p>
      </KyaCard>
      <KyaSecondaryButton onClick={() => void navigate({ to: "/dashboard" })}>{t("founding.toApp", "Go to Kya & Co.")}</KyaSecondaryButton>
    </>
  );
}
