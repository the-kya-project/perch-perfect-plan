// The billing screens (backlog 1.14a), drawn from the approved mockups in
// docs/flock/mockups/billing/. Presentation only: BillingCardStep decides which
// one shows and never renders any of them in the native app or with billing off.
import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Trans, useTranslation } from "react-i18next";
import { K, SERIF } from "@/components/kya";
import { billingDay, monthsFree, yearlyPerMonthCents, type BillingChoice, type PaidPlan } from "@/lib/billing";
import { formatCents } from "@/lib/gifts";

export type BillingPricesCents = Partial<Record<PaidPlan, number>>;

const Svg = ({ size, width = 2.2, children }: { size: number; width?: number; children: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const Check = ({ size = 14, width = 3 }: { size?: number; width?: number }) => <Svg size={size} width={width}><path d="M5 12l5 5L20 7" /></Svg>;
const Heart = () => <Svg size={18}><path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" /></Svg>;
const Leaf = ({ size = 14, width = 2.4 }: { size?: number; width?: number }) => <Svg size={size} width={width}><path d="M12 3c4 3 6 7 5 12-3-1-5-3-6-6" /><path d="M12 3c-1 5 0 10 2 16" /></Svg>;
const Card = ({ size = 14, width = 2.4 }: { size?: number; width?: number }) => <Svg size={size} width={width}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /></Svg>;
const Lock = () => <Svg size={14} width={2}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>;
const Star = () => <Svg size={34}><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" /></Svg>;

const grid = { display: "grid", placeItems: "center" } as const;
const h2 = { margin: 0, fontFamily: SERIF, fontSize: 22, fontWeight: 700, color: K.forest } as const;
const em = <em style={{ fontStyle: "italic", fontWeight: 600, color: K.sunflower }} />;

function BackButton() {
  const { t } = useTranslation();
  return (
    <Link to="/flock/you" aria-label={t("headers.back", "Back")} style={{ ...grid, position: "relative", width: 44, height: 44, borderRadius: 999, background: K.forestDeep, color: "#fff" }}>
      <Svg size={20}><path d="M15 18l-6-6 6-6" /></Svg>
    </Link>
  );
}

function Hero({ eyebrow, title, line, accent = K.teal }: { eyebrow?: ReactNode; title: ReactNode; line: ReactNode; accent?: string }) {
  return (
    <header style={{ position: "relative", padding: "14px 20px 64px", color: "#fff", display: "flex", flexDirection: "column", gap: 22, overflow: "hidden" }}>
      <svg width="390" height="300" viewBox="0 0 390 300" aria-hidden="true" style={{ position: "absolute", right: 0, top: 0 }}>
        <circle cx="330" cy="70" r="120" fill={K.moss} opacity="0.55" /><circle cx="350" cy="40" r="60" fill={accent} opacity="0.35" /><path d="M300 180c30-60 70-90 110-100-10 50-40 90-110 100z" fill={K.lime} opacity="0.5" />
      </svg>
      <BackButton />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 12 }}>
        {eyebrow && <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: K.sunflower }}>{eyebrow}</p>}
        <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 40, lineHeight: 1.02 }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: K.paleGreen }}>{line}</p>
      </div>
    </header>
  );
}

const Sheet = ({ children, top = 0 }: { children: ReactNode; top?: number }) => (
  <main style={{ flexGrow: 1, marginTop: -30, borderRadius: "26px 26px 0 0", background: K.mist, padding: `${top}px 16px 28px`, display: "flex", flexDirection: "column", gap: 16 }}>{children}</main>
);
const Screen = ({ children }: { children: ReactNode }) => (
  <div data-testid="billing-screen" style={{ minHeight: "100dvh", boxSizing: "border-box", display: "flex", flexDirection: "column", background: K.forest, color: K.forest, overflow: "hidden" }}>
    <div style={{ width: "100%", maxWidth: 560, marginInline: "auto", flexGrow: 1, display: "flex", flexDirection: "column" }}>{children}</div>
  </div>
);
const White = ({ children }: { children: ReactNode }) => <section style={{ background: "#fff", borderRadius: 20, padding: 20 }}>{children}</section>;

