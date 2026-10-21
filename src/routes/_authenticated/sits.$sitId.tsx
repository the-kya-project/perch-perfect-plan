import { createFileRoute, Link, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Activity, Scale, BookOpen, CheckSquare, Image as ImageIcon, Loader2, Home, AlertTriangle,
} from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaLink, KyaIconTile } from "@/components/kya";
import { PageHeader } from "@/components/headers";
import { rangeTo, sitTitle } from "@/lib/sitText";
import { durationDays } from "@/lib/dates";
import { useServerFn } from "@tanstack/react-start";
import { resolveHouseholdNames } from "@/lib/home.functions";
import { memberDisplayName } from "@/lib/memberDisplay";
import { useHouseholdCapability, useMyPermissions } from "@/lib/useCapability";
import { formatLocalDateTime } from "@/lib/dates";
import { friendlyError } from "@/lib/errorMessage";
import { localDateISO } from "@/lib/localDay";
import { renderDerivedTask } from "@/lib/routineTaskRender";
import type { DerivedTask } from "@/lib/derivedTasks";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

// Past Sits detail view — the sit's own activity feed, derived strictly from
// sit_id attribution on the logs that ran inside the window. Reachable from a
// SitCard "Activity" link; owner-only (RLS on sits enforces). Read-only.
export const Route = createFileRoute("/_authenticated/sits/$sitId")({
  head: () => ({ meta: [{ title: i18next.t("sitDetail.pageTitle", "Sit activity — Kya & Co.") }] }),
  component: SitDetail,
});

type Activity =
  | { kind: "scan"; id: string; at: string; status: string; reasons: string | null; bird_id: string }
  | { kind: "weight"; id: string; at: string; grams: number; bird_id: string }
  | { kind: "journal"; id: string; at: string; title: string; kindLabel: string | null; bird_id: string }
  | { kind: "photo"; id: string; at: string; bird_id: string }
  // label = stored English title (null if unknown); derived = its descriptor,
  // rendered in the UI language at display.
  | { kind: "task"; id: string; at: string; label: string | null; derived: unknown | null };

