import { useId, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Camera, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaBackRow, KyaBody, KyaField, KyaHeader, KyaPage, KyaPrimaryButton, KyaSecondaryButton, KyaTitle } from "@/components/kya";
import { AdminOnly } from "@/components/flock/AdminOnly";
import { AdminCounts, AdminVoteOutcome, ChoicePhoto, voteStateLabel } from "@/components/flock/VoteParts";
import { FLOCK_ENABLED_QUERY } from "@/lib/flock";
import { useIsAdmin } from "@/lib/flockData";
import { useFormInProgress } from "@/lib/formsInProgress";
import {
  announceVote, closeVote, deleteVoteDraft, draftFromVote, emptyVoteDraft, extendVote, newChoice, openProblems, openVote, removeVotePhotos,
  saveVoteDraft, toLocalInput, uploadChoicePhoto, useInvalidateVotes, useVote, useVotePhotoUrls, voteDay, VOTE_LIMITS, VotePhotoError,
  type Vote, type VoteDraft, type VoteProblem,
} from "@/lib/flockVotes";

// One vote, for admins (backlog 1.8). A draft: question, description,
// audience, close date and two to eight choices (name, a sentence or two, the
// partner's logo or a photo), then Save draft, Open vote or Delete. Once open: the counts, Close
// early, Extend, and the announcement. Once closed: the results and the
// announcement. "new" makes a new draft. Behind the Flock gate, then admins.
export const Route = createFileRoute("/_authenticated/admin/votes/$voteId")({
  head: () => ({ meta: [{ title: "Edit vote — Kya & Co." }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => <AdminOnly><VoteAdminLoader /></AdminOnly>,
});

const ID = /^[0-9a-f-]{36}$/i;

function VoteAdminLoader() {
  const { voteId } = Route.useParams();
  const isNew = voteId === "new";
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: vote, isLoading } = useVote(isNew || !ID.test(voteId) ? "00000000-0000-0000-0000-000000000000" : voteId);
  if (!isNew && isLoading) {
    return <KyaPage><div className="grid min-h-[60vh] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-8 animate-spin" style={{ color: K.moss }} /></div></KyaPage>;
  }
  if (!isNew && !vote) {
    return (
      <KyaPage>
        <KyaHeader>
          <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/admin/votes" })} />
          <KyaTitle title={t("flock.votesAdmin.missing", "Vote not found")} line={t("flock.votesAdmin.missingLine", "It may have been deleted.")} />
        </KyaHeader>
      </KyaPage>
    );
  }
  if (vote && vote.state !== "draft") return <LiveVote key={vote.vote_id} vote={vote} />;
  return <DraftEditor key={vote?.vote_id ?? "new"} initial={vote ? draftFromVote(vote) : emptyVoteDraft()} />;
}

function Shell({ title, line, state, children }: { title: string; line: string; state: Vote["state"]; children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/admin/votes" })}
          right={(
            <span className="rounded-full px-3 py-1 text-[13px] font-[700]" data-testid="editor-status"
              style={state === "open" ? { background: K.lime, color: K.forest } : state === "draft" ? { background: K.amberBg, color: K.amberText } : { background: "#fff", color: K.forest }}>
              {voteStateLabel(t, state)}
            </span>
          )} />
        <KyaTitle title={title} line={line} />
      </KyaHeader>
      <KyaBody><div className="flex flex-col gap-4" style={{ color: K.forest }}>{children}</div></KyaBody>
    </KyaPage>
  );
}

const PROBLEM: Record<VoteProblem, string> = {
  question: "the question",
  choices: "two to eight choices",
  choiceName: "a name for every choice",
  closes: "a close date that's still ahead",
};

function DraftEditor({ initial }: { initial: VoteDraft }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateVotes();
  const ids = { question: useId(), description: useId(), closes: useId() };
  const [d, setD] = useState<VoteDraft>(initial);
  // Photos the saved version uses, to know which a save or delete leaves behind.
  const savedPhotos = useRef<string[]>(initial.choices.flatMap((c) => (c.photo_path ? [c.photo_path] : [])));
  const [busy, setBusy] = useState<null | "save" | "open" | "photo" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useFormInProgress(dirty && busy === null);
  const { data: urls } = useVotePhotoUrls(d.choices.map((c) => c.photo_path));

  const set = (p: Partial<VoteDraft>) => { setD((x) => ({ ...x, ...p })); setDirty(true); setNotice(null); };
  const setChoice = (key: string, p: Partial<VoteDraft["choices"][number]>) => set({ choices: d.choices.map((c) => (c.key === key ? { ...c, ...p } : c)) });
  const move = (i: number, dir: -1 | 1) => {
    const next = [...d.choices];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ choices: next });
  };
  const unsavedPhotos = (paths: (string | null)[]) => paths.filter((p): p is string => !!p && !savedPhotos.current.includes(p));

  const persist = async (): Promise<string> => {
    const id = await saveVoteDraft(d);
    const now = d.choices.flatMap((c) => (c.photo_path ? [c.photo_path] : []));
    await removeVotePhotos(savedPhotos.current.filter((p) => !now.includes(p)));
    savedPhotos.current = now;
    setD((x) => ({ ...x, id }));
    setDirty(false);
    await invalidate();
    return id;
  };
  const fail = (e: unknown) => {
    const code = (e as { code?: string })?.code;
    setError(code === "22023" || code === "23514"
      ? t("flock.votesAdmin.checkError", "Something in the form isn't allowed. Check the question, the choices and the date, then try again.")
      : t("flock.review.error", "That didn't save. Try again."));
  };

  const save = async () => {
    if (!d.question.trim()) { setError(t("flock.votesAdmin.needQuestion", "Add the question first.")); return; }
    setBusy("save"); setError(null);
    try {
      const wasNew = !d.id;
      const id = await persist();
      setNotice(t("flock.votesAdmin.savedDraft", "Draft saved. Only admins can see it."));
      if (wasNew) void navigate({ to: "/admin/votes/$voteId", params: { voteId: id }, replace: true });
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const problems = openProblems(d);
  const open = async () => {
    if (problems.length) {
      setError(t("flock.votesAdmin.cantOpen", "Add {{what}} before opening.", { what: problems.map((p) => PROBLEM[p]).join(", ") }));
      return;
    }
    setBusy("open"); setError(null);
    try {
      const id = await persist();
      await openVote(id);
      await invalidate();
      void navigate({ to: "/admin/votes/$voteId", params: { voteId: id }, replace: true });
    } catch (e) { fail(e); setBusy(null); }
  };
  const pick = async (file: File | undefined) => {
    const key = photoFor;
    if (!file || !key) return;
    setBusy("photo"); setError(null);
    try {
      const path = await uploadChoicePhoto(file);
      const prev = d.choices.find((c) => c.key === key)?.photo_path ?? null;
      await removeVotePhotos(unsavedPhotos([prev]));
      setChoice(key, { photo_path: path });
    } catch (e) {
      setError(e instanceof VotePhotoError ? e.message : t("flock.review.error", "That didn't save. Try again."));
    } finally { setBusy(null); setPhotoFor(null); }
  };
  const remove = async () => {
    setBusy("delete"); setError(null);
    try {
      if (d.id) await deleteVoteDraft(d.id);
      await removeVotePhotos(unsavedPhotos(d.choices.map((c) => c.photo_path)));
      await invalidate();
      setDirty(false);
      void navigate({ to: "/admin/votes", replace: true });
    } catch (e) { fail(e); setBusy(null); }
  };

  const field = "w-full rounded-[16px] border-[1.5px] bg-white p-3.5 text-[16px] outline-none focus:border-[#2d6a4f]";
  return (
    <Shell title={d.id ? t("flock.votesAdmin.edit", "Edit vote") : t("flock.votesAdmin.new", "New vote")}
      line={t("flock.votesAdmin.draftLine", "A draft. Only admins can see it.")} state="draft">
      <div className="flex flex-col gap-4" data-testid="vote-form">
        <KyaField id={ids.question} label={t("flock.votesAdmin.questionLabel", "Question")} value={d.question} maxLength={VOTE_LIMITS.question}
          placeholder={t("flock.votesAdmin.questionPlaceholder", "Where should this quarter's donation go?")}
          onChange={(e) => set({ question: e.target.value })} data-testid="vote-question" />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.description} className="text-[13.5px] font-[700]">{t("flock.votesAdmin.descriptionLabel", "Short description (optional)")}</label>
          <textarea id={ids.description} value={d.description} maxLength={VOTE_LIMITS.description} rows={3} onChange={(e) => set({ description: e.target.value })}
            className={`${field} resize-none`} style={{ borderColor: "#d5dfd5", color: K.forest }} data-testid="vote-description" />
        </div>

        <Group label={t("flock.votesAdmin.audienceLabel", "Who votes")}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("flock.votesAdmin.audienceLabel", "Who votes")}>
            <Choice on={d.audience === "members"} onClick={() => set({ audience: "members" })} data="audience-members">{t("flock.votesAdmin.allMembers", "All members")}</Choice>
            <Choice on={d.audience === "founders"} onClick={() => set({ audience: "founders" })} data="audience-founders">{t("flock.votesAdmin.foundersOnly", "Founders only")}</Choice>
          </div>
        </Group>

        <KyaField id={ids.closes} type="datetime-local" label={t("flock.votesAdmin.closesLabel", "Closes")} value={d.closes_at}
          hint={t("flock.votesAdmin.closesHint", "Your local time. You can close it early or extend it once it's open.")}
          onChange={(e) => set({ closes_at: e.target.value })} data-testid="vote-closes" />

        <Group label={t("flock.votesAdmin.choicesLabel", "Choices")} hint={t("flock.votesAdmin.choicesHint", "Two to eight. Each has a name, a sentence or two, and the partner's logo or a photo. Every choice gets at least 10% of the donation, and the votes share out the rest.")}>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="choice-photo-input"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pick(f); }} />
          <div className="flex flex-col gap-2.5">
            {d.choices.map((c, i) => (
              <div key={c.key} className="flex flex-col gap-2 rounded-[16px] bg-white p-3" data-choice-edit={i}>
                <div className="flex items-center gap-2">
                  <ChoicePhoto name={c.name || String(i + 1)} photo={c.photo_path ? urls?.[c.photo_path] : undefined} index={i} size={48} />
                  <input value={c.name} maxLength={VOTE_LIMITS.choiceName} onChange={(e) => setChoice(c.key, { name: e.target.value })}
                    aria-label={t("flock.votesAdmin.choiceName", "Choice {{n}} name", { n: i + 1 })} placeholder={t("flock.votesAdmin.choiceNamePlaceholder", "Name")}
                    className="min-h-[44px] min-w-0 flex-1 rounded-[12px] border-[1.5px] px-3 text-[16px] outline-none" style={{ borderColor: "#d5dfd5", color: K.forest }} data-testid="choice-name" />
                </div>
                <textarea value={c.blurb} maxLength={VOTE_LIMITS.choiceBlurb} rows={2} onChange={(e) => setChoice(c.key, { blurb: e.target.value })}
                  aria-label={t("flock.votesAdmin.choiceBlurb", "Choice {{n}} description", { n: i + 1 })} placeholder={t("flock.votesAdmin.choiceBlurbPlaceholder", "A sentence or two")}
                  className="w-full resize-none rounded-[12px] border-[1.5px] p-3 text-[15px] outline-none" style={{ borderColor: "#d5dfd5", color: K.forest }} data-testid="choice-blurb" />
                <div className="flex flex-wrap items-center gap-1">
                  <MiniButton onClick={() => { setPhotoFor(c.key); fileRef.current?.click(); }} disabled={busy !== null} testId="choice-photo">
                    <Camera className="size-4" aria-hidden="true" />{busy === "photo" && photoFor === c.key ? t("flock.libraryAdmin.uploading", "Uploading…") : c.photo_path ? t("flock.votesAdmin.replaceLogo", "Replace logo") : t("flock.votesAdmin.addLogo", "Add logo or photo")}
                  </MiniButton>
                  {c.photo_path && (
                    <MiniButton onClick={() => { void removeVotePhotos(unsavedPhotos([c.photo_path])); setChoice(c.key, { photo_path: null }); }} disabled={busy !== null} testId="choice-photo-remove">
                      {t("flock.votesAdmin.removeLogo", "Remove")}
                    </MiniButton>
                  )}
                  <span className="flex-1" />
                  <IconButton label={t("flock.votesAdmin.moveUp", "Move choice {{n}} up", { n: i + 1 })} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-5" aria-hidden="true" /></IconButton>
                  <IconButton label={t("flock.votesAdmin.moveDown", "Move choice {{n}} down", { n: i + 1 })} disabled={i === d.choices.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-5" aria-hidden="true" /></IconButton>
                  <IconButton label={t("flock.votesAdmin.removeChoice", "Remove choice {{n}}", { n: i + 1 })} disabled={d.choices.length <= 1}
                    onClick={() => { void removeVotePhotos(unsavedPhotos([c.photo_path])); set({ choices: d.choices.filter((x) => x.key !== c.key) }); }}>
                    <Trash2 className="size-5" aria-hidden="true" />
                  </IconButton>
                </div>
              </div>
            ))}
            {d.choices.length < VOTE_LIMITS.maxChoices && (
              <KyaSecondaryButton onClick={() => set({ choices: [...d.choices, newChoice()] })} icon={<Plus className="size-4" aria-hidden="true" />}>
                {t("flock.votesAdmin.addChoice", "Add a choice")}
              </KyaSecondaryButton>
            )}
          </div>
        </Group>
      </div>

      {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }} data-testid="editor-error">{error}</p>}
      {notice && <p role="status" className="m-0 rounded-[14px] px-4 py-3 text-[15px] font-[700]" style={{ background: K.lime }} data-testid="editor-notice">{notice}</p>}
      {problems.length > 0 && (
        <p className="m-0 text-[13.5px]" style={{ color: K.quiet }} data-testid="open-needs">
          {t("flock.votesAdmin.toOpen", "To open it, add {{what}}.", { what: problems.map((p) => PROBLEM[p]).join(", ") })}
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        <KyaPrimaryButton onClick={() => void open()} disabled={busy !== null || problems.length > 0}>
          {busy === "open" ? t("flock.idea.saving", "Saving…") : t("flock.votesAdmin.openVote", "Open the vote")}
        </KyaPrimaryButton>
        <KyaSecondaryButton onClick={() => void save()} disabled={busy !== null || !d.question.trim()}>
          {busy === "save" ? t("flock.idea.saving", "Saving…") : t("flock.libraryAdmin.saveDraft", "Save draft")}
        </KyaSecondaryButton>
        {confirmDelete ? (
          <div className="flex flex-col gap-2 rounded-[16px] bg-white p-3" role="alertdialog" aria-label={t("flock.votesAdmin.deleteConfirm", "Delete this draft?")}>
            <p className="m-0 text-[15px]">{t("flock.votesAdmin.deleteConfirmLine", "Delete it for good, with its photos? This can't be undone.")}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-[44px] flex-1 rounded-full text-[15px] font-[700]" style={{ background: K.mist, color: K.forest }}>{t("flock.libraryAdmin.keep", "Keep it")}</button>
              <button type="button" onClick={() => void remove()} disabled={busy !== null} data-testid="delete-confirm" className="min-h-[44px] flex-1 rounded-full text-[15px] font-[700] text-white" style={{ background: K.red }}>
                {busy === "delete" ? t("flock.libraryAdmin.deleting", "Deleting…") : t("flock.libraryAdmin.deleteYes", "Delete")}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy !== null} data-testid="delete-vote"
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 text-[15px] font-[700]" style={{ color: K.red }}>
            <Trash2 className="size-4" aria-hidden="true" />{t("flock.votesAdmin.delete", "Delete draft")}
          </button>
        )}
      </div>
    </Shell>
  );
}

