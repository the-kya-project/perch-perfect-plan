import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Award, Bell, BookOpen, ClipboardCheck, CreditCard, Gift, ShieldCheck, Star, UserX, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaHeading, KyaIconTile, KyaRow } from "@/components/kya";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { FlockContactLine } from "@/components/flock/FlockGuidelines";
import { membershipSummary } from "@/lib/flockProfile";
import { useAvatarUrls, useIsAdmin, useMyEntitlements, useMyProfile, useMySetup, useRegions } from "@/lib/flockData";
import { useCanReview, useReviewCounts } from "@/lib/flockModeration";
import { usePlaceSuggestions } from "@/lib/flockPlaces";
import { useRescueRedemptions } from "@/lib/flockRescue";
import { FLOCK_BADGES, earnedCount, useMyBadges } from "@/lib/flockBadges";

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
  const { data: canReview } = useCanReview();
  const { data: counts } = useReviewCounts(canReview === true);
  const { data: placeSuggestions } = usePlaceSuggestions(canReview === true);
  const { data: rescues } = useRescueRedemptions("pending", canReview === true && isAdmin === true);
  const { data: badges } = useMyBadges();
  const waiting = (counts?.good ?? 0) + (counts?.reports ?? 0) + (counts?.events ?? 0) + (placeSuggestions?.length ?? 0) + (rescues?.length ?? 0);
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
        {/* STATS: a card for journeys and posts goes here once those exist. */}
        <div data-testid="you-badges">
          <KyaCard>
            <KyaRow
              leading={<KyaIconTile tone="mist"><Award className="size-5" /></KyaIconTile>}
              title={t("flock.badges.title", "Badges")}
              detail={badges ? t("flock.badges.count", "{{earned}} of {{total}} earned", { earned: earnedCount(badges), total: FLOCK_BADGES.length }) : undefined}
              onClick={() => void navigate({ to: "/flock/you/badges" })}
            />
            <KyaRow
              leading={<KyaIconTile tone="mist"><Users className="size-5" /></KyaIconTile>}
              title={t("flock.pods.listTitle", "Buddy pods")}
              detail={t("flock.pods.listLine", "Small groups on the same journey")}
              onClick={() => void navigate({ to: "/flock/pods" })}
              last
            />
          </KyaCard>
        </div>
        {/* Reviewers only (flock_can_review: admins today). */}
        {canReview && (
          <div data-testid="you-review-queue">
            <KyaCard>
              <KyaRow
                leading={<KyaIconTile tone="mist"><ClipboardCheck className="size-5" /></KyaIconTile>}
                title={t("flock.review.title", "Review queue")}
                detail={t("flock.review.line", "Admin · {{count}} waiting", { count: waiting })}
                onClick={() => void navigate({ to: "/admin/review" })}
                last={!isAdmin}
              />
              {/* Admins only (backlog 1.16). */}
              {isAdmin && (
                <KyaRow
                  leading={<KyaIconTile tone="mist"><Gift className="size-5" /></KyaIconTile>}
                  title={t("flock.rescueAdmin.title", "Rescue partners")}
                  detail={t("flock.rescueAdmin.rowLine", "Partner rescues and their codes")}
                  onClick={() => void navigate({ to: "/admin/rescues" })}
                  last
                />
              )}
            </KyaCard>
          </div>
        )}
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
            leading={<KyaIconTile tone="mist"><Star className="size-5" /></KyaIconTile>}
            title={t("flock.founders.title", "Founding members")}
            detail={t("flock.you.foundersLine", "The first 50, who helped start the Flock")}
            onClick={() => void navigate({ to: "/flock/founders" })}
          />
          <KyaRow
            leading={<KyaIconTile tone="mist"><ShieldCheck className="size-5" /></KyaIconTile>}
            title={t("flock.you.privacy", "Privacy")}
            detail={t("flock.you.privacyLine", "What members can see")}
            onClick={() => void navigate({ to: "/flock/you/privacy" })}
          />
          <KyaRow
            leading={<KyaIconTile tone="mist"><UserX className="size-5" /></KyaIconTile>}
            title={t("flock.you.blocked", "Blocked members")}
            detail={t("flock.you.blockedLine", "See who you've blocked, and unblock")}
            onClick={() => void navigate({ to: "/flock/you/blocked" })}
          />
          <KyaRow
            leading={<KyaIconTile tone="mist"><BookOpen className="size-5" /></KyaIconTile>}
            title={t("flock.guidelines.title", "Community guidelines")}
            detail={t("flock.you.guidelinesLine", "What everyone in the Flock agrees to")}
            onClick={() => void navigate({ to: "/flock/guidelines" })}
            last
          />
        </KyaCard>
        <div className="px-2 text-[14.5px] leading-[1.5]" style={{ color: K.ink }}>
          <FlockContactLine />
        </div>
      </main>
    </>
  );
}
