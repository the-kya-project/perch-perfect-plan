import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaBackRow, KyaBody, KyaHeader, KyaPage, KyaTitle } from "@/components/kya";
import { AdminOnly } from "@/components/flock/AdminOnly";
import { challengeDay, challengeStateLabel, statePillStyle } from "@/components/flock/ChallengeParts";
import { FLOCK_ENABLED_QUERY } from "@/lib/flock";
import { useAdminChallenges } from "@/lib/flockChallenges";

// Challenges, for admins (backlog 1.10): every challenge, drafts first, then
// by start day, and New challenge. Laid out like the votes list. Behind the
// Flock gate, then admins only (the database refuses everyone else).
export const Route = createFileRoute("/_authenticated/admin/challenges/")({
  head: () => ({ meta: [{ title: "Challenges — Kya & Co." }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => <AdminOnly><AdminChallenges /></AdminOnly>,
});

function AdminChallenges() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: rows, isLoading, isError } = useAdminChallenges();
  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/flock/journeys" })}
          right={(
            <Link to="/admin/challenges/$challengeId" params={{ challengeId: "new" }} data-testid="new-challenge"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[15px] font-[700]" style={{ background: K.lime, color: K.forest }}>
              <Plus className="size-4" aria-hidden="true" />{t("flock.challengesAdmin.new", "New challenge")}
            </Link>
          )} />
        <KyaTitle title={t("flock.challengesAdmin.title", "Challenges")}
          line={t("flock.challengesAdmin.line", "Admin · one at a time for the whole Flock, plus one per chapter")} />
      </KyaHeader>
      <KyaBody>
        {isLoading
          ? <div className="grid min-h-[120px] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-7 animate-spin" style={{ color: K.moss }} /></div>
          : isError
            ? <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{t("flock.challengesAdmin.loadError", "We couldn't load the challenges. Try again.")}</p>
            : (rows ?? []).length === 0
              ? (
                <div className="rounded-[20px] bg-white p-5 text-[15px] leading-[1.55]" style={{ color: K.ink }} data-testid="admin-challenges-empty">
                  {t("flock.challengesAdmin.empty", "No challenges yet. Tap New challenge to write one. Members see it only once it's scheduled and its start day arrives.")}
                </div>
              )
              : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="admin-challenges-list">
                  {(rows ?? []).map((r) => (
                    <li key={r.challenge_id}>
                      <Link to="/admin/challenges/$challengeId" params={{ challengeId: r.challenge_id }} data-challenge={r.challenge_id} data-state={r.state}
                        className="flex min-h-[60px] items-center gap-3 rounded-[16px] bg-white px-3 py-2.5" style={{ color: K.forest }}>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[15px] font-[700]">{r.title}</span>
                          <span className="truncate text-[12.5px]" style={{ color: K.quiet }}>
                            {[
                              r.kind === "journey" ? t("flock.challengesAdmin.journey", "Journey") : t("flock.challengesAdmin.standalone", "Standalone"),
                              r.region_name ?? t("flock.challengesAdmin.wholeFlock", "The whole Flock"),
                              `${challengeDay(r.starts_on, i18n.language)} – ${challengeDay(r.ends_on, i18n.language)}`,
                              r.state === "draft" || r.state === "upcoming" ? null
                                : t("flock.challengesAdmin.counts", "{{members}} joined · {{entries}} entries", { members: r.member_count, entries: r.entry_count }),
                            ].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="rounded-full px-2.5 py-1 text-[12px] font-[700]" data-testid="challenge-status" style={statePillStyle(r.state)}>
                          {challengeStateLabel(t, r.state)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
      </KyaBody>
    </KyaPage>
  );
}
