// The Flock library (20261118120000_flock_library.sql). Flock code only:
// imported by the Library screens and /admin/library, never by shared code.
//
// Members read through flock_library_search / flock_library_resource
// (SECURITY INVOKER, so the table's RLS decides); admins read and write the
// table directly, which RLS allows only for admins. Files live in the private
// 'flock-library' bucket; storage signs a one-hour link only for someone its
// read policy lets see the file (admins, or a reader for a published resource).
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AvatarError, reencodeJpeg } from "@/lib/flockAvatar";
import { LIBRARY_RESOURCE_TYPES, LIBRARY_SUBJECTS, type LibraryResourceType, type LibrarySubject } from "@/lib/flockNav";
export { normalizeUrl, publishProblems, speciesFromText, type PublishProblem } from "@/lib/flockLibraryRules";

const sb = supabase as any;
const BUCKET = "flock-library";
function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export type LibraryStatus = "draft" | "published";

/** One row in the Library list. */
export type LibraryCard = {
  id: string; title: string; summary: string; resource_type: LibraryResourceType;
  topics: LibrarySubject[]; species: string[]; cover_path: string | null;
  has_attachment: boolean; vet_reviewed: boolean; published_at: string | null;
};

/** A whole resource, as the detail page shows it. */
export type LibraryResource = {
  id: string; title: string; summary: string; body: string; resource_type: LibraryResourceType;
  topics: LibrarySubject[]; species: string[]; cover_path: string | null; external_url: string | null;
  attachment_path: string | null; vet_reviewed: boolean; vet_reviewer: string | null; vet_reviewed_on: string | null;
  published_at: string | null; updated_at: string | null;
};

/** What the admin editor holds; also previewed with the member view. */
export type ResourceDraft = Omit<LibraryResource, "id" | "published_at" | "updated_at"> & {
  id: string | null; status: LibraryStatus; published_at: string | null; updated_at: string | null;
};

export const libraryKeys = {
  all: ["flock", "library"] as const,
  search: (q: string, type: string, topic: string) => ["flock", "library", "search", q, type, topic] as const,
  resource: (id: string) => ["flock", "library", "resource", id] as const,
  files: (paths: string[]) => ["flock", "library", "files", ...paths] as const,
  admin: ["flock", "library", "admin"] as const,
  adminOne: (id: string) => ["flock", "library", "admin", id] as const,
};

const cleanTopics = (v: unknown): LibrarySubject[] => asArray<string>(v).filter((t): t is LibrarySubject => (LIBRARY_SUBJECTS as string[]).includes(t));
const cleanType = (v: unknown): LibraryResourceType => ((LIBRARY_RESOURCE_TYPES as unknown[]).includes(v) ? (v as LibraryResourceType) : "guide");

// ---- Members ----------------------------------------------------------------

export function useLibrarySearch(input: { q?: string; type: LibraryResourceType | null; topic?: LibrarySubject }) {
  const q = input.q?.trim() ?? "";
  return useQuery({
    queryKey: libraryKeys.search(q, input.type ?? "", input.topic ?? ""),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<LibraryCard[]> => asArray<LibraryCard>(must(await sb.rpc("flock_library_search", {
      p_q: q || null, p_type: input.type, p_topic: input.topic ?? null, p_limit: 200,
    }))).map((r) => ({ ...r, resource_type: cleanType(r.resource_type), topics: cleanTopics(r.topics), species: asArray<string>(r.species) })),
  });
}

export function useLibraryResource(id: string) {
  return useQuery({
    queryKey: libraryKeys.resource(id),
    staleTime: 60_000,
    queryFn: async (): Promise<LibraryResource | null> => {
      const row = asArray<LibraryResource>(must(await sb.rpc("flock_library_resource", { p_id: id })))[0];
      return row ? { ...row, resource_type: cleanType(row.resource_type), topics: cleanTopics(row.topics), species: asArray<string>(row.species) } : null;
    },
  });
}

/** One-hour signed links for covers and PDFs, keyed by path. A path the
 *  caller may not read simply has no link. */
export function useLibraryFileUrls(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: libraryKeys.files(list),
    enabled: list.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(list, 3600);
      if (error) return {};
      const out: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) out[d.path] = d.signedUrl;
      return out;
    },
  });
}

// ---- Checklist ticks (this device only) ----------------------------------------------

