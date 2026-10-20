import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronUp } from "lucide-react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { fetchBirdList } from "@/lib/birdListSelect";
import { useMyPermissions } from "@/lib/useCapability";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useDailyCheckToday } from "@/lib/dailyCheck";
import { DailyCheckCard } from "@/components/DailyCheckCard";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { speciesLabel } from "@/lib/speciesLabel";
import { track } from "@/lib/analytics";

// Flock check — weigh & check every bird on one page. Reached from the Home
// prompt when an owner has two or more birds. One accordion section per bird;
// saving one opens the next bird not yet checked today.
export const Route = createFileRoute("/_authenticated/check")({
  head: () => ({ meta: [{ title: i18next.t("flockCheck.metaTitle", "Flock check — Kya & Co.") }] }),
  component: FlockCheck,
});

type Bird = { id: string; name: string; species: string | null; photo_url: string | null; photo_position: string | null; owner_id: string; is_foster?: boolean };

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

function FlockCheck() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const goBack = () => (canGoBack ? router.history.back() : navigate({ to: "/dashboard" }));

  const { data: allBirds } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await fetchBirdList();
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: perms } = useMyPermissions();
  const myId = perms?.myId ?? null;
  // Same set as the Home prompt: the viewer's own flock, then fosters.
  const birds = useMemo(() => {
    if (!allBirds || !myId) return [];
    const own = (allBirds as Bird[]).filter((b) => b.owner_id === myId);
    return [...own.filter((b) => !b.is_foster), ...own.filter((b) => b.is_foster)].map((b) => ({
      ...b,
      color: "#adbca7", // sage tile behind a missing or loading photo
      speciesText: b.species ? speciesLabel(t, b.species) : null,
    }));
  }, [allBirds, myId, t]);
  // 800px, the same width every other bird tile uses: a smaller transform crops
  // to a different aspect and the photo comes out zoomed in (see BirdPhotoCrop).
  const photoOf = useBirdPhotos(birds.map((b) => b.photo_url), 800);
  const { data: today } = useDailyCheckToday(birds.map((b) => b.id));

  // Birds saved on this page, so "next" works before the refetch lands.
  const [savedHere, setSavedHere] = useState<Set<string>>(new Set());
  const isDone = (id: string) => savedHere.has(id) || !!today?.[id]?.check;
  const [openId, setOpenId] = useState<string | null>(null);
  const started = useRef(Date.now());
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current || !today || birds.length === 0) return;
    initialised.current = true;
    setOpenId(birds.find((b) => !today[b.id]?.check)?.id ?? null);
  }, [today, birds]);

  const nextAfter = (id: string) => {
    const i = birds.findIndex((b) => b.id === id);
    const order = [...birds.slice(i + 1), ...birds.slice(0, i)];
    return order.find((b) => !isDone(b.id)) ?? null;
  };

  const doneCount = birds.filter((b) => isDone(b.id)).length;
  const allDone = birds.length > 0 && doneCount === birds.length;

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-nav text-[#1a3d2e]">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md flex-col gap-2.5 px-5 pt-safe pb-3">
          <div className="flex items-center gap-3">
            <button type="button" onClick={goBack} aria-label={t("flockCheck.back", "Back")} className="-ml-2 grid size-9 place-items-center text-[#1a3d2e]">
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="min-w-0 flex-1 text-[16px] font-[500]">{t("flockCheck.title", "Daily health check · all birds")}</h1>
            {birds.length > 0 && <span className="text-[12px] text-[#5b6b61]">{t("flockCheck.progress", "{{done}} of {{total}} done", { done: doneCount, total: birds.length })}</span>}
          </div>
          {birds.length > 0 && (
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${birds.length}, minmax(0, 1fr))` }} role="img" aria-label={t("flockCheck.progressAria", "{{done}} of {{total}} birds checked", { done: doneCount, total: birds.length })}>
              {birds.map((b) => {
                const c = today?.[b.id]?.check;
                const bg = isDone(b.id)
                  ? (c?.triage_status === "red" ? "#a32d2d" : c?.triage_status === "yellow" ? "#c47e1e" : "#2d6a4f")
                  : openId === b.id ? "#1a3d2e" : "#e0d8c4";
                return <span key={b.id} className="h-[5px] rounded-full" style={{ background: bg }} />;
              })}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-md flex-col gap-2.5 px-5 pb-6 pt-3.5">
        {birds.map((b) => {
          const open = openId === b.id;
          const done = isDone(b.id);
          const d = today?.[b.id];
          const check = d?.check;
          const photo = photoOf(b.photo_url);
          const next = nextAfter(b.id);
          const flagged = !!check && check.triage_status !== "green";
          const w = d?.weights[0];
          const summary = done
            ? [
                w ? t("flockCheck.grams", "{{n}} g", { n: w.grams }) : null,
                flagged
                  ? (check?.triage_status === "red" ? t("flockCheck.concerning", "Concerning") : t("flockCheck.somethingToCheck", "Something to check"))
                  : t("flockCheck.normal", "Health check normal"),
                check ? timeLabel(check.created_at) : null,
              ].filter(Boolean).join(" · ")
            : t("flockCheck.notChecked", "Not checked yet");
          const summaryColor = !done ? "#8a8270" : check?.triage_status === "red" ? "#a32d2d" : flagged ? "#854f0b" : "#5b6b61";

          if (!open) {
            return (
              <button
                key={b.id}
                type="button"
                aria-expanded={false}
                onClick={() => setOpenId(b.id)}
                className="flex w-full items-center gap-3 rounded-[16px] border-0 bg-white px-3.5 py-3 text-left"
                style={{ boxShadow: "0 0 0 1px #eee6d4, 0 6px 14px -8px rgba(40,50,40,.08)" }}
              >
                <span className="relative size-10 shrink-0 overflow-hidden rounded-[12px]" style={{ background: b.color }}>
                  {photo ? <BirdPhotoCrop url={photo.url} original={photo.original} position={b.photo_position} alt="" /> : <span className="grid size-full place-items-center text-[15px] font-[500] text-white/90">{b.name.slice(0, 1).toUpperCase()}</span>}
                  {done && (
                    <span className="absolute inset-0 grid place-items-center bg-black/10">
                      <span className="grid size-5 place-items-center rounded-full text-[12px] font-[500] text-white" style={{ background: flagged ? "#c47e1e" : "#2d6a4f" }}>
                        {flagged ? "!" : <Check className="size-3" strokeWidth={3} />}
                      </span>
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-[500]">{b.name}</span>
                  <span className="mt-px block truncate text-[12px]" style={{ color: summaryColor }}>{summary}</span>
                </span>
                <span className="text-[13px] font-[500] text-[#2d6a4f]">{done ? t("flockCheck.view", "View") : t("flockCheck.start", "Start")}</span>
              </button>
            );
          }

          return (
            <section key={b.id} className="flex flex-col gap-3.5 rounded-[22px] bg-[#cdeab0] p-[18px]" style={{ boxShadow: "0 10px 24px -12px rgba(45,106,79,.5)" }}>
              <button type="button" aria-expanded onClick={() => setOpenId(null)} className="flex items-center gap-3 border-0 bg-transparent p-0 text-left text-inherit">
                <span className="relative size-[52px] shrink-0 overflow-hidden rounded-[15px]" style={{ background: b.color }} aria-hidden="true">
                  {photo ? <BirdPhotoCrop url={photo.url} original={photo.original} position={b.photo_position} alt="" eager /> : <span className="grid size-full place-items-center text-[18px] font-[500] text-white/90">{b.name.slice(0, 1).toUpperCase()}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[22px] font-[400] tracking-[-0.01em]">{b.name}</span>
                  {(b.speciesText || d?.lastGrams != null) && (
                    <span className="mt-px block truncate text-[12px] text-[#2b3a31]">
                      {[b.speciesText, d?.lastGrams != null ? t("flockCheck.lastWeight", "last {{n}} g", { n: d.lastGrams }) : null].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <ChevronUp className="size-[18px]" />
              </button>
              <DailyCheckCard
                birdId={b.id}
                name={b.name}
                today={d}
                surface="flock"
                showHeading={done}
                flat
                saveLabel={!done && next ? t("flockCheck.saveNext", "Save · next: {{name}}", { name: next.name }) : undefined}
                onSaved={(r) => {
                  const after = new Set(savedHere).add(b.id);
                  setSavedHere(after);
                  const remaining = birds.filter((x) => !after.has(x.id) && !today?.[x.id]?.check);
                  if (remaining.length === 0) {
                    track("flock_check_completed", { bird_count: birds.length, duration_s: Math.round((Date.now() - started.current) / 1000) });
                  }
                  // Stay on a bird whose check needs attention or whose weight
                  // didn't save, so the message isn't collapsed out of view.
                  if (r.triage.status !== "green" || (!r.weightSaved && r.weightError)) return;
                  setOpenId(remaining.length === 0 ? null : next?.id ?? null);
                }}
              />
            </section>
          );
        })}

        {allDone && (
          <div className="flex items-center gap-3 rounded-[18px] bg-white p-4" style={{ boxShadow: "0 0 0 1px #eee6d4" }}>
            <span className="grid size-[38px] shrink-0 place-items-center rounded-[11px] bg-[#1a3d2e] text-[#cdeab0]"><Check className="size-5" strokeWidth={2.4} /></span>
            <span className="flex-1 text-[14px] leading-[1.45]"><b className="font-[500]">{t("flockCheck.allDone", "Every bird is checked.")}</b> {t("flockCheck.seeYouTomorrow", "See you tomorrow.")}</span>
          </div>
        )}
        {birds.length > 0 && <p className="mt-0.5 text-center text-[11.5px] text-[#8a8270]">{t("flockCheck.savesAsYouGo", "Each bird saves as soon as you finish it.")}</p>}
      </main>
    </div>
  );
}
