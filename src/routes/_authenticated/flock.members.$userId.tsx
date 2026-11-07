import { createFileRoute, Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaHeading } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { BirdThumb, FlockAvatar, FounderBadge } from "@/components/flock/FlockPeople";
import { chapterLine } from "@/lib/flockNav";
import { useAvatarUrls, useBirdPhotoUrls, useMemberProfile, useVisibleBirds } from "@/lib/flockData";

// Another member: photo or initial, name, region, bio, founding badge, and the
// birds they chose to show. Nothing else exists to show (flock_member_profile).
export const Route = createFileRoute("/_authenticated/flock/members/$userId")({
  component: FlockMember,
});

function FlockMember() {
  const { t } = useTranslation();
  const { userId } = Route.useParams();
  const { data: m, isLoading } = useMemberProfile(userId);
  const { data: birds } = useVisibleBirds({ ownerIds: [userId] });
  const { data: avatar } = useAvatarUrls([m?.photo_path]);
  const { data: photos } = useBirdPhotoUrls((birds ?? []).filter((b) => b.has_photo).map((b) => b.bird_id), 120);
  if (!isLoading && !m) {
    return (
      <FlockSubPage title={t("flock.member.missingTitle", "Member not found")} fallback="/flock/members">
        <FlockEmpty icon={<UserRound className="size-6" />} title={t("flock.member.missingTitle", "Member not found")}>
          {t("flock.member.missing", "This profile isn't available.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }
  return (
    <FlockSubPage title={m?.display_name ?? " "} line={m ? chapterLine(m.region_name, m.region_states) : undefined} fallback="/flock/members">
      <KyaCard className="flex flex-col items-center p-6 text-center">
        <FlockAvatar name={m?.display_name ?? ""} url={m?.photo_path ? avatar?.get(m.photo_path) : null} size={88} />
        {m?.is_founder && <div className="mt-3"><FounderBadge /></div>}
        {m?.bio && <p className="m-0 mt-3 max-w-[36ch] text-[15px] leading-[1.55]" style={{ color: K.ink }} data-testid="member-bio">{m.bio}</p>}
      </KyaCard>
      <KyaCard className="p-5">
        <KyaHeading size={20}>{t("flock.member.birds", "Their birds")}</KyaHeading>
        {(birds ?? []).length === 0 ? (
          <p className="m-0 mt-2 text-[15px]" style={{ color: K.quiet }}>{t("flock.members.noBirds", "No birds shown")}</p>
        ) : (
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {(birds ?? []).map((b) => (
              <li key={b.bird_id}>
                <Link to="/flock/birds/$birdId" params={{ birdId: b.bird_id }} className="flex min-h-[56px] items-center gap-3 rounded-[16px] px-3 py-2 active:scale-[0.99]" style={{ background: K.mist, color: K.forest }}>
                  <BirdThumb name={b.name} photo={photos?.[b.bird_id]} size={44} />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-[700]">{b.name}</span>
                    {b.species && <span className="block text-[13px]" style={{ color: K.quiet }}>{b.species}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </KyaCard>
    </FlockSubPage>
  );
}
