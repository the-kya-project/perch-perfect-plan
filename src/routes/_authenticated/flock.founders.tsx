import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { useAvatarUrls } from "@/lib/flockData";
import { spotLabel, useFoundingMembers } from "@/lib/flockFounders";
import { chapterName } from "@/lib/flockNav";

// The founding members page: founders who chose to be listed, in spot order,
// with their display name, photo, chapter and founding spot. Nothing else
// exists to show (flock_founders). Inside the Flock only; never public.
export const Route = createFileRoute("/_authenticated/flock/founders")({
  component: FlockFounders,
});

function FlockFounders() {
  const { t } = useTranslation();
  const { data: founders, isLoading } = useFoundingMembers();
  const list = founders ?? [];
  const { data: urls } = useAvatarUrls(list.map((f) => f.photo_path));
  return (
    <FlockSubPage title={t("flock.founders.title", "Founding members")}
      line={t("flock.founders.line", "Thank you to the first 50, who helped start the Flock.")}
      fallback="/flock/you">
      {isLoading ? (
        <div className="grid min-h-[30vh] place-items-center" role="status" aria-label={t("flock.founders.loading", "Loading the founding members")}>
          <Loader2 className="size-8 animate-spin" style={{ color: K.moss }} />
        </div>
      ) : list.length === 0 ? (
        <FlockEmpty icon={<Star className="size-6" />} title={t("flock.founders.emptyTitle", "No one here yet")}>
          {t("flock.founders.empty", "Founding members can choose to appear here. When the first one does, you'll find them on this page.")}
        </FlockEmpty>
      ) : (
        <KyaCard className="overflow-hidden p-0">
          <ol className="m-0 flex list-none flex-col p-0" data-testid="founders-list">
            {list.map((f, i) => (
              <li key={f.spot_number} data-spot={f.spot_number} className="flex min-h-[64px] items-center gap-3 px-4 py-2.5"
                style={{ borderTop: i ? `1px solid ${K.line}` : undefined }}>
                <FlockAvatar name={f.display_name} url={f.photo_path ? urls?.get(f.photo_path) : null} size={44} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[15.5px] font-[700]" style={{ color: K.forest }}>{f.display_name}</span>
                  {f.chapter_name && <span className="truncate text-[13px]" style={{ color: K.quiet }}>{chapterName(t, f.chapter_name)}</span>}
                </span>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-[13px] font-[700]" style={{ background: K.sunflower, color: K.forest }}
                  aria-label={t("flock.founders.spotAria", "Founding spot {{n}}", { n: f.spot_number })}>
                  {spotLabel(f.spot_number)}
                </span>
              </li>
            ))}
          </ol>
        </KyaCard>
      )}
      <p className="m-0 px-2 text-center text-[13px]" style={{ color: K.quiet }} data-testid="founders-footer">
        {t("flock.founders.footer", "Founders choose whether to appear here, and can change it any time on their profile.")}
      </p>
    </FlockSubPage>
  );
}
