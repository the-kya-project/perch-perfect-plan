import { createFileRoute } from "@tanstack/react-router";
import { Library, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { ResourceView } from "@/components/flock/LibraryParts";
import { useLibraryFileUrls, useLibraryResource } from "@/lib/flockLibrary";
import { trackFlock } from "@/lib/flockAnalytics";

// One library resource: the body, its type, its tags, the link or PDF, and
// "Reviewed by an avian vet" only when the resource says so. Published
// resources only (flock_library_resource); anything else reads as not found.
export const Route = createFileRoute("/_authenticated/flock/library/$resourceId")({
  component: LibraryResourcePage,
});

function LibraryResourcePage() {
  const { t } = useTranslation();
  const { resourceId } = Route.useParams();
  const { data: r, isLoading } = useLibraryResource(resourceId);
  const { data: urls } = useLibraryFileUrls([r?.cover_path, r?.attachment_path]);
  // Once per resource opened (not on refetches). The id and type only: no title.
  const openedId = r?.id;
  const openedType = r?.resource_type;
  const vetReviewed = r?.vet_reviewed;
  useEffect(() => {
    if (openedId) trackFlock("flock_library_resource_opened", { resource_id: openedId, resource_type: openedType, vet_reviewed: !!vetReviewed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedId]);
  return (
    <FlockSubPage title={t("flock.library.title", "Library")} fallback="/flock/library">
      {isLoading
        ? <div className="grid min-h-[40vh] place-items-center" role="status" aria-label={t("flock.library.loading", "Loading the library")}><Loader2 className="size-8 animate-spin" style={{ color: K.moss }} /></div>
        : r
          ? <ResourceView r={r} urls={urls} tickKey={r.resource_type === "checklist" ? r.id : undefined} />
          : (
            <FlockEmpty icon={<Library className="size-6" />} title={t("flock.library.notFoundTitle", "This isn't in the library")}>
              {t("flock.library.notFound", "It may have been taken down for an update. Everything else is still on the shelves.")}
            </FlockEmpty>
          )}
    </FlockSubPage>
  );
}
