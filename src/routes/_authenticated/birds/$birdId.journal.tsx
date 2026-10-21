import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { toast } from "sonner";
import { Plus, BookOpen, ImagePlus, Loader2, Trash2, Paperclip, FileText } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaPrimaryButton, KyaGroupLabel, KyaSheet, KyaField } from "@/components/kya";
import { PageHeader, useGoBack } from "@/components/headers";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import { LoadError } from "@/components/LoadError";
import { useLoadState } from "@/lib/useTooLong";
import { useCapability } from "@/lib/useCapability";
import { useBirdRole } from "@/lib/useBirdRole";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { uploadJournalPhoto, signJournalPhotos } from "@/lib/journalPhoto";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import {
  attachmentRejectionReason, uploadJournalAttachment, listJournalAttachments,
  removeJournalAttachment, signJournalAttachments,
} from "@/lib/journalAttachment";
import { JournalEntryView, JournalKindTag } from "@/components/JournalEntryView";
import { useOpenSignedFile } from "@/lib/useOpenSignedFile";
import { friendlyError } from "@/lib/errorMessage";
import { formatLocalDate } from "@/lib/dates";
import { localDateISO } from "@/lib/localDay";
import i18next from "i18next";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/birds/$birdId/journal")({
  head: () => ({ meta: [{ title: i18next.t("birdJournal.metaTitle", "Journal — Kya & Co.") }] }),
  component: JournalFacet,
});

type Kind = "molt" | "meds" | "vet" | "behavior" | "note" | "other";
type Entry = { id: string; kind: Kind; title: string | null; body: string | null; occurred_on: string; photo_path: string | null };

const KINDS: Kind[] = ["molt", "meds", "vet", "behavior", "note", "other"];

// The chips group the stored kinds: Health = molt, meds, vet visit;
// Behavior = behavior; Notes = note, other.
type Filter = "all" | "health" | "behavior" | "notes";
const FILTERS: { value: Filter; kinds: Kind[] }[] = [
  { value: "all", kinds: KINDS },
  { value: "health", kinds: ["molt", "meds", "vet"] },
  { value: "behavior", kinds: ["behavior"] },
  { value: "notes", kinds: ["note", "other"] },
];
const todayStr = () => localDateISO();

// Display labels — `kind` is what's stored.
function kindLabel(t: TFunction, kind: Kind): string {
  switch (kind) {
    case "molt": return t("birdJournal.kindMolt", "Molt");
    case "meds": return t("birdJournal.kindMeds", "Meds");
    case "vet": return t("birdJournal.kindVet", "Vet visit");
    case "behavior": return t("birdJournal.kindBehavior", "Behavior");
    case "note": return t("birdJournal.kindNote", "Note");
    case "other": return t("birdJournal.kindOther", "Other");
    default: return String(kind);
  }
}
function filterLabel(t: TFunction, f: Filter): string {
  switch (f) {
    case "all": return t("birdJournal.filterAll", "All");
    case "health": return t("birdJournal.filterHealth", "Health");
    case "behavior": return t("birdJournal.filterBehavior", "Behavior");
    case "notes": return t("birdJournal.filterNotes", "Notes");
  }
}
function emptyFilterText(t: TFunction, f: Filter): string {
  switch (f) {
    case "all": return t("birdJournal.emptyAll", "No all entries yet.");
    case "health": return t("birdJournal.emptyHealth", "No health entries yet.");
    case "behavior": return t("birdJournal.emptyBehavior", "No behavior entries yet.");
    case "notes": return t("birdJournal.emptyNotes", "No notes entries yet.");
  }
}

const isoDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
// Month + day only: the month label above each group already carries the year.
const cardDate = (iso: string) => formatLocalDate(isoDay(iso), { month: "short", day: "numeric" });
const fullDate = (iso: string) => formatLocalDate(isoDay(iso), { month: "short", day: "numeric", year: "numeric" });
const monthLabel = (iso: string) => formatLocalDate(isoDay(iso), { month: "long", year: "numeric" });

/** Entries (already newest first) grouped by calendar month. */
function byMonth(entries: Entry[]): { key: string; label: string; entries: Entry[] }[] {
  const groups: { key: string; label: string; entries: Entry[] }[] = [];
  for (const e of entries) {
    const key = e.occurred_on.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(e);
    else groups.push({ key, label: monthLabel(e.occurred_on), entries: [e] });
  }
  return groups;
}