function GivingPanel({ founder }: { founder: boolean }) {
  const { t } = useTranslation();
  return (
    <section style={{ marginTop: -18, position: "relative", background: K.sunflower, border: `2px solid ${K.forest}`, borderRadius: 22, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("flock.billing.givesBack", "Every membership gives back")}</p>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: SERIF, fontSize: 48, fontWeight: 700, lineHeight: 1 }}>20%</span>
        <span style={{ fontSize: 15, lineHeight: 1.35 }}>{t("flock.billing.givesBackLine", "of what you pay goes to parrot rescue and conservation partners")}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, background: "#fff", border: `2px solid ${K.forest}` }}>
        <span style={{ ...grid, width: 36, height: 36, flexShrink: 0, borderRadius: 999, background: K.forest, color: K.sunflower }}><Heart /></span>
        <span style={{ fontSize: 14, lineHeight: 1.4 }}>
          {founder
            ? <Trans i18nKey="flock.billing.chooseFounder" defaults="You help choose where it goes, <strong>through Do good votes</strong>, including the founders-only ones." components={{ strong: <strong /> }} />
            : <Trans i18nKey="flock.billing.chooseMember" defaults="You help choose where it goes, <strong>through Do good votes</strong> with the rest of the Flock." components={{ strong: <strong /> }} />}
        </span>
      </div>
    </section>
  );
}

function PlanTiles({ prices, choice, onChoice }: { prices: BillingPricesCents; choice: BillingChoice; onChoice: (c: BillingChoice) => void }) {
  const { t } = useTranslation();
  const free = prices.annual != null && prices.monthly != null ? monthsFree(prices.annual, prices.monthly) : null;
  const tile = (c: BillingChoice, label: string, perMonth: number, small: string, badge?: ReactNode) => {
    const on = choice === c;
    return (
      <label key={c} data-testid={`billing-plan-${c}`} style={{ position: "relative", background: on ? K.forest : "#fff", color: on ? "#fff" : K.forest, borderRadius: 18, padding: "18px 14px 16px", display: "flex", flexDirection: "column", gap: 4, border: `2px solid ${on ? K.forest : K.line}`, cursor: "pointer" }}>
        <input type="radio" name="billing-plan" value={c} checked={on} onChange={() => onChoice(c)} style={{ position: "absolute", top: 14, right: 14, width: 20, height: 20, margin: 0, accentColor: on ? K.sunflower : K.forest }} />
        <span style={{ fontSize: 14, fontWeight: 700, color: on ? K.lime : K.moss }}>{label}</span>
        <span style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 700, lineHeight: 1.05 }}>{formatCents(perMonth)}<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500 }}>{t("flock.billing.perMonth", "/mo")}</span></span>
        <span style={{ fontSize: 13, color: on ? K.paleGreen : K.quiet }}>{small}</span>
        {badge && <span style={{ marginTop: 6, alignSelf: "flex-start", padding: "3px 9px", borderRadius: 999, background: K.sunflower, color: K.forest, fontSize: 12, fontWeight: 700 }}>{badge}</span>}
      </label>
    );
  };
  return (
    <fieldset style={{ margin: "4px 0 0", border: 0, padding: 0 }}>
      <legend style={{ ...h2, margin: "0 0 10px 4px", padding: 0 }}>{t("flock.billing.pickHow", "Pick how you pay")}</legend>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {prices.annual != null && tile("annual", t("flock.billing.yearlyLabel", "Yearly"), yearlyPerMonthCents(prices.annual), t("flock.billing.yearlyTotal", "{{price}} once a year", { price: formatCents(prices.annual) }), free ? t("flock.billing.monthsFree", "{{count}} months free", { count: free }) : undefined)}
        {prices.monthly != null && tile("monthly", t("flock.billing.monthlyLabel", "Monthly"), prices.monthly, t("flock.billing.billedMonthly", "Billed monthly"))}
      </div>
    </fieldset>
  );
}

