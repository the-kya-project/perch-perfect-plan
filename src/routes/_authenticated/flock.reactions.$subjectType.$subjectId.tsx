import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { ThreadHeader } from "@/components/flock/CommentThread";
import { FlockChips } from "@/components/flock/FlockChips";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { reactionLabel } from "@/components/flock/JourneyBrowse";
import { ReactionIcon } from "@/components/flock/PostParts";
import { useAvatarUrls } from "@/lib/flockData";
import { useReactors, type ReactSubject } from "@/lib/flockPostData";
import { REACTIONS, type ReactionKind } from "@/lib/journeyData";

// Who reacted (Batch 3, screen 5): everyone, filtered by reaction, with region.
const SUBJECTS: ReactSubject[] = ["post", "comment", "journey_update", "journey_milestone"];

export const Route = createFileRoute("/_authenticated/flock/reactions/$subjectType/$subjectId")({
  component: WhoReacted,
});

function WhoReacted() {
  const { t } = useTranslation();
  const { subjectType, subjectId } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  const type = (SUBJECTS as string[]).includes(subjectType) ? (subjectType as ReactSubject) : "post";
  const { data: rows, isLoading, isError } = useReactors(type, subjectId);
  const list = rows ?? [];
  const { data: avatars } = useAvatarUrls(list.map((r) => r.photo_path));
  const [kind, setKind] = useState<ReactionKind | "all">("all");
  const count = (k: ReactionKind) => list.filter((r) => r.kind === k).length;
  const shown = kind === "all" ? list : list.filter((r) => r.kind === kind);
  const back = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void navigate({ to: "/flock" });
  };
  return (
    <div className="min-h-[100dvh]" style={{ background: "#fff", color: K.forest }}>
      <ThreadHeader title={t("flock.posts.reactionsTitle", "Reactions")} onBack={back} />
      <div className="mx-auto flex max-w-xl flex-col gap-3 px-4 py-3">
        <FlockChips label={t("flock.posts.reactionsFilter", "Filter reactions")} testId="reaction-chips" value={kind} onChange={(v) => setKind(v ?? "all")}
          options={[
            { value: "all" as const, label: t("flock.posts.allCount", "All {{count}}", { count: list.length }) },
            ...REACTIONS.filter((k) => count(k) > 0).map((k) => ({ value: k, label: `${reactionLabel(t, k)} ${count(k)}` })),
          ]} />
        {isLoading ? null : isError ? (
          <p className="m-0 py-6 text-center text-[14px]" style={{ color: K.quiet }}>{t("flock.posts.reactorsError", "We couldn't load who reacted.")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0" data-testid="reactors">
            {shown.map((r) => (
              <li key={`${r.user_id}-${r.kind}`} className="flex items-center gap-3 border-b py-2.5" style={{ borderColor: K.line }} data-reactor={r.user_id}>
                <span className="relative">
                  <FlockAvatar name={r.display_name} url={r.photo_path ? avatars?.get(r.photo_path) : null} size={40} />
                  <span className="absolute -bottom-1 -right-1"><ReactionIcon kind={r.kind} size={20} /></span>
                </span>
                <span className="flex flex-col">
                  <b className="text-[15px]">{r.display_name}</b>
                  <span className="text-[13px]" style={{ color: K.quiet }}>{[reactionLabel(t, r.kind), r.region_name].filter(Boolean).join(" · ")}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
