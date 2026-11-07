import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaRow } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { FlockAvatar, FounderBadge } from "@/components/flock/FlockPeople";
import { chapterLine } from "@/lib/flockNav";
import { memberCountLine } from "@/lib/flockProfile";
import { useAvatarUrls, useChapter, useChapterMembers, useMyProfile } from "@/lib/flockData";

// Chapter members: everyone in your chapter, with their shown birds' names.
export const Route = createFileRoute("/_authenticated/flock/members/")({
  component: FlockChapterMembers,
});

function FlockChapterMembers() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMyProfile();
  const slug = me?.region_slug && me.region_slug !== "other" ? me.region_slug : null;
  const { data: chapter } = useChapter(slug);
  const { data: members, isLoading } = useChapterMembers(slug);
  const { data: urls } = useAvatarUrls((members ?? []).map((m) => m.photo_path));
  return (
    <FlockSubPage
      title={t("flock.members.title", "Chapter members")}
      line={chapter ? `${chapterLine(chapter.name, chapter.states)} · ${memberCountLine(chapter.member_count)}` : undefined}
      fallback="/flock/chapter"
    >
      {!slug || (!isLoading && (members ?? []).length === 0) ? (
        <FlockEmpty icon={<Users className="size-6" />} title={t("flock.members.emptyTitle", "No members here yet")}>
          {t("flock.members.empty", "When members join your chapter, you'll find them here.")}
        </FlockEmpty>
      ) : (
        <KyaCard>
          <ul className="m-0 list-none p-0" data-testid="chapter-members">
            {(members ?? []).map((m, i, all) => (
              <li key={m.user_id}>
                <KyaRow
                  leading={<FlockAvatar name={m.display_name} url={m.photo_path ? urls?.get(m.photo_path) : null} size={44} />}
                  title={<span className="inline-flex flex-wrap items-center gap-2">{m.display_name}{m.is_founder && <FounderBadge />}</span>}
                  detail={m.bird_names.length ? m.bird_names.join(", ") : <span style={{ color: K.quiet }}>{t("flock.members.noBirds", "No birds shown")}</span>}
                  onClick={() => void navigate({ to: "/flock/members/$userId", params: { userId: m.user_id } })}
                  last={i === all.length - 1}
                />
              </li>
            ))}
          </ul>
        </KyaCard>
      )}
    </FlockSubPage>
  );
}
