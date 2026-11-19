import { useEffect, useId, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Library, Loader2, Search, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K } from "@/components/kya";
import { FlockBody, FlockHeader } from "@/components/FlockShell";
import { FlockChips, FlockEmpty } from "@/components/flock/FlockChips";
import { ResourceCard, subjectLabel } from "@/components/flock/LibraryParts";
import { useIsAdmin } from "@/lib/flockData";
import { useLibraryFileUrls, useLibrarySearch } from "@/lib/flockLibrary";
import {
  LIBRARY_SUBJECTS, LIBRARY_TYPES, pickOptional, pickQuery, resourceTypeFor,
  type LibrarySubject, type LibraryType,
} from "@/lib/flockNav";

// Library: guides, checklists, videos and links (20261118120000_flock_library).
// A search, then type and subject chips (a second tap on a subject clears it).
// All three live in the URL so a filtered view can be shared or reloaded, and
// each one is a query against the published resources.
export const Route = createFileRoute("/_authenticated/flock/library/")({
  validateSearch: (s: Record<string, unknown>): { type?: LibraryType; subject?: LibrarySubject; q?: string } => ({
    type: pickOptional(s.type, LIBRARY_TYPES),
    subject: pickOptional(s.subject, LIBRARY_SUBJECTS),
    q: pickQuery(s.q),
  }),
  component: FlockLibrary,
});

function typeLabel(t: TFunction, v: LibraryType): string {
  switch (v) {
    case "all": return t("flock.library.all", "All");
    case "guides": return t("flock.library.guides", "Guides");
    case "checklists": return t("flock.library.checklists", "Checklists");
    case "videos": return t("flock.library.videos", "Videos");
    case "links": return t("flock.library.links", "Links");
  }
}

function FlockLibrary() {
  const { t } = useTranslation();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const inputId = useId();
  const type: LibraryType = search.type ?? "all";
  // Typing stays local and reaches the URL a moment later, so every keystroke
  // doesn't rewrite the address.
  const [text, setText] = useState(search.q ?? "");
  useEffect(() => {
    const id = setTimeout(() => {
      const q = pickQuery(text);
      if (q !== search.q) void navigate({ search: (prev) => ({ ...prev, q }), replace: true });
    }, 300);
    return () => clearTimeout(id);
  }, [text, search.q, navigate]);

  const { data: isAdmin } = useIsAdmin();
  const { data: results, isLoading, isError, refetch } = useLibrarySearch({ q: search.q, type: resourceTypeFor(type), topic: search.subject });
  const { data: urls } = useLibraryFileUrls((results ?? []).map((r) => r.cover_path));
  const filtered = !!search.q || !!search.subject || type !== "all";
  const list = results ?? [];

  return (
    <>
      <FlockHeader title={t("flock.library.title", "Library")} />
      <FlockBody>
        {isAdmin && (
          <Link to="/admin/library" data-testid="manage-library"
            className="inline-flex min-h-[44px] items-center gap-2 self-end rounded-full bg-white px-4 text-[14px] font-[700]" style={{ color: K.forest, border: `1.5px solid ${K.line}` }}>
            <Settings2 className="size-4" aria-hidden="true" />{t("flock.library.manage", "Manage library")}
          </Link>
        )}
        <div role="search">
          <label htmlFor={inputId} className="sr-only">{t("flock.library.searchLabel", "Search the library")}</label>
          <div className="flex h-12 items-center gap-2 rounded-full bg-white px-[18px]" style={{ border: `2px solid ${K.line}` }}>
            <Search className="size-5 shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
            <input
              id={inputId}
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("flock.library.searchPlaceholder", "Search the library")}
              maxLength={100}
              enterKeyHint="search"
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none"
              style={{ color: K.forest }}
            />
          </div>
        </div>
        <FlockChips
          label={t("flock.library.typeAria", "Type")}
          testId="library-type-chips"
          options={LIBRARY_TYPES.map((v) => ({ value: v, label: typeLabel(t, v) }))}
          value={type}
          onChange={(v) => void navigate({ search: (prev) => ({ ...prev, type: !v || v === "all" ? undefined : v }), replace: true })}
        />
        <FlockChips
          label={t("flock.library.subjectAria", "Subject")}
          testId="library-subject-chips"
          allowNone
          options={LIBRARY_SUBJECTS.map((v) => ({ value: v, label: subjectLabel(t, v) }))}
          value={search.subject}
          onChange={(v) => void navigate({ search: (prev) => ({ ...prev, subject: v }), replace: true })}
        />
        {isLoading && !results
          ? <div className="grid min-h-[120px] place-items-center" role="status" aria-label={t("flock.library.loading", "Loading the library")}><Loader2 className="size-7 animate-spin" style={{ color: K.moss }} /></div>
          : isError && !results
            ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center" role="alert">
                <p className="m-0 text-[15px]" style={{ color: K.ink }}>{t("flock.library.error", "We couldn't load the library just now.")}</p>
                <button type="button" onClick={() => void refetch()} className="min-h-[44px] px-4 text-[15px] font-[700]" style={{ color: K.moss }}>{t("flock.library.retry", "Try again")}</button>
              </div>
            )
            : list.length > 0
              ? (
                <ul className="m-0 flex list-none flex-col gap-2.5 p-0" data-testid="library-results" aria-label={t("flock.library.results", "Library resources")}>
                  {list.map((r) => <ResourceCard key={r.id} r={r} coverUrl={r.cover_path ? urls?.[r.cover_path] : undefined} />)}
                </ul>
              )
              : filtered
                ? (
                  <FlockEmpty icon={<Library className="size-6" />} title={t("flock.library.empty.filteredTitle", "Nothing matches yet")}>
                    {t("flock.library.empty.filtered", "Nothing in the library matches that yet. New guides and recordings are on the way.")}
                  </FlockEmpty>
                )
                : (
                  <FlockEmpty icon={<Library className="size-6" />} title={t("flock.library.empty.title", "The shelves are filling")}>
                    {t("flock.library.empty.line", "Guides, recordings, and podcast episodes will live here, ready to search by subject.")}
                  </FlockEmpty>
                )}
      </FlockBody>
    </>
  );
}
