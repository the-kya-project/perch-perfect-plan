// Read view for one journal entry. Tapping a card opens this; editing is behind
// an explicit button so looking at an entry can't turn into accidentally
// changing it.
//
// Opening the photo and the PDFs both go through useOpenSignedFile, shared with
// the editor rather than reimplemented here.
import { useQuery } from "@tanstack/react-query";
import { Pencil, X, Loader2, FileText, Paperclip } from "lucide-react";
import { PhotoHero } from "@/components/system";
import { listJournalAttachments, signJournalAttachments } from "@/lib/journalAttachment";
import { signJournalPhotos } from "@/lib/journalPhoto";
import { useOpenSignedFile } from "@/lib/useOpenSignedFile";

export type ViewEntry = {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  occurred_on: string;
  photo_path: string | null;
};

export function JournalEntryView({
  entry, photoUrl, kindLabel, kindPill, dateLabel, canEdit, onEdit, onClose,
}: {
  entry: ViewEntry;
  photoUrl: string | null;
  kindLabel: string;
  kindPill: string;
  dateLabel: string;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { openingKey, openSigned } = useOpenSignedFile();

  // Same query key as the editor, so opening one after the other is a cache hit
  // and an attachment added in the editor shows here without a refetch.
  const { data: attachments } = useQuery({
    queryKey: ["journal-attachments", entry.id],
    queryFn: () => listJournalAttachments([entry.id]),
  });
  const files = attachments ?? [];

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-[var(--cream)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="t-section">{entry.title || kindLabel}</h2>
            <div className="mt-1.5 flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-[9px] py-[3px] text-[11.5px] font-[500] ${kindPill}`}>{kindLabel}</span>
              <span className="t-meta">{dateLabel}</span>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--mute)]"><X className="size-5" /></button>
        </div>

        {entry.photo_path && photoUrl && (
          <button
            type="button"
            onClick={() => openSigned("photo", async () =>
              (await signJournalPhotos([entry.photo_path!])).get(entry.photo_path!))}
            className="relative mt-1 block w-full overflow-hidden rounded-xl active:opacity-90"
            aria-label="Open photo full size"
          >
            <PhotoHero src={photoUrl} height={200} alt="" />
            {openingKey === "photo" && (
              <span className="absolute inset-0 grid place-items-center bg-black/30">
                <Loader2 className="size-6 animate-spin text-white" />
              </span>
            )}
          </button>
        )}

        {entry.body && <p className="t-body mt-3 whitespace-pre-wrap text-[var(--ink2)]">{entry.body}</p>}

        {files.length > 0 && (
          <div className="mt-4">
            <span className="mb-1 flex items-center gap-1 text-xs font-[500] text-[var(--mute)]">
              <Paperclip className="size-3.5" /> Files
            </span>
            <div className="overflow-hidden rounded-xl bg-white ring-1 ring-[var(--line2)]">
              {files.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openSigned(a.id, async () =>
                    (await signJournalAttachments([a.storage_path])).get(a.storage_path))}
                  className={`flex min-h-[48px] w-full items-center gap-2 px-3 text-left active:bg-black/[0.02] ${i ? "border-t border-[var(--line2)]" : ""}`}
                >
                  <FileText className="size-4 shrink-0 text-[var(--mute2)]" />
                  <span className="min-w-0 flex-1 truncate py-2 text-sm text-[var(--ink)] underline">{a.file_name}</span>
                  {openingKey === a.id && <Loader2 className="size-4 shrink-0 animate-spin text-[var(--mute2)]" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Edit is gated on record_health — a viewer-preset member can open an
            entry but must not be offered a control RLS would reject. */}
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[12px] border border-[var(--line)] bg-white text-[15px] font-[500] text-[var(--ink)] active:scale-[0.99]"
          >
            <Pencil className="size-4" /> Edit
          </button>
        )}
      </div>
    </div>
  );
}
