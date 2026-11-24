import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K } from "@/components/kya";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { useAvatarUrls } from "@/lib/flockData";
import type { Challenge, ChallengePrompt, ChallengeState } from "@/lib/flockChallenges";

// Challenges (backlog 1.10, docs/flock/mockups/SpecChallenges.dc.html): the card
// on Today and Journeys (screen 1), the prompt checklist (screen 2), and the
// labels both screens share. No winners, prizes or rankings anywhere.

export function challengeStateLabel(t: TFunction, s: ChallengeState): string {
  switch (s) {
    case "draft": return t("flock.challengesAdmin.draft", "Draft");
    case "upcoming": return t("flock.challengesAdmin.upcoming", "Scheduled");
    case "open": return t("flock.challengesAdmin.open", "Open");
    case "closed": return t("flock.challengesAdmin.closed", "Closed");
  }
}

/** "Dec 1" from a YYYY-MM-DD day, read as that calendar day. */
export function challengeDay(iso: string, lang: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang, { month: "short", day: "numeric", timeZone: "UTC" });
}

export function statePillStyle(s: ChallengeState) {
  return s === "open" ? { background: K.lime, color: K.forest }
    : s === "draft" ? { background: K.amberBg, color: K.amberText }
    : s === "upcoming" ? { background: "#fff", color: K.forest, border: `1.5px solid ${K.line}` }
    : { background: K.mist, color: K.forest };
}

/** "Challenge · 4 days left", "Challenge · last day", or closed. */
export function challengeEyebrow(t: TFunction, c: Pick<Challenge, "state" | "days_left">): string {
  if (c.state !== "open") return t("flock.challenges.closedTag", "Challenge · closed");
  if (c.days_left <= 0) return t("flock.challenges.lastDay", "Challenge · last day");
  if (c.days_left === 1) return t("flock.challenges.oneDayLeft", "Challenge · 1 day left");
  return t("flock.challenges.daysLeft", "Challenge · {{n}} days left", { n: c.days_left });
}

/** "Standalone challenge · 7 prompts · 63 members joined", or "Journey
 *  challenge · Recall · 63 members joined" (journeys have no steps since 1.20). */
export function challengeSummary(t: TFunction, c: Pick<Challenge, "kind" | "total_count" | "member_count" | "template_name">): string {
  const kind = c.kind === "standalone"
    ? t("flock.challenges.standaloneKind", "Standalone challenge")
    : t("flock.challenges.journeyKind", "Journey challenge · {{name}}", { name: c.template_name ?? "" });
  const steps = c.kind === "standalone"
    ? (c.total_count === 1 ? t("flock.challenges.onePrompt", "1 prompt") : t("flock.challenges.prompts", "{{n}} prompts", { n: c.total_count }))
    : null;
  const joined = c.member_count === 1
    ? t("flock.challenges.oneJoined", "1 member joined")
    : t("flock.challenges.joined", "{{n}} members joined", { n: c.member_count });
  return [kind, steps, joined].filter(Boolean).join(" · ");
}

/** "Juno · 3 of 7 done"; a journey challenge: "Juno · Learned it" or "Juno · In progress". */
export function challengeProgress(t: TFunction, c: Pick<Challenge, "kind" | "my_bird_name" | "done_count" | "total_count" | "finished">): string {
  const done = c.kind === "journey"
    ? (c.finished ? t("flock.challenges.journeyLearned", "Learned it") : t("flock.challenges.journeyGoing", "In progress"))
    : t("flock.challenges.progress", "{{done}} of {{total}} done", { done: c.done_count, total: c.total_count });
  return c.my_bird_name ? `${c.my_bird_name} · ${done}` : done;
}

/** Up to four members who joined: initials, or their photo. */
export function ChallengeFaces({ faces }: { faces: Challenge["faces"] }) {
  const { data: avatars } = useAvatarUrls(faces.map((f) => f.photo_path));
  if (faces.length === 0) return null;
  return (
    <div className="flex items-center gap-1" aria-hidden="true" data-testid="challenge-faces">
      {faces.map((f, i) => (
        <FlockAvatar key={`${f.name}-${i}`} name={f.name || "?"} url={f.photo_path ? avatars?.get(f.photo_path) : null} size={26} />
      ))}
    </div>
  );
}

/** The challenge card on Today and Journeys (mockup screen 1). */
export function ChallengeCard({ challenge: c }: { challenge: Challenge }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2 rounded-[18px] px-4 py-3.5" style={{ background: K.lime, color: K.forest }}
      data-testid="challenge-card" data-challenge={c.challenge_id} data-joined={c.joined ? "yes" : "no"}>
      <span className="text-[11.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>
        {challengeEyebrow(t, c)}{c.region_name ? ` · ${c.region_name}` : ""}
      </span>
      <span className="text-[17px] font-[700] leading-[1.25]">{c.title}</span>
      <span className="text-[13px] leading-[1.45]" style={{ color: K.ink }} data-testid="challenge-summary">
        {c.joined ? challengeProgress(t, c) : challengeSummary(t, c)}
      </span>
      <ChallengeFaces faces={c.faces} />
      <Link to="/flock/challenges/$challengeId" params={{ challengeId: c.challenge_id }} data-testid="challenge-open"
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-4 text-[14px] font-[700]"
        style={{ background: K.sunflower, color: K.forest, border: `2px solid ${K.forest}` }}>
        {c.finished
          ? t("flock.challenges.seeYours", "See the challenge")
          : c.joined ? t("flock.challenges.keepGoing", "Keep going") : t("flock.challenges.join", "Join the challenge")}
      </Link>
    </div>
  );
}

/** The prompt checklist (mockup screen 2): done ones ticked and struck
 *  through, the next one numbered and bold, then "3 more after this". */
export function PromptChecklist({ prompts, current }: { prompts: ChallengePrompt[]; current: number | null }) {
  const { t } = useTranslation();
  const shown = prompts.filter((p) => p.done || p.position === current);
  const more = prompts.length - shown.length;
  return (
    <div className="flex flex-col gap-2" data-testid="challenge-prompts">
      {shown.map((p) => (
        <div key={p.position} className="flex items-center gap-2.5" data-prompt={p.position} data-done={p.done ? "yes" : "no"}>
          <span aria-hidden="true" className="inline-flex size-[26px] flex-none items-center justify-center rounded-full text-[12px] font-[700]"
            style={p.done ? { background: K.moss, border: `2px solid ${K.moss}`, color: "#fff" } : { background: "#fff", border: `2px solid ${K.moss}`, color: K.moss }}>
            {p.done ? <Check className="size-3.5" strokeWidth={2.5} /> : p.position}
          </span>
          <span className={`text-[14px] ${p.done ? "line-through" : "font-[700]"}`} style={{ color: p.done ? K.ink : K.forest }}>
            <span className="sr-only">{p.done ? t("flock.challenges.doneSr", "Done: ") : ""}</span>{p.body}
          </span>
        </div>
      ))}
      {more > 0 && (
        <span className="text-[12.5px] leading-[1.45]" style={{ color: K.ink }}>
          {more === 1 ? t("flock.challenges.oneMore", "1 more after this") : t("flock.challenges.moreAfter", "{{n}} more after this", { n: more })}
        </span>
      )}
    </div>
  );
}
