import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getActiveCaregiverSits, type ActiveCaregiverSit } from "@/lib/caregiver.functions";
import { signBirdPhotos } from "@/lib/birdPhoto";
import { BirdCareCard } from "@/components/BirdCareCard";
import { formatLocalDate } from "@/lib/dates";
import { K, KyaHeading } from "@/components/kya";
import { localDateISO } from "@/lib/localDay";
import { useTranslation } from "react-i18next";

// The active-caregiver data hooks and the covering member's Home section.
// "Active caregiver" = the signed-in user is the assigned caregiver on at least
// one sit whose window covers today (auth'd via the user's session, not a token).

export function useActiveCaregiver() {
  const fn = useServerFn(getActiveCaregiverSits);
  return useQuery({
    queryKey: ["active-caregiver-sits"],
    queryFn: () => fn({ data: { today: localDateISO() } }),
    refetchOnWindowFocus: true,
    // Re-check on a slow cadence so the app reverts at end_date + 1 without a
    // refresh: the server fn filters by today's date.
    staleTime: 5 * 60_000,
  });
}

// Returns the sit id the current user is actively covering for the given bird
// today, or null otherwise. Used by the weight / journal / scan write paths to
// tag rows with sit_id so the sit's activity view can derive its feed from
// attribution (rather than guessing by date overlap, which would over-include
// non-caregiver entries from the same household member during the window).
export function useActiveSitIdForBird(birdId: string | null | undefined): string | null {
  const { data } = useActiveCaregiver();
  if (!birdId || !data?.sits?.length) return null;
  for (const s of data.sits) {
    if (s.birds.some((b) => b.id === birdId)) return s.id;
  }
  return null;
}

// The covering member's Home section: the sitter-style "Birds in your care" card
// list (one card per bird with today's task progress), reusing BirdCareCard.
// Tapping a bird navigates to THAT bird's full-screen checklist
// (/covering/$sitId/$birdId) — the
// authenticated equivalent of the sitter's per-bird flow, on the same
// task-completion path. Rendered only for the covering lead while the sit is
// active (the caller passes only active sits).
export function CaregiverCoveringSection({ sit }: { sit: ActiveCaregiverSit }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const doneIds = useMemo(() => new Set(sit.completionsToday.map((c) => c.taskId)), [sit.completionsToday]);

  const paths = sit.birds.map((b) => b.photo_url).filter(Boolean) as string[];
  const { data: photoMap } = useQuery({
    queryKey: ["covering-bird-photos", paths.slice().sort().join(",")],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => Object.fromEntries(await signBirdPhotos(paths, { width: 800 })),
  });
  const photoFor = (b: ActiveCaregiverSit["birds"][number]): string | null =>
    b.photo_url ? ((photoMap as any)?.[b.photo_url]?.url ?? null) : null;

  // "Sarah's birds" / "Chris' birds": the English possessive picks between two
  // keys so translators get a plain {{name}}.
  const ownerTrim = sit.ownerName?.trim();
  const where = ownerTrim
    ? /s$/i.test(ownerTrim)
      ? t("caregiverHome.ownersBirdsS", "{{name}}' birds", { name: ownerTrim })
      : t("caregiverHome.ownersBirds", "{{name}}'s birds", { name: ownerTrim })
    : t("caregiverHome.theOwnersBirds", "the owner's birds");

  return (
    <section className="space-y-3">
      <div className="px-1">
        <KyaHeading size={23}>{t("caregiverHome.covering", "Covering {{where}}", { where })}</KyaHeading>
        <p className="m-0 mt-0.5 text-[13px] leading-[1.45]" style={{ color: K.quiet }}>
          {t("caregiverHome.sitActive", "Sit active — daily care while {{owner}}'s away", { owner: sit.ownerName || t("caregiverHome.theOwner", "the owner") })}
          {" · "}
          {t("caregiverHome.sitDates", "{{start}} – {{end}}", { start: fmtDay(sit.startDate), end: fmtDay(sit.endDate) })}
        </p>
      </div>
      <div className="space-y-3">
        {sit.birds.map((b) => {
          const total = b.tasks.length;
          const done = b.tasks.filter((task) => doneIds.has(task.id)).length;
          return (
            <BirdCareCard
              key={b.id}
              name={b.name}
              species={b.species}
              photoUrl={photoFor(b)}
              photoPosition={b.photo_position}
              tasksDone={done}
              tasksTotal={total}
              scan={{ done: b.scanDone, status: b.scanStatus }}
              onClick={() => navigate({ to: "/covering/$sitId/$birdId", params: { sitId: sit.id, birdId: b.id } })}
              look="kya"
            />
          );
        })}
      </div>
    </section>
  );
}

// ---- helpers ----
function fmtDay(iso: string): string {
  return formatLocalDate(new Date(`${iso.slice(0, 10)}T12:00:00`), { month: "short", day: "numeric" });
}
