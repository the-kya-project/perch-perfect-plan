import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaIconTile, KyaRow, SERIF } from "@/components/kya";
import { Award } from "lucide-react";
import { careBadgeArt } from "@/lib/badgeArt";
import {
  CARE_BADGES, careBadgeName, careBadgeTitle, careCelebrationFor, careEarnedCount, careEarnedLine, careLevelLabel,
  markCareBadgesSeen, useInvalidateCareBadges,
  type CareBadge, type MyCareBadge,
} from "@/lib/careBadges";

// Care badges (1.13b) with Brittany's final art (src/lib/badgeArt.ts): her
// color art when earned, her gray version when not, and the design for the
// level reached. Laid out like the Flock's (src/components/flock/BadgeParts.tsx,
// which care code can't import) and the mockup (SpecBadges.dc.html).

const GRAY = { ink: "#8a9a92" };

/** The badge's art: 64px in the grid and celebrations. */
export function CareBadgeCircle({ badge, level, size = 64 }: { badge: CareBadge; level: number; size?: number }) {
  const { t } = useTranslation();
  return (
    <img src={careBadgeArt(badge, level, size > 32 ? "lg" : "sm")} alt={careBadgeName(t, badge)}
      width={size} height={size} decoding="async" draggable={false} className="block shrink-0 select-none object-contain"
      style={{ width: size, height: size }} data-badge-art={badge} />
  );
}

