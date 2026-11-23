import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ClipboardCheck, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { K, KyaPrimaryButton } from "@/components/kya";
import { FlockSubPage } from "@/components/flock/FlockSubPage";
import { FlockEmpty } from "@/components/flock/FlockChips";
import { ConfirmSheet } from "@/components/flock/PostParts";
import { PlaceFormSheet, placeGroupLabel } from "@/components/flock/PlaceParts";
import { useIsAdmin, useRegions } from "@/lib/flockData";
import { groupPlaces, movePlace, removePlace, updatedDay, useChapterPlaces, useInvalidatePlaces, usePlaceRules, type Place } from "@/lib/flockPlaces";

// Managing a chapter's Resources (backlog 1.6, SpecCollections screen 3): the
// chapter's lead (their own chapter) and admins (any chapter, ?region=) add,
// edit, reorder and remove listings, see when each was last updated, and
// reach the suggestions waiting in the review queue. Anyone else sees
// "only for chapter leads"; the database refuses them either way.
const SLUG = /^[a-z0-9-]{1,60}$/;
export const Route = createFileRoute("/_authenticated/flock/places")({
  validateSearch: (s: Record<string, unknown>): { region?: string } => (typeof s.region === "string" && SLUG.test(s.region) ? { region: s.region } : {}),
  component: ManagePlaces,
});

