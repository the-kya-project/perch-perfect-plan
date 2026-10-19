import { createFileRoute, useNavigate, useRouter, useCanGoBack } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { toast } from "sonner";
import { ArrowLeft, Plus, BookOpen, ImagePlus, Check, X, Loader2, Trash2, Paperclip, FileText } from "lucide-react";
import { InkHero, PhotoHero, StatusPill, Card, PrimaryButton } from "@/components/system";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import { useCapability } from "@/lib/useCapability";
import { useBirdRole } from "@/lib/useBirdRole";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { uploadJournalPhoto, signJournalPhotos } from "@/lib/journalPhoto";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import {
  attachmentRejectionReason, uploadJournalAttachment, listJournalAttachments,
  removeJournalAttachment, signJournalAttachments, type JournalAttachment,
} from "@/lib/journalAttachment";
import { JournalEntryView } from "@/components/JournalEntryView";
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

const KINDS: { value: Kind; label: string; pill: string }[] = [
  { value: "molt", label: "Molt", pill: "bg-[var(--amber-fill)] text-[var(--amber-ink)]" },
  { value: "meds", label: "Meds", pill: "bg-[var(--pale)] text-[var(--ink)]" },
  { value: "vet", label: "Vet visit", pill: "bg-[var(--pale)] text-[var(--ink)]" },
  { value: "behavior", label: "Behavior", pill: "bg-[var(--pale2)] text-[var(--ink)]" },
  { value: "note", label: "Note", pill: "bg-[var(--cream2)] text-[var(--mute)]" },
  { value: "other", label: "Other", pill: "bg-[var(--cream2)] text-[var(--mute)]" },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.value, k])) as Record<Kind, (typeof KINDS)[number]>;

type Filter = "all" | "health" | "behavior" | "notes";
const FILTERS: { value: Filter; label: string; kinds: Kind[] }[] = [
  { value: "all", label: "All", kinds: ["molt", "meds", "vet", "behavior", "note", "other"] },
  { value: "health", label: "Health", kinds: ["molt", "meds", "vet"] },
  { value: "behavior", label: "Behavior", kinds: ["behavior"] },
  { value: "notes", label: "Notes", kinds: ["note", "other"] },
];
const todayStr = () => localDateISO();

// Display labels — the KINDS/FILTERS constants keep English; `kind` is stored.
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

