import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronUp } from "lucide-react";
import i18next from "i18next";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { fetchBirdList } from "@/lib/birdListSelect";
import { useMyPermissions } from "@/lib/useCapability";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useDailyCheckToday, type BirdToday } from "@/lib/dailyCheck";
import { noticedItems } from "@/lib/dailyCheckLabels";
import { daysSince, staleThreshold } from "@/lib/homeData";
import { DailyCheckCard } from "@/components/DailyCheckCard";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { speciesLabel } from "@/lib/speciesLabel";
import { track } from "@/lib/analytics";

// Daily health check for every bird: a list (up next, done today) with the
// check form opening inline, then an all-done summary once every bird is
// checked. Reached from the Home card when an owner has two or more birds.
// ?view=done shows the summary; ?bird=<id> opens that bird's check.
const checkSearch = z.object({
  view: z.enum(["done"]).optional(),
  bird: z.string().optional(),
});

export const Route = createFileRoute("/_authenticated/check")({
  head: () => ({ meta: [{ title: i18next.t("flockCheck.metaTitle", "Flock check — Kya & Co.") }] }),
  validateSearch: checkSearch,
  component: FlockCheck,
});

type Bird = { id: string; name: string; species: string | null; photo_url: string | null; photo_position: string | null; owner_id: string; is_foster?: boolean | null };
type Photo = { url: string; original?: string } | null;

const C = {
  forest: "#1a3d2e",
  moss: "#2d6a4f",
  lime: "#cdeab0",
  mist: "#d6e8dc",
  ringTrack: "#2f5a47",
  body: "#f1f5f0",
  line: "#d5dfd5",
  avatarLine: "#c9d6c9",
  quiet: "#5f5e5a",
  red: "#a32d2d",
  amberBg: "#f6e7c4",
  amberText: "#854f0b",
  sunflower: "#f2b33d",
};
const SERIF = "'Newsreader', Georgia, serif";

function todayLabel(lang: string): string {
  return new Date().toLocaleDateString(lang, { weekday: "long", month: "long", day: "numeric" });
}

function mealLabel(t: TFunction, m: string | null | undefined, lower = false): string | null {
  if (m === "before_meal") return lower ? t("dailyCheck.beforeMealLower", "before meal") : t("birdWeight.beforeMeal", "Before meal");
  if (m === "after_meal") return lower ? t("dailyCheck.afterMealLower", "after meal") : t("birdWeight.afterMeal", "After meal");
  return null;
}

