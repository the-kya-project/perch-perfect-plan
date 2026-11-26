import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { K, KyaCard, SERIF } from "@/components/kya";
import { flockBadgeArt } from "@/lib/badgeArt";
import {
  badgeName, badgeTitle, celebrationFor, earnedLine, levelLabel, markBadgesSeen, useInvalidateBadges, useMyBadges,
  type FlockBadge, type MyBadge, type ShownBadge,
} from "@/lib/flockBadges";

// Flock badges (1.13a) with Brittany's final art (src/lib/badgeArt.ts): her
// color art when earned, her gray version when not, and Journey finisher's
// design for the level reached. The art carries its own frame, so nothing is
// drawn around it. Each image's text for screen readers is the badge's name.

const GRAY = { ink: "#8a9a92" };

/** The badge's art: 64px in the grid and celebrations. */
export function BadgeCircle({ badge, earned, level = 1, size = 64 }: { badge: FlockBadge; earned: boolean; level?: number; size?: number }) {
  const { t } = useTranslation();
  return (
    <img src={flockBadgeArt(badge, earned ? Math.max(level, 1) : 0, size > 32 ? "lg" : "sm")} alt={badgeName(t, badge)}
      width={size} height={size} decoding="async" draggable={false} className="block shrink-0 select-none object-contain"
      style={{ width: size, height: size }} data-badge-art={badge} />
  );
}

/** A badge in the grid: the tile, its name and (Journey finisher) its level. */
export function BadgeTile({ badge, level, selected, onSelect }: { badge: FlockBadge; level: number; selected?: boolean; onSelect?: () => void }) {
  const { t } = useTranslation();
  const earned = level > 0;
  const label = levelLabel(t, badge, level);
  const body = (
    <>
      <BadgeCircle badge={badge} earned={earned} level={level} />
      <span className="text-[12.5px] font-[700]" style={{ color: earned ? K.forest : GRAY.ink }}>{badgeName(t, badge)}</span>
      {label && <span className="text-[10.5px] font-[700]" style={{ color: K.moss }}>{label}</span>}
    </>
  );
  const cls = "flex w-[104px] flex-col items-center gap-1.5 rounded-[16px] py-1.5 text-center";
  if (!onSelect) return <div className={cls} data-badge={badge} data-earned={earned}>{body}</div>;
  return (
    <button type="button" onClick={onSelect} aria-pressed={!!selected} data-badge={badge} data-earned={earned}
      className={`${cls} active:scale-[0.98]`} style={selected ? { background: "#fff", boxShadow: `0 0 0 2px ${K.line}` } : undefined}>
      {body}
    </button>
  );
}

/** A profile's badges, as small pills beside Founder and Chapter lead. */
export function BadgePills({ badges }: { badges: ShownBadge[] }) {
  const { t } = useTranslation();
  if (badges.length === 0) return null;
  return (
    <ul className="m-0 mt-3 flex list-none flex-wrap justify-center gap-2 p-0" data-testid="member-badges" aria-label={t("flock.badges.title", "Badges")}>
      {badges.map((b) => (
        <li key={b.badge} data-badge={b.badge} className="inline-flex items-center gap-1.5 rounded-full py-[3px] pl-1 pr-2.5 text-[12.5px] font-[700]"
          style={{ background: K.lime, color: K.forest }}>
          <BadgeCircle badge={b.badge} earned level={b.level} size={20} />
          {badgeTitle(t, b.badge, b.level)}
        </li>
      ))}
    </ul>
  );
}

/** Today's celebration: one "Here's what you've already earned" for what a
 *  member's history earned, or a "Badge earned" card for each new badge.
 *  Either goes away once seen, and never comes back. */