function FoundingPrice({ prices }: { prices: BillingPricesCents }) {
  const { t } = useTranslation();
  const founding = prices.founding == null ? "" : formatCents(prices.founding);
  return (
    <section data-testid="billing-founding" aria-label={t("flock.billing.founding", "Founding price: {{price}} a month, locked in for as long as you stay a member.", { price: founding })} style={{ background: K.forest, color: "#fff", borderRadius: 20, padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
      <span style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: K.lime }}>{t("flock.billing.foundingLabel", "Founding price")}</span>
        <span style={{ fontSize: 14, lineHeight: 1.4, color: K.paleGreen }}>
          {t("flock.billing.foundingLocked", "Locked in for as long as you stay a member.")}
          {prices.monthly != null && <> {t("flock.billing.foundingOthers", "Everyone else pays {{price}}.", { price: formatCents(prices.monthly) })}</>}
        </span>
      </span>
      <span style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 700, lineHeight: 1 }}>{founding}<span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500 }}>{t("flock.billing.perMonth", "/mo")}</span></span>
    </section>
  );
}

function Timeline({ today, date, charge, note }: { today: string; date: string; charge: string; note?: ReactNode }) {
  const { t } = useTranslation();
  const steps: { bg: string; fg: string; icon: ReactNode; title: string; body: string }[] = [
    { bg: K.forest, fg: K.lime, icon: <Check />, title: t("flock.billing.today", "Today"), body: today },
    { bg: K.lime, fg: K.forest, icon: <Leaf />, title: t("flock.billing.until", "Until {{date}}", { date }), body: t("flock.billing.staysFree", "Everything in the Flock stays free, just like now.") },
    { bg: K.sunflower, fg: K.forest, icon: <Card />, title: date, body: charge },
  ];
  return (
    <White>
      <h2 style={{ ...h2, marginBottom: 16 }}>{t("flock.billing.howItWorks", "How it works")}</h2>
      <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: "flex", gap: 14 }}>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ ...grid, width: 28, height: 28, borderRadius: 999, background: s.bg, color: s.fg }}>{s.icon}</span>
              {i < 2 && <span style={{ width: 2, flexGrow: 1, background: K.paleGreen, margin: "4px 0" }} />}
            </span>
            <span style={{ paddingBottom: i < 2 ? 18 : 0 }}>
              <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{s.title}</span>
              <span style={{ display: "block", fontSize: 14, lineHeight: 1.45, color: K.quiet }}>{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
      {note && <p style={{ margin: "16px 0 0", padding: "12px 14px", borderRadius: 14, background: K.mist, fontSize: 13, lineHeight: 1.45, color: K.ink }}>{note}</p>}
    </White>
  );
}

function Perks({ title, items }: { title: string; items: string[] }) {
  return (
    <section style={{ background: "#fff", borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ ...h2, marginBottom: 2 }}>{title}</h2>
      {items.map((x) => (
        <div key={x} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 15, lineHeight: 1.45, color: K.ink }}>
          <span style={{ ...grid, width: 24, height: 24, flexShrink: 0, borderRadius: 999, background: K.lime, color: K.forest }}><Check size={13} /></span>
          <span>{x}</span>
        </div>
      ))}
    </section>
  );
}

function Primary({ children, disabled, onClick, height = 56 }: { children: ReactNode; disabled?: boolean; onClick?: () => void; height?: number }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={{ width: "100%", minHeight: height, borderRadius: 999, border: `2px solid ${K.forest}`, background: K.sunflower, color: K.forest, fontSize: height === 56 ? 17 : 16, fontWeight: 700, opacity: disabled ? 0.6 : 1 }}>{children}</button>
  );
}

const Secure = ({ children }: { children: ReactNode }) => (
  <p style={{ margin: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 6, fontSize: 13, color: K.quiet }}><Lock />{children}</p>
);
function ErrorLine() {
  const { t } = useTranslation();
  return <p role="alert" style={{ margin: 0, textAlign: "center", fontSize: 14, color: K.red }}>{t("flock.billing.error", "That didn't work. Try again in a moment.")}</p>;
}