function JournalFacet() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const canHealth = useCapability("record_health", { birdId });
  const isOwner = useBirdRole(birdId) === "owner";
  const navigate = useNavigate();
  // Return where the visitor came from (bird record, or a Remembering memorial
  // card); fall back to the bird record when there's no real history.
  const goBack = useGoBack(useCallback(() => navigate({ to: "/birds/$birdId", params: { birdId } }), [navigate, birdId]));
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Entry | null | "new">(null);
  // The read view is keyed by ID, not by a captured Entry object, so it re-reads
  // from the live list: after an edit saves and the query invalidates, the view
  // shows the new values instead of the stale snapshot it was opened with.
  const [viewingId, setViewingId] = useState<string | null>(null);

  const { data: bird } = useQuery({
    queryKey: ["bird-name", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("name").eq("id", birdId).maybeSingle();
      return data as { name: string } | null;
    },
  });

  const entriesQ = useQuery({
    queryKey: ["journal-entries", birdId],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select("id, kind, title, body, occurred_on, photo_path")
        .eq("bird_id", birdId)
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });

  const entries = entriesQ.data;
  // Placeholders while entries load, and a retry if they didn't: neither should
  // read as an empty journal.
  const load = useLoadState([entriesQ]);
  const all = entries ?? [];
  const paths = all.map((e) => e.photo_path).filter(Boolean) as string[];
  const { data: photoUrls } = useQuery({
    queryKey: ["journal-photos", birdId, paths.join(",")],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => Object.fromEntries(await signJournalPhotos(paths)),
  });

  // How many attachments each entry has, for the quiet list marker. One
  // bird-scoped query rather than one per entry; the rows are tiny (an id) and
  // RLS already limits them to birds the reader can see.
  const { data: attachCounts } = useQuery({
    queryKey: ["journal-attachment-counts", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_attachments").select("journal_entry_id").eq("bird_id", birdId);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of data ?? []) {
        const id = (r as { journal_entry_id: string }).journal_entry_id;
        counts[id] = (counts[id] ?? 0) + 1;
      }
      return counts;
    },
  });

  const viewing = viewingId ? all.find((e) => e.id === viewingId) ?? null : null;

  const shown = all.filter((e) => FILTERS.find((f) => f.value === filter)!.kinds.includes(e.kind));

  return (
    <KyaPage>
      <PageHeader
        onBack={goBack}
        title={bird?.name
          ? t("birdJournal.titleNamed", "{{name}}'s journal", { name: bird.name })
          : t("birdJournal.titlePlain", "Journal")}
        line={t("birdJournal.body", "The little things you notice now can matter later.")}
      />

      <KyaBody>
        <MemberContextBanner birdId={birdId} />

        {canHealth && (
          <KyaPrimaryButton icon={<Plus className="size-5" />} onClick={() => setEditing("new")}>
            {t("birdJournal.addAnEntry", "Add an entry")}
          </KyaPrimaryButton>
        )}

        {/* Filter chips: 40px pills inside 44px tap targets. */}
        <div className="flex flex-wrap gap-x-2" role="group" aria-label={t("birdJournal.filterLabel", "Show entries")}>
          {FILTERS.map((f) => {
            const on = filter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={on}
                className="inline-flex min-h-[44px] items-center active:scale-[0.98]"
              >
                <span
                  className="inline-flex h-10 items-center rounded-full px-4 text-[15px] font-[700]"
                  style={on
                    ? { background: K.forest, color: "#fff", border: `1.5px solid ${K.forest}` }
                    : { background: "#fff", color: K.forest, border: `1.5px solid ${K.line}` }}
                >
                  {filterLabel(t, f.value)}
                </span>
              </button>
            );
          })}
        </div>

        {load.failed ? (
          <LoadError onRetry={load.retry} />
        ) : load.loading ? (
          <div className="space-y-3" aria-hidden="true">
            {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-[20px] bg-white" />)}
          </div>
        ) : all.length === 0 ? (
          <KyaCard className="p-7 text-center">
            <BookOpen className="mx-auto size-7" style={{ color: K.moss }} aria-hidden="true" />
            <p className="m-0 mt-3 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("birdJournal.emptyIntro", "Nothing here yet. The journal is where you track health and behavior over time — molts, meds, vet visits, a new word, an off day. Add an entry whenever something's worth noting for the record.")}</p>
          </KyaCard>
        ) : shown.length === 0 ? (
          <KyaCard className="p-6 text-center">
            <p className="m-0 text-[15px]" style={{ color: K.quiet }}>{emptyFilterText(t, filter)}</p>
          </KyaCard>
        ) : (
          byMonth(shown).map((g) => (
            <section key={g.key} className="flex flex-col gap-2.5">
              <KyaGroupLabel>{g.label}</KyaGroupLabel>
              {g.entries.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  label={kindLabel(t, e.kind)}
                  photoUrl={e.photo_path ? photoUrls?.[e.photo_path] ?? null : null}
                  attachmentCount={attachCounts?.[e.id] ?? 0}
                  onOpen={() => setViewingId(e.id)}
                />
              ))}
            </section>
          ))
        )}
      </KyaBody>

      {/* Read view. Rendered only when the editor is closed, so two sheets never
          stack: opening Edit keeps viewingId set, and dismissing the editor
          lands back here on the updated entry. */}
      {viewing && !editing && (
        <JournalEntryView
          entry={viewing}
          photoUrl={viewing.photo_path ? photoUrls?.[viewing.photo_path] ?? null : null}
          kindLabel={kindLabel(t, viewing.kind)}
          dateLabel={fullDate(viewing.occurred_on)}
          canEdit={canHealth}
          onEdit={() => setEditing(viewing)}
          onClose={() => setViewingId(null)}
        />
      )}

      {editing && (
        <EntryForm
          birdId={birdId}
          entry={editing === "new" ? null : editing}
          isOwner={isOwner}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["journal-entries", birdId] });
            qc.invalidateQueries({ queryKey: ["journal-attachment-counts", birdId] });
          }}
          onDeleted={() => {
            setEditing(null);
            // The entry is gone — there is nothing left to return to.
            setViewingId(null);
            qc.invalidateQueries({ queryKey: ["journal-entries", birdId] });
            qc.invalidateQueries({ queryKey: ["journal-attachment-counts", birdId] });
          }}
        />
      )}
    </KyaPage>
  );
}

