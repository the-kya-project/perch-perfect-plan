import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronDown, X } from "lucide-react";
import { fetchBirdList } from "@/lib/birdListSelect";
import { useMyPermissions } from "@/lib/useCapability";
import { useHealthHistory, filterEntries, type Who, type EntryType } from "@/lib/healthHistory";
import { rangeTo, sitTitle } from "@/lib/sitText";
import { K, KyaPage, KyaHeader, KyaBody, KyaHeading, KyaIconButton, KyaLink } from "@/components/kya";
import { EntryDays, sitCaregiverName, type EntryContext } from "@/components/HealthEntries";

// Every daily check and weight for the owner's birds, newest first, with
// filters for who logged it, the bird, the type, and (from a sit card) one sit.
const historySearch = z.object({
  sitId: z.string().uuid().optional(),
  who: z.enum(["everyone", "you", "sitters"]).optional(),
  bird: z.string().uuid().optional(),
  type: z.enum(["all", "checks", "weights"]).optional(),
});

export const Route = createFileRoute("/_authenticated/scans/history")({
  head: () => ({ meta: [{ title: i18next.t("healthHistory.metaTitle", "Health history — Kya & Co.") }] }),
  validateSearch: historySearch,
  component: HealthHistoryPage,
});

const PAGE = 30;

function HealthHistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: "/scans/history" });
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const search = Route.useSearch();
  const who: Who = search.who ?? "everyone";
  const type: EntryType = search.type ?? "all";
  const myId = useMyPermissions().data?.myId;
  const [shown, setShown] = useState(PAGE);
  const [limit, setLimit] = useState(300);

  const { data: birdsRaw } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await fetchBirdList();
      if (error) throw error;
      return data ?? [];
    },
  });
  const birds = ((birdsRaw ?? []) as any[]).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const { data: hist, isLoading, isError } = useHealthHistory(birds.map((b) => b.id), myId, limit);

  const sits = hist?.sits ?? [];
  const names = hist?.names ?? {};
  const ctx: EntryContext = {
    birdName: (id) => birds.find((b) => b.id === id)?.name ?? t("healthTab.yourBird", "Your bird"),
    sits, names, myId,
  };
  const filtered = filterEntries(hist?.entries ?? [], { who, type, birdId: search.bird ?? null, sitId: search.sitId ?? null }, myId);
  const visible = filtered.slice(0, shown);
  const canLoadMore = filtered.length > shown || !!hist?.more;
  const filterSit = search.sitId ? sits.find((s) => s.id === search.sitId) : undefined;

  const set = (patch: Partial<z.infer<typeof historySearch>>) => {
    setShown(PAGE);
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });
  };
  const loadOlder = () => {
    if (filtered.length <= shown && hist?.more) setLimit((l) => l + 300);
    setShown((n) => n + PAGE);
  };
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/scans" }));

  const whoOptions: { key: Who; label: string }[] = [
    { key: "everyone", label: t("healthHistory.everyone", "Everyone") },
    { key: "you", label: t("healthHistory.you", "You") },
    { key: "sitters", label: t("healthHistory.sitters", "Sitters") },
  ];

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <KyaHeader>
          <div className="mt-1.5">
            <KyaIconButton label={t("healthHistory.back", "Back")} onClick={goBack}><ArrowLeft className="size-5" /></KyaIconButton>
          </div>
          <KyaHeading as="h1" size={30} className="mt-5 text-white">{t("healthHistory.title", "Health history")}</KyaHeading>
          <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>
            {t("healthHistory.body", "Every daily check and weight, by everyone who cares for your birds.")}
          </p>
        </KyaHeader>

        <KyaBody className="gap-4">
          {/* Who */}
          <div role="radiogroup" aria-label={t("healthHistory.whoLabel", "Who")} className="grid grid-cols-3 gap-1 rounded-full bg-white p-1">
            {whoOptions.map((o) => {
              const on = who === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => set({ who: o.key === "everyone" ? undefined : o.key })}
                  className="min-h-[44px] rounded-full text-[15px] font-[700]"
                  style={on ? { background: K.forest, color: "#fff" } : { color: K.forest }}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          {/* Bird + type: each pill as wide as its current choice. */}
          <div className="flex flex-wrap gap-2">
            <PillSelect
              label={t("healthHistory.birdLabel", "Bird")}
              value={search.bird ?? ""}
              onChange={(v) => set({ bird: v || undefined })}
              options={[{ value: "", label: t("healthHistory.allBirds", "All birds") }, ...birds.map((b) => ({ value: b.id as string, label: b.name as string }))]}
            />
            <PillSelect
              label={t("healthHistory.typeLabel", "Type")}
              value={type}
              onChange={(v) => set({ type: v === "all" ? undefined : (v as EntryType) })}
              options={[
                { value: "all", label: t("healthHistory.typeEverything", "Everything") },
                { value: "checks", label: t("healthHistory.typeChecks", "Daily checks") },
                { value: "weights", label: t("healthHistory.typeWeights", "Weights") },
              ]}
            />
          </div>

          {search.sitId && (
            <div>
              <button
                type="button"
                onClick={() => set({ sitId: undefined })}
                className="inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full px-4 text-[14px] font-[700]"
                style={{ background: K.paleGreen, color: K.forest }}
                aria-label={t("healthHistory.clearSit", "Clear the sit filter")}
              >
                <span className="truncate">
                  {filterSit
                    ? `${sitTitle(t, {}, sitCaregiverName(t, filterSit, names))} · ${rangeTo(t, filterSit.start_date, filterSit.end_date)}`
                    : t("healthHistory.thisSit", "This sit")}
                </span>
                <X className="size-4 shrink-0" />
              </button>
            </div>
          )}

          {isError && !hist ? (
            <p className="m-0 px-1 py-4 text-[15px]" style={{ color: K.quiet }}>{t("healthTab.loadError", "We couldn't load your health history. Try again in a moment.")}</p>
          ) : isLoading && !hist ? (
            <p className="m-0 px-1 text-[14px]" style={{ color: K.quiet }}>{t("healthTab.loading", "Loading…")}</p>
          ) : visible.length === 0 ? (
            <p className="m-0 px-1 py-4 text-[15px]" style={{ color: K.quiet }}>{t("healthTab.nothingYet", "Nothing here yet.")}</p>
          ) : (
            <>
              <EntryDays entries={visible} ctx={ctx} />
              {canLoadMore && (
                <div className="flex justify-center">
                  <KyaLink onClick={loadOlder}>{t("healthHistory.loadOlder", "Load older entries")}</KyaLink>
                </div>
              )}
            </>
          )}
        </KyaBody>
      </div>
    </KyaPage>
  );
}

/** A white 44px pill with a down chevron, as wide as the chosen option. The
 *  native select sits invisibly on top (it still opens the system picker and
 *  takes focus); the pill underneath shows the current label, so it sizes to
 *  that text instead of the longest option. */
function PillSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const current = options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "";
  return (
    <label
      className="relative inline-flex min-h-[44px] max-w-full items-center gap-2 rounded-full bg-white py-2 pl-4 pr-3.5 text-[15px] font-[700] focus-within:ring-2"
      style={{ color: K.forest }}
    >
      <span className="sr-only">{label}</span>
      <span className="truncate" aria-hidden="true">{current}</span>
      <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full opacity-0"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