function useMemberPerks() {
  const { t } = useTranslation();
  return [
    t("flock.billing.perkChapter", "Your chapter, with avian vets, rescues and shops other members recommend"),
    t("flock.billing.perkJourneys", "Step-by-step journeys for training and care"),
    t("flock.billing.perkLibrary", "The full Library"),
    t("flock.billing.perkVote", "A vote in Do good, on where the Flock's giving goes"),
  ];
}

type CardProps = { prices: BillingPricesCents; busy: boolean; failed: boolean; onCheckout: (choice: BillingChoice) => void };

const firstChoice = (p: BillingPricesCents): BillingChoice => (p.annual != null ? "annual" : "monthly");

/** CardStepSeasonMember: Yearly is picked by default. */
export function CardStepSeasonMember({ prices, date, busy, failed, onCheckout, initialChoice }: CardProps & { date: string; initialChoice?: BillingChoice }) {
  const { t } = useTranslation();
  const perks = useMemberPerks();
  const [choice, setChoice] = useState<BillingChoice>(initialChoice ?? firstChoice(prices));
  const amount = prices[choice] == null ? "" : formatCents(prices[choice]!);
  return (
    <Screen>
      <Hero
        title={<Trans i18nKey="flock.billing.heroMember" defaults="Your membership <em>does good</em> for parrots" components={{ em }} />}
        line={t("flock.billing.heroSeasonLine", "Add a card now to stay in the Flock after the free season. You won't pay anything until {{date}}.", { date })}
      />
      <Sheet>
        <GivingPanel founder={false} />
        <PlanTiles prices={prices} choice={choice} onChoice={setChoice} />
        <Timeline
          today={t("flock.billing.todayLine", "Add your card. $0 due today.")}
          date={date}
          charge={choice === "annual"
            ? t("flock.billing.chargeYearly", "Your first charge of {{price}}, then once a year. Cancel before this date and you won't be charged.", { price: amount })
            : t("flock.billing.chargeMonthly", "Your first charge of {{price}}, then monthly. Cancel before this date and you won't be charged.", { price: amount })}
        />
        <Perks title={t("flock.billing.keeps", "What your membership keeps")} items={perks} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
          <Primary disabled={busy} onClick={() => onCheckout(choice)}>{t("flock.billing.addMyCard", "Add my card · $0 today")}</Primary>
          {failed && <ErrorLine />}
          <Secure>{t("flock.billing.secureCancel", "Secure checkout with Stripe · Cancel anytime")}</Secure>
        </div>
      </Sheet>
    </Screen>
  );
}

/** CardStepSeasonFounder: the founding price card instead of plan tiles. */
export function CardStepSeasonFounder({ prices, date, spot, busy, failed, onCheckout }: CardProps & { date: string; spot: number | null }) {
  const { t } = useTranslation();
  const price = prices.founding == null ? "" : formatCents(prices.founding);
  return (
    <Screen>
      <Hero
        accent={K.sunflower}
        eyebrow={spot != null ? t("flock.billing.foundingSpot", "Founding 50 · Spot #{{spot}}", { spot }) : t("flock.billing.founding50", "Founding 50")}
        title={<Trans i18nKey="flock.billing.heroFounder" defaults="You helped <em>start this</em>. Keep your {{price}}." values={{ price }} components={{ em }} />}
        line={t("flock.billing.heroFounderLine", "Add a card by {{date}} to hold your founding spot and price. You won't pay anything until then.", { date })}
      />
      <Sheet>
        <GivingPanel founder />
        <FoundingPrice prices={prices} />
        <Timeline
          today={t("flock.billing.todayFounder", "Add your card. Your founding spot is safe. $0 due today.")}
          date={date}
          charge={t("flock.billing.chargeMonthly", "Your first charge of {{price}}, then monthly. Cancel before this date and you won't be charged.", { price })}
          note={t("flock.billing.foundingRelease", "Without a card on file by {{date}}, your founding spot is released and can't be claimed again.", { date })}
        />
        <Perks title={t("flock.billing.keeps", "What your membership keeps")} items={[
          t("flock.billing.perkBadge", "Your founder badge and your place among the Founding 50"),
          t("flock.billing.perkFounderAll", "Your chapter, journeys and the full Library"),
          t("flock.billing.perkFounderVote", "A vote in Do good, including founders-only votes"),
        ]} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
          <Primary disabled={busy} onClick={() => onCheckout("monthly")}>{t("flock.billing.keepSpot", "Keep my founding spot · $0 today")}</Primary>
          {failed && <ErrorLine />}
          <Secure>{t("flock.billing.secureCancel", "Secure checkout with Stripe · Cancel anytime")}</Secure>
        </div>
      </Sheet>
    </Screen>
  );
}

