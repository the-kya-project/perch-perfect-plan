import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, Plus, Share2, Loader2, CalendarHeart, Egg, House, Sparkles, Trash2 } from "lucide-react";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { uploadJournalPhoto, signJournalPhotos } from "@/lib/journalPhoto";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useBirdRole } from "@/lib/useBirdRole";
import { shareMomentCard } from "@/lib/momentCard";
import { togetherSince, occurredYears } from "@/lib/togetherSince";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaIconTile, KyaPrimaryButton, KyaSecondaryButton, KyaSheet, KyaField, KyaRequiredTag } from "@/components/kya";
import { useConfirm } from "@/components/ConfirmSheet";
import { PageHeader, useGoBack } from "@/components/headers";
import { friendlyError } from "@/lib/errorMessage";
import { formatLocalDate } from "@/lib/dates";
import { localDateISO } from "@/lib/localDay";
import i18next from "i18next";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/birds/$birdId/moments")({
  head: () => ({ meta: [{ title: i18next.t("birdMoments.metaTitle", "Moments — Kya & Co.") }] }),
  component: MomentsFacet,
});

type AnchorKey = "gotcha_day" | "hatch_day";
type AnchorPhoto = { anchor: string; year: number; photo_path: string };
type Custom = { id: string; title: string | null; on_date: string | null; photo_path: string | null };
type Anchor = { key: AnchorKey; baseISO: string };

// ---- date helpers ----
const todayMid = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12); };
function nextOccurrence(baseISO: string) {
  const base = new Date(`${baseISO}T12:00:00`);
  const today = todayMid();
  let d = new Date(today.getFullYear(), base.getMonth(), base.getDate(), 12);
  if (d < today) d = new Date(today.getFullYear() + 1, base.getMonth(), base.getDate(), 12);
  return { date: d, years: d.getFullYear() - base.getFullYear() };
}
const daysUntil = (d: Date) => Math.round((+d - +todayMid()) / 86_400_000);
function relDay(d: Date) {
  const n = daysUntil(d);
  if (n === 0) return i18next.t("birdMoments.today", "today");
  if (n === 1) return i18next.t("birdMoments.tomorrow", "tomorrow");
  if (n < 7) return i18next.t("birdMoments.onDate", "on {{date}}", { date: formatLocalDate(d, { weekday: "long" }) });
  return i18next.t("birdMoments.onDate", "on {{date}}", { date: formatLocalDate(d, { month: "long", day: "numeric" }) });
}
const fmtDate = (iso: string) => formatLocalDate(new Date(`${iso}T12:00:00`), { month: "short", day: "numeric", year: "numeric" });
const monthDay = (iso: string) => formatLocalDate(new Date(`${iso}T12:00:00`), { month: "short", day: "numeric" });
/** Calendar position (MM-DD) for ordering the milestone list Jan → Dec. */
const calKey = (iso: string) => iso.slice(5, 10);

/** "2024, 2025, 2026", or "2016–2026" once the list gets long. */
function yearsText(years: number[]): string {
  if (years.length > 5) return `${years[0]}–${years[years.length - 1]}`;
  return years.join(", ");
}

/** Sunflower pill, the compact form of the main button (Share). */
function SunflowerPill({ children, onClick, icon }: { children: ReactNode; onClick: () => void; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border-2 px-5 text-[15px] font-[700] active:scale-[0.98]" style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}>
      {icon}{children}
    </button>
  );
}

type MilestoneItem =
  | { type: "anchor"; key: string; sort: string; anchor: Anchor }
  | { type: "custom"; key: string; sort: string; custom: Custom };

