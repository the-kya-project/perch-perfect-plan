import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaBackRow, KyaBody, KyaHeader, KyaHeading, KyaPage, KyaPrimaryButton, KyaSheet, KyaTitle } from "@/components/kya";
import { FlockChips } from "@/components/flock/FlockChips";
import { timeAgo } from "@/components/flock/PostParts";
import { reasonLabel } from "@/components/flock/ReportSheet";
import { FLOCK_ENABLED_QUERY } from "@/lib/flock";
import {
  QUEUE_FILTERS, resolveReport, reviewPost, useCanReview, useInvalidateModeration, useReviewCounts, useReviewQueue,
  type QueueFilter, type QueueItem,
} from "@/lib/flockModeration";
import { pickOptional } from "@/lib/flockNav";

// The review queue (Batch 8, screen 4): Do good posts waiting to go live, and
// reported content. Behind the Flock gate like every Community screen (anyone
// the gate turns away is sent Home before anything here loads), then
// flock_can_review(): admins today; chapter leads later through
// flock_reviewers, which the database already honours.
export const Route = createFileRoute("/_authenticated/admin/review")({
  head: () => ({ meta: [{ title: "Review queue — Kya & Co." }, { name: "robots", content: "noindex,nofollow" }] }),
  validateSearch: (s: Record<string, unknown>): { filter?: QueueFilter } => ({ filter: pickOptional(s.filter, QUEUE_FILTERS) }),
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) throw redirect({ to: "/dashboard", replace: true });
  },
  component: ReviewQueue,
});

type Decision =
  | { kind: "changes" | "decline"; item: QueueItem }
  | { kind: "message" | "remove"; item: QueueItem };

function subjectLabel(t: TFunction, q: QueueItem): string {
  if (q.item_type === "good") return t("flock.review.doGood", "Do good");
  switch (q.subject_type) {
    case "post": return t("flock.review.reportPost", "Report · post");
    case "comment": return t("flock.review.reportComment", "Report · comment");
    case "journey_update": return t("flock.review.reportUpdate", "Report · journey update");
  }
}