function LiveVote({ vote }: { vote: Vote }) {
  const { t, i18n } = useTranslation();
  const invalidate = useInvalidateVotes();
  const ids = { extend: useId(), note: useId() };
  const [extendTo, setExtendTo] = useState(toLocalInput(vote.closes_at));
  const [note, setNote] = useState(vote.announcement ?? "");
  const [busy, setBusy] = useState<null | "close" | "extend" | "note">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  useFormInProgress(note !== (vote.announcement ?? "") && busy === null);
  const open = vote.state === "open";

  const run = async (kind: "close" | "extend" | "note", fn: () => Promise<void>, done: string) => {
    setBusy(kind); setError(null); setNotice(null);
    try { await fn(); await invalidate(); setNotice(done); setConfirmClose(false); }
    catch (e) {
      const code = (e as { code?: string })?.code;
      setError(code === "22023" ? t("flock.votesAdmin.extendError", "Pick a later close date than the current one.") : t("flock.review.error", "That didn't save. Try again."));
    } finally { setBusy(null); }
  };

  const line = open
    ? t("flock.votesAdmin.openLine", "Open · closes {{day}} · {{count}} votes", { day: voteDay(vote.closes_at, i18n.language), count: vote.voters })
    : t("flock.votesAdmin.closedLine", "Closed {{day}} · {{count}} votes", { day: voteDay(vote.closes_at, i18n.language), count: vote.voters });
  return (
    <Shell title={vote.question} line={line} state={vote.state}>
      <p className="m-0 text-[14px]" style={{ color: K.ink }}>
        {vote.audience === "founders" ? t("flock.votesAdmin.foundersOnly", "Founders only") : t("flock.votesAdmin.allMembers", "All members")}
        {" · "}
        <Link to="/flock/votes/$voteId" params={{ voteId: vote.vote_id }} className="font-[700]" style={{ color: K.moss }}>{t("flock.votesAdmin.memberView", "See what members see")}</Link>
      </p>
      {open ? <AdminCounts vote={vote} /> : <AdminVoteOutcome vote={vote} />}

      {open && (
        <div className="flex flex-col gap-2.5 rounded-[20px] bg-white p-4" data-testid="vote-extend">
          <KyaField id={ids.extend} type="datetime-local" label={t("flock.votesAdmin.extendLabel", "Extend to")} value={extendTo} onChange={(e) => setExtendTo(e.target.value)} />
          <KyaSecondaryButton onClick={() => void run("extend", () => extendVote(vote.vote_id, extendTo), t("flock.votesAdmin.extended", "Extended. Members see the new close date."))}
            disabled={busy !== null || !extendTo}>
            {busy === "extend" ? t("flock.idea.saving", "Saving…") : t("flock.votesAdmin.extend", "Extend the vote")}
          </KyaSecondaryButton>
          {confirmClose ? (
            <div className="flex flex-col gap-2" role="alertdialog" aria-label={t("flock.votesAdmin.closeConfirm", "Close this vote now?")}>
              <p className="m-0 text-[15px]">{t("flock.votesAdmin.closeConfirmLine", "Voting stops now and everyone sees the results. This can't be undone.")}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmClose(false)} className="min-h-[44px] flex-1 rounded-full text-[15px] font-[700]" style={{ background: K.mist, color: K.forest }}>{t("flock.votesAdmin.keepOpen", "Keep it open")}</button>
                <button type="button" disabled={busy !== null} data-testid="close-confirm" className="min-h-[44px] flex-1 rounded-full text-[15px] font-[700] text-white" style={{ background: K.forest }}
                  onClick={() => void run("close", () => closeVote(vote.vote_id), t("flock.votesAdmin.closedNow", "Closed. Members now see the results."))}>
                  {busy === "close" ? t("flock.idea.saving", "Saving…") : t("flock.votesAdmin.closeYes", "Close now")}
                </button>
              </div>
            </div>
          ) : (
            <KyaSecondaryButton onClick={() => setConfirmClose(true)} disabled={busy !== null}>{t("flock.votesAdmin.closeEarly", "Close early")}</KyaSecondaryButton>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5" data-testid="vote-note">
        <label htmlFor={ids.note} className="text-[13.5px] font-[700]">{t("flock.votesAdmin.noteLabel", "Announcement")}</label>
        <textarea id={ids.note} value={note} maxLength={VOTE_LIMITS.announcement} rows={4} onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-[16px] border-[1.5px] bg-white p-3.5 text-[16px] outline-none focus:border-[#2d6a4f]" style={{ borderColor: "#d5dfd5", color: K.forest }} />
        <p className="m-0 px-1 text-[13px]" style={{ color: K.quiet }}>{t("flock.votesAdmin.noteHint", "Shows with the results as \"A note from Brittany\" once the vote closes.")}</p>
        <KyaSecondaryButton onClick={() => void run("note", () => announceVote(vote.vote_id, note), t("flock.votesAdmin.noteSaved", "Announcement saved."))} disabled={busy !== null}>
          {busy === "note" ? t("flock.idea.saving", "Saving…") : t("flock.votesAdmin.saveNote", "Save announcement")}
        </KyaSecondaryButton>
      </div>

      {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }} data-testid="editor-error">{error}</p>}
      {notice && <p role="status" className="m-0 rounded-[14px] px-4 py-3 text-[15px] font-[700]" style={{ background: K.lime }} data-testid="editor-notice">{notice}</p>}
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

function MiniButton({ onClick, disabled, children, testId }: { onClick: () => void; disabled?: boolean; children: ReactNode; testId: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId}
      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-[14px] font-[700] disabled:opacity-45" style={{ border: `1.5px solid ${K.line}`, color: K.forest }}>
      {children}
    </button>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} disabled={disabled}
      className="grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-30" style={{ color: K.moss }}>
      {children}
    </button>
  );
}