/** A badge in the grid: the art, its name and its level. */
export function CareBadgeTile({ badge, level, selected, onSelect }: { badge: CareBadge; level: number; selected?: boolean; onSelect?: () => void }) {
  const { t } = useTranslation();
  const earned = level > 0;
  const label = careLevelLabel(t, badge, level);
  const body = (
    <>
      <CareBadgeCircle badge={badge} level={level} />
      <span className="text-[12.5px] font-[700]" style={{ color: earned ? K.forest : GRAY.ink }}>{careBadgeName(t, badge)}</span>
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

/** The "Badges" row in the bird's record: how many are earned, with the
 *  earned art beside it. Opens the bird's Badges screen. */
export function BirdBadgesRow({ birdId, badges }: { birdId: string; badges: MyCareBadge[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const earned = badges.filter((b) => b.level > 0);
  return (
    <div data-testid="bird-badges-row">
      <KyaRow
        leading={<KyaIconTile size={38}><Award className="size-5" /></KyaIconTile>}
        title={t("careBadges.title", "Badges")}
        detail={t("careBadges.count", "{{earned}} of {{total}} earned", { earned: careEarnedCount(badges), total: CARE_BADGES.length })}
        trailing={earned.length > 0 ? (
          <span className="flex items-center gap-0.5" aria-hidden="true">
            {earned.map((b) => <CareBadgeCircle key={b.badge} badge={b.badge} level={b.level} size={26} />)}
          </span>
        ) : undefined}
        onClick={() => navigate({ to: "/birds/$birdId/badges", params: { birdId } })}
        last
      />
    </div>
  );
}

/** The bird page's celebration: one "Here's what you've already earned" for
 *  what the bird's history earned, or a "Badge earned" card for each new
 *  badge. Either goes away once seen, and never comes back. */
export function BirdBadgeCelebration({ birdId, name, badges }: { birdId: string; name: string; badges: MyCareBadge[] }) {
  const [closed, setClosed] = useState<Set<CareBadge>>(new Set());
  const celebration = careCelebrationFor(badges.filter((b) => !closed.has(b.badge)));
  const invalidate = useInvalidateCareBadges();
  if (!celebration) return null;
  const seen = (list: MyCareBadge[]) => {
    setClosed((s) => new Set([...s, ...list.map((b) => b.badge)]));
    void markCareBadgesSeen(birdId, list.map((b) => b.badge)).then(invalidate, () => undefined);
  };
  if (celebration.kind === "launch") {
    return <CareLaunchCelebration birdId={birdId} name={name} badges={celebration.badges} onDone={() => seen(celebration.badges)} />;
  }
  return <>{celebration.badges.map((b) => <CareBadgeEarnedCard key={b.badge} birdId={birdId} name={name} badge={b} onDone={() => seen([b])} />)}</>;
}

function CareLaunchCelebration({ birdId, name, badges, onDone }: { birdId: string; name: string; badges: MyCareBadge[]; onDone: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4" style={{ background: "rgba(26, 61, 46, 0.45)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="care-badges-launch-title" data-testid="care-badges-launch"
        className="flex w-full max-w-[362px] flex-col items-center gap-3.5 rounded-[24px] bg-white px-[18px] py-6 text-center">
        <span className="text-[11.5px] font-[700] uppercase tracking-[.06em]" style={{ color: K.moss }}>{t("careBadges.launchLabel", "New: badges")}</span>
        <h2 id="care-badges-launch-title" className="m-0 text-[26px] font-[700] leading-[1.15]" style={{ fontFamily: SERIF, color: K.forest }}>
          {t("careBadges.launchTitle", "Here's what you've already earned")}
        </h2>
        <p className="m-0 text-[14px] leading-[1.45]" style={{ color: "#4f6b60" }}>
          {t("careBadges.launchLine", "You've been caring for {{name}} for a while. These count.", { name })}
        </p>
        <ul className="m-0 flex list-none flex-wrap justify-center gap-2 p-0">
          {badges.map((b) => <li key={b.badge}><CareBadgeTile badge={b.badge} level={b.level} /></li>)}
        </ul>
        <button type="button" onClick={() => { onDone(); void navigate({ to: "/birds/$birdId/badges", params: { birdId } }); }} data-testid="care-badges-launch-see"
          className="min-h-[44px] w-full rounded-full text-[14px] font-[700] text-white" style={{ background: K.forest }}>
          {t("careBadges.seeAll", "See all badges")}
        </button>
        <button type="button" onClick={onDone} data-testid="care-badges-launch-later"
          className="min-h-[44px] px-4 text-[13px] font-[700]" style={{ color: K.moss }}>
          {t("careBadges.notNow", "Not now")}
        </button>
      </div>
    </div>
  );
}

function CareBadgeEarnedCard({ birdId, name, badge, onDone }: { birdId: string; name: string; badge: MyCareBadge; onDone: () => void }) {
  const { t } = useTranslation();
  return (
    <div data-testid="care-badge-earned" data-badge={badge.badge}>
      <KyaCard className="flex flex-col gap-3 px-4 py-3.5" style={{ border: `2px solid ${K.sunflower}` }}>
        <div className="flex items-center gap-3">
          <CareBadgeCircle badge={badge.badge} level={badge.level} size={52} />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-[11.5px] font-[700] uppercase tracking-[.06em]" style={{ color: K.moss }}>{t("careBadges.earnedLabel", "Badge earned")}</span>
            <span className="text-[16px] font-[700] leading-[1.25]" style={{ color: K.forest }}>{careBadgeTitle(t, badge.badge, badge.level)}</span>
            <span className="text-[13px] leading-[1.45]" style={{ color: "#4f6b60" }}>{careEarnedLine(t, badge.badge, badge.level, name)}</span>
          </div>
        </div>
        <div className="flex items-center justify-end gap-4">
          <Link to="/birds/$birdId/badges" params={{ birdId }} onClick={onDone} className="inline-flex min-h-[44px] items-center text-[14px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>
            {t("careBadges.seeAll", "See all badges")}
          </Link>
          <button type="button" onClick={onDone} data-testid="care-badge-earned-done"
            className="min-h-[44px] rounded-full px-4 text-[14px] font-[700]" style={{ background: K.mist, color: K.forest }}>
            {t("careBadges.gotIt", "Got it")}
          </button>
        </div>
      </KyaCard>
    </div>
  );
}
