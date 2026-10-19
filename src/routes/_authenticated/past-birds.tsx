import { createFileRoute, Link, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPastBirds } from "@/lib/handoff.functions";
import { ArrowLeft, Feather, Loader2 } from "lucide-react";
import { InkHero, Card, IconTile, StatusPill, PrimaryButton } from "@/components/system";
import { formatLocalDate } from "@/lib/dates";
import i18next from "i18next";
import { useTranslation } from "react-i18next";

// Past birds archive — read-only, sender-side memory of birds handed off.
// Snapshots only (not linked to live records). Newest departures first.
export const Route = createFileRoute("/_authenticated/past-birds")({
  head: () => ({ meta: [{ title: i18next.t("pastBirds.metaTitle", "Past birds — Kya & Co.") }] }),
  component: PastBirds,
});

function PastBirds() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/account" }));

  const getBirds = useServerFn(getPastBirds);
  const { data, isLoading } = useQuery({ queryKey: ["past-birds"], queryFn: () => getBirds() });
  const birds = data?.birds ?? [];

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          eyebrow={t("pastBirds.eyebrow", "Past birds")}
          headline={t("pastBirds.headline", "Past birds")}
        />

        <main className="space-y-4 px-5 pt-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 t-meta">
              <Loader2 className="size-4 animate-spin" /> {t("pastBirds.loading", "Loading…")}
            </div>
          ) : birds.length === 0 ? (
            <Card className="p-8 text-center">
              <IconTile tone="pale" icon={<Feather className="size-5" />} />
              <p className="mt-3 t-body">{t("pastBirds.empty", "No past birds yet. When you hand off a bird, a memory of them will live here.")}</p>
              <div className="mt-4">
                <Link to="/dashboard">
                  <PrimaryButton tone="ink" full={false}>{t("pastBirds.backToFlock", "Back to your flock")}</PrimaryButton>
                </Link>
              </div>
            </Card>
          ) : (
            <>
              <Card>
                {birds.map((b: any, i: number) => (
                  <PastBirdCard key={b.id} bird={b} last={i === birds.length - 1} />
                ))}
              </Card>
              <p className="px-1 pt-2 text-center t-meta leading-relaxed">
                {t("pastBirds.footer", "Their full records went with them. These are your keepsakes: who they were and where they went.")}
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// Static keepsake card — everything shows on the card itself (no tap target, no
// detail view). Text wraps freely so the dates and destination are never clipped.
function PastBirdCard({ bird: b, last }: { bird: any; last: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={`px-4 py-3.5 ${last ? "" : "border-b border-[var(--line2)]"}`}>
      <div className="flex items-start gap-3">
        {b.photo_thumb ? (
          <img src={b.photo_thumb} alt="" className="size-10 shrink-0 rounded-full object-cover ring-1 ring-[var(--line2)]" />
        ) : (
          <IconTile tone="pale" icon={<Feather className="size-5" />} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="t-item">{b.bird_name}</span>
            {b.was_foster && <StatusPill tone="good">{t("pastBirds.foster", "Foster")}</StatusPill>}
          </div>
          {b.species && <p className="t-meta mt-0.5">{b.species}</p>}
          <div className="mt-2 space-y-0.5">
            <p className="t-meta leading-relaxed">{withYouLabel(b.intake_date, b.departed_on)}</p>
            <p className="t-meta leading-relaxed">{whereLabel(b)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Where they went — from the sender's own handoff record (they entered the
// recipient's name), so it's safe to show back to them.
function whereLabel(b: any): string {
  const date = fmt(b.departed_on);
  if (b.recipient_name) return i18next.t("pastBirds.foundHomeWith", "Found a home with {{name}} on {{date}}", { name: b.recipient_name, date });
  if (b.mode === "pdf") return i18next.t("pastBirds.leftAsPdf", "Left as a PDF handoff on {{date}}", { date });
  return i18next.t("pastBirds.foundNewHome", "Found a new home on {{date}}", { date });
}
function withYouLabel(intake: string | null, departed: string): string {
  return intake
    ? i18next.t("pastBirds.withYouFromTo", "With you from {{from}} to {{to}}", { from: fmt(intake), to: fmt(departed) })
    : i18next.t("pastBirds.withYouUntil", "With you until {{date}}", { date: fmt(departed) });
}
function fmt(iso: string): string {
  return formatLocalDate(new Date(iso), { year: "numeric", month: "short", day: "numeric" });
}
