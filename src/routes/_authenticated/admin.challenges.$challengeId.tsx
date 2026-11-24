import { useId, useState, type ReactNode } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaBackRow, KyaBody, KyaField, KyaHeader, KyaPage, KyaPrimaryButton, KyaSecondaryButton, KyaTitle } from "@/components/kya";
import { AdminOnly } from "@/components/flock/AdminOnly";
import { challengeDay, challengeStateLabel, statePillStyle } from "@/components/flock/ChallengeParts";
import { FLOCK_ENABLED_QUERY } from "@/lib/flock";
import { useRegions } from "@/lib/flockData";
import { useFormInProgress } from "@/lib/formsInProgress";
import { useJourneyTemplates } from "@/lib/journeyData";
import {
  challengeError, challengeProblems, challengeTemplateAllowed, CHALLENGE_LIMITS, deleteChallenge, flockTodayIso, parsePrompts,
  pinChallengeEntry, saveChallenge, scheduleChallenge, unscheduleChallenge, useAdminChallenge, useFeaturableEntries,
  useInvalidateChallenges, wrapUpChallenge,
  type AdminChallenge, type ChallengeDraft, type ChallengeProblem, type ChallengeState,
} from "@/lib/flockChallenges";

// One challenge, for admins (backlog 1.10, SpecChallenges screen 3). Before it
// starts: Journey or Standalone first, then the title, a short description,
// the journey or the prompts (one per line), the days and who it's for; Save
// draft, Schedule challenge, Move back to draft, Delete. Once it has started:
// pin an entry; once closed: the wrap-up and its featured entries. Pinning and
// featuring list only entries whose authors said yes. "new" makes a new
// draft. Behind the Flock gate, then admins.
export const Route = createFileRoute("/_authenticated/admin/challenges/$challengeId")({
  head: () => ({ meta: [{ title: "Edit challenge — Kya & Co." }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => <AdminOnly><ChallengeAdminLoader /></AdminOnly>,
});

const ID = /^[0-9a-f-]{36}$/i;

function emptyDraft(): ChallengeDraft {
  return { id: null, kind: "standalone", title: "", description: "", template_slug: "", prompts: [], region_slug: null, starts_on: "", ends_on: "" };
}
function draftFrom(c: AdminChallenge): ChallengeDraft {
  return {
    id: c.challenge_id, kind: c.kind, title: c.title, description: c.description ?? "", template_slug: c.template_slug ?? "",
    prompts: c.prompts, region_slug: c.region_slug, starts_on: c.starts_on, ends_on: c.ends_on,
  };
}

function ChallengeAdminLoader() {
  const { challengeId } = Route.useParams();
  const isNew = challengeId === "new";
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: c, isLoading } = useAdminChallenge(isNew || !ID.test(challengeId) ? null : challengeId);
  if (!isNew && isLoading) {
    return <KyaPage><div className="grid min-h-[60vh] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-8 animate-spin" style={{ color: K.moss }} /></div></KyaPage>;
  }
  if (!isNew && !c) {
    return (
      <KyaPage>
        <KyaHeader>
          <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/admin/challenges" })} />
          <KyaTitle title={t("flock.challengesAdmin.missing", "Challenge not found")} line={t("flock.challengesAdmin.missingLine", "It may have been deleted.")} />
        </KyaHeader>
      </KyaPage>
    );
  }
  if (c && (c.state === "open" || c.state === "closed")) return <StartedChallenge key={c.challenge_id} c={c} />;
  return <Editor key={c?.challenge_id ?? "new"} initial={c ? draftFrom(c) : emptyDraft()} state={c?.state ?? "draft"} />;
}

function Shell({ title, line, state, children }: { title: string; line: string; state: ChallengeState; children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/admin/challenges" })}
          right={<span className="rounded-full px-3 py-1 text-[13px] font-[700]" data-testid="editor-status" style={statePillStyle(state)}>{challengeStateLabel(t, state)}</span>} />
        <KyaTitle title={title} line={line} />
      </KyaHeader>
      <KyaBody><div className="flex flex-col gap-4" style={{ color: K.forest }}>{children}</div></KyaBody>
    </KyaPage>
  );
}

function Editor({ initial, state }: { initial: ChallengeDraft; state: ChallengeState }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateChallenges();
  const { data: templates } = useJourneyTemplates();
  const { data: regions } = useRegions();
  const ids = { title: useId(), description: useId(), prompts: useId(), starts: useId(), ends: useId() };
  const [d, setD] = useState<ChallengeDraft>(initial);
  const [promptText, setPromptText] = useState(initial.prompts.join("\n"));
  const [busy, setBusy] = useState<null | "save" | "schedule" | "unschedule" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useFormInProgress(dirty && busy === null);
  const allowed = (templates ?? []).filter(challengeTemplateAllowed);
  const chapters = (regions ?? []).filter((r) => r.slug !== "other");
  const scheduled = state === "upcoming";

  const set = (p: Partial<ChallengeDraft>) => { setD((x) => ({ ...x, ...p })); setDirty(true); setNotice(null); };
  const problemText: Record<ChallengeProblem, string> = {
    title: t("flock.challengesAdmin.needTitle", "a title"),
    template: t("flock.challengesAdmin.needTemplate", "a journey"),
    prompts: t("flock.challengesAdmin.needPrompts", "at least one prompt"),
    promptLength: t("flock.challengesAdmin.needShortPrompts", "prompts of 140 characters or fewer"),
    dates: t("flock.challengesAdmin.needDates", "a start day and an end day on or after it"),
    past: t("flock.challengesAdmin.needFuture", "a start day that's today or later"),
  };
  const fail = (e: unknown) => {
    const c = challengeError(e);
    const code = (e as { code?: string })?.code;
    setError(c === "challenge_overlap"
      ? t("flock.challengesAdmin.overlap", "Another challenge for the same group runs on some of those days. Pick other days, or move that one.")
      : c === "no_food_challenges"
        ? t("flock.challengesAdmin.noFood", "Challenges can't be about food or diet. Pick another journey.")
        : c === "started_challenges_stay"
          ? t("flock.challengesAdmin.started", "This challenge has started, so it can't be changed now.")
          : code === "22023" || code === "23514"
            ? t("flock.challengesAdmin.checkError", "Something in the form isn't allowed. Check the title, the prompts and the days, then try again.")
            : t("flock.review.error", "That didn't save. Try again."));
  };
  const current = (): ChallengeDraft => ({ ...d, prompts: parsePrompts(promptText) });
  const persist = async (): Promise<string> => {
    const id = await saveChallenge(current());
    setD((x) => ({ ...x, id }));
    setDirty(false);
    await invalidate();
    return id;
  };
  const save = async () => {
    if (!d.title.trim()) { setError(t("flock.challengesAdmin.needTitleFirst", "Add a title first.")); return; }
    if (!d.starts_on || !d.ends_on || d.ends_on < d.starts_on) { setError(t("flock.challengesAdmin.needDatesFirst", "Pick a start day and an end day on or after it.")); return; }
    setBusy("save"); setError(null);
    try {
      const wasNew = !d.id;
      const id = await persist();
      setNotice(scheduled ? t("flock.challengesAdmin.savedScheduled", "Saved. It's still scheduled.") : t("flock.challengesAdmin.savedDraft", "Draft saved. Only admins can see it."));
      if (wasNew) void navigate({ to: "/admin/challenges/$challengeId", params: { challengeId: id }, replace: true });
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const problems = challengeProblems(current(), flockTodayIso());
  const schedule = async () => {
    if (problems.length) {
      setError(t("flock.challengesAdmin.cantSchedule", "Add {{what}} before scheduling.", { what: problems.map((p) => problemText[p]).join(", ") }));
      return;
    }
    setBusy("schedule"); setError(null);
    try {
      const id = await persist();
      await scheduleChallenge(id);
      await invalidate();
      void navigate({ to: "/admin/challenges", replace: true });
    } catch (e) { fail(e); setBusy(null); }
  };
  const unschedule = async () => {
    if (!d.id) return;
    setBusy("unschedule"); setError(null);
    try { await unscheduleChallenge(d.id); await invalidate(); } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const remove = async () => {
    setBusy("delete"); setError(null);
    try {
      if (d.id) await deleteChallenge(d.id);
      await invalidate();
      setDirty(false);
      void navigate({ to: "/admin/challenges", replace: true });
    } catch (e) { fail(e); setBusy(null); }
  };

  const field = "w-full rounded-[16px] border-[1.5px] bg-white p-3.5 text-[16px] outline-none focus:border-[#2d6a4f]";
  return (
    <Shell title={d.id ? t("flock.challengesAdmin.edit", "Edit challenge") : t("flock.challengesAdmin.new", "New challenge")}
      line={scheduled
        ? t("flock.challengesAdmin.scheduledLine", "Scheduled. Members see it on its start day.")
        : t("flock.challengesAdmin.draftLine", "A draft. Only admins can see it.")} state={state}>
      <div className="flex flex-col gap-4" data-testid="challenge-form">
        <Group label={t("flock.challengesAdmin.kindLabel", "What kind of challenge?")}>
          <div className="flex gap-2" role="radiogroup" aria-label={t("flock.challengesAdmin.kindLabel", "What kind of challenge?")}>
            <KindCard on={d.kind === "journey"} onClick={() => set({ kind: "journey" })} data="kind-journey"
              title={t("flock.challengesAdmin.journey", "Journey")} line={t("flock.challengesAdmin.journeyLine", "Starts a journey template")} />
            <KindCard on={d.kind === "standalone"} onClick={() => set({ kind: "standalone" })} data="kind-standalone"
              title={t("flock.challengesAdmin.standalone", "Standalone")} line={t("flock.challengesAdmin.standaloneLine", "Your own list of prompts")} />
          </div>
        </Group>
        <KyaField id={ids.title} label={t("flock.challengesAdmin.titleLabel", "Title")} value={d.title} maxLength={CHALLENGE_LIMITS.title}
          placeholder={t("flock.challengesAdmin.titlePlaceholder", "Foraging week: a new idea every day")}
          onChange={(e) => set({ title: e.target.value })} data-testid="challenge-title" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.description} className="text-[13.5px] font-[700]">{t("flock.challengesAdmin.descriptionLabel", "Short description (optional)")}</label>
          <textarea id={ids.description} value={d.description} maxLength={CHALLENGE_LIMITS.description} rows={3} onChange={(e) => set({ description: e.target.value })}
            className={`${field} resize-none`} style={{ borderColor: "#d5dfd5", color: K.forest }} data-testid="challenge-description" />
        </div>
        {d.kind === "journey" ? (
          <Group label={t("flock.challengesAdmin.templateLabel", "Journey")}
            hint={t("flock.challengesAdmin.templateHint", "Diet conversion and other food journeys can't be challenges.")}>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("flock.challengesAdmin.templateLabel", "Journey")} data-testid="challenge-templates">
              {allowed.map((tp) => (
                <Choice key={tp.slug} on={d.template_slug === tp.slug} onClick={() => set({ template_slug: tp.slug })} data={tp.slug}>{tp.name}</Choice>
              ))}
            </div>
          </Group>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={ids.prompts} className="text-[13.5px] font-[700]">{t("flock.challengesAdmin.promptsLabel", "Prompts")}</label>
            <textarea id={ids.prompts} value={promptText} rows={7} onChange={(e) => { setPromptText(e.target.value); setDirty(true); setNotice(null); }}
              placeholder={t("flock.challengesAdmin.promptsPlaceholder", "One prompt per line, in order")}
              className={`${field} resize-y`} style={{ borderColor: "#d5dfd5", color: K.forest }} data-testid="challenge-prompts-input" />
            <p className="m-0 px-1 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>
              {t("flock.challengesAdmin.promptsHint", "One per line, up to 30. Members finish by posting an entry for each.")}
            </p>
          </div>
        )}
        <div className="flex gap-2.5">
          <div className="min-w-0 flex-1">
            <KyaField id={ids.starts} type="date" label={t("flock.challengesAdmin.starts", "Starts")} value={d.starts_on}
              onChange={(e) => set({ starts_on: e.target.value })} data-testid="challenge-starts" />
          </div>
          <div className="min-w-0 flex-1">
            <KyaField id={ids.ends} type="date" label={t("flock.challengesAdmin.ends", "Ends")} value={d.ends_on}
              onChange={(e) => set({ ends_on: e.target.value })} data-testid="challenge-ends" />
          </div>
        </div>
        <p className="-mt-2 m-0 px-1 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>
          {t("flock.challengesAdmin.daysHint", "Days in Eastern time, the Flock's day. Both days count.")}
        </p>
        <Group label={t("flock.challengesAdmin.audienceLabel", "Who it's for")}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("flock.challengesAdmin.audienceLabel", "Who it's for")} data-testid="challenge-audience">
            <Choice on={d.region_slug === null} onClick={() => set({ region_slug: null })} data="flock">{t("flock.challengesAdmin.wholeFlock", "The whole Flock")}</Choice>
            {chapters.map((r) => (
              <Choice key={r.slug} on={d.region_slug === r.slug} onClick={() => set({ region_slug: r.slug })} data={r.slug}>{r.name}</Choice>
            ))}
          </div>
        </Group>
        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }} data-testid="challenge-error">{error}</p>}
        {notice && <p role="status" className="m-0 text-[15px]" style={{ color: K.moss }}>{notice}</p>}
        {scheduled ? (
          <>
            <KyaPrimaryButton onClick={() => void save()} disabled={busy !== null}>{busy === "save" ? t("flock.challengesAdmin.saving", "Saving…") : t("flock.challengesAdmin.saveChanges", "Save changes")}</KyaPrimaryButton>
            <KyaSecondaryButton onClick={() => void unschedule()} disabled={busy !== null}>{t("flock.challengesAdmin.unschedule", "Move back to draft")}</KyaSecondaryButton>
          </>
        ) : (
          <>
            <KyaPrimaryButton onClick={() => void schedule()} disabled={busy !== null}>
              {busy === "schedule" ? t("flock.challengesAdmin.scheduling", "Scheduling…") : t("flock.challengesAdmin.schedule", "Schedule challenge")}
            </KyaPrimaryButton>
            <KyaSecondaryButton onClick={() => void save()} disabled={busy !== null}>{busy === "save" ? t("flock.challengesAdmin.saving", "Saving…") : t("flock.challengesAdmin.saveDraft", "Save draft")}</KyaSecondaryButton>
            {d.id && (confirmDelete ? (
              <div className="flex flex-col gap-2 rounded-[16px] bg-white p-3.5">
                <span className="text-[14.5px]">{t("flock.challengesAdmin.deleteConfirmLine", "Delete this draft? This can't be undone.")}</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => void remove()} disabled={busy !== null} className="min-h-[44px] flex-1 rounded-full text-[14.5px] font-[700] text-white" style={{ background: K.red }}>
                    {t("flock.challengesAdmin.deleteConfirm", "Delete draft")}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-[44px] flex-1 rounded-full text-[14.5px] font-[700]" style={{ border: `1.5px solid ${K.line}` }}>
                    {t("flock.challengesAdmin.keep", "Keep it")}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-[44px] text-[14.5px] font-[700]" style={{ color: K.red }} data-testid="challenge-delete">
                {t("flock.challengesAdmin.delete", "Delete draft")}
              </button>
            ))}
          </>
        )}
      </div>
    </Shell>
  );
}

