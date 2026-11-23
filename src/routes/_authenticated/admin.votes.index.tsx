import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaBackRow, KyaBody, KyaHeader, KyaPage, KyaTitle } from "@/components/kya";
import { AdminOnly } from "@/components/flock/AdminOnly";
import { voteStateLabel } from "@/components/flock/VoteParts";
import { FLOCK_ENABLED_QUERY } from "@/lib/flock";
import { useIsAdmin } from "@/lib/flockData";
import { useAdminVotes, voteDay } from "@/lib/flockVotes";

// Do good votes, for admins (backlog 1.8): every vote, drafts first, and New
// vote. Laid out like the library's admin list. Behind the Flock gate, then
// admins only (the database refuses everyone else, whatever this page shows).
export const Route = createFileRoute("/_authenticated/admin/votes/")({
  head: () => ({ meta: [{ title: "Votes — Kya & Co." }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => <AdminOnly><AdminVotes /></AdminOnly>,
});

function AdminVotes() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: isAdmin } = useIsAdmin();
  const { data: rows, isLoading, isError } = useAdminVotes(isAdmin === true);
  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/flock", search: { space: "good" } })}
          right={(
            <Link to="/admin/votes/$voteId" params={{ voteId: "new" }} data-testid="new-vote"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[15px] font-[700]" style={{ background: K.lime, color: K.forest }}>
              <Plus className="size-4" aria-hidden="true" />{t("flock.votesAdmin.new", "New vote")}
            </Link>
          )} />
        <KyaTitle title={t("flock.votesAdmin.title", "Votes")} line={t("flock.votesAdmin.line", "Admin · drafts stay hidden until you open them")} />
      </KyaHeader>
      <KyaBody>
        {isLoading
          ? <div className="grid min-h-[120px] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-7 animate-spin" style={{ color: K.moss }} /></div>
          : isError
            ? <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{t("flock.votesAdmin.loadError", "We couldn't load the votes. Try again.")}</p>
            : (rows ?? []).length === 0
              ? (
                <div className="rounded-[20px] bg-white p-5 text-[15px] leading-[1.55]" style={{ color: K.ink }} data-testid="admin-votes-empty">
                  {t("flock.votesAdmin.empty", "No votes yet. Tap New vote to write one. It stays a draft, visible only to admins, until you open it.")}
                </div>
              )
              : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="admin-votes-list">
                  {(rows ?? []).map((r) => (
                    <li key={r.vote_id}>
                      <Link to="/admin/votes/$voteId" params={{ voteId: r.vote_id }} data-vote={r.vote_id} data-state={r.state}
                        className="flex min-h-[60px] items-center gap-3 rounded-[16px] bg-white px-3 py-2.5" style={{ color: K.forest }}>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[15px] font-[700]">{r.question}</span>
                          <span className="truncate text-[12.5px]" style={{ color: K.quiet }}>
                            {[
                              r.audience === "founders" ? t("flock.votesAdmin.foundersOnly", "Founders only") : t("flock.votesAdmin.allMembers", "All members"),
                              t("flock.votesAdmin.choiceCount", "{{count}} choices", { count: r.choice_count }),
                              r.state === "draft" ? null : t("flock.votesAdmin.voteCount", "{{count}} votes", { count: r.voters }),
                              r.state === "closed" ? t("flock.votesAdmin.closedOn", "Closed {{day}}", { day: voteDay(r.closes_at, i18n.language) }) : t("flock.votesAdmin.closesOn", "Closes {{day}}", { day: voteDay(r.closes_at, i18n.language) }),
                            ].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="rounded-full px-2.5 py-1 text-[12px] font-[700]" data-testid="vote-status"
                          style={r.state === "open" ? { background: K.lime, color: K.forest } : r.state === "draft" ? { background: K.amberBg, color: K.amberText } : { background: K.mist, color: K.forest }}>
                          {voteStateLabel(t, r.state)}
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
