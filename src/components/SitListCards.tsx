// The Sits tab's cards, in the Kya & Co. look: the active sit (forest card), one
// white card per upcoming sit, and past sits as rows in one white card. They're
// presentational — the page resolves caregiver names and passes them in. (The
// older SitCard stays in the bird plan editor.)
import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, Eye, Link2, Home, Pencil, Star, ChevronRight } from "lucide-react";
import { durationDays, daysUntil } from "@/lib/dates";
import { rangeTo, sitTitle } from "@/lib/sitText";
import { copySitterLink } from "@/lib/sitLink";
import { SitChecklist } from "@/components/SitChecklist";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { K, KyaCard, KyaLink, KyaRow, KyaSheet, KyaHeading } from "@/components/kya";
import { birdNames } from "@/lib/birdNames";
import { useTranslation } from "react-i18next";

export type SitBird = { id: string; name: string; photo_url?: string | null; photo_original?: string | null; photo_position?: string | null };
export type ListSit = {
  id: string;
  title?: string | null;
  start_date: string;
  end_date: string;
  sitter_name?: string | null;
  caregiver_user_id?: string | null;
  lead_user_id?: string | null;
  owner_id?: string | null;
  invite_token?: string | null;
  revoked?: boolean;
};

export type SitContextTag = { kind: "own" | "household"; ownerName?: string | null };

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

// Caregiver avatar — a forest rounded tile with a house for a household member,
// the sitter's initials on lime otherwise.
export function CaregiverAvatar({ name, household, size = 44 }: { name: string; household: boolean; size?: number }) {
  if (household) {
    return (
      <span className="grid shrink-0 place-items-center rounded-[14px]" style={{ width: size, height: size, background: K.forest, color: K.lime }} aria-hidden="true">
        <Home className="size-5" />
      </span>
    );
  }
  return (
    <span className="grid shrink-0 place-items-center rounded-full text-[15px] font-[700]" style={{ width: size, height: size, background: K.lime, color: K.forest }} aria-hidden="true">
      {initialsOf(name)}
    </span>
  );
}

function ContextTag({ tag, onDark }: { tag: SitContextTag; onDark?: boolean }) {
  const { t } = useTranslation();
  const owner = tag.ownerName?.trim();
  const label = tag.kind === "own"
    ? t("sitCards.yourBirds", "Your birds")
    : owner
      ? /s$/i.test(owner) ? t("sitCards.ownersHouseholdS", "{{name}}' household", { name: owner }) : t("sitCards.ownersHousehold", "{{name}}'s household", { name: owner })
      : t("sitCards.aHouseholdYouHelp", "A household you help with");
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-[700]" style={onDark ? { background: "rgba(255,255,255,0.12)", color: K.lime } : { background: K.mist, color: K.moss }}>
      {label}
    </span>
  );
}

/** Overlapping bird photos and their names ("Echo", "Echo and Kiwi", "4 birds"). */
function BirdStack({ birds, onDark }: { birds: SitBird[]; onDark?: boolean }) {
  const { t } = useTranslation();
  if (!birds.length) return null;
  const names = birds.map((b) => b.name);
  const label = birdNames(t, names);
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex pl-1.5" aria-hidden="true">
        {birds.slice(0, 4).map((b) => (
          <span key={b.id} className="relative -ml-1.5 grid size-7 place-items-center overflow-hidden rounded-full text-[11px] font-[700] text-white" style={{ background: K.moss, boxShadow: `0 0 0 2px ${onDark ? K.forest : "#fff"}` }}>
            {b.photo_url ? <BirdPhotoCrop url={b.photo_url} original={b.photo_original} position={b.photo_position ?? "50% 20%"} alt="" /> : b.name.slice(0, 1).toUpperCase()}
          </span>
        ))}
      </span>
      <span className="min-w-0 truncate text-[14px]" style={{ color: onDark ? "#fff" : K.forest }}>{label}</span>
    </div>
  );
}