function MomentsFacet() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  // Return where the visitor came from (bird record, or a Remembering memorial
  // card); fall back to the bird record when there's no real history.
  const goBack = useGoBack(useCallback(() => navigate({ to: "/birds/$birdId", params: { birdId } }), [navigate, birdId]));
  const qc = useQueryClient();
  // One sheet at a time: adding/editing a milestone, or one anchor's year photos.
  const [sheet, setSheet] = useState<{ kind: "add" } | { kind: "edit"; custom: Custom } | { kind: "anchor"; key: AnchorKey } | null>(null);
  const [busy, setBusy] = useState(false);
  // Moments/anchor photos are owner-curated (RLS: owner-write, member-read).
  // Household members view them but can't add — gate every write affordance so
  // they're never shown a form/upload that RLS will reject on save.
  const role = useBirdRole(birdId);
  const isOwner = role === "owner";

  const { data: bird } = useQuery({
    queryKey: ["bird-moments-id", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("name, birth_date, acquired_on, photo_url, photo_position").eq("id", birdId).maybeSingle();
      return data as { name: string; birth_date: string | null; acquired_on: string | null; photo_url: string | null; photo_position: string | null } | null;
    },
  });

  const { data: anchorPhotos = [] } = useQuery({
    queryKey: ["anchor-photos", birdId],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.from("anchor_photos").select("anchor, year, photo_path").eq("bird_id", birdId);
      if (error) return [];
      return (data ?? []) as AnchorPhoto[];
    },
  });

  const { data: customs = [] } = useQuery({
    queryKey: ["moments", birdId],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("moments")
        .select("id, title, on_date, photo_path")
        .eq("bird_id", birdId).eq("auto_generated", false)
        .order("on_date", { ascending: false });
      if (error) return [];
      return (data ?? []) as Custom[];
    },
  });

  // Sign every photo path in one batch.
  const allPaths = [...anchorPhotos.map((a) => a.photo_path), ...customs.map((c) => c.photo_path).filter(Boolean) as string[]];
  const { data: urls = {} } = useQuery({
    queryKey: ["moment-photo-urls", birdId, allPaths.slice().sort().join(",")],
    enabled: allPaths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => Object.fromEntries(await signJournalPhotos(allPaths)),
  });
  const urlFor = (p: string | null | undefined) => (p ? (urls as Record<string, string>)[p] ?? null : null);

  const name = bird?.name ?? t("birdMoments.thisBird", "This bird");
  const birdPhotoOf = useBirdPhotos([bird?.photo_url], 800);
  const birdPhoto = birdPhotoOf(bird?.photo_url);
  const photoByYear = new Map(anchorPhotos.map((a) => [`${a.anchor}:${a.year}`, a.photo_path]));

  // Derived anchors (only when the identity date exists). Gotcha-day is the
  // came-home date, birds.acquired_on.
  const anchors: Anchor[] = [];
  if (bird?.acquired_on) anchors.push({ key: "gotcha_day", baseISO: bird.acquired_on });
  if (bird?.birth_date) anchors.push({ key: "hatch_day", baseISO: bird.birth_date });

  const yearsTogetherText = (n: number) =>
    t("birdMoments.yearsTogether", "{{count}} years together", { count: n, defaultValue_one: "{{count}} year together" });

  /** The anniversary that falls in a given year (n = years since the base date). */
  const anchorTitle = (a: Anchor, n: number) => {
    if (n <= 0) {
      return a.key === "gotcha_day"
        ? t("birdMoments.cameHomeDay", "The day {{name}} came home", { name })
        : t("birdMoments.hatchedDay", "The day {{name}} hatched", { name });
    }
    return a.key === "gotcha_day" ? yearsTogetherText(n) : t("birdMoments.turns", "{{name}} turns {{n}}", { name, n });
  };

  /** How long the bird has been home as of today — full years, birthday-style,
   *  so Sep 13, 2024 reads "2 years together" on Oct 20, 2026. */
  const togetherNow = (cameHomeISO: string) => {
    const s = togetherSince(cameHomeISO, todayMid());
    if (s.unit === "years") return yearsTogetherText(s.count);
    if (s.unit === "months") return t("birdMoments.monthsTogether", "{{count}} months together", { count: s.count, defaultValue_one: "{{count}} month together" });
    return t("birdMoments.lessThanMonthTogether", "Less than a month together");
  };

  const anchorLabel = (a: Anchor) => (a.key === "gotcha_day" ? t("birdMoments.gotchaDay", "Gotcha-day") : t("birdMoments.hatchDay", "Hatch-day"));

  // Featured keepsake = soonest upcoming anchor.
  const featured = anchors
    .map((a) => ({ a, occ: nextOccurrence(a.baseISO) }))
    .sort((x, y) => +x.occ.date - +y.occ.date)[0];
  const featuredAnchorPhoto = featured
    ? urlFor(photoByYear.get(`${featured.a.key}:${featured.occ.date.getFullYear()}`) ?? [...anchorPhotos].filter((p) => p.anchor === featured.a.key).sort((m, n) => n.year - m.year)[0]?.photo_path)
    : null;
  // Fall back to the bird's profile photo (focal-point framed) instead of a bare
  // gradient when there's no milestone photo for the featured anchor.
  const featuredFromBird = !featuredAnchorPhoto && !!birdPhoto?.url;
  const featuredPhoto = featuredAnchorPhoto ?? birdPhoto?.url ?? null;
  const featuredPosition = featuredFromBird ? (bird?.photo_position ?? "50% 50%") : "50% 50%";
  // The gotcha-day card states how long they've been together now; hatch-day
  // names the coming birthday, counted from the saved hatch date (the same
  // date the bird page's age comes from, via lib/birdAge).
  const featuredTitle = featured
    ? featured.a.key === "gotcha_day"
      ? togetherNow(featured.a.baseISO)
      : featured.occ.years > 0
        ? t("birdMoments.turnsOn", "{{name}} turns {{n}} on {{date}}", { name, n: featured.occ.years, date: formatLocalDate(featured.occ.date, { month: "long", day: "numeric" }) })
        : anchorTitle(featured.a, featured.occ.years)
    : "";
  const featuredContext = featured
    ? featured.a.key === "hatch_day"
      ? t("birdMoments.hatchedOn", "Hatched {{date}}", { date: fmtDate(featured.a.baseISO) })
      : `${name} · ${monthDay(featured.a.baseISO)}`
    : "";

  // Nudge = an anchor within ~7 days. This one looks ahead, so it names the
  // anniversary that's coming.
  const nudge = anchors
    .map((a) => ({ a, occ: nextOccurrence(a.baseISO) }))
    .filter((x) => daysUntil(x.occ.date) <= 7 && daysUntil(x.occ.date) >= 0)
    .sort((x, y) => +x.occ.date - +y.occ.date)[0];

  // One list: the yearly anchors and the owner's own, in calendar order.
  const items: MilestoneItem[] = [
    ...anchors.map((a): MilestoneItem => ({ type: "anchor", key: a.key, sort: `${calKey(a.baseISO)}|${a.baseISO}`, anchor: a })),
    ...customs.map((c): MilestoneItem => ({ type: "custom", key: c.id, sort: c.on_date ? `${calKey(c.on_date)}|${c.on_date}` : "99", custom: c })),
  ].sort((x, y) => x.sort.localeCompare(y.sort));

  async function addAnchorPhoto(anchor: AnchorKey, year: number, file: File) {
    setBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) { toast.error(t("birdMoments.photoTooLarge", "That photo's a bit too large even after resizing. Try a different one.")); return; }
      const path = await uploadJournalPhoto(birdId, dataUrl);
      const { error } = await supabase.from("anchor_photos").upsert({ bird_id: birdId, anchor, year, photo_path: path }, { onConflict: "bird_id,anchor,year" });
      if (error) throw error;
      toast.success(t("birdMoments.photoSaved", "Photo saved."));
      qc.invalidateQueries({ queryKey: ["anchor-photos", birdId] });
    } catch (e: any) {
      toast.error(friendlyError(e, t("birdMoments.photoSaveFailed", "Couldn't save the photo.")));
    } finally {
      setBusy(false);
    }
  }

  async function share(opts: { photoUrl?: string | null; title: string; context: string }) {
    try {
      const r = await shareMomentCard(opts);
      if (r === "saved") toast.success(t("birdMoments.cardSaved", "Saved a card to your photos."));
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error(t("birdMoments.cardFailed", "Couldn't create the share card."));
    }
  }

  const shareCustom = (c: Custom) => share({
    photoUrl: urlFor(c.photo_path),
    title: c.title || t("birdMoments.milestone", "Milestone"),
    context: `${name}${c.on_date ? ` · ${monthDay(c.on_date)}` : ""}`,
  });

  const sheetAnchor = sheet?.kind === "anchor" ? anchors.find((a) => a.key === sheet.key) ?? null : null;
  const refreshCustoms = () => qc.invalidateQueries({ queryKey: ["moments", birdId] });

  return (
    <KyaPage>
      <PageHeader
        onBack={goBack}
        title={bird?.name
          ? t("birdMoments.titleNamed", "{{name}}'s moments", { name: bird.name })
          : t("birdMoments.titlePlain", "Moments")}
        line={t("birdMoments.line", "The days worth remembering.")}
      />

      <KyaBody>
        {busy && (
          <p className="m-0 inline-flex items-center gap-2 px-1 text-[14px] font-[700]" style={{ color: K.moss }}>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("birdMoments.savingPhoto", "Saving photo…")}
          </p>
        )}

        {/* Upcoming nudge — only within ~7 days, owner-only (it's an upload prompt) */}
        {nudge && isOwner && (
          <KyaCard>
            <div className="flex items-center gap-3 px-4 py-3">
              <KyaIconTile><CalendarHeart className="size-5" /></KyaIconTile>
              <p className="m-0 min-w-0 flex-1 text-[15px] leading-[1.45]" style={{ color: K.forest }}>
                {t("birdMoments.nudge", "{{title}} {{when}} — mark it with a photo.", { title: anchorTitle(nudge.a, nudge.occ.years), when: relDay(nudge.occ.date) })}
              </p>
              <label className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-2 bg-white px-4 text-[15px] font-[700] active:scale-[0.98]" style={{ borderColor: K.forest, color: K.forest }}>
                <Plus className="size-4" /> {t("birdMoments.add", "Add")}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) addAnchorPhoto(nudge.a.key, nudge.occ.date.getFullYear(), f); }} />
              </label>
            </div>
          </KyaCard>
        )}

        {/* Share card — the photo with the keepsake overlay, then the share row */}
        {featured && (
          <KyaCard>
            <div className="relative aspect-[4/5] w-full overflow-hidden">
              {featuredPhoto ? (
                <img src={featuredPhoto} alt="" className="absolute inset-0 size-full object-cover" style={{ objectPosition: featuredPosition }} />
              ) : (
                <div className="absolute inset-0" style={{ background: `linear-gradient(135deg,${K.moss},${K.lime})` }} />
              )}
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(26,61,46,.92) 0%, rgba(26,61,46,0) 48%)" }} />
              <span className="absolute right-4 top-4 text-[13px] font-[700] text-white/90">The Kya Project</span>
              <div className="absolute inset-x-0 bottom-0 p-5">
                <KyaHeading as="h2" size={26} className="text-white">{featuredTitle}</KyaHeading>
                <p className="m-0 mt-1 text-[15px] text-white/85">{featuredContext}</p>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="m-0 text-[14px] leading-[1.4]" style={{ color: K.quiet }}>{t("birdMoments.saveOrShare", "Save to your photos or share anywhere.")}</p>
              <SunflowerPill
                icon={<Share2 className="size-4" />}
                onClick={() => share({ photoUrl: featuredPhoto, title: featuredTitle, context: featuredContext })}
              >
                {t("birdMoments.share", "Share")}
              </SunflowerPill>
            </div>
          </KyaCard>
        )}

        {/* Only once the bird has loaded: before that there are no anchors yet,
            which isn't the same as none being set. */}
        {bird !== undefined && anchors.length === 0 && (
          <KyaCard className="p-6 text-center">
            <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.quiet }}>
              {isOwner
                ? t("birdMoments.emptyOwner", "Add {{name}}'s hatch date and the day they came home in Identity, and their yearly moments will appear here.", { name })
                : t("birdMoments.emptyMember", "Once {{name}}'s owner adds a hatch date or homecoming day, the yearly moments will appear here.", { name })}
            </p>
          </KyaCard>
        )}

        {/* Milestones — the yearly anchors and the owner's own, one list.
            Members see it only when there's something to view. */}
        {(items.length > 0 || isOwner) && (
          <section className="flex flex-col gap-2.5">
            <KyaHeading size={21} className="px-1">{t("birdMoments.milestones", "Milestones")}</KyaHeading>
            {items.length > 0 && (
              <KyaCard>
                {items.map((it, i) => {
                  const last = i === items.length - 1;
                  if (it.type === "anchor") {
                    const a = it.anchor;
                    const years = occurredYears(a.baseISO, todayMid());
                    const detail = years.length
                      ? t("birdMoments.everyYearLine", "{{date}} · every year · {{years}}", { date: monthDay(a.baseISO), years: yearsText(years) })
                      : t("birdMoments.everyYearShort", "{{date}} · every year", { date: monthDay(a.baseISO) });
                    return (
                      <MilestoneRow
                        key={it.key}
                        last={last}
                        leading={<KyaIconTile>{a.key === "gotcha_day" ? <House className="size-5" /> : <Egg className="size-5" />}</KyaIconTile>}
                        title={anchorLabel(a)}
                        detail={detail}
                        onClick={() => setSheet({ kind: "anchor", key: a.key })}
                      />
                    );
                  }
                  const c = it.custom;
                  const url = urlFor(c.photo_path);
                  return (
                    <MilestoneRow
                      key={it.key}
                      last={last}
                      leading={url
                        ? <img src={url} alt="" className="size-10 shrink-0 rounded-[12px] object-cover" />
                        : <KyaIconTile><Sparkles className="size-5" /></KyaIconTile>}
                      title={c.title || t("birdMoments.milestone", "Milestone")}
                      detail={c.on_date ? t("birdMoments.ownLine", "{{date}} · your own", { date: fmtDate(c.on_date) }) : t("birdMoments.ownShort", "Your own")}
                      onClick={isOwner ? () => setSheet({ kind: "edit", custom: c }) : () => shareCustom(c)}
                      trailing={
                        <button type="button" onClick={() => shareCustom(c)} aria-label={t("birdMoments.share", "Share")} className="grid size-11 place-items-center rounded-full active:scale-95" style={{ color: K.moss }}>
                          <Share2 className="size-[18px]" />
                        </button>
                      }
                    />
                  );
                })}
              </KyaCard>
            )}
            {isOwner && (
              <KyaSecondaryButton className="w-full" icon={<Plus className="size-4" />} onClick={() => setSheet({ kind: "add" })}>
                {t("birdMoments.addMilestone", "Add a milestone")}
              </KyaSecondaryButton>
            )}
          </section>
        )}
      </KyaBody>

      {(sheet?.kind === "add" || sheet?.kind === "edit") && (
        <MilestoneSheet
          birdId={birdId}
          custom={sheet.kind === "edit" ? sheet.custom : null}
          photoUrl={sheet.kind === "edit" ? urlFor(sheet.custom.photo_path) : null}
          onClose={() => setSheet(null)}
          onSaved={() => { setSheet(null); refreshCustoms(); }}
        />
      )}

      {sheetAnchor && (
        <KyaSheet
          onClose={() => setSheet(null)}
          closeLabel={t("birdMoments.close", "Close")}
          title={
            <>
              <KyaHeading size={24}>{anchorLabel(sheetAnchor)}</KyaHeading>
              <p className="m-0 mt-1 text-[14px]" style={{ color: K.quiet }}>{t("birdMoments.yearly", "{{date}} · yearly", { date: monthDay(sheetAnchor.baseISO) })}</p>
            </>
          }
        >
          <AnchorYears
            anchor={sheetAnchor}
            isOwner={isOwner}
            busy={busy}
            urlForYear={(y) => urlFor(photoByYear.get(`${sheetAnchor.key}:${y}`))}
            onAdd={(y, f) => addAnchorPhoto(sheetAnchor.key, y, f)}
            onShare={(y, url) => share({ photoUrl: url, title: anchorTitle(sheetAnchor, y - Number(sheetAnchor.baseISO.slice(0, 4))), context: `${name} · ${y}` })}
          />
        </KyaSheet>
      )}
    </KyaPage>
  );
}

