import { createFileRoute, Link, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Calendar, Activity, Scale, BookOpen, CheckSquare, Image as ImageIcon, Loader2, Users, Mail, Trash2, AlertTriangle,
} from "lucide-react";
import { InkHero, SectionHead, Card, IconTile, StatusPill } from "@/components/system";
import { useServerFn } from "@tanstack/react-start";
import { resolveHouseholdNames } from "@/lib/home.functions";
import { memberDisplayName, firstName } from "@/lib/memberDisplay";
import { useHouseholdCapability, useMyPermissions } from "@/lib/useCapability";
import { formatDateRangeUS } from "@/lib/dates";

// Past Sits detail view — the sit's own activity feed, derived strictly from
// sit_id attribution on the logs that ran inside the window. Reachable from a
// SitCard "Activity" link; owner-only (RLS on sits enforces). Read-only.
export const Route = createFileRoute("/_authenticated/sits/$sitId")({
  head: () => ({ meta: [{ title: "Sit activity — Kya & Co." }] }),
  component: SitDetail,
});

type Activity =
  | { kind: "scan"; id: string; at: string; status: string; reasons: string | null; bird_id: string }
  | { kind: "weight"; id: string; at: string; grams: number; bird_id: string }
  | { kind: "journal"; id: string; at: string; title: string; kindLabel: string | null; bird_id: string }
  | { kind: "photo"; id: string; at: string; bird_id: string }
  | { kind: "task"; id: string; at: string; label: string };

