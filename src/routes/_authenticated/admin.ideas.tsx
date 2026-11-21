import { useRef, useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Camera, Loader2, Plus, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaBackRow, KyaBody, KyaHeader, KyaHeading, KyaPage, KyaPrimaryButton, KyaSheet, KyaTitle } from "@/components/kya";
import { categoryLabel } from "@/components/flock/IdeaParts";
import { FLOCK_ENABLED_QUERY } from "@/lib/flock";
import { useIsAdmin } from "@/lib/flockData";
import {
  deleteIdea, IDEA_CATEGORIES, saveIdea, swapIdeaDays, useIdeaSchedule, useInvalidateIdeas, useUnscheduledIdeas,
  type IdeaCategory, type IdeaDraft, type ScheduleDay,
} from "@/lib/flockIdeas";
import { uploadPostPhoto } from "@/lib/flockPostData";

// Scheduling Today's ideas (Batch 8, screen 5): the next two weeks, drafts vs
// ready, empty days flagged (they reuse a favorite from the archive), New
// idea, and reordering by moving a day up or down. Behind the Flock gate, then
// admins only (the database checks again on every call).
export const Route = createFileRoute("/_authenticated/admin/ideas")({
  head: () => ({ meta: [{ title: "Today's ideas — Kya & Co." }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) throw redirect({ to: "/dashboard", replace: true });
  },
  component: AdminIdeas,
});

function dayLabel(iso: string, lang: string): { week: string; day: string } {
  const d = new Date(`${iso}T12:00:00`);
  return { week: d.toLocaleDateString(lang, { weekday: "short" }), day: d.toLocaleDateString(lang, { day: "numeric" }) };
}

const empty = (day: string | null): IdeaDraft => ({ id: null, title: "", category: "enrichment", body: "", photoPath: null, status: "draft", isFavorite: false, scheduledOn: day });

function AdminIdeas() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: isAdmin, isLoading: checking } = useIsAdmin();
  const { data: days } = useIdeaSchedule(isAdmin === true);
  const { data: others } = useUnscheduledIdeas(isAdmin === true);
  const invalidate = useInvalidateIdeas();
  const [editing, setEditing] = useState<IdeaDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (checking) {
    return <KyaPage><div className="grid min-h-[60vh] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-8 animate-spin" style={{ color: K.moss }} /></div></KyaPage>;
  }
  if (!isAdmin) {
    return (
      <KyaPage>
        <KyaHeader>
          <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/dashboard" })} />
          <KyaTitle title={t("flock.review.notAvailable", "Page not available")} line={t("flock.ideasAdmin.adminOnly", "This page is only for Kya & Co. admins.")} />
        </KyaHeader>
        <KyaBody><KyaPrimaryButton onClick={() => void navigate({ to: "/dashboard" })}>{t("flock.review.home", "Go to Home")}</KyaPrimaryButton></KyaBody>
      </KyaPage>
    );
  }

  const list = days ?? [];
  const move = async (i: number, d: -1 | 1) => {
    const a = list[i]; const b = list[i + d];
    if (!a || !b) return;
    setBusy(true); setError(null);
    try { await swapIdeaDays(a.day, b.day); await invalidate(); }
    catch { setError(t("flock.review.error", "That didn't save. Try again.")); }
    finally { setBusy(false); }
  };
  const open = (d: ScheduleDay) => setEditing(d.idea_id
    ? { id: d.idea_id, title: d.title ?? "", category: d.category ?? "enrichment", body: d.body ?? "", photoPath: null, status: d.status ?? "draft", isFavorite: !!d.is_favorite, scheduledOn: d.day }
    : empty(d.day));

  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/flock" })}
          right={(
            <button type="button" onClick={() => setEditing(empty(null))} data-testid="new-idea"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[15px] font-[700]" style={{ background: K.lime, color: K.forest }}>
              <Plus className="size-4" aria-hidden="true" />{t("flock.ideasAdmin.new", "New idea")}
            </button>
          )} />
        <KyaTitle title={t("flock.ideasAdmin.title", "Today's ideas")} line={t("flock.ideasAdmin.line", "Admin · next two weeks")} />
      </KyaHeader>
      <KyaBody>
        <div className="flex flex-col gap-3">
          {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
          <ol className="m-0 flex list-none flex-col gap-2 p-0" data-testid="idea-days">
            {list.map((d, i) => {
              const { week, day } = dayLabel(d.day, i18n.language);
              const isEmpty = !d.idea_id;
              return (
                <li key={d.day} className="flex items-center gap-3 rounded-[16px] bg-white p-3" data-day={d.day} data-state={isEmpty ? "empty" : d.status ?? ""}>
                  <span className="flex w-11 shrink-0 flex-col items-center leading-tight" style={{ color: K.quiet }}>
                    <span className="text-[12px] font-[700] uppercase">{week}</span>
                    <span className="text-[19px] font-[700]" style={{ color: K.forest }}>{day}</span>
                  </span>
                  <button type="button" onClick={() => open(d)} className="flex min-h-[48px] min-w-0 flex-1 flex-col items-start text-left" data-testid="idea-day-open">
                    {isEmpty ? (
                      <>
                        <span className="text-[15px] font-[700]" style={{ color: K.red }}>{t("flock.ideasAdmin.empty", "Empty · needs one")}</span>
                        <span className="text-[12.5px]" style={{ color: K.quiet }}>
                          {d.reused_title ? t("flock.ideasAdmin.reuses", "Reuses a favorite: {{title}}", { title: d.reused_title }) : t("flock.ideasAdmin.noFavorite", "No favorite to reuse yet, so Today shows no idea")}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-1.5 text-[15px] font-[700]" style={{ color: K.forest }}>
                          {d.is_favorite && <Star className="size-3.5" fill="currentColor" style={{ color: K.sunflower }} aria-label={t("flock.ideasAdmin.favorite", "Favorite")} />}
                          {d.title}
                        </span>
                        <span className="text-[12.5px]" style={{ color: K.quiet }}>{d.category ? categoryLabel(t, d.category) : ""}</span>
                      </>
                    )}
                  </button>
                  {!isEmpty && (
                    <span className="rounded-full px-2.5 py-1 text-[12px] font-[700]" data-testid="idea-status"
                      style={d.status === "ready" ? { background: K.lime, color: K.forest } : { background: K.amberBg, color: K.amberText }}>
                      {d.status === "ready" ? t("flock.ideasAdmin.ready", "Ready") : t("flock.ideasAdmin.draft", "Draft")}
                    </span>
                  )}
                  <span className="flex flex-col">
                    <button type="button" disabled={busy || i === 0} onClick={() => void move(i, -1)} aria-label={t("flock.ideasAdmin.earlier", "Move earlier")}
                      className="grid size-8 place-items-center rounded-full disabled:opacity-30" style={{ color: K.forest }}><ArrowUp className="size-4" aria-hidden="true" /></button>
                    <button type="button" disabled={busy || i === list.length - 1} onClick={() => void move(i, 1)} aria-label={t("flock.ideasAdmin.later", "Move later")}
                      className="grid size-8 place-items-center rounded-full disabled:opacity-30" style={{ color: K.forest }}><ArrowDown className="size-4" aria-hidden="true" /></button>
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="m-0 text-[13.5px]" style={{ color: K.quiet }}>
            {t("flock.ideasAdmin.help", "Drafts don't publish until marked ready. An empty day reuses a favorite from the archive.")}
          </p>
          {(others ?? []).length > 0 && (
            <section className="flex flex-col gap-2" data-testid="idea-archive">
              <KyaHeading size={18} as="h2">{t("flock.ideasAdmin.notScheduled", "Not on a day, and the archive")}</KyaHeading>
              {(others ?? []).map((o) => (
                <button key={o.idea_id} type="button" className="flex min-h-[52px] items-center gap-3 rounded-[14px] bg-white px-3 text-left"
                  onClick={() => setEditing({ id: o.idea_id, title: o.title, category: o.category, body: o.body, photoPath: null, status: o.status, isFavorite: o.is_favorite, scheduledOn: o.scheduled_on })}>
                  <span className="flex flex-1 flex-col">
                    <span className="text-[15px] font-[700]" style={{ color: K.forest }}>{o.is_favorite ? "★ " : ""}{o.title}</span>
                    <span className="text-[12.5px]" style={{ color: K.quiet }}>
                      {[categoryLabel(t, o.category), o.scheduled_on ?? t("flock.ideasAdmin.noDay", "No day"), o.status === "ready" ? t("flock.ideasAdmin.ready", "Ready") : t("flock.ideasAdmin.draft", "Draft")].join(" · ")}
                    </span>
                  </span>
                </button>
              ))}
            </section>
          )}
        </div>
      </KyaBody>
      {editing && <IdeaSheet initial={editing} onClose={() => setEditing(null)} onSaved={async () => { await invalidate(); setEditing(null); }} />}
    </KyaPage>
  );
}

function IdeaSheet({ initial, onClose, onSaved }: { initial: IdeaDraft; onClose: () => void; onSaved: () => Promise<void> }) {
  const { t } = useTranslation();
  const [d, setD] = useState<IdeaDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<IdeaDraft>) => setD((x) => ({ ...x, ...p }));
  const save = async () => {
    setBusy(true); setError(null);
    try { await saveIdea(d); await onSaved(); }
    catch (e) {
      const code = (e as { code?: string })?.code;
      setError(code === "23505" ? t("flock.ideasAdmin.dayTaken", "That day already has an idea. Pick another day or move that one first.") : t("flock.review.error", "That didn't save. Try again."));
      setBusy(false);
    }
  };
  const field = "rounded-[14px] border p-3 text-[15px] font-normal outline-none";
  return (
    <KyaSheet onClose={onClose} closeLabel={t("flock.region.close", "Close")}
      title={<KyaHeading size={23}>{d.id ? t("flock.ideasAdmin.edit", "Edit idea") : t("flock.ideasAdmin.new", "New idea")}</KyaHeading>}>
      <div className="flex flex-col gap-3" data-testid="idea-sheet">
        <label className="flex flex-col gap-1.5 text-[14px] font-[700]" style={{ color: K.forest }}>
          {t("flock.ideasAdmin.titleLabel", "Title")}
          <input value={d.title} maxLength={100} onChange={(e) => set({ title: e.target.value })} className={field} style={{ borderColor: "#c9d3c8" }} data-testid="idea-title" />
        </label>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("flock.ideasAdmin.category", "Category")}>
          {IDEA_CATEGORIES.map((c: IdeaCategory) => (
            <button key={c} type="button" role="radio" aria-checked={d.category === c} onClick={() => set({ category: c })} data-category={c}
              className="min-h-[40px] rounded-full px-3.5 text-[14px] font-[700]"
              style={d.category === c ? { background: K.lime, border: `2px solid ${K.forest}` } : { background: "#fff", border: "1px solid #c9d3c8" }}>
              {categoryLabel(t, c)}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1.5 text-[14px] font-[700]" style={{ color: K.forest }}>
          {t("flock.ideasAdmin.bodyLabel", "A few lines")}
          <textarea value={d.body} maxLength={600} rows={4} onChange={(e) => set({ body: e.target.value })} className={`${field} resize-none`} style={{ borderColor: "#c9d3c8" }} data-testid="idea-body" />
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] font-[700]" style={{ color: K.forest }}>
          {t("flock.ideasAdmin.day", "Day")}
          <input type="date" value={d.scheduledOn ?? ""} onChange={(e) => set({ scheduledOn: e.target.value || null })} className={field} style={{ borderColor: "#c9d3c8" }} data-testid="idea-day" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { set({ photoPath: await uploadPostPhoto(f) }); } catch { setError(t("flock.posts.photoError", "We couldn't add that photo. Try again.")); } }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[14px] font-[700]" style={{ borderColor: "#c9d3c8", color: K.forest }}>
            <Camera className="size-4" aria-hidden="true" />{d.photoPath ? t("flock.ideasAdmin.photoAdded", "Photo added") : t("flock.ideasAdmin.photo", "Add a photo (optional)")}
          </button>
        </div>
        <div className="flex gap-2" role="radiogroup" aria-label={t("flock.ideasAdmin.statusLabel", "Status")}>
          {(["draft", "ready"] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={d.status === s} onClick={() => set({ status: s })} data-status={s}
              className="min-h-[44px] flex-1 rounded-full text-[14px] font-[700]"
              style={d.status === s ? { background: K.forest, color: "#fff" } : { background: K.mist, color: K.forest }}>
              {s === "ready" ? t("flock.ideasAdmin.ready", "Ready") : t("flock.ideasAdmin.draft", "Draft")}
            </button>
          ))}
        </div>
        <label className="flex min-h-[44px] items-center gap-2.5 text-[15px] font-[700]" style={{ color: K.forest }}>
          <input type="checkbox" checked={d.isFavorite} onChange={(e) => set({ isFavorite: e.target.checked })} className="size-5" />
          {t("flock.ideasAdmin.favoriteLabel", "Favorite (can be reused on an empty day)")}
        </label>
        {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }}>{error}</p>}
        <KyaPrimaryButton onClick={() => void save()} disabled={busy || !d.title.trim() || !d.body.trim()}>
          {busy ? t("flock.idea.saving", "Saving…") : t("flock.ideasAdmin.save", "Save idea")}
        </KyaPrimaryButton>
        {d.id && (
          <button type="button" onClick={async () => { setBusy(true); try { await deleteIdea(d.id!); await onSaved(); } catch { setBusy(false); } }} disabled={busy}
            className="min-h-[44px] text-[15px] font-[700]" style={{ color: K.red }}>{t("flock.ideasAdmin.delete", "Delete idea")}</button>
        )}
      </div>
    </KyaSheet>
  );
}
