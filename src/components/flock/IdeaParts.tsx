import { Link } from "@tanstack/react-router";
import { Lightbulb } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading } from "@/components/kya";
import type { IdeaCategory, IdeaOutcome, TodaysIdea } from "@/lib/flockIdeas";
import type { BirdPronoun } from "@/lib/journeys";

export function categoryLabel(t: TFunction, c: IdeaCategory): string {
  switch (c) {
    case "enrichment": return t("flock.idea.cat.enrichment", "Enrichment");
    case "did_you_know": return t("flock.idea.cat.didYouKnow", "Did you know");
    case "project": return t("flock.idea.cat.project", "Project");
    case "training": return t("flock.idea.cat.training", "Training");
    case "conservation": return t("flock.idea.cat.conservation", "Conservation");
  }
}

export function outcomeLabel(t: TFunction, o: IdeaOutcome, pronoun: BirdPronoun = "they"): string {
  switch (o) {
    case "loved": return t("flock.idea.loved", "Loved it");
    case "curious": return t("flock.idea.curious", "Curious");
    case "not_for": return pronoun === "he" ? t("flock.idea.notForHim", "Not for him")
      : pronoun === "she" ? t("flock.idea.notForHer", "Not for her")
      : t("flock.idea.notForThem", "Not for them");
  }
}

/** Today's idea at the top of Today (CommunityV2, screen 1). */
export function TodaysIdeaCard({ idea, photo }: { idea: TodaysIdea; photo: string | null }) {
  const { t } = useTranslation();
  return (
    <article className="flex flex-col gap-2.5 overflow-hidden rounded-[18px] p-4" style={{ background: K.forest, color: "#fff" }} data-testid="todays-idea">
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-[700] uppercase tracking-[0.04em]" style={{ color: K.lime }}>
        <Lightbulb className="size-4" aria-hidden="true" />
        {t("flock.idea.label", "Today's idea · {{category}}", { category: categoryLabel(t, idea.category) })}
      </span>
      <KyaHeading size={21} as="h2" className="text-white">{idea.title}</KyaHeading>
      <p className="m-0 line-clamp-3 text-[15px] leading-[1.45]" style={{ color: K.paleGreen }}>{idea.body}</p>
      {photo && (
        <div className="relative aspect-[16/9] overflow-hidden rounded-[14px]" style={{ background: "#2a4f3e" }}>
          <img src={photo} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        </div>
      )}
      <Link to="/flock/idea" data-testid="we-tried-it"
        className="inline-flex min-h-[48px] items-center justify-center self-start rounded-full px-5 text-[15px] font-[700]"
        style={{ background: idea.my_outcome ? "transparent" : K.lime, color: idea.my_outcome ? K.lime : K.forest, border: idea.my_outcome ? `2px solid ${K.lime}` : undefined }}>
        {idea.my_outcome ? t("flock.idea.seeHow", "You tried it · See how everyone did") : t("flock.idea.weTried", "We tried it")}
      </Link>
    </article>
  );
}
