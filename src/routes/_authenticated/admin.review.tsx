import { useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaBackRow, KyaBody, KyaHeader, KyaHeading, KyaPage, KyaPrimaryButton, KyaSheet, KyaTitle } from "@/components/kya";
import { FlockChips } from "@/components/flock/FlockChips";
import { postSpaceLabel, timeAgo } from "@/components/flock/PostParts";
import { reasonLabel } from "@/components/flock/FlagSheets";
import { FLOCK_ENABLED_QUERY } from "@/lib/flock";
import {
  QUEUE_FILTERS, queueItemPlace, resolveReport, reviewEvent, reviewPost, useCanReview, useInvalidateModeration, useReviewCounts,
  useReviewPostSpaces, useReviewQueue, type QueueFilter, type QueueItem, type QueuePlace, type ReportSubject,
} from "@/lib/flockModeration";
import { pickOptional, chapterName } from "@/lib/flockNav";
import { longWhen } from "@/lib/flockEvents";
import { reviewPlace, usePlaceSuggestions, type PlaceSuggestion } from "@/lib/flockPlaces";
import { placeKindLabel } from "@/components/flock/PlaceParts";
import { RescueAdoptionCard } from "@/components/flock/RescueParts";
import { useIsAdmin } from "@/lib/flockData";
import { reviewRescue, useRescueRedemptions } from "@/lib/flockRescue";

// The review queue (Batch 8, screen 4): Do good posts waiting to go live,
// event and place suggestions (place suggestions come from their own
// function, flock_place_suggestions, backlog 1.6), rescue adoptions waiting
// for confirmation (admins only, admin_rescue_redemptions, backlog 1.16), and reported content. Behind the Flock gate like every Community screen (anyone
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
  if (q.item_type === "event") return q.event_kind === "volunteer" ? t("flock.review.eventVolunteer", "Event · volunteer day") : t("flock.review.event", "Event suggestion");
  switch (q.subject_type) {
    case "post": return t("flock.review.reportPost", "Report · post");
    case "comment": return t("flock.review.reportComment", "Report · comment");
    case "journey_update": return t("flock.review.reportUpdate", "Report · journey update");
    case "journey": return t("flock.review.reportSkill", "Report · member skill");
    default: return t("flock.review.event", "Event suggestion");
  }
}

/** "Learn together", "Great Lakes chapter", "Journeys". */
function placeLabel(t: TFunction, place: QueuePlace): string {
  if (place.kind === "journeys") return t("flock.nav.journeys", "Journeys");
  if (place.kind === "chapter") return t("flock.posts.chapterSpace", "{{name}} chapter", { name: chapterName(t, place.chapter) });
  return postSpaceLabel(t, place.space, place.chapter);
}

