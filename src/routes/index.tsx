import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { hasStoredSession, getReadySession } from "@/lib/authReady";
import { track } from "@/lib/analytics";
import { BrandLockup } from "@/components/BrandLogo";
import { K, KyaHeading, KyaPrimaryButton } from "@/components/kya";
import { FrontDoorPage, OnForestOutlineButton } from "@/components/frontDoor";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

export const Route = createFileRoute("/")({
  // Returning owners shouldn't land on the marketing page — send them home.
  // Client-only: the session lives in localStorage, so during SSR/prerender
  // there's no session and new visitors/crawlers still get the landing page.
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    // Synchronous: redirect a signed-in owner to the dashboard on the FIRST
    // tick, reading the persisted session straight from storage — no await, so
    // the marketing/sign-in page never paints while the async client hydrates
    // (that paint was the ~0.5s flash on cold launch). The authenticated guard
    // then does the authoritative check behind its clean loading spinner.
    if (hasStoredSession()) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: i18next.t("landing.pageTitle", "Kya & Co. — Calm, clear care for your bird") },
      { name: "description", content: i18next.t("landing.metaDescription", "A shared care plan and health record for every bird — routine, diet, weight, and emergency info, shared with everyone who helps.") },
      { property: "og:title", content: i18next.t("landing.pageTitle", "Kya & Co. — Calm, clear care for your bird") },
      { property: "og:description", content: i18next.t("landing.metaDescription", "A shared care plan and health record for every bird — routine, diet, weight, and emergency info, shared with everyone who helps.") },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Safety net: the beforeLoad guard reads the session synchronously, but on
  // resume-after-idle the WKWebview's storage can read empty for a beat, so a
  // signed-in owner lands on this marketing page instead of the dashboard (they
  // then tap "Sign in", which bounces them home — no real re-auth). Re-check
  // once mounted, awaiting hydration, and redirect if there's a session.
  useEffect(() => {
    let cancelled = false;
    getReadySession().then((session) => {
      if (cancelled) return;
      track("landing_recheck", { had_session: !!session, had_stored: hasStoredSession() });
      if (session) navigate({ to: "/dashboard" });
    });
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <FrontDoorPage>
      {/* The photo fills the top of the screen and fades into forest; the
          headline sits on its lower edge. */}
      <div className="relative h-[60dvh] min-h-[400px] w-full overflow-hidden">
        <img
          src="/brand/email/app-launch-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          // The conure's head sits right of center in the 1040x640 frame; this
          // keeps head and beak in view on a ~390px-wide phone.
          style={{ objectPosition: "64% 30%" }}
        />
        <div
          className="absolute inset-0"
          aria-hidden="true"
          style={{ background: `linear-gradient(to bottom, rgba(18,41,31,0.55) 0%, rgba(18,41,31,0) 26%, rgba(26,61,46,0) 42%, rgba(26,61,46,0.82) 74%, ${K.forest} 100%)` }}
        />
        <div className="absolute inset-x-0 top-0">
          <div className="mx-auto flex max-w-md justify-center px-5 pt-[calc(env(safe-area-inset-top)+14px)]">
            {/* White on the photo: the transparent lockup, knocked out to white,
                centered like every front-door header. */}
            <BrandLockup orientation="horizontal" variant="white" size={124} />
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-md px-5 pb-1">
            <KyaHeading as="h1" size={34} className="text-balance text-white">
              {t("landing.headlineV2", "Everything it takes to care for your parrots, in one place you can share")}
            </KyaHeading>
          </div>
        </div>
      </div>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-3">
        <p className="m-0 text-pretty text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>
          {t("landing.subheadV2", "A care plan and health record for each bird: routine, diet, weight, and the little things only you know. Share it with family, sitters, and anyone who helps.")}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <KyaPrimaryButton onClick={() => navigate({ to: "/auth", search: { mode: "signup" as const } })}>
            {t("landing.addYourFirstBird", "Add your first bird")}
          </KyaPrimaryButton>
          <OnForestOutlineButton onClick={() => navigate({ to: "/auth", search: { mode: "signin" as const } })}>
            {t("landing.alreadyHaveAccountButton", "I already have an account")}
          </OnForestOutlineButton>
        </div>

        <p className="m-0 mt-5 text-center text-[12.5px] leading-[1.45]" style={{ color: K.paleGreen }}>
          {t("landing.invitedHintV2", "Invited by someone? Open the link they sent you.")}
        </p>
        <p className="m-0 mt-auto pt-5 text-center text-[12.5px] leading-[1.45]" style={{ color: K.teal }}>
          {t("disclaimer.compactBody", "Not a substitute for veterinary care. Call a vet for any medical concern.")}
        </p>
      </main>
    </FrontDoorPage>
  );
}