// One journal entry as a white card: photo band (if any), bold title with the
// date on the right, the type tag, then the text. Tapping opens the read view.
function EntryCard({ entry, label, photoUrl, attachmentCount, onOpen }: { entry: Entry; label: string; photoUrl: string | null; attachmentCount: number; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <KyaCard>
      <button type="button" onClick={onOpen} className="block w-full text-left active:bg-black/[0.02]" style={{ color: K.forest }}>
        {photoUrl && <img src={photoUrl} alt="" className="block h-40 w-full object-cover" />}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="m-0 min-w-0 flex-1 text-[16px] font-[700] leading-[1.3]">{entry.title || label}</h3>
            <span className="shrink-0 pt-0.5 text-[13px]" style={{ color: K.quiet }}>{cardDate(entry.occurred_on)}</span>
          </div>
          <div className="mt-2">
            <JournalKindTag kind={entry.kind}>{label}</JournalKindTag>
          </div>
          {entry.body && <p className="m-0 mt-2 line-clamp-3 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{entry.body}</p>}
          {/* Quiet marker — the files themselves live in the entry sheet. */}
          {attachmentCount > 0 && (
            <p className="m-0 mt-2 inline-flex items-center gap-1 text-[13px]" style={{ color: K.quiet }}>
              <Paperclip className="size-3.5" aria-hidden="true" />
              {attachmentCount === 1 ? t("birdJournal.filesOne", "{{n}} file", { n: attachmentCount }) : t("birdJournal.filesOther", "{{n}} files", { n: attachmentCount })}
            </p>
          )}
        </div>
      </button>
    </KyaCard>
  );
}

/** 13.5px bold label over a sheet control, matching KyaField. */
function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-[13.5px] font-[700]" style={{ color: K.forest }}>{children}</label>;
}

