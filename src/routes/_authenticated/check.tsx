import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { fetchBirdList } from "@/lib/birdListSelect";
import { useMyPermissions } from "@/lib/useCapability";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useDailyCheckToday } from "@/lib/dailyCheck";
import { DailyCheckCard } from "@/components/DailyCheckCard";
import { track } from "@/lib/analytics";

// Flock check — weigh & check every bird on one page. Reached from the Home
// prompt when an owner has two or more birds. One accordion section per bird;
// saving one opens the next bird not yet checked today.
export const Route = createFileRoute("/_authenticated/check")({
  head: () => ({ meta: [{ title: i18next.t("flockCheck.metaTitle", "Flock check — Kya & Co.") }] }),
  component: FlockCheck,
});

type Bird = { id: string; name: string; photo_url: string | null; owner_id: string; is_foster?: boolean };

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
  const birds = useMemo<Bird[]>(() => {
    if (!allBirds || !myId) return [];
    const own = (allBirds as Bird[]).filter((b) => b.owner_id === myId);
    return [...own.filter((b) => !b.is_foster), ...own.filter((b) => b.is_foster)];
  }, [allBirds, myId]);
  const photoOf = useBirdPhotos(birds.map((b) => b.photo_url), 256);
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
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[var(--cream)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 pt-safe pb-3">
          <button type="button" onClick={goBack} aria-label={t("flockCheck.back", "Back")} className="-ml-1 rounded p-1 text-[var(--ink)]">
            <ArrowLeft className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-medium text-[var(--ink)]">{t("flockCheck.title", "Daily health check")}</h1>
            {birds.length > 0 && <p className="t-meta">{t("flockCheck.progress", "{{done}} of {{total}} checked today", { done: doneCount, total: birds.length })}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-3 px-5 py-5">
        {allDone && (
          <div className="rounded-[18px] bg-[var(--lime)] p-4">
            <p className="t-section">{t("flockCheck.allDone", "All birds checked today")}</p>
            <p className="mt-1 text-[13.5px] text-[var(--ink2)]">{t("flockCheck.allDoneBody", "See you tomorrow. You can still add a weight to any bird below.")}</p>
          </div>
        )}

        {birds.map((b) => {
          const open = openId === b.id;
          const done = isDone(b.id);
          const check = today?.[b.id]?.check;
          const photo = photoOf(b.photo_url);
          const next = nextAfter(b.id);
          return (
            <section key={b.id} className="overflow-hidden rounded-[18px] bg-white ring-1 ring-[var(--line2)]" style={{ boxShadow: "0 6px 14px -8px rgba(40,50,40,.08)" }}>
              <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : b.id)} className="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-left">
                {photo?.url
                  ? <img src={photo.url} alt="" className="size-10 shrink-0 rounded-full object-cover" />
                  : <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--pale)] text-[15px] font-[500] text-[var(--ink)]">{b.name.slice(0, 1).toUpperCase()}</span>}
                <span className="min-w-0 flex-1">
                  <span className="t-item block truncate">{b.name}</span>
                  <span className="t-meta block">
                    {done
                      ? check ? t("flockCheck.checkedAt", "Checked {{time}}", { time: timeLabel(check.created_at) }) : t("flockCheck.checked", "Checked")
                      : t("flockCheck.notChecked", "Not checked yet")}
                  </span>
                </span>
                {done
                  ? <span className="grid size-6 place-items-center rounded-full bg-[var(--lime)] text-[var(--ink)]"><Check className="size-3.5" /></span>
                  : <ChevronDown className={`size-4 text-[var(--mute2)] transition-transform ${open ? "rotate-180" : ""}`} />}
              </button>
              {open && (
                <div className="border-t border-[var(--line2)]">
                  <DailyCheckCard
                    birdId={b.id}
                    name={b.name}
                    today={today?.[b.id]}
                    surface="flock"
                    showHeading={false}
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
                </div>
              )}
            </section>
          );
        })}
      </main>
    </div>
  );
}