const TICKS = (id: string) => `kya_library_ticks:${id}`;
export function loadTicks(id: string): number[] {
  try { return asArray<number>(JSON.parse(localStorage.getItem(TICKS(id)) ?? "[]")).filter((n) => Number.isInteger(n)); } catch { return []; }
}
export function saveTicks(id: string, ticks: number[]): void {
  try { localStorage.setItem(TICKS(id), JSON.stringify(ticks)); } catch { /* private mode etc. */ }
}

// ---- Admin --------------------------------------------------------------------------

const ADMIN_COLUMNS = "id, title, summary, body, resource_type, topics, species, cover_path, external_url, attachment_path, status, vet_reviewed, vet_reviewer, vet_reviewed_on, published_at, updated_at";

const toDraft = (r: any): ResourceDraft => ({
  ...r, summary: r.summary ?? "", body: r.body ?? "", resource_type: cleanType(r.resource_type),
  topics: cleanTopics(r.topics), species: asArray<string>(r.species), status: r.status === "published" ? "published" : "draft",
});

export function emptyDraft(): ResourceDraft {
  return {
    id: null, title: "", summary: "", body: "", resource_type: "guide", topics: [], species: [], cover_path: null, external_url: null,
    attachment_path: null, status: "draft", vet_reviewed: false, vet_reviewer: null, vet_reviewed_on: null, published_at: null, updated_at: null,
  };
}

export function useAdminLibrary(enabled: boolean) {
  return useQuery({
    queryKey: libraryKeys.admin,
    enabled,
    queryFn: async (): Promise<ResourceDraft[]> =>
      asArray<any>(must(await sb.from("library_resources").select(ADMIN_COLUMNS).order("updated_at", { ascending: false }))).map(toDraft),
  });
}

export function useAdminResource(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: libraryKeys.adminOne(id ?? "new"),
    enabled: enabled && !!id,
    queryFn: async (): Promise<ResourceDraft | null> => {
      const row = asArray<any>(must(await sb.from("library_resources").select(ADMIN_COLUMNS).eq("id", id)))[0];
      return row ? toDraft(row) : null;
    },
  });
}

export function useInvalidateLibrary() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: libraryKeys.all });
}

/** Create (no id) or update a resource. Returns its id. */
export async function saveResource(d: ResourceDraft): Promise<string> {
  const row = {
    title: d.title.trim(), summary: d.summary.trim(), body: d.body, resource_type: d.resource_type, topics: d.topics, species: d.species,
    cover_path: d.cover_path, external_url: d.external_url?.trim() || null, attachment_path: d.attachment_path, status: d.status,
    vet_reviewed: d.vet_reviewed, vet_reviewer: d.vet_reviewer?.trim() || null, vet_reviewed_on: d.vet_reviewed_on || null,
  };
  if (d.id) {
    must(await sb.from("library_resources").update(row).eq("id", d.id));
    return d.id;
  }
  const created = asArray<{ id: string }>(must(await sb.from("library_resources").insert(row).select("id")))[0];
  if (!created) throw new Error("not saved");
  return created.id;
}

export async function deleteResource(d: Pick<ResourceDraft, "id" | "cover_path" | "attachment_path">): Promise<void> {
  if (!d.id) return;
  must(await sb.from("library_resources").delete().eq("id", d.id));
  await removeLibraryFiles([d.cover_path, d.attachment_path]);
}

/** Files no resource points at any more (replaced or deleted). Best effort. */
export async function removeLibraryFiles(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await supabase.storage.from(BUCKET).remove(list).then(() => undefined, () => undefined);
}

export class LibraryFileError extends Error {}
export const PDF_MAX_BYTES = 25 * 1024 * 1024; // the bucket's limit

/** A cover, redrawn as a new JPEG (no EXIF/GPS), at most 1600px and 2 MB. */
export async function uploadCover(file: File): Promise<string> {
  let blob: Blob;
  try { blob = await reencodeJpeg(file, 1600, 2 * 1024 * 1024); }
  catch (e) { throw new LibraryFileError(e instanceof AvatarError ? e.message : "We couldn't read that photo. Try a JPEG or PNG."); }
  const path = `covers/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new LibraryFileError("We couldn't save that photo. Try again.");
  return path;
}

/** A PDF, uploaded as it is (up to 25 MB). */
export async function uploadPdf(file: File): Promise<string> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!isPdf) throw new LibraryFileError("That isn't a PDF. Choose a .pdf file.");
  if (file.size > PDF_MAX_BYTES) throw new LibraryFileError("That PDF is over 25 MB. Try a smaller one.");
  const path = `files/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: "application/pdf", upsert: false });
  if (error) throw new LibraryFileError("We couldn't save that PDF. Try again.");
  return path;
}
