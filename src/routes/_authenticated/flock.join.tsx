import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Gift, Loader2, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading, KyaLink, KyaPrimaryButton, KyaSheet } from "@/components/kya";
import { FlockSection, RegionSheet } from "@/components/flock/FlockPeople";
import { chapterLine } from "@/lib/flockNav";
import { defaultDisplayName } from "@/lib/flockProfile";
import { useCareName, useRegions } from "@/lib/flockData";
import { FLOCK_ACCESS_QUERY, agreeAndJoin, joinErrorKind } from "@/lib/flockJoin";
import { joinSource } from "@/lib/flockAnalytics";
import { rescueStep, useMyRescue, type MyRescue } from "@/lib/flockRescue";

// Join the Flock (payments plan build C). Reached from the care app's
// Community button, the Flock layout (anyone who hasn't joined, or hasn't
// agreed to the current guidelines), and links in email, on the website, on
// the founding page and after redeeming a gift (?source=…).
//
// It opens with the "Part of the Flock" sheet (the locked-journey pattern, no
// prices), then one screen: your chapter and "I'm 18 or older". The community
// guidelines are agreed in the walk-through (/flock/agree), which the layout
// shows before this step; there's no second checkbox here (Brittany, Nov 28,
// 2026; 20261128210000). Join records the chapter and 18+ and calls
// flock_join(), which needs both that record and the walk-through agreement. Founders, chapter leads and
// members who already have a membership go through the same step and get
// nothing new. Someone who joins before opening day sees when it opens.
//
// "Have a rescue code?" (backlog 1.16) sits under the sheet's button and at
// the bottom of the step, and opens /flock/rescue. Once a code is sent, the
// card says where it stands instead. Founders don't see it.
type Search = { source?: string };

export const Route = createFileRoute("/_authenticated/flock/join")({
  validateSearch: (s: Record<string, unknown>): Search => (typeof s.source === "string" ? { source: joinSource(s.source) } : {}),
  component: FlockJoin,
});

