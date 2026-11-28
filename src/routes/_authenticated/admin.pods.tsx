import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaBackRow, KyaBody, KyaHeader, KyaPage, KyaTitle } from "@/components/kya";
import { AdminOnly } from "@/components/flock/AdminOnly";
import { ConfirmSheet } from "@/components/flock/PostParts";
import { podRefusalLine, podTitle } from "@/components/flock/PodParts";
import { FLOCK_ENABLED_QUERY } from "@/lib/flock";
import { useIsAdmin } from "@/lib/flockData";
import {
  POD_MAX, adminDissolvePod, adminMovePodMember, podRefusal, useAdminPodMembers, useAdminPodWaits, useAdminPods, useInvalidatePods,
  type AdminPodRow, type PodStatus,
} from "@/lib/flockPods";
import { chapterName } from "@/lib/flockNav";

// Buddy pods, for admins (backlog 1.11): how many are waiting on each
// journey, then every pod (open ones first). Opening one lists its members,
// with Move (to another open pod on the same journey, with room) and Dissolve
// pod. Not in the mockup; laid out like the other admin lists. Behind the
// Flock gate, then admins only (the database refuses everyone else).
export const Route = createFileRoute("/_authenticated/admin/pods")({
  head: () => ({ meta: [{ title: "Buddy pods — Kya & Co." }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => <AdminOnly><AdminPods /></AdminOnly>,
});

function statusLabel(t: TFunction, s: PodStatus): string {
  switch (s) {
    case "active": return t("flock.podsAdmin.active", "Open");
    case "closed": return t("flock.podsAdmin.closed", "Closed");
    case "dissolved": return t("flock.podsAdmin.dissolved", "Dissolved");
  }
}

function day(iso: string | null, lang: string): string {
  return iso ? new Date(iso).toLocaleDateString(lang, { month: "short", day: "numeric" }) : "";
}

function AdminPods() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: isAdmin } = useIsAdmin();
  const { data: rows, isLoading, isError } = useAdminPods(isAdmin === true);
  const { data: waits } = useAdminPodWaits(isAdmin === true);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/flock/pods" })} />
        <KyaTitle title={t("flock.podsAdmin.title", "Buddy pods")} line={t("flock.podsAdmin.line", "Admin · every pod and who's waiting")} />
      </KyaHeader>
      <KyaBody>
        {(waits ?? []).length > 0 && (
          <section className="mb-4 rounded-[16px] bg-white px-3.5 py-3" data-testid="admin-pod-waits">
            <h2 className="m-0 mb-1.5 text-[14.5px] font-[700]" style={{ color: K.forest }}>{t("flock.podsAdmin.waiting", "Waiting for buddies")}</h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {(waits ?? []).map((w) => (
                <li key={w.template_slug} className="text-[14px]" style={{ color: K.ink }}>
                  {t("flock.podsAdmin.waitingRow", "{{journey}}: {{count}} waiting", { journey: w.template_name, count: w.waiting })}
                </li>
              ))}
            </ul>
          </section>
        )}
        {isLoading
          ? <div className="grid min-h-[120px] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-7 animate-spin" style={{ color: K.moss }} /></div>
          : isError
            ? <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{t("flock.podsAdmin.loadError", "We couldn't load the pods. Try again.")}</p>
            : (rows ?? []).length === 0
              ? <div className="rounded-[20px] bg-white p-5 text-[15px] leading-[1.55]" style={{ color: K.ink }} data-testid="admin-pods-empty">{t("flock.podsAdmin.empty", "No pods yet. They form on their own once 3 members on the same journey ask for buddies.")}</div>
              : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="admin-pods-list">
                  {(rows ?? []).map((r) => (
                    <li key={r.pod_id}>
                      <PodRow row={r} all={rows ?? []} open={openId === r.pod_id} onToggle={() => setOpenId(openId === r.pod_id ? null : r.pod_id)} />
                    </li>
                  ))}
                </ul>
              )}
      </KyaBody>
    </KyaPage>
  );
}