function SitDetail() {
  const { sitId } = Route.useParams();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/sits" }));
  const resolveNames = useServerFn(resolveHouseholdNames);

  const { data, isLoading } = useQuery({
    queryKey: ["sit-detail", sitId],
    queryFn: async () => {
      const { data: sit } = await supabase
        .from("sits")
        .select("id, owner_id, title, start_date, end_date, sitter_name, sitter_email, caregiver_user_id, lead_user_id, notes, revoked")
        .eq("id", sitId).maybeSingle();
      if (!sit) return { sit: null as any, birds: [], caregiver: null as null | { name: string }, leadName: null as string | null, activity: [] as Activity[], counts: { scans: 0, weights: 0, journals: 0, photos: 0, tasks: 0 } };

      // Resolve caregiver + lead display names via the service role (the
      // authenticated client can't read other users' profiles — RLS self-only).
      const personIds = [sit.caregiver_user_id, sit.lead_user_id].filter(Boolean) as string[];
      const [birdsJoin, nameMap] = await Promise.all([
        supabase.from("sit_birds").select("bird_id, birds(id, name)").eq("sit_id", sitId),
        personIds.length ? resolveNames({ data: { userIds: personIds } }) : Promise.resolve({} as Record<string, any>),
      ]);
      const displayFor = (id: string) => memberDisplayName((nameMap as Record<string, any>)[id]);
      const birds = ((birdsJoin.data ?? []) as any[])
        .map((r) => r.birds)
        .filter(Boolean)
        .map((b: any) => ({ id: b.id as string, name: b.name as string }));

      // Activity feed (all by sit_id; task_completions already use it).
      const [scansRes, weightsRes, journalRes, photosRes, completionsRes] = await Promise.all([
        supabase.from("daily_logs").select("id, bird_id, created_at, triage_status, triage_reasons").eq("sit_id", sitId).order("created_at", { ascending: false }),
        supabase.from("weight_entries").select("id, bird_id, grams, measured_at").eq("sit_id", sitId).order("measured_at", { ascending: false }),
        supabase.from("journal_entries").select("id, bird_id, title, kind, created_at").eq("sit_id", sitId).order("created_at", { ascending: false }),
        supabase.from("photo_logs").select("id, bird_id, created_at").eq("sit_id", sitId).order("created_at", { ascending: false }),
        supabase.from("task_completions").select("id, routine_task_id, completed_at, routine_tasks(title)").eq("sit_id", sitId).order("completed_at", { ascending: false }),
      ]);
      const counts = {
        scans: scansRes.data?.length ?? 0,
        weights: weightsRes.data?.length ?? 0,
        journals: journalRes.data?.length ?? 0,
        photos: photosRes.data?.length ?? 0,
        tasks: completionsRes.data?.length ?? 0,
      };

      const activity: Activity[] = [
        ...((scansRes.data ?? []) as any[]).map((r) => ({ kind: "scan" as const, id: r.id, at: r.created_at, status: r.triage_status ?? "green", reasons: r.triage_reasons ?? null, bird_id: r.bird_id })),
        ...((weightsRes.data ?? []) as any[]).map((r) => ({ kind: "weight" as const, id: r.id, at: r.measured_at, grams: r.grams, bird_id: r.bird_id })),
        ...((journalRes.data ?? []) as any[]).map((r) => ({ kind: "journal" as const, id: r.id, at: r.created_at, title: r.title ?? "Journal entry", kindLabel: r.kind ?? null, bird_id: r.bird_id })),
        ...((photosRes.data ?? []) as any[]).map((r) => ({ kind: "photo" as const, id: r.id, at: r.created_at, bird_id: r.bird_id })),
        ...((completionsRes.data ?? []) as any[]).map((r) => ({ kind: "task" as const, id: r.id, at: r.completed_at, label: r.routine_tasks?.title ?? "Routine task" })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

      return {
        sit,
        birds,
        caregiver: sit.caregiver_user_id ? { name: displayFor(sit.caregiver_user_id) } : null,
        leadName: sit.lead_user_id ? displayFor(sit.lead_user_id) : null,
        activity,
        counts,
      };
    },
  });

  // Delete a sit — owner always; a household member only with manage_sits (RLS
  // "sits delete" mirrors this). Deleting the row cascades its children via FK
  // (sit_birds / task_completions / sit_checklist_items removed; logged
  // daily_logs / weight_entries / photo_logs keep their rows with sit_id nulled).
  const qc = useQueryClient();
  const canManageSits = useHouseholdCapability("manage_sits", data?.sit?.owner_id);
  const { data: perms } = useMyPermissions();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (isLoading) return <Shell goBack={goBack} eyebrow="Sit activity" headline="Loading…"><Loader /></Shell>;
  if (!data?.sit) return <Shell goBack={goBack} eyebrow="Sit activity" headline="Sit not found."><Card className="p-6 text-center"><p className="t-body text-[var(--ink2)]">This sit isn't available.</p></Card></Shell>;

  const sit = data.sit;
  // Owner ALWAYS sees delete — detected explicitly here so a slow/empty
  // permissions fetch (or a missing owner_id) can never hide it. Members need
  // manage_sits. RLS ("sits delete") enforces the same rule server-side.
  const isOwner = !!perms?.myId && perms.myId === sit.owner_id;
  const canDelete = isOwner || canManageSits;
  const today = new Date().toISOString().slice(0, 10);
  // Active = a sitter is currently covering: live window (today between the
  // dates) and not revoked. Deleting one mid-sit pulls coverage out from under them.
  const isActiveSit = !sit.revoked && sit.start_date <= today && sit.end_date >= today;

  async function deleteSit() {
    setDeleting(true);
    try {
      const { error } = await supabase.from("sits").delete().eq("id", sitId);
      if (error) throw error;
      toast.success("Sit deleted.");
      // Refresh every surface that lists sits: the Sits list (["sits-full"]), the
      // Past archive (["sits-archive"]), the dashboard's upcoming row (["all-sits"]),
      // and the caregiver home (["active-caregiver-sits"]).
      qc.invalidateQueries({ queryKey: ["sits-full"] });
      qc.invalidateQueries({ queryKey: ["sits-archive"] });
      qc.invalidateQueries({ queryKey: ["all-sits"] });
      qc.invalidateQueries({ queryKey: ["active-caregiver-sits"] });
      qc.invalidateQueries({ queryKey: ["dashboard-home"] }); // Home's upcoming-sit/today rows
      navigate({ to: "/sits" });
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't delete the sit.");
      setDeleting(false);
    }
  }

  const isHousehold = !!sit.caregiver_user_id;
  const eyebrow = sit.title?.trim() || "Sit";
  const headline = formatDateRangeUS(sit.start_date, sit.end_date);
  const coverBy = isHousehold
    ? `Covered by ${data.caregiver?.name ?? "household member"}`
    : sit.sitter_name?.trim()
      ? `Covered by ${sit.sitter_name}${sit.sitter_email ? ` · ${sit.sitter_email}` : ""}`
      : sit.sitter_email ?? "External sitter";
  const birdById = new Map(data.birds.map((b) => [b.id, b.name]));
  const birdLabel = (id: string) => birdById.get(id) ?? "A bird";

  return (
    <Shell goBack={goBack} eyebrow={eyebrow} headline={headline} body={coverBy}>
      {/* Sit meta — who, what birds, dates. */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          {isHousehold ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--pale)] text-sm font-[500] text-[var(--moss)]">
              {((data.caregiver?.name ?? "?").slice(0, 1) || "?").toUpperCase()}
            </span>
          ) : (
            <IconTile size={40} tone="pale" icon={<Mail className="size-5" />} />
          )}
          <div className="min-w-0 flex-1">
            <p className="t-item truncate">{isHousehold ? data.caregiver?.name ?? "Household member" : sit.sitter_name?.trim() || sit.sitter_email || "External sitter"}</p>
            <p className="t-meta truncate">
              {isHousehold ? "Household" : "External sitter"} · {formatDateRangeUS(sit.start_date, sit.end_date)}
            </p>
            {data.leadName && (
              <p className="mt-0.5">
                <span className="t-eyebrow text-[var(--teal-on-cream)]">In charge · </span>
                <span className="t-eyebrow text-[var(--ink)]">{firstName(data.leadName)}</span>
              </p>
            )}
          </div>
          {isHousehold && <StatusPill tone="household">Household</StatusPill>}
        </div>
        {data.birds.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--line2)] pt-3">
            <Users className="size-4 text-[var(--mute)]" />
            <p className="t-meta">Birds covered:</p>
            {data.birds.map((b) => (
              <Link key={b.id} to="/birds/$birdId" params={{ birdId: b.id }} className="rounded-full bg-[var(--pale2)] px-2 py-0.5 text-[12px] font-[500] text-[var(--moss)]">{b.name}</Link>
            ))}
          </div>
        )}
      </Card>

      {/* Activity summary tiles */}
      <Card>
        <div className="grid grid-cols-5 divide-x divide-[var(--line2)]">
          <SummaryTile label="Health checks" value={data.counts.scans} />
          <SummaryTile label="Weights" value={data.counts.weights} />
          <SummaryTile label="Journal" value={data.counts.journals} />
          <SummaryTile label="Photos" value={data.counts.photos} />
          <SummaryTile label="Tasks" value={data.counts.tasks} />
        </div>
      </Card>

      <section>
        <SectionHead title="Activity" />
        {data.activity.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="t-body text-[var(--ink2)]">No activity logged during this sit.</p>
          </Card>
        ) : (
          <Card>
            {data.activity.map((a, i) => (
              <ActivityRow key={`${a.kind}-${a.id}`} a={a} last={i === data.activity.length - 1} birdLabel={birdLabel} />
            ))}
          </Card>
        )}
      </section>

      {/* Delete — owner (always) or a manage_sits member (RLS enforces the same). */}
      {canDelete && (
        <section>
          <SectionHead title="Danger zone" />
          <Card className="p-4">
            {confirmingDelete ? (
              <div className="rounded-xl bg-[var(--red-fill)] p-3 ring-1 ring-[var(--red-deep)]/15">
                {isActiveSit && (
                  <p className="mb-2 flex items-start gap-2 text-sm font-[500] text-[var(--red-deep)]">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    This sit is active right now — a sitter is covering. Deleting it ends their access immediately.
                  </p>
                )}
                <p className="text-sm text-[var(--ink)]">
                  Delete this sit? This can't be undone. Logs recorded during it (scans, weights, photos) are kept but
                  no longer tied to the sit; its checklist and task completions are removed.
                </p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={deleteSit} disabled={deleting} className="min-h-[44px] flex-1 rounded-[12px] bg-[var(--red-deep)] px-4 text-[15px] font-[600] text-white disabled:opacity-50">
                    {deleting ? "Deleting…" : "Delete sit"}
                  </button>
                  <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting} className="min-h-[44px] rounded-[12px] border border-[var(--line)] px-4 text-[15px] font-[500] text-[var(--mute)] disabled:opacity-50">Keep</button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmingDelete(true)} className="inline-flex min-h-[44px] items-center gap-2 text-[15px] font-[500] text-[var(--red-deep)]">
                <Trash2 className="size-4" /> Delete this sit
              </button>
            )}
          </Card>
        </section>
      )}
    </Shell>
  );
}

