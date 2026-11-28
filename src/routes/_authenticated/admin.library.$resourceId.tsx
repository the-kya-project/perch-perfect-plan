import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Eye, FileText, Loader2, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaBackRow, KyaBody, KyaField, KyaHeader, KyaPage, KyaPrimaryButton, KyaSecondaryButton, KyaSwitch, KyaTitle } from "@/components/kya";
import { AdminOnly } from "@/components/flock/AdminOnly";
import { ResourceView, resourceTypeLabel, subjectLabel } from "@/components/flock/LibraryParts";
import { FLOCK_ENABLED_QUERY } from "@/lib/flock";
import { useIsAdmin } from "@/lib/flockData";
import {
  deleteResource, emptyDraft, LibraryFileError, normalizeUrl, publishProblems, removeLibraryFiles, saveResource, speciesFromText,
  libraryKeys, uploadCover, uploadPdf, useAdminResource, useInvalidateLibrary, useLibraryFileUrls,
  type LibraryStatus, type PublishProblem, type ResourceDraft,
} from "@/lib/flockLibrary";
import { LIBRARY_RESOURCE_TYPES, LIBRARY_SUBJECTS } from "@/lib/flockNav";
import { useFormInProgress } from "@/lib/formsInProgress";
import type { TFunction } from "i18next";

