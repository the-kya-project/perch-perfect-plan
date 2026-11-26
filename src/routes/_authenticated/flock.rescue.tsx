import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Gift, Loader2, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaField, KyaHeading } from "@/components/kya";
import { FLOCK_CONTACT_EMAIL } from "@/lib/flockGuidelines";
import {
  adoptionProblem, checkRescueCode, flockTodayIso, markRescueSeen, redeemRescueCode, rescueCodeLooksValid, rescueDate,
  rescueStep, RESCUE_LIMITS, useInvalidateRescue, useMyRescue, type MyRescue, type RescueReason,
} from "@/lib/flockRescue";

// Have a rescue code? (backlog 1.16, mockup docs/flock/mockups/SpecRescueCodes.dc.html,
// screens 1 and 2). Reached from the Join screen and the redeem page. Inside
// the /flock layout, so it's behind flock_enabled() (admins only until the
// members switch is on), and it's one of the paths someone who hasn't joined
// may open (isJoinPath), without the member chrome.
//
// The code, then the bird's name, species and adoption date, then "being
// confirmed" until an admin reviews it in /admin/review. Approved: a welcome,
// and on to the Join screen (chapter and guidelines). Declined: a note and a
// way to try again. A founder is told codes can't be combined with a founding
// spot. Nothing here mentions a price: a rescue code never collects payment.
type Search = { code?: string };

export const Route = createFileRoute("/_authenticated/flock/rescue")({
  validateSearch: (s: Record<string, unknown>): Search => (typeof s.code === "string" && s.code.length <= 40 ? { code: s.code } : {}),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: FlockRescue,
});

function FlockRescue() {
  const { t } = useTranslation();
  const { data: mine, isLoading } = useMyRescue();
  const step = rescueStep(mine);

  if (isLoading) {
    return (
      <div className="grid min-h-[100dvh] place-items-center" style={{ background: K.forest }} role="status" aria-label={t("flock.join.loading", "Loading")}>
        <Loader2 className="size-8 animate-spin text-white" />
      </div>
    );
  }
  if (step === "welcome" && mine) return <RescueWelcome mine={mine} />;
  if (step === "pending" && mine) return <RescuePending mine={mine} />;
  if (step === "declined" && mine) return <RescueDeclined mine={mine} />;
  if (step === "founder") return <RescueFounder />;
  return <RescueForm />;
}

/** The forest header the mockup uses: a back link, the title, an optional line. */
function RescueHeader({ title, sub, onBack }: { title: string; sub?: string | null; onBack?: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="text-white" style={{ background: K.forest }}>
      <div className="mx-auto max-w-md px-5 pb-[46px] pt-[calc(env(safe-area-inset-top)+18px)]">
        {onBack ? (
          <button type="button" onClick={onBack} className="inline-flex min-h-[44px] items-center text-[15px] font-[700] underline underline-offset-4" style={{ color: "#fff" }}>
            {t("flock.rescue.back", "Back")}
          </button>
        ) : (
          <Link to="/flock/join" className="inline-flex min-h-[44px] items-center text-[15px] font-[700] underline underline-offset-4" style={{ color: "#fff" }}>
            {t("flock.rescue.backToJoin", "Back to Join the Flock")}
          </Link>
        )}
        <KyaHeading as="h1" size={30} className="mt-3 text-white">{title}</KyaHeading>
        {sub && <p className="m-0 mt-1 text-[15px] font-[700]" style={{ color: K.lime }} data-testid="rescue-partner">{sub}</p>}
      </div>
    </header>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative mx-auto -mt-[26px] flex max-w-md flex-col gap-4 rounded-t-[26px] px-4 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-5" style={{ background: K.mist }}>
      {children}
    </main>
  );
}

function SubmitButton({ children, disabled, testId, onClick }: { children: React.ReactNode; disabled?: boolean; testId: string; onClick?: () => void }) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700] active:scale-[0.99] disabled:opacity-50"
      style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
    >
      {children}
    </button>
  );
}

function reasonText(t: ReturnType<typeof useTranslation>["t"], reason: RescueReason): string {
  switch (reason) {
    case "rate_limited": return t("redeem.rateLimited", "That's a lot of tries in a short time. Please wait an hour, then try again.");
    case "already_redeemed": return t("flock.rescue.already", "This account has already used a rescue code.");
    case "founder": return t("flock.rescue.founderLine", "Rescue codes can't be combined with a founding spot, and your founding membership already includes the Flock.");
    default: return t("flock.rescue.invalid", "That code didn't work. Check it with your rescue and try again.");
  }
}