function ReviewQueue() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });
  const { filter } = Route.useSearch();
  const current: QueueFilter = filter ?? "all";
  const { data: canReview, isLoading: checking } = useCanReview();
  const { data: counts } = useReviewCounts(canReview === true);
  const { data: items, isLoading } = useReviewQueue(current, canReview === true);
  const invalidate = useInvalidateModeration();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = () => void navigate({ to: "/flock" });

  if (checking) {
    return (
      <KyaPage>
        <div className="grid min-h-[60vh] place-items-center" role="status" aria-label="Loading">
          <Loader2 className="size-8 animate-spin" style={{ color: K.moss }} />
        </div>
      </KyaPage>
    );
  }
  if (!canReview) {
    return (
      <KyaPage>
        <KyaHeader>
          <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/dashboard" })} />
          <KyaTitle title={t("flock.review.notAvailable", "Page not available")} line={t("flock.review.notAvailableLine", "This page is for Community reviewers.")} />
        </KyaHeader>
        <KyaBody><KyaPrimaryButton onClick={() => void navigate({ to: "/dashboard" })}>{t("flock.review.home", "Go to Home")}</KyaPrimaryButton></KyaBody>
      </KyaPage>
    );
  }

  const good = counts?.good ?? 0;
  const reports = counts?.reports ?? 0;
  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); await invalidate(); setDecision(null); }
    catch { setError(t("flock.review.error", "That didn't save. Try again.")); }
    finally { setBusy(null); }
  };
  const btn = "min-h-[44px] flex-1 rounded-full px-3 text-[14px] font-[700] disabled:opacity-50";

  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={back} />
        <KyaTitle title={t("flock.review.title", "Review queue")} line={t("flock.review.line", "Admin · {{count}} waiting", { count: good + reports })} />
      </KyaHeader>
      <KyaBody>
        <div className="flex flex-col gap-4">
          <FlockChips label={t("flock.review.filterAria", "Filter the queue")} testId="queue-chips" value={current}
            onChange={(v) => void navigate({ search: { filter: !v || v === "all" ? undefined : v }, replace: true })}
            options={[
              { value: "all" as const, label: t("flock.review.all", "All {{count}}", { count: good + reports }) },
              { value: "good" as const, label: t("flock.review.good", "Do good {{count}}", { count: good }) },
              { value: "reports" as const, label: t("flock.review.reports", "Reports {{count}}", { count: reports }) },
            ]} />
          {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
          {isLoading ? null : (items ?? []).length === 0 ? (
            <p className="m-0 rounded-[18px] bg-white p-5 text-center text-[15px]" style={{ color: K.quiet }} data-testid="queue-empty">
              {t("flock.review.empty", "Nothing waiting. Nice.")}
            </p>
          ) : (items ?? []).map((q) => {
            const key = `${q.subject_type}:${q.subject_id}`;
            return (
              <article key={key} className="flex flex-col gap-2.5 rounded-[18px] bg-white p-4" style={{ color: K.forest }} data-queue-item={q.item_type} data-subject={q.subject_id}>
                <span className="text-[12.5px] font-[700] uppercase tracking-[0.04em]" style={{ color: K.moss }}>{subjectLabel(t, q)}</span>
                <span className="text-[13px]" style={{ color: K.quiet }}>
                  {q.item_type === "report"
                    ? t("flock.review.reportedBy", "Reported by {{count}} members", { count: q.report_count })
                    : [q.author_name, q.author_region, timeAgo(t, q.created_at, i18n.language)].filter(Boolean).join(" · ")}
                </span>
                {q.title && <KyaHeading size={18} as="h2">{q.title}</KyaHeading>}
                <p className="m-0 line-clamp-6 whitespace-pre-wrap text-[15px] leading-[1.45]">
                  {q.item_type === "report" ? `“${q.body ?? t("flock.review.clipOnly", "(a clip with no caption)")}”` : q.body}
                </p>
                {q.item_type === "report" && (
                  <div className="flex flex-col gap-1 text-[13.5px]" style={{ color: K.ink }} data-testid="report-reasons">
                    <span>{t("flock.review.by", "By {{name}}", { name: q.author_name ?? "?" })} · {q.reasons.map((r) => reasonLabel(t, r)).join(", ")}</span>
                    {q.notes.map((note, i) => <span key={i} style={{ color: K.quiet }}>“{note}”</span>)}
                    {(q.hidden || q.messaged_at) && (
                      <span className="font-[700]" style={{ color: K.amberText }}>
                        {[q.hidden ? t("flock.review.hidden", "Hidden until you review it") : null, q.messaged_at ? t("flock.review.messaged", "Messaged") : null].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                )}
                {(q.post_id || q.journey_id) && (
                  q.post_id
                    ? <Link to="/flock/post/$postId" params={{ postId: q.post_id }} className="self-start text-[14px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>{t("flock.review.open", "Open it")}</Link>
                    : <Link to="/flock/journeys/$journeyId" params={{ journeyId: q.journey_id! }} className="self-start text-[14px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>{t("flock.review.open", "Open it")}</Link>
                )}
                {q.item_type === "good" ? (
                  <div className="flex gap-2">
                    <button type="button" className={btn} style={{ background: K.forest, color: "#fff" }} disabled={!!busy} data-act="approve"
                      onClick={() => void act(key, () => reviewPost(q.subject_id, "approve", ""))}>{t("flock.review.approve", "Approve")}</button>
                    <button type="button" className={btn} style={{ background: K.mist }} disabled={!!busy} data-act="changes"
                      onClick={() => setDecision({ kind: "changes", item: q })}>{t("flock.review.changes", "Ask for changes")}</button>
                    <button type="button" className={btn} style={{ background: K.mist, color: K.red }} disabled={!!busy} data-act="decline"
                      onClick={() => setDecision({ kind: "decline", item: q })}>{t("flock.review.decline", "Decline")}</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button type="button" className={btn} style={{ background: K.red, color: "#fff" }} disabled={!!busy} data-act="remove"
                      onClick={() => setDecision({ kind: "remove", item: q })}>{t("flock.review.remove", "Remove it")}</button>
                    <button type="button" className={btn} style={{ background: K.mist }} disabled={!!busy} data-act="message"
                      onClick={() => setDecision({ kind: "message", item: q })}>{t("flock.review.message", "Message them")}</button>
                    <button type="button" className={btn} style={{ background: K.mist }} disabled={!!busy} data-act="keep"
                      onClick={() => void act(key, () => resolveReport(q.subject_type, q.subject_id, "keep", ""))}>{t("flock.review.keep", "Keep it")}</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </KyaBody>
      {decision && (
        <NoteSheet decision={decision} busy={!!busy} onClose={() => setDecision(null)}
          onSubmit={(note) => {
            const q = decision.item;
            const key = `${q.subject_type}:${q.subject_id}`;
            if (decision.kind === "changes" || decision.kind === "decline") void act(key, () => reviewPost(q.subject_id, decision.kind, note));
            else void act(key, () => resolveReport(q.subject_type, q.subject_id, decision.kind as "message" | "remove", note));
          }} />
      )}
    </KyaPage>
  );
}

/** A note for the author: required to ask for changes or message them;
 *  optional when declining or removing. */
function NoteSheet({ decision, busy, onClose, onSubmit }: { decision: Decision; busy: boolean; onClose: () => void; onSubmit: (note: string) => void }) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const required = decision.kind === "changes" || decision.kind === "message";
  const copy = {
    changes: { title: t("flock.review.changesTitle", "Ask for changes"), label: t("flock.review.changesLabel", "What should they change? They'll see this."), go: t("flock.review.changesSend", "Send to the author") },
    decline: { title: t("flock.review.declineTitle", "Decline this post"), label: t("flock.review.declineLabel", "A note for the author (optional)"), go: t("flock.review.declineSend", "Decline") },
    message: { title: t("flock.review.messageTitle", "Message them"), label: t("flock.review.messageLabel", "Your note appears in their notifications. The post stays as it is."), go: t("flock.review.messageSend", "Send message") },
    remove: { title: t("flock.review.removeTitle", "Remove it"), label: t("flock.review.removeLabel", "A note for the author (optional)"), go: t("flock.review.removeSend", "Remove it") },
  }[decision.kind];
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")} title={<KyaHeading size={23}>{copy.title}</KyaHeading>}>
      <label className="flex flex-col gap-1.5 text-[14px] font-[700]" style={{ color: K.forest }}>
        {copy.label}
        <textarea value={note} maxLength={1000} rows={4} onChange={(e) => setNote(e.target.value)} data-testid="review-note-input" autoFocus
          className="resize-none rounded-[14px] border p-3 text-[15px] font-normal outline-none" style={{ borderColor: "#c9d3c8" }} />
      </label>
      <div className="mt-4">
        <KyaPrimaryButton onClick={() => onSubmit(note)} disabled={busy || (required && !note.trim())}>{copy.go}</KyaPrimaryButton>
      </div>
    </KyaSheet>
  );
}
