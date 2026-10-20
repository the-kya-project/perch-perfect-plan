// Read view for one journal entry. Tapping a card opens this; editing is behind
// an explicit button so looking at an entry can't turn into accidentally
// changing it.
//
// Opening the photo and the PDFs both go through useOpenSignedFile, shared with
// the editor rather than reimplemented here.
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Loader2, FileText, Paperclip } from "lucide-react";
import { K, KyaHeading, KyaSecondaryButton, KyaSheet } from "@/components/kya";
import { listJournalAttachments, signJournalAttachments } from "@/lib/journalAttachment";
import { signJournalPhotos } from "@/lib/journalPhoto";
import { useOpenSignedFile } from "@/lib/useOpenSignedFile";
import { useTranslation } from "react-i18next";

export type ViewEntry = {
  id: string;
  kind: string;
  title: string | null;
  body: string | null;
  occurred_on: string;
  photo_path: string | null;
};

/** The type tag on a journal entry: Vet visit in lime, every other kind in mist. */
export function JournalKindTag({ kind, children }: { kind: string; children: ReactNode }) {
  const style = kind === "vet" ? { background: K.lime, color: K.forest } : { background: K.mist, color: K.moss };
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12.5px] font-[700]" style={style}>{children}</span>;
}

export function JournalEntryView({
  entry, photoUrl, kindLabel, dateLabel, canEdit, onEdit, onClose,
}: {
  entry: ViewEntry;
  photoUrl: string | null;
  kindLabel: string;
  dateLabel: string;
  canEdit: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { openingKey, openSigned } = useOpenSignedFile();

  // Same query key as the editor, so opening one after the other is a cache hit
  // and an attachment added in the editor shows here without a refetch.
  const { data: attachments } = useQuery({
    queryKey: ["journal-attachments", entry.id],
    queryFn: () => listJournalAttachments([entry.id]),
  });
  const files = attachments ?? [];

  return (
    <KyaSheet
      onClose={onClose}
      closeLabel={t("journalEntryView.close", "Close")}
      title={
        <>
          <KyaHeading size={24}>{entry.title || kindLabel}</KyaHeading>
          <div className="mt-2 flex items-center gap-2">
            <JournalKindTag kind={entry.kind}>{kindLabel}</JournalKindTag>
            <span className="text-[13px]" style={{ color: K.quiet }}>{dateLabel}</span>
          </div>
        </>
      }
      // Edit is gated on record_health — a viewer-preset member can open an
      // entry but must not be offered a control RLS would reject.
      footer={canEdit ? (
        <KyaSecondaryButton className="w-full" icon={<Pencil className="size-4" />} onClick={onEdit}>
          {t("journalEntryView.edit", "Edit")}
        </KyaSecondaryButton>
      ) : undefined}
    >
      {entry.photo_path && photoUrl && (
        <button
          type="button"
          onClick={() => openSigned("photo", async () =>
            (await signJournalPhotos([entry.photo_path!])).get(entry.photo_path!))}
          className="relative block w-full overflow-hidden rounded-[16px] active:opacity-90"
          aria-label={t("journalEntryView.openPhoto", "Open photo full size")}
        >
          <img src={photoUrl} alt="" className="block h-[200px] w-full object-cover" />
          {openingKey === "photo" && (
            <span className="absolute inset-0 grid place-items-center bg-black/30">
              <Loader2 className="size-6 animate-spin text-white" />
            </span>
          )}
        </button>
      )}

      {entry.body && <p className="m-0 mt-3 whitespace-pre-wrap text-[15px] leading-[1.55]" style={{ color: K.ink }}>{entry.body}</p>}

      {files.length > 0 && (
        <div className="mt-4">
          <p className="m-0 mb-1.5 flex items-center gap-1 text-[13.5px] font-[700]" style={{ color: K.forest }}>
            <Paperclip className="size-3.5" aria-hidden="true" /> {t("journalEntryView.files", "Files")}
          </p>
          <div className="overflow-hidden rounded-[16px] border-[1.5px] bg-white" style={{ borderColor: K.line }}>
            {files.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => openSigned(a.id, async () =>
                  (await signJournalAttachments([a.storage_path])).get(a.storage_path))}
                className="flex min-h-[48px] w-full items-center gap-2 px-3 text-left active:bg-black/[0.02]"
                style={i ? { borderTop: `1px solid ${K.line}` } : undefined}
              >
                <FileText className="size-4 shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate py-2 text-[15px] underline" style={{ color: K.forest }}>{a.file_name}</span>
                {openingKey === a.id && <Loader2 className="size-4 shrink-0 animate-spin" style={{ color: K.quiet }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </KyaSheet>
  );
}