function PodRow({ row, all, open, onToggle }: { row: AdminPodRow; all: AdminPodRow[]; open: boolean; onToggle: () => void }) {
  const { t, i18n } = useTranslation();
  const invalidate = useInvalidatePods();
  const { data: members } = useAdminPodMembers(open ? row.pod_id : null);
  const [moving, setMoving] = useState<string | null>(null);
  const [dissolving, setDissolving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const live = row.status === "active";
  // Where a member can go: another open pod on the same journey, with room.
  const targets = all.filter((p) => p.pod_id !== row.pod_id && p.status === "active"
    && p.template_slug === row.template_slug && p.member_count < POD_MAX);
  const act = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setError(null);
    try { await fn(); await invalidate(); after?.(); }
    catch (e) { setError(podRefusalLine(t, podRefusal(e))); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-[16px] bg-white" style={{ color: K.forest }} data-pod={row.pod_id} data-status={row.status}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-[60px] w-full items-center gap-3 px-3.5 py-2.5 text-left">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-[700]">{podTitle(t, row)}</span>
          <span className="truncate text-[12.5px]" style={{ color: K.quiet }}>
            {[
              t("flock.pods.members", "{{count}} members", { count: row.member_count }),
              row.region_name ? chapterName(t, row.region_name) : null,
              t("flock.podsAdmin.started", "Started {{day}}", { day: day(row.created_at, i18n.language) }),
              row.last_post_at ? t("flock.podsAdmin.lastPost", "Last post {{day}}", { day: day(row.last_post_at, i18n.language) }) : null,
            ].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="rounded-full px-2.5 py-1 text-[12px] font-[700]" style={live ? { background: K.lime, color: K.forest } : { background: K.mist, color: K.forest }}>{statusLabel(t, row.status)}</span>
        {open ? <ChevronUp className="size-4 shrink-0" aria-hidden="true" /> : <ChevronDown className="size-4 shrink-0" aria-hidden="true" />}
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t px-3.5 pb-3.5 pt-2.5" style={{ borderColor: K.line }} data-testid="admin-pod-detail">
          {(members ?? []).map((m) => (
            <div key={m.user_id} className="flex flex-col gap-1.5" data-member={m.user_id}>
              <div className="flex items-center gap-2">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px] font-[700]">{m.display_name ?? t("flock.pods.member", "Member")}</span>
                  <span className="truncate text-[12.5px]" style={{ color: K.quiet }}>
                    {[m.region_name ? chapterName(t, m.region_name) : null, m.left_at ? t("flock.podsAdmin.left", "Left {{day}}", { day: day(m.left_at, i18n.language) }) : t("flock.podsAdmin.joined", "Joined {{day}}", { day: day(m.joined_at, i18n.language) }),
                      m.journey_status === "finished" ? t("flock.pods.stageLearned", "Learned it")
                        : m.journey_status === "happy_where_we_are" ? t("flock.pods.stageHappy", "Happy where we are") : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {live && !m.left_at && targets.length > 0 && (
                  <button type="button" onClick={() => setMoving(moving === m.user_id ? null : m.user_id)} data-testid="admin-pod-move"
                    className="min-h-[40px] rounded-full border px-3 text-[13.5px] font-[700]" style={{ borderColor: "#c9d3c8" }}>
                    {t("flock.podsAdmin.move", "Move")}
                  </button>
                )}
              </div>
              {moving === m.user_id && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={t("flock.podsAdmin.moveTo", "Move to")}>
                  {targets.map((p) => (
                    <button key={p.pod_id} type="button" disabled={busy} data-target={p.pod_id}
                      onClick={() => void act(() => adminMovePodMember(m.user_id, row.pod_id, p.pod_id), () => setMoving(null))}
                      className="min-h-[40px] rounded-full px-3 text-[13px] font-[700] disabled:opacity-60" style={{ background: K.mist }}>
                      {[podTitle(t, p), t("flock.pods.members", "{{count}} members", { count: p.member_count }), p.region_name ? chapterName(t, p.region_name) : null].filter(Boolean).join(" · ")}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }}>{error}</p>}
          {live && (
            <button type="button" onClick={() => setDissolving(true)} data-testid="admin-pod-dissolve"
              className="mt-1 min-h-[44px] self-start text-[14px] font-[700]" style={{ color: K.red }}>
              {t("flock.podsAdmin.dissolve", "Dissolve pod")}
            </button>
          )}
        </div>
      )}
      {dissolving && (
        <ConfirmSheet busy={busy} onClose={() => setDissolving(false)}
          title={t("flock.podsAdmin.dissolveTitle", "Dissolve this pod?")}
          line={t("flock.podsAdmin.dissolveLine", "It closes for everyone. Members can still read it, and anyone who hasn't finished is offered a new pod.")}
          confirm={t("flock.podsAdmin.dissolve", "Dissolve pod")}
          onConfirm={() => void act(() => adminDissolvePod(row.pod_id), () => setDissolving(false))} />
      )}
    </div>
  );
}