function ActivityRow({ a, last, birdLabel }: { a: Activity; last: boolean; birdLabel: (id: string) => string }) {
  const when = fmtWhen(a.at);
  if (a.kind === "scan") {
    const triage = a.status === "red" || a.status === "yellow";
    return (
      <Row last={last} leading={<IconTile size={34} tone={triage ? "amber" : "pale"} icon={<Activity className="size-4" />} />}
        title={`${birdLabel(a.bird_id)} · health check — ${a.status === "red" ? "concern flagged" : a.status === "yellow" ? "something to check" : "all clear"}`}
        subtitle={`${when}${a.reasons ? ` · ${a.reasons.replace(/ \| /g, " · ")}` : ""}`}
      />
    );
  }
  if (a.kind === "weight") {
    return (
      <Row last={last} leading={<IconTile size={34} tone="pale" icon={<Scale className="size-4" />} />}
        title={`${birdLabel(a.bird_id)} · ${a.grams} g`}
        subtitle={when}
      />
    );
  }
  if (a.kind === "journal") {
    return (
      <Row last={last} leading={<IconTile size={34} tone="pale" icon={<BookOpen className="size-4" />} />}
        title={`${birdLabel(a.bird_id)} · ${a.title}`}
        subtitle={`${a.kindLabel ? `${a.kindLabel} · ` : ""}${when}`}
      />
    );
  }
  if (a.kind === "photo") {
    return (
      <Row last={last} leading={<IconTile size={34} tone="pale" icon={<ImageIcon className="size-4" />} />}
        title={`${birdLabel(a.bird_id)} · photo`}
        subtitle={when}
      />
    );
  }
  return (
    <Row last={last} leading={<IconTile size={34} tone="pale" icon={<CheckSquare className="size-4" />} />}
      title={`Task complete — ${a.label}`}
      subtitle={when}
    />
  );
}

function Row({ leading, title, subtitle, last }: { leading: React.ReactNode; title: string; subtitle: string; last: boolean }) {
  return (
    <div className={`flex min-h-[44px] items-center gap-3 px-4 py-2.5 ${last ? "" : "border-b border-[var(--line2)]"}`}>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="t-item truncate font-[400]">{title}</p>
        <p className="t-meta truncate">{subtitle}</p>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-3 text-center">
      <p className="text-[18px] font-[500] text-[var(--ink)]">{value}</p>
      <p className="t-meta">{label}</p>
    </div>
  );
}

function Shell({ goBack, eyebrow, headline, body, children }: { goBack: () => void; eyebrow: string; headline: string; body?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero backIcon={<ArrowLeft className="size-5" />} onBack={goBack} eyebrow={eyebrow} headline={headline} body={body} trailingIcons={<Calendar className="size-4 text-white/70" />} />
        <main className="space-y-4 px-5 pt-5">{children}</main>
      </div>
    </div>
  );
}

function Loader() {
  return <div className="flex items-center justify-center gap-2 py-10 text-[var(--mute)]"><Loader2 className="size-4 animate-spin" /> Loading…</div>;
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