function FlockJoin() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { source } = Route.useSearch();
  const { data: access, isLoading } = useQuery(FLOCK_ACCESS_QUERY);
  const { data: regions } = useRegions();
  const { data: care } = useCareName();
  const { data: rescue } = useMyRescue();

  const [intro, setIntro] = useState(true);
  const [region, setRegion] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [adult, setAdult] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = !!access && access.agreed && access.member_now && !access.is_admin;
  const waiting = !!access && access.agreed && access.has_membership && !access.member_now;
  // Already in (a member who has agreed): straight to the Flock.
  useEffect(() => { if (done) void navigate({ to: "/flock", replace: true }); }, [done, navigate]);
  // Someone re-agreeing to new guidelines doesn't need the intro.
  useEffect(() => { if (access?.has_membership) setIntro(false); }, [access?.has_membership]);

  const r = regions?.find((x) => x.slug === region);
  const ready = !!region && adult && !saving;

  const join = async () => {
    if (!region) { setError(t("flock.join.needRegion", "Choose your chapter first.")); return; }
    if (!adult) { setError(t("flock.join.needAdult", "Please confirm you're 18 or older.")); return; }
    setSaving(true);
    setError(null);
    try {
      await agreeAndJoin({ region, displayName: defaultDisplayName(care?.first_name, care?.full_name), adult, source });
      await qc.invalidateQueries({ queryKey: ["flock"] });
      const next = await qc.fetchQuery({ ...FLOCK_ACCESS_QUERY, staleTime: 0 });
      if (next?.member_now) void navigate({ to: "/flock", replace: true });
      else setSaving(false);
    } catch (e) {
      const kind = joinErrorKind(e);
      setError(
        kind === "season_over" ? t("flock.join.seasonOver", "Joining for the free season has closed.")
          : kind === "not_open" || kind === "closed" ? t("flock.join.notOpen", "The Flock isn't open to new members yet.")
          : kind === "guidelines_outdated" ? t("flock.join.outdated", "The guidelines have just changed. Reload the page to read the new version.")
          : t("flock.join.error", "We couldn't save that. Check your connection and try again."),
      );
      setSaving(false);
    }
  };

  if (isLoading || !access || done) {
    return (
      <div className="grid min-h-[100dvh] place-items-center" style={{ background: K.forest }} role="status" aria-label={t("flock.join.loading", "Loading")}>
        <Loader2 className="size-8 animate-spin text-white" />
      </div>
    );
  }

  if (waiting) return <JoinWaiting opensAt={access.opens_at} />;

  return (
    <div className="min-h-[100dvh]" style={{ background: K.mist }} data-testid="flock-join">
      <header className="text-white" style={{ background: K.forest }}>
        <div className="mx-auto max-w-md px-5 pb-[46px] pt-[calc(env(safe-area-inset-top)+18px)]">
          <Link to="/dashboard" className="inline-flex min-h-[44px] items-center text-[15px] font-[700] underline underline-offset-4" style={{ color: "#fff" }}>
            {t("flock.join.back", "Back to my birds")}
          </Link>
          <KyaHeading as="h1" size={30} className="mt-3 text-white">
            {access.has_membership ? t("flock.join.titleMember", "Before you go in") : t("flock.join.title", "Join the Flock")}
          </KyaHeading>
          <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>
            {t("flock.join.lineChapter", "Choose your chapter, confirm you're 18 or older, and you're in.")}
          </p>
        </div>
      </header>
      <main className="relative mx-auto -mt-[26px] flex max-w-md flex-col gap-4 rounded-t-[26px] px-4 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-5" style={{ background: K.mist }}>
        <FlockSection title={t("flock.setup.chapter", "Your chapter")} hint={t("flock.setup.chapterHint", "Members see your region, never your address.")}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[16px] font-[700]" data-testid="join-region" style={{ color: K.forest }}>
              {r ? chapterLine(r.name, r.states, t) : t("flock.join.noRegion", "Not chosen yet")}
            </span>
            <KyaLink onClick={() => setPicking(true)}>{r ? t("flock.setup.change", "Change") : t("flock.join.choose", "Choose")}</KyaLink>
          </div>
        </FlockSection>

        <div className="flex flex-col gap-2 rounded-[20px] bg-white px-4 py-3">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-[15.5px] font-[700]" style={{ color: K.forest }}>
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} data-testid="join-adult"
              className="size-5 shrink-0" style={{ accentColor: K.forest }} />
            {t("flock.join.adult", "I'm 18 or older")}
          </label>
        </div>
        <Link to="/flock/guidelines" data-testid="join-guidelines-link"
          className="inline-flex min-h-[44px] items-center text-[15px] font-[700]" style={{ color: K.moss }}>
          {t("flock.join.readGuidelines", "Read the community guidelines →")}
        </Link>

        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
        <button
          type="button"
          onClick={() => void join()}
          disabled={!ready}
          data-testid="join-submit"
          className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700] active:scale-[0.99] disabled:opacity-50"
          style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
        >
          {saving ? t("flock.join.saving", "Joining…") : t("flock.join.cta", "Join the Flock")}
        </button>
        <RescueCard rescue={rescue} hidden={access.has_membership && !rescue?.status} />
      </main>

      {intro && (
        <KyaSheet
          onClose={() => void navigate({ to: "/dashboard" })}
          closeLabel={t("flock.region.close", "Close")}
          title={(
            <div className="flex flex-col gap-1">
              <span className="text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>{t("flock.journeys.flockOnly.eyebrow", "Part of the Flock")}</span>
              <KyaHeading size={23}>{t("flock.join.sheetTitle", "Join the Flock")}</KyaHeading>
            </div>
          )}
        >
          <div data-testid="join-flock-sheet" className="flex flex-col gap-3">
            <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>
              {t("flock.journeys.flockOnly.about", "The Flock is The Kya Project's community, where you'll find your local chapter, a library of guides and recordings, and every training journey, including tricks, nail trims, and stationing.")}
            </p>
            <p className="m-0 rounded-[14px] px-3.5 py-3 text-[15px] font-[700] leading-[1.45]" style={{ background: "#e8f3dc", color: K.forest }}>
              {t("flock.journeys.flockOnly.free", "Join the Flock early, while it's free for everyone.")}
            </p>
            <KyaPrimaryButton onClick={() => setIntro(false)}>{t("flock.join.sheetCta", "Join the Flock free")}</KyaPrimaryButton>
            <RescueCard rescue={rescue} />
          </div>
        </KyaSheet>
      )}
      {picking && regions && (
        <RegionSheet regions={regions} value={region} onClose={() => setPicking(false)} onPick={(s) => { setRegion(s); setPicking(false); }} />
      )}
    </div>
  );
}