/** "View care plan" for a covering caregiver. One bird opens its care plan
 *  directly; a multi-bird sit asks which bird first. */
function CarePlanButton({ birds, className, style, children }: { birds: SitBird[]; className: string; style: CSSProperties; children: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [picking, setPicking] = useState(false);
  if (!birds.length) return null;
  if (birds.length === 1) {
    return <Link to="/birds/$birdId/care-plan" params={{ birdId: birds[0].id }} className={className} style={style}>{children}</Link>;
  }
  return (
    <>
      <button type="button" onClick={() => setPicking(true)} className={className} style={style}>{children}</button>
      <KyaSheet
        open={picking}
        onClose={() => setPicking(false)}
        closeLabel={t("sitCards.close", "Close")}
        title={<KyaHeading size={22}>{t("sitCards.whichCarePlan", "Whose care plan?")}</KyaHeading>}
      >
        <KyaCard>
          {birds.map((b, i) => (
            <KyaRow
              key={b.id}
              last={i === birds.length - 1}
              leading={
                <span className="relative grid size-10 place-items-center overflow-hidden rounded-full text-[15px] font-[700] text-white" style={{ background: K.moss }} aria-hidden="true">
                  {b.photo_url ? <BirdPhotoCrop url={b.photo_url} original={b.photo_original} position={b.photo_position ?? "50% 20%"} alt="" /> : b.name.slice(0, 1).toUpperCase()}
                </span>
              }
              title={b.name}
              onClick={() => { setPicking(false); navigate({ to: "/birds/$birdId/care-plan", params: { birdId: b.id } }); }}
            />
          ))}
        </KyaCard>
      </KyaSheet>
    </>
  );
}

const SECONDARY = "inline-flex min-h-[48px] flex-1 items-center justify-center gap-1.5 rounded-full border-2 bg-white px-3 text-center text-[15px] font-[700] active:scale-[0.99]";

// ---------------------------------------------------------------------------
// ACTIVE — the forest card, the focal element.
// ---------------------------------------------------------------------------
export function ActiveSitCard({ sit, birds, caregiverName, iAmLead, iOwnSit, contextTag, canEdit }: { sit: ListSit; birds: SitBird[]; caregiverName: string; iAmLead?: boolean; iOwnSit?: boolean; contextTag?: SitContextTag; canEdit?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const household = !!sit.caregiver_user_id;
  const dayOf = -daysUntil(sit.start_date) + 1;
  const total = durationDays(sit.start_date, sit.end_date);
  // The per-trip link, so the owner can re-send it mid-sit. Household sits have none.
  const showCopyLink = !household && !sit.revoked && !!sit.invite_token;
  const who = household ? t("sitCards.household", "Household") : t("sitCards.sitterDayOf", "Sitter · day {{day}} of {{total}}", { day: dayOf, total });
  // The signed-in member is the one covering: speak to them, not about them.
  const youCover = household && !!iAmLead;
  const title = youCover ? sit.title?.trim() || t("sitCards.youreCovering", "You're covering this sit") : sitTitle(t, sit, caregiverName);

  return (
    <section className="rounded-[20px] p-4 text-white" style={{ background: K.forest }}>
      <div className="flex items-center gap-3">
        <CaregiverAvatar name={caregiverName} household={household} />
        <div className="min-w-0 flex-1">
          {contextTag && <div className="mb-1"><ContextTag tag={contextTag} onDark /></div>}
          <p className="m-0 truncate text-[16px] font-[700]">{title}</p>
          <p className="m-0 mt-0.5 text-[13.5px]" style={{ color: K.paleGreen }}>{youCover ? t("sitCards.you", "You") : caregiverName} · {who} · {rangeTo(t, sit.start_date, sit.end_date)}</p>
          {iAmLead && !(youCover && !sit.title?.trim()) && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-[700]" style={{ background: K.lime, color: K.forest }}>
              <Star className="size-3" /> {t("sitCards.youreInCharge", "You're in charge")}
            </span>
          )}
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: K.lime, color: K.forest }}>
          <span className="size-1.5 rounded-full" style={{ background: K.forest }} /> {t("sitCards.active", "Active")}
        </span>
      </div>

      {birds.length > 0 && <div className="mt-3"><BirdStack birds={birds} onDark /></div>}

      <div className="mt-3.5 flex flex-col gap-2">
        <Link to="/scans/history" search={{ sitId: sit.id }} className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-full border-2 bg-white text-[15px] font-[700] active:scale-[0.99]" style={{ borderColor: K.forest, color: K.forest }}>
          <Activity className="size-4" /> {t("sitCards.viewHealthChecks", "View health checks")}
        </Link>
        {iOwnSit ? (
          // Household caregivers use the app itself — there's no sitter view to preview.
          !household && (
            <Link
              to="/sit-preview/$sitId"
              params={{ sitId: sit.id }}
              state={{ previewToken: sit.invite_token ?? null, previewLabel: caregiverName, previewHousehold: household } as any}
              className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-full border-2 text-[15px] font-[700] text-white active:scale-[0.99]"
              style={{ borderColor: "rgba(255,255,255,0.45)" }}
            >
              <Eye className="size-4" /> {t("sitCards.seeWhatSees", "See what {{name}} sees", { name: firstWord(caregiverName) })}
            </Link>
          )
        ) : (
          // Covering caregiver: their actual care view, not the owner's preview.
          <CarePlanButton birds={birds} className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-full border-2 text-[15px] font-[700] text-white" style={{ borderColor: "rgba(255,255,255,0.45)" }}>
            <Eye className="size-4" /> {t("sitCards.viewCarePlan", "View care plan")}
          </CarePlanButton>
        )}
      </div>

      {(showCopyLink || canEdit) && (
        <div className="mt-1.5 flex items-center justify-center gap-4">
          {showCopyLink && (
            <KyaLink color={K.lime} onClick={() => copySitterLink(sit, birds)}><Link2 className="size-4" /> {t("sitCards.copyLink", "Copy link")}</KyaLink>
          )}
          {canEdit && (
            <KyaLink color={K.lime} onClick={() => navigate({ to: "/sits/edit/$sitId", params: { sitId: sit.id } })}><Pencil className="size-4" /> {t("sitCards.editSit", "Edit sit")}</KyaLink>
          )}
        </div>
      )}
    </section>
  );
}

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

