import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaHeading } from "@/components/kya";
import { greetingName } from "@/lib/flockProfile";
import { useCareName, useMyProfile, useMySetup } from "@/lib/flockData";

// The first time a member opens Community: one forest screen, then setup.
// Shown until setup is saved (the /flock layout sends them here), never after.
export const Route = createFileRoute("/_authenticated/flock/welcome")({
  component: FlockWelcome,
});

function FlockWelcome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: setup } = useMySetup();
  const { data: care } = useCareName();
  const { data: me } = useMyProfile();
  const first = greetingName(care?.first_name, me?.display_name);
  const spot = setup?.founding_spot;
  const badgeLine = spot
    ? t("flock.welcome.founding", "Founding member · {{n}} of 50", { n: spot })
    : t("flock.welcome.member", "Member");
  return (
    <main
      data-testid="flock-welcome"
      className="flex min-h-[100dvh] flex-col items-center justify-center px-6 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+32px)] text-center text-white"
      style={{ background: K.forest }}
    >
      <div className="flex w-full max-w-sm flex-col items-center">
        <span className="grid size-20 place-items-center rounded-full" style={{ background: K.sunflower, color: K.forest }} aria-hidden="true">
          <Star className="size-9" fill="currentColor" />
        </span>
        <p className="m-0 mt-6 text-[13px] font-[700] uppercase tracking-[0.12em]" style={{ color: K.teal }}>{badgeLine}</p>
        <KyaHeading as="h1" size={34} className="mt-3 text-white">
          {first
            ? t("flock.welcome.title", "Welcome to the Flock, {{name}}", { name: first })
            : t("flock.welcome.titleNoName", "Welcome to the Flock")}
        </KyaHeading>
        <p className="m-0 mt-4 text-[16px] leading-[1.55]" style={{ color: K.paleGreen }}>
          {t("flock.welcome.line", "This is a place to learn alongside other bird people, share how your birds are doing, and do some good together.")}
        </p>
        <button
          type="button"
          onClick={() => void navigate({ to: "/flock/setup" })}
          className="mt-9 inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700] active:scale-[0.99]"
          style={{ background: K.sunflower, borderColor: K.forestDeep, color: K.forest }}
        >
          {t("flock.welcome.cta", "Let's get you set up")}
        </button>
        <p className="m-0 mt-3 text-[14px]" style={{ color: K.paleGreen }}>{t("flock.welcome.time", "Takes about a minute")}</p>
      </div>
    </main>
  );
}
