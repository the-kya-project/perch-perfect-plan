import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ArrowLeft, Stethoscope, ChevronRight, HeartCrack } from "lucide-react";
import { InkHero, Card } from "@/components/system";
import { useActiveCaregiver, CaregiverTodayChecklist, CaregiverLoading } from "@/components/CaregiverHome";
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

// Status-aware entry to today's health scan — mirrors the sitter ScanCard's
// treatment (amber = not done, red/amber = flagged, green = done) but links to
// the authenticated scan route. Not parallel scan logic: /birds/$birdId/scan IS
// the shared scan flow.
function ScanEntry({ bird, birdId }: { bird: ActiveCaregiverBird; birdId: string }) {
  const { t } = useTranslation();
  const done = bird.scanDone;
  const flagged = bird.scanStatus === "red" || bird.scanStatus === "yellow";
  const tone = !done ? "amber" : bird.scanStatus === "red" ? "red" : flagged ? "amber" : "green";
  const color = tone === "red" ? "text-warn-red" : tone === "amber" ? "text-warn-amber" : "text-warn-green";
  const ring = tone === "red" ? "ring-warn-red/30" : tone === "amber" ? "ring-warn-amber/30" : "ring-warn-green/25";
  const label = !done
    ? t("covering.scanNotDone", "Today's health check — not done yet")
    : flagged
      ? t("covering.scanFlagged", "Health check done — flagged")
      : t("covering.scanDone", "Today's health check — done");
  return (
    <Link
      to="/birds/$birdId/scan"
      params={{ birdId }}
      className={`flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ${ring} active:scale-[0.99]`}
    >
      <span className={`grid size-10 shrink-0 place-items-center rounded-full bg-[var(--cream2)] ${color}`}>
        <Stethoscope className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-[var(--mute2)]">{t("covering.dailyHealthCheck", "Daily health check · {{bird}}", { bird: bird.name })}</span>
        <span className={`block text-sm font-medium ${color}`}>{label}</span>
      </div>
      <ChevronRight className="size-5 shrink-0 self-center text-[var(--mute2)]" />
    </Link>
  );
}

function CoveringBirdPage() {
  const { t } = useTranslation();
  const { sitId, birdId } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useActiveCaregiver();
  const sit = data?.sits?.find((s) => s.id === sitId) ?? null;
  const bird = sit?.birds.find((b) => b.id === birdId) ?? null;

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={() => navigate({ to: "/dashboard" })}
          eyebrow={sit ? t("covering.coveringFlock", "Covering {{owner}}'s flock", { owner: sit.ownerName || t("covering.theOwner", "the owner") }) : t("covering.dailyCare", "Daily care")}
          headline={bird ? bird.name : t("covering.dailyCare", "Daily care")}
          body={bird ? t("covering.todaysCareFor", "Today's care for {{bird}}.", { bird: bird.name }) : undefined}
        />
        <main className="space-y-4 px-5 pt-5">
          {isLoading ? (
            <CaregiverLoading />
          ) : !sit || !bird ? (
            <Card className="p-6 text-center">
              <p className="t-body text-[var(--ink2)]">{t("covering.notActive", "This sit isn't active right now.")}</p>
            </Card>
          ) : (
            <>
              {/* Daily health scan — a distinct daily action, shown alongside the
                  routine tasks. Reuses the authenticated scan flow
                  (/birds/$birdId/scan, gated by record_health; it tags the scan
                  with the active sit id via useActiveSitIdForBird). */}
              <ScanEntry bird={bird} birdId={birdId} />
              <CaregiverTodayChecklist sit={sit} birdId={birdId} />

              {/* Something's wrong — quiet, last on the page. The covering
                  member's twin of the sitter's entry: opens the shared pause +
                  guidance flow (/birds/$birdId/concern). This page only renders
                  for the active sit's caregiver, so no extra gating needed. */}
              <div>
                <Link
                  to="/birds/$birdId/concern"
                  params={{ birdId }}
                  className="flex min-h-[52px] w-full items-center gap-3 rounded-[13px] border border-[var(--line)] bg-white px-4 text-left active:scale-[0.99]"
                >
                  <HeartCrack className="size-5 shrink-0 text-[var(--mute2)]" />
                  <span className="flex-1 text-[14px] font-[500] text-[var(--ink)]">{t("covering.somethingsWrong", "Something's wrong with {{bird}}", { bird: bird.name })}</span>
                  <ChevronRight className="size-4 shrink-0 text-[var(--mute2)]" />
                </Link>
                <p className="t-meta mt-1.5 px-1">{t("covering.ifPassed", "If {{bird}} has passed or is in serious trouble", { bird: bird.name })}</p>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
