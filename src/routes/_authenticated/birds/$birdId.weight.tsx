import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdRole } from "@/lib/useBirdRole";
import { useCapability, useMyPermissions } from "@/lib/useCapability";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { toast } from "sonner";
import { ArrowLeft, Check, X } from "lucide-react";
import { track } from "@/lib/analytics";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import { BottomSheet } from "@/components/setup/BottomSheet";
import { friendlyError } from "@/lib/errorMessage";
import { daysAgo } from "@/lib/scanConcern";
import { useLoggedBy } from "@/lib/useLoggedBy";
import { weightThen } from "@/lib/weightThen";
import { K, SERIF, KyaPage, KyaBody, KyaCard, KyaHeading, KyaLink, KyaPrimaryButton } from "@/components/kya";
import { PageHeader } from "@/components/headers";
import i18next from "i18next";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/birds/$birdId/weight")({
  head: () => ({ meta: [{ title: i18next.t("birdWeight.metaTitle", "Weight — Kya & Co.") }] }),
  // ?log=1 (from the bird record) opens the log-weight entry straight away.
  validateSearch: (search: Record<string, unknown>): { log?: boolean } => ({
    log: search.log === true || search.log === "true" || search.log === 1 ? true : undefined,
  }),
  component: WeightFacet,
});

type Entry = { id: string; grams: number; measured_at: string; source: string; meal_relation: string | null; logged_by: string | null; sit_id: string | null };
type WindowDays = 30 | 90 | 365;
type Meal = "before_meal" | "after_meal" | null;

const WINDOWS: WindowDays[] = [30, 90, 365];
const MIN_G = 1;
const MAX_G = 5000;
const PAGE = 6;
const pad = (x: number) => String(x).padStart(2, "0");
// "YYYY-MM-DDTHH:MM" in local time, for <input type="datetime-local"> + its max.
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const nowLocal = () => toLocalInput(new Date());

function windowLabel(t: TFunction, days: WindowDays): string {
  switch (days) {
    case 30: return t("birdWeight.win30Days", "30 days");
    case 90: return t("birdWeight.win90Days", "90 days");
    case 365: return t("birdWeight.win1Year", "1 year");
  }
}
function agoLabel(t: TFunction, days: WindowDays): string {
  switch (days) {
    case 30: return t("birdWeight.ago30", "30 days ago");
    case 90: return t("birdWeight.ago90", "90 days ago");
    case 365: return t("birdWeight.ago365", "1 year ago");
  }
}
function mealText(t: TFunction, m: string | null | undefined, lower = false): string | null {
  if (m === "before_meal") return lower ? t("birdWeight.beforeMealLower", "before meal") : t("birdWeight.beforeMeal", "Before meal");
  if (m === "after_meal") return lower ? t("birdWeight.afterMealLower", "after meal") : t("birdWeight.afterMeal", "After meal");
  return null;
}
function timeText(iso: string, lang: string): string {
  return new Date(iso).toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" });
}
/** "Today", "Yesterday" or "Oct 18". */
function dayText(t: TFunction, iso: string, lang: string): string {
  const d = daysAgo(iso);
  if (d <= 0) return t("birdWeight.today", "Today");
  if (d === 1) return t("birdWeight.yesterday", "Yesterday");
  return new Date(iso).toLocaleDateString(lang, { month: "short", day: "numeric" });
}
function grams(t: TFunction, n: number): string {
  return t("birdWeight.grams", "{{n}} g", { n: n.toLocaleString() });
}