function RescueForm() {
  const { t } = useTranslation();
  const invalidate = useInvalidateRescue();
  const { code: codeParam } = Route.useSearch();
  const [code, setCode] = useState((codeParam ?? "").toUpperCase());
  const [partner, setPartner] = useState<string | null>(null);
  const [birdName, setBirdName] = useState("");
  const [species, setSpecies] = useState("");
  const [adoptedOn, setAdoptedOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<"bird_name" | "species" | "adopted_on" | null>(null);
  const today = flockTodayIso();

  useEffect(() => { if (partner) document.getElementById("rescue-bird")?.focus(); }, [partner]);

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!rescueCodeLooksValid(code)) { setError(t("flock.rescue.enterCode", "Enter the code your rescue gave you.")); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await checkRescueCode(code);
      if (r.ok) setPartner(r.partner);
      else if (r.reason === "founder") await invalidate();
      else setError(reasonText(t, r.reason));
    } catch {
      setError(t("flock.join.error", "We couldn't save that. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const problem = adoptionProblem({ birdName, species, adoptedOn }, today);
    setField(problem);
    if (problem) {
      setError(problem === "bird_name" ? t("flock.rescue.needName", "Add your bird's name.")
        : problem === "species" ? t("flock.rescue.needSpecies", "Add your bird's species.")
        : t("flock.rescue.needDate", "Choose the adoption date. It can't be in the future."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await redeemRescueCode({ code, birdName, species, adoptedOn });
      if (r.ok || r.reason === "founder" || r.reason === "already_redeemed") { await invalidate(); return; }
      setError(reasonText(t, r.reason));
      if (r.reason === "invalid") setPartner(null);
    } catch {
      setError(t("flock.join.error", "We couldn't save that. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  };

  if (!partner) {
    return (
      <div className="min-h-[100dvh]" style={{ background: K.mist }} data-testid="flock-rescue">
        <RescueHeader title={t("flock.rescue.title", "Have a rescue code?")} />
        <Body>
          <form onSubmit={(e) => void check(e)} noValidate className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-[18px] px-4 py-3.5" style={{ background: K.lime, color: K.forest }}>
              <Gift className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p className="m-0 text-[15px] leading-[1.45]">
                {t("flock.rescue.about", "Adopted from a partner rescue? Your code gives you six months in the Flock.")}
              </p>
            </div>
            <KyaField
              id="rescue-code"
              label={t("flock.rescue.codeLabel", "Rescue code")}
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
              placeholder="BIRDSANDBEAKS"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              data-testid="rescue-code"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "rescue-error" : undefined}
              className="font-[700] tracking-[0.06em]"
            />
            {error && <p id="rescue-error" role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
            <SubmitButton disabled={busy} testId="rescue-code-submit">
              {busy ? t("flock.rescue.checking", "Checking…") : t("flock.rescue.continue", "Continue")}
            </SubmitButton>
          </form>
        </Body>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh]" style={{ background: K.mist }} data-testid="flock-rescue-details">
      <RescueHeader title={t("flock.rescue.codeLabel", "Rescue code")} sub={partner} onBack={() => { setPartner(null); setError(null); }} />
      <Body>
        <form onSubmit={(e) => void send(e)} noValidate className="flex flex-col gap-4">
          <p className="m-0 text-[15.5px] leading-[1.5]" style={{ color: K.forest }}>
            {t("flock.rescue.detailsLine", "Congratulations on your new bird. Tell us a little about the adoption so we can confirm it.")}
          </p>
          <KyaField id="rescue-bird" label={t("flock.rescue.birdName", "Bird's name")} value={birdName}
            onChange={(e) => setBirdName(e.target.value)} maxLength={RESCUE_LIMITS.birdName} autoComplete="off" data-testid="rescue-bird"
            aria-invalid={field === "bird_name" ? true : undefined} />
          <KyaField id="rescue-species" label={t("flock.rescue.species", "Species")} value={species}
            onChange={(e) => setSpecies(e.target.value)} maxLength={RESCUE_LIMITS.species} autoComplete="off" data-testid="rescue-species"
            aria-invalid={field === "species" ? true : undefined} />
          <KyaField id="rescue-date" type="date" label={t("flock.rescue.adoptedOn", "Adoption date")} value={adoptedOn}
            onChange={(e) => setAdoptedOn(e.target.value)} max={today} min="1950-01-01" data-testid="rescue-date"
            aria-invalid={field === "adopted_on" ? true : undefined} />
          {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
          <SubmitButton disabled={busy} testId="rescue-send">
            {busy ? t("flock.rescue.sending", "Sending…") : t("flock.rescue.send", "Send for confirmation")}
          </SubmitButton>
          <p className="m-0 text-[13.5px] leading-[1.45]" style={{ color: K.ink }}>
            {t("flock.rescue.welcomeNote", "You'll get a welcome message once it's confirmed, usually within a day or two.")}
          </p>
        </form>
      </Body>
    </div>
  );
}

function RescuePending({ mine }: { mine: MyRescue }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-[100dvh]" style={{ background: K.mist }} data-testid="rescue-pending">
      <RescueHeader title={t("flock.rescue.pendingTitle", "Your adoption is being confirmed")} sub={mine.partner_name} />
      <Body>
        <div className="flex flex-col gap-2 rounded-[18px] bg-white px-4 py-3.5">
          <p className="m-0 text-[16px] font-[700]" style={{ color: K.forest }}>
            {t("flock.rescue.pendingLine", "We're confirming {{bird}}'s adoption with {{rescue}}.", { bird: mine.bird_name, rescue: mine.partner_name })}
          </p>
          <p className="m-0 text-[14.5px] leading-[1.45]" style={{ color: K.ink }}>
            {t("flock.rescue.pendingNote", "You'll get a welcome message here once it's confirmed, usually within a day or two.")}
          </p>
        </div>
        <Link to="/dashboard" className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700]"
          style={{ background: "#fff", borderColor: K.forest, color: K.forest }}>
          {t("flock.join.back", "Back to my birds")}
        </Link>
      </Body>
    </div>
  );
}

function RescueWelcome({ mine }: { mine: MyRescue }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateRescue();
  const start = rescueDate(mine.starts_at, i18n.language);
  const end = rescueDate(mine.ends_at, i18n.language);
  const go = async () => {
    if (mine.redemption_id) await markRescueSeen(mine.redemption_id).catch(() => undefined);
    await invalidate();
    void navigate({ to: "/flock/join" });
  };
  return (
    <main data-testid="rescue-welcome"
      className="flex min-h-[100dvh] flex-col items-center justify-center px-6 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+32px)] text-center text-white"
      style={{ background: K.forest }}>
      <div className="flex w-full max-w-sm flex-col items-center">
        <span className="grid size-20 place-items-center rounded-full" style={{ background: K.sunflower, color: K.forest }} aria-hidden="true">
          <Star className="size-9" fill="currentColor" />
        </span>
        <KyaHeading as="h1" size={32} className="mt-6 text-white">{t("flock.rescue.welcomeTitle", "Welcome to the Flock")}</KyaHeading>
        <p className="m-0 mt-4 text-[16px] leading-[1.55]" style={{ color: K.paleGreen }}>
          {t("flock.rescue.welcomeLine", "{{rescue}} confirmed {{bird}}'s adoption. You have six months in the Flock, free.", { rescue: mine.partner_name, bird: mine.bird_name })}
        </p>
        <p className="m-0 mt-3 text-[15px] font-[700] leading-[1.5]" style={{ color: K.lime }} data-testid="rescue-dates">
          {start && end
            ? t("flock.rescue.welcomeDates", "Your six months: {{start}} to {{end}}.", { start, end })
            : t("flock.rescue.welcomeWhen", "Your six months start when the free season ends.")}
        </p>
        <button type="button" onClick={() => void go()} data-testid="rescue-welcome-continue"
          className="mt-9 inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700]"
          style={{ background: K.sunflower, borderColor: K.forestDeep, color: K.forest }}>
          {t("flock.rescue.welcomeCta", "Continue")}
        </button>
      </div>
    </main>
  );
}

function RescueDeclined({ mine }: { mine: MyRescue }) {
  const { t } = useTranslation();
  const invalidate = useInvalidateRescue();
  const again = async () => {
    if (mine.redemption_id) await markRescueSeen(mine.redemption_id).catch(() => undefined);
    await invalidate();
  };
  return (
    <div className="min-h-[100dvh]" style={{ background: K.mist }} data-testid="rescue-declined">
      <RescueHeader title={t("flock.rescue.declinedTitle", "We couldn't confirm this adoption")} sub={mine.partner_name} />
      <Body>
        <div className="flex flex-col gap-2 rounded-[18px] bg-white px-4 py-3.5">
          <p className="m-0 text-[15.5px] leading-[1.5]" style={{ color: K.forest }}>
            {t("flock.rescue.declinedLine", "{{rescue}} couldn't confirm {{bird}}'s adoption. If you think that's a mistake, check with your rescue and try again, or email us at {{email}}.",
              { rescue: mine.partner_name, bird: mine.bird_name, email: FLOCK_CONTACT_EMAIL })}
          </p>
        </div>
        <SubmitButton testId="rescue-try-again" onClick={() => void again()}>{t("flock.rescue.tryAgain", "Try again")}</SubmitButton>
        <Link to="/flock/join" className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700]"
          style={{ background: "#fff", borderColor: K.forest, color: K.forest }}>
          {t("flock.rescue.backToJoin", "Back to Join the Flock")}
        </Link>
      </Body>
    </div>
  );
}

function RescueFounder() {
  const { t } = useTranslation();
  return (
    <div className="min-h-[100dvh]" style={{ background: K.mist }} data-testid="rescue-founder">
      <RescueHeader title={t("flock.rescue.founderTitle", "You already have a founding spot")} />
      <Body>
        <div className="rounded-[18px] bg-white px-4 py-3.5">
          <p className="m-0 text-[15.5px] leading-[1.5]" style={{ color: K.forest }}>
            {t("flock.rescue.founderLine", "Rescue codes can't be combined with a founding spot, and your founding membership already includes the Flock.")}
          </p>
        </div>
      </Body>
    </div>
  );
}