/** "Have a rescue code?", or where a sent code stands. */
function RescueCard({ rescue, hidden }: { rescue: MyRescue | null | undefined; hidden?: boolean }) {
  const { t } = useTranslation();
  const step = rescueStep(rescue);
  if (hidden || step === "founder" || rescue === undefined) return null;
  const title = step === "pending" ? t("flock.join.rescuePending", "Your adoption is being confirmed")
    : step === "welcome" ? t("flock.join.rescueApproved", "Your rescue adoption is confirmed")
    : step === "declined" ? t("flock.join.rescueDeclined", "We couldn't confirm your adoption")
    : t("flock.join.rescueTitle", "Have a rescue code?");
  const line = step === "pending" ? t("flock.join.rescuePendingLine", "We'll send a welcome message once it's confirmed, usually within a day or two.")
    : step === "welcome" ? t("flock.join.rescueApprovedLine", "You have six months in the Flock, free.")
    : step === "declined" ? t("flock.join.rescueDeclinedLine", "See what happened and try again.")
    : t("flock.rescue.about", "Adopted from a partner rescue? Your code gives you six months in the Flock.");
  return (
    <Link to="/flock/rescue" data-testid="join-rescue" data-rescue-step={step}
      className="flex min-h-[44px] items-center gap-3 rounded-[18px] px-4 py-3.5 no-underline" style={{ background: K.lime, color: K.forest }}>
      <Gift className="size-5 shrink-0" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15.5px] font-[700] leading-[1.25]">{title}</span>
        <span className="text-[13.5px] leading-[1.45]" style={{ color: K.ink }}>{line}</span>
      </span>
      <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
    </Link>
  );
}

/** Joined before opening day: when it opens, and the way back to care. */
function JoinWaiting({ opensAt }: { opensAt: string | null }) {
  const { t, i18n } = useTranslation();
  const date = opensAt ? new Date(opensAt).toLocaleDateString(i18n.language, { month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" }) : null;
  return (
    <main data-testid="flock-join-waiting"
      className="flex min-h-[100dvh] flex-col items-center justify-center px-6 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+32px)] text-center text-white"
      style={{ background: K.forest }}>
      <div className="flex w-full max-w-sm flex-col items-center">
        <span className="grid size-20 place-items-center rounded-full" style={{ background: K.sunflower, color: K.forest }} aria-hidden="true">
          <Star className="size-9" fill="currentColor" />
        </span>
        <KyaHeading as="h1" size={32} className="mt-6 text-white">{t("flock.join.waitingTitle", "You're in")}</KyaHeading>
        <p className="m-0 mt-4 text-[16px] leading-[1.55]" style={{ color: K.paleGreen }}>
          {date
            ? t("flock.join.waitingLine", "The Flock opens on {{date}}. We'll see you there.", { date })
            : t("flock.join.waitingSoon", "The Flock opens soon. We'll see you there.")}
        </p>
        <Link to="/dashboard" className="mt-9 inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700]"
          style={{ background: K.sunflower, borderColor: K.forestDeep, color: K.forest }}>
          {t("flock.join.back", "Back to my birds")}
        </Link>
      </div>
    </main>
  );
}
