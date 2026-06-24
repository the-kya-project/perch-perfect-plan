import { createFileRoute, Link, useRouter, useCanGoBack, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Settings, AlertTriangle, CheckCircle2, Feather, Activity, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchScanFeed, markNotifsSeen, getNotifSeenAt, scanRunBy, type ScanFeedItem } from "@/lib/notificationsFeed";
import { InkHero, IconTile, StatusPill, RecordRow, Card } from "@/components/system";

export const Route = createFileRoute("/_authenticated/notifications/")({
  head: () => ({ meta: [{ title: "Scans — Kya & Co." }] }),
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
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  // Reachable from the Scans tab and the header bell on any screen, so return
  // to wherever the user came from; fall back to Home if there's no history.
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/dashboard" }));
  const seenAt = getNotifSeenAt();
  const { data: feed = [], isLoading } = useQuery({ queryKey: ["scan-feed"], queryFn: fetchScanFeed, refetchOnWindowFocus: true });
  const { data: birds = [] } = useQuery({
    queryKey: ["owner-birds-min"],
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("id, name").order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });
  const [picking, setPicking] = useState(false);

  // Mark everything seen on open so the bell badge clears.
  useEffect(() => {
    markNotifsSeen();
  }, []);

  // "Run a scan" is per-bird. With exactly one bird the hero's lime primary goes
  // straight to that bird's scan; with several it toggles an in-body bird picker
  // (InkHero's single onPress can't host the picker), and with none it's omitted.
  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          eyebrow="Scans"
          headline="A daily check, archived."
          body="A small daily look that adds up to a record."
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          cta={
            birds.length === 1
              ? { label: "Run a scan", tone: "lime", icon: <Activity className="size-4" />, onPress: () => navigate({ to: "/birds/$birdId/scan", params: { birdId: birds[0].id } }) }
              : birds.length > 1
              ? { label: "Run a scan", tone: "lime", icon: <Activity className="size-4" />, onPress: () => setPicking((v) => !v) }
              : undefined
          }
          trailingIcons={
            <Link
              to="/notifications/settings"
              aria-label="Settings"
              className="grid size-9 place-items-center rounded-full text-white active:scale-95"
              style={{ background: "rgba(255,255,255,0.12)" }}
            >
              <Settings className="size-[18px]" />
            </Link>
          }
        />

        <main className="space-y-4 px-5 pt-5">
          {/* Run a scan — bird picker (only when there's more than one bird) */}
          {birds.length > 1 && picking && (
            <Card>
              {birds.map((b, i) => (
                <RecordRow
                  key={b.id}
                  title={b.name}
                  onClick={() => navigate({ to: "/birds/$birdId/scan", params: { birdId: b.id } })}
                  last={i === birds.length - 1}
                />
              ))}
            </Card>
          )}

          {isLoading ? (
            <p className="t-body text-[var(--mute)]">Loading…</p>
          ) : feed.length === 0 ? (
            <section className="rounded-[18px] bg-white p-8 text-center ring-1 ring-[var(--line2)]" style={{ boxShadow: "0 6px 14px -8px rgba(40,50,40,.08)" }}>
              <div className="flex justify-center"><IconTile size={48} tone="pale" icon={<Feather className="size-6" />} /></div>
              <h2 className="t-section mt-3">No scans yet</h2>
              <p className="t-body mx-auto mt-1.5 max-w-[34ch] text-[var(--ink2)]">Run a scan above, or a sitter's daily scans will show up here.</p>
            </section>
          ) : (
            <Card>
              {(feed as ScanFeedItem[]).map((n, i) => {
                const flagged = n.triage_status === "red" || n.triage_status === "yellow";
                const unread = new Date(n.created_at).getTime() > seenAt;
                const birdName = n.bird?.name ?? "Your bird";
                const runBy = scanRunBy(n);
                const title = n.triage_status === "red"
                  ? `${birdName}: health concern flagged`
                  : n.triage_status === "yellow"
                  ? `${birdName}: something to check`
                  : `${birdName}: all-clear scan`;
                const runByLabel = runBy === "You" ? "Run by you" : `Run by ${runBy}`;
                const runnerPill = n.source === "household"
                  ? <StatusPill tone="household">Household</StatusPill>
                  : n.source === "sitter"
                  ? <StatusPill tone="off">Sitter</StatusPill>
                  : undefined;
                return (
                  <RecordRow
                    key={n.id}
                    last={i === feed.length - 1}
                    leading={
                      <IconTile
                        size={38}
                        tone={flagged ? "amber" : "pale"}
                        icon={flagged ? <AlertTriangle className="size-5" /> : <CheckCircle2 className="size-5" />}
                      />
                    }
                    title={
                      <span className="inline-flex items-center gap-2">
                        {title}
                        {unread && <span className="size-2 shrink-0 rounded-full bg-[var(--moss)]" aria-label="Unread" />}
                      </span>
                    }
                    subtitle={
                      <span className="inline-flex items-center gap-2">
                        <span>{relativeTime(n.created_at)} · {runByLabel}</span>
                        {runnerPill}
                      </span>
                    }
                    onClick={() => navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId: n.bird_id, scanId: n.id } })}
                  />
                );
              })}
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