function SitDetail() {
  const { t } = useTranslation();
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
      const personIds = [sit.caregiver_user_id].filter(Boolean) as string[];
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
        supabase.from("task_completions").select("id, routine_task_id, completed_at, routine_tasks(title, derived)").eq("sit_id", sitId).order("completed_at", { ascending: false }),
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
        ...((journalRes.data ?? []) as any[]).map((r) => ({ kind: "journal" as const, id: r.id, at: r.created_at, title: r.title ?? i18next.t("sitDetail.journalEntry", "Journal entry"), kindLabel: r.kind ?? null, bird_id: r.bird_id })),
        ...((photosRes.data ?? []) as any[]).map((r) => ({ kind: "photo" as const, id: r.id, at: r.created_at, bird_id: r.bird_id })),
        ...((completionsRes.data ?? []) as any[]).map((r) => ({ kind: "task" as const, id: r.id, at: r.completed_at, label: (r.routine_tasks?.title ?? null) as string | null, derived: r.routine_tasks?.derived ?? null })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

      return {
        sit,
        birds,
        caregiver: sit.caregiver_user_id ? { name: displayFor(sit.caregiver_user_id) } : null,
        // "In charge" = the covering caregiver (caregiver_user_id), NOT lead_user_id
        // (which is set to the OWNER for an external sitter, so it wrongly labelled
        // the owner "in charge" of an externally-sat sit). Null for external sits;
        // the external sitter is already shown as the caregiver above.
        leadName: sit.caregiver_user_id ? displayFor(sit.caregiver_user_id) : null,
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

  if (isLoading) return <Shell goBack={goBack} headline={t("sitDetail.loading", "Loading…")}><Loader /></Shell>;
  if (!data?.sit) return <Shell goBack={goBack} headline={t("sitDetail.notFoundNoDot", "Sit not found")}><KyaCard className="p-6 text-center"><p className="m-0 text-[15px]" style={{ color: K.ink }}>{t("sitDetail.notAvailable", "This sit isn't available.")}</p></KyaCard></Shell>;

  const sit = data.sit;
  // Owner ALWAYS sees delete — detected explicitly here so a slow/empty
  // permissions fetch (or a missing owner_id) can never hide it. Members need
  // manage_sits. RLS ("sits delete") enforces the same rule server-side.
  const isOwner = !!perms?.myId && perms.myId === sit.owner_id;
  const canDelete = isOwner || canManageSits;
  const today = localDateISO();
  // Active = a sitter is currently covering: live window (today between the
  // dates) and not revoked. Deleting one mid-sit pulls coverage out from under them.
  const isActiveSit = !sit.revoked && sit.start_date <= today && sit.end_date >= today;

  async function deleteSit() {
    setDeleting(true);
    try {
      const { error } = await supabase.from("sits").delete().eq("id", sitId);
      if (error) throw error;
      toast.success(t("sitDetail.deleted", "Sit deleted."));
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
      toast.error(friendlyError(e, t("sitDetail.couldNotDelete", "Couldn't delete the sit.")));
      setDeleting(false);
    }
  }

  const isHousehold = !!sit.caregiver_user_id;
  const caregiver = isHousehold
    ? data.caregiver?.name ?? t("sitDetail.householdMember", "Household member")
    : sit.sitter_name?.trim() || sit.sitter_email || t("sitDetail.externalSitter", "External sitter");
  const headline = sitTitle(t, sit, caregiver);
  const days = durationDays(sit.start_date, sit.end_date);
  const sub = `${caregiver} · ${rangeTo(t, sit.start_date, sit.end_date)} · ${t("sitCards.dayCount", "{{count}} days", { count: days })}`;
  const birdById = new Map(data.birds.map((b) => [b.id, b.name]));
  const birdLabel = (id: string) => birdById.get(id) ?? t("sitDetail.aBird", "A bird");

  return (
    <Shell goBack={goBack} headline={headline} body={sub}>
      {/* Who covered, and which birds. */}
      <KyaCard className="p-4">
        <div className="flex items-center gap-3">
          {isHousehold ? (
            <span className="grid size-11 shrink-0 place-items-center rounded-[14px]" style={{ background: K.forest, color: K.lime }}><Home className="size-5" /></span>
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-full text-[15px] font-[700]" style={{ background: K.lime, color: K.forest }}>{caregiver.slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate text-[15px] font-[700]">{caregiver}</p>
            <p className="m-0 truncate text-[13px]" style={{ color: K.quiet }}>
              {isHousehold ? t("sitDetail.household", "Household") : [t("sitDetail.sitter", "Sitter"), sit.sitter_email].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {data.birds.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 pt-3" style={{ borderTop: `1px solid ${K.line}` }}>
            <span className="text-[13px]" style={{ color: K.quiet }}>{t("sitDetail.birdsCoveredLabel", "Birds")}</span>
            {data.birds.map((b) => (
              <Link key={b.id} to="/birds/$birdId" params={{ birdId: b.id }} className="inline-flex min-h-[44px] items-center rounded-full px-3.5 text-[14px] font-[700]" style={{ background: K.mist, color: K.moss }}>{b.name}</Link>
            ))}
          </div>
        )}
      </KyaCard>

      {/* What happened, in numbers */}
      <KyaCard>
        <div className="grid grid-cols-5">
          <SummaryTile label={t("sitDetail.healthChecks", "Health checks")} value={data.counts.scans} />
          <SummaryTile label={t("sitDetail.weights", "Weights")} value={data.counts.weights} />
          <SummaryTile label={t("sitDetail.journal", "Journal")} value={data.counts.journals} />
          <SummaryTile label={t("sitDetail.photos", "Photos")} value={data.counts.photos} />
          <SummaryTile label={t("sitDetail.tasks", "Tasks")} value={data.counts.tasks} />
        </div>
      </KyaCard>

      <KyaCard>
        <KyaHeading size={21} className="px-4 pb-1 pt-4">{t("sitDetail.activity", "Activity")}</KyaHeading>
        {data.activity.length === 0 ? (
          <p className="m-0 px-4 pb-4 pt-1 text-[15px]" style={{ color: K.quiet }}>{t("sitDetail.noActivity", "No activity logged during this sit.")}</p>
        ) : (
          data.activity.map((a, i) => (
            <ActivityRow key={`${a.kind}-${a.id}`} a={a} last={i === data.activity.length - 1} birdLabel={birdLabel} />
          ))
        )}
      </KyaCard>

      {/* Delete — owner (always) or a manage_sits member (RLS enforces the same). */}
      {canDelete && (
        <div className="px-1">
          {confirmingDelete ? (
            <div className="rounded-[16px] p-3.5" style={{ background: "#fcebeb" }}>
              {isActiveSit && (
                <p className="m-0 mb-2 flex items-start gap-2 text-[14px] font-[700]" style={{ color: K.red }}>
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  {t("sitDetail.activeWarning", "This sit is active right now — a sitter is covering. Deleting it ends their access immediately.")}
                </p>
              )}
              <p className="m-0 text-[14px] leading-[1.5]">
                {t("sitDetail.deleteConfirmChecks", "Delete this sit? This can't be undone. Logs recorded during it (daily checks, weights, and photos) are kept but no longer tied to the sit; its checklist and task completions are removed.")}
              </p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={deleteSit} disabled={deleting} className="min-h-[48px] flex-1 rounded-full px-4 text-[15px] font-[700] text-white disabled:opacity-50" style={{ background: K.red }}>
                  {deleting ? t("sitDetail.deleting", "Deleting…") : t("sitDetail.deleteSit", "Delete sit")}
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting} className="min-h-[48px] rounded-full border-2 bg-white px-5 text-[15px] font-[700] disabled:opacity-50" style={{ borderColor: K.forest, color: K.forest }}>{t("sitDetail.keep", "Keep")}</button>
              </div>
            </div>
          ) : (
            <KyaLink color={K.red} onClick={() => setConfirmingDelete(true)}>{t("sitDetail.deleteThisSit", "Delete this sit")}</KyaLink>
          )}
        </div>
      )}
    </Shell>
  );
}

function ActivityRow({ a, last, birdLabel }: { a: Activity; last: boolean; birdLabel: (id: string) => string }) {
  const { t, i18n } = useTranslation();
  const when = fmtWhen(a.at);
  if (a.kind === "scan") {
    const triage = a.status === "red" || a.status === "yellow";
    return (
      <Row last={last} leading={<KyaIconTile tone={triage ? "amber" : "forest"}><Activity className="size-[18px]" /></KyaIconTile>}
        title={a.status === "red"
          ? t("sitDetail.scanConcern", "{{bird}} · health check — concern flagged", { bird: birdLabel(a.bird_id) })
          : a.status === "yellow"
            ? t("sitDetail.scanCheck", "{{bird}} · health check — something to check", { bird: birdLabel(a.bird_id) })
            : t("sitDetail.scanClear", "{{bird}} · health check — all clear", { bird: birdLabel(a.bird_id) })}
        subtitle={`${when}${a.reasons ? ` · ${a.reasons.replace(/ \| /g, " · ")}` : ""}`}
      />
    );
  }
  if (a.kind === "weight") {
    return (
      <Row last={last} leading={<KyaIconTile><Scale className="size-[18px]" /></KyaIconTile>}
        title={t("sitDetail.weightRow", "{{bird}} · {{grams}} g", { bird: birdLabel(a.bird_id), grams: a.grams })}
        subtitle={when}
      />
    );
  }
  if (a.kind === "journal") {
    return (
      <Row last={last} leading={<KyaIconTile><BookOpen className="size-[18px]" /></KyaIconTile>}
        title={`${birdLabel(a.bird_id)} · ${a.title}`}
        subtitle={`${a.kindLabel ? `${a.kindLabel} · ` : ""}${when}`}
      />
    );
  }
  if (a.kind === "photo") {
    return (
      <Row last={last} leading={<KyaIconTile><ImageIcon className="size-[18px]" /></KyaIconTile>}
        title={t("sitDetail.photoRow", "{{bird}} · photo", { bird: birdLabel(a.bird_id) })}
        subtitle={when}
      />
    );
  }
  // Derived tasks render in the UI language; owner-typed titles show verbatim.
  const taskLabel = a.derived
    ? renderDerivedTask(a.derived as DerivedTask, i18n.getFixedT(i18n.language, "routine"), i18n.language).title
    : (a.label ?? t("sitDetail.routineTask", "Routine task"));
  return (
    <Row last={last} leading={<KyaIconTile><CheckSquare className="size-[18px]" /></KyaIconTile>}
      title={t("sitDetail.taskComplete", "Task complete — {{label}}", { label: taskLabel })}
      subtitle={when}
    />
  );
}

function Row({ leading, title, subtitle, last }: { leading: React.ReactNode; title: string; subtitle: string; last: boolean }) {
  return (
    <div className="flex min-h-[60px] items-center gap-3 px-4 py-2.5" style={{ borderBottom: last ? undefined : `1px solid ${K.line}` }}>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[15px] font-[600]">{title}</p>
        <p className="m-0 truncate text-[13px]" style={{ color: K.quiet }}>{subtitle}</p>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-1 py-3.5 text-center">
      <p className="m-0 text-[20px] font-[700]">{value}</p>
      <p className="m-0 text-[11.5px] leading-[1.25]" style={{ color: K.quiet }}>{label}</p>
    </div>
  );
}

function Shell({ goBack, headline, body, children }: { goBack: () => void; headline: string; body?: string; children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <PageHeader onBack={goBack} title={headline} line={body} />
        <KyaBody>{children}</KyaBody>
      </div>
    </KyaPage>
  );
}

function Loader() {
  const { t } = useTranslation();
  return <div className="flex items-center justify-center gap-2 py-10 text-[15px]" style={{ color: K.quiet }}><Loader2 className="size-4 animate-spin" /> {t("sitDetail.loading", "Loading…")}</div>;
}

function fmtWhen(iso: string): string {
  return formatLocalDateTime(new Date(iso), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