/** CardStepAfterSeason: no timeline, and no price on the button. A founder
 *  whose price is still open sees the founding card, because that's the price
 *  Checkout will use. */
export function CardStepAfterSeason({ prices, founding, busy, failed, onCheckout, initialChoice }: CardProps & { founding: boolean; initialChoice?: BillingChoice }) {
  const { t } = useTranslation();
  const perks = useMemberPerks();
  const [picked, setChoice] = useState<BillingChoice>(initialChoice ?? firstChoice(prices));
  const choice: BillingChoice = founding ? "monthly" : picked;
  return (
    <Screen>
      <Hero
        title={<Trans i18nKey="flock.billing.heroMember" defaults="Your membership <em>does good</em> for parrots" components={{ em }} />}
        line={t("flock.billing.heroAfterLine", "Join the Flock, and help parrots in rescues and in the wild.")}
      />
      <Sheet>
        <GivingPanel founder={false} />
        {founding ? <FoundingPrice prices={prices} /> : <PlanTiles prices={prices} choice={choice} onChoice={setChoice} />}
        <Perks title={t("flock.billing.includes", "What your membership includes")} items={perks} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
          <Primary disabled={busy} onClick={() => onCheckout(choice)}>{t("flock.billing.joinFlock", "Join the Flock")}</Primary>
          {failed && <ErrorLine />}
          <p style={{ margin: 0, textAlign: "center", fontSize: 14, lineHeight: 1.5, color: K.ink }}>
            {choice === "annual"
              ? t("flock.billing.renewsYearly", "Renews once a year. Cancel anytime in Manage billing.")
              : t("flock.billing.renewsMonthly", "Renews every month. Cancel anytime in Manage billing.")}
          </p>
          <Secure>{t("flock.billing.secure", "Secure checkout with Stripe")}</Secure>
        </div>
      </Sheet>
    </Screen>
  );
}

/** BillingConfirming, and its quiet fallback if the webhook is slow. */
export function BillingConfirming({ slow }: { slow: boolean }) {
  const { t } = useTranslation();
  return (
    <div data-testid="billing-confirming" style={{ minHeight: "100dvh", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, padding: "40px 32px", background: K.forest, color: "#fff", textAlign: "center" }}>
      <div style={{ position: "relative", width: 112, height: 112 }}>
        <svg className={slow ? undefined : "animate-spin motion-reduce:animate-none"} width="112" height="112" viewBox="0 0 112 112" aria-hidden="true" style={{ position: "absolute", inset: 0 }}>
          <circle cx="56" cy="56" r="50" fill="none" stroke={K.moss} strokeWidth="6" /><path d="M56 6a50 50 0 0 1 50 50" fill="none" stroke={K.sunflower} strokeWidth="6" strokeLinecap="round" />
        </svg>
        <span style={{ ...grid, position: "absolute", inset: 20, borderRadius: 999, background: K.lime, color: K.forest }}><Leaf size={34} width={1.8} /></span>
      </div>
      <h1 style={{ margin: 0, fontFamily: SERIF, fontSize: 30, fontWeight: 700, lineHeight: 1.15 }}>{t("flock.billing.confirmingTitle", "Confirming your card")}</h1>
      <p role="status" style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: K.paleGreen }}>
        {slow
          ? t("flock.billing.confirmingSlow", "This is taking longer than usual. Your card is safe with Stripe, so there's no need to add it again. Check Membership and billing in a few minutes.")
          : t("flock.billing.confirmingLine", "This can take a minute. You can stay right here, and we'll move on as soon as it's done.")}
      </p>
      {slow && <Link to="/flock" style={{ display: "inline-flex", minHeight: 44, alignItems: "center", fontSize: 15, fontWeight: 700, color: K.sunflower }}>{t("flock.billing.backToFlock", "Back to the Flock")}</Link>}
    </div>
  );
}

