import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Stethoscope, HeartCrack } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaRow, KyaIconTile } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { useActiveCaregiver } from "@/components/CaregiverHome";
import { useCapability } from "@/lib/useCapability";
import { KyaCaregiverChecklist, KyaCaregiverLoading } from "@/components/CaregiverToday";
import type { ActiveCaregiverBird } from "@/lib/caregiver.functions";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

// Full-screen per-bird daily checklist for a covering household member — the
// authenticated equivalent of the sitter's per-bird Today. Reached by tapping a
// bird card in the "Covering …" section on Home. Reuses the same active-caregiver
// data (useActiveCaregiver) and the shared CaregiverTodayChecklist (scoped to the
// bird) + task-completion path — no parallel checklist. Only renders while the
// sit is active and the user is its caregiver (the hook enforces both); otherwise
// it shows a "not active" card.
export const Route = createFileRoute("/_authenticated/covering/$sitId/$birdId")({
  head: () => ({ meta: [{ title: i18next.t("covering.pageTitle", "Daily care — Kya & Co.") }] }),
  component: CoveringBirdPage,
});

// Status-aware entry to today's daily health check — mirrors the sitter
// ScanCard's treatment (amber = not done, red/amber = flagged, green = done).
// A covering household member gets the same daily check an owner does (with
// the all-good shortcut), so this opens /check?bird= (DailyCheckCard), not the
// full health check; only sitters are asked for the full check. DailyCheckCard
// saves kind "daily", source "household" and tags the row with the active sit
// id (useActiveSitIdForBird), the same attribution the full check used, so the
// status here and the sit's activity view still pick it up.
function DailyCheckEntry({ bird, birdId }: { bird: ActiveCaregiverBird; birdId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const done = bird.scanDone;
  const flagged = bird.scanStatus === "red" || bird.scanStatus === "yellow";
  const tone = !done ? "amber" : bird.scanStatus === "red" ? "red" : flagged ? "amber" : "green";
  const color = tone === "red" ? K.red : tone === "amber" ? K.amberText : K.moss;
  const label = !done
    ? t("covering.scanNotDone", "Today's health check — not done yet")
    : flagged
      ? t("covering.scanFlagged", "Health check done — flagged")
      : t("covering.scanDone", "Today's health check — done");
  return (
    <KyaCard>
      <KyaRow
        last
        onClick={() => navigate({ to: "/check", search: { bird: birdId } })}
        leading={tone === "green" ? <KyaIconTile><Stethoscope className="size-5" /></KyaIconTile> : (
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={tone === "red" ? { background: "#f6dede", color: K.red } : { background: K.amberBg, color: K.amberText }} aria-hidden="true">
            <Stethoscope className="size-5" />
          </span>
        )}
        title={t("covering.dailyHealthCheck", "Daily health check · {{bird}}", { bird: bird.name })}
        detail={<span className="font-[700]" style={{ color }}>{label}</span>}
      />
    </KyaCard>
  );
}

function CoveringBirdPage() {
  const { t } = useTranslation();
  const { sitId, birdId } = Route.useParams();
  const navigate = useNavigate();
  const goBack = useGoBack(useCallback(() => navigate({ to: "/dashboard" }), [navigate]));
  const { data, isLoading } = useActiveCaregiver();
  const sit = data?.sits?.find((s) => s.id === sitId) ?? null;
  const bird = sit?.birds.find((b) => b.id === birdId) ?? null;
  const ownerName = sit?.ownerName || t("covering.theOwner", "the owner");
  // The daily check writes daily_logs, which RLS gates on record_health; a
  // member whose household preset lacks it doesn't get the entry.
  const canHealth = useCapability("record_health", { birdId });

  return (
    <KyaPage>
      <PageHeader
        title={bird ? bird.name : t("covering.dailyCare", "Daily care")}
        line={sit && bird
          ? t("covering.lineCovering", "Today's care while you cover {{owner}}'s flock", { owner: ownerName })
          : undefined}
        onBack={goBack}
      />
      <KyaBody>
        {isLoading ? (
          <KyaCaregiverLoading />
        ) : !sit || !bird ? (
          <KyaCard className="p-6 text-center">
            <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("covering.notActive", "This sit isn't active right now.")}</p>
          </KyaCard>
        ) : (
          <>
            {/* Daily health check — a distinct daily action, shown alongside
                the routine tasks. Opens the owner's daily check (/check?bird=),
                gated by record_health like the daily_logs insert policy. */}
            {canHealth && <DailyCheckEntry bird={bird} birdId={birdId} />}
            <KyaCaregiverChecklist sit={sit} birdId={birdId} />

            {/* Something's wrong — quiet, last on the page. The covering
                member's twin of the sitter's entry: opens the shared pause +
                guidance flow (/birds/$birdId/concern). This page only renders
                for the active sit's caregiver, so no extra gating needed. */}
            <KyaCard className="mt-2">
              <KyaRow
                last
                wrap
                onClick={() => navigate({ to: "/birds/$birdId/concern", params: { birdId } })}
                leading={<KyaIconTile tone="mist"><HeartCrack className="size-5" /></KyaIconTile>}
                title={t("covering.somethingsWrong", "Something's wrong with {{bird}}", { bird: bird.name })}
                detail={t("covering.ifPassed", "If {{bird}} has passed or is in serious trouble", { bird: bird.name })}
              />
            </KyaCard>
          </>
        )}
      </KyaBody>
    </KyaPage>
  );
}