function WeightFacet() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { birdId } = Route.useParams();
  const { log } = Route.useSearch();
  const canLogCare = useCapability("log_daily_care", { birdId });
  const isOwner = useBirdRole(birdId) === "owner";
  const myId = useMyPermissions().data?.myId ?? null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [win, setWin] = useState<WindowDays>(90);
  const [logOpen, setLogOpen] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ?log=1 deep-link → open the entry once we know the caller may log.
  useEffect(() => {
    if (log && canLogCare) setLogOpen(true);
  }, [log, canLogCare]);

  const { data: bird } = useQuery({
    queryKey: ["bird-name", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("name").eq("id", birdId).maybeSingle();
      return data as { name: string } | null;
    },
  });
  const name = bird?.name ?? t("birdWeight.thisBird", "this bird");

  const { data: entries } = useQuery({
    queryKey: ["weight-entries", birdId],
    // A freshly-logged weight (or a sitter weigh-in) must show without a manual
    // reload — refetch when the screen regains focus.
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_entries")
        .select("*")
        .eq("bird_id", birdId)
        .order("measured_at", { ascending: false })
        // 2000 (~5 years of daily weigh-ins) — IDENTICAL to the vet summary's
        // query on the same shared key, so the cached shape/bound never diverge.
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
  });

  const all = entries ?? [];
  const latest = all[0];
  const loggedBy = useLoggedBy(all.map((e) => ({ by: e.logged_by, source: e.source, sitId: e.sit_id })), isOwner);
  const isMine = (e: Entry) => (e.logged_by ? e.logged_by === myId : e.source === "owner" && isOwner);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["weight-entries", birdId] });
    qc.invalidateQueries({ queryKey: ["bird-weights", birdId] }); // bird page summary + Recent
    qc.invalidateQueries({ queryKey: ["birds"] }); // Home rows — weights embedded in the birds query
    qc.invalidateQueries({ queryKey: ["daily-check-today"] });
  }

  // Owner-only delete (RLS also enforces birds.owner_id).
  async function deleteWeight(id: string) {
    if (!window.confirm(t("birdWeight.confirmDelete", "Delete this weight entry? This can't be undone."))) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("weight_entries").delete().eq("id", id);
      if (error) throw error;
      toast.success(t("birdWeight.deleted", "Weight entry deleted."));
      setOpenEntry(null);
      refresh();
    } catch (e: any) {
      toast.error(friendlyError(e, t("birdWeight.deleteFailed", "Couldn't delete the entry.")));
    } finally {
      setDeleting(false);
    }
  }

  const latestMeta = latest
    ? [`${dayText(t, latest.measured_at, lang)}, ${timeText(latest.measured_at, lang)}`, mealText(t, latest.meal_relation, true)].filter(Boolean).join(" · ")
    : null;

  // History, newest first, grouped by month.
  const visible = all.slice(0, shown);
  const groups: { key: string; label: string; rows: { e: Entry; prev: Entry | undefined }[] }[] = [];
  visible.forEach((e, i) => {
    const d = new Date(e.measured_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const sameYear = d.getFullYear() === new Date().getFullYear();
    const label = d.toLocaleDateString(lang, sameYear ? { month: "long" } : { month: "long", year: "numeric" });
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, label, rows: [] }; groups.push(g); }
    g.rows.push({ e, prev: all[i + 1] });
  });

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <PageHeader onBack={() => navigate({ to: "/birds/$birdId", params: { birdId } })} title={t("birdWeight.title", "{{name}}'s weight", { name })}>
          {latest ? (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[48px] font-[700] leading-none" style={{ fontFamily: SERIF }}>{grams(t, latest.grams)}</span>
              {latestMeta && <span className="text-[14px]" style={{ color: K.paleGreen }}>{latestMeta}</span>}
            </div>
          ) : (
            <p className="m-0 mt-2 text-[15px]" style={{ color: K.paleGreen }}>{t("birdWeight.bodyEmpty", "No weights yet. Pop {{name}} on a scale and log the first one.", { name })}</p>
          )}
        </PageHeader>

        <KyaBody>
          <MemberContextBanner birdId={birdId} />

          {canLogCare && !logOpen && !editing && (
            <KyaPrimaryButton onClick={() => setLogOpen(true)}>{t("birdWeight.logAWeight", "Log a weight")}</KyaPrimaryButton>
          )}

          {(logOpen || editing) && (
            <LogPanel
              key={editing?.id ?? "new"}
              birdId={birdId}
              entry={editing}
              lastGrams={latest?.grams}
              onClose={() => { setLogOpen(false); setEditing(null); }}
              onSaved={() => { setLogOpen(false); setEditing(null); refresh(); }}
            />
          )}

          {all.length > 0 && (
            <>
              <ChartCard entries={all} win={win} setWin={setWin} isMine={isMine} />

              <KyaCard>
                <KyaHeading size={21} className="px-4 pb-1 pt-4">{t("birdWeight.history", "History")}</KyaHeading>
                {groups.map((g) => (
                  <div key={g.key}>
                    <p className="m-0 px-4 pb-1 pt-3 text-[12.5px] font-[700]" style={{ color: K.quiet }}>{g.label}</p>
                    {g.rows.map(({ e, prev }, i) => {
                      const d = new Date(e.measured_at);
                      const diff = prev ? e.grams - prev.grams : null;
                      const change = diff == null ? null
                        : diff === 0 ? t("birdWeight.noChange", "No change")
                        : diff > 0 ? t("birdWeight.plusG", "+{{n}} g", { n: diff }) : t("birdWeight.minusG", "−{{n}} g", { n: Math.abs(diff) });
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setOpenEntry(e)}
                          className="flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left active:bg-black/[0.03]"
                          style={{ borderTop: i === 0 ? undefined : `1px solid ${K.line}`, color: K.forest }}
                        >
                          <span className="w-[38px] shrink-0 text-center">
                            <span className="block text-[20px] font-[700] leading-none">{d.getDate()}</span>
                            <span className="mt-0.5 block text-[12px]" style={{ color: K.quiet }}>{d.toLocaleDateString(lang, { weekday: "short" })}</span>
                          </span>
                          <span className="min-w-0 flex-1 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>
                            <span className="block">{[timeText(e.measured_at, lang), mealText(t, e.meal_relation)].filter(Boolean).join(" · ")}</span>
                            <span className="block">{loggedBy(t, { by: e.logged_by, source: e.source, sitId: e.sit_id })}</span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-[15px] font-[700]">{grams(t, e.grams)}</span>
                            {change && <span className="block text-[12px]" style={{ color: K.quiet }}>{change}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {all.length > shown && (
                  <div className="px-4 pb-2" style={{ borderTop: `1px solid ${K.line}` }}>
                    <KyaLink onClick={() => setShown((n) => n + 20)}>{t("birdWeight.showOlder", "Show older weights")}</KyaLink>
                  </div>
                )}
              </KyaCard>
              {(canLogCare || isOwner) && (
                <p className="m-0 -mt-2 px-1 text-[12.5px]" style={{ color: K.quiet }}>{t("birdWeight.tapToEdit", "Tap a weight to edit or delete it.")}</p>
              )}
            </>
          )}
        </KyaBody>
      </div>

      {openEntry && (
        <BottomSheet onClose={() => setOpenEntry(null)}>
          <div className="flex flex-col gap-4" style={{ color: K.forest }}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[13px]" style={{ color: K.quiet }}>
                  {[`${dayText(t, openEntry.measured_at, lang)}, ${timeText(openEntry.measured_at, lang)}`, mealText(t, openEntry.meal_relation)].filter(Boolean).join(" · ")}
                </p>
                <p className="m-0 mt-1 text-[34px] font-[700] leading-none" style={{ fontFamily: SERIF }}>{grams(t, openEntry.grams)}</p>
                <p className="m-0 mt-2 text-[14px]" style={{ color: K.quiet }}>{t("birdWeight.loggedBy", "Logged by {{who}}", { who: loggedBy(t, { by: openEntry.logged_by, source: openEntry.source, sitId: openEntry.sit_id }) })}</p>
              </div>
              <button type="button" onClick={() => setOpenEntry(null)} aria-label={t("birdWeight.close", "Close")} className="grid size-11 shrink-0 place-items-center rounded-full" style={{ background: K.mist }}>
                <X className="size-5" />
              </button>
            </div>
            {canLogCare && (
              <KyaPrimaryButton onClick={() => { setEditing(openEntry); setLogOpen(false); setOpenEntry(null); }}>{t("birdWeight.edit", "Edit")}</KyaPrimaryButton>
            )}
            {isOwner && (
              <div className="text-center">
                <KyaLink color={K.red} onClick={() => deleteWeight(openEntry.id)}>{deleting ? t("birdWeight.deleting", "Deleting…") : t("birdWeight.delete", "Delete")}</KyaLink>
              </div>
            )}
          </div>
        </BottomSheet>
      )}
    </KyaPage>
  );
}

/** The chart card: range control, the chart, then lowest / highest / then. */
function ChartCard({ entries, win, setWin, isMine }: { entries: Entry[]; win: WindowDays; setWin: (w: WindowDays) => void; isMine: (e: Entry) => boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const now = Date.now();
  const start = now - win * 86_400_000;
  const inRange = entries.filter((e) => +new Date(e.measured_at) >= start).slice().reverse(); // oldest first
  const values = inRange.map((e) => e.grams);
  const lowest = values.length ? Math.min(...values) : null;
  const highest = values.length ? Math.max(...values) : null;
  // The weight logged near the start of the range (±7 / ±14 / ±30 days for
  // 30 days / 90 days / 1 year), or none: a weight from last week isn't
  // "1 year ago".
  const then = weightThen(entries, win, now);

  return (
    <KyaCard className="p-4">
      <div role="radiogroup" aria-label={t("birdWeight.range", "Range")} className="grid grid-cols-3 gap-1 rounded-full p-1" style={{ background: K.mist }}>
        {WINDOWS.map((w) => {
          const on = w === win;
          return (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setWin(w)}
              className="min-h-[44px] rounded-full text-[14px] font-[700]"
              style={on ? { background: K.forest, color: "#fff" } : { color: K.forest }}
            >
              {windowLabel(t, w)}
            </button>
          );
        })}
      </div>

      {inRange.length === 0 ? (
        <p className="m-0 py-10 text-center text-[14px]" style={{ color: K.quiet }}>{t("birdWeight.noneInRange", "No weights in the last {{range}}.", { range: windowLabel(t, win) })}</p>
      ) : (
        <WeightChart points={inRange} start={start} end={now} isMine={isMine} lang={lang} />
      )}

      <div className="mt-2 flex items-center gap-4 text-[12.5px]" style={{ color: K.quiet }}>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: K.forest }} /> {t("birdWeight.legendYou", "You")}</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-white" style={{ boxShadow: `inset 0 0 0 2px ${K.moss}` }} /> {t("birdWeight.legendOthers", "Sitter or household")}</span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 pt-3" style={{ borderTop: `1px solid ${K.line}` }}>
        {([
          [t("birdWeight.lowest", "Lowest"), lowest, null],
          [t("birdWeight.highest", "Highest"), highest, null],
          [agoLabel(t, win), then?.grams ?? null, t("birdWeight.noWeightThen", "No weight then")],
        ] as [string, number | null, string | null][]).map(([label, value, emptyText]) => (
          <div key={label}>
            <p className="m-0 text-[12.5px]" style={{ color: K.quiet }}>{label}</p>
            {value != null ? (
              <p className="m-0 mt-0.5 text-[16px] font-[700]">{grams(t, value)}</p>
            ) : emptyText ? (
              <p className="m-0 mt-0.5 text-[14px]" style={{ color: K.quiet }}>{emptyText}</p>
            ) : (
              <p className="m-0 mt-0.5 text-[16px] font-[700]">—</p>
            )}
          </div>
        ))}
      </div>
    </KyaCard>
  );
}

/** Round gridline values around the weights: a scale fitted to the range with
 *  a little room above and below, so small changes stay small. */
function niceScale(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  const span = Math.max(max - min, 4);
  const padded = span * 0.25;
  const raw = (span + padded * 2) / 3;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
  const step = steps.find((s) => s >= raw) ?? 1000;
  const lo = Math.floor((min - padded) / step) * step;
  const hi = Math.ceil((max + padded) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 0.001; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

function WeightChart({ points, start, end, isMine, lang }: { points: Entry[]; start: number; end: number; isMine: (e: Entry) => boolean; lang: string }) {
  const { t } = useTranslation();
  const W = 320, H = 170, L = 34, R = 10, T = 10, B = 26;
  const { lo, hi, ticks } = niceScale(Math.min(...points.map((p) => p.grams)), Math.max(...points.map((p) => p.grams)));
  const x = (ms: number) => L + ((ms - start) / (end - start)) * (W - L - R);
  const y = (g: number) => T + (1 - (g - lo) / (hi - lo || 1)) * (H - T - B);
  const pts = points.map((p) => ({ p, cx: x(+new Date(p.measured_at)), cy: y(p.grams) }));
  const mid = start + (end - start) / 2;
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(lang, { month: "short", day: "numeric" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block w-full" role="img" aria-label={t("birdWeight.chartAria", "Weight chart")}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={K.line} strokeWidth="1" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={K.quiet}>{v}</text>
        </g>
      ))}
      {pts.length > 1 && (
        <polyline points={pts.map((q) => `${q.cx},${q.cy}`).join(" ")} fill="none" stroke={K.forest} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {pts.map((q, i) => {
        const last = i === pts.length - 1;
        const r = last ? 5.5 : 4;
        return isMine(q.p)
          ? <circle key={q.p.id} cx={q.cx} cy={q.cy} r={r} fill={K.forest} />
          : <circle key={q.p.id} cx={q.cx} cy={q.cy} r={r} fill="#fff" stroke={K.moss} strokeWidth="2" />;
      })}
      <text x={L} y={H - 6} fontSize="11" fill={K.quiet}>{fmt(start)}</text>
      <text x={x(mid)} y={H - 6} fontSize="11" fill={K.quiet} textAnchor="middle">{fmt(mid)}</text>
      <text x={W - R} y={H - 6} fontSize="11" fill={K.quiet} textAnchor="end">{t("birdWeight.today", "Today")}</text>
    </svg>
  );
}

/** Log a new weight, or edit one (`entry`): weight, when, and meal timing. */
function LogPanel({ birdId, entry, lastGrams, onClose, onSaved }: { birdId: string; entry: Entry | null; lastGrams?: number; onClose: () => void; onSaved: () => void }) {
  // sit_id attribution: when the household member is the assigned caregiver on
  // an active sit covering this bird, every weight they log during the window
  // is tagged with that sit_id. Null otherwise (no over-tagging).
  const { t } = useTranslation();
  const activeSitId = useActiveSitIdForBird(birdId);
  const role = useBirdRole(birdId);
  const [gramsIn, setGrams] = useState<string>(entry ? String(entry.grams) : lastGrams ? String(lastGrams) : "");
  const [when, setWhen] = useState<string>(entry ? toLocalInput(new Date(entry.measured_at)) : nowLocal());
  const [meal, setMeal] = useState<Meal>((entry?.meal_relation as Meal) ?? null);
  const [saving, setSaving] = useState(false);
  // Opened from a row further down the page: bring the form into view.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);

  const n = Number(gramsIn);
  const valid = gramsIn !== "" && Number.isFinite(n) && n >= MIN_G && n <= MAX_G && !!when;

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const measured_at = new Date(when).toISOString(); // local datetime → UTC
      if (entry) {
        // Editing keeps who logged it; only the weight, time and meal change.
        const { error } = await supabase.from("weight_entries").update({ grams: n, measured_at, meal_relation: meal } as any).eq("id", entry.id);
        if (error) throw error;
        toast.success(t("birdWeight.updated", "Weight updated."));
        track("weight_edited", { has_meal_relation: !!meal });
      } else {
        const { data: u } = await getLocalUser();
        // Only send meal_relation when chosen.
        const payload: Record<string, unknown> = {
          bird_id: birdId, grams: n, measured_at, source: role === "household" ? "household" : "owner", logged_by: u.user?.id ?? null,
        };
        if (meal) payload.meal_relation = meal;
        if (activeSitId) payload.sit_id = activeSitId;
        const { error } = await supabase.from("weight_entries").insert(payload as any);
        if (error) throw error;
        toast.success(t("birdWeight.logged", "Weight logged."));
        track("weight_logged", { grams: n, has_meal_relation: !!meal, source: role === "household" ? "household" : "owner" });
      }
      onSaved();
    } catch (e: any) {
      toast.error(friendlyError(e, t("birdWeight.saveFailed", "Couldn't save the weight.")));
    } finally {
      setSaving(false);
    }
  }

  const field = "h-12 w-full rounded-full border-2 bg-white px-[18px] text-[16px] outline-none focus:border-[#1a3d2e]";
  return (
    <div ref={ref} className="scroll-mt-4">
    <KyaCard className="flex flex-col gap-4 p-4">
      <KyaHeading size={21}>{entry ? t("birdWeight.editWeight", "Edit weight") : t("birdWeight.logAWeight", "Log a weight")}</KyaHeading>

      <label className="block">
        <span className="mb-1.5 block text-[15px] font-[700]">{t("birdWeight.gramsLabel", "Weight (grams)")}</span>
        <input
          className={field}
          style={{ borderColor: "#d6dfd5", color: K.forest }}
          inputMode="decimal"
          value={gramsIn}
          placeholder={lastGrams ? String(lastGrams) : t("birdWeight.gramsPlaceholder", "e.g. 410")}
          onChange={(e) => setGrams(e.target.value.replace(/[^0-9.]/g, ""))}
        />
        {gramsIn !== "" && (Number(gramsIn) < MIN_G || Number(gramsIn) > MAX_G) && (
          <span className="mt-1 block text-[13px]" style={{ color: K.amberText }}>{t("birdWeight.range", "Enter a weight between {{min}} and {{max}} grams.", { min: MIN_G, max: MAX_G })}</span>
        )}
      </label>

      <label className="block">
        <span className="mb-1.5 block text-[15px] font-[700]">{t("birdWeight.whenLabel", "When")}</span>
        <input type="datetime-local" className={field} style={{ borderColor: "#d6dfd5", color: K.forest }} value={when} max={nowLocal()} onChange={(e) => setWhen(e.target.value)} />
      </label>

      <div>
        <span className="mb-1.5 block text-[15px] font-[700]">{t("birdWeight.mealLabel", "Relative to a meal (optional)")}</span>
        <div className="grid grid-cols-2 gap-2">
          {(["before_meal", "after_meal"] as const).map((m) => {
            const on = meal === m;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={on}
                onClick={() => setMeal((cur) => (cur === m ? null : m))}
                className="min-h-[48px] rounded-full border-2 text-[15px] font-[700]"
                style={on ? { background: K.forest, borderColor: K.forest, color: "#fff" } : { background: "#fff", borderColor: "#d6dfd5", color: K.forest }}
              >
                {m === "before_meal" ? t("birdWeight.beforeMeal", "Before meal") : t("birdWeight.afterMeal", "After meal")}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <KyaPrimaryButton onClick={save} disabled={!valid || saving} icon={<Check className="size-5" />}>
          {saving ? t("birdWeight.saving", "Saving…") : t("birdWeight.save", "Save")}
        </KyaPrimaryButton>
        <KyaLink color={K.quiet} onClick={onClose}>{t("birdWeight.cancel", "Cancel")}</KyaLink>
      </div>
    </KyaCard>
    </div>
  );
}