function JournalFacet() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const canHealth = useCapability("record_health", { birdId });
  const isOwner = useBirdRole(birdId) === "owner";
  const navigate = useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  // Return where the visitor came from (bird record, or a Remembering memorial
  // card); fall back to the bird record when there's no real history.
  const goBack = () => (canGoBack && window.history.length > 1 ? router.history.back() : navigate({ to: "/birds/$birdId", params: { birdId } }));
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
  const name = bird?.name ?? t("birdJournal.thisBird", "this bird");

  const { data: entries } = useQuery({
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
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          backIcon={<ArrowLeft className="size-5" />}
          onBack={goBack}
          eyebrow={t("birdJournal.eyebrow", "Journal")}
          headline={t("birdJournal.headline", "What {{name}}'s been up to.", { name })}
          body={t("birdJournal.body", "The little things you notice now can matter later.")}
          cta={canHealth ? { label: t("birdJournal.addAnEntry", "Add an entry"), tone: "lime", icon: <Plus className="size-4" />, onPress: () => setEditing("new") } : undefined}
        />

        <main className="space-y-4 px-5 pt-5">
          <MemberContextBanner birdId={birdId} />
          {/* Filter chips */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                aria-pressed={filter === f.value}
                className="inline-flex min-h-[44px] items-center"
              >
                <StatusPill tone={filter === f.value ? "on" : "off"}>{filterLabel(t, f.value)}</StatusPill>
              </button>
            ))}
          </div>

          {all.length === 0 ? (
            <section className="rounded-[18px] bg-[var(--cream2)] p-8 text-center ring-1 ring-[var(--line2)]">
              <BookOpen className="mx-auto size-7 text-[var(--moss)]" />
              <p className="t-body mt-3 text-[var(--ink)]">{t("birdJournal.emptyIntro", "Nothing here yet. The journal is where you track health and behavior over time — molts, meds, vet visits, a new word, an off day. Add an entry whenever something's worth noting for the record.")}</p>
              <div className="mt-4">
                <PrimaryButton tone="lime" icon={<Plus className="size-4" />} onPress={() => setEditing("new")} full={false}>
                  {t("birdJournal.addFirst", "Add first entry")}
                </PrimaryButton>
              </div>
            </section>
          ) : shown.length === 0 ? (
            <p className="t-body rounded-[18px] bg-[var(--cream2)] p-6 text-center text-[var(--mute)] ring-1 ring-[var(--line2)]">
              {emptyFilterText(t, filter)}
            </p>
          ) : (
            <div className="space-y-3">
              {shown.map((e) => (
                <EntryCard
                  key={e.id}
                  entry={e}
                  photoUrl={e.photo_path ? photoUrls?.[e.photo_path] ?? null : null}
                  attachmentCount={attachCounts?.[e.id] ?? 0}
                  onOpen={() => setViewingId(e.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Read view. Rendered only when the editor is closed: opening Edit keeps
          viewingId set, so dismissing the editor lands back here on the updated
          entry rather than dumping the owner out to the list. */}
      {viewing && !editing && (
        <JournalEntryView
          entry={viewing}
          photoUrl={viewing.photo_path ? photoUrls?.[viewing.photo_path] ?? null : null}
          kindLabel={kindLabel(t, viewing.kind)}
          kindPill={KIND[viewing.kind].pill}
          dateLabel={fmtDate(viewing.occurred_on)}
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
    </div>
  );
}

// One journal entry as a tokenized white card. If the entry has a photo it
// renders as a PhotoHero-style band across the top; tapping anywhere opens the
// existing edit flow.
function EntryCard({ entry, photoUrl, attachmentCount, onOpen }: { entry: Entry; photoUrl: string | null; attachmentCount: number; onOpen: () => void }) {
  const { t } = useTranslation();
  const k = KIND[entry.kind];
  const label = kindLabel(t, entry.kind);
  return (
    <Card>
      <button type="button" onClick={onOpen} className="block w-full text-left active:bg-black/[0.02]">
        {photoUrl && <PhotoHero src={photoUrl} height={160} alt="" />}
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="t-item min-w-0 flex-1">{entry.title || label}</h3>
            <span className="t-meta shrink-0">{fmtDate(entry.occurred_on)}</span>
          </div>
          <div className="mt-1.5">
            <span className={`inline-flex items-center rounded-full px-[9px] py-[3px] text-[11.5px] font-[500] ${k.pill}`}>{label}</span>
          </div>
          {entry.body && <p className="t-body mt-2 line-clamp-3 text-[var(--ink2)]">{entry.body}</p>}
          {/* Quiet marker — the files themselves live in the entry sheet. */}
          {attachmentCount > 0 && (
            <p className="t-meta mt-2 inline-flex items-center gap-1 text-[var(--mute2)]">
              <Paperclip className="size-3.5" />
              {attachmentCount === 1 ? t("birdJournal.filesOne", "{{n}} file", { n: attachmentCount }) : t("birdJournal.filesOther", "{{n}} files", { n: attachmentCount })}
            </p>
          )}
        </div>
      </button>
    </Card>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return formatLocalDate(d, { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
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

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={saving ? undefined : onClose} />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--cream)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="t-section">{entry ? t("birdJournal.editEntry", "Edit entry") : t("birdJournal.addEntry", "Add entry")}</h2>
          <button onClick={onClose} aria-label={t("birdJournal.close", "Close")} className="grid size-9 place-items-center rounded-full text-[var(--mute)]"><X className="size-5" /></button>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-[500] text-[var(--mute)]">{t("birdJournal.kindLabel", "Kind *")}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]">
            {KINDS.map((k) => <option key={k.value} value={k.value}>{kindLabel(t, k.value)}</option>)}
          </select>
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-[500] text-[var(--mute)]">{t("birdJournal.titleLabel", "Title *")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t("birdJournal.titlePlaceholder", "e.g. Started wing molt")} className="h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]" />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-[500] text-[var(--mute)]">{t("birdJournal.detailsLabel", "Details")}</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder={t("birdJournal.optional", "Optional")} className="w-full rounded-xl border border-[var(--line)] bg-white p-3 text-sm text-[var(--ink)]" />
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-[500] text-[var(--mute)]">{t("birdJournal.dateLabel", "Date *")}</span>
          <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 text-sm text-[var(--ink)]" />
        </label>

        <div className="mt-3">
          <span className="mb-1 block text-xs font-[500] text-[var(--mute)]">{t("birdJournal.photoLabel", "Photo")}</span>
          {showPhoto ? (
            <div className="flex items-center gap-3">
              {photoData ? <img src={photoData} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <span className="grid h-16 w-16 place-items-center rounded-lg bg-[var(--cream2)] text-[10px] text-[var(--mute2)]">{t("birdJournal.savedPhoto", "Saved photo")}</span>}
              <button type="button" onClick={() => { setPhotoData(null); setKeepPhoto(false); }} className="text-xs font-[500] text-[var(--amber-ink)] underline">{t("birdJournal.removePhoto", "Remove photo")}</button>
            </div>
          ) : (
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--line)] bg-white text-sm font-[500] text-[var(--mute)]">
              {photoBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
              {photoBusy ? t("birdJournal.processing", "Processing…") : t("birdJournal.addPhoto", "Add a photo")}
              <input type="file" accept="image/*" className="hidden" disabled={photoBusy} onChange={pickPhoto} />
            </label>
          )}
        </div>

        {/* Attachments — PDFs, several per entry. Applied on Save. */}
        <div className="mt-3">
          <span className="mb-1 block text-xs font-[500] text-[var(--mute)]">{t("birdJournal.filesLabel", "Files")}</span>
          {totalAttachments > 0 && (
            <div className="mb-2 overflow-hidden rounded-xl bg-white ring-1 ring-[var(--line2)]">
              {shownAttachments.map((a, i) => (
                <div key={a.id} className={`flex min-h-[48px] items-center gap-2 px-3 ${i ? "border-t border-[var(--line2)]" : ""}`}>
                  <FileText className="size-4 shrink-0 text-[var(--mute2)]" />
                  <button
                    type="button"
                    onClick={() => openSigned(a.id, async () => (await signJournalAttachments([a.storage_path])).get(a.storage_path))}
                    disabled={saving}
                    className="min-w-0 flex-1 truncate py-2 text-left text-sm text-[var(--ink)] underline disabled:opacity-50"
                  >
                    {a.file_name}
                  </button>
                  {openingKey === a.id && <Loader2 className="size-4 shrink-0 animate-spin text-[var(--mute2)]" />}
                  <button
                    type="button"
                    onClick={() => setRemovedIds((p) => new Set(p).add(a.id))}
                    disabled={saving}
                    className="shrink-0 px-1 text-xs font-[500] text-[var(--amber-ink)] underline disabled:opacity-50"
                  >
                    {t("birdJournal.remove", "Remove")}
                  </button>
                </div>
              ))}
              {pendingFiles.map((f, i) => (
                <div
                  key={`pending-${i}`}
                  className={`flex min-h-[48px] items-center gap-2 px-3 ${shownAttachments.length || i ? "border-t border-[var(--line2)]" : ""}`}
                >
                  {uploadingIdx === i
                    ? <Loader2 className="size-4 shrink-0 animate-spin text-[var(--mute2)]" />
                    : <FileText className="size-4 shrink-0 text-[var(--mute2)]" />}
                  <span className="min-w-0 flex-1 truncate py-2 text-sm text-[var(--ink)]">{f.name}</span>
                  <span className="t-meta shrink-0 text-[var(--mute2)]">
                    {uploadingIdx === i ? t("birdJournal.uploading", "Uploading…") : t("birdJournal.notSavedYet", "Not saved yet")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}
                    disabled={saving}
                    className="shrink-0 px-1 text-xs font-[500] text-[var(--amber-ink)] underline disabled:opacity-50"
                  >
                    {t("birdJournal.remove", "Remove")}
                  </button>
                </div>
              ))}
            </div>
          )}
          <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--line)] bg-white text-sm font-[500] text-[var(--mute)]">
            <Paperclip className="size-4" />
            {totalAttachments > 0 ? t("birdJournal.attachAnother", "Attach another PDF") : t("birdJournal.attachPdf", "Attach a PDF")}
            <input type="file" accept="application/pdf" multiple className="hidden" disabled={saving} onChange={pickAttachments} />
          </label>
          <p className="t-meta mt-1 px-1 text-[var(--mute2)]">{t("birdJournal.attachHint", "Vet records, lab results, discharge notes. PDFs up to 25 MB.")}</p>
        </div>

        <div className="mt-5 flex gap-2">
          <PrimaryButton tone="lime" type="button" icon={<Check className="size-4" />} onPress={save} disabled={!valid || saving || photoBusy}>
            {saving
              ? (uploadingIdx !== null ? t("birdJournal.uploadingNofM", "Uploading {{n}} of {{total}}…", { n: uploadingIdx + 1, total: pendingFiles.length }) : t("birdJournal.saving", "Saving…"))
              : t("birdJournal.save", "Save")}
          </PrimaryButton>
          <button type="button" onClick={onClose} disabled={saving} className="min-h-[44px] rounded-[12px] border border-[var(--line)] px-4 text-[15px] font-[500] text-[var(--mute)] disabled:opacity-50">{t("birdJournal.cancel", "Cancel")}</button>
        </div>

        {/* Delete — owner-only (RLS also enforces birds.owner_id). Only for an
            existing entry, never while adding. */}
        {entry && isOwner && (
          <button
            type="button"
            onClick={remove}
            disabled={saving || deleting}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--red-line)] text-[14px] font-[500] text-[var(--red-ink)] disabled:opacity-50"
          >
            <Trash2 className="size-4" /> {deleting ? t("birdJournal.deleting", "Deleting…") : t("birdJournal.deleteEntry", "Delete entry")}
          </button>
        )}
      </div>
    </div>
  );
}