// Writing one library resource: edit, preview (exactly what members will
// see), save as a draft, publish, unpublish, delete; a cover photo and a PDF
// in the private flock-library bucket. "new" makes a new one. Behind the
// Flock gate, then admins only; RLS refuses everyone else on every call.
export const Route = createFileRoute("/_authenticated/admin/library/$resourceId")({
  head: () => ({ meta: [{ title: "Edit resource — Kya & Co." }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => <AdminOnly><EditorLoader /></AdminOnly>,
});

function EditorLoader() {
  const { resourceId } = Route.useParams();
  const isNew = resourceId === "new";
  const qc = useQueryClient();
  // A new resource's first save moves the URL to its id; the same editor
  // carries on (no reload, no lost message).
  const created = useRef<string | null>(null);
  const { data: isAdmin } = useIsAdmin();
  const { data, isLoading } = useAdminResource(isNew ? null : resourceId, isAdmin === true);
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (!isNew && isLoading) {
    return <KyaPage><div className="grid min-h-[60vh] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-8 animate-spin" style={{ color: K.moss }} /></div></KyaPage>;
  }
  if (!isNew && !data) {
    return (
      <KyaPage>
        <KyaHeader>
          <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/admin/library" })} />
          <KyaTitle title={t("flock.libraryAdmin.missing", "Resource not found")} line={t("flock.libraryAdmin.missingLine", "It may have been deleted.")} />
        </KyaHeader>
      </KyaPage>
    );
  }
  return (
    <Editor key={isNew || resourceId === created.current ? "new" : resourceId} initial={data ?? emptyDraft()}
      onCreated={(draft) => { created.current = draft.id; qc.setQueryData(libraryKeys.adminOne(draft.id!), draft); }} />
  );
}

/** What's missing before publishing, as words that fit "Add {{what}}…". */
function problemLabel(t: TFunction, p: PublishProblem): string {
  switch (p) {
    case "title": return t("flock.libraryAdmin.problemTitle", "a title");
    case "summary": return t("flock.libraryAdmin.problemSummary", "a short summary");
    case "topics": return t("flock.libraryAdmin.problemTopics", "at least one topic");
    case "url": return t("flock.libraryAdmin.problemUrl", "the web link (videos and links need one)");
  }
}

function Editor({ initial, onCreated }: { initial: ResourceDraft; onCreated: (d: ResourceDraft) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const invalidate = useInvalidateLibrary();
  const ids = { title: useId(), summary: useId(), body: useId(), species: useId(), url: useId(), reviewer: useId(), reviewedOn: useId() };
  const [d, setD] = useState<ResourceDraft>(initial);
  // What's saved in the database, to know which files a save replaces.
  const saved = useRef<ResourceDraft>(initial);
  const [speciesText, setSpeciesText] = useState(initial.species.join(", "));
  const [urlText, setUrlText] = useState(initial.external_url ?? "");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [busy, setBusy] = useState<null | "save" | "cover" | "pdf" | "delete">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  useFormInProgress(dirty && busy === null);

  const current = (): ResourceDraft => ({ ...d, species: speciesFromText(speciesText), external_url: normalizeUrl(urlText) });
  const set = (p: Partial<ResourceDraft>) => { setD((x) => ({ ...x, ...p })); setDirty(true); setNotice(null); };
  const { data: urls } = useLibraryFileUrls([d.cover_path, d.attachment_path]);
  useEffect(() => { if (error) setNotice(null); }, [error]);

  const problems = publishProblems(current());
  const save = async (status: LibraryStatus) => {
    const draft = { ...current(), status };
    if (status === "published" && publishProblems(draft).length) {
      setError(t("flock.libraryAdmin.cantPublish", "Add {{what}} before publishing.", { what: publishProblems(draft).map((p) => problemLabel(t, p)).join(", ") }));
      return;
    }
    setBusy("save"); setError(null);
    try {
      const id = await saveResource(draft);
      // Files the saved version no longer points at.
      const was = saved.current;
      await removeLibraryFiles([
        was.cover_path && was.cover_path !== draft.cover_path ? was.cover_path : null,
        was.attachment_path && was.attachment_path !== draft.attachment_path ? was.attachment_path : null,
      ]);
      const next = { ...draft, id };
      saved.current = next;
      setD(next);
      setDirty(false);
      if (!was.id) onCreated(next);
      await invalidate();
      setNotice(status === "published"
        ? (was.status === "published" ? t("flock.libraryAdmin.savedLive", "Saved. Members see the new version.") : t("flock.libraryAdmin.publishedNow", "Published. Members can find it in the Library."))
        : (was.status === "published" ? t("flock.libraryAdmin.unpublished", "Unpublished. It's a draft again, hidden from members.") : t("flock.libraryAdmin.savedDraft", "Draft saved. Only admins can see it.")));
      if (!was.id) void navigate({ to: "/admin/library/$resourceId", params: { resourceId: id }, replace: true });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setError(code === "23514"
        ? t("flock.libraryAdmin.checkError", "Something in the form isn't allowed. Check the link and the topics, then try again.")
        : t("flock.review.error", "That didn't save. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const pick = async (kind: "cover" | "pdf", file: File | undefined) => {
    if (!file) return;
    setBusy(kind); setError(null);
    try {
      const path = kind === "cover" ? await uploadCover(file) : await uploadPdf(file);
      const prev = kind === "cover" ? d.cover_path : d.attachment_path;
      // An upload that was never saved can go straight away.
      const savedPath = kind === "cover" ? saved.current.cover_path : saved.current.attachment_path;
      if (prev && prev !== savedPath) await removeLibraryFiles([prev]);
      set(kind === "cover" ? { cover_path: path } : { attachment_path: path });
    } catch (e) {
      setError(e instanceof LibraryFileError ? e.message : t("flock.review.error", "That didn't save. Try again."));
    } finally {
      setBusy(null);
    }
  };
  const unattach = async (kind: "cover" | "pdf") => {
    const prev = kind === "cover" ? d.cover_path : d.attachment_path;
    const savedPath = kind === "cover" ? saved.current.cover_path : saved.current.attachment_path;
    if (prev && prev !== savedPath) await removeLibraryFiles([prev]);
    set(kind === "cover" ? { cover_path: null } : { attachment_path: null });
  };

  const remove = async () => {
    setBusy("delete"); setError(null);
    try {
      await deleteResource(saved.current);
      await removeLibraryFiles([d.cover_path !== saved.current.cover_path ? d.cover_path : null, d.attachment_path !== saved.current.attachment_path ? d.attachment_path : null]);
      await invalidate();
      setDirty(false);
      void navigate({ to: "/admin/library", replace: true });
    } catch {
      setError(t("flock.review.error", "That didn't save. Try again."));
      setBusy(null);
    }
  };

  const isLive = saved.current.status === "published";
  const field = "w-full rounded-[16px] border-[1.5px] bg-white p-3.5 text-[16px] outline-none focus:border-[#2d6a4f]";
  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/admin/library" })}
          right={(
            <span className="rounded-full px-3 py-1 text-[13px] font-[700]" data-testid="editor-status"
              style={isLive ? { background: K.lime, color: K.forest } : { background: K.amberBg, color: K.amberText }}>
              {isLive ? t("flock.libraryAdmin.published", "Published") : t("flock.libraryAdmin.draft", "Draft")}
            </span>
          )} />
        <KyaTitle title={d.id ? t("flock.libraryAdmin.edit", "Edit resource") : t("flock.libraryAdmin.new", "New resource")}
          line={isLive ? t("flock.libraryAdmin.liveLine", "Live in the Library. Saving updates it for members.") : t("flock.libraryAdmin.draftLine", "A draft. Only admins can see it.")} />
      </KyaHeader>
      <KyaBody>
        <div className="flex flex-col gap-4">
          <div role="tablist" aria-label={t("flock.libraryAdmin.modeLabel", "Edit or preview")} className="flex rounded-full bg-white p-1" style={{ border: `1.5px solid ${K.line}` }}>
            {(["edit", "preview"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} data-mode={m}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full text-[15px] font-[700]"
                style={mode === m ? { background: K.forest, color: "#fff" } : { color: K.forest }}>
                {m === "edit" ? <Pencil className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                {m === "edit" ? t("flock.libraryAdmin.editTab", "Edit") : t("flock.libraryAdmin.previewTab", "Preview")}
              </button>
            ))}
          </div>

          {mode === "preview"
            ? (
              <div className="flex flex-col gap-3" data-testid="resource-preview">
                <p className="m-0 text-[13.5px]" style={{ color: K.quiet }}>{t("flock.libraryAdmin.previewNote", "This is how members will see it, including anything you haven't saved yet.")}</p>
                <div className="rounded-[22px] p-4" style={{ background: K.mist, border: `1px dashed ${K.teal}` }}>
                  <ResourceView r={current()} urls={urls} />
                </div>
              </div>
            )
            : (
              <div className="flex flex-col gap-4" data-testid="resource-form">
                <KyaField id={ids.title} label={t("flock.libraryAdmin.titleLabel", "Title")} value={d.title} maxLength={140}
                  onChange={(e) => set({ title: e.target.value })} data-testid="resource-title" />

                <Group label={t("flock.libraryAdmin.typeLabel", "Type")}>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("flock.libraryAdmin.typeLabel", "Type")}>
                    {LIBRARY_RESOURCE_TYPES.map((v) => (
                      <Choice key={v} role="radio" on={d.resource_type === v} onClick={() => set({ resource_type: v })} data={`type-${v}`}>{resourceTypeLabel(t, v)}</Choice>
                    ))}
                  </div>
                </Group>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={ids.summary} className="text-[13.5px] font-[700]" style={{ color: K.forest }}>{t("flock.libraryAdmin.summaryLabel", "Short summary")}</label>
                  <textarea id={ids.summary} value={d.summary} maxLength={300} rows={2} onChange={(e) => set({ summary: e.target.value })}
                    className={`${field} resize-none`} style={{ borderColor: "#d5dfd5", color: K.forest }} data-testid="resource-summary" />
                  <p className="m-0 px-1 text-[13px]" style={{ color: K.quiet }}>{t("flock.libraryAdmin.summaryHint", "One or two sentences. Shows in the list and under the title.")} {d.summary.length}/300</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor={ids.body} className="text-[13.5px] font-[700]" style={{ color: K.forest }}>{t("flock.libraryAdmin.bodyLabel", "Body")}</label>
                  <textarea id={ids.body} value={d.body} maxLength={60000} rows={14} onChange={(e) => set({ body: e.target.value })}
                    className={field} style={{ borderColor: "#d5dfd5", color: K.forest }} data-testid="resource-body-input" />
                  <p className="m-0 px-1 text-[13px] leading-[1.5]" style={{ color: K.quiet }}>
                    {t("flock.libraryAdmin.bodyHint", "# Heading, ## Smaller heading, - bullet, 1. numbered, - [ ] checklist item, > tip box, **bold**, *italics*, [words](https://link). A blank line starts a new paragraph. Use Preview to check it.")}
                  </p>
                </div>

                <Group label={t("flock.libraryAdmin.topicsLabel", "Topics")} hint={t("flock.libraryAdmin.topicsHint", "These are the Library's subject filters. Pick at least one before publishing.")}>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={t("flock.libraryAdmin.topicsLabel", "Topics")}>
                    {LIBRARY_SUBJECTS.map((s) => {
                      const on = d.topics.includes(s);
                      return <Choice key={s} on={on} onClick={() => set({ topics: on ? d.topics.filter((x) => x !== s) : [...d.topics, s] })} data={`topic-${s}`}>{subjectLabel(t, s)}</Choice>;
                    })}
                  </div>
                </Group>

                <KyaField id={ids.species} label={t("flock.libraryAdmin.speciesLabel", "Species (optional)")} value={speciesText} maxLength={800}
                  placeholder={t("flock.libraryAdmin.speciesPlaceholder", "Sun conure, African grey")}
                  hint={t("flock.libraryAdmin.speciesHint", "Separate with commas. Leave empty if it's for every bird.")}
                  onChange={(e) => { setSpeciesText(e.target.value); setDirty(true); }} data-testid="resource-species" />

                <KyaField id={ids.url} type="url" inputMode="url" label={d.resource_type === "video" || d.resource_type === "link" ? t("flock.libraryAdmin.urlRequired", "Web link") : t("flock.libraryAdmin.urlLabel", "Web link (optional)")}
                  value={urlText} maxLength={2000} placeholder="https://"
                  hint={t("flock.libraryAdmin.urlHint", "For a video, its YouTube or Vimeo page. For a link, the page to open.")}
                  onChange={(e) => { setUrlText(e.target.value); setDirty(true); }} data-testid="resource-url" />

                <Group label={t("flock.libraryAdmin.filesLabel", "Cover photo and PDF (optional)")} hint={t("flock.libraryAdmin.filesHint", "Files stay private: only people who can open the resource can open them.")}>
                  <input ref={coverRef} type="file" accept="image/*" className="hidden" data-testid="cover-input"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pick("cover", f); }} />
                  <input ref={pdfRef} type="file" accept="application/pdf,.pdf" className="hidden" data-testid="pdf-input"
                    onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pick("pdf", f); }} />
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3 rounded-[16px] bg-white p-3">
                      <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[12px]" style={{ background: K.mist, color: K.forest }}>
                        {d.cover_path && urls?.[d.cover_path] ? <img src={urls[d.cover_path]} alt="" className="size-full object-cover" /> : <Camera className="size-5" aria-hidden="true" />}
                      </span>
                      <span className="flex-1 text-[14.5px] font-[700]" style={{ color: K.forest }}>
                        {busy === "cover" ? t("flock.libraryAdmin.uploading", "Uploading…") : d.cover_path ? t("flock.libraryAdmin.coverAdded", "Cover photo added") : t("flock.libraryAdmin.noCover", "No cover photo")}
                      </span>
                      <MiniButton onClick={() => coverRef.current?.click()} disabled={busy !== null} testId="cover-choose">{d.cover_path ? t("flock.libraryAdmin.replace", "Replace") : t("flock.libraryAdmin.add", "Add")}</MiniButton>
                      {d.cover_path && <MiniButton onClick={() => void unattach("cover")} disabled={busy !== null} testId="cover-remove">{t("flock.libraryAdmin.remove", "Remove")}</MiniButton>}
                    </div>
                    <div className="flex items-center gap-3 rounded-[16px] bg-white p-3">
                      <span className="grid size-14 shrink-0 place-items-center rounded-[12px]" style={{ background: K.mist, color: K.forest }}><FileText className="size-5" aria-hidden="true" /></span>
                      <span className="flex-1 text-[14.5px] font-[700]" style={{ color: K.forest }}>
                        {busy === "pdf" ? t("flock.libraryAdmin.uploading", "Uploading…") : d.attachment_path ? t("flock.libraryAdmin.pdfAdded", "PDF attached") : t("flock.libraryAdmin.noPdf", "No PDF")}
                      </span>
                      <MiniButton onClick={() => pdfRef.current?.click()} disabled={busy !== null} testId="pdf-choose">{d.attachment_path ? t("flock.libraryAdmin.replace", "Replace") : t("flock.libraryAdmin.add", "Add")}</MiniButton>
                      {d.attachment_path && <MiniButton onClick={() => void unattach("pdf")} disabled={busy !== null} testId="pdf-remove">{t("flock.libraryAdmin.remove", "Remove")}</MiniButton>}
                    </div>
                  </div>
                </Group>

                <div className="flex flex-col gap-3 rounded-[20px] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex flex-col">
                      <span className="text-[15px] font-[700]" style={{ color: K.forest }}>{t("flock.libraryAdmin.vetLabel", "Reviewed by an avian vet")}</span>
                      <span className="text-[13px]" style={{ color: K.quiet }}>{t("flock.libraryAdmin.vetHint", "Members see the badge only when this is on.")}</span>
                    </span>
                    <KyaSwitch checked={d.vet_reviewed} onChange={(v) => set({ vet_reviewed: v })} label={t("flock.libraryAdmin.vetLabel", "Reviewed by an avian vet")} />
                  </div>
                  {d.vet_reviewed && (
                    <>
                      <KyaField id={ids.reviewer} label={t("flock.libraryAdmin.reviewerLabel", "Reviewer's name (optional)")} value={d.vet_reviewer ?? ""} maxLength={120}
                        placeholder={t("flock.libraryAdmin.reviewerPlaceholder", "Dr. Jane Smith, DVM")} onChange={(e) => set({ vet_reviewer: e.target.value })} data-testid="resource-reviewer" />
                      <KyaField id={ids.reviewedOn} type="date" label={t("flock.libraryAdmin.reviewedOnLabel", "Date reviewed (optional)")} value={d.vet_reviewed_on ?? ""}
                        onChange={(e) => set({ vet_reviewed_on: e.target.value || null })} data-testid="resource-reviewed-on" />
                    </>
                  )}
                </div>
              </div>
            )}

          {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }} data-testid="editor-error">{error}</p>}
          {notice && <p role="status" className="m-0 rounded-[14px] px-4 py-3 text-[15px] font-[700]" style={{ background: K.lime, color: K.forest }} data-testid="editor-notice">{notice}</p>}
          {!isLive && problems.length > 0 && (
            <p className="m-0 text-[13.5px]" style={{ color: K.quiet }} data-testid="publish-needs">
              {t("flock.libraryAdmin.toPublish", "To publish, add {{what}}.", { what: problems.map((p) => problemLabel(t, p)).join(", ") })}
            </p>
          )}

          <div className="flex flex-col gap-2.5">
            {isLive
              ? (
                <>
                  <KyaPrimaryButton onClick={() => void save("published")} disabled={busy !== null || problems.length > 0}>
                    {busy === "save" ? t("flock.idea.saving", "Saving…") : t("flock.libraryAdmin.saveLive", "Save changes")}
                  </KyaPrimaryButton>
                  <KyaSecondaryButton onClick={() => void save("draft")} disabled={busy !== null || !d.title.trim()}>{t("flock.libraryAdmin.unpublish", "Unpublish")}</KyaSecondaryButton>
                </>
              )
              : (
                <>
                  <KyaPrimaryButton onClick={() => void save("published")} disabled={busy !== null || problems.length > 0}>
                    {busy === "save" ? t("flock.idea.saving", "Saving…") : t("flock.libraryAdmin.publish", "Publish")}
                  </KyaPrimaryButton>
                  <KyaSecondaryButton onClick={() => void save("draft")} disabled={busy !== null || !d.title.trim()}>{t("flock.libraryAdmin.saveDraft", "Save draft")}</KyaSecondaryButton>
                </>
              )}
            {d.id && (confirmDelete
              ? (
                <div className="flex flex-col gap-2 rounded-[16px] bg-white p-3" role="alertdialog" aria-label={t("flock.libraryAdmin.deleteConfirm", "Delete this resource?")}>
                  <p className="m-0 text-[15px]" style={{ color: K.forest }}>{t("flock.libraryAdmin.deleteConfirmLine", "Delete it for good, with its cover and PDF? This can't be undone.")}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-[44px] flex-1 rounded-full text-[15px] font-[700]" style={{ background: K.mist, color: K.forest }}>{t("flock.libraryAdmin.keep", "Keep it")}</button>
                    <button type="button" onClick={() => void remove()} disabled={busy !== null} data-testid="delete-confirm" className="min-h-[44px] flex-1 rounded-full text-[15px] font-[700] text-white" style={{ background: K.red }}>
                      {busy === "delete" ? t("flock.libraryAdmin.deleting", "Deleting…") : t("flock.libraryAdmin.deleteYes", "Delete")}
                    </button>
                  </div>
                </div>
              )
              : (
                <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy !== null} data-testid="delete-resource"
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 text-[15px] font-[700]" style={{ color: K.red }}>
                  <Trash2 className="size-4" aria-hidden="true" />{t("flock.libraryAdmin.delete", "Delete resource")}
                </button>
              ))}
          </div>
        </div>
      </KyaBody>
    </KyaPage>
  );
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13.5px] font-[700]" style={{ color: K.forest }}>{label}</span>
      {children}
      {hint && <p className="m-0 px-1 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>{hint}</p>}
    </div>
  );
}

function Choice({ on, onClick, children, data, role }: { on: boolean; onClick: () => void; children: ReactNode; data: string; role?: "radio" }) {
  return (
    <button type="button" role={role} aria-checked={role ? on : undefined} aria-pressed={role ? undefined : on} onClick={onClick} data-choice={data}
      className="min-h-[44px] rounded-full px-4 text-[14.5px] font-[700]"
      style={on ? { background: K.forest, color: "#fff", border: `1.5px solid ${K.forest}` } : { background: "#fff", color: K.forest, border: `1.5px solid ${K.line}` }}>
      {children}
    </button>
  );
}

function MiniButton({ onClick, disabled, children, testId }: { onClick: () => void; disabled?: boolean; children: ReactNode; testId: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId}
      className="min-h-[40px] rounded-full px-3.5 text-[14px] font-[700] disabled:opacity-45" style={{ border: `1.5px solid ${K.line}`, color: K.forest }}>
      {children}
    </button>
  );
}