function FlockCheck() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { view, bird: birdParam } = Route.useSearch();
  const goHome = () => navigate({ to: "/dashboard" });
  const goBack = () => (canGoBack ? router.history.back() : goHome());

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
  // Same set as the Home prompt: the viewer's own flock, then fosters. A bird
  // opened from its own page (?bird=) that someone else owns is added too.
  const birds = useMemo(() => {
    if (!allBirds || !myId) return [];
    const own = (allBirds as Bird[]).filter((b) => b.owner_id === myId);
    const extra = birdParam ? (allBirds as Bird[]).filter((b) => b.id === birdParam && b.owner_id !== myId) : [];
    return [...own.filter((b) => !b.is_foster), ...own.filter((b) => b.is_foster), ...extra].map((b) => ({
      ...b,
      color: "#adbca7", // sage tile behind a missing or loading photo
      speciesText: b.species ? speciesLabel(t, b.species) : null,
    }));
  }, [allBirds, myId, t, birdParam]);
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
    setOpenId(birdParam && birds.some((b) => b.id === birdParam) ? birdParam : birds.find((b) => !today[b.id]?.check)?.id ?? null);
  }, [today, birds, birdParam]);

  // "Add weight" on the summary links back here with ?bird=: open that bird.
  useEffect(() => {
    if (birdParam && initialised.current) setOpenId(birdParam);
  }, [birdParam]);

  // Bring the opened bird's form into view.
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  useEffect(() => {
    if (!openId) return;
    const el = sectionRefs.current.get(openId);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [openId]);

  const nextAfter = (id: string) => {
    const i = birds.findIndex((b) => b.id === id);
    const order = [...birds.slice(i + 1), ...birds.slice(0, i)];
    return order.find((b) => !isDone(b.id)) ?? null;
  };

  const doneCount = birds.filter((b) => isDone(b.id)).length;
  const total = birds.length;
  const upNext = birds.filter((b) => !isDone(b.id));
  const doneToday = birds.filter((b) => isDone(b.id));
  const showDone = view === "done";

  const avatar = (b: (typeof birds)[number], size: number, border: string, badge = false) => {
    const photo = photoOf(b.photo_url) as Photo;
    return (
      <span className="relative shrink-0" style={{ width: size, height: size }} aria-hidden="true">
        <span className="relative block size-full overflow-hidden rounded-full" style={{ background: b.color, boxShadow: `0 0 0 2px ${border}` }}>
          {photo ? <BirdPhotoCrop url={photo.url} original={photo.original} position={b.photo_position} alt="" /> : <span className="grid size-full place-items-center font-[600] text-white/90" style={{ fontSize: size * 0.36 }}>{b.name.slice(0, 1).toUpperCase()}</span>}
        </span>
        {badge && (
          <span className="absolute -bottom-[2px] -right-[2px] grid size-[18px] place-items-center rounded-full text-[#cdeab0]" style={{ background: C.forest, boxShadow: "0 0 0 2px #fff" }}>
            <Check className="size-[10px]" strokeWidth={3.2} />
          </span>
        )}
      </span>
    );
  };

  const header = (
    <header className="text-white" style={{ background: C.forest }}>
      <div className="mx-auto max-w-md px-5 pb-10 pt-[calc(env(safe-area-inset-top)+14px)]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={goBack} aria-label={t("flockCheck.back", "Back")} className="-ml-2.5 grid size-11 shrink-0 place-items-center rounded-full text-white">
            <ArrowLeft className="size-5" />
          </button>
          <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: C.mist }}>{todayLabel(i18n.language)}</span>
          {total > 0 && <ProgressRing done={doneCount} total={total} complete={showDone || doneCount === total} />}
        </div>
        <h1 className="m-0 mt-2 text-[30px] font-[700] leading-[1.1]" style={{ fontFamily: SERIF }}>{t("flockCheck.heading", "Daily health check")}</h1>
        <p className="m-0 mt-2 text-[14px] leading-[1.5]" style={{ color: C.mist }}>
          {showDone
            ? t("flockCheck.doneSubhead", "Nice work. Everything's saved to each bird's health log.")
            : t("flockCheck.intro", "A quick once-over every day helps you spot early signs of illness. Record what you see for each bird here.")}
        </p>
      </div>
    </header>
  );

  if (showDone) {
    const checked = birds.filter((b) => isDone(b.id));
    const noticed = checked.filter((b) => {
      const c = today?.[b.id]?.check;
      return !!c && c.triage_status !== "green";
    });
    return (
      <div className="setup-frame min-h-screen pb-nav" style={{ background: C.body, color: C.forest }}>
        {header}
        <main className="relative mx-auto -mt-6 flex max-w-md flex-col gap-3.5 rounded-t-[24px] px-4 pb-6 pt-5" style={{ background: C.body }}>
          <section className="rounded-[16px] bg-white px-4 pb-2 pt-4">
            <h2 className="m-0 text-[19px] font-[700]" style={{ fontFamily: SERIF }}>{t("flockCheck.todaysWeights", "Today's weights")}</h2>
            <ul className="m-0 mt-2 list-none p-0">
              {checked.map((b) => {
                const w = today?.[b.id]?.weights[0];
                const meal = mealLabel(t, w?.meal_relation);
                return (
                  <li key={b.id} className="flex min-h-[56px] items-center gap-3 border-b py-2 last:border-b-0" style={{ borderColor: C.line }}>
                    {avatar(b, 36, C.avatarLine)}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-[700]">{b.name}</span>
                      {w ? (meal && <span className="block text-[12px]" style={{ color: C.quiet }}>{meal}</span>) : (
                        <span className="block text-[12px]" style={{ color: C.quiet }}>{t("flockCheck.checkedNotWeighed", "Checked, not weighed")}</span>
                      )}
                    </span>
                    {w ? (
                      <span className="shrink-0 text-[15px] font-[700]">{w.grams.toLocaleString()}<span className="ml-0.5 text-[12px] font-[500]" style={{ color: C.quiet }}>g</span></span>
                    ) : (
                      <button type="button" onClick={() => navigate({ to: "/check", search: { bird: b.id } })} className="min-h-[44px] shrink-0 px-1 text-[14px] font-[700]" style={{ color: C.moss }}>
                        {t("flockCheck.addWeight", "Add weight")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {noticed.length > 0 && (
            <section className="rounded-[16px] px-4 pb-2 pt-4" style={{ background: C.amberBg }}>
              <h2 className="m-0 text-[19px] font-[700]" style={{ fontFamily: SERIF, color: C.amberText }}>{t("flockCheck.youNoticed", "You noticed something")}</h2>
              <ul className="m-0 mt-2 list-none p-0">
                {noticed.map((b) => {
                  const c = today?.[b.id]?.check;
                  const items = noticedItems(t, c?.reason_codes);
                  return (
                    <li key={b.id} className="flex items-start gap-3 py-2">
                      {avatar(b, 36, C.amberBg)}
                      <span className="min-w-0 flex-1 text-[14px] leading-[1.45]">
                        <span className="block font-[700]">{items ? t("flockCheck.birdNoticed", "{{name}} · {{items}}", { name: b.name, items }) : b.name}</span>
                        {c?.notes?.trim() && <span className="mt-0.5 block" style={{ color: C.amberText }}>“{c.notes.trim()}”</span>}
                        <button
                          type="button"
                          onClick={() => c && navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId: b.id, scanId: c.id } })}
                          className="min-h-[44px] text-[14px] font-[700]"
                          style={{ color: C.amberText }}
                        >
                          {t("flockCheck.seeBirdsHealth", "See {{name}}'s health →", { name: b.name })}
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {noticed.length < checked.length && (
            <p className="m-0 px-1 text-[14px]" style={{ color: C.forest }}>
              {noticed.length > 0 ? t("flockCheck.everyoneElseUsual", "Everyone else looked like usual.") : t("flockCheck.everyoneUsual", "Everyone looked like usual.")}
            </p>
          )}
        </main>
        <Footer>
          <FooterButton onClick={goHome}>{t("flockCheck.backToHome", "Back to home")}</FooterButton>
        </Footer>
      </div>
    );
  }

  // Footer target: the next unchecked bird whose form isn't already open.
  const footerNext = upNext.find((b) => b.id !== openId) ?? null;
  const openBird = (id: string) => setOpenId(id);

  const renderOpen = (b: (typeof birds)[number]) => {
    const done = isDone(b.id);
    const d = today?.[b.id];
    const photo = photoOf(b.photo_url) as Photo;
    const next = nextAfter(b.id);
    return (
      <section
        key={b.id}
        ref={(el) => { if (el) sectionRefs.current.set(b.id, el); else sectionRefs.current.delete(b.id); }}
        className="flex scroll-mt-4 flex-col gap-3.5 rounded-[18px] bg-[#cdeab0] p-[16px]"
      >
        <button type="button" aria-expanded onClick={() => setOpenId(null)} className="flex min-h-[44px] items-center gap-3 border-0 bg-transparent p-0 text-left text-inherit">
          <span className="relative size-[46px] shrink-0 overflow-hidden rounded-full" style={{ background: b.color }} aria-hidden="true">
            {photo ? <BirdPhotoCrop url={photo.url} original={photo.original} position={b.photo_position} alt="" eager /> : <span className="grid size-full place-items-center text-[16px] font-[600] text-white/90">{b.name.slice(0, 1).toUpperCase()}</span>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[20px] font-[700]" style={{ fontFamily: SERIF }}>{b.name}</span>
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
            if (remaining.length === 0) navigate({ to: "/check", search: { view: "done" } });
            else setOpenId(next?.id ?? null);
          }}
        />
      </section>
    );
  };

  return (
    <div className="setup-frame min-h-screen pb-nav" style={{ background: C.body, color: C.forest }}>
      {header}
      <main className="relative mx-auto -mt-6 flex max-w-md flex-col gap-2 rounded-t-[24px] px-4 pb-6 pt-5" style={{ background: C.body }}>
        {upNext.length > 0 && <SectionLabel>{t("flockCheck.upNext", "Up next · {{n}}", { n: upNext.length })}</SectionLabel>}
        {upNext.map((b) => {
          if (openId === b.id) return renderOpen(b);
          const d = today?.[b.id];
          const line = weighedLine(t, d, b.is_foster ?? null);
          return (
            <div key={b.id} className="flex min-h-[68px] items-center gap-3 rounded-[16px] bg-white px-3.5 py-2.5" style={{ borderBottom: `1px solid ${C.line}` }}>
              {avatar(b, 46, line.overdue ? C.red : C.avatarLine)}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-[700]">{b.name}</span>
                <span className={`mt-px block truncate text-[13px] ${line.overdue ? "font-[700]" : ""}`} style={{ color: line.overdue ? C.red : C.quiet }}>{line.text}</span>
              </span>
              <button type="button" onClick={() => openBird(b.id)} className="inline-flex h-[44px] shrink-0 items-center rounded-full border-2 bg-white px-4 text-[15px] font-[700]" style={{ borderColor: C.forest, color: C.forest }}>
                {t("flockCheck.start", "Start")}
              </button>
            </div>
          );
        })}

        {doneToday.length > 0 && <SectionLabel className={upNext.length > 0 ? "mt-3" : ""}>{t("flockCheck.doneToday", "Done today · {{n}}", { n: doneToday.length })}</SectionLabel>}
        {doneToday.map((b) => {
          if (openId === b.id) return renderOpen(b);
          const d = today?.[b.id];
          const c = d?.check;
          const w = d?.weights[0];
          const flagged = !!c && c.triage_status !== "green";
          const items = flagged ? noticedItems(t, c?.reason_codes) : "";
          const parts = [
            w ? t("flockCheck.grams", "{{n}} g", { n: w.grams.toLocaleString() }) : null,
            flagged ? null : mealLabel(t, w?.meal_relation, true),
            flagged
              ? (items ? t("flockCheck.youNoticedItems", "you noticed: {{items}}", { items }) : null)
              : t("flockCheck.looksNormal", "looks normal"),
          ].filter(Boolean);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => openBird(b.id)}
              className="flex min-h-[68px] w-full items-center gap-3 rounded-[16px] border-0 bg-white px-3.5 py-2.5 text-left"
              style={{ borderBottom: `1px solid ${C.line}`, color: C.forest }}
            >
              {avatar(b, 46, C.avatarLine, true)}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-[700]">{b.name}</span>
                <span className="mt-px line-clamp-2 block text-[13px] leading-[1.35]" style={{ color: C.quiet }}>{parts.join(" · ")}</span>
              </span>
              <span className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-[700]" style={flagged ? { background: C.amberBg, color: C.amberText } : { background: C.lime, color: C.forest }}>
                {flagged ? t("flockCheck.noticedSomething", "Noticed something") : t("flockCheck.doneTag", "Done")}
              </span>
            </button>
          );
        })}
      </main>
      {total > 0 && (footerNext || upNext.length === 0) && (
        <Footer>
          {footerNext ? (
            <FooterButton onClick={() => openBird(footerNext.id)}>{t("flockCheck.checkNext", "Check {{name}} next →", { name: footerNext.name })}</FooterButton>
          ) : (
            <FooterButton onClick={() => navigate({ to: "/check", search: { view: "done" } })}>{t("flockCheck.seeSummary", "See today's summary →")}</FooterButton>
          )}
        </Footer>
      )}
    </div>
  );
}

/** "Last weighed 3 days ago" / "yesterday" / "today", or, past the stale
 *  threshold, "Not weighed in 9 days" (shown in red). */
function weighedLine(t: TFunction, d: BirdToday | undefined, isFoster: boolean | null): { text: string; overdue: boolean } {
  const at = d?.lastWeighedAt;
  if (!at) return { text: t("flockCheck.notWeighedYet", "Not weighed yet"), overdue: false };
  const days = daysSince(at);
  if (days > staleThreshold(isFoster)) return { text: t("flockCheck.notWeighedInDays", "Not weighed in {{count}} days", { count: days }), overdue: true };
  if (days <= 0) return { text: t("flockCheck.lastWeighedToday", "Last weighed today"), overdue: false };
  if (days === 1) return { text: t("flockCheck.lastWeighedYesterday", "Last weighed yesterday"), overdue: false };
  return { text: t("flockCheck.lastWeighedDaysAgo", "Last weighed {{count}} days ago", { count: days }), overdue: false };
}

function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`m-0 px-1 text-[12px] font-[700] ${className}`} style={{ color: C.quiet }}>{children}</p>;
}

function ProgressRing({ done, total, complete }: { done: number; total: number; complete: boolean }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const pct = complete ? 1 : total > 0 ? done / total : 0;
  return (
    <span className="relative grid size-12 shrink-0 place-items-center" role="img" aria-label={i18next.t("flockCheck.progressAria", "{{done}} of {{total}} birds checked", { done, total })}>
      <svg width="48" height="48" viewBox="0 0 48 48" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="24" cy="24" r={r} fill="none" stroke={C.ringTrack} strokeWidth="4" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={C.lime} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      {complete
        ? <Check className="relative size-5 text-[#cdeab0]" strokeWidth={3} aria-hidden="true" />
        : <span className="relative text-[12px] font-[700] tabular-nums text-white" aria-hidden="true">{done}/{total}</span>}
    </span>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky z-10 border-t px-4 pb-3 pt-3" style={{ bottom: "var(--nav-spacer)", background: C.body, borderColor: C.line }}>
      <div className="mx-auto max-w-md">{children}</div>
    </div>
  );
}

function FooterButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex h-[48px] w-full items-center justify-center rounded-full border-2 px-5 text-[15px] font-[700]" style={{ background: C.sunflower, borderColor: C.forest, color: C.forest }}>
      {children}
    </button>
  );
}