function ManagePlaces() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });
  const { region } = Route.useSearch();
  const { data: rules, isLoading: rulesLoading, isError } = usePlaceRules(region ?? null);
  const manage = !!rules?.can_manage;
  const slug = rules?.region_slug ?? null;
  const { data: places, isLoading } = useChapterPlaces(slug, manage && !!slug);
  const { data: isAdmin } = useIsAdmin();
  const { data: regions } = useRegions();
  const invalidate = useInvalidatePlaces();
  const [editing, setEditing] = useState<Place | "new" | null>(null);
  const [removing, setRemoving] = useState<Place | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const title = t("flock.chapter.resources", "Resources");
  if (rulesLoading) return <FlockSubPage title={title} fallback="/flock/chapter">{null}</FlockSubPage>;
  if (isError || !manage || !slug) {
    return (
      <FlockSubPage title={title} fallback="/flock/chapter">
        <FlockEmpty icon={<MapPin className="size-6" />} title={t("flock.places.notManagerTitle", "For chapter leads")}>
          {t("flock.places.notManager", "Chapter leads and admins look after a chapter's listings. You can suggest a place from your chapter's Resources tab.")}
        </FlockEmpty>
      </FlockSubPage>
    );
  }

  const line = rules.is_lead
    ? t("flock.places.leadLine", "{{chapter}} · you lead this chapter", { chapter: rules.region_name ?? "" })
    : rules.region_name ?? "";
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError(null);
    try { await fn(); await invalidate(); }
    catch { setError(t("flock.places.saveError", "We couldn't save that. Check the details and try again.")); }
    finally { setBusy(null); }
  };
  const groups = groupPlaces(places ?? []);

  return (
    <FlockSubPage title={title} line={line} fallback="/flock/chapter">
      <div className="flex flex-col gap-3" style={{ color: K.forest }} data-testid="manage-places">
        {isAdmin && regions && (
          <label className="flex flex-col gap-1.5 text-[14px] font-[700]">
            {t("flock.places.chapterPick", "Chapter")}
            <select value={slug} onChange={(e) => void navigate({ search: { region: e.target.value }, replace: true })} data-testid="places-region"
              className="min-h-[48px] rounded-[14px] border bg-white px-3.5 text-[16px] font-normal outline-none" style={{ borderColor: "#c9d3c8", color: K.forest }}>
              {regions.filter((r) => r.slug !== "other").map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
            </select>
          </label>
        )}
        {rules.pending > 0 && (
          <div className="flex items-center gap-2.5 rounded-[18px] p-4" style={{ background: K.lime }} data-testid="places-pending-card">
            <ClipboardCheck className="size-5 shrink-0" aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-[700]">{t("flock.places.waiting", "{{count}} suggestions waiting", { count: rules.pending })}</span>
              <span className="text-[13px]" style={{ color: K.ink }}>{t("flock.places.waitingLine", "Review them before they show to members.")}</span>
            </span>
            <Link to="/admin/review" search={{ filter: "places" }} className="inline-flex min-h-[44px] items-center rounded-full px-4 text-[14px] font-[700] text-white" style={{ background: K.forest }}>
              {t("flock.places.review", "Review")}
            </Link>
          </div>
        )}
        {error && <p role="alert" className="m-0 text-[14px]" style={{ color: K.red }}>{error}</p>}
        {!isLoading && groups.map((g) => (
          <section key={g.kind} className="flex flex-col gap-2" data-place-group={g.kind}>
            <h2 className="m-0 mt-1 text-[12.5px] font-[700] uppercase tracking-[0.06em]" style={{ color: K.moss }}>{placeGroupLabel(t, g.kind)}</h2>
            {g.places.length === 0 ? (
              <p className="m-0 rounded-[18px] bg-white px-4 py-3 text-[14px]" style={{ color: K.quiet }}>{t("flock.places.noneYet", "None listed yet.")}</p>
            ) : g.places.map((p, i) => (
              <div key={p.place_id} className="flex items-center gap-1 rounded-[18px] bg-white py-2 pl-4 pr-2" data-manage-place={p.place_id}>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
                  <span className="text-[15px] font-[700] leading-[1.25]">{p.name}</span>
                  <span className="text-[12.5px]" style={{ color: K.quiet }} data-testid="place-updated">
                    {t("flock.places.updated", "Updated {{day}}", { day: updatedDay(p.updated_at, i18n.language) })}
                  </span>
                </span>
                <button type="button" disabled={!!busy || i === 0} onClick={() => void run(p.place_id, () => movePlace(p.place_id, -1))}
                  aria-label={t("flock.places.moveUp", "Move {{name}} up", { name: p.name })} data-act="up"
                  className="grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-30" style={{ color: K.moss }}>
                  <ArrowUp className="size-5" aria-hidden="true" />
                </button>
                <button type="button" disabled={!!busy || i === g.places.length - 1} onClick={() => void run(p.place_id, () => movePlace(p.place_id, 1))}
                  aria-label={t("flock.places.moveDown", "Move {{name}} down", { name: p.name })} data-act="down"
                  className="grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-30" style={{ color: K.moss }}>
                  <ArrowDown className="size-5" aria-hidden="true" />
                </button>
                <button type="button" disabled={!!busy} onClick={() => setEditing(p)} data-act="edit"
                  className="inline-flex min-h-[44px] items-center px-2 text-[14px] font-[700]" style={{ color: K.moss }}>
                  {t("flock.places.edit", "Edit")}
                </button>
              </div>
            ))}
          </section>
        ))}
        <KyaPrimaryButton onClick={() => setEditing("new")}>{t("flock.places.add", "Add a listing")}</KyaPrimaryButton>
      </div>
      {editing && (
        <PlaceFormSheet region={slug} place={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => setEditing(null)}
          onRemove={editing === "new" ? undefined : () => { const p = editing; setEditing(null); setRemoving(p); }} />
      )}
      {removing && (
        <ConfirmSheet
          title={t("flock.places.removeTitle", "Remove this listing?")}
          line={t("flock.places.removeLine", "{{name}} comes off your chapter's Resources for everyone.", { name: removing.name })}
          confirm={t("flock.places.remove", "Remove listing")}
          busy={!!busy}
          onClose={() => setRemoving(null)}
          onConfirm={() => { const p = removing; void run(p.place_id, async () => { await removePlace(p.place_id); setRemoving(null); }); }}
        />
      )}
    </FlockSubPage>
  );
}
