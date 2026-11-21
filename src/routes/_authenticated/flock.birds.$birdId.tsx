import { createFileRoute, Link } from "@tanstack/react-router";
import { Bird } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { BirdThumb } from "@/components/flock/FlockPeople";
import { useBirdPhotoUrls, useMemberProfile, useVisibleBirds } from "@/lib/flockData";

// A bird's public profile: photo, name, species, and whose bird it is. Nothing
// else (no care record exists on this side). Only shown birds are found.
export const Route = createFileRoute("/_authenticated/flock/birds/$birdId")({
  component: FlockBird,
});

function FlockBird() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const { data: birds, isLoading } = useVisibleBirds({ birdIds: [birdId] });
  const bird = birds?.[0];
  const { data: owner } = useMemberProfile(bird?.owner_id ?? "");
  const { data: photos } = useBirdPhotoUrls(bird?.has_photo ? [bird.bird_id] : [], 400);
  if (!isLoading && !bird) {
    return (
      <FlockSubPage title={t("flock.bird.missingTitle", "Bird not found")} fallback="/flock">
        <FlockEmpty icon={<Bird className="size-6" />} title={t("flock.bird.missingTitle", "Bird not found")}>
          {t("flock.bird.missing", "This bird isn't shown in the Community.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }
  return (
    <FlockSubPage title={bird?.name ?? " "} line={bird?.species ?? undefined} fallback="/flock">
      <KyaCard className="flex flex-col items-center p-6 text-center">
        <BirdThumb name={bird?.name ?? ""} photo={photos?.[birdId]} size={160} />
        {owner && (
          <p className="m-0 mt-4 text-[15px]" style={{ color: K.ink }} data-testid="bird-owner">
            {t("flock.bird.whose", "{{name}}'s bird", { name: owner.display_name })} ·{" "}
            <Link to="/flock/members/$userId" params={{ userId: owner.user_id }} className="font-[700] underline underline-offset-4" style={{ color: K.moss }}>
              {t("flock.bird.seeProfile", "See profile")}
            </Link>
          </p>
        )}
      </KyaCard>
    </FlockSubPage>
  );
}
