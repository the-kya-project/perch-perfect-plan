import { useEffect, useRef, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Bell, BellRing, CalendarDays, Megaphone, PlayCircle, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockChips, FlockEmpty } from "@/components/flock/FlockChips";
import { FlockAvatar } from "@/components/flock/FlockPeople";
import { timeAgo } from "@/components/flock/PostParts";
import {
  markNotificationsRead, NOTIFICATION_FILTERS, notificationGroup, notificationTarget, useNotifications,
  type FlockNotification, type NotificationFilter,
} from "@/lib/flockModeration";
import { pickOptional } from "@/lib/flockNav";
import { possessive } from "@/lib/journeys";

// Community notifications (Batch 3, screen 7): replies, cheers, review results,
// followed journeys and chapter news, with filters and Today / Earlier. Kept
// apart from care reminders; no push or email yet.
export const Route = createFileRoute("/_authenticated/flock/you/notifications")({
  validateSearch: (s: Record<string, unknown>): { filter?: NotificationFilter } => ({ filter: pickOptional(s.filter, NOTIFICATION_FILTERS) }),
  component: FlockNotifications,
});

function filterLabel(t: TFunction, f: NotificationFilter): string {
  switch (f) {
    case "all": return t("flock.notif.all", "All");
    case "replies": return t("flock.notif.replies", "Replies");
    case "cheers": return t("flock.notif.cheers", "Cheers");
    case "chapter": return t("flock.notif.chapter", "My chapter");
  }
}

/** What it was about, in a few words: "your post", "Kiwi's milestone: flies to you". */
function aboutWhat(t: TFunction, n: FlockNotification): string {
  if (n.subject_type === "journey_milestone" && n.bird_name) {
    return n.milestone_title
      ? t("flock.notif.aboutMilestone", "{{bird}} milestone: {{title}}", { bird: possessive(n.bird_name), title: n.milestone_title.replace(/\.$/, "").toLowerCase() })
      : t("flock.notif.aboutMilestoneShort", "{{bird}} milestone", { bird: possessive(n.bird_name) });
  }
  if (n.subject_type === "journey_update" && n.bird_name) return t("flock.notif.aboutClip", "{{bird}} clip", { bird: possessive(n.bird_name) });
  if (n.subject_type === "comment") return t("flock.notif.aboutComment", "your comment");
  return t("flock.notif.aboutPost", "your post");
}

/** The sentence: who did what, with the name in bold. */
function NotificationText({ n }: { n: FlockNotification }) {
  const { t, i18n } = useTranslation();
  const who = n.actor_name ?? t("flock.posts.member", "A member");
  const b = (s: string) => <b style={{ color: K.forest }}>{s}</b>;
  const parts = (lead: ReactNode, rest: string) => <>{lead} {rest}</>;
  switch (n.kind) {
    case "reply": {
      if (n.detail === "reply") return parts(b(who), t("flock.notif.repliedToYou", "replied to your comment"));
      if (n.journey_id && n.bird_name) return parts(b(who), t("flock.notif.commentedJourney", "commented on {{bird}} {{skill}}", { bird: possessive(n.bird_name), skill: (n.skill ?? "").toLowerCase() }));
      return parts(b(who), t("flock.notif.commentedPost", "commented on your post"));
    }
    case "cheer":
      return n.others > 0
        ? parts(b(t("flock.notif.people", "{{count}} people", { count: n.others + 1 })), t("flock.notif.cheered", "cheered {{what}}", { what: aboutWhat(t, n) }))
        : parts(b(who), t("flock.notif.cheered", "cheered {{what}}", { what: aboutWhat(t, n) }));
    case "event": {
      const title = n.event_title ?? "";
      if (n.detail === "reminder") return <>{b(t("flock.notif.eventTomorrow", "Tomorrow:"))} {t("flock.notif.eventReminder", "{{title}}. You said you're going.", { title })}</>;
      return <>{b(t("flock.notif.eventCancelled", "{{title}} was cancelled.", { title }))}{n.note ? ` ${n.note}` : ""}</>;
    }
    case "review":
      if (n.subject_type === "event") {
        if (n.detail === "approved") return <>{t("flock.notif.eventApproved", "Your event {{title}} is on the calendar.", { title: n.event_title ?? "" })}</>;
        if (n.detail === "changes_requested") return <>{t("flock.notif.eventChanges", "Your event needs a few changes:")} {n.note}</>;
        return <>{t("flock.notif.eventDeclined", "Your event wasn't approved this time.")}{n.note ? ` ${n.note}` : ""}</>;
      }
      if (n.detail === "approved") return <>{t("flock.notif.reviewLiveLead", "Your Do good post is")} {b(t("flock.notif.reviewLive", "live"))}{t("flock.notif.reviewLiveEnd", ". Thanks for sharing it.")}</>;
      if (n.detail === "changes_requested") return <>{t("flock.notif.reviewChanges", "Your Do good post needs a few changes:")} {n.note}</>;
      return <>{t("flock.notif.reviewDeclined", "Your Do good post wasn't approved this time.")}{n.note ? ` ${n.note}` : ""}</>;
    case "clip":
      return parts(b(n.bird_name ?? who), t("flock.notif.newClip", "posted a new clip in a journey you follow"));
    case "chapter":
      if (n.subject_type === "event" && n.event_starts_at) {
        return <>{b(`${n.region_name ?? t("flock.notif.chapter", "My chapter")}:`)} {t("flock.notif.chapterEvent", "{{title}} is on the calendar for {{date}}", {
          title: n.event_title ?? "", date: new Date(n.event_starts_at).toLocaleDateString(i18n.language, { month: "short", day: "numeric" }) })}</>;
      }
      return <>{b(`${n.region_name ?? t("flock.notif.chapter", "My chapter")}:`)} {t("flock.notif.chapterPost", "{{name}} posted in your chapter", { name: who })}</>;
    case "notice":
      return <>{b(n.detail === "removed" ? t("flock.notif.removed", "We removed something you posted.") : t("flock.notif.notice", "A note from The Kya Project:"))} {n.note}</>;
  }
}

