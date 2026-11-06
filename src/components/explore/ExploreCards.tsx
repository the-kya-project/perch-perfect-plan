// Explore's mission, podcast and membership cards, shared by the phone page
// (routes/_authenticated/explore.tsx) and the iPhone Duo's right pane
// (components/duo/explore/ExploreDuo.tsx). `compact` is the Duo's tighter size;
// the phone keeps its own size. None of them has a gold button: the waitlist
// card's "Join the waitlist" is Explore's one main button.
import { useTranslation } from "react-i18next";
import { ArrowRight, Headphones } from "lucide-react";
import { K, KyaCard, KyaHeading, KyaIconTile } from "@/components/kya";

export const MISSION_URL = "https://www.thekyaproject.com/about";

/** The mission (on the phone it is the page header; on the Duo, a card). */
export function MissionCard() {
  const { t } = useTranslation();
  return (
    <KyaCard className="p-4" id="explore-mission">
      <KyaHeading size={19} as="h2">{t("explore.missionTitle", "Better care, wilder futures")}</KyaHeading>
      <p className="m-0 mt-1.5 text-[15px] leading-[1.45]" style={{ color: K.quiet }}>
        {t("explore.missionBody", "We help parrots thrive, at home and in the wild, through education, community, and support for rescue and conservation.")}
      </p>
      <a
        href={MISSION_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border-2 bg-white px-4 text-[15px] font-[700] active:scale-[0.99]"
        style={{ borderColor: K.forest, color: K.forest }}
      >
        {t("explore.ourMission", "Our mission")} <ArrowRight className="size-4" aria-hidden="true" />
      </a>
    </KyaCard>
  );
}

/** The podcast: not live yet. */
export function PodcastCard({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <KyaCard className={compact ? "p-4" : "p-5"} id={compact ? "explore-podcast" : undefined}>
      <div className="flex items-start gap-3">
        <KyaIconTile size={compact ? 40 : 44}><Headphones className="size-5" /></KyaIconTile>
        <div className="min-w-0 flex-1">
          <span className="inline-flex rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: K.mist, color: K.forest }}>{t("explore.comingSoonTag", "Coming soon")}</span>
          <KyaHeading size={compact ? 18 : 20} as="h3" className="mt-2">{t("explore.podcastTitle", "The Kya Project Podcast")}</KyaHeading>
          <p className="m-0 mt-1 text-[15px] leading-[1.45]" style={{ color: K.quiet }}>{t("explore.podcastBody", "Conversations on parrots, rescue, and the wild.")}</p>
        </div>
      </div>
    </KyaCard>
  );
}

/** The membership preview (no purchase yet). */
export function MembershipCard({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <KyaCard className={compact ? "p-4" : "p-5"} id={compact ? "explore-membership" : undefined}>
      <KyaHeading size={compact ? 18 : 21} as={compact ? "h3" : "h2"}>{t("explore.membershipHeadline", "Support the mission and get more")}</KyaHeading>
      <p className={compact ? "m-0 mt-1.5 text-[15px] leading-[1.45]" : "m-0 mt-2 text-[15px] leading-[1.5]"} style={{ color: K.quiet }}>
        {t("explore.membershipBody", "When the community launches, members get AMAs, chapter access, and 20% of every membership funds rescue and conservation.")}
      </p>
    </KyaCard>
  );
}