const SumRow = ({ label, value, first }: { label: string; value: ReactNode; first?: boolean }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "14px 0", borderTop: first ? 0 : `1px solid ${K.line}`, fontSize: 15 }}>
    <span style={{ color: K.quiet }}>{label}</span><span style={{ fontWeight: 700, textAlign: "right" }}>{value}</span>
  </div>
);

function useCardValue(last4: string | null) {
  const { t } = useTranslation();
  return last4 ? t("flock.billing.cardEnding", "Ending in {{last4}}", { last4 }) : null;
}

/** BillingWelcome and BillingWelcomeFounder. */
export function BillingWelcome({ founder, spot, plan, date, last4, onMembership }: { founder: boolean; spot: number | null; plan: PaidPlan; date: string; last4: string | null; onMembership: () => void }) {
  const { t } = useTranslation();
  const card = useCardValue(last4);
  const link = { alignSelf: "center", display: "inline-flex", minHeight: 44, alignItems: "center", fontSize: 15, fontWeight: 700, color: K.moss, background: "none", border: 0, padding: 0 } as const;
  return (
    <Screen>
      <header style={{ position: "relative", padding: "48px 24px 70px", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center", overflow: "hidden" }}>
        <svg width="390" height="300" viewBox="0 0 390 300" aria-hidden="true" style={{ position: "absolute", left: "50%", marginLeft: -195, top: 0 }}>
          <circle cx="40" cy="40" r="90" fill={K.moss} opacity="0.5" /><circle cx="360" cy="200" r="70" fill={K.moss} opacity="0.5" />
          <path d="M300 60c20-30 50-40 70-40-6 30-30 46-70 40z" fill={founder ? K.sunflower : K.lime} opacity="0.5" /><path d="M40 210c16-26 40-36 60-36-6 26-26 40-60 36z" fill={founder ? K.lime : K.sunflower} opacity="0.45" />
        </svg>
        <span style={{ ...grid, position: "relative", width: 76, height: 76, borderRadius: 999, background: K.sunflower, border: "3px solid #fff", color: K.forest }}>{founder ? <Star /> : <Check size={36} />}</span>
        {founder && <p style={{ position: "relative", margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: K.sunflower }}>{spot != null ? t("flock.billing.foundingSpot", "Founding 50 · Spot #{{spot}}", { spot }) : t("flock.billing.founding50", "Founding 50")}</p>}
        <h1 style={{ position: "relative", margin: 0, fontFamily: SERIF, fontSize: 34, fontWeight: 700, lineHeight: 1.08 }}>
          {founder
            ? <Trans i18nKey="flock.billing.spotSafe" defaults="Your spot is <em>safe</em>" components={{ em }} />
            : <Trans i18nKey="flock.billing.allSet" defaults="You're <em>all set</em>" components={{ em }} />}
        </h1>
        <p style={{ position: "relative", margin: 0, fontSize: 16, lineHeight: 1.5, color: K.paleGreen }}>
          {founder
            ? t("flock.billing.welcomeFounderLine", "Your founding price is locked in. Thank you for helping start the Flock.")
            : t("flock.billing.welcomeLine", "Your place in the Flock is saved for after the free season. Nothing changes until then.")}
        </p>
      </header>
      <main style={{ flexGrow: 1, marginTop: -26, borderRadius: "26px 26px 0 0", background: K.mist, padding: "22px 16px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
        <section style={{ background: "#fff", borderRadius: 20, padding: "6px 20px" }}>
          <SumRow first label={t("flock.billing.planLabel", "Plan")} value={planName(t, plan)} />
          <SumRow label={t("flock.billing.freeUntil", "Free until")} value={date} />
          {card && <SumRow label={t("flock.billing.cardLabel", "Card")} value={card} />}
        </section>
        <section style={{ display: "flex", gap: 12, alignItems: "center", padding: 16, borderRadius: 18, background: K.sunflower, border: `2px solid ${K.forest}` }}>
          <span style={{ ...grid, width: 36, height: 36, flexShrink: 0, borderRadius: 999, background: K.forest, color: K.sunflower }}><Heart /></span>
          <span style={{ fontSize: 14, lineHeight: 1.4 }}><Trans i18nKey="flock.billing.thanks" defaults="<strong>Thank you.</strong> 20% of your membership will go to parrot rescue and conservation partners." components={{ strong: <strong /> }} /></span>
        </section>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
          <Link to="/flock" style={{ display: "grid", placeItems: "center", minHeight: 56, borderRadius: 999, border: `2px solid ${K.forest}`, background: K.sunflower, color: K.forest, fontSize: 17, fontWeight: 700 }}>{t("flock.billing.backToFlock", "Back to the Flock")}</Link>
          {founder
            ? <Link to="/flock/founders" style={link}>{t("flock.founders.meet", "Meet the founding members")}</Link>
            : <button type="button" onClick={onMembership} style={link}>{t("flock.billing.seeMembership", "See membership and billing")}</button>}
        </div>
      </main>
    </Screen>
  );
}

function planName(t: ReturnType<typeof useTranslation>["t"], plan: PaidPlan) {
  if (plan === "founding") return t("flock.billing.planFounding", "Founding member");
  return plan === "annual" ? t("flock.billing.yearlyLabel", "Yearly") : t("flock.billing.monthlyLabel", "Monthly");
}

function MembershipFrame({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Screen>
      <header style={{ padding: "14px 20px 46px", color: "#fff", display: "flex", flexDirection: "column", gap: 14 }}>
        <BackButton />
        <h1 style={{ margin: 0, fontFamily: SERIF, fontWeight: 700, fontSize: 30, lineHeight: 1.15 }}>{t("flock.you.membership", "Membership and billing")}</h1>
      </header>
      <main style={{ flexGrow: 1, marginTop: -26, borderRadius: "26px 26px 0 0", background: K.mist, padding: "20px 16px 24px", display: "flex", flexDirection: "column", gap: 16 }}>{children}</main>
    </Screen>
  );
}

export type MembershipSub = { plan: PaidPlan; status: "active" | "trialing" | "past_due" | "canceled"; periodEnd: string | null; willRenew: boolean; last4: string | null };

/** BillingMembership. The mockup shows the free season; the other states use
 *  the same layout with the row that's true for them. */
export function BillingMembership({ sub, busy, failed, onManage }: { sub: MembershipSub; busy: boolean; failed: boolean; onManage: () => void }) {
  const { t } = useTranslation();
  const card = useCardValue(sub.last4);
  const date = sub.periodEnd ? billingDay(sub.periodEnd) : null;
  const line = !sub.willRenew
    ? t("flock.billing.ends", "Your membership won't renew.")
    : sub.status === "trialing"
      ? t("flock.billing.seasonSet", "Free season · you're all set for after")
      : t("flock.billing.renews", "Your membership renews automatically.");
  const dateLabel = !sub.willRenew
    ? t("flock.billing.accessUntil", "Access until")
    : sub.status === "trialing"
      ? t("flock.billing.firstCharge", "First charge")
      : t("flock.billing.nextCharge", "Next charge");
  return (
    <MembershipFrame>
      <section style={{ background: "#fff", borderRadius: 20, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ ...grid, width: 44, height: 44, flexShrink: 0, borderRadius: 14, background: K.lime, color: K.forest }}><Leaf size={20} width={2} /></span>
          <span style={{ flexGrow: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{sub.plan === "founding" ? t("flock.billing.planFounding", "Founding member") : t("flock.billing.flockMember", "Flock member")}</span>
            <span data-testid="billing-on-file" style={{ fontSize: 14, color: K.quiet }}>{line}</span>
          </span>
          <span style={{ padding: "4px 10px", borderRadius: 999, background: K.paleGreen, fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{t("flock.billing.onFile", "Card on file")}</span>
        </div>
        <div style={{ marginTop: 14 }}>
          <SumRow label={t("flock.billing.planLabel", "Plan")} value={planName(t, sub.plan)} />
          {date && <SumRow label={dateLabel} value={date} />}
          {card && <SumRow label={t("flock.billing.cardLabel", "Card")} value={card} />}
        </div>
        <button type="button" disabled={busy} onClick={onManage} style={{ marginTop: 10, width: "100%", minHeight: 48, borderRadius: 999, border: `2px solid ${K.forest}`, background: "#fff", color: K.forest, fontSize: 15, fontWeight: 700, opacity: busy ? 0.6 : 1 }}>{t("flock.billing.manage", "Manage billing")}</button>
        {failed && <div style={{ marginTop: 10 }}><ErrorLine /></div>}
        <p style={{ margin: "10px 0 0", textAlign: "center", fontSize: 13, lineHeight: 1.45, color: K.quiet }}>{t("flock.billing.manageLine", "Change your card or plan, or cancel, any time.")}</p>
      </section>
      <section style={{ display: "flex", gap: 12, alignItems: "center", padding: 16, borderRadius: 18, background: K.amberBg }}>
        <span style={{ ...grid, width: 36, height: 36, flexShrink: 0, borderRadius: 999, background: K.forest, color: K.sunflower }}><Heart /></span>
        <span style={{ fontSize: 14, lineHeight: 1.4, color: K.amberText }}><Trans i18nKey="flock.billing.givesBackNote" defaults="<strong>Your membership gives back.</strong> 20% goes to parrot rescue and conservation partners." components={{ strong: <strong style={{ color: K.forest }} /> }} /></span>
      </section>
    </MembershipFrame>
  );
}

/** BillingPastDue: "Update my card" opens the Stripe Customer Portal. */
export function BillingPastDue({ sub, busy, failed, onManage }: { sub: MembershipSub; busy: boolean; failed: boolean; onManage: () => void }) {
  const { t } = useTranslation();
  const card = useCardValue(sub.last4);
  const date = sub.periodEnd ? billingDay(sub.periodEnd) : null;
  return (
    <MembershipFrame>
      <section role="alert" data-testid="billing-past-due" style={{ background: K.amberBg, border: `2px solid ${K.amberText}`, borderRadius: 20, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ ...grid, width: 40, height: 40, flexShrink: 0, borderRadius: 999, background: K.amberText, color: "#fff" }}><Card size={20} /></span>
          <span style={{ fontSize: 17, fontWeight: 700 }}>{t("flock.billing.pastDueTitle", "Your last payment didn't go through")}</span>
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: K.amberText }}>
          {date
            ? t("flock.billing.pastDueLine", "It happens, often with an expired card. Update your card by {{date}} to keep your place in the Flock.", { date })
            : t("flock.billing.pastDueNoDate", "It happens, often with an expired card. Update your card to keep your place in the Flock.")}
        </p>
        <Primary height={52} disabled={busy} onClick={onManage}>{t("flock.billing.updateCard", "Update my card")}</Primary>
        {failed && <ErrorLine />}
      </section>
      <section style={{ background: "#fff", borderRadius: 20, padding: "6px 20px" }}>
        <SumRow first label={t("flock.billing.planLabel", "Plan")} value={planName(t, sub.plan)} />
        {date && <SumRow label={t("flock.billing.accessUntil", "Access until")} value={date} />}
        {card && <SumRow label={t("flock.billing.cardLabel", "Card")} value={card} />}
      </section>
    </MembershipFrame>
  );
}