// ---------------------------------------------------------------------------
// UPCOMING — one white card per sit.
// ---------------------------------------------------------------------------
export function UpcomingSitCard({
  sit, birds, caregiverName, iAmLead, iOwnSit, contextTag, canEdit,
}: { sit: ListSit; birds: SitBird[]; caregiverName: string; iAmLead?: boolean; iOwnSit?: boolean; contextTag?: SitContextTag; canEdit?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const household = !!sit.caregiver_user_id;
  const first = firstWord(caregiverName);
  // The signed-in member is the one covering: speak to them, not about them.
  const youCover = household && !!iAmLead;
  const title = youCover ? sit.title?.trim() || t("sitCards.youreCovering", "You're covering this sit") : sitTitle(t, sit, caregiverName);

  return (
    <KyaCard className="p-4">
      <div className="flex items-center gap-3">
        <CaregiverAvatar name={caregiverName} household={household} />
        <div className="min-w-0 flex-1">
          {contextTag && <div className="mb-1"><ContextTag tag={contextTag} /></div>}
          <p className="m-0 truncate text-[16px] font-[700]">{title}</p>
          <p className="m-0 mt-0.5 text-[13.5px]" style={{ color: K.quiet }}>
            {youCover ? t("sitCards.you", "You") : caregiverName} · {household ? t("sitCards.household", "Household") : t("sitCards.sitter", "Sitter")} · {rangeTo(t, sit.start_date, sit.end_date)}
          </p>
          {iAmLead && !(youCover && !sit.title?.trim()) && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-[700]" style={{ background: K.lime, color: K.forest }}>
              <Star className="size-3" /> {t("sitCards.youreInCharge", "You're in charge")}
            </span>
          )}
        </div>
      </div>

      {birds.length > 0 && <div className="mt-3"><BirdStack birds={birds} /></div>}

      {iOwnSit ? (
        <>
          {/* Owner departure prep. Owner-only: it's the person LEAVING. */}
          <SitChecklist sit={sit as any} birds={birds} />
          <div className="mt-3.5 flex flex-col gap-2">
            {!household && !sit.revoked && (
              <button
                type="button"
                onClick={() => copySitterLink(sit, birds)}
                className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 px-5 text-[16px] font-[700] active:scale-[0.99]"
                style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
              >
                <Link2 className="size-5" /> {t("sitCards.copyNamesLink", "Copy {{name}}'s link", { name: first })}
              </button>
            )}
            <div className="flex gap-2">
              {/* Household caregivers use the app itself — there's no sitter view to preview. */}
              {!household && (
                <Link
                  to="/sit-preview/$sitId"
                  params={{ sitId: sit.id }}
                  state={{ previewToken: sit.invite_token ?? null, previewLabel: caregiverName, previewHousehold: household } as any}
                  className={SECONDARY}
                  style={{ borderColor: K.forest, color: K.forest }}
                >
                  {t("sitCards.seeWhatSees", "See what {{name}} sees", { name: first })}
                </Link>
              )}
              {canEdit && (
                <button type="button" onClick={() => navigate({ to: "/sits/edit/$sitId", params: { sitId: sit.id } })} className={SECONDARY} style={{ borderColor: K.forest, color: K.forest }}>
                  {t("sitCards.editSit", "Edit sit")}
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        // Covering caregiver / member: their care view.
        birds.length > 0 && (
          <div className="mt-3.5">
            <CarePlanButton birds={birds} className={`${SECONDARY} w-full`} style={{ borderColor: K.forest, color: K.forest }}>
              <Eye className="size-4" /> {t("sitCards.viewCarePlan", "View care plan")}
            </CarePlanButton>
          </div>
        )
      )}
    </KyaCard>
  );
}

// ---------------------------------------------------------------------------
// PAST — rows in one white card; each opens the sit's own page.
// ---------------------------------------------------------------------------
const PAST_SHOWN = 4;

export function PastSitsList({ sits, caregiverName }: { sits: ListSit[]; caregiverName: (s: ListSit) => string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [all, setAll] = useState(false);
  const shown = all ? sits : sits.slice(0, PAST_SHOWN);
  const more = sits.length - shown.length;
  return (
    <KyaCard>
      {shown.map((s, i) => {
        const household = !!s.caregiver_user_id;
        const name = caregiverName(s);
        const days = durationDays(s.start_date, s.end_date);
        const when = `${rangeTo(t, s.start_date, s.end_date)} · ${t("sitCards.dayCount", "{{count}} days", { count: days })}`;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => navigate({ to: "/sits/$sitId", params: { sitId: s.id } })}
            className="flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-black/[0.03]"
            style={{ borderBottom: i === shown.length - 1 && more === 0 ? undefined : `1px solid ${K.line}`, color: K.forest }}
          >
            <CaregiverAvatar name={name} household={household} size={40} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[15px] font-[700]">{name}</span>
                {household && <span className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-[700]" style={{ background: K.mist, color: K.moss }}>{t("sitCards.household", "Household")}</span>}
              </span>
              <span className="block truncate text-[13px]" style={{ color: K.quiet }}>
                {s.title?.trim() ? `${s.title.trim()} · ${when}` : when}
              </span>
            </span>
            <ChevronRight className="size-[18px] shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
          </button>
        );
      })}
      {more > 0 && (
        <div className="px-4">
          <KyaLink onClick={() => setAll(true)}>{t("sitCards.showMore", "Show {{count}} more", { count: more })}</KyaLink>
        </div>
      )}
    </KyaCard>
  );
}