function Leading({ n }: { n: FlockNotification }) {
  const icon = (el: ReactNode, bg: string) => (
    <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: bg, color: K.forest }} aria-hidden="true">{el}</span>
  );
  if (n.kind === "review") return icon(<Sparkles className="size-5" />, K.lime);
  if (n.kind === "notice") return icon(<Megaphone className="size-5" />, K.amberBg);
  if (n.kind === "clip") return icon(<PlayCircle className="size-5" />, K.teal);
  if (n.kind === "event" || n.subject_type === "event") return icon(<CalendarDays className="size-5" />, K.lime);
  if (n.kind === "cheer" && n.others > 0) return icon(<BellRing className="size-5" />, K.sunflower);
  return <FlockAvatar name={n.actor_name ?? "?"} size={40} />;
}

function FlockNotifications() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });
  const { filter } = Route.useSearch();
  const current: NotificationFilter = filter ?? "all";
  const { data, isLoading, isError } = useNotifications(current);
  const list = data ?? [];
  // Seen once shown: the dots stay for this visit and are gone next time.
  const marked = useRef(false);
  useEffect(() => {
    if (marked.current || !data || !data.some((n) => n.unread)) return;
    marked.current = true;
    void markNotificationsRead(null).catch(() => { marked.current = false; });
  }, [data]);
  const groups: { key: "today" | "earlier"; title: string; items: FlockNotification[] }[] = [
    { key: "today", title: t("flock.notif.today", "Today"), items: list.filter((n) => notificationGroup(n.created_at) === "today") },
    { key: "earlier", title: t("flock.notif.earlier", "Earlier"), items: list.filter((n) => notificationGroup(n.created_at) === "earlier") },
  ];
  return (
    <FlockSubPage title={t("flock.you.notifications", "Notifications")} line={t("flock.you.notificationsLine", "Community is separate from care reminders")} fallback="/flock/you">
      <div className="flex flex-col gap-4">
        <FlockChips label={t("flock.notif.filterAria", "Filter notifications")} testId="notif-chips" value={current}
          options={NOTIFICATION_FILTERS.map((f) => ({ value: f, label: filterLabel(t, f) }))}
          onChange={(v) => void navigate({ search: { filter: !v || v === "all" ? undefined : v }, replace: true })} />
        {isLoading ? null : isError ? (
          <p className="m-0 text-[15px]" style={{ color: K.quiet }}>{t("flock.notif.error", "We couldn't load your notifications.")}</p>
        ) : list.length === 0 ? (
          <FlockEmpty icon={<Bell className="size-6" />} title={t("flock.notif.emptyTitle", "Nothing new")}>
            {t("flock.notif.empty", "Replies, cheers, and news from your chapter and the journeys you follow will show up here.")}
          </FlockEmpty>
        ) : groups.filter((g) => g.items.length > 0).map((g) => (
          <section key={g.key} className="flex flex-col gap-1" data-testid={`notif-${g.key}`}>
            <KyaHeading size={17} as="h2">{g.title}</KyaHeading>
            <ul className="m-0 flex list-none flex-col p-0">
              {g.items.map((n) => {
                const target = notificationTarget(n);
                return (
                  <li key={n.ids[0]}>
                    <button type="button" disabled={!target} onClick={() => target && void navigate(target as never)} data-notification={n.kind}
                      className="flex w-full items-start gap-3 rounded-[14px] px-2 py-3 text-left" style={{ background: n.unread ? "#fff" : "transparent" }}>
                      <Leading n={n} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px] leading-[1.4]" style={{ color: K.ink }}><NotificationText n={n} /></span>
                        <span className="text-[12.5px]" style={{ color: K.quiet }}>{timeAgo(t, n.created_at, i18n.language)}</span>
                      </span>
                      {n.unread && <span className="mt-2 size-2.5 shrink-0 rounded-full" style={{ background: K.moss }} aria-label={t("flock.notif.unread", "New")} data-testid="unread-dot" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <section className="rounded-[18px] bg-white p-4" data-testid="notif-settings">
          <KyaHeading size={17} as="h2">{t("flock.notif.settingsTitle", "Push and email")}</KyaHeading>
          <p className="m-0 mt-1.5 text-[14.5px] leading-[1.5]" style={{ color: K.ink }}>
            {t("flock.notif.settings", "Push notifications and email for the Community are coming. For now, updates live here. Your care reminders are separate and won't change.")}
          </p>
        </section>
      </div>
    </FlockSubPage>
  );
}