function ReviewQueue() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });
  const { filter } = Route.useSearch();
  const current: QueueFilter = filter ?? "all";
  const { data: canReview, isLoading: checking } = useCanReview();
  const { data: counts } = useReviewCounts(canReview === true);
  const { data: items, isLoading } = useReviewQueue(current, canReview === true && current !== "places" && current !== "rescues");
  const { data: placeItems } = usePlaceSuggestions(canReview === true);
  const { data: isAdmin } = useIsAdmin();
  const { data: rescueItems } = useRescueRedemptions("pending", canReview === true && isAdmin === true);
  const { data: spaces } = useReviewPostSpaces(items, canReview === true);
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
  const events = counts?.events ?? 0;
  const places = placeItems?.length ?? 0;
  const rescues = rescueItems?.length ?? 0;
  const total = good + reports + events + places + rescues;
  const shownPlaces = current === "all" || current === "places" ? placeItems ?? [] : [];
  const shownRescues = current === "all" || current === "rescues" ? rescueItems ?? [] : [];
  const shownItems = current === "places" || current === "rescues" ? [] : items ?? [];
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
        <KyaTitle title={t("flock.review.title", "Review queue")} line={t("flock.review.line", "Admin · {{count}} waiting", { count: total })} />
      </KyaHeader>
      <KyaBody>
        <div className="flex flex-col gap-4">
          <FlockChips label={t("flock.review.filterAria", "Filter the queue")} testId="queue-chips" value={current}
            onChange={(v) => void navigate({ search: { filter: !v || v === "all" ? undefined : v }, replace: true })}
            options={[
              { value: "all" as const, label: t("flock.review.all", "All {{count}}", { count: total }) },
              { value: "good" as const, label: t("flock.review.good", "Do good {{count}}", { count: good }) },
              { value: "events" as const, label: t("flock.review.events", "Events {{count}}", { count: events }) },
              { value: "places" as const, label: t("flock.review.places", "Places {{count}}", { count: places }) },
              ...(isAdmin ? [{ value: "rescues" as const, label: t("flock.review.rescues", "Rescues {{count}}", { count: rescues }) }] : []),
              { value: "reports" as const, label: t("flock.review.reports", "Reports {{count}}", { count: reports }) },
            ]} />
          {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
          {shownPlaces.map((p) => (
            <PlaceSuggestionCard key={p.place_id} p={p} busy={!!busy}
              onApprove={() => void act(`place:${p.place_id}`, () => reviewPlace(p.place_id, "approve"))}
              onDecline={() => void act(`place:${p.place_id}`, () => reviewPlace(p.place_id, "decline"))} />
          ))}
          {shownRescues.map((r) => (
            <RescueAdoptionCard key={r.redemption_id} r={r} busy={!!busy}
              onApprove={() => void act(`rescue:${r.redemption_id}`, () => reviewRescue(r.redemption_id, "approve"))}
              onDecline={() => void act(`rescue:${r.redemption_id}`, () => reviewRescue(r.redemption_id, "decline"))} />
          ))}
          {isLoading && current !== "places" && current !== "rescues" ? null : shownItems.length === 0 ? (shownPlaces.length + shownRescues.length > 0 ? null : (
            <p className="m-0 rounded-[18px] bg-white p-5 text-center text-[15px]" style={{ color: K.quiet }} data-testid="queue-empty">
              {t("flock.review.empty", "Nothing waiting. Nice.")}
            </p>
          )) : shownItems.map((q) => {
            const key = `${q.subject_type}:${q.subject_id}`;
            const place = queueItemPlace(q, spaces);
            // A Do good post's label already names its space.
            const where = place && q.item_type !== "good" ? placeLabel(t, place) : null;
            return (
              <article key={key} className="flex flex-col gap-2.5 rounded-[18px] bg-white p-4" style={{ color: K.forest }} data-queue-item={q.item_type} data-subject={q.subject_id}>
                <span className="text-[12.5px] font-[700] uppercase tracking-[0.04em]" style={{ color: K.moss }} data-testid="queue-item-label">
                  {[subjectLabel(t, q), where].filter(Boolean).join(" · ")}
                </span>
                <span className="text-[13px]" style={{ color: K.quiet }}>
                  {q.item_type === "report"
                    ? [t("flock.review.reportedBy", "Reported by {{count}} members", { count: q.report_count }), timeAgo(t, q.created_at, i18n.language)].join(" · ")
                    : [q.author_name, q.author_region, timeAgo(t, q.created_at, i18n.language)].filter(Boolean).join(" · ")}
                </span>
                {q.title && <KyaHeading size={18} as="h2">{q.title}</KyaHeading>}
                {q.item_type === "event" && q.event_starts_at && (
                  <span className="text-[14px] font-[700]" style={{ color: K.ink }} data-testid="queue-event-when">
                    {[longWhen(q.event_starts_at, null, i18n.language), q.event_mode === "online" ? t("flock.events.online", "Online") : q.event_place].filter(Boolean).join(" · ")}
                  </span>
                )}
                <p className="m-0 line-clamp-6 whitespace-pre-wrap text-[15px] leading-[1.45]">
                  {q.item_type === "report"
                    ? `“${q.body ?? (q.subject_type === "journey" ? t("flock.review.noDescription", "(no description)") : t("flock.review.clipOnly", "(a clip with no caption)"))}”`
                    : q.body}
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
                {q.item_type === "event" && (
                  <Link to="/flock/events/$eventId" params={{ eventId: q.subject_id }} className="self-start text-[14px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>{t("flock.review.open", "Open it")}</Link>
                )}
                {(q.post_id || q.journey_id) && (
                  q.post_id
                    ? <Link to="/flock/post/$postId" params={{ postId: q.post_id }} className="self-start text-[14px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>{t("flock.review.open", "Open it")}</Link>
                    : <Link to="/flock/journeys/$journeyId" params={{ journeyId: q.journey_id! }} className="self-start text-[14px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>{t("flock.review.open", "Open it")}</Link>
                )}
                {q.item_type !== "report" ? (
                  <div className="flex gap-2">
                    <button type="button" className={btn} style={{ background: K.forest, color: "#fff" }} disabled={!!busy} data-act="approve"
                      onClick={() => void act(key, () => (q.item_type === "event" ? reviewEvent(q.subject_id, "approve", "") : reviewPost(q.subject_id, "approve", "")))}>{t("flock.review.approve", "Approve")}</button>
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
                      onClick={() => void act(key, () => resolveReport(q.subject_type as ReportSubject, q.subject_id, "keep", ""))}>{t("flock.review.keep", "Keep it")}</button>
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
            if (decision.kind === "changes" || decision.kind === "decline") {
              const k = decision.kind;
              void act(key, () => (q.item_type === "event" ? reviewEvent(q.subject_id, k, note) : reviewPost(q.subject_id, k, note)));
            } else void act(key, () => resolveReport(q.subject_type as ReportSubject, q.subject_id, decision.kind as "message" | "remove", note));
          }} />
      )}
    </KyaPage>
  );
}

/** A member's suggested place (backlog 1.6): approve lists it at the end of
 *  its group; decline deletes it. No "ask for changes": a lead can fix the
 *  details once it's listed. */
function PlaceSuggestionCard({ p, busy, onApprove, onDecline }: { p: PlaceSuggestion; busy: boolean; onApprove: () => void; onDecline: () => void }) {
  const { t, i18n } = useTranslation();
  const btn = "min-h-[44px] flex-1 rounded-full px-3 text-[14px] font-[700] disabled:opacity-50";
  return (
    <article className="flex flex-col gap-2.5 rounded-[18px] bg-white p-4" style={{ color: K.forest }} data-queue-item="place" data-subject={p.place_id}>
      <span className="text-[12.5px] font-[700] uppercase tracking-[0.04em]" style={{ color: K.moss }} data-testid="queue-item-label">
        {[t("flock.review.place", "Place suggestion"), placeKindLabel(t, p.kind), p.region_name ? t("flock.posts.chapterSpace", "{{name}} chapter", { name: chapterName(t, p.region_name) }) : null].filter(Boolean).join(" · ")}
      </span>
      <span className="text-[13px]" style={{ color: K.quiet }}>
        {[p.suggested_by_name, timeAgo(t, p.created_at, i18n.language)].filter(Boolean).join(" · ")}
      </span>
      <KyaHeading size={18} as="h2">{p.name}</KyaHeading>
      {p.area && <span className="text-[14px] font-[700]" style={{ color: K.ink }}>{p.area}</span>}
      {p.note && <p className="m-0 line-clamp-6 whitespace-pre-wrap text-[15px] leading-[1.45]">{p.note}</p>}
      <Link to="/flock/places" search={{ region: p.region_slug }} className="self-start text-[14px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>
        {t("flock.review.placeListings", "See the chapter's listings")}
      </Link>
      <div className="flex gap-2">
        <button type="button" className={btn} style={{ background: K.forest, color: "#fff" }} disabled={busy} data-act="approve" onClick={onApprove}>{t("flock.review.approve", "Approve")}</button>
        <button type="button" className={btn} style={{ background: K.mist, color: K.red }} disabled={busy} data-act="decline" onClick={onDecline}>{t("flock.review.decline", "Decline")}</button>
      </div>
    </article>
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
    decline: { title: decision.item.item_type === "event" ? t("flock.review.declineEventTitle", "Decline this event") : t("flock.review.declineTitle", "Decline this post"), label: t("flock.review.declineLabel", "A note for the author (optional)"), go: t("flock.review.declineSend", "Decline") },
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
