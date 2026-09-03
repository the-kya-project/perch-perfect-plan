// Journal attachments — documents (vet records, lab results, discharge
// summaries) hanging off a journal entry, several per entry. Files live in the
// private, bird-scoped `journal-attachments` bucket keyed "<bird_id>/<uuid>.pdf";
// one journal_attachments row per file carries the metadata.
//
// Separate from journalPhoto.ts on purpose: journal_entries.photo_path and the
// journal-photos bucket are untouched, and that bucket only allows image MIME
// types so a PDF could never live there.
//
// Server-safe: no top-level browser-client import. The owner/household helpers
// lazy-import the RLS-gated browser client; `resolveJournalAttachmentUrls` takes
// the caller's storage so the service-role sitter path can reuse it (see
// journalAttachment.server.ts). Mirrors scanPhoto.ts.
import type { SupabaseClient } from "@supabase/supabase-js";

export const JOURNAL_ATTACHMENTS_BUCKET = "journal-attachments";

// 25 MB. Images are compressed before upload and capped at MAX_UPLOAD_BYTES
// (10 MB); PDFs have no compression path, and a multi-page scanned vet record
// at 300dpi routinely lands between 10 and 20 MB. The bucket enforces the same
// number server-side, so this constant is a fast client-side check, not the
// security boundary.
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// PDF-only for now — that's what was asked, and every extra type is a UI
// decision (inline preview vs forced download) that hasn't been made. Widening
// means updating this array AND the bucket's allowed_mime_types; no migration
// and no data backfill, because mime_type is stored free-form.
export const ALLOWED_ATTACHMENT_MIME: readonly string[] = ["application/pdf"];

export type JournalAttachment = {
  id: string;
  journal_entry_id: string;
  bird_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
};

type StorageApi = SupabaseClient["storage"];

/**
 * Reject a file before it reaches Storage, so the owner gets a real sentence
 * instead of the bucket's opaque 413 / mime rejection. Returns null when fine.
 */
export function attachmentRejectionReason(file: { name?: string; type?: string; size?: number }): string | null {
  if (!ALLOWED_ATTACHMENT_MIME.includes(file.type ?? "")) {
    return "That file type isn't supported yet — attach a PDF.";
  }
  if (!file.size) return "That file looks empty.";
  if (file.size > MAX_ATTACHMENT_BYTES) {
    const mb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
    return `That file is too large — attachments are capped at ${mb} MB.`;
  }
  return null;
}

/**
 * Resolve stored attachment paths to signed, downloadable URLs (1h) from the
 * given storage. Keyed by the original path so callers can do
 * `map.get(row.storage_path)`. Mirrors resolveScanPhotoUrls.
 */
export async function resolveJournalAttachmentUrls(
  storage: StorageApi,
  paths: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const real = Array.from(new Set(paths.filter(Boolean) as string[]));
  if (!real.length) return out;
  const { data } = await storage.from(JOURNAL_ATTACHMENTS_BUCKET).createSignedUrls(real, 3600);
  for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}

async function browserClient() {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase;
}

/**
 * Upload one document and record it against the entry. Owner/household path —
 * storage RLS (has_bird_access on the bird_id folder) and the table's
 * has_capability policies both gate this; the pre-check above is only for a
 * better error. On a failed row insert the uploaded object is removed so a
 * rejected attachment can't leave an orphan behind. Browser-only.
 */
export async function uploadJournalAttachment(
  birdId: string,
  journalEntryId: string,
  file: File,
): Promise<JournalAttachment> {
  const reason = attachmentRejectionReason(file);
  if (reason) throw new Error(reason);

  const sb = await browserClient();
  const path = `${birdId}/${crypto.randomUUID()}.pdf`;
  const { error: upErr } = await sb.storage
    .from(JOURNAL_ATTACHMENTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { data: u } = await sb.auth.getUser();
  const { data, error } = await sb
    .from("journal_attachments")
    .insert({
      journal_entry_id: journalEntryId,
      bird_id: birdId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: u?.user?.id ?? null,
    } as any)
    .select()
    .single();
  if (error || !data) {
    // Don't strand the object: the row is the only thing that makes it findable.
    try { await sb.storage.from(JOURNAL_ATTACHMENTS_BUCKET).remove([path]); } catch { /* best-effort */ }
    throw error ?? new Error("Couldn't save that attachment.");
  }
  return data as unknown as JournalAttachment;
}

/** Attachments for one or more entries, newest first. Owner/household path. */
export async function listJournalAttachments(journalEntryIds: string[]): Promise<JournalAttachment[]> {
  if (!journalEntryIds.length) return [];
  const sb = await browserClient();
  const { data, error } = await sb
    .from("journal_attachments")
    .select("*")
    .in("journal_entry_id", journalEntryIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as JournalAttachment[];
}

/** Sign attachment paths for display with the caller's own (RLS-gated) client. */
export async function signJournalAttachments(paths: Array<string | null | undefined>): Promise<Map<string, string>> {
  const sb = await browserClient();
  return resolveJournalAttachmentUrls(sb.storage, paths);
}

/**
 * Delete an attachment: row first, then the object. Row-first because the row
 * is what the UI reads — if the object delete fails we're left with an
 * unreferenced file (invisible, cleaned up with the bird) rather than a row
 * pointing at nothing (a broken link the owner can see).
 *
 * NOTE: the table's DELETE policy is owner-only, mirroring journal_entries, so
 * a household member who uploaded a file cannot remove it. That asymmetry is
 * inherited from the existing journal model, not introduced here.
 */
export async function removeJournalAttachment(attachment: Pick<JournalAttachment, "id" | "storage_path">): Promise<void> {
  const sb = await browserClient();
  const { error } = await sb.from("journal_attachments").delete().eq("id", attachment.id);
  if (error) throw error;
  try { await sb.storage.from(JOURNAL_ATTACHMENTS_BUCKET).remove([attachment.storage_path]); } catch { /* best-effort */ }
}
