import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Settings, AlertTriangle, CheckCircle2, Feather } from "lucide-react";
import { fetchScanFeed, markNotifsSeen, getNotifSeenAt, type ScanFeedItem } from "@/lib/notificationsFeed";

export const Route = createFileRoute("/_authenticated/notifications/")({
  head: () => ({ meta: [{ title: "Notifications — Parrot Care Co-Pilot" }] }),
  component: NotificationsInbox,
});

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NotificationsInbox() {
  const seenAt = getNotifSeenAt();
  const { data: feed = [], isLoading } = useQuery({ queryKey: ["scan-feed"], queryFn: fetchScanFeed });

  // Mark everything seen on open so the bell badge clears.
  useEffect(() => {
    markNotifsSeen();
  }, []);

  return (
    <div className="min-h-screen bg-sage-50 pb-24">
      <main className="mx-auto max-w-md px-5 py-6">
        <div className="flex items-center justify-between">
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-sage-600">
            <ArrowLeft className="size-4" /> Dashboard
          </Link>
          <Link
            to="/notifications/settings"
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-sage-700 ring-1 ring-sage-100"
          >
            <Settings className="size-3.5" /> Settings
          </Link>
        </div>

        <h1 className="mt-4 text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-sage-600">Health scans your sitters have submitted, newest first.</p>

        {isLoading ? (
          <p className="mt-6 text-sm text-sage-600">Loading…</p>
        ) : feed.length === 0 ? (
          <div className="mt-6 rounded-2xl bg-white p-6 text-center ring-1 ring-sage-100">
            <Feather className="mx-auto size-6 text-sage-400" />
            <p className="mt-2 text-sm font-semibold text-sage-800">No scans yet</p>
            <p className="mt-1 text-xs text-sage-600">When a sitter submits a daily health scan, it shows up here.</p>
          </div>
        ) : (
          <ul className="mt-5 space-y-2.5">
            {(feed as ScanFeedItem[]).map((n) => {
              const flagged = n.triage_status === "red" || n.triage_status === "yellow";
              const unread = new Date(n.created_at).getTime() > seenAt;
              const birdName = n.bird?.name ?? "Your bird";
              const sitter = n.sit?.sitter_name || n.sit?.sitter_email || "Sitter";
              const dotColor = n.triage_status === "red" ? "text-warn-red" : n.triage_status === "yellow" ? "text-warn-amber" : "text-warn-green";
              const title = n.triage_status === "red"
                ? `${birdName}: health concern flagged`
                : n.triage_status === "yellow"
                ? `${birdName}: something to check`
                : `${birdName}: all-clear scan`;
              return (
                <li key={n.id}>
                  <Link
                    to="/birds/$birdId"
                    params={{ birdId: n.bird_id }}
                    search={{ tab: "logs", scan: n.id }}
                    className={`flex items-start gap-3 rounded-2xl p-4 ring-1 transition ${
                      unread ? "bg-white ring-sage-200" : "bg-sage-50 ring-sage-100"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {flagged ? <AlertTriangle className={`size-5 ${dotColor}`} /> : <CheckCircle2 className={`size-5 ${dotColor}`} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`truncate text-sm ${unread ? "font-bold text-sage-900" : "font-semibold text-sage-700"}`}>{title}</p>
                        {unread && <span className="size-2 shrink-0 rounded-full bg-sage-700" aria-label="Unread" />}
                      </div>
                      <p className="mt-0.5 text-xs text-sage-600">Submitted by {sitter} · {relativeTime(n.created_at)}</p>
                      {flagged && n.triage_reasons && (
                        <p className="mt-1 line-clamp-2 text-xs text-sage-700">{n.triage_reasons.replace(/ \| /g, " · ")}</p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