export function TodayBadges() {
  const { data: badges } = useMyBadges();
  const [closed, setClosed] = useState<Set<FlockBadge>>(new Set());
  const celebration = celebrationFor((badges ?? []).filter((b) => !closed.has(b.badge)));
  const invalidate = useInvalidateBadges();
  if (!celebration) return null;
  const seen = (list: MyBadge[]) => {
    setClosed((s) => new Set([...s, ...list.map((b) => b.badge)]));
    void markBadgesSeen(list.map((b) => b.badge)).then(invalidate, () => undefined);
  };
  if (celebration.kind === "launch") return <LaunchCelebration badges={celebration.badges} onDone={() => seen(celebration.badges)} />;
  return <>{celebration.badges.map((b) => <BadgeEarnedCard key={b.badge} badge={b} onDone={() => seen([b])} />)}</>;
}

function LaunchCelebration({ badges, onDone }: { badges: MyBadge[]; onDone: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4" style={{ background: "rgba(26, 61, 46, 0.45)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="badges-launch-title" data-testid="badges-launch"
        className="flex w-full max-w-[362px] flex-col items-center gap-3.5 rounded-[24px] bg-white px-[18px] py-6 text-center">
        <span className="text-[11.5px] font-[700] uppercase tracking-[.06em]" style={{ color: K.moss }}>{t("flock.badges.launchLabel", "New: badges")}</span>
        <h2 id="badges-launch-title" className="m-0 text-[26px] font-[700] leading-[1.15]" style={{ fontFamily: SERIF, color: K.forest }}>
          {t("flock.badges.launchTitle", "Here's what you've already earned")}
        </h2>
        <p className="m-0 text-[14px] leading-[1.45]" style={{ color: "#4f6b60" }}>
          {t("flock.badges.launchLine", "You've already done a lot in the Flock. These count.")}
        </p>
        <ul className="m-0 flex list-none flex-wrap justify-center gap-2 p-0">
          {badges.map((b) => <li key={b.badge}><BadgeTile badge={b.badge} level={b.level} /></li>)}
        </ul>
        <button type="button" onClick={() => { onDone(); void navigate({ to: "/flock/you/badges" }); }} data-testid="badges-launch-see"
          className="min-h-[44px] w-full rounded-full text-[14px] font-[700] text-white" style={{ background: K.forest }}>
          {t("flock.badges.seeAll", "See all badges")}
        </button>
        <button type="button" onClick={onDone} data-testid="badges-launch-later"
          className="min-h-[44px] px-4 text-[13px] font-[700]" style={{ color: K.moss }}>
          {t("flock.badges.notNow", "Not now")}
        </button>
      </div>
    </div>
  );
}

function BadgeEarnedCard({ badge, onDone }: { badge: MyBadge; onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <div data-testid="badge-earned" data-badge={badge.badge}>
      <KyaCard className="flex flex-col gap-3 px-4 py-3.5" style={{ border: `2px solid ${K.sunflower}` }}>
        <div className="flex items-center gap-3">
          <BadgeCircle badge={badge.badge} earned level={badge.level} size={52} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[11.5px] font-[700] uppercase tracking-[.06em]" style={{ color: K.moss }}>{t("flock.badges.earnedLabel", "Badge earned")}</span>
            <span className="text-[16px] font-[700] leading-[1.25]" style={{ color: K.forest }}>{badgeTitle(t, badge.badge, badge.level)}</span>
            <span className="text-[13px] leading-[1.45]" style={{ color: "#4f6b60" }}>{earnedLine(t, badge.badge, badge.level)}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-4">
          <Link to="/flock/you/badges" onClick={onDone} className="inline-flex min-h-[44px] items-center text-[14px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>
            {t("flock.badges.seeAll", "See all badges")}
          </Link>
          <button type="button" onClick={onDone} data-testid="badge-earned-done"
            className="min-h-[44px] rounded-full px-4 text-[14px] font-[700]" style={{ background: K.mist, color: K.forest }}>
            {t("flock.badges.gotIt", "Got it")}
          </button>
        </div>
      </KyaCard>
    </div>
  );
}
