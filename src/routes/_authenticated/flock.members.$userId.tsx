import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaCard, KyaHeading } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { BirdThumb, FlockAvatar, FounderBadge } from "@/components/flock/FlockPeople";
import { chapterLine } from "@/lib/flockNav";
import { useAvatarUrls, useBirdPhotoUrls, useIsAdmin, useMemberProfile, useVisibleBirds } from "@/lib/flockData";
import { setChapterLead, useChapterLeadOf, useInvalidateMembers } from "@/lib/flockMembers";
import { ConfirmSheet } from "@/components/flock/PostParts";

// Another member: photo or initial, name, region, bio, founding badge, and the
// birds they chose to show. Nothing else exists to show (flock_member_profile).
export const Route = createFileRoute("/_authenticated/flock/members/$userId")({
  component: FlockMember,
});

function FlockMember() {
  const { t } = useTranslation();
  const { userId } = Route.useParams();
  const { data: m, isLoading } = useMemberProfile(userId);
  const { data: birds } = useVisibleBirds({ ownerIds: [userId] });
  const { data: avatar } = useAvatarUrls([m?.photo_path]);
  const { data: photos } = useBirdPhotoUrls((birds ?? []).filter((b) => b.has_photo).map((b) => b.bird_id), 120);
  const { data: leadOf } = useChapterLeadOf(userId);
  const { data: isAdmin } = useIsAdmin();
  const invalidateMembers = useInvalidateMembers();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [leadError, setLeadError] = useState<string | null>(null);
  const isLead = !!leadOf;
  if (!isLoading && !m) {
    return (
      <FlockSubPage title={t("flock.member.missingTitle", "Member not found")} fallback="/flock/members">
        <FlockEmpty icon={<UserRound className="size-6" />} title={t("flock.member.missingTitle", "Member not found")}>
          {t("flock.member.missing", "This profile isn't available.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }
  return (
    <FlockSubPage title={m?.display_name ?? " "} line={m ? chapterLine(m.region_name, m.region_states) : undefined} fallback="/flock/members">
      <KyaCard className="flex flex-col items-center p-6 text-center">
        <FlockAvatar name={m?.display_name ?? ""} url={m?.photo_path ? avatar?.get(m.photo_path) : null} size={88} />
        {(m?.is_founder || isLead) && (
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {isLead && (
              <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12.5px] font-[700]" style={{ background: K.lime, color: K.forest }} data-testid="member-lead-badge">
                {t("flock.members.lead", "Chapter lead")}
              </span>
            )}
            {m?.is_founder && <FounderBadge />}
          </div>
        )}
        {m?.bio && <p className="m-0 mt-3 max-w-[36ch] text-[15px] leading-[1.55]" style={{ color: K.ink }} data-testid="member-bio">{m.bio}</p>}
      </KyaCard>
      <KyaCard className="p-5">
        <KyaHeading size={20}>{t("flock.member.birds", "Their birds")}</KyaHeading>
        {(birds ?? []).length === 0 ? (
          <p className="m-0 mt-2 text-[15px]" style={{ color: K.quiet }}>{t("flock.members.noBirds", "No birds shown")}</p>
        ) : (
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {(birds ?? []).map((b) => (
              <li key={b.bird_id}>
                <Link to="/flock/birds/$birdId" params={{ birdId: b.bird_id }} className="flex min-h-[56px] items-center gap-3 rounded-[16px] px-3 py-2 active:scale-[0.99]" style={{ background: K.mist, color: K.forest }}>
                  <BirdThumb name={b.name} photo={photos?.[b.bird_id]} size={44} />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-[700]">{b.name}</span>
                    {b.species && <span className="block text-[13px]" style={{ color: K.quiet }}>{b.species}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </KyaCard>
      {isAdmin && m && (
        <div data-testid="lead-admin"><KyaCard className="p-5">
          <KyaHeading size={18}>{t("flock.members.leadAdminTitle", "Chapter lead (admins only)")}</KyaHeading>
          <p className="m-0 mt-1.5 text-[14px] leading-[1.5]" style={{ color: K.ink }}>
            {isLead
              ? t("flock.members.leadAdminIs", "{{name}} leads the {{chapter}} chapter: they review its event suggestions and can add and edit its events.", { name: m.display_name, chapter: m.region_name })
              : t("flock.members.leadAdminNot", "A chapter lead reviews event suggestions for their own chapter and can add and edit its events. It also gives them a Flock membership.")}
          </p>
          {leadError && <p role="alert" className="m-0 mt-2 text-[14px]" style={{ color: K.red }}>{leadError}</p>}
          <button type="button" onClick={() => setConfirming(true)} disabled={busy || (!isLead && m.region_slug === "other")} data-testid="lead-toggle"
            className="mt-3 min-h-[48px] w-full rounded-full text-[15px] font-[700] disabled:opacity-50"
            style={isLead ? { background: K.mist, color: K.red } : { background: K.forest, color: "#fff" }}>
            {isLead ? t("flock.members.removeLead", "Remove as chapter lead") : t("flock.members.makeLead", "Make chapter lead of {{chapter}}", { chapter: m.region_name })}
          </button>
        </KyaCard></div>
      )}
      {confirming && m && (
        <ConfirmSheet busy={busy} onClose={() => setConfirming(false)}
          title={isLead ? t("flock.members.removeLeadTitle", "Remove {{name}} as chapter lead?", { name: m.display_name }) : t("flock.members.makeLeadTitle", "Make {{name}} the chapter lead?", { name: m.display_name })}
          line={isLead
            ? t("flock.members.removeLeadLine", "They stop reviewing and editing {{chapter}} events right away, and the membership that came with the role ends.", { chapter: m.region_name })
            : t("flock.members.makeLeadLine", "They'll review {{chapter}} event suggestions and can add and edit its events.", { chapter: m.region_name })}
          confirm={isLead ? t("flock.members.removeLead", "Remove as chapter lead") : t("flock.members.makeLeadShort", "Make chapter lead")}
          onConfirm={async () => {
            setBusy(true); setLeadError(null);
            try { await setChapterLead(userId, !isLead); await invalidateMembers(); setConfirming(false); }
            catch { setLeadError(t("flock.review.error", "That didn't save. Try again.")); setConfirming(false); }
            finally { setBusy(false); }
          }} />
      )}
    </FlockSubPage>
  );
}