/** Open or closed: the summary, the pinned entry and, once closed, the wrap-up. */
function StartedChallenge({ c }: { c: AdminChallenge }) {
  const { t, i18n } = useTranslation();
  const invalidate = useInvalidateChallenges();
  const closed = c.state === "closed";
  const { data: entries } = useFeaturableEntries(c.challenge_id, true);
  const [text, setText] = useState(c.wrap_up ?? "");
  const [featured, setFeatured] = useState<string[]>(c.featured_post_ids);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const textId = useId();
  useFormInProgress(!busy && (text !== (c.wrap_up ?? "") || featured.join() !== c.featured_post_ids.join()));
  const act = async (fn: () => Promise<void>, done: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); await invalidate(); setNotice(done); }
    catch (e) {
      setError(challengeError(e) === "feature_needs_permission"
        ? t("flock.challengesAdmin.needsPermission", "Only entries whose authors said yes to being featured can be pinned or featured.")
        : t("flock.review.error", "That didn't save. Try again."));
    } finally { setBusy(false); }
  };
  return (
    <Shell title={c.title} state={c.state}
      line={`${c.kind === "journey" ? t("flock.challengesAdmin.journey", "Journey") : t("flock.challengesAdmin.standalone", "Standalone")} · ${challengeDay(c.starts_on, i18n.language)} – ${challengeDay(c.ends_on, i18n.language)}`}>
      <Link to="/flock/challenges/$challengeId" params={{ challengeId: c.challenge_id }} className="inline-flex min-h-[44px] items-center text-[15px] font-[700]" style={{ color: K.moss }}>
        {t("flock.challengesAdmin.openPage", "Open the challenge page")}
      </Link>
      <Group label={t("flock.challengesAdmin.entriesLabel", "Entries you may feature")}
        hint={t("flock.challengesAdmin.entriesHint", "Only entries whose authors said \"It's OK to feature my entries.\" Pin one for everyone to see first.")}>
        {(entries ?? []).length === 0 ? (
          <p className="m-0 rounded-[16px] bg-white p-3.5 text-[14.5px]" style={{ color: K.ink }} data-testid="featurable-empty">
            {t("flock.challengesAdmin.noFeaturable", "No entries to feature yet.")}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="featurable-list">
            {(entries ?? []).map((e) => (
              <li key={e.post_id} className="flex flex-col gap-2 rounded-[16px] bg-white p-3.5" data-entry={e.post_id}>
                <span className="text-[13px] font-[700]" style={{ color: K.moss }}>{e.author_name ?? ""}</span>
                <span className="line-clamp-3 text-[14.5px] leading-[1.45]">{e.body}</span>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={busy} data-testid="pin-entry"
                    onClick={() => void act(() => pinChallengeEntry(c.challenge_id, c.pinned_post_id === e.post_id ? null : e.post_id),
                      c.pinned_post_id === e.post_id ? t("flock.challengesAdmin.unpinned", "Unpinned.") : t("flock.challengesAdmin.pinnedDone", "Pinned."))}
                    className="min-h-[40px] rounded-full px-3.5 text-[14px] font-[700]"
                    style={c.pinned_post_id === e.post_id ? { background: K.forest, color: "#fff" } : { border: `1.5px solid ${K.line}` }}>
                    {c.pinned_post_id === e.post_id ? t("flock.challengesAdmin.unpin", "Unpin") : t("flock.challengesAdmin.pin", "Pin")}
                  </button>
                  {closed && (
                    <button type="button" aria-pressed={featured.includes(e.post_id)} data-testid="feature-entry"
                      onClick={() => setFeatured((f) => (f.includes(e.post_id) ? f.filter((x) => x !== e.post_id) : [...f, e.post_id].slice(0, CHALLENGE_LIMITS.maxFeatured)))}
                      className="min-h-[40px] rounded-full px-3.5 text-[14px] font-[700]"
                      style={featured.includes(e.post_id) ? { background: K.lime, border: `2px solid ${K.forest}` } : { border: `1.5px solid ${K.line}` }}>
                      {featured.includes(e.post_id) ? t("flock.challengesAdmin.featuredOn", "In the wrap-up") : t("flock.challengesAdmin.feature", "Feature in the wrap-up")}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Group>
      {closed ? (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={textId} className="text-[13.5px] font-[700]">{t("flock.challengesAdmin.wrapUpLabel", "Wrap-up")}</label>
            <textarea id={textId} value={text} maxLength={CHALLENGE_LIMITS.wrapUp} rows={5} onChange={(e) => setText(e.target.value)}
              placeholder={t("flock.challengesAdmin.wrapUpPlaceholder", "A note for everyone who took part. It shows at the top of the challenge page.")}
              className="w-full resize-none rounded-[16px] border-[1.5px] bg-white p-3.5 text-[16px] outline-none focus:border-[#2d6a4f]"
              style={{ borderColor: "#d5dfd5", color: K.forest }} data-testid="wrap-up-text" />
          </div>
          <KyaPrimaryButton onClick={() => void act(() => wrapUpChallenge(c.challenge_id, text, featured), t("flock.challengesAdmin.wrapUpSaved", "Wrap-up saved."))} disabled={busy}>
            {t("flock.challengesAdmin.saveWrapUp", "Save the wrap-up")}
          </KyaPrimaryButton>
        </>
      ) : (
        <p className="m-0 text-[14px]" style={{ color: K.quiet }}>{t("flock.challengesAdmin.wrapUpLater", "You can write the wrap-up once the challenge closes.")}</p>
      )}
      {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{error}</p>}
      {notice && <p role="status" className="m-0 text-[15px]" style={{ color: K.moss }}>{notice}</p>}
    </Shell>
  );
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13.5px] font-[700]">{label}</span>
      {children}
      {hint && <p className="m-0 px-1 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>{hint}</p>}
    </div>
  );
}

function Choice({ on, onClick, children, data }: { on: boolean; onClick: () => void; children: ReactNode; data: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} data-choice={data}
      className="min-h-[44px] rounded-full px-4 text-[14.5px] font-[700]"
      style={on ? { background: K.forest, color: "#fff", border: `1.5px solid ${K.forest}` } : { background: "#fff", color: K.forest, border: `1.5px solid ${K.line}` }}>
      {children}
    </button>
  );
}

/** The two kind cards at the top (mockup screen 3). */
function KindCard({ on, onClick, title, line, data }: { on: boolean; onClick: () => void; title: string; line: string; data: string }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} data-choice={data}
      className="flex min-h-[64px] flex-1 flex-col items-start gap-0.5 rounded-[14px] bg-white p-2.5 text-left"
      style={{ border: `2px solid ${on ? K.forest : K.line}` }}>
      <span className="text-[14px] font-[700] leading-[1.25]">{title}</span>
      <span className="text-[12px] leading-[1.45]" style={{ color: K.ink }}>{line}</span>
    </button>
  );
}
