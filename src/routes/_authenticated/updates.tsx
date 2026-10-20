import { createFileRoute, useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import i18next, { type TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Check, ClipboardList, Scale, Users } from "lucide-react";
import { K, KyaPage, KyaHeader, KyaBody, KyaCard, KyaGroupLabel, KyaIconTile, KyaLink, KyaBackRow, KyaTitle } from "@/components/kya";
import { useUpdates, type Update } from "@/lib/updates";
import { noticedItems } from "@/lib/dailyCheckLabels";
import { namesAsCount } from "@/lib/birdNames";
import { formatLocalDate, formatLocalTime, monthDay } from "@/lib/dates";
import { localDateISO } from "@/lib/localDay";
import { sitTitle } from "@/lib/sitText";

// The bell: what's happened with your birds (see src/lib/updates.ts for where
// each update comes from).
export const Route = createFileRoute("/_authenticated/updates")({
  head: () => ({ meta: [{ title: i18next.t("updates.metaTitle", "Updates — Kya & Co.") }] }),
  component: UpdatesPage,
});

function when(t: TFunction, iso: string): string {
  const d = new Date(iso);
  const today = localDateISO();
  const day = localDateISO(d);
  if (day === today) return formatLocalTime(d, { hour: "numeric", minute: "2-digit" });
  if (day === localDateISO(new Date(Date.now() - 86_400_000))) return t("updates.yesterday", "Yesterday");
  return formatLocalDate(d, { month: "short", day: "numeric" });
}

function joinNames(t: TFunction, names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return t("updates.joinAnd", "{{list}} and {{last}}", { list: names.slice(0, -1).join(", "), last: names[names.length - 1] });
}

function copy(t: TFunction, u: Update): { title: string; detail: string } {
  const sitter = u.sitterName || t("updates.yourSitter", "Your sitter");
  const bird = u.birdNames?.[0] || t("updates.yourBird", "your bird");
  const time = when(t, u.at);
  switch (u.kind) {
    case "flag": {
      const what = noticedItems(t, u.reasonCodes);
      return {
        title: t("updates.flagTitle", "{{sitter}} flagged something on {{bird}}'s check", { sitter, bird }),
        detail: [what, time].filter(Boolean).join(" · "),
      };
    }
    case "finished": {
      const isToday = localDateISO(new Date(u.at)) === localDateISO();
      const n = u.birdNames?.length ?? 0;
      return {
        title: isToday
          ? t("updates.finishedToday", "{{sitter}} finished today's checks", { sitter })
          : t("updates.finishedDay", "{{sitter}} finished the day's checks", { sitter }),
        detail: [t("updates.nBirds", "{{count}} birds", { count: n }), t("updates.nWeights", "{{count}} weights", { count: u.weights ?? 0 }), time].join(" · "),
      };
    }
    case "weigh": {
      const names = u.birdNames ?? [];
      const title = names.length === 1
        ? t("updates.weighOne", "{{bird}} is due for a weigh-in", { bird: names[0] })
        : namesAsCount(names)
          ? t("updates.weighCount", "{{count}} birds are due for a weigh-in", { count: names.length })
          : t("updates.weighMany", "{{names}} are due for a weigh-in", { names: joinNames(t, names) });
      return { title, detail: t("updates.dueSince", "Due since {{when}}", { when: time }) };
    }
    case "careplan": {
      const sit = u.sitterName ? sitTitle(t, {}, u.sitterName) : t("updates.theSit", "the sit");
      return {
        title: t("updates.careplanTitle", "Review {{bird}}'s care plan before {{sit}}", { bird, sit }),
        detail: u.sitStart ? t("updates.sitStarts", "The sit starts {{date}}", { date: monthDay(u.sitStart) }) : time,
      };
    }
    case "joined":
      return { title: t("updates.joinedTitle", "{{name}} joined your household", { name: u.memberName || t("updates.someone", "Someone") }), detail: time };
  }
}

function Tile({ kind }: { kind: Update["kind"] }) {
  if (kind === "flag") {
    return (
      <KyaIconTile tone="amber">
        <span className="grid size-[20px] place-items-center rounded-full border-2 text-[11px] font-[800] leading-none" style={{ borderColor: K.amberText }}>!</span>
      </KyaIconTile>
    );
  }
  if (kind === "weigh") return <KyaIconTile tone="mist"><Scale className="size-5" /></KyaIconTile>;
  if (kind === "careplan") return <KyaIconTile><ClipboardList className="size-5" /></KyaIconTile>;
  if (kind === "joined") return <KyaIconTile><Users className="size-5" /></KyaIconTile>;
  return <KyaIconTile><Check className="size-5" strokeWidth={2.8} /></KyaIconTile>;
}

function UpdatesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = useNavigate();
  const canGoBack = useCanGoBack();
  const { items, loading, isRead, markRead, markAllRead, unread } = useUpdates();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/dashboard" }));

  const open = (u: Update) => {
    markRead(u.id);
    switch (u.kind) {
      case "flag": return navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId: u.birdId!, scanId: u.scanId! } });
      case "finished": return navigate({ to: "/scans/history", search: { sitId: u.sitId } });
      case "weigh": return navigate({ to: "/check", search: u.birdId ? { bird: u.birdId } : {} });
      case "careplan": return u.birdId ? navigate({ to: "/birds/$birdId/plan", params: { birdId: u.birdId } }) : navigate({ to: "/sits" });
      case "joined": return navigate({ to: "/household" });
    }
  };

  const fresh = items.filter((u) => !isRead(u));
  const earlier = items.filter((u) => isRead(u));

  const group = (label: string, list: Update[]) => list.length > 0 && (
    <section className="flex flex-col gap-2">
      <KyaGroupLabel>{label}</KyaGroupLabel>
      <KyaCard>
        {list.map((u, i) => {
          const c = copy(t, u);
          const unreadRow = !isRead(u);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => open(u)}
              className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-black/[0.03]"
              style={{ borderBottom: i === list.length - 1 ? undefined : `1px solid ${K.line}`, color: K.forest }}
            >
              <Tile kind={u.kind} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-[15px] font-[700] leading-[1.3]">{c.title}</span>
                <span className="mt-0.5 block truncate text-[13px]" style={{ color: K.quiet }}>{c.detail}</span>
              </span>
              {unreadRow && <span className="size-2.5 shrink-0 rounded-full" style={{ background: K.sunflower }} aria-label={t("updates.unread", "Unread")} />}
            </button>
          );
        })}
      </KyaCard>
    </section>
  );

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <KyaHeader>
          <KyaBackRow
            label={t("updates.back", "Back")}
            onBack={goBack}
            right={unread > 0 ? (
              <button type="button" onClick={markAllRead} className="inline-flex min-h-[44px] items-center px-1 text-[15px] font-[700]" style={{ color: K.lime }}>
                {t("updates.markAllRead", "Mark all read")}
              </button>
            ) : undefined}
          />
          <KyaTitle title={t("updates.title", "Updates")} line={t("updates.line", "What's happened with your birds while you weren't looking.")} />
        </KyaHeader>
        <KyaBody className="gap-5">
          {loading ? (
            <p className="m-0 px-1 text-[14px]" style={{ color: K.quiet }}>{t("updates.loading", "Loading…")}</p>
          ) : items.length === 0 ? (
            <p className="m-0 px-1 py-4 text-[15px]" style={{ color: K.quiet }}>{t("updates.caughtUp", "You're all caught up.")}</p>
          ) : (
            <>
              {group(t("updates.new", "New"), fresh)}
              {group(t("updates.earlier", "Earlier"), earlier)}
            </>
          )}
          <div className="flex justify-center">
            <KyaLink onClick={() => navigate({ to: "/scans/settings" })}>{t("updates.notificationSettings", "Notification settings")}</KyaLink>
          </div>
        </KyaBody>
      </div>
    </KyaPage>
  );
}