/** Dashed white pill that opens a file picker. */
function PickButton({ icon, children, accept, multiple, disabled, onChange }: { icon: ReactNode; children: ReactNode; accept: string; multiple?: boolean; disabled?: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className={`flex min-h-[48px] items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed bg-white px-4 text-[15px] font-[700] ${disabled ? "opacity-50" : "cursor-pointer active:scale-[0.99]"}`} style={{ borderColor: "#c4d2c4", color: K.moss }}>
      {icon}{children}
      <input type="file" accept={accept} multiple={multiple} className="hidden" disabled={disabled} onChange={onChange} />
    </label>
  );
}

function EntryForm({ birdId, entry, isOwner, onClose, onSaved, onDeleted }: { birdId: string; entry: Entry | null; isOwner: boolean; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!entry) return;
    if (!window.confirm(t("birdJournal.confirmDelete", "Delete this journal entry? This can't be undone."))) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("journal_entries").delete().eq("id", entry.id);
      if (error) throw error;
      toast.success(t("birdJournal.deleted", "Entry deleted."));
      onDeleted();
    } catch (e: any) {
      toast.error(friendlyError(e, t("birdJournal.deleteFailed", "Couldn't delete the entry.")));
    } finally {
      setDeleting(false);
    }
  }
  // Attribution for entries created during an active caregiver assignment.
  const activeSitId = useActiveSitIdForBird(birdId);
  const [kind, setKind] = useState<Kind>(entry?.kind ?? "note");
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [date, setDate] = useState(entry?.occurred_on ?? todayStr());
  const [photoData, setPhotoData] = useState<string | null>(null); // new pick (data URL)
  const [keepPhoto, setKeepPhoto] = useState(true); // existing photo retained?
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  // Attachments are a DRAFT until Save, exactly like the photo and the
  // "Remove photo" toggle above: picks are held in memory as File objects and
  // removals are only marked. Two reasons, both about failure modes rather
  // than elegance:
  //   - uploadJournalAttachment needs a journal_entry_id, and a new entry has
  //     no id until save. Uploading first would mean either inserting a draft
  //     entry row (abandoned drafts litter the journal) or writing objects with
  //     no row pointing at them — orphaned bytes the owner can neither see nor
  //     delete.
  //   - Deferring makes cancel-after-attaching a non-event: nothing was
  //     uploaded, so there is nothing to clean up. The worst case becomes an
  //     upload that fails after the entry saved, which is visible, named, and
  //     retryable by re-attaching.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const { openingKey, openSigned } = useOpenSignedFile();

  const { data: existingAttachments } = useQuery({
    queryKey: ["journal-attachments", entry?.id ?? "new"],
    enabled: !!entry?.id,
    queryFn: () => listJournalAttachments([entry!.id]),
  });
  const shownAttachments = (existingAttachments ?? []).filter((a) => !removedIds.has(a.id));

  function pickAttachments(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const accepted: File[] = [];
    for (const f of files) {
      const reason = attachmentRejectionReason(f);
      if (reason) toast.error(`${f.name}: ${reason}`);
      else accepted.push(f);
    }
    if (accepted.length) setPendingFiles((p) => [...p, ...accepted]);
  }

  const valid = !!kind && !!date && title.trim().length > 0;
  const existingPhoto = entry?.photo_path ?? null;

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) {
        toast.error(t("birdJournal.photoTooLarge", "That photo's a bit too large even after resizing. Try a different one."));
        return;
      }
      setPhotoData(dataUrl);
      setKeepPhoto(false);
    } catch {
      toast.error(t("birdJournal.photoFailed", "Couldn't process that photo. Try a different one."));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      const { data: u } = await getLocalUser();
      let photo_path = keepPhoto ? existingPhoto : null;
      if (photoData) photo_path = await uploadJournalPhoto(birdId, photoData);

      let entryId = entry?.id ?? null;
      if (entry) {
        const { error } = await supabase.from("journal_entries")
          .update({ kind, title: title.trim(), body: body.trim() || null, occurred_on: date, photo_path })
          .eq("id", entry.id);
        if (error) throw error;
      } else {
        // .select() so the new id is available to hang attachments off; the
        // inserted values are unchanged.
        const { data: created, error } = await supabase.from("journal_entries").insert({
          bird_id: birdId, kind, title: title.trim(), body: body.trim() || null,
          occurred_on: date, photo_path, logged_by: u.user?.id ?? null,
          ...(activeSitId ? { sit_id: activeSitId } : {}),
        }).select("id").single();
        if (error) throw error;
        entryId = (created as { id: string }).id;
      }

      // Apply attachment changes now that the entry definitely exists. These
      // run AFTER the entry is saved, so a failure here can't lose the written
      // entry — it reports which file didn't make it and leaves the rest.
      const failed: string[] = [];
      if (entryId) {
        for (let i = 0; i < pendingFiles.length; i++) {
          setUploadingIdx(i);
          try {
            await uploadJournalAttachment(birdId, entryId, pendingFiles[i]);
          } catch (err: any) {
            console.error("[journal] attachment upload failed", err);
            failed.push(pendingFiles[i].name);
          }
        }
        setUploadingIdx(null);
        for (const a of existingAttachments ?? []) {
          if (!removedIds.has(a.id)) continue;
          try {
            await removeJournalAttachment(a);
          } catch (err: any) {
            console.error("[journal] attachment removal failed", err);
            failed.push(a.file_name);
          }
        }
      }

      toast.success(entry ? t("birdJournal.updated", "Entry updated.") : t("birdJournal.added", "Entry added."));
      if (failed.length) {
        toast.error(t("birdJournal.filesFailed", "Saved, but these files didn't go through: {{files}}. Open the entry and try attaching them again.", { files: failed.join(", ") }));
      }
      onSaved();
    } catch (e: any) {
      toast.error(friendlyError(e, t("birdJournal.saveFailed", "Couldn't save the entry.")));
    } finally {
      setSaving(false);
      setUploadingIdx(null);
    }
  }

  const showPhoto = photoData ?? (keepPhoto && existingPhoto ? "existing" : null);
  const totalAttachments = shownAttachments.length + pendingFiles.length;
  const busy = saving || deleting;
  const removeLink = "shrink-0 px-2 min-h-[44px] text-[14px] font-[700] underline disabled:opacity-50";

  return (
    <KyaSheet
      onClose={busy ? () => {} : onClose}
      closeLabel={t("birdJournal.close", "Close")}
      title={<KyaHeading size={24}>{entry ? t("birdJournal.editEntry", "Edit entry") : t("birdJournal.addEntryTitle", "Add an entry")}</KyaHeading>}
      footer={
        <KyaPrimaryButton onClick={save} disabled={!valid || busy || photoBusy}>
          {saving
            ? (uploadingIdx !== null ? t("birdJournal.uploadingNofM", "Uploading {{n}} of {{total}}…", { n: uploadingIdx + 1, total: pendingFiles.length }) : t("birdJournal.saving", "Saving…"))
            : t("birdJournal.save", "Save")}
        </KyaPrimaryButton>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <FieldLabel>{t("birdJournal.kindPick", "Kind")}</FieldLabel>
          <div className="flex flex-wrap gap-x-2" role="radiogroup" aria-label={t("birdJournal.kindPick", "Kind")}>
            {KINDS.map((k) => {
              const on = kind === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={on} onClick={() => setKind(k)} className="inline-flex min-h-[44px] items-center">
                  <span className="inline-flex h-10 items-center rounded-full px-4 text-[15px] font-[700]" style={on ? { background: K.forest, color: "#fff", border: `1.5px solid ${K.forest}` } : { background: "#fff", color: K.forest, border: "1.5px solid #d5dfd5" }}>
                    {kindLabel(t, k)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <KyaField
          id="journal-title"
          label={t("birdJournal.titleField", "Title")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder={t("birdJournal.titlePlaceholder", "e.g. Started wing molt")}
        />

        <div>
          <FieldLabel htmlFor="journal-body">{t("birdJournal.detailsLabel", "Details")}</FieldLabel>
          <textarea
            id="journal-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder={t("birdJournal.optional", "Optional")}
            className="w-full rounded-[20px] border-[1.5px] bg-white px-4 py-3 text-[16px] leading-[1.5] outline-none focus:border-[#2d6a4f]"
            style={{ borderColor: "#d5dfd5", color: K.forest }}
          />
        </div>

        <KyaField
          id="journal-date"
          type="date"
          label={t("birdJournal.dateField", "Date")}
          value={date}
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
        />

        <div>
          <FieldLabel>{t("birdJournal.photoLabel", "Photo")}</FieldLabel>
          {showPhoto ? (
            <div className="flex items-center gap-3">
              {photoData
                ? <img src={photoData} alt="" className="size-16 rounded-[12px] object-cover" />
                : <span className="grid size-16 place-items-center rounded-[12px] text-center text-[11px]" style={{ background: K.mist, color: K.quiet }}>{t("birdJournal.savedPhoto", "Saved photo")}</span>}
              <button type="button" onClick={() => { setPhotoData(null); setKeepPhoto(false); }} className={removeLink} style={{ color: K.red }}>{t("birdJournal.removePhoto", "Remove photo")}</button>
            </div>
          ) : (
            <PickButton icon={photoBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} accept="image/*" disabled={photoBusy} onChange={pickPhoto}>
              {photoBusy ? t("birdJournal.processing", "Processing…") : t("birdJournal.addPhoto", "Add a photo")}
            </PickButton>
          )}
        </div>

        {/* Attachments — PDFs, several per entry. Applied on Save. */}
        <div>
          <FieldLabel>{t("birdJournal.filesLabel", "Files")}</FieldLabel>
          {totalAttachments > 0 && (
            <div className="mb-2 overflow-hidden rounded-[16px] border-[1.5px] bg-white" style={{ borderColor: K.line }}>
              {shownAttachments.map((a, i) => (
                <div key={a.id} className="flex min-h-[48px] items-center gap-2 px-3" style={i ? { borderTop: `1px solid ${K.line}` } : undefined}>
                  <FileText className="size-4 shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => openSigned(a.id, async () => (await signJournalAttachments([a.storage_path])).get(a.storage_path))}
                    disabled={saving}
                    className="min-h-[44px] min-w-0 flex-1 truncate text-left text-[15px] underline disabled:opacity-50"
                    style={{ color: K.forest }}
                  >
                    {a.file_name}
                  </button>
                  {openingKey === a.id && <Loader2 className="size-4 shrink-0 animate-spin" style={{ color: K.quiet }} />}
                  <button type="button" onClick={() => setRemovedIds((p) => new Set(p).add(a.id))} disabled={saving} className={removeLink} style={{ color: K.red }}>
                    {t("birdJournal.remove", "Remove")}
                  </button>
                </div>
              ))}
              {pendingFiles.map((f, i) => (
                <div key={`pending-${i}`} className="flex min-h-[48px] items-center gap-2 px-3" style={shownAttachments.length || i ? { borderTop: `1px solid ${K.line}` } : undefined}>
                  {uploadingIdx === i
                    ? <Loader2 className="size-4 shrink-0 animate-spin" style={{ color: K.quiet }} />
                    : <FileText className="size-4 shrink-0" style={{ color: K.quiet }} aria-hidden="true" />}
                  <span className="min-w-0 flex-1 truncate py-2 text-[15px]" style={{ color: K.forest }}>{f.name}</span>
                  <span className="shrink-0 text-[13px]" style={{ color: K.quiet }}>
                    {uploadingIdx === i ? t("birdJournal.uploading", "Uploading…") : t("birdJournal.notSavedYet", "Not saved yet")}
                  </span>
                  <button type="button" onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))} disabled={saving} className={removeLink} style={{ color: K.red }}>
                    {t("birdJournal.remove", "Remove")}
                  </button>
                </div>
              ))}
            </div>
          )}
          <PickButton icon={<Paperclip className="size-4" />} accept="application/pdf" multiple disabled={saving} onChange={pickAttachments}>
            {totalAttachments > 0 ? t("birdJournal.attachAnother", "Attach another PDF") : t("birdJournal.attachPdf", "Attach a PDF")}
          </PickButton>
          <p className="m-0 mt-1.5 px-1 text-[13px] leading-[1.4]" style={{ color: K.quiet }}>{t("birdJournal.attachHint", "Vet records, lab results, discharge notes. PDFs up to 25 MB.")}</p>
        </div>

        {/* Delete — owner-only (RLS also enforces birds.owner_id). Only for an
            existing entry, never while adding. */}
        {entry && isOwner && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border-2 bg-white text-[15px] font-[700] disabled:opacity-50"
            style={{ borderColor: K.red, color: K.red }}
          >
            <Trash2 className="size-4" /> {deleting ? t("birdJournal.deleting", "Deleting…") : t("birdJournal.deleteEntry", "Delete entry")}
          </button>
        )}
      </div>
    </KyaSheet>
  );
}
