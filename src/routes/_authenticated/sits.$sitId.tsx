import { createFileRoute, Link, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Home } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading } from "@/components/kya";
import { PageHeader } from "@/components/headers";
import { rangeTo, sitTitle } from "@/lib/sitText";
import { durationDays } from "@/lib/dates";
import { useServerFn } from "@tanstack/react-start";
import { resolveHouseholdNames } from "@/lib/home.functions";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { useDuoMode } from "@/lib/duo";
import { fetchSitDetail, useSitDelete } from "@/components/duo/sits/sitsData";
import { ActivityRow, DeleteSitControl, SummaryTile } from "@/components/duo/sits/SitActivity";
import { SitsDuo } from "@/components/duo/sits/SitsDuo";

// Past Sits detail view — the sit's own activity feed, derived strictly from
// sit_id attribution on the logs that ran inside the window. Reachable from a
// SitCard "Activity" link; owner-only (RLS on sits enforces). Read-only.
export const Route = createFileRoute("/_authenticated/sits/$sitId")({
  head: () => ({ meta: [{ title: i18next.t("sitDetail.pageTitle", "Sit activity — Kya & Co.") }] }),
  component: SitDetailRoute,
});

// iPhone Duo: the Sits two-pane screen with this sit selected.
function SitDetailRoute() {
  const { sitId } = Route.useParams();
  if (useDuoMode() === "sideways") return <SitsDuo selectedId={sitId} />;
  return <SitDetail />;
}

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
    queryFn: () => fetchSitDetail(sitId, resolveNames),
  });

  const del = useSitDelete(data?.sit ?? null);

  if (isLoading) return <Shell goBack={goBack} headline={t("sitDetail.loading", "Loading…")}><Loader /></Shell>;
  if (!data?.sit) return <Shell goBack={goBack} headline={t("sitDetail.notFoundNoDot", "Sit not found")}><KyaCard className="p-6 text-center"><p className="m-0 text-[15px]" style={{ color: K.ink }}>{t("sitDetail.notAvailable", "This sit isn't available.")}</p></KyaCard></Shell>;

  const sit = data.sit;
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
      {del.canDelete && (
        <div className="px-1">
          <DeleteSitControl del={del} />
        </div>
      )}
    </Shell>
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