/** A milestone row: tile, bold title, muted line, optional trailing control.
 *  The row and the trailing control are siblings so neither nests a button. */
function MilestoneRow({ leading, title, detail, trailing, onClick, last }: { leading: ReactNode; title: ReactNode; detail: ReactNode; trailing?: ReactNode; onClick: () => void; last: boolean }) {
  return (
    <div className="flex items-center pr-2" style={{ borderBottom: last ? undefined : `1px solid ${K.line}` }}>
      <button type="button" onClick={onClick} className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 pr-2 text-left active:bg-black/[0.03]" style={{ color: K.forest }}>
        {leading}
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-[700]">{title}</span>
          <span className="mt-0.5 block text-[13px] leading-[1.35]" style={{ color: K.quiet }}>{detail}</span>
        </span>
      </button>
      {trailing}
    </div>
  );
}

/** The year-over-year photo slots for one yearly anchor. */
function AnchorYears({ anchor, isOwner, busy, urlForYear, onAdd, onShare }: {
  anchor: Anchor;
  isOwner: boolean;
  busy: boolean;
  urlForYear: (y: number) => string | null;
  onAdd: (year: number, file: File) => void;
  onShare: (year: number, url: string) => void;
}) {
  const { t } = useTranslation();
  const baseYear = Number(anchor.baseISO.slice(0, 4));
  const thisYear = todayMid().getFullYear();
  const years: number[] = [];
  for (let y = thisYear; y >= baseYear; y--) years.push(y);
  return (
    <>
      <p className="m-0 text-[14px] leading-[1.45]" style={{ color: K.quiet }}>
        {isOwner
          ? t("birdMoments.yearsHintOwner", "One photo for each year. Tap a photo to share it.")
          : t("birdMoments.yearsHintMember", "Tap a photo to share it.")}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {years.map((y) => {
          const url = urlForYear(y);
          const isCurrent = y === thisYear;
          return (
            <div key={y} className="text-center">
              {url ? (
                <button type="button" onClick={() => onShare(y, url)} aria-label={t("birdMoments.shareYear", "Share {{year}}", { year: y })} className="block aspect-square w-full overflow-hidden rounded-[14px] active:opacity-90">
                  <img src={url} alt="" className="size-full object-cover" />
                </button>
              ) : isOwner ? (
                <label className={`grid aspect-square w-full place-items-center rounded-[14px] border-2 border-dashed ${busy ? "opacity-50" : "cursor-pointer active:scale-[0.98]"}`} style={{ borderColor: isCurrent ? K.moss : "#c4d2c4", color: K.moss, background: isCurrent ? "#fff" : K.mist }}>
                  <span className="flex flex-col items-center gap-1 text-[13px] font-[700]"><Camera className="size-5" aria-hidden="true" />{t("birdMoments.add", "Add")}</span>
                  <input type="file" accept="image/*" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onAdd(y, f); }} />
                </label>
              ) : (
                // Members: non-interactive placeholder for a year with no photo yet.
                <span aria-hidden className="block aspect-square w-full rounded-[14px]" style={{ background: K.mist }} />
              )}
              <span className="mt-1 block text-[13px] font-[700]" style={{ color: K.quiet }}>{y}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Add or edit one of the owner's own milestones. */
function MilestoneSheet({ birdId, custom, photoUrl, onClose, onSaved }: { birdId: string; custom: Custom | null; photoUrl: string | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(custom?.title ?? "");
  const [date, setDate] = useState(custom?.on_date ?? localDateISO());
  const [photoData, setPhotoData] = useState<string | null>(null); // new pick
  const [keepPhoto, setKeepPhoto] = useState(true); // existing photo retained?
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { confirm, sheet: confirmSheet } = useConfirm();
  const valid = title.trim().length > 0 && !!date;
  const existingPhoto = custom?.photo_path ?? null;
  const shownPhoto = photoData ?? (keepPhoto && existingPhoto ? photoUrl ?? "existing" : null);
  const busy = saving || deleting;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const d = await compressImageToDataUrl(file);
      if (dataUrlBytes(d) > MAX_UPLOAD_BYTES) { toast.error(t("birdMoments.photoTooLargeShort", "That photo's a bit too large even after resizing.")); return; }
      setPhotoData(d);
      setKeepPhoto(false);
    } catch { toast.error(t("birdMoments.photoFailed", "Couldn't process that photo.")); }
    finally { setPhotoBusy(false); }
  }

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      let photo_path: string | null = keepPhoto ? existingPhoto : null;
      if (photoData) photo_path = await uploadJournalPhoto(birdId, photoData);
      if (custom) {
        const { error } = await supabase.from("moments").update({ title: title.trim(), on_date: date, photo_path }).eq("id", custom.id);
        if (error) throw error;
        toast.success(t("birdMoments.milestoneUpdated", "Milestone updated."));
      } else {
        const { error } = await supabase.from("moments").insert({
          bird_id: birdId, kind: "custom", title: title.trim(), on_date: date, recurs: false, auto_generated: false, photo_path,
        });
        if (error) throw error;
        toast.success(t("birdMoments.milestoneAdded", "Milestone added."));
      }
      onSaved();
    } catch (e: any) {
      toast.error(friendlyError(e, t("birdMoments.saveFailed", "Couldn't save.")));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!custom) return;
    const yes = await confirm({
      title: t("birdMoments.confirmDeleteTitle", "Delete this milestone?"),
      body: t("birdMoments.confirmDeleteBody", "It comes off the timeline, with its photo. This can't be undone."),
      confirmLabel: t("birdMoments.delete", "Delete"),
      cancelLabel: t("birdMoments.keep", "Keep"),
    });
    if (!yes) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("moments").delete().eq("id", custom.id);
      if (error) throw error;
      toast.success(t("birdMoments.milestoneDeleted", "Milestone deleted."));
      onSaved();
    } catch (e: any) {
      toast.error(friendlyError(e, t("birdMoments.deleteFailed", "Couldn't delete the milestone.")));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
    <KyaSheet
      onClose={busy ? () => {} : onClose}
      closeLabel={t("birdMoments.close", "Close")}
      title={<KyaHeading size={24}>{custom ? t("birdMoments.editMilestone", "Edit milestone") : t("birdMoments.addMilestone", "Add a milestone")}</KyaHeading>}
      footer={
        <KyaPrimaryButton onClick={save} disabled={!valid || busy || photoBusy}>
          {saving ? t("birdMoments.saving", "Saving…") : t("birdMoments.save", "Save")}
        </KyaPrimaryButton>
      }
    >
      <div className="flex flex-col gap-4">
        <KyaField
          id="milestone-title"
          label={t("birdMoments.titleLabel", "Title")}
          tag={<KyaRequiredTag tone="forest">{t("birdMoments.required", "Required")}</KyaRequiredTag>}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder={t("birdMoments.titlePlaceholder", "e.g. First free-flight trip")}
        />
        <KyaField
          id="milestone-date"
          type="date"
          label={t("birdMoments.dateLabel", "Date")}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <div>
          <p className="m-0 mb-1.5 text-[13.5px] font-[700]" style={{ color: K.forest }}>{t("birdMoments.photoOptional", "Photo (optional)")}</p>
          {shownPhoto ? (
            <div className="flex items-center gap-3">
              {shownPhoto === "existing"
                ? <span className="grid size-16 place-items-center rounded-[12px]" style={{ background: K.mist, color: K.quiet }}><Camera className="size-5" aria-hidden="true" /></span>
                : <img src={shownPhoto} alt="" className="size-16 rounded-[12px] object-cover" />}
              <button type="button" onClick={() => { setPhotoData(null); setKeepPhoto(false); }} className="min-h-[44px] px-2 text-[14px] font-[700] underline" style={{ color: K.red }}>{t("birdMoments.remove", "Remove")}</button>
            </div>
          ) : (
            <label className={`flex min-h-[48px] items-center justify-center gap-2 rounded-full border-[1.5px] border-dashed bg-white px-4 text-[15px] font-[700] ${photoBusy ? "opacity-50" : "cursor-pointer active:scale-[0.99]"}`} style={{ borderColor: "#c4d2c4", color: K.moss }}>
              {photoBusy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              {photoBusy ? t("birdMoments.processing", "Processing…") : t("birdMoments.addPhoto", "Add a photo")}
              <input type="file" accept="image/*" className="hidden" disabled={photoBusy} onChange={pick} />
            </label>
          )}
        </div>
        {custom && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border-2 bg-white text-[15px] font-[700] disabled:opacity-50"
            style={{ borderColor: K.red, color: K.red }}
          >
            <Trash2 className="size-4" /> {deleting ? t("birdMoments.deleting", "Deleting…") : t("birdMoments.deleteMilestone", "Delete milestone")}
          </button>
        )}
      </div>
    </KyaSheet>
    {confirmSheet}
    </>
  );
}
