import { useEffect, useId, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Library, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K } from "@/components/kya";
import { FlockBody, FlockHeader } from "@/components/FlockShell";
import { FlockChips, FlockEmpty } from "@/components/flock/FlockChips";
import {
  LIBRARY_SUBJECTS, LIBRARY_TYPES, pickOptional, pickQuery,
  type LibrarySubject, type LibraryType,
} from "@/lib/flockNav";

// Library: guides, recordings and the podcast. A search, then type and
// subject chips (a second tap on a subject clears it). All three live in the
// URL so a filtered view can be shared or reloaded.
export const Route = createFileRoute("/_authenticated/flock/library")({
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
    case "recordings": return t("flock.library.recordings", "Recordings");
    case "podcast": return t("flock.library.podcast", "Podcast");
  }
}

function subjectLabel(t: TFunction, v: LibrarySubject): string {
  switch (v) {
    case "foraging": return t("flock.library.foraging", "Foraging");
    case "diet": return t("flock.library.diet", "Diet");
    case "training": return t("flock.library.training", "Training");
    case "hormones": return t("flock.library.hormones", "Hormones");
    case "conservation": return t("flock.library.conservation", "Conservation");
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

  const filtered = !!search.q || !!search.subject || type !== "all";
  return (
    <>
      <FlockHeader title={t("flock.library.title", "Library")} />
      <FlockBody>
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
        {filtered
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
