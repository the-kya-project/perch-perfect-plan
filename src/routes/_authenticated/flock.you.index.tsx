import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bell, CreditCard, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaHeading, KyaIconTile, KyaRow } from "@/components/kya";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { membershipSummary } from "@/lib/flockProfile";
import { useAvatarUrls, useIsAdmin, useMyEntitlements, useMyProfile, useMySetup, useRegions } from "@/lib/flockData";

// You: your Community profile and settings, from the header avatar.
export const Route = createFileRoute("/_authenticated/flock/you/")({
  component: FlockYou,
});

function FlockYou() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMyProfile();
  const { data: setup } = useMySetup();
  const { data: regions } = useRegions();
  const { data: ents } = useMyEntitlements();
  const { data: isAdmin } = useIsAdmin();
  const { data: urls } = useAvatarUrls([me?.photo_path]);
  const region = regions?.find((r) => r.slug === me?.region_slug);
  const founder = !!setup?.founding_spot;
  const membership = membershipSummary(ents ?? [], !!isAdmin);
  const name = me?.display_name ?? "";
  return (
    <>
      <header className="text-white" style={{ background: K.forest }}>
        <div className="mx-auto flex max-w-md flex-col items-center px-5 pb-[46px] pt-[calc(env(safe-area-inset-top)+28px)] text-center lg:max-w-2xl">
          <FlockAvatar name={name} url={me?.photo_path ? urls?.get(me.photo_path) : null} size={88} ring={K.teal} />
          <KyaHeading as="h1" size={28} className="mt-4 text-white">{name}</KyaHeading>
          <p className="m-0 mt-1.5 text-[15px]" style={{ color: K.paleGreen }} data-testid="you-line">
            {[region?.name, founder ? t("flock.you.founding", "Founding member") : t("flock.you.member", "Member")].filter(Boolean).join(" · ")}
          </p>
          <Link to="/flock/you/edit" className="mt-3 inline-flex min-h-[44px] items-center text-[15px] font-[700] underline underline-offset-4" style={{ color: "#fff" }}>
            {t("flock.you.edit", "Edit profile")}
          </Link>
        </div>
      </header>
      <main className="relative mx-auto -mt-[26px] flex min-h-[40vh] max-w-md flex-col gap-4 rounded-t-[26px] px-4 pb-6 pt-5 lg:max-w-2xl" style={{ background: K.mist }}>
        {/* STATS: a card for journeys, posts and badges goes here once those exist. */}
        <KyaCard>
          <KyaRow
            leading={<KyaIconTile tone="mist"><Bell className="size-5" /></KyaIconTile>}
            title={t("flock.you.notifications", "Notifications")}
            detail={t("flock.you.notificationsLine", "Community is separate from care reminders")}
            onClick={() => void navigate({ to: "/flock/you/notifications" })}
          />
          <KyaRow
            leading={<KyaIconTile tone="mist"><CreditCard className="size-5" /></KyaIconTile>}
            title={t("flock.you.membership", "Membership and billing")}
            detail={membership.line}
            onClick={() => void navigate({ to: "/flock/you/membership" })}
          />
          <KyaRow
            leading={<KyaIconTile tone="mist"><ShieldCheck className="size-5" /></KyaIconTile>}
            title={t("flock.you.privacy", "Privacy")}
            detail={t("flock.you.privacyLine", "What members can see")}
            onClick={() => void navigate({ to: "/flock/you/privacy" })}
            last
          />
        </KyaCard>
      </main>
    </>
  );
}
