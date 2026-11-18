import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaBackRow, KyaBody, KyaHeader, KyaPage, KyaTitle } from "@/components/kya";
import { AdminOnly } from "@/components/flock/AdminOnly";
import { ResourceTypeIcon, resourceTypeLabel } from "@/components/flock/LibraryParts";
import { FLOCK_ENABLED_QUERY } from "@/lib/flock";
import { useIsAdmin } from "@/lib/flockData";
import { useAdminLibrary } from "@/lib/flockLibrary";

// The library's admin list: every resource, drafts included, newest edit
// first, and New resource. Behind the Flock gate, then admins only (RLS on
// library_resources refuses everyone else, whatever this page shows).
export const Route = createFileRoute("/_authenticated/admin/library/")({
  head: () => ({ meta: [{ title: "Library — Kya & Co." }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) throw redirect({ to: "/dashboard", replace: true });
  },
  component: () => <AdminOnly><AdminLibrary /></AdminOnly>,
});

function AdminLibrary() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: isAdmin } = useIsAdmin();
  const { data: rows, isLoading, isError } = useAdminLibrary(isAdmin === true);
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(i18n.language, { month: "short", day: "numeric" }) : "");
  return (
    <KyaPage>
      <KyaHeader>
        <KyaBackRow label={t("headers.back", "Back")} onBack={() => void navigate({ to: "/flock/library" })}
          right={(
            <Link to="/admin/library/$resourceId" params={{ resourceId: "new" }} data-testid="new-resource"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[15px] font-[700]" style={{ background: K.lime, color: K.forest }}>
              <Plus className="size-4" aria-hidden="true" />{t("flock.libraryAdmin.new", "New resource")}
            </Link>
          )} />
        <KyaTitle title={t("flock.libraryAdmin.title", "Library")} line={t("flock.libraryAdmin.line", "Admin · drafts stay hidden until you publish")} />
      </KyaHeader>
      <KyaBody>
        {isLoading
          ? <div className="grid min-h-[120px] place-items-center" role="status" aria-label="Loading"><Loader2 className="size-7 animate-spin" style={{ color: K.moss }} /></div>
          : isError
            ? <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }}>{t("flock.libraryAdmin.loadError", "We couldn't load the library. Try again.")}</p>
            : (rows ?? []).length === 0
              ? (
                <div className="rounded-[20px] bg-white p-5 text-[15px] leading-[1.55]" style={{ color: K.ink }} data-testid="admin-library-empty">
                  {t("flock.libraryAdmin.empty", "Nothing here yet. Tap New resource to write your first guide. It stays a draft, visible only to admins, until you publish it.")}
                </div>
              )
              : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="admin-library-list">
                  {(rows ?? []).map((r) => (
                    <li key={r.id}>
                      <Link to="/admin/library/$resourceId" params={{ resourceId: r.id! }} data-resource={r.id} data-status={r.status}
                        className="flex min-h-[60px] items-center gap-3 rounded-[16px] bg-white px-3 py-2.5" style={{ color: K.forest }}>
                        <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ background: K.mist }}><ResourceTypeIcon type={r.resource_type} /></span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[15px] font-[700]">{r.title || t("flock.library.untitled", "Untitled")}</span>
                          <span className="truncate text-[12.5px]" style={{ color: K.quiet }}>
                            {[resourceTypeLabel(t, r.resource_type), r.vet_reviewed ? t("flock.library.vetShort", "Vet reviewed") : null,
                              t("flock.libraryAdmin.edited", "Edited {{day}}", { day: day(r.updated_at) })].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="rounded-full px-2.5 py-1 text-[12px] font-[700]" data-testid="resource-status"
                          style={r.status === "published" ? { background: K.lime, color: K.forest } : { background: K.amberBg, color: K.amberText }}>
                          {r.status === "published" ? t("flock.libraryAdmin.published", "Published") : t("flock.libraryAdmin.draft", "Draft")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
      </KyaBody>
    </KyaPage>
  );
}
