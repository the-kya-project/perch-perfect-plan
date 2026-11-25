import { useEffect, useId, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { BirdThumb } from "@/components/flock/FlockPeople";
import { useCardBirdPhotos } from "@/components/flock/JourneyBrowse";
import { MemberSuppliedNote, MemberSuppliedTag } from "@/components/flock/JourneyParts";
import { useJourneyAccess, useMemberSkills } from "@/lib/journeyData";
import { possessive } from "@/lib/journeys";

// Skills from the Flock (journeys redesign, screen 8): other members' own
// skills, shared with the community with at least one update, searched by
// name and description. Flock members only (the database gives anyone else
// nothing). Each is labeled "Member-supplied journey" and opens its setup
// (?from=<journey>), where "Start this skill" copies it for your bird.
export const Route = createFileRoute("/_authenticated/flock/journeys/skills")({
  validateSearch: (s: Record<string, unknown>): { bird?: string; q?: string } => ({
    bird: typeof s.bird === "string" ? s.bird : undefined,
    q: typeof s.q === "string" && s.q ? s.q : undefined,
  }),
  component: MemberSkills,
});

function MemberSkills() {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });
  const searchId = useId();
  const { bird, q } = Route.useSearch();
  const { data: access } = useJourneyAccess();
  const members = !!access?.can_view_community;
  const [typed, setTyped] = useState(q ?? "");
  // The search lives in the URL; typing waits a moment before it asks again.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = typed.trim() || undefined;
      if (next !== q) void navigate({ search: (s) => ({ ...s, q: next }), replace: true });
    }, 250);
    return () => window.clearTimeout(id);
  }, [typed, q, navigate]);
  const { data: skills, isLoading } = useMemberSkills(q ?? "", members);
  const photos = useCardBirdPhotos(skills, 96);

  return (
    <FlockSubPage title={t("flock.journeys.member.title", "Skills from the Flock")} fallback="/flock/journeys/start">
      {access && !members ? (
        <p className="m-0 text-[15px]" style={{ color: K.quiet }} data-testid="member-skills-locked">
          {t("flock.journeys.member.locked", "Skills from the Flock come with Flock membership.")}
        </p>
      ) : (
        <div className="flex flex-col gap-3" data-testid="member-skills">
          <MemberSuppliedNote />
          <label htmlFor={searchId} className="sr-only">{t("flock.journeys.member.search", "Search skills")}</label>
          <div className="flex h-12 items-center gap-2 rounded-[14px] border bg-white px-3.5" style={{ borderColor: "#c9d3c8" }}>
            <Search className="size-4 shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
            <input id={searchId} type="search" value={typed} onChange={(e) => setTyped(e.target.value)} data-testid="member-skills-search"
              placeholder={t("flock.journeys.member.searchPlaceholder", "Bath time, harness, ringing a bell…")}
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" style={{ color: K.forest }} />
          </div>
          {!isLoading && skills && skills.length === 0 && (
            <p className="m-0 text-[15px]" style={{ color: K.quiet }} data-testid="member-skills-empty">
              {q
                ? t("flock.journeys.member.noMatch", "No shared skills match that yet.")
                : t("flock.journeys.member.none", "No member skills shared yet.")}
            </p>
          )}
          {(skills ?? []).map((s) => (
            <button key={s.journey_id} type="button" data-member-skill={s.journey_id}
              onClick={() => void navigate({ to: "/flock/journeys/setup", search: { bird: bird ?? "", from: s.journey_id } })}
              className="flex min-h-[64px] w-full items-center gap-3 rounded-[14px] bg-white px-3.5 py-2.5 text-left active:scale-[0.99]" style={{ color: K.forest }}>
              <BirdThumb name={s.bird_name} photo={photos[s.bird_id]} size={40} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-[700]">{s.skill}</span>
                {s.description && <span className="line-clamp-2 text-[12.5px] leading-[1.35]" style={{ color: K.quiet }}>{s.description}</span>}
                <span className="text-[12px]" style={{ color: K.quiet }}>
                  {[t("flock.journeys.member.fromJourney", "From {{name}} journey", { name: possessive(s.bird_name) }), s.owner_name].filter(Boolean).join(" · ")}
                </span>
                <MemberSuppliedTag className="mt-1" />
              </span>
              <ChevronRight className="size-[18px] shrink-0" style={{ color: K.forest }} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </FlockSubPage>
  );
}
