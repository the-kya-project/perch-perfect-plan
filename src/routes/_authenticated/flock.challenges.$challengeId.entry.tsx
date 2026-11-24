import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { PostComposer } from "@/components/flock/PostCompose";
import { nextPrompt, useChallenge } from "@/lib/flockChallenges";

// Post a challenge entry (backlog 1.10): the post composer with the prompt on
// top (?prompt=, else the next one not done). A journey challenge's entry
// answers no prompt. The last prompt sends you back with the celebration.
const ID = /^[0-9a-f-]{36}$/i;
export const Route = createFileRoute("/_authenticated/flock/challenges/$challengeId/entry")({
  validateSearch: (s: Record<string, unknown>): { prompt?: number } => {
    const n = Number(s.prompt);
    return Number.isInteger(n) && n >= 1 && n <= 30 ? { prompt: n } : {};
  },
  component: ChallengeEntry,
});

function ChallengeEntry() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { challengeId } = Route.useParams();
  const { prompt: wanted } = Route.useSearch();
  const valid = ID.test(challengeId);
  const { data: c, isLoading } = useChallenge(valid ? challengeId : "");
  const title = t("flock.challenges.entryTitle", "New entry");
  if (isLoading) return <FlockSubPage title={title} fallback="/flock">{null}</FlockSubPage>;
  const prompt = c?.kind === "standalone"
    ? (c.prompts.find((p) => p.position === wanted && !p.done) ?? nextPrompt(c))
    : null;
  if (!c || !c.joined || c.state !== "open" || (c.kind === "standalone" && !prompt)) {
    return (
      <FlockSubPage title={title} fallback={valid ? `/flock/challenges/${challengeId}` : "/flock"}>
        <FlockEmpty icon={<Flag className="size-6" />} title={t("flock.challenges.noEntryTitle", "Nothing to post here")}>
          {!c ? t("flock.challenges.missing", "It may have ended a while ago, or it's for another chapter.")
            : c.state !== "open" ? t("flock.challenges.closedError", "This challenge has closed, so it isn't taking new entries.")
            : !c.joined ? t("flock.challenges.joinFirst", "Join the challenge first, then post your entries.")
            : t("flock.challenges.allPosted", "You've posted for every prompt. Nicely done.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }
  return (
    <PostComposer challenge={{ challenge: c, prompt }} onDone={(r) => {
      void navigate({
        to: "/flock/challenges/$challengeId", params: { challengeId: c.challenge_id },
        search: r.finished ? { finished: 1 } : {}, replace: true,
      });
    }} />
  );
}
