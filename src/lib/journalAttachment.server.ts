// Service-role read path for journal attachments, for the token-based sitter
// view. Sitters have no account, so the RLS-gated browser client can never read
// these rows or sign these objects — the same reason resolveScanPhotoUrls is
// handed `supabaseAdmin.storage` in sitter.functions.ts. Mirrors that pattern.
//
// SCOPING CONTRACT — read before calling:
// This module does NOT validate sit tokens and deliberately does not duplicate
// that logic. Token validation (exists / not revoked / not past
// token_expires_at) and the bird-in-sit check live in sitter.functions.ts
// (`loadSitByToken` + `assertBirdInSit`) and stay the single source of truth.
// Callers MUST have already validated the token AND confirmed the bird belongs
// to that sit before passing birdId here. Everything below trusts birdId
// completely: pass an unauthorized one and it will happily return that bird's
// attachments.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  JOURNAL_ATTACHMENTS_BUCKET,
  resolveJournalAttachmentUrls,
  type JournalAttachment,
} from "./journalAttachment";

export { JOURNAL_ATTACHMENTS_BUCKET };

export type SitterJournalAttachment = JournalAttachment & { url: string | null };

/**
 * Attachments for the given entries, restricted to one already-authorized bird,
 * each with a signed URL (1h).
 *
 * The `.eq("bird_id", birdId)` is load-bearing: entry ids arrive from the
 * caller, so without it a sitter holding a valid token for bird A could pass a
 * journal entry id belonging to bird B and read its documents. Filtering on the
 * bird the sit actually covers makes that return nothing.
 */
export async function listSitterJournalAttachments(
  sb: SupabaseClient<any, any, any>,
  opts: { birdId: string; journalEntryIds: string[] },
): Promise<SitterJournalAttachment[]> {
  if (!opts.journalEntryIds.length) return [];
  const { data, error } = await sb
    .from("journal_attachments")
    .select("*")
    .eq("bird_id", opts.birdId)
    .in("journal_entry_id", opts.journalEntryIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as JournalAttachment[];
  if (!rows.length) return [];
  const urls = await resolveJournalAttachmentUrls(sb.storage, rows.map((r) => r.storage_path));
  return rows.map((r) => ({ ...r, url: urls.get(r.storage_path) ?? null }));
}
